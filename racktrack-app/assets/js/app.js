const STORAGE_KEYS = {
  categories: "racktrack_categories",
  products: "racktrack_products",
  inventory: "racktrack_inventory",
  orders: "racktrack_orders",
  customers: "racktrack_customers",
  stockHistory: "racktrack_stock_history"
};

const METRICS_SNAPSHOT_KEY = "racktrack_metrics_snapshot";

/*
  IMPORTANT:
  This project now starts EMPTY by default.
  No sample data will be inserted automatically.
*/
const defaultData = {
  categories: [],
  products: [],
  inventory: [],
  orders: [],
  customers: [],
  stockHistory: []
};

function loadData(entity) {
  const stored = localStorage.getItem(STORAGE_KEYS[entity]);

  if (!stored) {
    localStorage.setItem(STORAGE_KEYS[entity], JSON.stringify(defaultData[entity]));
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    localStorage.setItem(STORAGE_KEYS[entity], JSON.stringify(defaultData[entity]));
    return [];
  }
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
    return {
      ...fallback,
      ...(parsed || {})
    };
  } catch (error) {
    return fallback;
  }
}

function saveMetricsSnapshot(metrics) {
  localStorage.setItem(METRICS_SNAPSHOT_KEY, JSON.stringify(metrics));
}

const state = {
  currentEntity: null,
  editId: null,
  currentInventoryTab: "items",
  categories: loadData("categories"),
  products: loadData("products"),
  inventory: loadData("inventory"),
  orders: loadData("orders"),
  customers: loadData("customers"),
  stockHistory: loadData("stockHistory")
};

/* =========================
   CALCULATION HELPERS
========================= */
function calculateExpenses(cost, quantity) {
  return (Number(cost) || 0) * (Number(quantity) || 0);
}

function calculateRevenue(srp, quantity) {
  return (Number(srp) || 0) * (Number(quantity) || 0);
}

function calculateProfit(cost, srp, quantity) {
  const srpNum = Number(srp) || 0;
  const costNum = Number(cost) || 0;
  const qtyNum = Number(quantity) || 0;
  return (srpNum - costNum) * qtyNum;
}

function calculateInventoryRevenueTotal() {
  return state.inventory.reduce((sum, item) => {
    return sum + calculateRevenue(item.srp, item.quantity);
  }, 0);
}

function calculateInventoryProfitTotal() {
  return state.inventory.reduce((sum, item) => {
    return sum + calculateProfit(item.cost, item.srp, item.quantity);
  }, 0);
}

const previousMetrics = loadMetricsSnapshot();

