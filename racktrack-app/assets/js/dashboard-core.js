(function () {
  const STORAGE_KEYS = {
    categories: "racktrack_categories",
    products: "racktrack_products",
    inventory: "racktrack_inventory",
    orders: "racktrack_orders",
    customers: "racktrack_customers",
    stockHistory: "racktrack_stock_history",
    sales: "racktrack_sales",
    salesHistory: "racktrack_sales_history"
  };

  const BACKUP_STORAGE_KEYS = {
    categories: "racktrack_categories_backup",
    orders: "racktrack_orders_backup",
    customers: "racktrack_customers_backup"
  };

  const METRICS_SNAPSHOT_KEY = "racktrack_metrics_snapshot";

  const STORAGE_LIMITS = {
    categories: 200,
    products: 1000,
    inventory: 1000,
    orders: 1000,
    customers: 1000,
    stockHistory: 250,
    sales: 400,
    salesHistory: 400
  };

  const defaultData = {
    categories: [],
    products: [],
    inventory: [],
    orders: [],
    customers: [],
    stockHistory: [],
    sales: [],
    salesHistory: []
  };

  function safeParseArray(rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function isQuotaExceeded(error) {
    if (!error) return false;

    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      String(error.message || "").toLowerCase().includes("quota")
    );
  }

  function shouldUseBackup(entity) {
    return ["categories", "orders", "customers"].includes(entity);
  }

  function trimArrayByEntity(entity, value) {
    const safeValue = Array.isArray(value) ? [...value] : [];
    const max = Number(STORAGE_LIMITS[entity]) || safeValue.length;

    if (safeValue.length <= max) return safeValue;
    return safeValue.slice(0, max);
  }

  function stripHeavyFields(entity, records) {
    if (!Array.isArray(records)) return [];

    if (entity === "sales" || entity === "salesHistory") {
      return records.map(record => {
        const clone = { ...record };
        delete clone.imageData;
        delete clone.image;
        return clone;
      });
    }

    if (entity === "stockHistory") {
      return records.map(record => {
        const clone = { ...record };
        delete clone.imageData;
        delete clone.image;
        return clone;
      });
    }

    return records.map(record => ({ ...record }));
  }

  function trySetStorage(key, value) {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);

    const verify = localStorage.getItem(key);
    if (verify !== serialized) {
      throw new Error(`Storage verification failed for ${key}`);
    }
  }

  function loadData(entity) {
    const mainKey = STORAGE_KEYS[entity];
    const backupKey = BACKUP_STORAGE_KEYS[entity];
    const stored = localStorage.getItem(mainKey);

    if (!stored) {
      const initial = Array.isArray(defaultData[entity]) ? [...defaultData[entity]] : [];

      try {
        trySetStorage(mainKey, initial);
        if (shouldUseBackup(entity) && backupKey) {
          trySetStorage(backupKey, initial);
        }
      } catch (error) {
        console.error(`Failed to initialize storage for ${entity}.`, error);
      }

      return initial;
    }

    const parsedMain = safeParseArray(stored);
    if (parsedMain) {
      return trimArrayByEntity(entity, parsedMain);
    }

    console.error(`Failed to parse localStorage for ${entity}. Attempting backup recovery.`);

    if (shouldUseBackup(entity) && backupKey) {
      const backupStored = localStorage.getItem(backupKey);
      const parsedBackup = safeParseArray(backupStored);

      if (parsedBackup) {
        const trimmedBackup = trimArrayByEntity(entity, parsedBackup);

        try {
          trySetStorage(mainKey, trimmedBackup);
        } catch (error) {
          console.error(`Failed restoring ${entity} from backup.`, error);
        }

        return trimmedBackup;
      }
    }

    console.error(`No usable backup found for ${entity}. Returning empty array only.`);
    return [...defaultData[entity]];
  }

  function loadMetricsSnapshot() {
    const fallback = {
      inventoryTotal: 0,
      ordersTotal: 0,
      customersTotal: 0,
      lowStockTotal: 0,
      inventoryValue: 0,
      revenueValue: 0,
      profitValue: 0,
      doneOrders: 0,
      pendingOrders: 0,
      processingOrders: 0
    };

    const stored = localStorage.getItem(METRICS_SNAPSHOT_KEY);
    if (!stored) return fallback;

    try {
      const parsed = JSON.parse(stored);
      return { ...fallback, ...(parsed || {}) };
    } catch (error) {
      console.error("Failed to parse metrics snapshot.", error);
      return fallback;
    }
  }

  function saveMetricsSnapshot(metrics) {
    try {
      localStorage.setItem(METRICS_SNAPSHOT_KEY, JSON.stringify(metrics));
    } catch (error) {
      console.error("Failed to save metrics snapshot.", error);
    }
  }

  const previousMetrics = loadMetricsSnapshot();

  const state = {
    currentEntity: null,
    editId: null,
    currentInventoryTab: "items",
    categories: loadData("categories"),
    products: loadData("products"),
    inventory: loadData("inventory"),
    orders: loadData("orders"),
    customers: loadData("customers"),
    stockHistory: loadData("stockHistory"),
    sales: loadData("sales"),
    salesHistory: loadData("salesHistory")
  };

  const entityRegistry = {};
  const panelRegistry = [];

  function dedupeRecords(records) {
    const map = new Map();

    (Array.isArray(records) ? records : []).forEach(record => {
      if (!record || typeof record !== "object") return;

      const key = String(
        record.id ||
        record.completedTransactionId ||
        record.transactionId ||
        record.receiptNo ||
        `${record.productId || record.sku || record.productName || "unknown"}__${record.createdAt || record.soldAt || Date.now()}`
      );

      if (!map.has(key)) {
        map.set(key, record);
      }
    });

    return Array.from(map.values());
  }

  function saveData(entity) {
    const mainKey = STORAGE_KEYS[entity];
    const backupKey = BACKUP_STORAGE_KEYS[entity];

    if (!mainKey) return true;

    const liveValue = Array.isArray(state[entity]) ? [...state[entity]] : [];
    const cleanedValue = stripHeavyFields(entity, trimArrayByEntity(entity, liveValue));

    try {
      trySetStorage(mainKey, cleanedValue);

      if (shouldUseBackup(entity) && backupKey) {
        try {
          trySetStorage(backupKey, cleanedValue);
        } catch (backupError) {
          console.warn(`Backup save skipped for ${entity}.`, backupError);
        }
      }

      return true;
    } catch (error) {
      if (!isQuotaExceeded(error)) {
        console.error(`Failed to save ${entity}.`, error);
        return false;
      }
    }

    console.warn(`${entity} exceeded localStorage quota. Trimming older records for storage copy only...`);

    let reducedValue = [...cleanedValue];
    const minKeep =
      entity === "stockHistory" ? 50 :
      entity === "salesHistory" ? 100 :
      entity === "sales" ? 100 :
      20;

    while (reducedValue.length > minKeep) {
      reducedValue = reducedValue.slice(0, Math.max(minKeep, Math.floor(reducedValue.length * 0.75)));

      try {
        trySetStorage(mainKey, reducedValue);

        if (shouldUseBackup(entity) && backupKey) {
          try {
            trySetStorage(backupKey, reducedValue);
          } catch (backupError) {
            console.warn(`Backup save skipped for ${entity} because quota is still tight.`, backupError);
          }
        }

        console.warn(`${entity} was partially trimmed for browser storage only.`);
        return true;
      } catch (retryError) {
        if (!isQuotaExceeded(retryError)) {
          console.error(`Failed to save trimmed ${entity}.`, retryError);
          return false;
        }
      }
    }

    console.error(`Unable to save ${entity} even after trimming.`);
    return false;
  }

  function syncSalesState() {
    state.sales = Array.isArray(state.sales) ? state.sales : [];
    state.salesHistory = Array.isArray(state.salesHistory) ? state.salesHistory : [];

    const merged = dedupeRecords([
      ...state.salesHistory,
      ...state.sales
    ]).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });

    state.sales = [...merged];
    state.salesHistory = [...merged];

    saveData("sales");
    saveData("salesHistory");
  }

  syncSalesState();

  function registerEntity(name, config) {
    entityRegistry[name] = config;
  }

  function registerPanel(config) {
    panelRegistry.push(config);
  }

  function calculateExpenses(cost, quantity) {
    return (Number(cost) || 0) * (Number(quantity) || 0);
  }

  function calculateRevenue(srp, quantity) {
    return (Number(srp) || 0) * (Number(quantity) || 0);
  }

  function calculateProfit(cost, srp, quantity) {
    return ((Number(srp) || 0) - (Number(cost) || 0)) * (Number(quantity) || 0);
  }

  function peso(value) {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function stockStatus(quantity) {
    return (Number(quantity) || 0) <= 5 ? "Low Stock" : "In Stock";
  }

  function statusClass(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "done") return "done";
    if (normalized === "processing") return "processing";
    return "pending";
  }

  function formatDisplayDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric"
    });
  }

  function formatDateTime(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function formatHistoryDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  }

  function formatHistoryTime(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function changePercent(oldValue, newValue) {
    const oldNum = Number(oldValue) || 0;
    const newNum = Number(newValue) || 0;

    if (oldNum === 0 && newNum === 0) return 0;
    if (oldNum === 0 && newNum > 0) return 100;

    return ((newNum - oldNum) / oldNum) * 100;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setActiveSection(sectionId) {
    document.querySelectorAll(".page-section").forEach(section => {
      section.classList.remove("active");
    });

    document.querySelectorAll(".nav-link").forEach(btn => {
      btn.classList.remove("active");
      btn.setAttribute("aria-current", "false");
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) targetSection.classList.add("active");

    const targetButton = document.querySelector(`.nav-link[data-section="${sectionId}"]`);
    if (targetButton) {
      targetButton.classList.add("active");
      targetButton.setAttribute("aria-current", "page");
    }
  }

  function renderImageCell(imageData, altText = "Product") {
    if (imageData) {
      return `<img src="${imageData}" alt="${escapeHtml(altText)}" class="product-thumb" />`;
    }

    return `<div class="no-image-box">No Image</div>`;
  }

  function normalizeCategoryName(name) {
    return String(name || "").trim();
  }

  function getCategoryByName(name) {
    const normalized = normalizeCategoryName(name).toLowerCase();
    return state.categories.find(category =>
      normalizeCategoryName(category.name).toLowerCase() === normalized
    ) || null;
  }

  function getContrastTextColor(hexColor) {
    const hex = String(hexColor || "").replace("#", "");
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return "#222222";

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return brightness >= 150 ? "#1f1f1f" : "#ffffff";
  }

  function renderCategoryBadge(categoryName) {
    const safeName = normalizeCategoryName(categoryName);

    if (!safeName) {
      return `<span class="category-badge neutral">Uncategorized</span>`;
    }

    const category = getCategoryByName(safeName);

    if (!category || !category.color) {
      return `<span class="category-badge neutral">${escapeHtml(safeName)}</span>`;
    }

    const textColor = getContrastTextColor(category.color);

    return `
      <span
        class="category-badge"
        style="background:${category.color}; color:${textColor}; border-color:${category.color};"
      >
        ${escapeHtml(safeName)}
      </span>
    `;
  }

  function categoryOptions(selected = "") {
    if (!state.categories.length) {
      return `<option value="">No categories yet</option>`;
    }

    return [
      `<option value="">Select category</option>`,
      ...state.categories.map(category => `
        <option value="${escapeHtml(category.name)}" ${category.name === selected ? "selected" : ""}>
          ${escapeHtml(category.name)}
        </option>
      `)
    ].join("");
  }

  function productOptions(selectedSku = "") {
    if (!state.products.length) {
      return `<option value="">No products available</option>`;
    }

    return [
      `<option value="">Select product</option>`,
      ...state.products.map(product => `
        <option value="${escapeHtml(product.sku)}" ${String(product.sku) === String(selectedSku) ? "selected" : ""}>
          ${escapeHtml(product.productName)} (${escapeHtml(product.sku)})
        </option>
      `)
    ].join("");
  }

  function inventoryOrderOptions(selectedId = "") {
    const availableItems = state.inventory.filter(item =>
      (Number(item.quantity) || 0) > 0 || String(item.id) === String(selectedId)
    );

    if (!availableItems.length) {
      return `<option value="">No inventory items available</option>`;
    }

    return [
      `<option value="">Select inventory item</option>`,
      ...availableItems.map(item => `
        <option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>
          ${escapeHtml(item.productName)} (${escapeHtml(item.sku)}) - Stock: ${Number(item.quantity) || 0}
        </option>
      `)
    ].join("");
  }

  function findProductBySku(sku) {
    const normalized = String(sku || "").trim().toLowerCase();
    return state.products.find(product =>
      String(product.sku || "").trim().toLowerCase() === normalized
    ) || null;
  }

  function findInventoryById(id) {
    return state.inventory.find(item => String(item.id) === String(id)) || null;
  }

  function getMovementType(oldQty, newQty) {
    const oldNumber = Number(oldQty) || 0;
    const newNumber = Number(newQty) || 0;

    if (newNumber > oldNumber) return "Stock In";
    if (newNumber < oldNumber) return "Pull Out";
    return "No Change";
  }

  function movementClass(movementType) {
    const normalized = String(movementType || "").toLowerCase();
    if (normalized === "stock in") return "stock-in";
    if (normalized === "pull out") return "pull-out";
    if (normalized === "sold") return "sold";
    return "no-change";
  }

  function differenceClass(value) {
    const num = Number(value) || 0;
    if (num > 0) return "increase";
    if (num < 0) return "decrease";
    return "neutral";
  }

  function formatDifference(value) {
    const num = Number(value) || 0;
    if (num > 0) return `+${num}`;
    return `${num}`;
  }

  function addStockHistoryEntry({
    itemId = "",
    productName = "",
    sku = "",
    category = "",
    oldQuantity = 0,
    newQuantity = 0,
    movementType = "No Change",
    note = "",
    saleAmount = 0,
    profitAmount = 0,
    ...extra
  }) {
    state.stockHistory.unshift({
      id: crypto.randomUUID(),
      itemId,
      productName,
      sku,
      category,
      oldQuantity: Number(oldQuantity) || 0,
      newQuantity: Number(newQuantity) || 0,
      difference: (Number(newQuantity) || 0) - (Number(oldQuantity) || 0),
      movementType,
      note: String(note || "").trim(),
      saleAmount: Number(saleAmount) || 0,
      profitAmount: Number(profitAmount) || 0,
      createdAt: extra.createdAt || new Date().toISOString(),
      ...extra
    });

    state.stockHistory = dedupeRecords(state.stockHistory).sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return saveData("stockHistory");
  }

  function addSaleRecord({
    inventoryId = "",
    productName = "",
    sku = "",
    category = "",
    quantitySold = 0,
    cost = 0,
    srp = 0,
    saleAmount = 0,
    profitAmount = 0,
    soldAt = "",
    note = "",
    ...extra
  }) {
    const record = {
      id: extra.id || crypto.randomUUID(),
      inventoryId,
      productName,
      sku,
      category,
      quantitySold: Number(quantitySold) || 0,
      quantity: Number(extra.quantity ?? quantitySold) || 0,
      sold: Number(extra.sold ?? quantitySold) || 0,
      cost: Number(cost) || 0,
      srp: Number(srp) || 0,
      saleAmount: Number(saleAmount) || 0,
      totalSaleAmount: Number(extra.totalSaleAmount ?? saleAmount) || 0,
      totalRevenue: Number(extra.totalRevenue ?? saleAmount) || 0,
      profitAmount: Number(profitAmount) || 0,
      totalProfit: Number(extra.totalProfit ?? profitAmount) || 0,
      soldAt: soldAt || new Date().toISOString(),
      createdAt: extra.createdAt || soldAt || new Date().toISOString(),
      note: String(note || "").trim(),
      ...extra
    };

    delete record.imageData;
    delete record.image;

    state.sales.unshift(record);
    state.salesHistory.unshift(record);

    state.sales = dedupeRecords(state.sales).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });

    state.salesHistory = dedupeRecords(state.salesHistory).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });

    const savedSales = saveData("sales");
    const savedSalesHistory = saveData("salesHistory");

    return savedSales && savedSalesHistory;
  }

  function syncInventoryFromProduct(productPayload, oldSku = "") {
    const oldNormalized = String(oldSku || productPayload.sku || "").trim().toLowerCase();
    const newNormalized = String(productPayload.sku || "").trim().toLowerCase();

    state.inventory = state.inventory.map(item => {
      const itemSku = String(item.sku || "").trim().toLowerCase();

      if (itemSku === oldNormalized || itemSku === newNormalized) {
        return {
          ...item,
          productName: productPayload.productName,
          sku: productPayload.sku,
          variant: productPayload.variant,
          description: productPayload.description,
          category: productPayload.category,
          cost: productPayload.cost,
          srp: productPayload.srp,
          imageData: productPayload.imageData
        };
      }

      return item;
    });

    saveData("inventory");
  }

  function getMetrics() {
    syncSalesState();

    const inventoryTotal = state.inventory.length;
    const ordersTotal = state.orders.length;
    const customersTotal = state.customers.length;
    const lowStockTotal = state.inventory.filter(item => (Number(item.quantity) || 0) <= 5).length;

    const doneOrders = state.orders.filter(order => String(order.status || "").toLowerCase() === "done").length;
    const pendingOrders = state.orders.filter(order => String(order.status || "").toLowerCase() === "pending").length;
    const processingOrders = state.orders.filter(order => String(order.status || "").toLowerCase() === "processing").length;

    const inventoryValue = state.inventory.reduce((sum, item) => {
      return sum + calculateExpenses(item.cost, item.quantity);
    }, 0);

    const revenueValue = state.salesHistory.reduce((sum, sale) => {
      return sum + (Number(sale.saleAmount ?? sale.totalRevenue) || 0);
    }, 0);

    const profitValue = state.salesHistory.reduce((sum, sale) => {
      return sum + (Number(sale.profitAmount ?? sale.totalProfit) || 0);
    }, 0);

    return {
      inventoryTotal,
      ordersTotal,
      customersTotal,
      lowStockTotal,
      doneOrders,
      pendingOrders,
      processingOrders,
      inventoryValue,
      revenueValue,
      profitValue
    };
  }

  function getDailyReportGroups() {
    syncSalesState();

    const groups = {};

    state.inventory.forEach(item => {
      if (!item.createdAt) return;
      const key = item.createdAt.slice(0, 10);

      if (!groups[key]) groups[key] = [];

      groups[key].push({
        id: `inventory-${item.id}`,
        sourceType: "inventory-added",
        occurredAt: item.createdAt,
        productName: item.productName || "",
        sku: item.sku || "",
        category: item.category || "",
        quantity: Number(item.quantity) || 0,
        saleAmount: 0,
        profitAmount: 0,
        note: "Item added to inventory"
      });
    });

    state.salesHistory.forEach(sale => {
      const dateValue = sale.soldAt || sale.createdAt;
      if (!dateValue) return;

      const key = dateValue.slice(0, 10);
      if (!groups[key]) groups[key] = [];

      groups[key].push({
        id: `sale-${sale.id}`,
        sourceType: "sold",
        occurredAt: dateValue,
        productName: sale.productName || "",
        sku: sale.sku || "",
        category: sale.category || "",
        quantity: Number(sale.quantitySold ?? sale.quantity ?? sale.sold) || 0,
        saleAmount: Number(sale.saleAmount ?? sale.totalRevenue) || 0,
        profitAmount: Number(sale.profitAmount ?? sale.totalProfit) || 0,
        note: sale.note || "Sold item"
      });
    });

    state.orders.forEach(order => {
      const occurredAt = order.createdAt || order.date;
      if (!occurredAt) return;

      const normalizedDate = occurredAt.length > 10
        ? occurredAt.slice(0, 10)
        : occurredAt;

      if (!groups[normalizedDate]) groups[normalizedDate] = [];

      groups[normalizedDate].push({
        id: `order-${order.id}`,
        sourceType: "order",
        occurredAt,
        productName: order.item || "",
        sku: order.sku || "",
        category: "",
        quantity: Number(order.quantity) || 0,
        saleAmount: Number(order.totalRevenue) || 0,
        profitAmount: Number(order.totalProfit) || 0,
        note: `Order ${order.orderId || ""}`.trim()
      });
    });

    return Object.entries(groups)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .map(([date, entries]) => ({
        date,
        entries: entries.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      }));
  }

  function removeDailyRecord(recordId) {
    if (recordId.startsWith("inventory-")) {
      const id = recordId.replace("inventory-", "");
      state.inventory = state.inventory.filter(item => String(item.id) !== String(id));
      saveData("inventory");
      return;
    }

    if (recordId.startsWith("sale-")) {
      const id = recordId.replace("sale-", "");
      state.sales = state.sales.filter(item => String(item.id) !== String(id));
      state.salesHistory = state.salesHistory.filter(item => String(item.id) !== String(id));
      saveData("sales");
      saveData("salesHistory");
      return;
    }

    if (recordId.startsWith("order-")) {
      const id = recordId.replace("order-", "");
      state.orders = state.orders.filter(item => String(item.id) !== String(id));
      saveData("orders");
    }
  }

  function requestSensitiveDeleteApproval(contextLabel = "record") {
    if (localStorage.getItem("racktrackUserRole") !== "admin") {
      alert("Only authorized admin can delete this.");
      return false;
    }

    const approved = confirm(`You are about to delete this ${contextLabel}. This action is sensitive. Continue?`);
    if (!approved) return false;

    const phrase = prompt(`Type DELETE to confirm removing this ${contextLabel}.`);
    if (phrase !== "DELETE") {
      alert("Delete cancelled. Confirmation phrase did not match.");
      return false;
    }

    return true;
  }

  function setModalWide(isWide) {
    const modalCard = document.querySelector("#formModal .modal-card");
    if (!modalCard) return;
    modalCard.classList.toggle("large-form", isWide);
  }

  function buildForm(entity, values = {}) {
    const form = document.getElementById("recordForm");
    const title = document.getElementById("modalTitle");
    if (!form || !title) return;

    const config = entityRegistry[entity];
    if (!config) return;

    state.currentEntity = entity;
    title.textContent = `${state.editId ? "Edit" : "Add"} ${config.label}`;
    setModalWide(Boolean(config.isWide));

    form.innerHTML = `
      ${config.formHTML(values)}
      <div class="form-actions">
        <button type="button" class="secondary-btn" id="cancelForm">Cancel</button>
        <button type="submit" class="primary-btn">${config.submitLabel || "Save"}</button>
      </div>
    `;

    const cancelBtn = document.getElementById("cancelForm");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    if (typeof config.afterBuild === "function") {
      config.afterBuild(values);
    }
  }

  function openModal(entity) {
    state.editId = null;
    buildForm(entity);
    const modal = document.getElementById("formModal");
    if (modal) modal.classList.add("show");
  }

  function openEdit(entity, id) {
    state.currentEntity = entity;
    state.editId = id;

    const record = state[entity].find(item => String(item.id) === String(id));
    if (!record) return;

    buildForm(entity, record);
    const modal = document.getElementById("formModal");
    if (modal) modal.classList.add("show");
  }

  function closeModal() {
    const modal = document.getElementById("formModal");
    if (modal) modal.classList.remove("show");
  }

  function openLogoutModal() {
    const modal = document.getElementById("logoutModal");
    if (modal) modal.classList.add("show");
  }

  function closeLogoutModal() {
    const modal = document.getElementById("logoutModal");
    if (modal) modal.classList.remove("show");
  }

  function getLoggedInUsername() {
    const candidates = [
      localStorage.getItem("racktrackLoggedInUsername"),
      localStorage.getItem("racktrackUsername"),
      localStorage.getItem("username"),
      sessionStorage.getItem("racktrackLoggedInUsername"),
      sessionStorage.getItem("racktrackUsername"),
      sessionStorage.getItem("username")
    ];

    const found = candidates.find(value => String(value || "").trim());
    return found ? String(found).trim() : "Admin";
  }

  function renderTopbarUser() {
    const usernameEl = document.getElementById("topbarUsername");
    if (!usernameEl) return;

    usernameEl.textContent = getLoggedInUsername();
  }

  function confirmLogout() {
    localStorage.removeItem("racktrackUserRole");
    localStorage.removeItem("racktrackLoggedInUsername");
    sessionStorage.removeItem("racktrackLoggedInUsername");
    sessionStorage.removeItem("cameFromSplash");
    window.location.href = "./admin-login.html";
  }

  function deleteRecord(entity, id) {
    const config = entityRegistry[entity];
    if (!config) return;

    const record = state[entity].find(item => String(item.id) === String(id));
    if (!record) return;

    const approved = confirm("Are you sure you want to delete this record?");
    if (!approved) return;

    if (typeof config.beforeDelete === "function") {
      const canDelete = config.beforeDelete(record);
      if (canDelete === false) return;
    }

    state[entity] = state[entity].filter(item => String(item.id) !== String(id));
    saveData(entity);

    if (entity === "sales" || entity === "salesHistory") {
      syncSalesState();
    }

    if (typeof config.afterDelete === "function") {
      config.afterDelete(record);
    }

    refreshAll();
  }

  function refreshAll() {
    syncSalesState();

    panelRegistry.forEach(panel => {
      if (typeof panel.render === "function") {
        panel.render();
      }
    });

    renderTopbarUser();
  }

  function handleSubmit(event) {
    event.preventDefault();

    const entity = state.currentEntity;
    const config = entityRegistry[entity];
    if (!config) return;

    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());

    const result = config.onSubmit(payload, formData);

    if (result === false) return;

    closeModal();
    refreshAll();
  }

  function openCategoryModal() {
    const modal = document.getElementById("categoryModal");
    if (modal) modal.classList.add("show");

    if (
      window.RackTrackInventoryPanel &&
      typeof window.RackTrackInventoryPanel.renderCategoryList === "function"
    ) {
      window.RackTrackInventoryPanel.renderCategoryList();
    }
  }

  function closeCategoryModal() {
    const modal = document.getElementById("categoryModal");
    if (modal) modal.classList.remove("show");
  }

  function groupRecordsByDay(records, dateField = "createdAt", chunkSize = 10) {
    const groupedMap = new Map();

    const sortedRecords = [...records].sort((a, b) => {
      const aDate = new Date(a[dateField] || 0).getTime();
      const bDate = new Date(b[dateField] || 0).getTime();
      return bDate - aDate;
    });

    sortedRecords.forEach(record => {
      const rawDate = record[dateField];
      const validDate = rawDate ? new Date(rawDate) : null;

      const dateKey = validDate && !Number.isNaN(validDate.getTime())
        ? validDate.toISOString().slice(0, 10)
        : "no-date";

      if (!groupedMap.has(dateKey)) {
        groupedMap.set(dateKey, []);
      }

      groupedMap.get(dateKey).push(record);
    });

    return Array.from(groupedMap.entries())
      .sort((a, b) => {
        if (a[0] === "no-date") return 1;
        if (b[0] === "no-date") return -1;
        return new Date(b[0]).getTime() - new Date(a[0]).getTime();
      })
      .map(([dateKey, items]) => {
        const tables = [];

        for (let i = 0; i < items.length; i += chunkSize) {
          tables.push(items.slice(i, i + chunkSize));
        }

        const displayDate = dateKey === "no-date"
          ? "No Date"
          : new Date(dateKey).toLocaleDateString("en-PH", {
              year: "numeric",
              month: "long",
              day: "2-digit"
            });

        return {
          dateKey,
          date: displayDate,
          tables
        };
      });
  }

  function getRecentGroupedRecords(records, options = {}) {
    const {
      dateField = "createdAt",
      chunkSize = 10,
      maxGroups = 2,
      maxRowsPerGroup = 5
    } = options;

    const grouped = groupRecordsByDay(records, dateField, chunkSize);

    return grouped.slice(0, maxGroups).map(group => ({
      ...group,
      tables: group.tables.map(table => table.slice(0, maxRowsPerGroup))
    }));
  }

  function toDateKey(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function getLatestDateKey(records, dateField = "createdAt") {
    if (!Array.isArray(records) || !records.length) return "";

    const validKeys = records
      .map(record => toDateKey(record[dateField]))
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return validKeys[0] || "";
  }

  function setupEvents() {
    if (localStorage.getItem("racktrackUserRole") !== "admin") {
      alert("Admin login required.");
      window.location.href = "./admin-login.html";
      return;
    }

    renderTopbarUser();

    const menuToggle = document.getElementById("menuToggle");
    const appShell = document.getElementById("appShell");

    if (menuToggle && appShell) {
      menuToggle.addEventListener("click", () => {
        appShell.classList.toggle("sidebar-hidden");
      });
    }

    document.querySelectorAll(".nav-link[data-section]").forEach(btn => {
      btn.addEventListener("click", () => setActiveSection(btn.dataset.section));
    });

    document.querySelectorAll("[data-jump]").forEach(btn => {
      btn.addEventListener("click", () => setActiveSection(btn.dataset.jump));
    });

    document.querySelectorAll("[data-open-modal]").forEach(btn => {
      btn.addEventListener("click", () => openModal(btn.dataset.openModal));
    });

    const recordForm = document.getElementById("recordForm");
    if (recordForm) recordForm.addEventListener("submit", handleSubmit);

    const closeModalBtn = document.getElementById("closeModal");
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);

    const formModal = document.getElementById("formModal");
    if (formModal) {
      formModal.addEventListener("click", event => {
        if (event.target.id === "formModal") closeModal();
      });
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", openLogoutModal);

    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener("click", closeLogoutModal);

    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
    if (confirmLogoutBtn) confirmLogoutBtn.addEventListener("click", confirmLogout);

    const logoutModal = document.getElementById("logoutModal");
    if (logoutModal) {
      logoutModal.addEventListener("click", event => {
        if (event.target.id === "logoutModal") closeLogoutModal();
      });
    }

    const openCategoryBtn = document.getElementById("openCategoryBtn");
    if (openCategoryBtn) openCategoryBtn.addEventListener("click", openCategoryModal);

    const categoryModal = document.getElementById("categoryModal");
    if (categoryModal) {
      categoryModal.addEventListener("click", event => {
        if (event.target.id === "categoryModal") closeCategoryModal();
      });
    }

    const closeCategoryModalBtn = document.getElementById("closeCategoryModal");
    if (closeCategoryModalBtn) closeCategoryModalBtn.addEventListener("click", closeCategoryModal);

    const cancelCategoryBtn = document.getElementById("cancelCategoryBtn");
    if (cancelCategoryBtn) cancelCategoryBtn.addEventListener("click", closeCategoryModal);
  }

  function clearAllRackTrackData() {
    const approved = confirm("This will reset all Rack Track data to 0. Continue?");
    if (!approved) return;

    const phrase = prompt("Type DELETE ALL to confirm full data reset.");
    if (phrase !== "DELETE ALL") {
      alert("Reset cancelled.");
      return;
    }

    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    Object.values(BACKUP_STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(METRICS_SNAPSHOT_KEY);

    Object.keys(defaultData).forEach(key => {
      state[key] = [];
    });

    Object.assign(previousMetrics, {
      inventoryTotal: 0,
      ordersTotal: 0,
      customersTotal: 0,
      lowStockTotal: 0,
      inventoryValue: 0,
      revenueValue: 0,
      profitValue: 0,
      doneOrders: 0,
      pendingOrders: 0,
      processingOrders: 0
    });

    Object.keys(defaultData).forEach(key => {
      saveData(key);
    });

    saveMetricsSnapshot(previousMetrics);
    refreshAll();
    alert("All Rack Track data has been reset to 0.");
  }

  function resetAllRackTrackDataToZero() {
    clearAllRackTrackData();
  }

  window.openEdit = openEdit;
  window.deleteRecord = deleteRecord;
  window.clearAllRackTrackData = clearAllRackTrackData;
  window.resetAllRackTrackDataToZero = resetAllRackTrackDataToZero;

  window.RackTrack = {
    state,
    previousMetrics,
    registerEntity,
    registerPanel,
    saveData,
    saveMetricsSnapshot,
    calculateExpenses,
    calculateRevenue,
    calculateProfit,
    peso,
    stockStatus,
    statusClass,
    formatDisplayDate,
    formatDateTime,
    formatHistoryDate,
    formatHistoryTime,
    escapeHtml,
    changePercent,
    setText,
    setActiveSection,
    renderImageCell,
    normalizeCategoryName,
    getCategoryByName,
    renderCategoryBadge,
    categoryOptions,
    productOptions,
    inventoryOrderOptions,
    findProductBySku,
    findInventoryById,
    getMovementType,
    movementClass,
    differenceClass,
    formatDifference,
    addStockHistoryEntry,
    addSaleRecord,
    syncInventoryFromProduct,
    getMetrics,
    getDailyReportGroups,
    removeDailyRecord,
    requestSensitiveDeleteApproval,
    openModal,
    openEdit,
    closeModal,
    buildForm,
    refreshAll,
    setupEvents,
    groupRecordsByDay,
    getRecentGroupedRecords,
    toDateKey,
    getLatestDateKey,
    getLoggedInUsername,
    renderTopbarUser,
    clearAllRackTrackData,
    resetAllRackTrackDataToZero,
    syncSalesState,
    dedupeRecords
  };
})();