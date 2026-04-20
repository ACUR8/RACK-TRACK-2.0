(function () {
  const {
    state,
    registerPanel,
    renderImageCell,
    renderCategoryBadge,
    peso,
    escapeHtml,
    addSaleRecord,
    addStockHistoryEntry,
    saveData,
    refreshAll
  } = window.RackTrack || {};

  if (!state) {
    console.warn("RackTrack state is not available.");
    return;
  }

  const LOW_STOCK_THRESHOLD = 5;
  const COMPLETED_ROWS_PER_PAGE = 10;
  const ACTIVE_SECTION_KEY = "racktrack_active_section";

  const STORAGE_KEYS = {
    sales: "racktrack_sales",
    salesHistory: "racktrack_sales_history",
    inventory: "racktrack_inventory",
    stockHistory: "racktrack_stock_history",
    posDocuments: "racktrack_pos_documents",
    posCart: "racktrack_pos_cart",
    posActiveView: "racktrack_pos_active_view",
    posSelectedTransaction: "racktrack_pos_selected_transaction"
  };

  const posFilters = {
    search: "",
    category: "all",
    date: "",
    latestOnly: true
  };

  const shopFilters = {
    search: "",
    category: "all"
  };

  const tablePagerState = {
    completedTransactions: {
      page: 1,
      pageSize: COMPLETED_ROWS_PER_PAGE
    }
  };

  const BARCODE_SCAN = {
    enabled: true,
    buffer: "",
    lastTime: 0,
    timeoutMs: 120,
    minLength: 3
  };

  function html(value) {
    return typeof escapeHtml === "function"
      ? escapeHtml(String(value ?? ""))
      : String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
  }

  function formatPeso(value) {
    return typeof peso === "function"
      ? peso(Number(value) || 0)
      : `₱${(Number(value) || 0).toFixed(2)}`;
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function safeValue(value, fallback = "-") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function createId(prefix) {
    const stamp = Date.now();
    const rand = Math.floor(Math.random() * 100000);
    return `${prefix}-${stamp}-${rand}`;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function pad3(value) {
    return String(value).padStart(3, "0");
  }

  function generateCompletedTransactionId() {
    const now = new Date();
    const datePart = [
      now.getFullYear(),
      pad2(now.getMonth() + 1),
      pad2(now.getDate())
    ].join("");

    const timePart = [
      pad2(now.getHours()),
      pad2(now.getMinutes()),
      pad2(now.getSeconds())
    ].join("");

    const randomPart = pad3(Math.floor(Math.random() * 1000));
    return `CT-${datePart}-${timePart}-${randomPart}`;
  }

  function getNowISO() {
    return new Date().toISOString();
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getDateOnly(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate())
    ].join("-");
  }

  function safeParseArray(rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function safeParseObject(rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function getStockHistoryRecords() {
    const memoryStockHistory = Array.isArray(state.stockHistory) ? state.stockHistory : [];
    const storageStockHistory = safeParseArray(localStorage.getItem(STORAGE_KEYS.stockHistory));

    const merged = dedupeRecords([
      ...memoryStockHistory,
      ...storageStockHistory
    ]).sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    state.stockHistory = merged.slice();

    try {
      localStorage.setItem(STORAGE_KEYS.stockHistory, JSON.stringify(merged));
    } catch (error) {
      console.warn("Unable to persist stock history state:", error);
    }

    return merged;
  }

  function isSoldMovement(entry = {}) {
    const movementType = normalizeText(
      entry.movementType ||
      entry.type ||
      entry.action ||
      entry.status
    );

    return movementType === "sold" || movementType === "sale";
  }

  function createRecoveredSaleId(entry = {}) {
    return String(
      entry.id ||
      `recovered-sale-${entry.completedTransactionId || entry.transactionId || "no-tx"}-${
        entry.inventoryId || entry.itemId || entry.productId || entry.sku || "no-item"
      }-${entry.createdAt || Date.now()}-${entry.quantity || entry.quantitySold || entry.sold || 0}`
    );
  }

  function setLastActiveSection(sectionId = "pos-section") {
    try {
      localStorage.setItem(ACTIVE_SECTION_KEY, sectionId);
    } catch (error) {
      console.warn("Unable to persist active section:", error);
    }
  }

  function dedupeRecords(records) {
    const map = new Map();

    records.forEach(record => {
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

  function persistSalesState() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.sales,
        JSON.stringify(Array.isArray(state.sales) ? state.sales : [])
      );
      localStorage.setItem(
        STORAGE_KEYS.salesHistory,
        JSON.stringify(Array.isArray(state.salesHistory) ? state.salesHistory : [])
      );
    } catch (error) {
      console.warn("Unable to persist sales state:", error);
    }
  }

  function persistPosState() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.posDocuments,
        JSON.stringify(Array.isArray(state.posDocuments) ? state.posDocuments : [])
      );
      localStorage.setItem(
        STORAGE_KEYS.posCart,
        JSON.stringify(Array.isArray(state.posCart) ? state.posCart : [])
      );
      localStorage.setItem(
        STORAGE_KEYS.posActiveView,
        String(state.posActiveView || "completed")
      );

      if (state.posSelectedTransaction) {
        localStorage.setItem(
          STORAGE_KEYS.posSelectedTransaction,
          JSON.stringify(state.posSelectedTransaction)
        );
      } else {
        localStorage.removeItem(STORAGE_KEYS.posSelectedTransaction);
      }
    } catch (error) {
      console.warn("Unable to persist POS state:", error);
    }
  }

  function getInventoryItems() {
    return Array.isArray(state.inventory) ? state.inventory : [];
  }

  function getProducts() {
    return Array.isArray(state.products) ? state.products : [];
  }

  function findInventoryMatch(source = {}) {
    const inventoryItems = getInventoryItems();
    const inventoryId = String(source.inventoryId || source.itemId || "").trim();
    const sku = normalizeText(source.sku);
    const productId = normalizeText(source.productId);
    const productName = normalizeText(source.productName || source.name);

    if (inventoryId) {
      const byId = inventoryItems.find(item => String(item.id) === inventoryId);
      if (byId) return byId;
    }

    if (sku) {
      const bySku = inventoryItems.find(item => normalizeText(item.sku) === sku);
      if (bySku) return bySku;
    }

    if (productId) {
      const byProductId = inventoryItems.find(item => normalizeText(item.productId) === productId);
      if (byProductId) return byProductId;
    }

    if (productName) {
      const byName = inventoryItems.find(
        item => normalizeText(item.productName || item.name) === productName
      );
      if (byName) return byName;
    }

    return null;
  }

  function rebuildSalesFromStockHistory(existingSales = []) {
    const stockHistory = getStockHistoryRecords();

    const recoveredSales = stockHistory
      .filter(isSoldMovement)
      .map(entry => {
        const quantity = Number(entry.quantity ?? entry.quantitySold ?? entry.sold) || 0;
        const inventoryMatch = findInventoryMatch(entry);

        const cost = Number(entry.cost ?? inventoryMatch?.cost) || 0;
        const srp = Number(entry.srp ?? inventoryMatch?.srp ?? inventoryMatch?.price) || 0;
        const totalRevenue =
          Number(entry.totalRevenue ?? entry.saleAmount ?? entry.totalSaleAmount) ||
          (srp * quantity);
        const totalProfit =
          Number(entry.totalProfit ?? entry.profitAmount) ||
          ((srp - cost) * quantity);

        const completedTransactionId =
          entry.completedTransactionId ||
          entry.transactionId ||
          entry.completedSaleId ||
          entry.saleGroupId ||
          generateCompletedTransactionId();

        return {
          id: createRecoveredSaleId(entry),
          completedTransactionId,
          transactionId:
            entry.transactionId ||
            entry.completedTransactionId ||
            entry.completedSaleId ||
            entry.saleGroupId ||
            completedTransactionId,
          inventoryId: entry.inventoryId || entry.itemId || inventoryMatch?.id || "",
          productId: entry.productId || inventoryMatch?.productId || "",
          productName: entry.productName || inventoryMatch?.productName || inventoryMatch?.name || "",
          customerName:
            entry.customerName ||
            entry.customer ||
            entry.customer_name ||
            entry.buyerName ||
            entry.clientName ||
            "-",
          customer:
            entry.customerName ||
            entry.customer ||
            entry.customer_name ||
            entry.buyerName ||
            entry.clientName ||
            "-",
          customer_name:
            entry.customerName ||
            entry.customer ||
            entry.customer_name ||
            entry.buyerName ||
            entry.clientName ||
            "-",
          buyerName:
            entry.customerName ||
            entry.customer ||
            entry.customer_name ||
            entry.buyerName ||
            entry.clientName ||
            "-",
          clientName:
            entry.customerName ||
            entry.customer ||
            entry.customer_name ||
            entry.buyerName ||
            entry.clientName ||
            "-",
          customerContact:
            entry.customerContact ||
            entry.contact ||
            entry.customerPhone ||
            entry.customerEmail ||
            "-",
          customerAddress: entry.customerAddress || entry.address || "-",
          invoiceNo: entry.invoiceNo || "-",
          receiptNo: entry.receiptNo || "-",
          sku: entry.sku || inventoryMatch?.sku || "",
          variant: entry.variant || formatAttributeLine({
            productName: entry.productName || inventoryMatch?.productName || inventoryMatch?.name,
            color: entry.color || inventoryMatch?.color,
            size: entry.size || inventoryMatch?.size,
            material: entry.material || inventoryMatch?.material,
            category: entry.category || inventoryMatch?.category
          }),
          size: entry.size || inventoryMatch?.size || "",
          color: entry.color || inventoryMatch?.color || "",
          material: entry.material || inventoryMatch?.material || "",
          category: entry.category || inventoryMatch?.category || "",
          imageData: entry.imageData || entry.image || inventoryMatch?.imageData || inventoryMatch?.image || "",
          image: entry.image || entry.imageData || inventoryMatch?.image || inventoryMatch?.imageData || "",
          quantity,
          quantitySold: quantity,
          sold: quantity,
          cost,
          srp,
          saleAmount: totalRevenue,
          totalSaleAmount: totalRevenue,
          totalRevenue,
          totalProfit,
          profitAmount: totalProfit,
          oldQty: Number(entry.oldQty ?? entry.oldQuantity) || 0,
          newQty: Number(entry.newQty ?? entry.newQuantity) || 0,
          oldQuantity: Number(entry.oldQuantity ?? entry.oldQty) || 0,
          newQuantity: Number(entry.newQuantity ?? entry.newQty) || 0,
          discount: Number(entry.discount) || 0,
          amountPaid: Number(entry.amountPaid ?? entry.paidAmount ?? 0) || 0,
          change: Number(entry.change ?? entry.changeAmount ?? 0) || 0,
          note: entry.note || "Recovered from stock history",
          status: "Completed",
          soldAt: entry.createdAt || getNowISO(),
          createdAt: entry.createdAt || getNowISO()
        };
      });

    return dedupeRecords([
      ...recoveredSales,
      ...(Array.isArray(existingSales) ? existingSales : [])
    ]).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });
  }

  function hydrateSalesFromStorage() {
    const storageSales = safeParseArray(localStorage.getItem(STORAGE_KEYS.sales));
    const storageSalesHistory = safeParseArray(localStorage.getItem(STORAGE_KEYS.salesHistory));

    const mergedSales = Array.isArray(state.sales) ? state.sales.slice() : [];
    const mergedHistory = Array.isArray(state.salesHistory) ? state.salesHistory.slice() : [];

    storageSales.forEach(item => mergedSales.push(item));
    storageSalesHistory.forEach(item => mergedHistory.push(item));

    const unifiedFromSales = dedupeRecords([...mergedHistory, ...mergedSales]).sort((a, b) => {
      const dateA = new Date(a.createdAt || a.soldAt || 0).getTime();
      const dateB = new Date(b.createdAt || b.soldAt || 0).getTime();
      return dateB - dateA;
    });

    const recoveredUnified = rebuildSalesFromStockHistory(unifiedFromSales);

    state.sales = recoveredUnified.slice();
    state.salesHistory = recoveredUnified.slice();

    persistSalesState();
  }

  function hydratePosState() {
    const storageSales = safeParseArray(localStorage.getItem(STORAGE_KEYS.sales));
    const storageSalesHistory = safeParseArray(localStorage.getItem(STORAGE_KEYS.salesHistory));

    const inMemorySales = Array.isArray(state.sales) ? state.sales : [];
    const inMemorySalesHistory = Array.isArray(state.salesHistory) ? state.salesHistory : [];

    const mergedSales = dedupeRecords([
      ...inMemorySales,
      ...inMemorySalesHistory,
      ...storageSales,
      ...storageSalesHistory
    ]).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });

    const recoveredSales = rebuildSalesFromStockHistory(mergedSales);

    state.sales = recoveredSales.slice();
    state.salesHistory = recoveredSales.slice();

    const storedActiveView = localStorage.getItem(STORAGE_KEYS.posActiveView);
    state.posActiveView = storedActiveView || state.posActiveView || "completed";

    const storedCart = safeParseArray(localStorage.getItem(STORAGE_KEYS.posCart));
    state.posCart = Array.isArray(state.posCart) && state.posCart.length
      ? state.posCart
      : storedCart;

    const storedDocuments = safeParseArray(localStorage.getItem(STORAGE_KEYS.posDocuments));
    state.posDocuments = Array.isArray(state.posDocuments) && state.posDocuments.length
      ? state.posDocuments
      : storedDocuments;

    state.posLastPreviewDocument = state.posLastPreviewDocument || null;
    state.posCheckoutLocked = false;
    state.posDocReturnToTransaction = false;

    const storedSelectedTransaction = safeParseObject(
      localStorage.getItem(STORAGE_KEYS.posSelectedTransaction)
    );

    state.posSelectedTransaction = state.posSelectedTransaction || storedSelectedTransaction || null;

    persistSalesState();
    persistPosState();
  }

  function getSales() {
    hydrateSalesFromStorage();

    const combined = dedupeRecords([
      ...(Array.isArray(state.salesHistory) ? state.salesHistory : []),
      ...(Array.isArray(state.sales) ? state.sales : [])
    ]).sort((a, b) => {
      const dateA = new Date(a.createdAt || a.soldAt || 0).getTime();
      const dateB = new Date(b.createdAt || b.soldAt || 0).getTime();
      return dateB - dateA;
    });

    state.sales = combined.slice();
    state.salesHistory = combined.slice();

    persistSalesState();
    return combined;
  }

  function getSellableInventoryItems() {
    return getInventoryItems().filter(item => (Number(item.quantity) || 0) > 0);
  }

  function getStockStatusInfo(stock) {
    const qty = Number(stock) || 0;

    if (qty <= 0) {
      return {
        label: "Out of Stock",
        className: "out-stock"
      };
    }

    if (qty <= LOW_STOCK_THRESHOLD) {
      return {
        label: `Low Stock (${qty})`,
        className: "low-stock"
      };
    }

    return {
      label: `In Stock (${qty})`,
      className: "in-stock"
    };
  }

  function formatAttributeLine(source = {}) {
    const parts = [
      source.productName || source.name || "-",
      source.color || "-",
      source.size || "-",
      source.material || "-",
      source.category || "-"
    ];

    return parts.map(part => String(part || "-").trim() || "-").join(" - ");
  }

  function ensureToastWrap() {
    let wrap = document.getElementById("posToastWrap");

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "posToastWrap";
      wrap.className = "pos-toast-wrap";
      document.body.appendChild(wrap);
    }

    return wrap;
  }

  function showToast(message, type = "success") {
    const wrap = ensureToastWrap();
    const toast = document.createElement("div");
    toast.className = `pos-toast ${type}`;
    toast.textContent = message;
    wrap.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2800);
  }

  function showCompletedTransactionNotification(transactionId) {
    showToast(`Successful transaction. ${transactionId} has been saved.`, "success");
  }

  function setCheckoutButtonState(isLocked) {
    state.posCheckoutLocked = !!isLocked;
    const checkoutBtn = document.getElementById("posCheckoutBtn");
    if (!checkoutBtn) return;

    checkoutBtn.disabled = !!isLocked;
    checkoutBtn.textContent = isLocked ? "Processing..." : "Checkout";
  }

  function isVoidedSale(sale = {}) {
    const status = normalizeText(sale.status);
    return status === "voided" || !!sale.isVoided || !!sale.voidedAt;
  }

  function normalizeSaleRecord(sale = {}) {
    const linkedSource = findInventoryMatch(sale);
    const quantity = Number(sale.quantity ?? sale.quantitySold ?? sale.sold) || 0;
    const cost = Number(sale.cost ?? linkedSource?.cost) || 0;
    const srp = Number(sale.srp ?? sale.price ?? linkedSource?.srp ?? linkedSource?.price) || 0;
    const totalRevenue =
      Number(sale.totalRevenue ?? sale.totalSaleAmount ?? sale.saleAmount) || (srp * quantity);
    const totalProfit =
      Number(sale.totalProfit ?? sale.profitAmount) || ((srp - cost) * quantity);

    return {
      ...sale,
      resolvedProductId: safeValue(sale.productId || linkedSource?.productId),
      resolvedProductName: safeValue(
        sale.productName || sale.name || linkedSource?.productName || linkedSource?.name
      ),
      resolvedCustomerName: safeValue(
        sale.customerName ||
          sale.customer ||
          sale.customer_name ||
          sale.buyerName ||
          sale.clientName
      ),
      resolvedSku: safeValue(sale.sku || linkedSource?.sku),
      resolvedVariant: safeValue(
        sale.variant ||
          formatAttributeLine({
            productName: sale.productName || linkedSource?.productName || linkedSource?.name,
            color: sale.color || linkedSource?.color,
            size: sale.size || linkedSource?.size,
            material: sale.material || linkedSource?.material,
            category: sale.category || linkedSource?.category
          })
      ),
      resolvedCategory: safeValue(sale.category || linkedSource?.category),
      resolvedImageData:
        sale.imageData ||
        sale.image ||
        linkedSource?.imageData ||
        linkedSource?.image ||
        "",
      resolvedCost: cost,
      resolvedSrp: srp,
      resolvedQuantity: quantity,
      resolvedTotalRevenue: totalRevenue,
      resolvedTotalProfit: totalProfit,
      resolvedCreatedAt: sale.createdAt || sale.soldAt || "",
      resolvedCompletedTransactionId: safeValue(
        sale.completedTransactionId ||
          sale.transactionId ||
          sale.completedSaleId ||
          sale.saleGroupId,
        "-"
      ),
      isVoidedResolved: isVoidedSale(sale)
    };
  }

  function resolveSaleImage(sale) {
    const normalized = normalizeSaleRecord(sale);
    return normalized.resolvedImageData || "";
  }

  function renderSaleImageCell(sale) {
    const normalized = normalizeSaleRecord(sale);
    const resolvedImage = resolveSaleImage(normalized);

    if (typeof renderImageCell === "function") {
      return renderImageCell(resolvedImage, normalized.resolvedProductName || "Product");
    }

    if (resolvedImage) {
      return `<img src="${html(resolvedImage)}" alt="${html(normalized.resolvedProductName || "")}" class="product-thumb" />`;
    }

    return `<div class="no-image-box">No Image</div>`;
  }

  function buildPosRows() {
    return getSales()
      .slice()
      .map(normalizeSaleRecord)
      .filter(row => !row.isVoidedResolved)
      .sort((a, b) => {
        const dateA = new Date(a.resolvedCreatedAt || 0).getTime();
        const dateB = new Date(b.resolvedCreatedAt || 0).getTime();
        return dateB - dateA;
      });
  }

  function getUniqueCategories(items, accessor) {
    const set = new Set();
    items.forEach(item => {
      const category = String(accessor(item) || "").trim();
      if (category && category !== "-") set.add(category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function getTransactionKey(sale = {}) {
    if (
      sale.completedTransactionId ||
      sale.transactionId ||
      sale.completedSaleId ||
      sale.saleGroupId
    ) {
      return `completed:${
        sale.completedTransactionId ||
        sale.transactionId ||
        sale.completedSaleId ||
        sale.saleGroupId
      }`;
    }
    if (sale.receiptNo) return `receipt:${sale.receiptNo}`;
    if (sale.invoiceNo) return `invoice:${sale.invoiceNo}`;
    if (sale.orderNo) return `order:${sale.orderNo}`;

    const createdAt = sale.createdAt || sale.soldAt || "";
    const customer =
      sale.customerName ||
      sale.customer ||
      sale.customer_name ||
      sale.buyerName ||
      sale.clientName ||
      "";
    return `fallback:${customer}__${createdAt}`;
  }

  function getTransactionGroupForSale(sale = {}) {
    const key = getTransactionKey(sale);
    return getSales()
      .slice()
      .map(normalizeSaleRecord)
      .filter(row => !row.isVoidedResolved)
      .filter(row => getTransactionKey(row) === key)
      .sort((a, b) => {
        const nameCompare = String(a.resolvedProductName || "").localeCompare(
          String(b.resolvedProductName || "")
        );
        if (nameCompare !== 0) return nameCompare;
        return String(a.resolvedSku || "").localeCompare(String(b.resolvedSku || ""));
      });
  }

  function getDistinctValues(items, accessor) {
    const map = new Map();

    items.forEach(item => {
      const value = String(accessor(item) || "").trim();
      if (!value || value === "-") return;

      const key = normalizeText(value);
      if (!map.has(key)) {
        map.set(key, value);
      }
    });

    return Array.from(map.values());
  }

  function buildTransactionSummary(sale = {}) {
    const items = Array.isArray(sale.items) ? sale.items : getTransactionGroupForSale(sale);
    const normalizedItems = items.map(item => normalizeSaleRecord(item));
    const first = normalizedItems[0] || normalizeSaleRecord(sale);

    const subtotal = normalizedItems.reduce(
      (sum, item) =>
        sum + (Number(item.resolvedSrp) || 0) * (Number(item.resolvedQuantity) || 0),
      0
    );
    const totalRevenue = normalizedItems.reduce(
      (sum, item) => sum + (Number(item.resolvedTotalRevenue) || 0),
      0
    );
    const totalProfit = normalizedItems.reduce(
      (sum, item) => sum + (Number(item.resolvedTotalProfit) || 0),
      0
    );
    const totalQty = normalizedItems.reduce(
      (sum, item) => sum + (Number(item.resolvedQuantity) || 0),
      0
    );
    const itemCount = normalizedItems.length;

    const paidValue =
      Number(first.amountPaid ?? first.paidAmount ?? first.amount_paid ?? 0) || 0;

    const discountValue =
      Number(
        first.discount ??
          first.discountAmount ??
          first.discount_amount ??
          Math.max(0, subtotal - totalRevenue)
      ) || 0;

    const total = Math.max(0, subtotal - discountValue);
    const paid = paidValue > 0 ? paidValue : total;
    const changeValue =
      Number(
        first.change ??
          first.changeAmount ??
          first.change_amount ??
          Math.max(0, paid - total)
      ) || Math.max(0, paid - total);

    const uniqueProducts = getDistinctValues(normalizedItems, item => item.resolvedProductName);
    const uniqueCategories = getDistinctValues(normalizedItems, item => item.resolvedCategory);
    const primaryItem = normalizedItems[0] || first;

    let displayProductName = primaryItem?.resolvedProductName || "-";
    let displaySku = primaryItem?.resolvedSku || "-";
    let displayVariant = primaryItem?.resolvedVariant || "-";
    let displayCategory = primaryItem?.resolvedCategory || "-";

    if (itemCount > 1) {
      displayProductName = `${primaryItem?.resolvedProductName || "Transaction"} +${
        itemCount - 1
      } more item${itemCount - 1 > 1 ? "s" : ""}`;
      displaySku = "Multiple Items";
      displayVariant = `${itemCount} items in this transaction`;
      displayCategory =
        uniqueCategories.length === 1 ? uniqueCategories[0] : "Mixed Categories";
    }

    return {
      key: getTransactionKey(first),
      completedTransactionId: safeValue(
        first.completedTransactionId || first.transactionId || first.resolvedCompletedTransactionId,
        "-"
      ),
      createdAt: first.resolvedCreatedAt || first.createdAt || first.soldAt || "",
      receiptNo: safeValue(first.receiptNo),
      invoiceNo: safeValue(first.invoiceNo),
      customerName: first.resolvedCustomerName,
      customerContact: safeValue(
        first.customerContact || first.contact || first.customerPhone || first.customerEmail
      ),
      customerAddress: safeValue(first.customerAddress || first.address),
      note: safeValue(first.note),
      paymentStatus: safeValue(first.status || "Completed"),
      items: normalizedItems,
      subtotal,
      discount: discountValue,
      total,
      paid,
      change: changeValue,
      totalRevenue,
      totalProfit,
      totalQty,
      itemCount,
      uniqueProducts,
      uniqueCategories,
      primaryImageData: primaryItem?.resolvedImageData || "",
      primaryProductId: primaryItem?.resolvedProductId || "-",
      displayProductName,
      displaySku,
      displayVariant,
      displayCategory,
      multipleItemsLabel: itemCount > 1 ? `Multiple Items (${itemCount})` : "Single Item"
    };
  }

  function buildCompletedTransactionRows() {
    const grouped = new Map();

    buildPosRows().forEach(sale => {
      const key = getTransactionKey(sale);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(sale);
    });

    return Array.from(grouped.values())
      .map(group => buildTransactionSummary({ items: group, ...group[0] }))
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
  }

  function getLatestTransactionDate(rows) {
    if (!Array.isArray(rows) || !rows.length) return "";
    const latest = rows[0];
    return getDateOnly(latest.createdAt);
  }

  function renderCompletedTransactionImageCell(transaction) {
    const imageSource = transaction.primaryImageData || "";
    const altText = transaction.displayProductName || "Transaction Item";

    if (typeof renderImageCell === "function") {
      return renderImageCell(imageSource, altText);
    }

    if (imageSource) {
      return `<img src="${html(imageSource)}" alt="${html(altText)}" class="product-thumb" />`;
    }

    return `<div class="no-image-box">No Image</div>`;
  }

  function paginateRows(rows, pager) {
    const totalRows = rows.length;
    const pageSize = Number(pager.pageSize) || COMPLETED_ROWS_PER_PAGE;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    let page = Number(pager.page) || 1;

    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    pager.page = page;

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    return {
      page,
      pageSize,
      totalRows,
      totalPages,
      startIndex,
      rows: rows.slice(startIndex, endIndex)
    };
  }

  function ensureCompletedPaginationWrap() {
    let wrap = document.getElementById("posCompletedPagination");

    if (wrap) return wrap;

    const table = document.getElementById("posTableBody");
    if (!table) return null;

    const tableElement = table.closest("table");
    if (!tableElement || !tableElement.parentElement) return null;

    wrap = document.createElement("div");
    wrap.id = "posCompletedPagination";
    wrap.className = "table-pagination";

    tableElement.parentElement.insertAdjacentElement("afterend", wrap);
    return wrap;
  }

  function renderCompletedPagination(totalRows) {
    const wrap = ensureCompletedPaginationWrap();
    if (!wrap) return;

    const pager = tablePagerState.completedTransactions;
    const pageSize = Number(pager.pageSize) || COMPLETED_ROWS_PER_PAGE;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const currentPage = Math.min(Math.max(1, pager.page), totalPages);

    pager.page = currentPage;

    if (totalRows <= 0) {
      wrap.innerHTML = "";
      return;
    }

    let pageButtons = "";

    for (let i = 1; i <= totalPages; i += 1) {
      pageButtons += `
        <button
          type="button"
          class="pagination-btn ${i === currentPage ? "active" : ""}"
          data-page="${i}"
        >
          ${i}
        </button>
      `;
    }

    wrap.innerHTML = `
      <div class="pagination-left">
        <span class="pagination-text">
          Showing ${Math.min((currentPage - 1) * pageSize + 1, totalRows)}-${Math.min(
      currentPage * pageSize,
      totalRows
    )} of ${totalRows}
        </span>
      </div>

      <div class="pagination-right">
        <button
          type="button"
          class="pagination-btn"
          data-page="${currentPage - 1}"
          ${currentPage <= 1 ? "disabled" : ""}
        >
          Prev
        </button>

        ${pageButtons}

        <button
          type="button"
          class="pagination-btn"
          data-page="${currentPage + 1}"
          ${currentPage >= totalPages ? "disabled" : ""}
        >
          Next
        </button>
      </div>
    `;
  }

  function syncCompletedDateControls(allRows) {
    const dateInput = document.getElementById("posDateFilter");
    const latestBtn = document.getElementById("posLatestBtn");
    const latestDate = getLatestTransactionDate(allRows);

    if (dateInput) {
      if (posFilters.latestOnly && latestDate) {
        posFilters.date = latestDate;
        dateInput.value = latestDate;
      } else {
        dateInput.value = posFilters.date || "";
      }

      if (latestDate) {
        dateInput.max = latestDate;
      }
    }

    if (latestBtn) {
      latestBtn.classList.toggle("active", !!posFilters.latestOnly);
    }
  }

  function renderPosTable() {
    const tbody = document.getElementById("posTableBody");
    const categorySort = document.getElementById("posCategorySort");
    if (!tbody) return;

    const allRows = buildCompletedTransactionRows();
    const latestDate = getLatestTransactionDate(allRows);

    if (posFilters.latestOnly && latestDate) {
      posFilters.date = latestDate;
    }

    syncCompletedDateControls(allRows);

    const filteredRows = allRows.filter(row => {
      const matchesSearch =
        !normalizeText(posFilters.search) ||
        [
          row.completedTransactionId,
          row.primaryProductId,
          row.displayProductName,
          row.customerName,
          row.displaySku,
          row.displayVariant,
          row.displayCategory,
          row.receiptNo,
          row.invoiceNo,
          row.multipleItemsLabel,
          row.uniqueProducts.join(" "),
          row.uniqueCategories.join(" ")
        ].some(value => normalizeText(value).includes(normalizeText(posFilters.search)));

      const matchesCategory =
        normalizeText(posFilters.category) === "all" ||
        normalizeText(row.displayCategory) === normalizeText(posFilters.category) ||
        row.uniqueCategories.some(cat => normalizeText(cat) === normalizeText(posFilters.category));

      const rowDate = getDateOnly(row.createdAt);
      const matchesDate = !posFilters.date || rowDate === posFilters.date;

      return matchesSearch && matchesCategory && matchesDate;
    });

    if (categorySort) {
      const categories = getUniqueCategories(
        allRows.flatMap(row => row.uniqueCategories.map(cat => ({ category: cat }))),
        row => row.category
      );

      categorySort.innerHTML = `
        <option value="all">All Categories</option>
        ${categories
          .map(
            cat => `
          <option value="${html(cat)}" ${
              normalizeText(posFilters.category) === normalizeText(cat) ? "selected" : ""
            }>
            ${html(cat)}
          </option>
        `
          )
          .join("")}
      `;
    }

    const paginated = paginateRows(filteredRows, tablePagerState.completedTransactions);

    if (!paginated.rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="empty-state">No completed POS records found for the selected date.</td>
        </tr>
      `;
      renderCompletedPagination(0);
      return;
    }

    tbody.innerHTML = paginated.rows
      .map(transaction => {
        return `
        <tr
          class="pos-clickable-row"
          data-transaction-key="${html(transaction.key)}"
          title="Click to view transaction details"
        >
          <td>${renderCompletedTransactionImageCell(transaction)}</td>
          <td>
            <div class="pos-transaction-id-cell">
              <strong>${html(transaction.completedTransactionId)}</strong>
              <div class="pos-sub-date">${html(formatDateTime(transaction.createdAt))}</div>
            </div>
          </td>
          <td>${html(transaction.primaryProductId)}</td>
          <td>
            <div>${html(transaction.displayProductName)}</div>
            ${
              transaction.itemCount > 1
                ? `<div class="pos-multi-item-indicator">Contains ${transaction.itemCount} items</div>`
                : ``
            }
          </td>
          <td>${html(transaction.customerName)}</td>
          <td>${html(transaction.displaySku)}</td>
          <td class="pos-variant-cell">${html(transaction.displayVariant)}</td>
          <td>${
            typeof renderCategoryBadge === "function"
              ? renderCategoryBadge(transaction.displayCategory)
              : html(transaction.displayCategory)
          }</td>
          <td class="pos-qty-cell">${transaction.totalQty}</td>
          <td class="pos-money-cell">${formatPeso(transaction.totalRevenue)}</td>
          <td class="pos-money-cell">${formatPeso(transaction.totalProfit)}</td>
          <td>
            ${
              transaction.itemCount > 1
                ? `<span class="pos-transaction-badge">${html(transaction.multipleItemsLabel)}</span>`
                : `<span class="pos-transaction-badge soft">Single Item</span>`
            }
          </td>
        </tr>
      `;
      })
      .join("");

    renderCompletedPagination(filteredRows.length);
  }

  function getCartItemIndex(inventoryId) {
    return state.posCart.findIndex(item => String(item.inventoryId) === String(inventoryId));
  }

  function getCartItems() {
    return Array.isArray(state.posCart) ? state.posCart : [];
  }

  function getCartValues() {
    const discountInput = document.getElementById("posCartDiscount");
    const paidInput = document.getElementById("posCartPaid");

    const subtotal = getCartItems().reduce(
      (sum, item) => sum + (Number(item.srp) || 0) * (Number(item.quantity) || 0),
      0
    );

    const discount = Math.max(0, Number(discountInput?.value) || 0);
    const total = Math.max(0, subtotal - discount);
    const paid = Math.max(0, Number(paidInput?.value) || 0);
    const change = Math.max(0, paid - total);

    return {
      subtotal,
      discount,
      total,
      paid,
      change
    };
  }

  function renderShopCategoryOptions() {
    const posShopCategorySort = document.getElementById("posShopCategorySort");
    if (!posShopCategorySort) return;

    const categories = getUniqueCategories(getSellableInventoryItems(), item => item.category);
    posShopCategorySort.innerHTML = `
      <option value="all">All Categories</option>
      ${categories
        .map(
          cat => `
        <option value="${html(cat)}" ${
            normalizeText(shopFilters.category) === normalizeText(cat) ? "selected" : ""
          }>
          ${html(cat)}
        </option>
      `
        )
        .join("")}
    `;
  }

  function renderProductGrid() {
    const grid = document.getElementById("posProductGrid");
    if (!grid) return;

    renderShopCategoryOptions();

    const items = getSellableInventoryItems()
      .filter(item => {
        const search = normalizeText(shopFilters.search);
        const category = normalizeText(shopFilters.category);

        const matchesSearch =
          !search ||
          [
            item.productId,
            item.productName,
            item.name,
            item.sku,
            item.color,
            item.size,
            item.material,
            item.category,
            item.barcode,
            item.barCode,
            item.bar_code,
            item.code
          ].some(value => normalizeText(value).includes(search));

        const matchesCategory =
          category === "all" || normalizeText(item.category) === category;

        return matchesSearch && matchesCategory;
      })
      .sort((a, b) =>
        String(a.productName || a.name || "").localeCompare(
          String(b.productName || b.name || "")
        )
      );

    if (!items.length) {
      grid.innerHTML = `<div class="empty-state">No sellable items available.</div>`;
      return;
    }

    grid.innerHTML = items
      .map(item => {
        const imageSource = item.imageData || item.image || "";
        const stock = Number(item.quantity) || 0;
        const stockInfo = getStockStatusInfo(stock);
        const displayBarcode =
          item.barcode || item.barCode || item.bar_code || item.code || "";

        return `
        <article class="pos-product-card">
          <div class="pos-product-image">
            ${
              imageSource
                ? `<img src="${html(imageSource)}" alt="${html(
                    item.productName || item.name || "Product"
                  )}" />`
                : `<div class="pos-product-no-image">No Image</div>`
            }
          </div>

          <div class="pos-product-body">
            <div class="pos-product-title">${html(item.productName || item.name || "-")}</div>
            <div class="pos-product-sub">Product ID: ${html(item.productId || "-")}</div>
            <div class="pos-product-sub">
              ${html(`${safeValue(item.color)} • ${safeValue(item.size)} • ${safeValue(item.material)}`)}
            </div>

            <div class="pos-product-row">
              <div class="pos-product-price">${formatPeso(item.srp || item.price)}</div>
              <div class="pos-stock-chip ${stockInfo.className}">
                ${html(stockInfo.label)}
              </div>
            </div>

            <div class="pos-product-sku">SKU: ${html(item.sku || "-")}</div>
            ${
              displayBarcode
                ? `<div class="pos-product-sku">Barcode: ${html(displayBarcode)}</div>`
                : ``
            }

            <div class="pos-product-actions">
              <input
                type="number"
                min="1"
                max="${stock}"
                value="1"
                class="pos-card-qty-input"
                data-inventory-id="${html(item.id)}"
              />
              <button
                type="button"
                class="pos-add-to-cart-btn"
                data-add-cart="${html(item.id)}"
              >
                Add
              </button>
            </div>
          </div>
        </article>
      `;
      })
      .join("");
  }

  function renderCart() {
    const wrap = document.getElementById("posCartItems");
    const subtotalEl = document.getElementById("posSummarySubtotal");
    const discountEl = document.getElementById("posSummaryDiscount");
    const totalEl = document.getElementById("posSummaryTotal");
    const paidEl = document.getElementById("posSummaryPaid");
    const changeEl = document.getElementById("posSummaryChange");

    if (!wrap) return;

    const items = getCartItems();
    const totals = getCartValues();

    if (!items.length) {
      wrap.innerHTML = `<div class="empty-state">No items added yet.</div>`;
    } else {
      wrap.innerHTML = items
        .map(
          item => `
        <div class="pos-cart-item">
          <div class="pos-cart-item-top">
            <div class="pos-cart-item-image">
              ${
                item.imageData
                  ? `<img src="${html(item.imageData)}" alt="${html(item.productName)}" />`
                  : `<div class="pos-product-no-image">No Image</div>`
              }
            </div>

            <div class="pos-cart-item-main">
              <div class="pos-cart-item-title">${html(item.productName)}</div>
              <div class="pos-cart-item-sub">Product ID: ${html(item.productId || "-")}</div>
              <div class="pos-cart-item-sub">${html(item.variant)}</div>
              <div class="pos-cart-item-sub">SKU: ${html(item.sku || "-")}</div>
              <div class="pos-cart-item-price">${formatPeso(item.srp)} each</div>
            </div>
          </div>

          <div class="pos-cart-item-bottom">
            <div class="pos-cart-qty-wrap">
              <button type="button" class="pos-cart-qty-btn" data-cart-minus="${html(
                item.inventoryId
              )}">−</button>
              <input
                type="number"
                min="1"
                max="${Number(item.availableStock) || 1}"
                value="${Number(item.quantity) || 1}"
                class="pos-cart-qty-input"
                data-cart-qty="${html(item.inventoryId)}"
              />
              <button type="button" class="pos-cart-qty-btn" data-cart-plus="${html(
                item.inventoryId
              )}">+</button>
            </div>

            <div>
              <div class="pos-cart-item-price">${formatPeso(
                (Number(item.srp) || 0) * (Number(item.quantity) || 0)
              )}</div>
              <button type="button" class="pos-cart-remove-btn" data-cart-remove="${html(
                item.inventoryId
              )}">
                Remove
              </button>
            </div>
          </div>
        </div>
      `
        )
        .join("");
    }

    if (subtotalEl) subtotalEl.textContent = formatPeso(totals.subtotal);
    if (discountEl) discountEl.textContent = formatPeso(totals.discount);
    if (totalEl) totalEl.textContent = formatPeso(totals.total);
    if (paidEl) paidEl.textContent = formatPeso(totals.paid);
    if (changeEl) changeEl.textContent = formatPeso(totals.change);
  }

  function addToCartByInventoryId(inventoryId, quantity) {
    const item = getInventoryItems().find(entry => String(entry.id) === String(inventoryId));
    if (!item) {
      showToast("Item not found.", "error");
      return;
    }

    const availableStock = Number(item.quantity) || 0;
    if (availableStock <= 0) {
      showToast("This item is out of stock.", "error");
      return;
    }

    let qty = Number(quantity) || 1;
    if (!Number.isFinite(qty) || qty < 1) qty = 1;

    const existingIndex = getCartItemIndex(inventoryId);
    const existingQty =
      existingIndex >= 0 ? Number(state.posCart[existingIndex].quantity) || 0 : 0;
    const totalRequested = existingQty + qty;

    if (totalRequested > availableStock) {
      showToast(
        `Only ${availableStock} available for ${item.productName || item.name || "this item"}.`,
        "error"
      );
      return;
    }

    if (existingIndex >= 0) {
      state.posCart[existingIndex].quantity = totalRequested;
      state.posCart[existingIndex].availableStock = availableStock;
      showToast("Item quantity updated in cart.", "success");
    } else {
      state.posCart.push({
        inventoryId: item.id,
        productId: item.productId || "",
        productName: item.productName || item.name || "Product",
        sku: item.sku || "",
        barcode: item.barcode || item.barCode || item.bar_code || item.code || "",
        color: item.color || "",
        size: item.size || "",
        material: item.material || "",
        category: item.category || "",
        imageData: item.imageData || item.image || "",
        variant: formatAttributeLine(item),
        cost: Number(item.cost) || 0,
        srp: Number(item.srp || item.price) || 0,
        quantity: qty,
        availableStock
      });
      showToast("Item added to cart.", "success");
    }

    renderCart();
    persistPosState();
  }

  function updateCartQty(inventoryId, nextQty) {
    const index = getCartItemIndex(inventoryId);
    if (index < 0) return;

    const source = getInventoryItems().find(entry => String(entry.id) === String(inventoryId));
    const availableStock = Number(source?.quantity) || 0;

    if (availableStock <= 0) {
      state.posCart.splice(index, 1);
      renderCart();
      persistPosState();
      showToast("Item is no longer available.", "warning");
      return;
    }

    let qty = Number(nextQty);

    if (!Number.isFinite(qty)) {
      qty = Number(state.posCart[index].quantity) || 1;
    }

    if (qty <= 0) {
      state.posCart.splice(index, 1);
      renderCart();
      persistPosState();
      showToast("Item removed from cart.", "success");
      return;
    }

    if (qty > availableStock) {
      showToast(`Only ${availableStock} available for this item.`, "warning");
      renderCart();
      return;
    }

    state.posCart[index].quantity = qty;
    state.posCart[index].availableStock = availableStock;

    renderCart();
    persistPosState();
  }

  function removeCartItem(inventoryId) {
    state.posCart = getCartItems().filter(
      item => String(item.inventoryId) !== String(inventoryId)
    );
    renderCart();
    persistPosState();
    showToast("Item removed from cart.", "success");
  }

  function clearCart() {
    state.posCart = [];
    renderCart();
    persistPosState();
  }

  function resetCheckoutForm() {
    const customerNameEl = document.getElementById("posCartCustomerName");
    const customerContactEl = document.getElementById("posCartCustomerContact");
    const customerAddressEl = document.getElementById("posCartCustomerAddress");
    const discountEl = document.getElementById("posCartDiscount");
    const paidEl = document.getElementById("posCartPaid");
    const noteEl = document.getElementById("posCartNote");

    state.posCart = [];

    if (customerNameEl) customerNameEl.value = "";
    if (customerContactEl) customerContactEl.value = "";
    if (customerAddressEl) customerAddressEl.value = "";
    if (discountEl) discountEl.value = "0";
    if (paidEl) paidEl.value = "0";
    if (noteEl) noteEl.value = "";

    renderCart();
    persistPosState();
  }

  function getCustomerInfo() {
    return {
      name: String(document.getElementById("posCartCustomerName")?.value || "").trim(),
      contact: String(document.getElementById("posCartCustomerContact")?.value || "").trim(),
      address: String(document.getElementById("posCartCustomerAddress")?.value || "").trim(),
      note: String(document.getElementById("posCartNote")?.value || "").trim()
    };
  }

  function buildDocumentPayload(type) {
    const customer = getCustomerInfo();
    const totals = getCartValues();
    const items = getCartItems().map(item => ({
      ...item,
      lineTotal: (Number(item.srp) || 0) * (Number(item.quantity) || 0)
    }));

    return {
      id: createId(type),
      type,
      createdAt: getNowISO(),
      documentNo: `${type === "quotation" ? "QT" : type === "invoice" ? "INV" : "RCPT"}-${Date.now()}`,
      customer,
      items,
      totals
    };
  }

  function buildDocumentFromTransaction(transaction, type) {
    if (!transaction || !Array.isArray(transaction.items)) return null;

    return {
      id: createId(type),
      type,
      createdAt: transaction.createdAt || getNowISO(),
      documentNo:
        type === "quotation"
          ? `QT-${Date.now()}`
          : type === "invoice"
            ? safeValue(transaction.invoiceNo, `INV-${Date.now()}`)
            : safeValue(transaction.receiptNo, `RCPT-${Date.now()}`),
      customer: {
        name: transaction.customerName || "-",
        contact: transaction.customerContact || "-",
        address: transaction.customerAddress || "-",
        note: transaction.note || "-"
      },
      items: transaction.items.map(item => ({
        productId: item.resolvedProductId || item.productId || "-",
        productName: item.resolvedProductName || item.productName || "-",
        sku: item.resolvedSku || item.sku || "-",
        variant: item.resolvedVariant || item.variant || "-",
        srp: Number(item.resolvedSrp ?? item.srp) || 0,
        quantity: Number(item.resolvedQuantity ?? item.quantity) || 0,
        lineTotal:
          (Number(item.resolvedSrp ?? item.srp) || 0) *
          (Number(item.resolvedQuantity ?? item.quantity) || 0)
      })),
      totals: {
        subtotal: Number(transaction.subtotal) || 0,
        discount: Number(transaction.discount) || 0,
        total: Number(transaction.total) || 0,
        paid: Number(transaction.paid) || 0,
        change: Number(transaction.change) || 0
      }
    };
  }

  function getDocumentHtml(doc) {
    return `
      <div class="pos-print-sheet">
        <div class="pos-print-brand">
          <div>
            <h1>Rack Track</h1>
            <p>Inventory, POS, Quotation, Invoice, and Receipt</p>
            <p>Generated on ${html(formatDateTime(doc.createdAt))}</p>
          </div>
          <div class="pos-print-doc-title">
            <strong>${html(doc.type.toUpperCase())}</strong>
            <span>No. ${html(doc.documentNo)}</span>
          </div>
        </div>

        <div class="pos-print-meta">
          <div class="pos-print-card">
            <h4>Document Info</h4>
            <p><strong>Type:</strong> ${html(doc.type)}</p>
            <p><strong>Number:</strong> ${html(doc.documentNo)}</p>
            <p><strong>Date:</strong> ${html(formatDateTime(doc.createdAt))}</p>
          </div>

          <div class="pos-print-card">
            <h4>Business Info</h4>
            <p><strong>Store:</strong> Rack Track</p>
            <p><strong>Prepared By:</strong> Admin</p>
            <p><strong>Status:</strong> ${
              doc.type === "quotation"
                ? "Estimated"
                : doc.type === "invoice"
                  ? "Billable"
                  : "Paid"
            }</p>
          </div>
        </div>

        <div class="pos-print-customer">
          <div class="pos-print-card">
            <h4>Customer Details</h4>
            <p><strong>Name:</strong> ${html(doc.customer.name || "-")}</p>
            <p><strong>Contact:</strong> ${html(doc.customer.contact || "-")}</p>
            <p><strong>Address:</strong> ${html(doc.customer.address || "-")}</p>
          </div>

          <div class="pos-print-card">
            <h4>Notes</h4>
            <p>${html(doc.customer.note || "-")}</p>
          </div>
        </div>

        <table class="pos-print-table">
          <thead>
            <tr>
              <th>Product ID</th>
              <th>Product</th>
              <th>SKU</th>
              <th>Variant</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${doc.items
              .map(
                item => `
              <tr>
                <td>${html(item.productId || "-")}</td>
                <td>${html(item.productName)}</td>
                <td>${html(item.sku || "-")}</td>
                <td>${html(item.variant || "-")}</td>
                <td>${formatPeso(item.srp)}</td>
                <td>${Number(item.quantity) || 0}</td>
                <td>${formatPeso(item.lineTotal)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>

        <div class="pos-print-summary">
          <div class="pos-print-summary-row">
            <span>Subtotal</span>
            <strong>${formatPeso(doc.totals.subtotal)}</strong>
          </div>
          <div class="pos-print-summary-row">
            <span>Discount</span>
            <strong>${formatPeso(doc.totals.discount)}</strong>
          </div>
          <div class="pos-print-summary-row total">
            <span>Total</span>
            <strong>${formatPeso(doc.totals.total)}</strong>
          </div>
          <div class="pos-print-summary-row">
            <span>Amount Paid</span>
            <strong>${formatPeso(doc.totals.paid)}</strong>
          </div>
          <div class="pos-print-summary-row">
            <span>Change</span>
            <strong>${formatPeso(doc.totals.change)}</strong>
          </div>
        </div>

        <div class="pos-print-footer">
          ${
            doc.type === "quotation"
              ? "This quotation is subject to stock availability and price validation."
              : doc.type === "invoice"
                ? "Please settle invoice payment based on the stated total amount."
                : "Thank you for your purchase. Please keep this receipt for your records."
          }
        </div>
      </div>
    `;
  }

  function closeDocModal() {
    const overlay = document.getElementById("posDocModalOverlay");
    if (!overlay) return;

    overlay.classList.remove("show");
    overlay.style.display = "none";

    if (state.posDocReturnToTransaction && state.posSelectedTransaction) {
      state.posDocReturnToTransaction = false;
      reopenTransactionModal();
    } else {
      state.posDocReturnToTransaction = false;
    }

    persistPosState();
  }

  function reopenTransactionModal() {
    const overlay = document.getElementById("posTransactionModalOverlay");
    if (!overlay || !state.posSelectedTransaction) return;
    overlay.classList.add("show");
  }

  function printDocument(doc, autoClose = false) {
    const printWindow = window.open("", "_blank", "width=960,height=800");
    if (!printWindow) {
      showToast("Popup blocked. Please allow popups for printing.", "warning");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${html(doc.type)} - ${html(doc.documentNo)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Poppins', sans-serif;
            padding: 28px;
            color: #1f2937;
          }
          .pos-print-sheet { font-family: 'Poppins', sans-serif; }
          .pos-print-brand {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            align-items: flex-start;
            margin-bottom: 18px;
          }
          .pos-print-brand h1 {
            margin: 0;
            font-size: 26px;
            color: #237a46;
          }
          .pos-print-brand p {
            margin: 6px 0 0;
            color: #64748b;
            font-size: 13px;
          }
          .pos-print-doc-title { text-align: right; }
          .pos-print-doc-title strong {
            display: block;
            font-size: 24px;
            color: #111827;
          }
          .pos-print-meta,
          .pos-print-customer {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
            margin: 18px 0;
          }
          .pos-print-card {
            border: 1px solid #e5ece7;
            border-radius: 18px;
            padding: 16px;
            background: #fbfcfb;
          }
          .pos-print-card h4 {
            margin: 0 0 10px;
            font-size: 14px;
            color: #237a46;
          }
          .pos-print-card p {
            margin: 5px 0;
            font-size: 13px;
          }
          .pos-print-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .pos-print-table th,
          .pos-print-table td {
            border-bottom: 1px solid #e5ece7;
            padding: 12px 10px;
            text-align: left;
            font-size: 13px;
          }
          .pos-print-table th {
            background: #f5f8f6;
            color: #334155;
          }
          .pos-print-summary {
            margin-top: 20px;
            margin-left: auto;
            width: 340px;
            border: 1px solid #e5ece7;
            border-radius: 18px;
            padding: 16px;
            background: #fbfcfb;
          }
          .pos-print-summary-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 7px 0;
            font-size: 13px;
          }
          .pos-print-summary-row.total {
            border-top: 1px dashed #d7ded9;
            margin-top: 8px;
            padding-top: 12px;
            font-size: 16px;
            font-weight: 800;
          }
          .pos-print-footer {
            margin-top: 24px;
            border-top: 1px dashed #d7ded9;
            padding-top: 16px;
            color: #64748b;
            font-size: 12px;
            text-align: center;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        ${getDocumentHtml(doc)}
        <script>
          window.onload = function () {
            window.print();
            ${
              autoClose
                ? `
              setTimeout(function () {
                window.close();
              }, 700);
            `
                : ``
            }
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  function showDocumentPreview(doc, options = {}) {
    const overlay = document.getElementById("posDocModalOverlay");
    const title = document.getElementById("posDocModalTitle");
    const body = document.getElementById("posDocModalBody");
    const closeBtn = document.getElementById("posDocCloseBtn");
    const closeFooterBtn = document.getElementById("posDocCloseFooterBtn");
    const printBtn = document.getElementById("posDocPrintBtn");

    if (!overlay || !title || !body || !closeBtn || !closeFooterBtn || !printBtn) {
      console.error("Receipt preview modal elements not found.");
      showToast("Receipt created but preview modal is missing.", "warning");
      return;
    }

    title.textContent =
      options.title || `${doc.type.charAt(0).toUpperCase() + doc.type.slice(1)} Preview`;
    body.innerHTML = getDocumentHtml(doc);

    state.posLastPreviewDocument = doc;
    state.posDocReturnToTransaction = !!options.returnToTransaction;

    overlay.style.display = "flex";
    overlay.classList.add("show");

    closeBtn.onclick = closeDocModal;
    closeFooterBtn.onclick = closeDocModal;

    printBtn.onclick = function () {
      printDocument(doc);
    };

    persistPosState();
  }

  function openDocumentPreview(type) {
    if (!getCartItems().length) {
      showToast("Add at least one item first.", "warning");
      return;
    }

    const customer = getCustomerInfo();
    if (!customer.name) {
      showToast("Customer name is required.", "warning");
      return;
    }

    const doc = buildDocumentPayload(type);
    showDocumentPreview(doc, {
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Preview`,
      returnToTransaction: false
    });
  }

  function openSavedTransactionDocument(type) {
    if (!state.posSelectedTransaction) {
      showToast("No transaction selected.", "warning");
      return;
    }

    const doc = buildDocumentFromTransaction(state.posSelectedTransaction, type);
    if (!doc) {
      showToast("Unable to build document preview.", "error");
      return;
    }

    const transactionOverlay = document.getElementById("posTransactionModalOverlay");
    if (transactionOverlay) {
      transactionOverlay.classList.remove("show");
    }

    requestAnimationFrame(() => {
      showDocumentPreview(doc, {
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Preview`,
        returnToTransaction: true
      });
    });
  }

  function buildTransactionDetailHtml(transaction) {
    if (!transaction) {
      return `<div class="empty-state">No transaction selected.</div>`;
    }

    return `
      <div class="pos-transaction-sheet">
        <div class="pos-transaction-head">
          <div>
            <h3>Sale Transaction Details</h3>
            <p>${html(formatDateTime(transaction.createdAt))}</p>
          </div>

          <div class="pos-transaction-badges">
            <span class="pos-transaction-badge">${html(transaction.paymentStatus)}</span>
            <span class="pos-transaction-badge soft">Items: ${transaction.itemCount}</span>
            <span class="pos-transaction-badge soft">Qty: ${transaction.totalQty}</span>
          </div>
        </div>

        <div class="pos-transaction-grid">
          <div class="pos-transaction-box">
            <h4>Customer Details</h4>
            <p><strong>Name:</strong> ${html(transaction.customerName)}</p>
            <p><strong>Contact:</strong> ${html(transaction.customerContact)}</p>
            <p><strong>Address:</strong> ${html(transaction.customerAddress)}</p>
          </div>

          <div class="pos-transaction-box">
            <h4>Transaction Info</h4>
            <p><strong>Completed Transaction ID:</strong> ${html(transaction.completedTransactionId)}</p>
            <p><strong>Receipt No:</strong> ${html(transaction.receiptNo)}</p>
            <p><strong>Invoice No:</strong> ${html(transaction.invoiceNo)}</p>
            <p><strong>Note:</strong> ${html(transaction.note)}</p>
          </div>
        </div>

        <div class="pos-transaction-table-wrap">
          <table class="pos-transaction-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product ID</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Variant</th>
                <th>Category</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Revenue</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              ${transaction.items
                .map(
                  item => `
                <tr>
                  <td>${renderSaleImageCell(item)}</td>
                  <td>${html(item.resolvedProductId)}</td>
                  <td>${html(item.resolvedProductName)}</td>
                  <td>${html(item.resolvedSku)}</td>
                  <td class="pos-variant-cell">${html(item.resolvedVariant)}</td>
                  <td>${
                    typeof renderCategoryBadge === "function"
                      ? renderCategoryBadge(item.resolvedCategory)
                      : html(item.resolvedCategory)
                  }</td>
                  <td>${formatPeso(item.resolvedSrp)}</td>
                  <td>${Number(item.resolvedQuantity) || 0}</td>
                  <td>${formatPeso(item.resolvedTotalRevenue)}</td>
                  <td>${formatPeso(item.resolvedTotalProfit)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div class="pos-transaction-summary">
          <div class="pos-transaction-summary-row">
            <span>Subtotal</span>
            <strong>${formatPeso(transaction.subtotal)}</strong>
          </div>
          <div class="pos-transaction-summary-row">
            <span>Discount</span>
            <strong>${formatPeso(transaction.discount)}</strong>
          </div>
          <div class="pos-transaction-summary-row total">
            <span>Total</span>
            <strong>${formatPeso(transaction.total)}</strong>
          </div>
          <div class="pos-transaction-summary-row">
            <span>Paid</span>
            <strong>${formatPeso(transaction.paid)}</strong>
          </div>
          <div class="pos-transaction-summary-row">
            <span>Change</span>
            <strong>${formatPeso(transaction.change)}</strong>
          </div>
          <div class="pos-transaction-summary-row">
            <span>Total Revenue</span>
            <strong>${formatPeso(transaction.totalRevenue)}</strong>
          </div>
          <div class="pos-transaction-summary-row">
            <span>Total Profit</span>
            <strong>${formatPeso(transaction.totalProfit)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function openTransactionModalBySale(saleOrTransaction) {
    if (!saleOrTransaction) return;

    const overlay = document.getElementById("posTransactionModalOverlay");
    const body = document.getElementById("posTransactionModalBody");
    const title = document.getElementById("posTransactionModalTitle");

    if (!overlay || !body || !title) {
      console.warn("Transaction modal HTML is missing.");
      return;
    }

    const transaction = Array.isArray(saleOrTransaction.items)
      ? saleOrTransaction
      : buildTransactionSummary(saleOrTransaction);

    state.posSelectedTransaction = transaction;
    persistPosState();

    title.textContent = `Transaction - ${
      transaction.completedTransactionId !== "-"
        ? transaction.completedTransactionId
        : transaction.receiptNo
    }`;
    body.innerHTML = buildTransactionDetailHtml(transaction);
    overlay.classList.add("show");
  }

  function closeTransactionModal() {
    const overlay = document.getElementById("posTransactionModalOverlay");
    if (overlay) {
      overlay.classList.remove("show");
    }
  }

  function insertSaleIntoState(sale) {
    state.sales = Array.isArray(state.sales) ? state.sales : [];
    state.salesHistory = Array.isArray(state.salesHistory) ? state.salesHistory : [];

    const existsInSales = state.sales.some(
      entry => String(entry.id || "") === String(sale.id || "")
    );
    if (!existsInSales) {
      state.sales.unshift(sale);
    }

    const existsInSalesHistory = state.salesHistory.some(
      entry => String(entry.id || "") === String(sale.id || "")
    );
    if (!existsInSalesHistory) {
      state.salesHistory.unshift(sale);
    }

    const unified = dedupeRecords([...state.salesHistory, ...state.sales]).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });

    state.sales = unified.slice();
    state.salesHistory = unified.slice();
    persistSalesState();
  }

  function saveCompletedTransactionImmediately(sale) {
    if (!sale || typeof sale !== "object") return;

    state.sales = Array.isArray(state.sales) ? state.sales : [];
    state.salesHistory = Array.isArray(state.salesHistory) ? state.salesHistory : [];

    const merged = dedupeRecords([
      sale,
      ...state.sales,
      ...state.salesHistory
    ]).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });

    state.sales = merged.slice();
    state.salesHistory = merged.slice();

    persistSalesState();
  }

  function saveAllCompletedTransactionsImmediately(sales) {
    if (!Array.isArray(sales) || !sales.length) return;

    state.sales = Array.isArray(state.sales) ? state.sales : [];
    state.salesHistory = Array.isArray(state.salesHistory) ? state.salesHistory : [];

    const merged = dedupeRecords([
      ...sales,
      ...state.sales,
      ...state.salesHistory
    ]).sort((a, b) => {
      const aTime = new Date(a.createdAt || a.soldAt || 0).getTime();
      const bTime = new Date(b.createdAt || b.soldAt || 0).getTime();
      return bTime - aTime;
    });

    state.sales = merged.slice();
    state.salesHistory = merged.slice();

    persistSalesState();
  }

  function validateCheckoutBeforeSave(items, customer, totals) {
    if (!items.length) {
      showToast("Cart is empty.", "warning");
      return false;
    }

    if (!customer.name) {
      showToast("Customer name is required.", "warning");
      return false;
    }

    if (totals.paid < totals.total) {
      showToast("Amount paid is less than total.", "warning");
      return false;
    }

    for (const cartItem of items) {
      const inventoryItem = getInventoryItems().find(
        entry => String(entry.id) === String(cartItem.inventoryId)
      );

      if (!inventoryItem) {
        showToast(`Inventory item missing for ${cartItem.productName}.`, "error");
        return false;
      }

      const availableStock = Number(inventoryItem.quantity) || 0;
      const requestedQty = Number(cartItem.quantity) || 0;

      if (requestedQty <= 0) {
        showToast(`Invalid quantity for ${cartItem.productName}.`, "error");
        return false;
      }

      if (requestedQty > availableStock) {
        showToast(`Not enough stock for ${cartItem.productName}.`, "error");
        return false;
      }
    }

    return true;
  }

  function buildReceiptDocumentFromCheckout(items, customer, totals, createdAt) {
    return {
      id: createId("receipt"),
      type: "receipt",
      createdAt,
      documentNo: `RCPT-${Date.now()}`,
      customer,
      items: items.map(item => ({
        productId: item.productId || "-",
        productName: item.productName || "-",
        sku: item.sku || "-",
        variant: item.variant || "-",
        srp: Number(item.srp) || 0,
        quantity: Number(item.quantity) || 0,
        lineTotal: (Number(item.srp) || 0) * (Number(item.quantity) || 0)
      })),
      totals: {
        subtotal: Number(totals.subtotal) || 0,
        discount: Number(totals.discount) || 0,
        total: Number(totals.total) || 0,
        paid: Number(totals.paid) || 0,
        change: Number(totals.change) || 0
      }
    };
  }

  function checkoutCart() {
    if (state.posCheckoutLocked) return;

    const items = getCartItems().map(item => ({ ...item }));
    const customer = getCustomerInfo();
    const totals = getCartValues();

    if (!validateCheckoutBeforeSave(items, customer, totals)) {
      return;
    }

    const createdAt = getNowISO();
    const completedTransactionId = generateCompletedTransactionId();
    const invoiceNo = `INV-${Date.now()}`;
    const receiptDoc = buildReceiptDocumentFromCheckout(items, customer, totals, createdAt);
    const receiptNo = receiptDoc.documentNo;

    const createdSales = [];
    const inventoryRollback = [];

    try {
      setCheckoutButtonState(true);

      for (const cartItem of items) {
        const inventoryItem = getInventoryItems().find(
          entry => String(entry.id) === String(cartItem.inventoryId)
        );

        if (!inventoryItem) {
          throw new Error(`Inventory item missing for ${cartItem.productName}.`);
        }

        const oldQty = Number(inventoryItem.quantity) || 0;
        const soldQty = Number(cartItem.quantity) || 0;

        if (soldQty <= 0) {
          throw new Error(`Invalid quantity for ${cartItem.productName}.`);
        }

        if (soldQty > oldQty) {
          throw new Error(`Not enough stock for ${cartItem.productName}.`);
        }

        const newQty = oldQty - soldQty;
        const cost = Number(cartItem.cost) || 0;
        const srp = Number(cartItem.srp) || 0;
        const totalRevenue = srp * soldQty;
        const totalProfit = (srp - cost) * soldQty;

        inventoryRollback.push({
          inventoryId: inventoryItem.id,
          oldQty
        });

        inventoryItem.quantity = newQty;
        inventoryItem.updatedAt = createdAt;

        const payload = {
          id: createId("sale"),
          completedTransactionId,
          transactionId: completedTransactionId,
          inventoryId: inventoryItem.id,
          productId: inventoryItem.productId || cartItem.productId || "",
          productName:
            inventoryItem.productName || inventoryItem.name || cartItem.productName || "",
          customerName: customer.name,
          customer: customer.name,
          customer_name: customer.name,
          buyerName: customer.name,
          clientName: customer.name,
          customerContact: customer.contact,
          customerAddress: customer.address,
          invoiceNo,
          receiptNo,
          sku: inventoryItem.sku || cartItem.sku || "",
          barcode: inventoryItem.barcode || inventoryItem.barCode || inventoryItem.bar_code || inventoryItem.code || "",
          variant: formatAttributeLine({
            productName:
              inventoryItem.productName || inventoryItem.name || cartItem.productName || "",
            color: inventoryItem.color || cartItem.color || "",
            size: inventoryItem.size || cartItem.size || "",
            material: inventoryItem.material || cartItem.material || "",
            category: inventoryItem.category || cartItem.category || ""
          }),
          size: inventoryItem.size || cartItem.size || "",
          color: inventoryItem.color || cartItem.color || "",
          material: inventoryItem.material || cartItem.material || "",
          category: inventoryItem.category || cartItem.category || "",
          imageData: inventoryItem.imageData || inventoryItem.image || cartItem.imageData || "",
          image: inventoryItem.image || inventoryItem.imageData || cartItem.imageData || "",
          quantity: soldQty,
          quantitySold: soldQty,
          sold: soldQty,
          cost,
          srp,
          saleAmount: totalRevenue,
          totalSaleAmount: totalRevenue,
          totalRevenue,
          totalProfit,
          profitAmount: totalProfit,
          oldQty,
          newQty,
          oldQuantity: oldQty,
          newQuantity: newQty,
          discount: totals.discount,
          amountPaid: totals.paid,
          change: totals.change,
          note: customer.note || `Sold ${soldQty} item(s)`,
          status: "Completed",
          soldAt: createdAt,
          createdAt
        };

        createdSales.push(payload);

        if (typeof addStockHistoryEntry === "function") {
          addStockHistoryEntry({
            itemId: inventoryItem.id,
            inventoryId: inventoryItem.id,
            productId: inventoryItem.productId || cartItem.productId || "",
            productName:
              inventoryItem.productName || inventoryItem.name || cartItem.productName || "",
            sku: inventoryItem.sku || cartItem.sku || "",
            barcode: inventoryItem.barcode || inventoryItem.barCode || inventoryItem.bar_code || inventoryItem.code || "",
            category: inventoryItem.category || cartItem.category || "",
            size: inventoryItem.size || cartItem.size || "",
            color: inventoryItem.color || cartItem.color || "",
            material: inventoryItem.material || cartItem.material || "",
            customerName: customer.name,
            customer: customer.name,
            oldQuantity: oldQty,
            newQuantity: newQty,
            oldQty,
            newQty,
            movementType: "Sold",
            note: customer.note || `Sold ${soldQty} item(s)`,
            saleAmount: totalRevenue,
            totalRevenue,
            totalProfit,
            profitAmount: totalProfit,
            quantity: soldQty,
            quantitySold: soldQty,
            sold: soldQty,
            completedTransactionId,
            transactionId: completedTransactionId,
            invoiceNo,
            receiptNo,
            createdAt
          });
        }

        if (typeof addSaleRecord === "function") {
          try {
            addSaleRecord(payload);
          } catch (error) {
            console.warn("addSaleRecord failed, using direct persistence instead:", error);
          }
        }

        saveCompletedTransactionImmediately(payload);
      }

      saveAllCompletedTransactionsImmediately(createdSales);

      state.posDocuments = Array.isArray(state.posDocuments) ? state.posDocuments : [];
      state.posDocuments.unshift(receiptDoc);

      persistSalesState();
      persistPosState();

      try {
        localStorage.setItem(STORAGE_KEYS.sales, JSON.stringify(state.sales || []));
        localStorage.setItem(STORAGE_KEYS.salesHistory, JSON.stringify(state.salesHistory || []));
        localStorage.setItem(STORAGE_KEYS.posDocuments, JSON.stringify(state.posDocuments || []));
        localStorage.setItem(
          STORAGE_KEYS.stockHistory,
          JSON.stringify(Array.isArray(state.stockHistory) ? state.stockHistory : [])
        );
      } catch (error) {
        console.warn("Unable to save checkout data to localStorage:", error);
      }

      if (typeof saveData === "function") {
        try { saveData("inventory"); } catch (error) { console.warn(error); }
        try { saveData("sales"); } catch (error) { console.warn(error); }
        try { saveData("salesHistory"); } catch (error) { console.warn(error); }
        try { saveData("stockHistory"); } catch (error) { console.warn(error); }
      }

      hydrateSalesFromStorage();

      showCompletedTransactionNotification(completedTransactionId);

      showDocumentPreview(receiptDoc, {
        title: "Receipt Preview",
        returnToTransaction: false
      });

      resetCheckoutForm();

      posFilters.search = "";
      posFilters.category = "all";
      posFilters.latestOnly = true;
      posFilters.date = getDateOnly(createdAt);
      tablePagerState.completedTransactions.page = 1;

      const posSearchInput = document.getElementById("posSearchInput");
      const posCategorySort = document.getElementById("posCategorySort");
      const posDateFilter = document.getElementById("posDateFilter");

      if (posSearchInput) posSearchInput.value = "";
      if (posCategorySort) posCategorySort.value = "all";
      if (posDateFilter) posDateFilter.value = posFilters.date;

      renderProductGrid();
      renderCart();
      renderPosTable();
      switchPosView("completed");

      if (typeof refreshAll === "function") {
        setTimeout(() => {
          refreshAll();
          renderPosTable();
        }, 30);
      }

      document.dispatchEvent(new CustomEvent("racktrack:pos-updated"));
    } catch (error) {
      console.error("Checkout error:", error);

      inventoryRollback.forEach(entry => {
        const inventoryItem = getInventoryItems().find(
          item => String(item.id) === String(entry.inventoryId)
        );
        if (inventoryItem) {
          inventoryItem.quantity = entry.oldQty;
        }
      });

      if (createdSales.length) {
        const createdIds = new Set(createdSales.map(item => String(item.id)));
        state.sales = (Array.isArray(state.sales) ? state.sales : []).filter(
          item => !createdIds.has(String(item.id))
        );
        state.salesHistory = (Array.isArray(state.salesHistory) ? state.salesHistory : []).filter(
          item => !createdIds.has(String(item.id))
        );
        persistSalesState();
      }

      if (typeof saveData === "function") {
        try { saveData("inventory"); } catch (saveError) { console.warn(saveError); }
      }

      showToast(error.message || "Checkout failed.", "error");
    } finally {
      setCheckoutButtonState(false);
    }
  }

  function switchPosView(view) {
    state.posActiveView = view === "shop" ? "shop" : "completed";

    const completedView = document.getElementById("pos-completed-view");
    const shopView = document.getElementById("pos-shop-view");
    const completedBtn = document.getElementById("posCompletedTabBtn");
    const shopBtn = document.getElementById("posShopTabBtn");

    if (completedView) {
      completedView.classList.toggle("active", state.posActiveView === "completed");
    }

    if (shopView) {
      shopView.classList.toggle("active", state.posActiveView === "shop");
    }

    if (completedBtn) {
      completedBtn.classList.toggle("active", state.posActiveView === "completed");
    }

    if (shopBtn) {
      shopBtn.classList.toggle("active", state.posActiveView === "shop");
    }

    persistPosState();
    setLastActiveSection("pos-section");
  }

  function normalizeBarcodeValue(value) {
    return String(value || "").trim();
  }

  function findInventoryByBarcode(scannedCode) {
    const code = normalizeText(scannedCode);
    if (!code) return null;

    return getInventoryItems().find(item => {
      const possibleCodes = [
        item.barcode,
        item.barCode,
        item.bar_code,
        item.productId,
        item.sku,
        item.code
      ]
        .map(value => normalizeText(value))
        .filter(Boolean);

      return possibleCodes.includes(code);
    }) || null;
  }

  function handleBarcodeScan(scannedCode) {
    const cleanCode = normalizeBarcodeValue(scannedCode);
    if (!cleanCode) return;

    const matchedItem = findInventoryByBarcode(cleanCode);

    if (!matchedItem) {
      showToast(`Scanned code not found: ${cleanCode}`, "warning");
      return;
    }

    addToCartByInventoryId(matchedItem.id, 1);

    if ((state.posActiveView || "completed") !== "shop") {
      switchPosView("shop");
    }

    renderCart();
    renderProductGrid();

    showToast(
      `${matchedItem.productName || matchedItem.name || "Product"} added to cart.`,
      "success"
    );
  }

  function resetBarcodeBuffer() {
    BARCODE_SCAN.buffer = "";
    BARCODE_SCAN.lastTime = 0;
  }

  function isEditableTarget(target) {
    if (!target) return false;

    const tagName = String(target.tagName || "").toLowerCase();
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      !!target.isContentEditable
    );
  }

  function bindBarcodeScannerEvents() {
    if (document.body && document.body.dataset.barcodeScannerBound === "true") return;
    if (document.body) {
      document.body.dataset.barcodeScannerBound = "true";
    }

    document.addEventListener("keydown", function (event) {
      if (!BARCODE_SCAN.enabled) return;

      const activeElement = document.activeElement;
      if (isEditableTarget(activeElement)) return;

      const key = event.key || "";
      const now = Date.now();
      const gap = now - BARCODE_SCAN.lastTime;

      if (gap > BARCODE_SCAN.timeoutMs) {
        BARCODE_SCAN.buffer = "";
      }

      BARCODE_SCAN.lastTime = now;

      if (key === "Enter") {
        const scanned = BARCODE_SCAN.buffer.trim();
        resetBarcodeBuffer();

        if (scanned.length >= BARCODE_SCAN.minLength) {
          handleBarcodeScan(scanned);
        }
        return;
      }

      if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" || key === "CapsLock" || key === "Tab") {
        return;
      }

      if (key === "Backspace") {
        BARCODE_SCAN.buffer = BARCODE_SCAN.buffer.slice(0, -1);
        return;
      }

      if (key.length === 1) {
        BARCODE_SCAN.buffer += key;
      }
    });
  }

  function bindProductGridEvents() {
    const grid = document.getElementById("posProductGrid");
    if (!grid || grid.dataset.bound === "true") return;

    grid.dataset.bound = "true";

    grid.addEventListener("click", function (event) {
      const addBtn = event.target.closest("[data-add-cart]");
      if (!addBtn) return;

      const inventoryId = addBtn.getAttribute("data-add-cart") || "";
      if (!inventoryId) return;

      let qtyInput = null;

      try {
        qtyInput = grid.querySelector(
          `.pos-card-qty-input[data-inventory-id="${CSS.escape(inventoryId)}"]`
        );
      } catch (error) {
        qtyInput = grid.querySelector(
          `.pos-card-qty-input[data-inventory-id="${inventoryId}"]`
        );
      }

      const qty = Number(qtyInput?.value) || 1;
      addToCartByInventoryId(inventoryId, qty);
    });
  }

  function bindCartEvents() {
    const cartWrap = document.getElementById("posCartItems");
    if (!cartWrap || cartWrap.dataset.bound === "true") return;

    cartWrap.dataset.bound = "true";

    cartWrap.addEventListener("click", function (event) {
      const minusBtn = event.target.closest("[data-cart-minus]");
      if (minusBtn) {
        const id = minusBtn.getAttribute("data-cart-minus") || "";
        const item = getCartItems().find(entry => String(entry.inventoryId) === String(id));
        updateCartQty(id, (Number(item?.quantity) || 1) - 1);
        return;
      }

      const plusBtn = event.target.closest("[data-cart-plus]");
      if (plusBtn) {
        const id = plusBtn.getAttribute("data-cart-plus") || "";
        const item = getCartItems().find(entry => String(entry.inventoryId) === String(id));
        updateCartQty(id, (Number(item?.quantity) || 1) + 1);
        return;
      }

      const removeBtn = event.target.closest("[data-cart-remove]");
      if (removeBtn) {
        const id = removeBtn.getAttribute("data-cart-remove") || "";
        removeCartItem(id);
      }
    });

    cartWrap.addEventListener("input", function (event) {
      const qtyInput = event.target.closest("[data-cart-qty]");
      if (!qtyInput) return;

      const id = qtyInput.getAttribute("data-cart-qty") || "";
      updateCartQty(id, qtyInput.value);
    });
  }

  function bindCompletedTableEvents() {
    const tbody = document.getElementById("posTableBody");
    if (!tbody || tbody.dataset.bound === "true") return;

    tbody.dataset.bound = "true";

    tbody.addEventListener("click", function (event) {
      const row = event.target.closest("tr.pos-clickable-row");
      if (!row) return;

      const transactionKey = row.getAttribute("data-transaction-key") || "";
      const transaction = buildCompletedTransactionRows().find(item => item.key === transactionKey);

      if (!transaction) {
        showToast("Transaction details not found.", "warning");
        return;
      }

      openTransactionModalBySale(transaction);
    });
  }

  function bindCompletedPaginationEvents() {
    const wrap = ensureCompletedPaginationWrap();
    if (!wrap || wrap.dataset.bound === "true") return;

    wrap.dataset.bound = "true";

    wrap.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-page]");
      if (!btn || btn.disabled) return;

      const nextPage = Number(btn.getAttribute("data-page")) || 1;
      tablePagerState.completedTransactions.page = nextPage;
      renderPosTable();
    });
  }

  function bindTransactionModalEvents() {
    const overlay = document.getElementById("posTransactionModalOverlay");
    const closeBtn = document.getElementById("posTransactionCloseBtn");
    const closeFooterBtn = document.getElementById("posTransactionCloseFooterBtn");
    const quotationBtn = document.getElementById("posTransactionQuotationBtn");
    const invoiceBtn = document.getElementById("posTransactionInvoiceBtn");
    const receiptBtn = document.getElementById("posTransactionReceiptBtn");

    if (overlay && !overlay.dataset.bound) {
      overlay.dataset.bound = "true";
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          event.stopPropagation();
        }
      });
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", closeTransactionModal);
    }

    if (closeFooterBtn && !closeFooterBtn.dataset.bound) {
      closeFooterBtn.dataset.bound = "true";
      closeFooterBtn.addEventListener("click", closeTransactionModal);
    }

    if (quotationBtn && !quotationBtn.dataset.bound) {
      quotationBtn.dataset.bound = "true";
      quotationBtn.addEventListener("click", function () {
        openSavedTransactionDocument("quotation");
      });
    }

    if (invoiceBtn && !invoiceBtn.dataset.bound) {
      invoiceBtn.dataset.bound = "true";
      invoiceBtn.addEventListener("click", function () {
        openSavedTransactionDocument("invoice");
      });
    }

    if (receiptBtn && !receiptBtn.dataset.bound) {
      receiptBtn.dataset.bound = "true";
      receiptBtn.addEventListener("click", function () {
        openSavedTransactionDocument("receipt");
      });
    }
  }

  function bindDocModalEvents() {
    const overlay = document.getElementById("posDocModalOverlay");
    const closeBtn = document.getElementById("posDocCloseBtn");
    const closeFooterBtn = document.getElementById("posDocCloseFooterBtn");

    if (overlay && !overlay.dataset.bound) {
      overlay.dataset.bound = "true";
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          event.stopPropagation();
        }
      });
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", closeDocModal);
    }

    if (closeFooterBtn && !closeFooterBtn.dataset.bound) {
      closeFooterBtn.dataset.bound = "true";
      closeFooterBtn.addEventListener("click", closeDocModal);
    }
  }

  function bindEvents() {
    const completedBtn = document.getElementById("posCompletedTabBtn");
    if (completedBtn && !completedBtn.dataset.bound) {
      completedBtn.dataset.bound = "true";
      completedBtn.addEventListener("click", function () {
        switchPosView("completed");
      });
    }

    const shopBtn = document.getElementById("posShopTabBtn");
    if (shopBtn && !shopBtn.dataset.bound) {
      shopBtn.dataset.bound = "true";
      shopBtn.addEventListener("click", function () {
        switchPosView("shop");
      });
    }

    const posSearchInput = document.getElementById("posSearchInput");
    if (posSearchInput && !posSearchInput.dataset.bound) {
      posSearchInput.dataset.bound = "true";
      posSearchInput.addEventListener("input", function () {
        posFilters.search = this.value || "";
        tablePagerState.completedTransactions.page = 1;
        renderPosTable();
      });
    }

    const posCategorySort = document.getElementById("posCategorySort");
    if (posCategorySort && !posCategorySort.dataset.bound) {
      posCategorySort.dataset.bound = "true";
      posCategorySort.addEventListener("change", function () {
        posFilters.category = this.value || "all";
        tablePagerState.completedTransactions.page = 1;
        renderPosTable();
      });
    }

    const posDateFilter = document.getElementById("posDateFilter");
    if (posDateFilter && !posDateFilter.dataset.bound) {
      posDateFilter.dataset.bound = "true";
      posDateFilter.addEventListener("change", function () {
        posFilters.date = this.value || "";
        posFilters.latestOnly = false;
        tablePagerState.completedTransactions.page = 1;
        renderPosTable();
      });
    }

    const posLatestBtn = document.getElementById("posLatestBtn");
    if (posLatestBtn && !posLatestBtn.dataset.bound) {
      posLatestBtn.dataset.bound = "true";
      posLatestBtn.addEventListener("click", function () {
        posFilters.latestOnly = true;
        tablePagerState.completedTransactions.page = 1;
        renderPosTable();
      });
    }

    const posShopSearchInput = document.getElementById("posShopSearchInput");
    if (posShopSearchInput && !posShopSearchInput.dataset.bound) {
      posShopSearchInput.dataset.bound = "true";
      posShopSearchInput.addEventListener("input", function () {
        shopFilters.search = this.value || "";
        renderProductGrid();
      });
    }

    const posShopCategorySort = document.getElementById("posShopCategorySort");
    if (posShopCategorySort && !posShopCategorySort.dataset.bound) {
      posShopCategorySort.dataset.bound = "true";
      posShopCategorySort.addEventListener("change", function () {
        shopFilters.category = this.value || "all";
        renderProductGrid();
      });
    }

    const clearCartBtn = document.getElementById("posClearCartBtn");
    if (clearCartBtn && !clearCartBtn.dataset.bound) {
      clearCartBtn.dataset.bound = "true";
      clearCartBtn.addEventListener("click", function () {
        clearCart();
      });
    }

    const discountInput = document.getElementById("posCartDiscount");
    const paidInput = document.getElementById("posCartPaid");

    if (discountInput && !discountInput.dataset.bound) {
      discountInput.dataset.bound = "true";
      discountInput.addEventListener("input", function () {
        renderCart();
        persistPosState();
      });
    }

    if (paidInput && !paidInput.dataset.bound) {
      paidInput.dataset.bound = "true";
      paidInput.addEventListener("input", function () {
        renderCart();
        persistPosState();
      });
    }

    const quotationBtn = document.getElementById("posPreviewQuoteBtn");
    if (quotationBtn && !quotationBtn.dataset.bound) {
      quotationBtn.dataset.bound = "true";
      quotationBtn.addEventListener("click", function () {
        openDocumentPreview("quotation");
      });
    }

    const invoiceBtn = document.getElementById("posPreviewInvoiceBtn");
    if (invoiceBtn && !invoiceBtn.dataset.bound) {
      invoiceBtn.dataset.bound = "true";
      invoiceBtn.addEventListener("click", function () {
        openDocumentPreview("invoice");
      });
    }

    const checkoutBtn = document.getElementById("posCheckoutBtn");
    if (checkoutBtn && !checkoutBtn.dataset.bound) {
      checkoutBtn.dataset.bound = "true";
      checkoutBtn.addEventListener("click", function () {
        checkoutCart();
      });
    }

    bindProductGridEvents();
    bindCartEvents();
    bindCompletedTableEvents();
    bindCompletedPaginationEvents();
    bindTransactionModalEvents();
    bindDocModalEvents();
    bindBarcodeScannerEvents();
  }

  function initCompletedTransactionDefaults() {
    const rows = buildCompletedTransactionRows();
    const latestDate = getLatestTransactionDate(rows);

    if (!posFilters.date && latestDate) {
      posFilters.date = latestDate;
    }

    posFilters.latestOnly = true;
  }

  function renderPanel() {
    hydratePosState();

    state.sales = Array.isArray(state.sales) ? state.sales : [];
    state.salesHistory = Array.isArray(state.salesHistory) ? state.salesHistory : [];
    state.posCart = Array.isArray(state.posCart) ? state.posCart : [];

    initCompletedTransactionDefaults();
    renderPosTable();
    renderProductGrid();
    renderCart();
    bindEvents();
    switchPosView(state.posActiveView || "completed");
    setCheckoutButtonState(false);
    setLastActiveSection("pos-section");
  }

  window.RackTrackPOS = {
    showToast,
    showCompletedTransactionNotification,
    getSales,
    getInventoryItems,
    getProducts,
    findInventoryMatch,
    findInventoryByBarcode,
    handleBarcodeScan,
    normalizeSaleRecord,
    renderPanel,
    renderPosTable,
    formatPeso,
    formatDateTime,
    formatAttributeLine,
    switchPosView,
    renderProductGrid,
    renderCart,
    checkoutCart,
    openDocumentPreview,
    openTransactionModalBySale,
    closeTransactionModal,
    buildTransactionSummary,
    buildCompletedTransactionRows,
    openSavedTransactionDocument,
    closeDocModal,
    reopenTransactionModal,
    printDocument,
    generateCompletedTransactionId
  };

  if (typeof registerPanel === "function") {
    registerPanel({
      id: "pos-section",
      render: renderPanel
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    hydratePosState();
    renderPanel();
  });
})();