function saveData(entity) {
  localStorage.setItem(STORAGE_KEYS[entity], JSON.stringify(state[entity]));
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
  const qty = Number(quantity) || 0;
  return qty <= 5 ? "Low Stock" : "In Stock";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

/* =========================
   CATEGORY HELPERS
========================= */
function normalizeCategoryName(name) {
  return String(name || "").trim();
}

function getCategoryByName(name) {
  const normalized = normalizeCategoryName(name).toLowerCase();
  return state.categories.find(category => normalizeCategoryName(category.name).toLowerCase() === normalized) || null;
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
  if (!safeName) return `<span class="category-badge neutral">Uncategorized</span>`;

  const category = getCategoryByName(safeName);

  if (!category?.color) {
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
  const availableItems = state.inventory.filter(item => (Number(item.quantity) || 0) > 0 || String(item.id) === String(selectedId));

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
  return state.products.find(product => String(product.sku || "").trim().toLowerCase() === normalized) || null;
}

function findInventoryById(id) {
  return state.inventory.find(item => String(item.id) === String(id)) || null;
}

function populateInventoryFieldsFromProduct(product) {
  const productNameInput = document.getElementById("inventoryProductName");
  const skuInput = document.getElementById("inventorySku");
  const variantInput = document.getElementById("inventoryVariant");
  const descriptionInput = document.getElementById("inventoryDescription");
  const categoryInput = document.getElementById("inventoryCategory");
  const costInput = document.getElementById("inventoryCost");
  const srpInput = document.getElementById("inventorySrp");
  const imageDataInput = document.getElementById("inventoryImageData");
  const imagePreviewWrap = document.getElementById("inventoryImagePreviewWrap");

  if (!product) {
    if (productNameInput) productNameInput.value = "";
    if (skuInput) skuInput.value = "";
    if (variantInput) variantInput.value = "";
    if (descriptionInput) descriptionInput.value = "";
    if (categoryInput) categoryInput.value = "";
    if (costInput) costInput.value = "";
    if (srpInput) srpInput.value = "";
    if (imageDataInput) imageDataInput.value = "";

    if (imagePreviewWrap) {
      imagePreviewWrap.innerHTML = `<div class="image-preview-empty">No image available</div>`;
    }
    return;
  }

  if (productNameInput) productNameInput.value = product.productName || "";
  if (skuInput) skuInput.value = product.sku || "";
  if (variantInput) variantInput.value = product.variant || "";
  if (descriptionInput) descriptionInput.value = product.description || "";
  if (categoryInput) categoryInput.value = product.category || "";
  if (costInput) costInput.value = product.cost ?? "";
  if (srpInput) srpInput.value = product.srp ?? "";
  if (imageDataInput) imageDataInput.value = product.imageData || "";

  if (imagePreviewWrap) {
    imagePreviewWrap.innerHTML = product.imageData
      ? `<img src="${product.imageData}" alt="Product Preview" />`
      : `<div class="image-preview-empty">No image available</div>`;
  }
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

/* =========================
   DASHBOARD RENDERS
========================= */
function renderLowStock() {
  const list = document.getElementById("lowStockList");
  if (!list) return;

  const lowItems = state.inventory.filter(item => (Number(item.quantity) || 0) <= 5);

  if (!lowItems.length) {
    list.innerHTML = `<div class="empty-state">No low stock items.</div>`;
    return;
  }

  list.innerHTML = lowItems.slice(0, 3).map(item => `
    <div class="low-stock-item">
      <strong>${escapeHtml(item.productName)}</strong>
      <div class="low-stock-meta">
        <span>Available: ${Number(item.quantity) || 0}</span>
        <button class="order-link" type="button" data-jump="inventory-section">Restock</button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".order-link").forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveSection("inventory-section");
      switchInventoryTab("items");
    });
  });
}

function renderRecentOrders() {
  const list = document.getElementById("recentOrdersList");
  if (!list) return;

  if (!state.orders.length) {
    list.innerHTML = `<div class="empty-state">No recent orders.</div>`;
    return;
  }

  list.innerHTML = state.orders.slice(0, 3).map(order => `
    <div class="recent-item">
      <div class="recent-left">
        <img src="../assets/images/package.png" alt="Order item" />
        <div class="recent-main">
          <strong>${escapeHtml(order.item)}</strong>
          <em>Order id: ${escapeHtml(order.orderId)}</em>
        </div>
      </div>
      <div class="recent-right">
        <time>${formatDisplayDate(order.date)}</time>
        <span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span>
      </div>
    </div>
  `).join("");
}

function renderTopSelling() {
  const tbody = document.getElementById("topSellingBody");
  if (!tbody) return;

  if (!state.orders.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No sales data yet.</td></tr>`;
    return;
  }

  const salesMap = {};

  state.orders.forEach(order => {
    const itemName = String(order.item || "").trim() || "Unnamed Product";
    if (!salesMap[itemName]) {
      salesMap[itemName] = {
        name: itemName,
        sold: 0,
        total: 0
      };
    }

    salesMap[itemName].sold += Number(order.quantity) || 1;
    salesMap[itemName].total += Number(order.totalRevenue) || calculateRevenue(order.srp, order.quantity);
  });

  const ranked = Object.values(salesMap)
    .sort((a, b) => b.sold - a.sold || b.total - a.total)
    .slice(0, 5);

  tbody.innerHTML = ranked.map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${item.sold}</td>
      <td>${peso(item.total)}</td>
    </tr>
  `).join("");
}

function renderInventoryTable(filter = "") {
  const tbody = document.getElementById("inventoryTableBody");
  if (!tbody) return;

  const term = String(filter || "").trim().toLowerCase();

  const items = state.inventory.filter(item => {
    const haystack = [
      item.productName,
      item.sku,
      item.variant,
      item.description,
      item.category
    ].join(" ").toLowerCase();

    return haystack.includes(term);
  });

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state">No inventory records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.cost) || 0;
    const srp = Number(item.srp) || 0;
    const totalExpenses = calculateExpenses(cost, qty);
    const totalRevenue = calculateRevenue(srp, qty);
    const totalProfit = calculateProfit(cost, srp, qty);
    const isLowStock = qty <= 5;
    const statusText = isLowStock ? "Low Stock" : "In Stock";
    const stockStatusClass = isLowStock ? "low-stock" : "in-stock";

    return `
      <tr>
        <td>${renderImageCell(item.imageData, item.productName)}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.variant || "-")}</td>
        <td>${renderCategoryBadge(item.category)}</td>
        <td>${peso(cost)}</td>
        <td>${peso(srp)}</td>
        <td>${qty}</td>
        <td>${peso(totalExpenses)}</td>
        <td>${peso(totalRevenue)}</td>
        <td>${peso(totalProfit)}</td>
        <td>
          <span class="stock-status ${stockStatusClass}">${statusText}</span>
        </td>
        <td>
          <div class="action-group">
            <button class="small-btn edit-btn" type="button" onclick="openEdit('inventory', '${item.id}')">Edit</button>
            <button class="small-btn delete-btn" type="button" onclick="deleteRecord('inventory', '${item.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderProductsTable(filter = "") {
  const tbody = document.getElementById("productsTableBody");
  if (!tbody) return;

  const term = String(filter || "").trim().toLowerCase();

  const items = state.products.filter(item => {
    const haystack = [
      item.productName,
      item.sku,
      item.variant,
      item.description,
      item.category
    ].join(" ").toLowerCase();

    return haystack.includes(term);
  });

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No products found.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${renderImageCell(item.imageData, item.productName)}</td>
      <td>${escapeHtml(item.productName)}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.variant || "-")}</td>
      <td class="description-cell">${escapeHtml(item.description || "-")}</td>
      <td>${renderCategoryBadge(item.category)}</td>
      <td>${peso(item.cost)}</td>
      <td>${peso(item.srp)}</td>
      <td>
        <div class="action-group">
          <button class="small-btn edit-btn" type="button" onclick="openEdit('products', '${item.id}')">Edit</button>
          <button class="small-btn delete-btn" type="button" onclick="deleteRecord('products', '${item.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderOrdersTable() {
  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;

  if (!state.orders.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.orders.map(order => `
    <tr>
      <td>${escapeHtml(order.orderId)}</td>
      <td>${escapeHtml(order.customer)}</td>
      <td>${escapeHtml(order.item)}</td>
      <td>${formatDisplayDate(order.date)}</td>
      <td><span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span></td>
      <td>${peso(Number(order.totalProfit) || calculateProfit(order.cost, order.srp, order.quantity))}</td>
      <td>
        <div class="action-group">
          <button class="small-btn edit-btn" type="button" onclick="openEdit('orders', '${order.id}')">Edit</button>
          <button class="small-btn delete-btn" type="button" onclick="deleteRecord('orders', '${order.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderCustomersTable() {
  const tbody = document.getElementById("customersTableBody");
  if (!tbody) return;

  if (!state.customers.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No customers found.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.customers.map(customer => `
    <tr>
      <td>${escapeHtml(customer.name)}</td>
      <td>${escapeHtml(customer.email)}</td>
      <td>${escapeHtml(customer.phone)}</td>
      <td>${escapeHtml(customer.address)}</td>
      <td>
        <div class="action-group">
          <button class="small-btn edit-btn" type="button" onclick="openEdit('customers', '${customer.id}')">Edit</button>
          <button class="small-btn delete-btn" type="button" onclick="deleteRecord('customers', '${customer.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function getMetrics() {
  const inventoryTotal = state.inventory.length;
  const ordersTotal = state.orders.length;
  const customersTotal = state.customers.length;
  const lowStockTotal = state.inventory.filter(item => (Number(item.quantity) || 0) <= 5).length;
  const doneOrders = state.orders.filter(order => String(order.status || "").toLowerCase() === "done").length;
  const pendingOrders = state.orders.filter(order => String(order.status || "").toLowerCase() === "pending").length;
  const processingOrders = state.orders.filter(order => String(order.status || "").toLowerCase() === "processing").length;

  const inventoryValue = state.inventory.reduce((sum, item) => {
    const cost = Number(item.cost) || 0;
    const qty = Number(item.quantity) || 0;
    return sum + calculateExpenses(cost, qty);
  }, 0);

  const revenueValue = state.inventory.reduce((sum, item) => {
    return sum + calculateRevenue(item.srp, item.quantity);
  }, 0);

  const profitValue = state.inventory.reduce((sum, item) => {
    return sum + calculateProfit(item.cost, item.srp, item.quantity);
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

function renderReports() {
  const metrics = getMetrics();

  setText("reportInventoryCount", metrics.inventoryTotal);
  setText("reportOrderCount", metrics.ordersTotal);
  setText("reportCustomerCount", metrics.customersTotal);
  setText("reportLowStockCount", metrics.lowStockTotal);

  setText("packedCount", metrics.pendingOrders);
  setText("shippedCount", metrics.processingOrders);
  setText("deliveredCount", metrics.doneOrders);
  setText("invoicedCount", metrics.ordersTotal);

  setText("inventorySummaryInStock", metrics.inventoryTotal - metrics.lowStockTotal);
  setText("inventorySummaryRestock", metrics.lowStockTotal);

  setText("dashboardRevenue", peso(metrics.profitValue));
  setText("dashboardExpenses", peso(metrics.inventoryValue));
  setText("dashboardCustomersCount", metrics.customersTotal);
  setText("dashboardOrdersCount", metrics.ordersTotal);

  setText("dashboardRevenuePercent", `${changePercent(previousMetrics.profitValue, metrics.profitValue).toFixed(1)}%`);
  setText("dashboardExpensesPercent", `${changePercent(previousMetrics.inventoryValue, metrics.inventoryValue).toFixed(1)}%`);
  setText("dashboardCustomersPercent", `${changePercent(previousMetrics.customersTotal, metrics.customersTotal).toFixed(1)}%`);
  setText("dashboardOrdersPercent", `${changePercent(previousMetrics.ordersTotal, metrics.ordersTotal).toFixed(1)}%`);
  setText("lowStockItemsCount", `${metrics.lowStockTotal} items`);

  previousMetrics.inventoryTotal = metrics.inventoryTotal;
  previousMetrics.ordersTotal = metrics.ordersTotal;
  previousMetrics.customersTotal = metrics.customersTotal;
  previousMetrics.lowStockTotal = metrics.lowStockTotal;
  previousMetrics.inventoryValue = metrics.inventoryValue;
  previousMetrics.revenueValue = metrics.revenueValue;
  previousMetrics.profitValue = metrics.profitValue;
  previousMetrics.doneOrders = metrics.doneOrders;
  previousMetrics.pendingOrders = metrics.pendingOrders;
  previousMetrics.processingOrders = metrics.processingOrders;

  saveMetricsSnapshot(previousMetrics);
}

function refreshAll() {
  const inventorySearch = document.getElementById("inventorySearch");
  const productsSearch = document.getElementById("productsSearch");

  renderLowStock();
  renderRecentOrders();
  renderTopSelling();
  renderInventoryTable(inventorySearch ? inventorySearch.value : "");
  renderProductsTable(productsSearch ? productsSearch.value : "");
  renderOrdersTable();
  renderCustomersTable();
  renderStockHistoryTable();
  renderReports();
  renderCategoryList();
  updateGraphs();
}

/* =========================
   MODAL WIDTH
========================= */
function setModalWide(isWide) {
  const modalCard = document.querySelector("#formModal .modal-card");
  if (!modalCard) return;
  modalCard.classList.toggle("large-form", isWide);
}

/* =========================
   FORM HTML
========================= */
function productFormHTML(values = {}) {
  const noCategory = !state.categories.length;

  return `
    <div class="form-grid two-columns">
      <div class="form-left">
        <div class="form-field">
          <label>Product Name</label>
          <input name="productName" placeholder="Product Name" value="${escapeHtml(values.productName || "")}" required />
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>SKU</label>
            <input name="sku" placeholder="SKU" value="${escapeHtml(values.sku || "")}" required />
          </div>
          <div class="form-field">
            <label>Variant</label>
            <input name="variant" placeholder="Variant" value="${escapeHtml(values.variant || "")}" />
          </div>
        </div>

        <div class="form-field">
          <label>Description</label>
          <textarea name="description" placeholder="Write product description...">${escapeHtml(values.description || "")}</textarea>
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>Category</label>
            <select name="category" required ${noCategory ? "disabled" : ""}>
              ${categoryOptions(values.category || "")}
            </select>
            ${noCategory ? `<div class="field-note warning">Create a category first before adding a product.</div>` : ""}
          </div>

          <div class="form-field">
            <label>Cost</label>
            <input name="cost" type="number" min="0" step="0.01" placeholder="Cost" value="${values.cost ?? ""}" required />
          </div>
        </div>

        <div class="form-field">
          <label>SRP</label>
          <input name="srp" type="number" min="0" step="0.01" placeholder="SRP" value="${values.srp ?? ""}" required />
        </div>
      </div>

      <div class="form-right">
        <div class="image-upload-box">
          <div class="image-preview-wrap" id="imagePreviewWrap">
            ${
              values.imageData
                ? `<img src="${values.imageData}" alt="Product Preview" id="imagePreview" />`
                : `<div class="image-preview-empty" id="imagePreviewEmpty">No image uploaded yet</div>`
            }
          </div>

          <input type="hidden" name="imageData" id="imageDataInput" value="${values.imageData || ""}" />
          <input type="file" id="imageFileInput" class="hidden-file-input" accept="image/*" />

          <div class="upload-actions">
            <button type="button" class="upload-btn" id="chooseImageBtn">Upload Image</button>
            <button type="button" class="remove-image-btn" id="removeImageBtn">Remove Image</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function inventoryFormHTML(values = {}) {
  const selectedProduct = findProductBySku(values.sku || "");
  const hasProducts = state.products.length > 0;
  const isEditMode = Boolean(state.editId);
  const currentQty = Number(values.quantity) || 0;

  return `
    <div class="form-grid two-columns">
      <div class="form-left">
        <div class="form-field">
          <label>Select Product</label>
          <select name="sourceProductSku" id="inventoryProductSelect" required ${hasProducts ? "" : "disabled"} ${isEditMode ? "disabled" : ""}>
            ${productOptions(values.sku || "")}
          </select>

          ${
            isEditMode
              ? `<input type="hidden" name="sourceProductSku" value="${escapeHtml(values.sku || "")}" />`
              : ""
          }

          ${
            isEditMode
              ? `<div class="field-note">Product cannot be changed while editing quantity history for this inventory record.</div>`
              : hasProducts
                ? `<div class="field-note">Inventory can only use products from your Products list.</div>`
                : `<div class="field-note warning">Add a product first before adding inventory.</div>`
          }
        </div>

        <div class="form-field">
          <label>Product Name</label>
          <input id="inventoryProductName" name="productName" value="${escapeHtml(selectedProduct?.productName || values.productName || "")}" readonly />
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>SKU</label>
            <input id="inventorySku" name="sku" value="${escapeHtml(selectedProduct?.sku || values.sku || "")}" readonly />
          </div>
          <div class="form-field">
            <label>Variant</label>
            <input id="inventoryVariant" name="variant" value="${escapeHtml(selectedProduct?.variant || values.variant || "")}" readonly />
          </div>
        </div>

        <div class="form-field">
          <label>Description</label>
          <textarea id="inventoryDescription" name="description" readonly>${escapeHtml(selectedProduct?.description || values.description || "")}</textarea>
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>Category</label>
            <input id="inventoryCategory" name="category" value="${escapeHtml(selectedProduct?.category || values.category || "")}" readonly />
          </div>

          ${
            isEditMode
              ? `
                <div class="form-field">
                  <label>Current Quantity</label>
                  <input type="number" value="${currentQty}" readonly />
                </div>
              `
              : `
                <div class="form-field">
                  <label>Quantity</label>
                  <input name="quantity" type="number" min="0" step="1" placeholder="Quantity" value="${values.quantity ?? ""}" required />
                </div>
              `
          }
        </div>

        ${
          isEditMode
            ? `
              <div class="form-two">
                <div class="form-field">
                  <label>New Quantity</label>
                  <input name="quantity" type="number" min="0" step="1" placeholder="Enter new quantity" value="${values.quantity ?? ""}" required />
                </div>

                <div class="form-field">
                  <label>Movement Type</label>
                  <input id="inventoryMovementTypePreview" type="text" value="No Change" readonly />
                </div>
              </div>

              <div class="form-field">
                <label>Reason / Note</label>
                <textarea
                  name="stockNote"
                  id="stockNote"
                  placeholder="Required if quantity changes. Example: New delivery received / Damaged items pulled out / Manual stock correction"
                ></textarea>
                <div class="field-note warning">
                  Note is required when quantity is increased or decreased.
                </div>
              </div>
            `
            : ""
        }

        <div class="form-two">
          <div class="form-field">
            <label>Cost</label>
            <input id="inventoryCost" name="cost" type="number" value="${selectedProduct?.cost ?? values.cost ?? ""}" readonly />
          </div>
          <div class="form-field">
            <label>SRP</label>
            <input id="inventorySrp" name="srp" type="number" value="${selectedProduct?.srp ?? values.srp ?? ""}" readonly />
          </div>
        </div>
      </div>

      <div class="form-right">
        <div class="image-upload-box">
          <div class="image-preview-wrap" id="inventoryImagePreviewWrap">
            ${
              (selectedProduct?.imageData || values.imageData)
                ? `<img src="${selectedProduct?.imageData || values.imageData}" alt="Product Preview" />`
                : `<div class="image-preview-empty">No image available</div>`
            }
          </div>

          <input type="hidden" name="imageData" id="inventoryImageData" value="${selectedProduct?.imageData || values.imageData || ""}" />

          <div class="product-source-note">
            Product details here are connected to your Products list.
          </div>
        </div>
      </div>
    </div>
  `;
}

function ordersFormHTML(values = {}) {
  const selectedInventory = findInventoryById(values.inventoryId || "");

  return `
    <div class="form-grid two-columns">
      <div class="form-left">
        <div class="form-two">
          <div class="form-field">
            <label>Order ID</label>
            <input name="orderId" placeholder="Order ID" value="${escapeHtml(values.orderId || "")}" required />
          </div>

          <div class="form-field">
            <label>Date</label>
            <input name="date" type="date" value="${values.date || ""}" required />
          </div>
        </div>

        <div class="form-field">
          <label>Customer</label>
          <input name="customer" placeholder="Customer name" value="${escapeHtml(values.customer || "")}" required />
        </div>

        <div class="form-field">
          <label>Select Inventory Item</label>
          <select name="inventoryId" id="orderInventorySelect" required>
            ${inventoryOrderOptions(values.inventoryId || "")}
          </select>
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>Item</label>
            <input
              name="item"
              id="orderItem"
              placeholder="Item"
              value="${escapeHtml(selectedInventory?.productName || values.item || "")}"
              readonly
            />
          </div>

          <div class="form-field">
            <label>Status</label>
            <select name="status" required>
              <option value="Pending" ${values.status === "Pending" ? "selected" : ""}>Pending</option>
              <option value="Processing" ${values.status === "Processing" ? "selected" : ""}>Processing</option>
              <option value="Done" ${values.status === "Done" ? "selected" : ""}>Done</option>
            </select>
          </div>
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>SKU</label>
            <input
              name="sku"
              id="orderSku"
              value="${escapeHtml(selectedInventory?.sku || values.sku || "")}"
              readonly
            />
          </div>

          <div class="form-field">
            <label>Available Stock</label>
            <input
              type="number"
              id="orderAvailableStock"
              value="${Number(selectedInventory?.quantity) || 0}"
              readonly
            />
          </div>
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>Quantity</label>
            <input
              name="quantity"
              id="orderQuantity"
              type="number"
              min="1"
              step="1"
              value="${values.quantity ?? 1}"
              required
            />
          </div>

          <div class="form-field">
            <label>Cost</label>
            <input
              name="cost"
              id="orderCost"
              type="number"
              min="0"
              step="0.01"
              value="${selectedInventory?.cost ?? values.cost ?? ""}"
              readonly
            />
          </div>
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>SRP</label>
            <input
              name="srp"
              id="orderSrp"
              type="number"
              min="0"
              step="0.01"
              value="${selectedInventory?.srp ?? values.srp ?? ""}"
              readonly
            />
          </div>

          <div class="form-field">
            <label>Total Expenses</label>
            <input
              name="totalExpenses"
              id="orderTotalExpenses"
              type="number"
              min="0"
              step="0.01"
              value="${values.totalExpenses ?? ""}"
              readonly
            />
          </div>
        </div>

        <div class="form-two">
          <div class="form-field">
            <label>Total Revenue</label>
            <input
              name="totalRevenue"
              id="orderTotalRevenue"
              type="number"
              min="0"
              step="0.01"
              value="${values.totalRevenue ?? values.total ?? ""}"
              readonly
            />
          </div>

          <div class="form-field">
            <label>Total Profit</label>
            <input
              name="totalProfit"
              id="orderTotalProfit"
              type="number"
              min="0"
              step="0.01"
              value="${values.totalProfit ?? ""}"
              readonly
            />
          </div>
        </div>
      </div>
    </div>
  `;
}

function customersFormHTML(values = {}) {
  return `
    <div class="form-grid">
      <input name="name" placeholder="Full name" value="${escapeHtml(values.name || "")}" required />
      <input name="email" type="email" placeholder="Email" value="${escapeHtml(values.email || "")}" required />
      <input name="phone" placeholder="Phone number" value="${escapeHtml(values.phone || "")}" required />
      <input name="address" placeholder="Address" value="${escapeHtml(values.address || "")}" required />
    </div>
  `;
}

/* =========================
   FORM EVENTS
========================= */
function attachImageUploadHandlers() {
  const chooseImageBtn = document.getElementById("chooseImageBtn");
  const removeImageBtn = document.getElementById("removeImageBtn");
  const imageFileInput = document.getElementById("imageFileInput");
  const imageDataInput = document.getElementById("imageDataInput");
  const imagePreviewWrap = document.getElementById("imagePreviewWrap");

  if (chooseImageBtn && imageFileInput) {
    chooseImageBtn.addEventListener("click", () => imageFileInput.click());
  }

  if (imageFileInput && imageDataInput && imagePreviewWrap) {
    imageFileInput.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        imageDataInput.value = result;
        imagePreviewWrap.innerHTML = `<img src="${result}" alt="Product Preview" id="imagePreview" />`;
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeImageBtn && imageDataInput && imagePreviewWrap && imageFileInput) {
    removeImageBtn.addEventListener("click", () => {
      imageDataInput.value = "";
      imageFileInput.value = "";
      imagePreviewWrap.innerHTML = `<div class="image-preview-empty" id="imagePreviewEmpty">No image uploaded yet</div>`;
    });
  }
}

function attachInventoryProductHandlers(initialSku = "") {
  const productSelect = document.getElementById("inventoryProductSelect");
  if (!productSelect) return;

  if (initialSku) {
    const initialProduct = findProductBySku(initialSku);
    populateInventoryFieldsFromProduct(initialProduct);
  }

  productSelect.addEventListener("change", event => {
    const selectedProduct = findProductBySku(event.target.value);
    populateInventoryFieldsFromProduct(selectedProduct);
  });
}

function attachOrderCalculationHandlers() {
  const inventorySelect = document.getElementById("orderInventorySelect");
  const itemInput = document.getElementById("orderItem");
  const skuInput = document.getElementById("orderSku");
  const availableStockInput = document.getElementById("orderAvailableStock");
  const quantityInput = document.getElementById("orderQuantity");
  const costInput = document.getElementById("orderCost");
  const srpInput = document.getElementById("orderSrp");
  const totalExpensesInput = document.getElementById("orderTotalExpenses");
  const totalRevenueInput = document.getElementById("orderTotalRevenue");
  const totalProfitInput = document.getElementById("orderTotalProfit");

  if (
    !inventorySelect ||
    !itemInput ||
    !skuInput ||
    !availableStockInput ||
    !quantityInput ||
    !costInput ||
    !srpInput ||
    !totalExpensesInput ||
    !totalRevenueInput ||
    !totalProfitInput
  ) {
    return;
  }

  function updateOrderTotals() {
    const selectedInventory = findInventoryById(inventorySelect.value);
    const availableStock = Number(selectedInventory?.quantity) || 0;
    let quantity = Number(quantityInput.value) || 0;
    const cost = Number(costInput.value) || 0;
    const srp = Number(srpInput.value) || 0;

    if (quantity > availableStock && availableStock > 0) {
      quantity = availableStock;
      quantityInput.value = availableStock;
    }

    const totalExpenses = calculateExpenses(cost, quantity);
    const totalRevenue = calculateRevenue(srp, quantity);
    const totalProfit = calculateProfit(cost, srp, quantity);

    totalExpensesInput.value = totalExpenses.toFixed(2);
    totalRevenueInput.value = totalRevenue.toFixed(2);
    totalProfitInput.value = totalProfit.toFixed(2);
  }

  function fillOrderItemDetails() {
    const selectedInventory = findInventoryById(inventorySelect.value);

    if (!selectedInventory) {
      itemInput.value = "";
      skuInput.value = "";
      availableStockInput.value = 0;
      costInput.value = "";
      srpInput.value = "";
      totalExpensesInput.value = "";
      totalRevenueInput.value = "";
      totalProfitInput.value = "";
      return;
    }

    itemInput.value = selectedInventory.productName || "";
    skuInput.value = selectedInventory.sku || "";
    availableStockInput.value = Number(selectedInventory.quantity) || 0;
    costInput.value = Number(selectedInventory.cost) || 0;
    srpInput.value = Number(selectedInventory.srp) || 0;

    updateOrderTotals();
  }

  inventorySelect.addEventListener("change", fillOrderItemDetails);
  quantityInput.addEventListener("input", updateOrderTotals);

  fillOrderItemDetails();
}

function getMovementType(oldQty, newQty) {
  const oldNumber = Number(oldQty) || 0;
  const newNumber = Number(newQty) || 0;

  if (newNumber > oldNumber) return "Stock In";
  if (newNumber < oldNumber) return "Pull Out";
  return "No Change";
}

function addStockHistoryLog({
  itemId,
  productName,
  sku,
  category,
  oldQuantity,
  newQuantity,
  note
}) {
  const movementType = getMovementType(oldQuantity, newQuantity);

  if (movementType === "No Change") return;

  state.stockHistory.unshift({
    id: crypto.randomUUID(),
    itemId: itemId || "",
    productName: productName || "",
    sku: sku || "",
    category: category || "",
    oldQuantity: Number(oldQuantity) || 0,
    newQuantity: Number(newQuantity) || 0,
    difference: (Number(newQuantity) || 0) - (Number(oldQuantity) || 0),
    movementType,
    note: String(note || "").trim(),
    createdAt: new Date().toISOString()
  });

  saveData("stockHistory");
}

function attachInventoryQuantityNoteHandlers(initialQty = 0) {
  const quantityInput = document.querySelector('#recordForm input[name="quantity"]');
  const movementPreview = document.getElementById("inventoryMovementTypePreview");

  if (!quantityInput || !movementPreview) return;

  function updateMovementPreview() {
    const oldQty = Number(initialQty) || 0;
    const newQty = Number(quantityInput.value) || 0;
    movementPreview.value = getMovementType(oldQty, newQty);
  }

  quantityInput.addEventListener("input", updateMovementPreview);
  updateMovementPreview();
}

function buildForm(entity, values = {}) {
  const form = document.getElementById("recordForm");
  const title = document.getElementById("modalTitle");
  if (!form || !title) return;

  state.currentEntity = entity;

  const label = {
    inventory: "Inventory Item",
    products: "Product",
    orders: "Order",
    customers: "Customer"
  };

  title.textContent = `${state.editId ? "Edit" : "Add"} ${label[entity]}`;

  let bodyHTML = "";

  if (entity === "inventory") {
    setModalWide(true);
    bodyHTML = inventoryFormHTML(values);
  } else if (entity === "products") {
    setModalWide(true);
    bodyHTML = productFormHTML(values);
  } else if (entity === "orders") {
    setModalWide(false);
    bodyHTML = ordersFormHTML(values);
  } else if (entity === "customers") {
    setModalWide(false);
    bodyHTML = customersFormHTML(values);
  }

  form.innerHTML = `
    ${bodyHTML}
    <div class="form-actions">
      <button type="button" class="secondary-btn" id="cancelForm">Cancel</button>
      <button type="submit" class="primary-btn">Save</button>
    </div>
  `;

  const cancelBtn = document.getElementById("cancelForm");
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  if (entity === "products") {
    attachImageUploadHandlers();
  }

  if (entity === "inventory") {
    attachInventoryProductHandlers(values.sku || "");

    if (state.editId) {
      attachInventoryQuantityNoteHandlers(Number(values.quantity) || 0);
    }
  }

  if (entity === "orders") {
    attachOrderCalculationHandlers();
  }
}

function openModal(entity) {
  state.editId = null;
  buildForm(entity);
  const modal = document.getElementById("formModal");
  if (modal) modal.classList.add("show");
}

function closeModal() {
  const modal = document.getElementById("formModal");
  if (modal) modal.classList.remove("show");
}

function openEdit(entity, id) {
  state.currentEntity = entity;
  state.editId = id;

  const record = state[entity].find(item => item.id === id);

  if (entity === "orders" && record) {
    buildForm(entity, {
      ...record,
      inventoryId: record.inventoryId || ""
    });
  } else {
    buildForm(entity, record || {});
  }

  const modal = document.getElementById("formModal");
  if (modal) modal.classList.add("show");
}

window.openEdit = openEdit;

function deleteRecord(entity, id) {
  const approved = confirm("Are you sure you want to delete this record?");
  if (!approved) return;

  const record = state[entity].find(item => item.id === id);

  if (entity === "orders" && record?.inventoryId) {
    state.inventory = state.inventory.map(item => {
      if (String(item.id) === String(record.inventoryId)) {
        return {
          ...item,
          quantity: (Number(item.quantity) || 0) + (Number(record.quantity) || 0)
        };
      }
      return item;
    });

    saveData("inventory");
  }

  state[entity] = state[entity].filter(item => item.id !== id);
  saveData(entity);

  if (entity === "products" && record?.sku) {
    state.inventory = state.inventory.filter(item => String(item.sku || "").trim().toLowerCase() !== String(record.sku || "").trim().toLowerCase());
    saveData("inventory");
  }

  refreshAll();
}

window.deleteRecord = deleteRecord;

/* =========================
   CATEGORY MODAL
========================= */
function openCategoryModal() {
  const modal = document.getElementById("categoryModal");
  if (modal) modal.classList.add("show");
  renderCategoryList();
}

function closeCategoryModal() {
  const modal = document.getElementById("categoryModal");
  if (modal) modal.classList.remove("show");
}

function renderCategoryList() {
  const list = document.getElementById("categoryList");
  if (!list) return;

  if (!state.categories.length) {
    list.innerHTML = `<div class="empty-state">No categories yet.</div>`;
    return;
  }

  list.innerHTML = state.categories.map(category => `
    <div class="category-item">
      <div class="category-item-left">
        ${renderCategoryBadge(category.name)}
        <small>${escapeHtml(category.color || "")}</small>
      </div>
      <button
        type="button"
        class="small-btn delete-btn"
        onclick="deleteCategory('${category.id}')"
      >
        Delete
      </button>
    </div>
  `).join("");
}

function deleteCategory(id) {
  const category = state.categories.find(item => item.id === id);
  if (!category) return;

  const usedInProducts = state.products.some(product => normalizeCategoryName(product.category).toLowerCase() === normalizeCategoryName(category.name).toLowerCase());
  const usedInInventory = state.inventory.some(item => normalizeCategoryName(item.category).toLowerCase() === normalizeCategoryName(category.name).toLowerCase());

  if (usedInProducts || usedInInventory) {
    alert("This category is already used by products or inventory. Remove those first before deleting the category.");
    return;
  }

  const approved = confirm(`Delete category "${category.name}"?`);
  if (!approved) return;

  state.categories = state.categories.filter(item => item.id !== id);
  saveData("categories");
  renderCategoryList();
  refreshAll();
}

window.deleteCategory = deleteCategory;

function handleCategorySubmit(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  const name = normalizeCategoryName(formData.get("categoryName"));
  const color = String(formData.get("categoryColor") || "#f2b14c");

  if (!name) {
    alert("Category name is required.");
    return;
  }

  const existing = getCategoryByName(name);
  if (existing) {
    alert("Category already exists.");
    return;
  }

  state.categories.unshift({
    id: crypto.randomUUID(),
    name,
    color
  });

  saveData("categories");
  form.reset();

  const colorInput = document.getElementById("categoryColor");
  if (colorInput) colorInput.value = "#f2b14c";

  renderCategoryList();
  refreshAll();
}

/* =========================
   HANDLE SUBMIT
========================= */
function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const entity = state.currentEntity;
  const payload = Object.fromEntries(formData.entries());

  if (entity === "inventory") {
    const existingRecord = state.editId
      ? state.inventory.find(item => item.id === state.editId)
      : null;

    const selectedSku = String(
      payload.sourceProductSku ||
      existingRecord?.sku ||
      payload.sku ||
      ""
    ).trim();

    const sourceProduct = findProductBySku(selectedSku);

    if (!sourceProduct) {
      alert("Please select a valid product from the Products list.");
      return;
    }

    const newQuantity = Number(payload.quantity) || 0;

    if (state.editId) {
      const oldQuantity = Number(existingRecord?.quantity) || 0;
      const movementType = getMovementType(oldQuantity, newQuantity);
      const stockNote = String(payload.stockNote || "").trim();

      if (movementType !== "No Change" && !stockNote) {
        alert("Reason / Note is required when quantity changes.");
        return;
      }

      const inventoryPayload = {
        productName: sourceProduct.productName,
        sku: sourceProduct.sku,
        variant: sourceProduct.variant,
        description: sourceProduct.description,
        category: sourceProduct.category,
        cost: Number(sourceProduct.cost) || 0,
        srp: Number(sourceProduct.srp) || 0,
        quantity: newQuantity,
        imageData: sourceProduct.imageData || ""
      };

      state.inventory = state.inventory.map(item =>
        item.id === state.editId ? { ...item, ...inventoryPayload } : item
      );

      if (movementType !== "No Change") {
        addStockHistoryLog({
          itemId: existingRecord?.id || state.editId,
          productName: sourceProduct.productName,
          sku: sourceProduct.sku,
          category: sourceProduct.category,
          oldQuantity,
          newQuantity,
          note: stockNote
        });
      }
    } else {
      const inventoryPayload = {
        productName: sourceProduct.productName,
        sku: sourceProduct.sku,
        variant: sourceProduct.variant,
        description: sourceProduct.description,
        category: sourceProduct.category,
        cost: Number(sourceProduct.cost) || 0,
        srp: Number(sourceProduct.srp) || 0,
        quantity: newQuantity,
        imageData: sourceProduct.imageData || ""
      };

      const existingIndex = state.inventory.findIndex(item =>
        String(item.sku || "").trim().toLowerCase() === String(sourceProduct.sku || "").trim().toLowerCase()
      );

      if (existingIndex >= 0) {
        state.inventory[existingIndex] = {
          ...state.inventory[existingIndex],
          ...inventoryPayload
        };
      } else {
        state.inventory.unshift({
          id: crypto.randomUUID(),
          ...inventoryPayload
        });
      }
    }

    saveData("inventory");
  }

  if (entity === "products") {
    if (!payload.category) {
      alert("Please select a category.");
      return;
    }

    payload.cost = Number(payload.cost) || 0;
    payload.srp = Number(payload.srp) || 0;

    const existingDuplicate = state.products.find(item => {
      if (state.editId && item.id === state.editId) return false;
      return String(item.sku || "").trim().toLowerCase() === String(payload.sku || "").trim().toLowerCase();
    });

    if (existingDuplicate) {
      alert("SKU already exists. Please use a unique SKU.");
      return;
    }

    if (state.editId) {
      const oldRecord = state.products.find(item => item.id === state.editId);

      state.products = state.products.map(item =>
        item.id === state.editId ? { ...item, ...payload } : item
      );

      saveData("products");
      syncInventoryFromProduct(payload, oldRecord?.sku || payload.sku);
    } else {
      state.products.unshift({
        id: crypto.randomUUID(),
        ...payload
      });

      saveData("products");
    }
  }

  if (entity === "orders") {
    const selectedInventory = findInventoryById(payload.inventoryId);

    if (!selectedInventory) {
      alert("Please select a valid inventory item.");
      return;
    }

    payload.item = selectedInventory.productName || "";
    payload.sku = selectedInventory.sku || "";
    payload.quantity = Number(payload.quantity) || 0;
    payload.cost = Number(selectedInventory.cost) || 0;
    payload.srp = Number(selectedInventory.srp) || 0;

    const availableStock = Number(selectedInventory.quantity) || 0;

    if (payload.quantity <= 0) {
      alert("Quantity must be greater than 0.");
      return;
    }

    if (state.editId) {
      const existingOrder = state.orders.find(item => item.id === state.editId);
      const oldInventoryId = existingOrder?.inventoryId;
      const oldQuantity = Number(existingOrder?.quantity) || 0;

      let effectiveAvailableStock = availableStock;

      if (String(oldInventoryId) === String(selectedInventory.id)) {
        effectiveAvailableStock = availableStock + oldQuantity;
      }

      if (payload.quantity > effectiveAvailableStock) {
        alert("Order quantity cannot be greater than available stock.");
        return;
      }

      if (oldInventoryId && String(oldInventoryId) !== String(selectedInventory.id)) {
        state.inventory = state.inventory.map(item => {
          if (String(item.id) === String(oldInventoryId)) {
            return {
              ...item,
              quantity: (Number(item.quantity) || 0) + oldQuantity
            };
          }
          return item;
        });
      }

      state.inventory = state.inventory.map(item => {
        if (String(item.id) === String(selectedInventory.id)) {
          const restoredStock = String(oldInventoryId) === String(selectedInventory.id)
            ? (Number(item.quantity) || 0) + oldQuantity
            : (Number(item.quantity) || 0);

          return {
            ...item,
            quantity: restoredStock - payload.quantity
          };
        }
        return item;
      });

      payload.totalExpenses = calculateExpenses(payload.cost, payload.quantity);
      payload.totalRevenue = calculateRevenue(payload.srp, payload.quantity);
      payload.totalProfit = calculateProfit(payload.cost, payload.srp, payload.quantity);
      payload.total = payload.totalProfit;

      state.orders = state.orders.map(item =>
        item.id === state.editId ? { ...item, ...payload } : item
      );
    } else {
      if (payload.quantity > availableStock) {
        alert("Order quantity cannot be greater than available stock.");
        return;
      }

      payload.totalExpenses = calculateExpenses(payload.cost, payload.quantity);
      payload.totalRevenue = calculateRevenue(payload.srp, payload.quantity);
      payload.totalProfit = calculateProfit(payload.cost, payload.srp, payload.quantity);
      payload.total = payload.totalProfit;

      state.inventory = state.inventory.map(item => {
        if (String(item.id) === String(selectedInventory.id)) {
          return {
            ...item,
            quantity: availableStock - payload.quantity
          };
        }
        return item;
      });

      state.orders.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...payload
      });
    }

    saveData("inventory");
    saveData("orders");
  }

  if (entity === "customers") {
    if (state.editId) {
      state.customers = state.customers.map(item =>
        item.id === state.editId ? { ...item, ...payload } : item
      );
    } else {
      state.customers.unshift({
        id: crypto.randomUUID(),
        ...payload
      });
    }

    saveData("customers");
  }

  closeModal();
  refreshAll();
}

/* =========================
   LOGOUT MODAL
========================= */
function openLogoutModal() {
  const modal = document.getElementById("logoutModal");
  if (modal) modal.classList.add("show");
}

function closeLogoutModal() {
  const modal = document.getElementById("logoutModal");
  if (modal) modal.classList.remove("show");
}

function confirmLogout() {
  localStorage.removeItem("racktrackUserRole");
  sessionStorage.removeItem("cameFromSplash");
  window.location.href = "./admin-login.html";
}

/* =========================
   INVENTORY TAB SWITCHING
========================= */
function switchInventoryTab(tabName) {
  state.currentInventoryTab = tabName;

  document.querySelectorAll(".inventory-top-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.inventoryTab === tabName);
  });

  const itemsView = document.getElementById("inventory-items-view");
  const productsView = document.getElementById("inventory-products-view");
  const mainActionBtn = document.getElementById("inventoryMainActionBtn");

  if (itemsView) itemsView.classList.toggle("active", tabName === "items");
  if (productsView) productsView.classList.toggle("active", tabName === "products");

  if (mainActionBtn) {
    mainActionBtn.textContent = tabName === "products" ? "+ Add Product" : "+ Add Item";
  }
}

/* =========================
   SAFE EVENT SETUP
========================= */
function setupLogoutEvents() {
  const logoutBtn = document.getElementById("logoutBtn");
  const cancelBtn = document.getElementById("cancelLogoutBtn");
  const confirmBtn = document.getElementById("confirmLogoutBtn");
  const modal = document.getElementById("logoutModal");

  if (logoutBtn) logoutBtn.onclick = openLogoutModal;
  if (cancelBtn) cancelBtn.onclick = closeLogoutModal;
  if (confirmBtn) confirmBtn.onclick = confirmLogout;

  if (modal) {
    modal.onclick = function (e) {
      if (e.target.id === "logoutModal") closeLogoutModal();
    };
  }
}

/* =========================
   SETUP EVENTS
========================= */
function setupEvents() {
  if (localStorage.getItem("racktrackUserRole") !== "admin") {
    alert("Admin login required.");
    window.location.href = "./admin-login.html";
    return;
  }

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

  const openCategoryBtn = document.getElementById("openCategoryBtn");
  if (openCategoryBtn) {
    openCategoryBtn.addEventListener("click", openCategoryModal);
  }

  const closeModalBtn = document.getElementById("closeModal");
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);

  const formModal = document.getElementById("formModal");
  if (formModal) {
    formModal.addEventListener("click", event => {
      if (event.target.id === "formModal") closeModal();
    });
  }

  const recordForm = document.getElementById("recordForm");
  if (recordForm) recordForm.addEventListener("submit", handleSubmit);

  const inventorySearch = document.getElementById("inventorySearch");
  if (inventorySearch) {
    inventorySearch.addEventListener("input", event => {
      renderInventoryTable(event.target.value);
    });
  }

  const productsSearch = document.getElementById("productsSearch");
  if (productsSearch) {
    productsSearch.addEventListener("input", event => {
      renderProductsTable(event.target.value);
    });
  }

  const globalSearch = document.getElementById("globalSearch");
  if (globalSearch) {
    globalSearch.addEventListener("input", event => {
      const term = event.target.value.trim().toLowerCase();

      if (!term) {
        refreshAll();
        return;
      }

      renderInventoryTable(term);
      renderProductsTable(term);
    });
  }

  document.querySelectorAll(".inventory-top-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      switchInventoryTab(btn.dataset.inventoryTab);
    });
  });

  const inventoryMainActionBtn = document.getElementById("inventoryMainActionBtn");
  if (inventoryMainActionBtn) {
    inventoryMainActionBtn.addEventListener("click", () => {
      if (state.currentInventoryTab === "products") {
        openModal("products");
      } else {
        openModal("inventory");
      }
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

  const categoryModal = document.getElementById("categoryModal");
  if (categoryModal) {
    categoryModal.addEventListener("click", event => {
      if (event.target.id === "categoryModal") closeCategoryModal();
    });
  }

  const closeCategoryModalBtn = document.getElementById("closeCategoryModal");
  if (closeCategoryModalBtn) {
    closeCategoryModalBtn.addEventListener("click", closeCategoryModal);
  }

  const cancelCategoryBtn = document.getElementById("cancelCategoryBtn");
  if (cancelCategoryBtn) {
    cancelCategoryBtn.addEventListener("click", closeCategoryModal);
  }

  const categoryForm = document.getElementById("categoryForm");
  if (categoryForm) {
    categoryForm.addEventListener("submit", handleCategorySubmit);
  }
}

/* OPTIONAL:
   Run this once if old sample data still appears in your dashboard.
   Then refresh the page.

   clearAllRackTrackData();
*/
function clearAllRackTrackData() {
  localStorage.removeItem(STORAGE_KEYS.categories);
  localStorage.removeItem(STORAGE_KEYS.products);
  localStorage.removeItem(STORAGE_KEYS.inventory);
  localStorage.removeItem(STORAGE_KEYS.orders);
  localStorage.removeItem(STORAGE_KEYS.customers);
  localStorage.removeItem(STORAGE_KEYS.stockHistory);
  localStorage.removeItem(METRICS_SNAPSHOT_KEY);

  state.categories = [];
  state.products = [];
  state.inventory = [];
  state.orders = [];
  state.customers = [];
  state.stockHistory = [];

  previousMetrics.inventoryTotal = 0;
  previousMetrics.ordersTotal = 0;
  previousMetrics.customersTotal = 0;
  previousMetrics.lowStockTotal = 0;
  previousMetrics.inventoryValue = 0;
  previousMetrics.revenueValue = 0;
  previousMetrics.profitValue = 0;
  previousMetrics.doneOrders = 0;
  previousMetrics.pendingOrders = 0;
  previousMetrics.processingOrders = 0;

  refreshAll();
}

window.clearAllRackTrackData = clearAllRackTrackData;

/* =========================
   MINI GRAPH SYSTEM
========================= */
const graphState = {
  revenueGraph: [],
  expenseGraph: [],
  customerGraph: [],
  orderGraph: []
};

function drawGraph(id, data) {
  const svg = document.getElementById(id);
  if (!svg) return;

  const poly = svg.querySelector("polyline");
  if (!poly || !data.length) return;

  const w = 120;
  const h = 40;
  const pad = 5;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  poly.setAttribute("points", points.join(" "));
}

function animateGraph(id, fromData, toData, duration = 700) {
  const start = performance.now();
  const maxLen = Math.max(fromData.length, toData.length);

  const safeFrom = [...fromData];
  const safeTo = [...toData];

  while (safeFrom.length < maxLen) safeFrom.unshift(safeFrom[0] ?? 0);
  while (safeTo.length < maxLen) safeTo.unshift(safeTo[0] ?? 0);

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    const current = safeTo.map((target, index) => {
      const begin = safeFrom[index] ?? 0;
      return begin + (target - begin) * eased;
    });

    drawGraph(id, current);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      graphState[id] = [...safeTo];
    }
  }

  requestAnimationFrame(frame);
}

function generateTrend(value) {
  const base = Number(value) || 0;

  if (base <= 0) {
    return [2, 3, 2, 4, 3, 5, 4];
  }

  return [
    base * 0.45,
    base * 0.62,
    base * 0.58,
    base * 0.76,
    base * 0.70,
    base * 0.88,
    base
  ].map(num => Number(num.toFixed(2)));
}

function updateSingleGraph(id, value) {
  const newTrend = generateTrend(value);
  const oldTrend = graphState[id]?.length
    ? graphState[id]
    : newTrend.map(v => Number((v * 0.7).toFixed(2)));

  animateGraph(id, oldTrend, newTrend, 800);
}

function updateGraphs() {
  const profit = state.inventory.reduce((sum, item) => {
    return sum + calculateProfit(item.cost, item.srp, item.quantity);
  }, 0);

  const expenses = state.inventory.reduce((sum, item) => {
    return sum + calculateExpenses(item.cost, item.quantity);
  }, 0);

  const customers = state.customers.length;
  const orders = state.orders.length;

  updateSingleGraph("revenueGraph", profit);
  updateSingleGraph("expenseGraph", expenses);
  updateSingleGraph("customerGraph", customers);
  updateSingleGraph("orderGraph", orders);
}


document.addEventListener("DOMContentLoaded", () => {
  const introOverlay = document.getElementById("intro-overlay");

  if (introOverlay) {
    setTimeout(() => {
      introOverlay.style.pointerEvents = "none";
      introOverlay.style.opacity = "0";
      introOverlay.style.visibility = "hidden";
      introOverlay.style.display = "none";
    }, 3300);
  }

  const isDashboardPage = document.getElementById("appShell");

  if (isDashboardPage) {
    setupEvents();
    setupLogoutEvents();
    switchInventoryTab("items");
    refreshAll();
  }
});

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

function movementClass(movementType) {
  const normalized = String(movementType || "").toLowerCase();
  if (normalized === "stock in") return "stock-in";
  if (normalized === "pull out") return "pull-out";
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

function renderStockHistoryTable() {
  const tbody = document.getElementById("stockHistoryTableBody");
  if (!tbody) return;

  if (!state.stockHistory.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No stock movement history yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.stockHistory.map(entry => `
    <tr>
      <td class="history-date">${formatHistoryDate(entry.createdAt)}</td>
      <td class="history-time">${formatHistoryTime(entry.createdAt)}</td>
      <td>${escapeHtml(entry.productName || "-")}</td>
      <td>${escapeHtml(entry.sku || "-")}</td>
      <td>${renderCategoryBadge(entry.category || "")}</td>
      <td>${Number(entry.oldQuantity) || 0}</td>
      <td>${Number(entry.newQuantity) || 0}</td>
      <td class="history-diff ${differenceClass(entry.difference)}">
        ${formatDifference(entry.difference)}
      </td>
      <td>
        <span class="movement-pill ${movementClass(entry.movementType)}">
          ${escapeHtml(entry.movementType || "No Change")}
        </span>
      </td>
      <td class="note-cell">${escapeHtml(entry.note || "-")}</td>
    </tr>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const passwordStrengthFill = document.getElementById("passwordStrengthFill");
  const passwordHint = document.getElementById("passwordHint");

  const checkUpper = document.getElementById("checkUpper");
  const checkNumbers = document.getElementById("checkNumbers");
  const checkSymbols = document.getElementById("checkSymbols");

  const confirmPasswordMessage = document.getElementById("confirmPasswordMessage");

  const togglePassword = document.getElementById("togglePassword");
  const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

  if (!passwordInput || !confirmPasswordInput || !passwordStrengthFill) return;

  function validatePassword(password) {
    const hasUppercase = /[A-Z]/.test(password);
    const numberCount = (password.match(/\d/g) || []).length;
    const hasThreeNumbers = numberCount >= 3;
    const noSymbols = /^[A-Za-z0-9]*$/.test(password);

    let score = 0;
    if (hasUppercase) score++;
    if (hasThreeNumbers) score++;
    if (noSymbols && password.length > 0) score++;

    return {
      hasUppercase,
      hasThreeNumbers,
      noSymbols,
      score
    };
  }

  function updateChecklist(result) {
    if (checkUpper) {
      checkUpper.classList.toggle("valid", result.hasUppercase);
      checkUpper.classList.toggle("invalid", !result.hasUppercase);
    }

    if (checkNumbers) {
      checkNumbers.classList.toggle("valid", result.hasThreeNumbers);
      checkNumbers.classList.toggle("invalid", !result.hasThreeNumbers);
    }

    if (checkSymbols) {
      checkSymbols.classList.toggle("valid", result.noSymbols);
      checkSymbols.classList.toggle("invalid", !result.noSymbols);
    }
  }

  function updateStrengthMeter(password) {
    const result = validatePassword(password);
    updateChecklist(result);

    if (!password.length) {
      passwordStrengthFill.style.width = "0%";
      passwordStrengthFill.style.background = "#d9d9d9";
      if (passwordHint) {
        passwordHint.textContent = "Use at least 1 uppercase and 3 numbers. No symbols.";
      }
      return;
    }

    if (result.score === 1) {
      passwordStrengthFill.style.width = "33%";
      passwordStrengthFill.style.background = "#c94848";
      if (passwordHint) passwordHint.textContent = "Weak password";
    } else if (result.score === 2) {
      passwordStrengthFill.style.width = "66%";
      passwordStrengthFill.style.background = "#f2b14c";
      if (passwordHint) passwordHint.textContent = "Medium password";
    } else {
      passwordStrengthFill.style.width = "100%";
      passwordStrengthFill.style.background = "#2f8d46";
      if (passwordHint) passwordHint.textContent = "Strong password";
    }
  }

  function updateConfirmPassword() {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!confirmPassword.length) {
      confirmPasswordMessage.textContent = "";
      confirmPasswordMessage.className = "";
      return;
    }

    if (password === confirmPassword) {
      confirmPasswordMessage.textContent = "Passwords match";
      confirmPasswordMessage.className = "match";
    } else {
      confirmPasswordMessage.textContent = "Passwords do not match";
      confirmPasswordMessage.className = "no-match";
    }
  }

  function toggleVisibility(input, button) {
    if (!input || !button) return;

    button.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      button.textContent = isPassword ? "🙈" : "👁";
    });
  }

  passwordInput.addEventListener("input", () => {
    updateStrengthMeter(passwordInput.value);
    updateConfirmPassword();
  });

  confirmPasswordInput.addEventListener("input", updateConfirmPassword);

  toggleVisibility(passwordInput, togglePassword);
  toggleVisibility(confirmPasswordInput, toggleConfirmPassword);
});