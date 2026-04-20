(function () {
  const {
    state,
    registerEntity,
    registerPanel,
    saveData,
    calculateExpenses,
    calculateRevenue,
    calculateProfit,
    peso,
    escapeHtml,
    renderImageCell,
    renderCategoryBadge,
    productOptions,
    categoryOptions,
    findProductBySku,
    findInventoryById,
    getMovementType,
    movementClass,
    differenceClass,
    formatDifference,
    formatHistoryTime,
    addStockHistoryEntry,
    addSaleRecord,
    syncInventoryFromProduct,
    openModal,
    refreshAll,
    getRecentGroupedRecords
  } = window.RackTrack || {};

  if (!state) {
    console.warn("RackTrack state is not available.");
    return;
  }

  const STORAGE_KEYS = {
    categories: "racktrack_categories",
    products: "racktrack_products",
    inventory: "racktrack_inventory",
    stockHistory: "racktrack_stock_history",
    sales: "racktrack_sales",
    salesHistory: "racktrack_sales_history",
    inventoryUiState: "racktrack_inventory_ui_state"
  };

  const tablePagerState = {
    inventory: {},
    stockHistory: {},
    recentInventory: {},
    recentStockHistory: {}
  };

  const inventoryFilters = {
    search: "",
    category: "all"
  };

  const productFilters = {
    search: "",
    category: "all"
  };

  const stockHistoryFilters = {
    search: "",
    date: "",
    category: "all"
  };

  function safeParseArray(rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function safeParseObject(rawValue, fallback = {}) {
    try {
      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function ensureStateArrays() {
    state.categories = Array.isArray(state.categories) ? state.categories : [];
    state.products = Array.isArray(state.products) ? state.products : [];
    state.inventory = Array.isArray(state.inventory) ? state.inventory : [];
    state.stockHistory = Array.isArray(state.stockHistory) ? state.stockHistory : [];
    state.sales = Array.isArray(state.sales) ? state.sales : [];
    state.salesHistory = Array.isArray(state.salesHistory) ? state.salesHistory : [];
    state.currentInventoryTab = state.currentInventoryTab || "items";
  }

  function dedupeRecords(records, resolver) {
    const map = new Map();

    records.forEach(record => {
      if (!record || typeof record !== "object") return;

      const key = resolver
        ? resolver(record)
        : String(
            record.id ||
            `${record.sku || record.productId || "unknown"}__${record.createdAt || record.updatedAt || Date.now()}`
          ).trim().toLowerCase();

      if (!key) return;

      if (!map.has(key)) {
        map.set(key, record);
      } else {
        const existing = map.get(key);
        const existingTime = new Date(existing?.updatedAt || existing?.createdAt || existing?.soldAt || 0).getTime();
        const recordTime = new Date(record?.updatedAt || record?.createdAt || record?.soldAt || 0).getTime();

        if (recordTime >= existingTime) {
          map.set(key, record);
        }
      }
    });

    return Array.from(map.values());
  }

  function sortByCreatedDesc(items, dateFieldA = "createdAt", dateFieldB = "soldAt") {
    return [...items].sort((a, b) => {
      const aTime = new Date(a?.[dateFieldA] || a?.[dateFieldB] || a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.[dateFieldA] || b?.[dateFieldB] || b?.updatedAt || 0).getTime();
      return bTime - aTime;
    });
  }

  function persistKey(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Unable to persist ${key}:`, error);
    }
  }

  function persistUiState() {
    persistKey(STORAGE_KEYS.inventoryUiState, {
      inventoryFilters,
      productFilters,
      stockHistoryFilters,
      currentInventoryTab: state.currentInventoryTab || "items",
      tablePagerState
    });
  }

  function hydrateUiState() {
    const storedUi = safeParseObject(localStorage.getItem(STORAGE_KEYS.inventoryUiState), {});
    const storedInventoryFilters = storedUi.inventoryFilters || {};
    const storedProductFilters = storedUi.productFilters || {};
    const storedStockHistoryFilters = storedUi.stockHistoryFilters || {};

    inventoryFilters.search = typeof storedInventoryFilters.search === "string" ? storedInventoryFilters.search : "";
    inventoryFilters.category = typeof storedInventoryFilters.category === "string" ? storedInventoryFilters.category : "all";

    productFilters.search = typeof storedProductFilters.search === "string" ? storedProductFilters.search : "";
    productFilters.category = typeof storedProductFilters.category === "string" ? storedProductFilters.category : "all";

    stockHistoryFilters.search = typeof storedStockHistoryFilters.search === "string" ? storedStockHistoryFilters.search : "";
    stockHistoryFilters.date = typeof storedStockHistoryFilters.date === "string" ? storedStockHistoryFilters.date : "";
    stockHistoryFilters.category = typeof storedStockHistoryFilters.category === "string" ? storedStockHistoryFilters.category : "all";

    state.currentInventoryTab = storedUi.currentInventoryTab || state.currentInventoryTab || "items";

    if (storedUi.tablePagerState && typeof storedUi.tablePagerState === "object") {
      ["inventory", "stockHistory", "recentInventory", "recentStockHistory"].forEach(scope => {
        tablePagerState[scope] = storedUi.tablePagerState[scope] || {};
      });
    }
  }

  function persistCategoriesState() {
    ensureStateArrays();
    persistKey(STORAGE_KEYS.categories, state.categories);
  }

  function persistProductsState() {
    ensureStateArrays();
    persistKey(STORAGE_KEYS.products, state.products);
  }

  function persistInventoryState() {
    ensureStateArrays();
    persistKey(STORAGE_KEYS.inventory, state.inventory);
  }

  function persistStockHistoryState() {
    ensureStateArrays();
    persistKey(STORAGE_KEYS.stockHistory, state.stockHistory);
  }

  function persistSalesState() {
    ensureStateArrays();
    persistKey(STORAGE_KEYS.sales, state.sales);
    persistKey(STORAGE_KEYS.salesHistory, state.salesHistory);
  }

  function persistAllInventoryModuleState() {
    persistCategoriesState();
    persistProductsState();
    persistInventoryState();
    persistStockHistoryState();
    persistSalesState();
    persistUiState();
  }

  function hardSaveAllNow() {
    ensureStateArrays();
    persistAllInventoryModuleState();

    if (typeof saveData === "function") {
      try { saveData("categories"); } catch (error) { console.warn(error); }
      try { saveData("products"); } catch (error) { console.warn(error); }
      try { saveData("inventory"); } catch (error) { console.warn(error); }
      try { saveData("stockHistory"); } catch (error) { console.warn(error); }
      try { saveData("sales"); } catch (error) { console.warn(error); }
      try { saveData("salesHistory"); } catch (error) { console.warn(error); }
    }
  }

  function flushAllNow() {
    hardSaveAllNow();
  }

  function mergeByIdOrKey(current, stored, resolver) {
    return dedupeRecords([...current, ...stored], resolver);
  }

  function hydrateInventoryModuleState() {
    ensureStateArrays();

    const storedCategories = safeParseArray(localStorage.getItem(STORAGE_KEYS.categories));
    const storedProducts = safeParseArray(localStorage.getItem(STORAGE_KEYS.products));
    const storedInventory = safeParseArray(localStorage.getItem(STORAGE_KEYS.inventory));
    const storedStockHistory = safeParseArray(localStorage.getItem(STORAGE_KEYS.stockHistory));
    const storedSales = safeParseArray(localStorage.getItem(STORAGE_KEYS.sales));
    const storedSalesHistory = safeParseArray(localStorage.getItem(STORAGE_KEYS.salesHistory));

    state.categories = mergeByIdOrKey(
      state.categories,
      storedCategories,
      item => String(item.id || item.name || "").trim().toLowerCase()
    );

    state.products = sortByCreatedDesc(
      mergeByIdOrKey(
        state.products,
        storedProducts,
        item => String(item.id || item.productId || "").trim().toLowerCase()
      )
    );

    state.inventory = sortByCreatedDesc(
      mergeByIdOrKey(
        state.inventory,
        storedInventory,
        item => String(item.id || item.productId || item.sku || "").trim().toLowerCase()
      )
    );

    state.stockHistory = sortByCreatedDesc(
      mergeByIdOrKey(
        state.stockHistory,
        storedStockHistory,
        item => String(
          item.id ||
          `${item.itemId || item.inventoryId || item.productId || item.sku || "unknown"}__${item.createdAt || ""}__${item.movementType || ""}`
        ).trim().toLowerCase()
      )
    );

    state.sales = sortByCreatedDesc(
      mergeByIdOrKey(
        state.sales,
        storedSales,
        item => String(
          item.id ||
          `${item.inventoryId || item.productId || item.sku || "unknown"}__${item.createdAt || item.soldAt || ""}`
        ).trim().toLowerCase()
      ),
      "createdAt",
      "soldAt"
    );

    state.salesHistory = sortByCreatedDesc(
      mergeByIdOrKey(
        state.salesHistory,
        storedSalesHistory,
        item => String(
          item.id ||
          `${item.inventoryId || item.productId || item.sku || "unknown"}__${item.createdAt || item.soldAt || ""}`
        ).trim().toLowerCase()
      ),
      "createdAt",
      "soldAt"
    );

    hydrateUiState();
    persistAllInventoryModuleState();
  }

  function ensureToastWrap() {
    let wrap = document.getElementById("inventoryToastWrap");

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "inventoryToastWrap";
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

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  function notifySaved(label) {
    showToast(`${label} saved successfully.`, "success");
  }

  function chunkRecords(records, chunkSize = 10) {
    const chunks = [];
    for (let i = 0; i < records.length; i += chunkSize) {
      chunks.push(records.slice(i, i + chunkSize));
    }
    return chunks;
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPagerState(scope, groupKey, maxTables) {
    const current = Number(tablePagerState[scope]?.[groupKey]) || 0;
    if (current < 0) return 0;
    if (current >= maxTables) return 0;
    return current;
  }

  function setPagerState(scope, groupKey, index) {
    if (!tablePagerState[scope]) tablePagerState[scope] = {};
    tablePagerState[scope][groupKey] = index;
    persistUiState();
  }

  function resetPagerState(scope, groupKey = "stockHistory-all") {
    if (!tablePagerState[scope]) tablePagerState[scope] = {};
    tablePagerState[scope][groupKey] = 0;
    persistUiState();
  }

  function buildPagerButtons(scope, groupKey, tableCount, activeIndex) {
    if (tableCount <= 1) return "";

    return `
      <div class="table-page-switcher" data-scope="${escapeHtml(scope)}" data-group-key="${escapeHtml(groupKey)}">
        ${Array.from({ length: tableCount }, (_, index) => `
          <button
            type="button"
            class="table-page-btn ${index === activeIndex ? "active" : ""}"
            data-table-page-btn="true"
            data-scope="${escapeHtml(scope)}"
            data-group-key="${escapeHtml(groupKey)}"
            data-table-index="${index}"
          >
            ${index + 1}
          </button>
        `).join("")}
      </div>
    `;
  }

  function formatDateMMDDYY(dateValue) {
    if (!dateValue) return "-";

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);

    return `${month}/${day}/${year}`;
  }

  function toDateOnlyKey(dateValue) {
    if (!dateValue) return "";

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function normalizeDateInputValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [month, day, year] = raw.split("/");
      return `${year}-${month}-${day}`;
    }

    if (/^\d{2}\/\d{2}\/\d{2}$/.test(raw)) {
      const [month, day, year] = raw.split("/");
      return `20${year}-${month}-${day}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";

    return toDateOnlyKey(parsed);
  }

  function getLatestStockHistoryDate() {
    if (!Array.isArray(state.stockHistory) || !state.stockHistory.length) return "";

    let latest = null;

    state.stockHistory.forEach(entry => {
      const entryDate = new Date(entry.createdAt || entry.updatedAt || 0);
      if (Number.isNaN(entryDate.getTime())) return;
      if (!latest || entryDate > latest) latest = entryDate;
    });

    return latest ? toDateOnlyKey(latest) : "";
  }

  function ensureStockHistoryDefaultDate() {
    if (!stockHistoryFilters.date) {
      stockHistoryFilters.date = getLatestStockHistoryDate();
      persistUiState();
    }
    return stockHistoryFilters.date;
  }

  function getStockHistoryDateInput() {
    return (
      document.getElementById("stockHistoryDate") ||
      document.getElementById("stockHistoryDateFilter") ||
      document.getElementById("movementHistoryDate") ||
      document.getElementById("historyDateFilter") ||
      document.querySelector('[data-stock-history-date="true"]')
    );
  }

  function getStockHistoryLatestButton() {
    return (
      document.getElementById("stockHistoryLatestBtn") ||
      document.getElementById("movementHistoryLatestBtn") ||
      document.querySelector('[data-stock-history-latest="true"]')
    );
  }

  function getInventoryCategorySelect() {
    return (
      document.getElementById("inventoryCategorySort") ||
      document.querySelector('[data-inventory-category-sort="true"]')
    );
  }

  function getProductsCategorySelect() {
    return (
      document.getElementById("productsCategorySort") ||
      document.querySelector('[data-products-category-sort="true"]')
    );
  }

  function getStockHistoryCategorySelect() {
    return (
      document.getElementById("stockHistoryCategorySort") ||
      document.querySelector('[data-stock-history-category-sort="true"]')
    );
  }

  function getUniqueInventoryCategories() {
    const categorySet = new Set();
    (Array.isArray(state.inventory) ? state.inventory : []).forEach(item => {
      const category = String(item.category || "").trim();
      if (category) categorySet.add(category);
    });
    return Array.from(categorySet).sort((a, b) => a.localeCompare(b));
  }

  function getUniqueProductCategories() {
    const categorySet = new Set();
    (Array.isArray(state.products) ? state.products : []).forEach(item => {
      const category = String(item.category || "").trim();
      if (category) categorySet.add(category);
    });
    return Array.from(categorySet).sort((a, b) => a.localeCompare(b));
  }

  function getUniqueStockHistoryCategories() {
    const categorySet = new Set();
    (Array.isArray(state.stockHistory) ? state.stockHistory : []).forEach(entry => {
      const category = String(entry.category || "").trim();
      if (category) categorySet.add(category);
    });
    return Array.from(categorySet).sort((a, b) => a.localeCompare(b));
  }

  function ensureInventoryCategoryFilter() {
    const tools = document.querySelector("#inventory-items-view .inventory-tools");
    if (!tools) return;

    let select = getInventoryCategorySelect();
    if (!select) {
      select = document.createElement("select");
      select.id = "inventoryCategorySort";
      select.setAttribute("data-inventory-category-sort", "true");
      select.className = "inventory-category-sort";
      tools.appendChild(select);
    }

    const categories = getUniqueInventoryCategories();
    const currentValue = inventoryFilters.category || "all";

    select.innerHTML = `
      <option value="all">All Categories</option>
      ${categories.map(category => `
        <option value="${escapeHtml(category)}" ${normalizeText(currentValue) === normalizeText(category) ? "selected" : ""}>
          ${escapeHtml(category)}
        </option>
      `).join("")}
    `;
  }

  function ensureProductsCategoryFilter() {
    const tools = document.querySelector("#inventory-products-view .inventory-tools");
    if (!tools) return;

    let select = getProductsCategorySelect();
    if (!select) {
      select = document.createElement("select");
      select.id = "productsCategorySort";
      select.setAttribute("data-products-category-sort", "true");
      select.className = "products-category-sort";
      tools.appendChild(select);
    }

    const categories = getUniqueProductCategories();
    const currentValue = productFilters.category || "all";

    select.innerHTML = `
      <option value="all">All Categories</option>
      ${categories.map(category => `
        <option value="${escapeHtml(category)}" ${normalizeText(currentValue) === normalizeText(category) ? "selected" : ""}>
          ${escapeHtml(category)}
        </option>
      `).join("")}
    `;
  }

  function ensureStockHistoryCategoryFilter() {
    const tools = document.querySelector(".stock-history-head .inventory-tools");
    if (!tools) return;

    let select = getStockHistoryCategorySelect();
    if (!select) {
      select = document.createElement("select");
      select.id = "stockHistoryCategorySort";
      select.setAttribute("data-stock-history-category-sort", "true");
      select.className = "stock-history-category-sort";
      const latestBtn = getStockHistoryLatestButton();
      if (latestBtn) {
        tools.insertBefore(select, latestBtn);
      } else {
        tools.appendChild(select);
      }
    }

    const categories = getUniqueStockHistoryCategories();
    const currentValue = stockHistoryFilters.category || "all";

    select.innerHTML = `
      <option value="all">All Categories</option>
      ${categories.map(category => `
        <option value="${escapeHtml(category)}" ${normalizeText(currentValue) === normalizeText(category) ? "selected" : ""}>
          ${escapeHtml(category)}
        </option>
      `).join("")}
    `;
  }

  function applyInventoryFilters({ search, category } = {}) {
    if (typeof search === "string") inventoryFilters.search = search;
    if (typeof category === "string") inventoryFilters.category = category || "all";

    resetPagerState("inventory", "inventory-all");
    persistUiState();
    renderInventoryTable(inventoryFilters.search, inventoryFilters.category);
  }

  function applyProductFilters({ search, category } = {}) {
    if (typeof search === "string") productFilters.search = search;
    if (typeof category === "string") productFilters.category = category || "all";

    persistUiState();
    renderProductsTable(productFilters.search, productFilters.category);
  }

  function applyStockHistoryFilters({ search, date, category } = {}) {
    if (typeof search === "string") stockHistoryFilters.search = search;

    if (typeof date === "string") {
      const normalized = normalizeDateInputValue(date);
      stockHistoryFilters.date = normalized || getLatestStockHistoryDate();
    }

    if (typeof category === "string") stockHistoryFilters.category = category || "all";

    if (!stockHistoryFilters.date) stockHistoryFilters.date = getLatestStockHistoryDate();

    resetPagerState("stockHistory");
    persistUiState();
    renderStockHistoryTable(
      stockHistoryFilters.search,
      stockHistoryFilters.date,
      stockHistoryFilters.category
    );
  }

  function syncInventoryFilterInputs() {
    const searchInput = document.getElementById("inventorySearch");
    const categorySelect = getInventoryCategorySelect();

    if (searchInput && searchInput.value !== inventoryFilters.search) {
      searchInput.value = inventoryFilters.search;
    }

    if (categorySelect && categorySelect.value !== inventoryFilters.category) {
      categorySelect.value = inventoryFilters.category || "all";
    }
  }

  function syncProductFilterInputs() {
    const searchInput = document.getElementById("productsSearch");
    const categorySelect = getProductsCategorySelect();

    if (searchInput && searchInput.value !== productFilters.search) {
      searchInput.value = productFilters.search;
    }

    if (categorySelect && categorySelect.value !== productFilters.category) {
      categorySelect.value = productFilters.category || "all";
    }
  }

  function syncStockHistoryFilterInputs() {
    const searchInput = document.getElementById("stockHistorySearch");
    const dateInput = getStockHistoryDateInput();
    const categorySelect = getStockHistoryCategorySelect();

    if (searchInput && searchInput.value !== stockHistoryFilters.search) {
      searchInput.value = stockHistoryFilters.search;
    }

    if (dateInput) {
      const targetDate = ensureStockHistoryDefaultDate();
      if (dateInput.value !== targetDate) {
        dateInput.value = targetDate || "";
      }
    }

    if (categorySelect && categorySelect.value !== stockHistoryFilters.category) {
      categorySelect.value = stockHistoryFilters.category || "all";
    }
  }

  function sanitizeAlphaNumeric(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function getLettersOnly(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
  }

  function getCodeFromWords(value, maxLength = 3) {
    const words = String(value || "")
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) return "";

    if (words.length === 1) {
      return sanitizeAlphaNumeric(words[0]).slice(0, maxLength);
    }

    return sanitizeAlphaNumeric(words.map(word => word[0]).join("")).slice(0, maxLength);
  }

  function getProductNameCode(productName) {
    const words = String(productName || "")
      .replace(/[-–—]/g, " ")
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) return "PR";
    if (words.length === 1) {
      return sanitizeAlphaNumeric(words[0]).slice(0, 2) || "PR";
    }

    return sanitizeAlphaNumeric(words.slice(0, 2).map(word => word[0]).join("")).slice(0, 2) || "PR";
  }

  function materialToCode(material) {
    const normalized = String(material || "").trim().toLowerCase();

    const materialMap = {
      cotton: "CTN",
      polyester: "POL",
      nylon: "NYL",
      denim: "DNM",
      fleece: "FLC",
      spandex: "SPD",
      wool: "WOL",
      linen: "LIN",
      silk: "SLK",
      rayon: "RYN",
      leather: "LTH",
      satin: "STN",
      mesh: "MSH",
      jersey: "JRS",
      canvas: "CNV",
      terry: "TRY"
    };

    return materialMap[normalized] || getCodeFromWords(material, 3) || "MAT";
  }

  function categoryToCode(category) {
    const normalized = String(category || "").trim().toLowerCase();

    const categoryMap = {
      "t-shirt": "TSH",
      tshirt: "TSH",
      shirt: "SHT",
      hoodie: "HOD",
      "long sleeve": "LGS",
      "sweat pants": "SWP",
      shorts: "SHR",
      jacket: "JCK",
      pants: "PNT",
      jeans: "JNS",
      polo: "POL",
      dress: "DRS",
      skirt: "SKT",
      cap: "CAP"
    };

    return categoryMap[normalized] || getCodeFromWords(category, 3) || "CAT";
  }

  function sizeToCode(size) {
    const raw = String(size || "").trim().toUpperCase();
    if (!raw) return "NA";

    const cleaned = raw.replace(/[^A-Z0-9]/g, "");

    const sizeMap = {
      XS: "XS",
      S: "S",
      M: "M",
      L: "L",
      XL: "XL",
      XXL: "XXL",
      XXXL: "XXXL",
      XXXXL: "XXXX",
      SMALL: "S",
      MEDIUM: "M",
      LARGE: "L"
    };

    return sizeMap[cleaned] || cleaned.slice(0, 4) || "NA";
  }

  function colorToCode(color) {
    return getCodeFromWords(color, 3) || "NA";
  }

  function generateSkuFromAttributes(values = {}) {
    const productName = getProductNameCode(values.productName || "");
    const color = colorToCode(values.color || "");
    const size = sizeToCode(values.size || "");
    const material = materialToCode(values.material || "");
    const category = categoryToCode(values.category || "");

    return [productName, color, size, material, category].join("-");
  }

  function generateNextProductId() {
    const products = Array.isArray(state.products) ? state.products : [];
    let maxNumber = 0;

    products.forEach(product => {
      const value = String(product.productId || "").trim().toUpperCase();
      const match = value.match(/^RT-PRD-(\d{5})$/);
      if (!match) return;

      const num = Number(match[1]);
      if (Number.isFinite(num) && num > maxNumber) maxNumber = num;
    });

    return `RT-PRD-${String(maxNumber + 1).padStart(5, "0")}`;
  }

  function ensureUniqueProductId(baseId, excludeId = "") {
    const products = Array.isArray(state.products) ? state.products : [];
    let candidate = String(baseId || "").trim().toUpperCase();

    if (!candidate) candidate = generateNextProductId();

    const patternMatch = candidate.match(/^RT-PRD-(\d{5})$/);
    let counter = patternMatch ? Number(patternMatch[1]) : 1;

    while (products.some(item =>
      String(item.id || "") !== String(excludeId || "") &&
      String(item.productId || "").trim().toUpperCase() === candidate
    )) {
      counter += 1;
      candidate = `RT-PRD-${String(counter).padStart(5, "0")}`;
    }

    return candidate;
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

  function findProductByProductId(value) {
    const needle = String(value || "").trim().toLowerCase();
    if (!needle) return null;

    return (Array.isArray(state.products) ? state.products : []).find(product =>
      String(product.productId || "").trim().toLowerCase() === needle
    ) || null;
  }

  function findProductBySkuOrProductId(value) {
    const needle = String(value || "").trim().toLowerCase();
    if (!needle) return null;

    return (Array.isArray(state.products) ? state.products : []).find(product =>
      String(product.productId || "").trim().toLowerCase() === needle ||
      String(product.sku || "").trim().toLowerCase() === needle
    ) || null;
  }

  function buildProductSelectOptions(selectedProductId = "") {
    const products = Array.isArray(state.products) ? state.products : [];

    if (!products.length) {
      return `<option value="">No products available</option>`;
    }

    return `
      <option value="">Select Product</option>
      ${products.map(product => {
        const value = String(product.productId || "");
        const label = `${product.productId || "-"} | ${product.productName || "-"} | ${product.sku || "-"}`;
        return `
          <option value="${escapeHtml(value)}" ${normalizeText(selectedProductId) === normalizeText(value) ? "selected" : ""}>
            ${escapeHtml(label)}
          </option>
        `;
      }).join("")}
    `;
  }

  function upsertStockHistoryEntry(entry) {
    if (!entry || typeof entry !== "object") return;

    const targetId = String(entry.id || crypto.randomUUID());
    const existingIndex = state.stockHistory.findIndex(item => String(item.id) === targetId);

    const finalEntry = {
      id: targetId,
      createdAt: entry.createdAt || new Date().toISOString(),
      ...entry
    };

    if (existingIndex >= 0) {
      state.stockHistory[existingIndex] = {
        ...state.stockHistory[existingIndex],
        ...finalEntry
      };
    } else {
      state.stockHistory.unshift(finalEntry);
    }

    state.stockHistory = sortByCreatedDesc(dedupeRecords(
      state.stockHistory,
      item => String(
        item.id ||
        `${item.itemId || item.inventoryId || item.productId || item.sku || "unknown"}__${item.createdAt || ""}__${item.movementType || ""}`
      ).trim().toLowerCase()
    ));
  }

  function upsertSaleEntry(entry) {
    if (!entry || typeof entry !== "object") return;

    const targetId = String(entry.id || crypto.randomUUID());
    const existingSalesIndex = state.sales.findIndex(item => String(item.id) === targetId);
    const existingSalesHistoryIndex = state.salesHistory.findIndex(item => String(item.id) === targetId);

    const finalEntry = {
      id: targetId,
      createdAt: entry.createdAt || entry.soldAt || new Date().toISOString(),
      soldAt: entry.soldAt || entry.createdAt || new Date().toISOString(),
      ...entry
    };

    if (existingSalesIndex >= 0) {
      state.sales[existingSalesIndex] = {
        ...state.sales[existingSalesIndex],
        ...finalEntry
      };
    } else {
      state.sales.unshift(finalEntry);
    }

    if (existingSalesHistoryIndex >= 0) {
      state.salesHistory[existingSalesHistoryIndex] = {
        ...state.salesHistory[existingSalesHistoryIndex],
        ...finalEntry
      };
    } else {
      state.salesHistory.unshift(finalEntry);
    }

    state.sales = sortByCreatedDesc(dedupeRecords(
      state.sales,
      item => String(item.id || `${item.inventoryId || item.productId || item.sku || "unknown"}__${item.createdAt || item.soldAt || ""}`).trim().toLowerCase()
    ), "createdAt", "soldAt");

    state.salesHistory = sortByCreatedDesc(dedupeRecords(
      state.salesHistory,
      item => String(item.id || `${item.inventoryId || item.productId || item.sku || "unknown"}__${item.createdAt || item.soldAt || ""}`).trim().toLowerCase()
    ), "createdAt", "soldAt");
  }

  function addStockHistorySafely(entry) {
    try {
      if (typeof addStockHistoryEntry === "function") {
        addStockHistoryEntry(entry);
      }
    } catch (error) {
      console.warn("addStockHistoryEntry failed, using local fallback.", error);
    }

    upsertStockHistoryEntry(entry);
    persistStockHistoryState();
  }

  function addSaleSafely(entry) {
    try {
      if (typeof addSaleRecord === "function") {
        addSaleRecord(entry);
      }
    } catch (error) {
      console.warn("addSaleRecord failed, using local fallback.", error);
    }

    upsertSaleEntry(entry);
    persistSalesState();
  }

  function productFormHTML(values = {}) {
    const noCategory = !state.categories.length;
    const autoSku = values.sku || generateSkuFromAttributes(values);
    const autoProductId = values.productId || ensureUniqueProductId(generateNextProductId(), values.id || state.editId || "");

    return `
      <div class="form-grid two-columns">
        <div class="form-left">
          <div class="form-field">
            <label>Attributes</label>
            <input id="productAttributeLine" value="${escapeHtml(formatAttributeLine(values))}" readonly />
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Product ID</label>
              <input
                id="productIdInput"
                name="productId"
                placeholder="System generated"
                value="${escapeHtml(autoProductId)}"
                readonly
                required
              />
              <div class="field-note">Product ID is auto-generated by the system.</div>
            </div>

            <div class="form-field">
              <label>Product Name</label>
              <input id="productNameInput" name="productName" placeholder="Product Name" value="${escapeHtml(values.productName || "")}" required />
            </div>
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>SKU</label>
              <input id="productSkuInput" name="sku" placeholder="SKU" value="${escapeHtml(autoSku)}" readonly required />
              <div class="field-note">SKU is auto-generated by the system using product name acronym + color + size + material + category.</div>
            </div>
            <div class="form-field">
              <label>Supplier</label>
              <input name="supplier" placeholder="Supplier" value="${escapeHtml(values.supplier || "")}" />
            </div>
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Color</label>
              <input id="productColorInput" name="color" placeholder="Color" value="${escapeHtml(values.color || "")}" />
            </div>
            <div class="form-field">
              <label>Size</label>
              <input id="productSizeInput" name="size" placeholder="Size" value="${escapeHtml(values.size || "")}" />
            </div>
          </div>

          <div class="form-field">
            <label>Material</label>
            <input id="productMaterialInput" name="material" placeholder="Material" value="${escapeHtml(values.material || "")}" />
          </div>

          <div class="form-field">
            <label>Description</label>
            <textarea name="description" placeholder="Write product description...">${escapeHtml(values.description || "")}</textarea>
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Category</label>
              <select id="productCategoryInput" name="category" required ${noCategory ? "disabled" : ""}>
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

  function populateInventoryFieldsFromProduct(product) {
    const attributeLineInput = document.getElementById("inventoryAttributeLine");
    const productIdInput = document.getElementById("inventoryProductId");
    const productNameInput = document.getElementById("inventoryProductName");
    const skuInput = document.getElementById("inventorySku");
    const supplierInput = document.getElementById("inventorySupplier");
    const colorInput = document.getElementById("inventoryColor");
    const sizeInput = document.getElementById("inventorySize");
    const materialInput = document.getElementById("inventoryMaterial");
    const descriptionInput = document.getElementById("inventoryDescription");
    const categoryInput = document.getElementById("inventoryCategory");
    const costInput = document.getElementById("inventoryCost");
    const srpInput = document.getElementById("inventorySrp");
    const imageDataInput = document.getElementById("inventoryImageData");
    const imagePreviewWrap = document.getElementById("inventoryImagePreviewWrap");

    if (!product) {
      if (attributeLineInput) attributeLineInput.value = "";
      if (productIdInput) productIdInput.value = "";
      if (productNameInput) productNameInput.value = "";
      if (skuInput) skuInput.value = "";
      if (supplierInput) supplierInput.value = "";
      if (colorInput) colorInput.value = "";
      if (sizeInput) sizeInput.value = "";
      if (materialInput) materialInput.value = "";
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

    if (attributeLineInput) attributeLineInput.value = formatAttributeLine(product);
    if (productIdInput) productIdInput.value = product.productId || "";
    if (productNameInput) productNameInput.value = product.productName || "";
    if (skuInput) skuInput.value = product.sku || "";
    if (supplierInput) supplierInput.value = product.supplier || "";
    if (colorInput) colorInput.value = product.color || "";
    if (sizeInput) sizeInput.value = product.size || "";
    if (materialInput) materialInput.value = product.material || "";
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

  function inventoryFormHTML(values = {}) {
    const selectedProduct =
      findProductByProductId(values.productId || values.sourceProductId || "") ||
      findProductBySkuOrProductId(values.sku || values.productId || "");

    const hasProducts = state.products.length > 0;
    const isEditMode = Boolean(state.editId);
    const currentQty = Number(values.quantity) || 0;

    return `
      <div class="form-grid two-columns">
        <div class="form-left">
          <div class="form-field">
            <label>Find Product by SKU or Product ID</label>
            <input
              type="text"
              id="inventoryProductLookup"
              placeholder="Type SKU or Product ID"
              ${isEditMode ? "disabled" : ""}
              value="${escapeHtml(selectedProduct?.productId || selectedProduct?.sku || values.productId || values.sku || "")}"
            />
            <div class="field-note">You can type SKU/Product ID or choose below.</div>
          </div>

          <div class="form-field">
            <label>Select Product</label>
            <select name="sourceProductId" id="inventoryProductSelect" required ${hasProducts ? "" : "disabled"} ${isEditMode ? "disabled" : ""}>
              ${buildProductSelectOptions(selectedProduct?.productId || values.productId || "")}
            </select>

            ${
              isEditMode
                ? `<input type="hidden" name="sourceProductId" value="${escapeHtml(selectedProduct?.productId || values.productId || "")}" />`
                : ""
            }

            ${
              isEditMode
                ? `<div class="field-note">Product cannot be changed while editing this inventory record.</div>`
                : hasProducts
                  ? `<div class="field-note">Inventory now links products by Product ID to safely support duplicate SKU.</div>`
                  : `<div class="field-note warning">Add a product first before adding inventory.</div>`
            }
          </div>

          <div class="form-field">
            <label>Attributes</label>
            <input id="inventoryAttributeLine" value="${escapeHtml(formatAttributeLine(selectedProduct || values))}" readonly />
          </div>

          <div class="form-field">
            <label>Product Name</label>
            <input id="inventoryProductName" name="productName" value="${escapeHtml(selectedProduct?.productName || values.productName || "")}" readonly />
          </div>

          <div class="form-field">
            <label>Product ID</label>
            <input id="inventoryProductId" name="productId" value="${escapeHtml(selectedProduct?.productId || values.productId || "")}" readonly />
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>SKU</label>
              <input id="inventorySku" name="sku" value="${escapeHtml(selectedProduct?.sku || values.sku || "")}" readonly />
            </div>
            <div class="form-field">
              <label>Supplier</label>
              <input id="inventorySupplier" name="supplier" value="${escapeHtml(selectedProduct?.supplier || values.supplier || "")}" readonly />
            </div>
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Color</label>
              <input id="inventoryColor" name="color" value="${escapeHtml(selectedProduct?.color || values.color || "")}" readonly />
            </div>
            <div class="form-field">
              <label>Size</label>
              <input id="inventorySize" name="size" value="${escapeHtml(selectedProduct?.size || values.size || "")}" readonly />
            </div>
          </div>

          <div class="form-field">
            <label>Material</label>
            <input id="inventoryMaterial" name="material" value="${escapeHtml(selectedProduct?.material || values.material || "")}" readonly />
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

  function sellFormHTML(values = {}) {
    const item = findInventoryById(values.inventoryId || values.id || "");
    const availableQty = Number(item?.quantity) || 0;

    return `
      <div class="form-grid two-columns">
        <div class="form-left">
          <div class="form-field">
            <label>Attributes</label>
            <input value="${escapeHtml(formatAttributeLine(item || {}))}" readonly />
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Product Name</label>
              <input value="${escapeHtml(item?.productName || "")}" readonly />
              <input type="hidden" name="inventoryId" value="${escapeHtml(item?.id || "")}" />
            </div>

            <div class="form-field">
              <label>Product ID</label>
              <input value="${escapeHtml(item?.productId || "-")}" readonly />
            </div>
          </div>

          <div class="form-field">
            <label>Customer Name</label>
            <input name="customerName" placeholder="Customer Name" value="${escapeHtml(values.customerName || "")}" required />
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>SKU</label>
              <input value="${escapeHtml(item?.sku || "")}" readonly />
            </div>

            <div class="form-field">
              <label>Available Stock</label>
              <input value="${availableQty}" readonly />
            </div>
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Color</label>
              <input value="${escapeHtml(item?.color || "")}" readonly />
            </div>

            <div class="form-field">
              <label>Size</label>
              <input value="${escapeHtml(item?.size || "")}" readonly />
            </div>
          </div>

          <div class="form-field">
            <label>Material</label>
            <input value="${escapeHtml(item?.material || "")}" readonly />
          </div>

          <div class="form-field">
            <label>Category</label>
            <input value="${escapeHtml(item?.category || "")}" readonly />
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Cost</label>
              <input id="sellCost" value="${Number(item?.cost) || 0}" readonly />
            </div>

            <div class="form-field">
              <label>Selling Price (SRP)</label>
              <input id="sellSrp" value="${Number(item?.srp) || 0}" readonly />
            </div>
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Quantity to Sell</label>
              <input name="quantitySold" id="sellQuantity" type="number" min="1" max="${availableQty}" value="1" required />
            </div>

            <div class="form-field">
              <label>Date Sold</label>
              <input name="soldDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required />
            </div>
          </div>

          <div class="form-two">
            <div class="form-field">
              <label>Total Sale Amount</label>
              <input name="saleAmount" id="sellAmount" value="0" readonly />
            </div>

            <div class="form-field">
              <label>Total Profit</label>
              <input name="profitAmount" id="sellProfit" value="0" readonly />
            </div>
          </div>

          <div class="form-field">
            <label>Note</label>
            <textarea name="sellNote" placeholder="Optional note for this sale"></textarea>
          </div>
        </div>

        <div class="form-right">
          <div class="image-upload-box">
            <div class="image-preview-wrap">
              ${
                item?.imageData
                  ? `<img src="${item.imageData}" alt="Product Preview" />`
                  : `<div class="image-preview-empty">No image available</div>`
              }
            </div>

            <div class="product-source-note">
              Selling from Inventory will reduce stock and create sales records. Sold records will appear in POS and Inventory Movement History.
            </div>
          </div>
        </div>
      </div>
    `;
  }

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

  function attachProductSkuGenerator(initialValues = {}) {
    const productNameInput = document.getElementById("productNameInput");
    const colorInput = document.getElementById("productColorInput");
    const sizeInput = document.getElementById("productSizeInput");
    const materialInput = document.getElementById("productMaterialInput");
    const categoryInput = document.getElementById("productCategoryInput");
    const skuInput = document.getElementById("productSkuInput");
    const productIdInput = document.getElementById("productIdInput");
    const attributeLineInput = document.getElementById("productAttributeLine");

    if (!skuInput) return;

    function updateGeneratedFields() {
      const liveValues = {
        productName: productNameInput?.value || initialValues.productName || "",
        color: colorInput?.value || initialValues.color || "",
        size: sizeInput?.value || initialValues.size || "",
        material: materialInput?.value || initialValues.material || "",
        category: categoryInput?.value || initialValues.category || ""
      };

      skuInput.value = generateSkuFromAttributes(liveValues);

      if (attributeLineInput) {
        attributeLineInput.value = formatAttributeLine(liveValues);
      }

      if (productIdInput) {
        const lockedId = initialValues.productId || "";
        productIdInput.value = ensureUniqueProductId(
          lockedId || generateNextProductId(),
          initialValues.id || state.editId || ""
        );
      }
    }

    [productNameInput, colorInput, sizeInput, materialInput, categoryInput].forEach(input => {
      if (!input) return;
      input.addEventListener("input", updateGeneratedFields);
      input.addEventListener("change", updateGeneratedFields);
    });

    updateGeneratedFields();
  }

  function attachInventoryProductHandlers(initialSku = "", initialProductId = "") {
    const productSelect = document.getElementById("inventoryProductSelect");
    const lookupInput = document.getElementById("inventoryProductLookup");

    if (!productSelect) return;

    const initialProduct =
      findProductByProductId(initialProductId) ||
      findProductBySkuOrProductId(initialSku) ||
      findProductByProductId(productSelect.value);

    populateInventoryFieldsFromProduct(initialProduct);

    if (lookupInput && initialProduct) {
      lookupInput.value = initialProduct.productId || initialProduct.sku || "";
    }

    productSelect.addEventListener("change", event => {
      const selectedProduct = findProductByProductId(event.target.value);
      populateInventoryFieldsFromProduct(selectedProduct);

      if (lookupInput && selectedProduct) {
        lookupInput.value = selectedProduct.productId || selectedProduct.sku || "";
      }
    });

    if (lookupInput) {
      lookupInput.addEventListener("input", function () {
        const found = findProductBySkuOrProductId(this.value);
        if (!found) return;

        productSelect.value = found.productId || "";
        populateInventoryFieldsFromProduct(found);
      });
    }
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

  function attachSellCalculationHandlers() {
    const qtyInput = document.getElementById("sellQuantity");
    const costInput = document.getElementById("sellCost");
    const srpInput = document.getElementById("sellSrp");
    const amountInput = document.getElementById("sellAmount");
    const profitInput = document.getElementById("sellProfit");

    if (!qtyInput || !costInput || !srpInput || !amountInput || !profitInput) return;

    function update() {
      const qty = Number(qtyInput.value) || 0;
      const cost = Number(costInput.value) || 0;
      const srp = Number(srpInput.value) || 0;

      amountInput.value = calculateRevenue(srp, qty).toFixed(2);
      profitInput.value = calculateProfit(cost, srp, qty).toFixed(2);
    }

    qtyInput.addEventListener("input", update);
    update();
  }

  function preventFormModalOutsideClose() {
    const modal = document.getElementById("formModal");
    if (!modal || modal.dataset.outsideCloseLocked === "true") return;

    modal.dataset.outsideCloseLocked = "true";

    modal.addEventListener("mousedown", function (event) {
      if (event.target === modal) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    modal.addEventListener("pointerdown", function (event) {
      if (event.target === modal) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  function buildInventoryRows(tableItems) {
    return tableItems.map(item => {
      const qty = Number(item.quantity) || 0;
      const cost = Number(item.cost) || 0;
      const srp = Number(item.srp) || 0;
      const totalExpenses = calculateExpenses(cost, qty);
      const isLowStock = qty <= 5;
      const statusText = isLowStock ? "Low Stock" : "In Stock";
      const stockStatusClass = isLowStock ? "low-stock" : "in-stock";

      return `
        <tr>
          <td>${renderImageCell(item.imageData, item.productName)}</td>
          <td>${escapeHtml(item.productId || "-")}</td>
          <td>${escapeHtml(item.productName)}</td>
          <td>${escapeHtml(item.sku)}</td>
          <td>${escapeHtml(item.supplier || "-")}</td>
          <td>${escapeHtml(item.color || "-")}</td>
          <td>${escapeHtml(item.size || "-")}</td>
          <td>${escapeHtml(item.material || "-")}</td>
          <td>${renderCategoryBadge(item.category)}</td>
          <td>${peso(cost)}</td>
          <td>${peso(srp)}</td>
          <td>${qty}</td>
          <td>${peso(totalExpenses)}</td>
          <td><span class="stock-status ${stockStatusClass}">${statusText}</span></td>
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

  function buildStockHistoryRows(tableItems) {
    return tableItems.map(entry => `
      <tr>
        <td class="history-date">${formatDateMMDDYY(entry.createdAt)}</td>
        <td class="history-time">${formatHistoryTime(entry.createdAt)}</td>
        <td>${escapeHtml(entry.productName || "-")}</td>
        <td>${escapeHtml(entry.sku || "-")}</td>
        <td>${renderCategoryBadge(entry.category || "")}</td>
        <td>${Number(entry.oldQuantity) || 0}</td>
        <td>${Number(entry.newQuantity) || 0}</td>
        <td class="history-diff ${differenceClass(entry.difference ?? ((Number(entry.newQuantity) || 0) - (Number(entry.oldQuantity) || 0)))}">
          ${formatDifference(entry.difference ?? ((Number(entry.newQuantity) || 0) - (Number(entry.oldQuantity) || 0)))}
        </td>
        <td>
          <span class="movement-pill ${movementClass(entry.movementType)}">
            ${escapeHtml(entry.movementType || "No Change")}
          </span>
        </td>
        <td class="sale-amount-cell">${Number(entry.saleAmount) ? peso(entry.saleAmount) : "-"}</td>
        <td class="profit-amount-cell">${Number(entry.profitAmount) ? peso(entry.profitAmount) : "-"}</td>
        <td class="note-cell">${escapeHtml(entry.note || "-")}</td>
      </tr>
    `).join("");
  }

  function renderInventoryChunkTables(items) {
    const tables = chunkRecords(items, 10);
    const groupKey = "inventory-all";
    const activeIndex = getPagerState("inventory", groupKey, tables.length);
    const activeTable = tables[activeIndex] || tables[0] || [];

    return `
      <tr>
        <td colspan="15" class="grouped-table-wrapper-cell">
          <div class="daily-group-block">
            <div class="daily-group-header daily-group-header-with-pages inventory-pages-right">
              <div></div>
              ${buildPagerButtons("inventory", groupKey, tables.length, activeIndex)}
            </div>

            <div class="grouped-table-card">
              <div class="grouped-table-title">Table ${activeIndex + 1}</div>
              <div class="table-responsive">
                <table class="data-table generated-subtable">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Product ID</th>
                      <th>Product Name</th>
                      <th>SKU</th>
                      <th>Supplier</th>
                      <th>Color</th>
                      <th>Size</th>
                      <th>Material</th>
                      <th>Category</th>
                      <th>Cost</th>
                      <th>SRP</th>
                      <th>Qty</th>
                      <th>Total Expenses</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildInventoryRows(activeTable)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function renderStockHistoryChunkTables(items) {
    const tables = chunkRecords(items, 10);
    const groupKey = "stockHistory-all";
    const activeIndex = getPagerState("stockHistory", groupKey, tables.length);
    const activeTable = tables[activeIndex] || tables[0] || [];

    return `
      <tr>
        <td colspan="12" class="grouped-table-wrapper-cell">
          <div class="daily-group-block">
            <div class="daily-group-header daily-group-header-with-pages inventory-pages-right">
              <div></div>
              ${buildPagerButtons("stockHistory", groupKey, tables.length, activeIndex)}
            </div>

            <div class="grouped-table-card">
              <div class="grouped-table-title">Table ${activeIndex + 1}</div>
              <div class="table-responsive">
                <table class="data-table generated-subtable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Product Name</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Old Qty</th>
                      <th>New Qty</th>
                      <th>Difference</th>
                      <th>Movement</th>
                      <th>Sale Amount</th>
                      <th>Profit Amount</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${buildStockHistoryRows(activeTable)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function renderInventoryTable(filter = inventoryFilters.search, category = inventoryFilters.category) {
    const tbody = document.getElementById("inventoryTableBody");
    if (!tbody) return;

    const term = String(filter || "").trim().toLowerCase();
    const selectedCategory = String(category || "all").trim();

    inventoryFilters.search = String(filter || "");
    inventoryFilters.category = selectedCategory || "all";
    persistUiState();

    const items = state.inventory.filter(item => {
      const haystack = [
        item.productId,
        item.productName,
        item.sku,
        item.supplier,
        item.color,
        item.size,
        item.material,
        item.description,
        item.category
      ].join(" ").toLowerCase();

      const matchesSearch = haystack.includes(term);
      const matchesCategory =
        selectedCategory === "all" ||
        String(item.category || "").trim().toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });

    ensureInventoryCategoryFilter();
    syncInventoryFilterInputs();

    if (!items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="15" class="empty-state">
            No inventory records found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = renderInventoryChunkTables(items);
  }

  function renderProductsTable(filter = productFilters.search, category = productFilters.category) {
    const tbody = document.getElementById("productsTableBody");
    if (!tbody) return;

    const term = String(filter || "").trim().toLowerCase();
    const selectedCategory = String(category || "all").trim();

    productFilters.search = String(filter || "");
    productFilters.category = selectedCategory || "all";
    persistUiState();

    const items = state.products.filter(item => {
      const haystack = [
        item.productId,
        item.productName,
        item.sku,
        item.supplier,
        item.color,
        item.size,
        item.material,
        item.description,
        item.category
      ].join(" ").toLowerCase();

      const matchesSearch = haystack.includes(term);
      const matchesCategory =
        selectedCategory === "all" ||
        String(item.category || "").trim().toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });

    ensureProductsCategoryFilter();
    syncProductFilterInputs();

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="13" class="empty-state">No products found.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => `
      <tr>
        <td>${renderImageCell(item.imageData, item.productName)}</td>
        <td>${escapeHtml(item.productId || "-")}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.supplier || "-")}</td>
        <td>${escapeHtml(item.color || "-")}</td>
        <td>${escapeHtml(item.size || "-")}</td>
        <td>${escapeHtml(item.material || "-")}</td>
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

  function renderStockHistoryTable(
    filter = stockHistoryFilters.search,
    selectedDate = stockHistoryFilters.date,
    category = stockHistoryFilters.category
  ) {
    const tbody = document.getElementById("stockHistoryTableBody");
    if (!tbody) return;

    const term = String(filter || "").trim().toLowerCase();
    const normalizedDate = normalizeDateInputValue(selectedDate) || getLatestStockHistoryDate();
    const selectedCategory = String(category || "all").trim();

    stockHistoryFilters.search = String(filter || "");
    stockHistoryFilters.date = normalizedDate;
    stockHistoryFilters.category = selectedCategory || "all";
    persistUiState();

    let items = [...(Array.isArray(state.stockHistory) ? state.stockHistory : [])];

    items = items.filter(entry => {
      const haystack = [
        entry.productName,
        entry.sku,
        entry.category,
        entry.note,
        entry.movementType
      ].join(" ").toLowerCase();

      const matchesSearch = haystack.includes(term);
      const matchesDate = normalizedDate ? toDateOnlyKey(entry.createdAt) === normalizedDate : true;
      const matchesCategory =
        selectedCategory === "all" ||
        String(entry.category || "").trim().toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesDate && matchesCategory;
    });

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    ensureStockHistoryCategoryFilter();
    syncStockHistoryFilterInputs();

    if (!items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="empty-state">
            No stock movement history found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = renderStockHistoryChunkTables(items);
  }

  function renderRecentInventoryDashboard(containerId = "recentInventoryDashboard") {
    const container = document.getElementById(containerId);
    if (!container) return;

    const grouped = getRecentGroupedRecords(state.inventory, {
      dateField: "createdAt",
      chunkSize: 10,
      maxGroups: 2,
      maxRowsPerGroup: 5
    });

    if (!grouped.length) {
      container.innerHTML = `<div class="empty-state">No recent inventory records.</div>`;
      return;
    }

    container.innerHTML = grouped.map(group => {
      const groupKey = `recentInventory-${group.dateKey}`;
      const activeIndex = getPagerState("recentInventory", groupKey, group.tables.length);
      const activeTable = group.tables[activeIndex] || group.tables[0] || [];

      return `
        <div class="daily-group-block">
          <div class="daily-group-header daily-group-header-with-pages inventory-pages-right">
            <h3>${escapeHtml(group.date)}</h3>
            ${buildPagerButtons("recentInventory", groupKey, group.tables.length, activeIndex)}
          </div>

          <div class="grouped-table-card">
            <div class="grouped-table-title">Recent Table ${activeIndex + 1}</div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Product ID</th>
                    <th>Product Name</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeTable.map(item => {
                    const qty = Number(item.quantity) || 0;
                    const isLowStock = qty <= 5;
                    const statusText = isLowStock ? "Low Stock" : "In Stock";
                    const stockStatusClass = isLowStock ? "low-stock" : "in-stock";

                    return `
                      <tr>
                        <td>${renderImageCell(item.imageData, item.productName)}</td>
                        <td>${escapeHtml(item.productId || "-")}</td>
                        <td>${escapeHtml(item.productName)}</td>
                        <td>${escapeHtml(item.sku)}</td>
                        <td>${qty}</td>
                        <td><span class="stock-status ${stockStatusClass}">${statusText}</span></td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderRecentStockHistoryDashboard(containerId = "recentStockHistoryDashboard") {
    const container = document.getElementById(containerId);
    if (!container) return;

    const recentHistory = Array.isArray(state.stockHistory) ? state.stockHistory : [];

    const grouped = getRecentGroupedRecords(recentHistory, {
      dateField: "createdAt",
      chunkSize: 10,
      maxGroups: 2,
      maxRowsPerGroup: 5
    });

    if (!grouped.length) {
      container.innerHTML = `<div class="empty-state">No recent stock history.</div>`;
      return;
    }

    container.innerHTML = grouped.map(group => {
      const groupKey = `recentStockHistory-${group.dateKey}`;
      const activeIndex = getPagerState("recentStockHistory", groupKey, group.tables.length);
      const activeTable = group.tables[activeIndex] || group.tables[0] || [];

      return `
        <div class="daily-group-block">
          <div class="daily-group-header daily-group-header-with-pages inventory-pages-right">
            <h3>${escapeHtml(group.date)}</h3>
            ${buildPagerButtons("recentStockHistory", groupKey, group.tables.length, activeIndex)}
          </div>

          <div class="grouped-table-card">
            <div class="grouped-table-title">Recent Table ${activeIndex + 1}</div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Difference</th>
                    <th>Movement</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeTable.map(entry => {
                    const difference = entry.difference ?? ((Number(entry.newQuantity) || 0) - (Number(entry.oldQuantity) || 0));
                    return `
                      <tr>
                        <td>${formatHistoryTime(entry.createdAt)}</td>
                        <td>${escapeHtml(entry.productName || "-")}</td>
                        <td>${escapeHtml(entry.sku || "-")}</td>
                        <td class="history-diff ${differenceClass(difference)}">${formatDifference(difference)}</td>
                        <td>
                          <span class="movement-pill ${movementClass(entry.movementType)}">
                            ${escapeHtml(entry.movementType || "No Change")}
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }).join("");
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
          onclick="window.RackTrackInventoryPanel.deleteCategory('${category.id}')"
        >
          Delete
        </button>
      </div>
    `).join("");
  }

  function switchInventoryTab(tabName) {
    state.currentInventoryTab = tabName || "items";
    persistUiState();

    document.querySelectorAll(".inventory-top-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.inventoryTab === state.currentInventoryTab);
    });

    const itemsView = document.getElementById("inventory-items-view");
    const productsView = document.getElementById("inventory-products-view");
    const mainActionBtn = document.getElementById("inventoryMainActionBtn");

    if (itemsView) itemsView.classList.toggle("active", state.currentInventoryTab === "items");
    if (productsView) productsView.classList.toggle("active", state.currentInventoryTab === "products");

    if (mainActionBtn) {
      mainActionBtn.textContent = state.currentInventoryTab === "products" ? "+ Add Product" : "+ Add Item";
    }
  }

  function openSellModal(id) {
    const item = findInventoryById(id);
    if (!item) {
      alert("Inventory item not found.");
      return;
    }

    if ((Number(item.quantity) || 0) <= 0) {
      alert("This item is out of stock.");
      return;
    }

    window.RackTrack.state.editId = null;
    window.RackTrack.buildForm("sell", { id: item.id, inventoryId: item.id });
    const modal = document.getElementById("formModal");
    if (modal) modal.classList.add("show");
    preventFormModalOutsideClose();
  }

  function refreshInventoryViews() {
    ensureInventoryCategoryFilter();
    ensureProductsCategoryFilter();
    ensureStockHistoryCategoryFilter();
    renderInventoryTable(inventoryFilters.search, inventoryFilters.category);
    renderProductsTable(productFilters.search, productFilters.category);
    renderStockHistoryTable(stockHistoryFilters.search, stockHistoryFilters.date, stockHistoryFilters.category);
    renderRecentInventoryDashboard("recentInventoryDashboard");
    renderRecentStockHistoryDashboard("recentStockHistoryDashboard");
    renderCategoryList();
    syncInventoryFilterInputs();
    syncProductFilterInputs();
    syncStockHistoryFilterInputs();
    switchInventoryTab(state.currentInventoryTab || "items");
  }

  function handleCategorySubmit(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const name = String(formData.get("categoryName") || "").trim();
    const color = String(formData.get("categoryColor") || "#f2b14c");

    if (!name) {
      alert("Category name is required.");
      return;
    }

    const existing = state.categories.find(item =>
      String(item.name || "").trim().toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      alert("Category already exists.");
      return;
    }

    state.categories.unshift({
      id: crypto.randomUUID(),
      name,
      color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    flushAllNow();

    form.reset();

    const colorInput = document.getElementById("categoryColor");
    if (colorInput) colorInput.value = "#f2b14c";

    refreshInventoryViews();
    if (typeof refreshAll === "function") refreshAll();
    notifySaved("Category");
  }

  function deleteCategory(id) {
    const category = state.categories.find(item => item.id === id);
    if (!category) return;

    const usedInProducts = state.products.some(product =>
      String(product.category || "").trim().toLowerCase() === String(category.name || "").trim().toLowerCase()
    );

    const usedInInventory = state.inventory.some(item =>
      String(item.category || "").trim().toLowerCase() === String(category.name || "").trim().toLowerCase()
    );

    if (usedInProducts || usedInInventory) {
      alert("This category is already used by products or inventory. Remove those first before deleting the category.");
      return;
    }

    const approved = confirm(`Delete category "${category.name}"?`);
    if (!approved) return;

    state.categories = state.categories.filter(item => item.id !== id);
    flushAllNow();

    refreshInventoryViews();
    if (typeof refreshAll === "function") refreshAll();
    showToast(`Category "${category.name}" deleted successfully.`, "success");
  }

  registerEntity("products", {
    label: "Product",
    isWide: true,
    formHTML: productFormHTML,
    afterBuild(values = {}) {
      attachImageUploadHandlers();
      attachProductSkuGenerator(values);
      preventFormModalOutsideClose();
    },
    onSubmit(payload) {
      payload.productId = ensureUniqueProductId(
        payload.productId || generateNextProductId(),
        state.editId || ""
      );

      if (!payload.category) {
        alert("Please select a category.");
        return false;
      }

      payload.sku = generateSkuFromAttributes(payload);
      payload.cost = Number(payload.cost) || 0;
      payload.srp = Number(payload.srp) || 0;
      payload.updatedAt = new Date().toISOString();

      const existingProductId = state.products.find(item => {
        if (state.editId && item.id === state.editId) return false;
        return String(item.productId || "").trim().toLowerCase() === String(payload.productId || "").trim().toLowerCase();
      });

      if (existingProductId) {
        alert("Product ID already exists.");
        return false;
      }

      if (state.editId) {
        const oldRecord = state.products.find(item => item.id === state.editId);

        state.products = state.products.map(item =>
          item.id === state.editId
            ? { ...item, ...payload }
            : item
        );

        if (typeof syncInventoryFromProduct === "function") {
          try {
            syncInventoryFromProduct(payload, oldRecord?.sku || payload.sku);
          } catch (error) {
            console.warn("syncInventoryFromProduct failed:", error);
          }
        }

        state.products = sortByCreatedDesc(dedupeRecords(
          state.products,
          item => String(item.id || item.productId || "").trim().toLowerCase()
        ));

        flushAllNow();
        refreshInventoryViews();
        notifySaved("Product");
      } else {
        state.products.unshift({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...payload
        });

        state.products = sortByCreatedDesc(dedupeRecords(
          state.products,
          item => String(item.id || item.productId || "").trim().toLowerCase()
        ));

        flushAllNow();
        refreshInventoryViews();
        notifySaved("Product");
      }

      if (typeof refreshAll === "function") refreshAll();
      return true;
    },
    afterDelete(record) {
      if (record?.productId) {
        state.inventory = state.inventory.filter(item =>
          String(item.productId || "").trim().toLowerCase() !== String(record.productId || "").trim().toLowerCase()
        );
      }

      flushAllNow();
      refreshInventoryViews();
      if (typeof refreshAll === "function") refreshAll();
    }
  });

  registerEntity("inventory", {
    label: "Inventory Item",
    isWide: true,
    formHTML: inventoryFormHTML,
    afterBuild(values = {}) {
      attachInventoryProductHandlers(values.sku || "", values.productId || "");

      if (state.editId) {
        attachInventoryQuantityNoteHandlers(Number(values.quantity) || 0);
      }

      preventFormModalOutsideClose();
    },
    onSubmit(payload) {
      const existingRecord = state.editId
        ? state.inventory.find(item => item.id === state.editId)
        : null;

      const selectedProductId = String(
        payload.sourceProductId ||
        existingRecord?.productId ||
        payload.productId ||
        ""
      ).trim();

      const sourceProduct =
        findProductByProductId(selectedProductId) ||
        findProductBySkuOrProductId(payload.sku || payload.productId || "");

      if (!sourceProduct) {
        alert("Please select a valid product from the Products list.");
        return false;
      }

      const newQuantity = Number(payload.quantity) || 0;

      if (state.editId) {
        const oldQuantity = Number(existingRecord?.quantity) || 0;
        const movementType = getMovementType(oldQuantity, newQuantity);
        const stockNote = String(payload.stockNote || "").trim();

        if (movementType !== "No Change" && !stockNote) {
          alert("Reason / Note is required when quantity changes.");
          return false;
        }

        const inventoryPayload = {
          productId: sourceProduct.productId || "",
          productName: sourceProduct.productName,
          sku: sourceProduct.sku,
          supplier: sourceProduct.supplier || "",
          color: sourceProduct.color || "",
          size: sourceProduct.size || "",
          material: sourceProduct.material || "",
          description: sourceProduct.description || "",
          category: sourceProduct.category,
          cost: Number(sourceProduct.cost) || 0,
          srp: Number(sourceProduct.srp) || 0,
          quantity: newQuantity,
          imageData: sourceProduct.imageData || "",
          updatedAt: new Date().toISOString()
        };

        state.inventory = state.inventory.map(item =>
          item.id === state.editId ? { ...item, ...inventoryPayload } : item
        );

        if (movementType !== "No Change") {
          addStockHistorySafely({
            id: crypto.randomUUID(),
            itemId: existingRecord?.id || state.editId,
            inventoryId: existingRecord?.id || state.editId,
            productId: sourceProduct.productId || "",
            productName: sourceProduct.productName,
            sku: sourceProduct.sku,
            category: sourceProduct.category,
            oldQuantity,
            newQuantity,
            oldQty: oldQuantity,
            newQty: newQuantity,
            difference: newQuantity - oldQuantity,
            movementType,
            note: stockNote,
            createdAt: new Date().toISOString()
          });
        }

        state.inventory = sortByCreatedDesc(dedupeRecords(
          state.inventory,
          item => String(item.id || item.productId || item.sku || "").trim().toLowerCase()
        ));

        flushAllNow();
        refreshInventoryViews();
        notifySaved("Inventory item");
      } else {
        const inventoryPayload = {
          productId: sourceProduct.productId || "",
          productName: sourceProduct.productName,
          sku: sourceProduct.sku,
          supplier: sourceProduct.supplier || "",
          color: sourceProduct.color || "",
          size: sourceProduct.size || "",
          material: sourceProduct.material || "",
          description: sourceProduct.description || "",
          category: sourceProduct.category,
          cost: Number(sourceProduct.cost) || 0,
          srp: Number(sourceProduct.srp) || 0,
          quantity: newQuantity,
          imageData: sourceProduct.imageData || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const existingIndex = state.inventory.findIndex(item =>
          String(item.productId || "").trim().toLowerCase() === String(sourceProduct.productId || "").trim().toLowerCase()
        );

        if (existingIndex >= 0) {
          const oldQuantity = Number(state.inventory[existingIndex].quantity) || 0;

          state.inventory[existingIndex] = {
            ...state.inventory[existingIndex],
            ...inventoryPayload
          };

          addStockHistorySafely({
            id: crypto.randomUUID(),
            itemId: state.inventory[existingIndex].id,
            inventoryId: state.inventory[existingIndex].id,
            productId: sourceProduct.productId || "",
            productName: sourceProduct.productName,
            sku: sourceProduct.sku,
            category: sourceProduct.category,
            oldQuantity,
            newQuantity,
            oldQty: oldQuantity,
            newQty: newQuantity,
            difference: newQuantity - oldQuantity,
            movementType: getMovementType(oldQuantity, newQuantity),
            note: "Inventory item updated from add item form",
            createdAt: new Date().toISOString()
          });

          state.inventory = sortByCreatedDesc(dedupeRecords(
            state.inventory,
            item => String(item.id || item.productId || item.sku || "").trim().toLowerCase()
          ));

          flushAllNow();
          refreshInventoryViews();
          notifySaved("Inventory item");
        } else {
          const newItem = {
            id: crypto.randomUUID(),
            ...inventoryPayload
          };

          state.inventory.unshift(newItem);

          addStockHistorySafely({
            id: crypto.randomUUID(),
            itemId: newItem.id,
            inventoryId: newItem.id,
            productId: sourceProduct.productId || "",
            productName: sourceProduct.productName,
            sku: sourceProduct.sku,
            category: sourceProduct.category,
            oldQuantity: 0,
            newQuantity,
            oldQty: 0,
            newQty: newQuantity,
            difference: newQuantity,
            movementType: "Stock In",
            note: "Initial inventory entry",
            createdAt: new Date().toISOString()
          });

          state.inventory = sortByCreatedDesc(dedupeRecords(
            state.inventory,
            item => String(item.id || item.productId || item.sku || "").trim().toLowerCase()
          ));

          flushAllNow();
          refreshInventoryViews();
          notifySaved("Inventory item");
        }
      }

      if (typeof refreshAll === "function") refreshAll();
      return true;
    }
  });

  registerEntity("sell", {
    label: "Sell Item",
    isWide: true,
    submitLabel: "Confirm Sale",
    formHTML: sellFormHTML,
    afterBuild() {
      attachSellCalculationHandlers();
      preventFormModalOutsideClose();
    },
    onSubmit(payload) {
      const item = findInventoryById(payload.inventoryId);
      if (!item) {
        alert("Inventory item not found.");
        return false;
      }

      const oldQuantity = Number(item.quantity) || 0;
      const quantitySold = Number(payload.quantitySold) || 0;
      const customerName = String(payload.customerName || "").trim();

      if (!customerName) {
        alert("Customer Name is required.");
        return false;
      }

      if (quantitySold <= 0) {
        alert("Quantity to sell must be greater than 0.");
        return false;
      }

      if (quantitySold > oldQuantity) {
        alert("Quantity to sell cannot be greater than available stock.");
        return false;
      }

      const saleAmount = calculateRevenue(item.srp, quantitySold);
      const profitAmount = calculateProfit(item.cost, item.srp, quantitySold);
      const newQuantity = oldQuantity - quantitySold;
      const soldAt = payload.soldDate ? `${payload.soldDate}T00:00:00` : new Date().toISOString();

      state.inventory = state.inventory.map(inventoryItem => {
        if (String(inventoryItem.id) === String(item.id)) {
          return {
            ...inventoryItem,
            quantity: newQuantity,
            updatedAt: soldAt
          };
        }
        return inventoryItem;
      });

      addSaleSafely({
        id: crypto.randomUUID(),
        inventoryId: item.id,
        productId: item.productId || "",
        imageData: item.imageData || "",
        productName: item.productName,
        customerName,
        sku: item.sku,
        supplier: item.supplier || "",
        color: item.color || "",
        size: item.size || "",
        material: item.material || "",
        category: item.category,
        variant: formatAttributeLine(item),
        quantitySold,
        quantity: quantitySold,
        sold: quantitySold,
        cost: Number(item.cost) || 0,
        srp: Number(item.srp) || 0,
        saleAmount,
        totalSaleAmount: saleAmount,
        totalRevenue: saleAmount,
        profitAmount,
        totalProfit: profitAmount,
        soldAt,
        createdAt: soldAt,
        oldQty: oldQuantity,
        newQty: newQuantity,
        oldQuantity,
        newQuantity,
        note: payload.sellNote || "Sold from Inventory panel"
      });

      addStockHistorySafely({
        id: crypto.randomUUID(),
        itemId: item.id,
        inventoryId: item.id,
        productId: item.productId || "",
        productName: item.productName,
        sku: item.sku,
        category: item.category,
        oldQuantity,
        newQuantity,
        oldQty: oldQuantity,
        newQty: newQuantity,
        difference: newQuantity - oldQuantity,
        movementType: "Sold",
        note: payload.sellNote || `Sold ${quantitySold} item(s)`,
        saleAmount,
        profitAmount,
        createdAt: soldAt
      });

      flushAllNow();
      refreshInventoryViews();
      if (typeof refreshAll === "function") refreshAll();
      notifySaved("Sale");
      return true;
    }
  });

  registerPanel({
    name: "inventory",
    render() {
      hydrateInventoryModuleState();

      ensureStockHistoryDefaultDate();
      ensureInventoryCategoryFilter();
      ensureProductsCategoryFilter();
      ensureStockHistoryCategoryFilter();
      preventFormModalOutsideClose();

      refreshInventoryViews();
    }
  });

  function handleTablePagerClick(event) {
    const button = event.target.closest("[data-table-page-btn]");
    if (!button) return;

    const scope = String(button.dataset.scope || "");
    const groupKey = String(button.dataset.groupKey || "");
    const tableIndex = Number(button.dataset.tableIndex);

    if (!scope || !groupKey || Number.isNaN(tableIndex)) return;

    setPagerState(scope, groupKey, tableIndex);

    if (scope === "inventory") {
      renderInventoryTable(inventoryFilters.search, inventoryFilters.category);
      return;
    }

    if (scope === "stockHistory") {
      renderStockHistoryTable(
        stockHistoryFilters.search,
        stockHistoryFilters.date,
        stockHistoryFilters.category
      );
      return;
    }

    if (scope === "recentInventory") {
      renderRecentInventoryDashboard("recentInventoryDashboard");
      return;
    }

    if (scope === "recentStockHistory") {
      renderRecentStockHistoryDashboard("recentStockHistoryDashboard");
    }
  }

  function setupInventoryEvents() {
    hydrateInventoryModuleState();
    ensureStockHistoryDefaultDate();
    ensureInventoryCategoryFilter();
    ensureProductsCategoryFilter();
    ensureStockHistoryCategoryFilter();
    preventFormModalOutsideClose();

    const inventorySearch = document.getElementById("inventorySearch");
    if (inventorySearch && !inventorySearch.dataset.bound) {
      inventorySearch.dataset.bound = "true";
      inventorySearch.addEventListener("input", event => {
        applyInventoryFilters({
          search: event.target.value,
          category: inventoryFilters.category
        });
      });
    }

    const inventoryCategorySort = getInventoryCategorySelect();
    if (inventoryCategorySort && !inventoryCategorySort.dataset.bound) {
      inventoryCategorySort.dataset.bound = "true";
      inventoryCategorySort.addEventListener("change", event => {
        applyInventoryFilters({
          search: inventoryFilters.search,
          category: event.target.value
        });
      });
    }

    const productsSearch = document.getElementById("productsSearch");
    if (productsSearch && !productsSearch.dataset.bound) {
      productsSearch.dataset.bound = "true";
      productsSearch.addEventListener("input", event => {
        applyProductFilters({
          search: event.target.value,
          category: productFilters.category
        });
      });
    }

    const productsCategorySort = getProductsCategorySelect();
    if (productsCategorySort && !productsCategorySort.dataset.bound) {
      productsCategorySort.dataset.bound = "true";
      productsCategorySort.addEventListener("change", event => {
        applyProductFilters({
          search: productFilters.search,
          category: event.target.value
        });
      });
    }

    const stockHistorySearch = document.getElementById("stockHistorySearch");
    if (stockHistorySearch && !stockHistorySearch.dataset.bound) {
      stockHistorySearch.dataset.bound = "true";
      stockHistorySearch.addEventListener("input", event => {
        applyStockHistoryFilters({
          search: event.target.value,
          date: stockHistoryFilters.date,
          category: stockHistoryFilters.category
        });
      });
    }

    const stockHistoryCategorySort = getStockHistoryCategorySelect();
    if (stockHistoryCategorySort && !stockHistoryCategorySort.dataset.bound) {
      stockHistoryCategorySort.dataset.bound = "true";
      stockHistoryCategorySort.addEventListener("change", event => {
        applyStockHistoryFilters({
          search: stockHistoryFilters.search,
          date: stockHistoryFilters.date,
          category: event.target.value
        });
      });
    }

    const stockHistoryDateInput = getStockHistoryDateInput();
    if (stockHistoryDateInput && !stockHistoryDateInput.dataset.bound) {
      stockHistoryDateInput.dataset.bound = "true";
      stockHistoryDateInput.value = ensureStockHistoryDefaultDate();

      if (!stockHistoryDateInput.getAttribute("placeholder")) {
        stockHistoryDateInput.setAttribute("placeholder", "mm/dd/yyyy");
      }

      stockHistoryDateInput.addEventListener("change", event => {
        applyStockHistoryFilters({
          search: stockHistoryFilters.search,
          date: event.target.value,
          category: stockHistoryFilters.category
        });
      });

      stockHistoryDateInput.addEventListener("input", event => {
        const value = String(event.target.value || "").trim();
        if (!value) {
          const latestDate = getLatestStockHistoryDate();
          stockHistoryFilters.date = latestDate;
          event.target.value = latestDate;
          applyStockHistoryFilters({
            search: stockHistoryFilters.search,
            date: latestDate,
            category: stockHistoryFilters.category
          });
        }
      });
    }

    const latestBtn = getStockHistoryLatestButton();
    if (latestBtn && !latestBtn.dataset.bound) {
      latestBtn.dataset.bound = "true";
      latestBtn.addEventListener("click", () => {
        const latestDate = getLatestStockHistoryDate();

        if (!latestDate) {
          alert("No stock movement history found.");
          return;
        }

        stockHistoryFilters.date = latestDate;

        const dateInput = getStockHistoryDateInput();
        if (dateInput) {
          dateInput.value = latestDate;
        }

        applyStockHistoryFilters({
          search: stockHistoryFilters.search,
          date: latestDate,
          category: stockHistoryFilters.category
        });
      });
    }

    const globalSearch = document.getElementById("globalSearch");
    if (globalSearch && !globalSearch.dataset.inventoryBound) {
      globalSearch.dataset.inventoryBound = "true";
      globalSearch.addEventListener("input", event => {
        const term = String(event.target.value || "").trim().toLowerCase();

        if (!term) {
          refreshInventoryViews();
          if (typeof refreshAll === "function") refreshAll();
          return;
        }

        renderInventoryTable(term, inventoryFilters.category);
        renderProductsTable(term, productFilters.category);
        renderStockHistoryTable(term, stockHistoryFilters.date, stockHistoryFilters.category);
      });
    }

    document.querySelectorAll(".inventory-top-tab").forEach(btn => {
      if (btn.dataset.bound === "true") return;
      btn.dataset.bound = "true";
      btn.addEventListener("click", () => {
        switchInventoryTab(btn.dataset.inventoryTab);
      });
    });

    const inventoryMainActionBtn = document.getElementById("inventoryMainActionBtn");
    if (inventoryMainActionBtn && !inventoryMainActionBtn.dataset.bound) {
      inventoryMainActionBtn.dataset.bound = "true";
      inventoryMainActionBtn.addEventListener("click", () => {
        hydrateInventoryModuleState();

        if (state.currentInventoryTab === "products") {
          openModal("products");
        } else {
          openModal("inventory");
        }

        setTimeout(() => {
          preventFormModalOutsideClose();
        }, 0);
      });
    }

    const categoryForm = document.getElementById("categoryForm");
    if (categoryForm && !categoryForm.dataset.bound) {
      categoryForm.dataset.bound = "true";
      categoryForm.addEventListener("submit", handleCategorySubmit);
    }

    if (!document.body.dataset.inventoryPagerBound) {
      document.body.dataset.inventoryPagerBound = "true";
      document.addEventListener("click", handleTablePagerClick);
    }

    if (!window.__rackTrackInventoryPersistenceBound) {
      window.__rackTrackInventoryPersistenceBound = true;

      window.addEventListener("beforeunload", flushAllNow);
      window.addEventListener("pagehide", flushAllNow);

      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          flushAllNow();
        }
      });

      document.addEventListener("racktrack:pos-updated", () => {
        hydrateInventoryModuleState();
        flushAllNow();
        refreshInventoryViews();
      });

      document.addEventListener("racktrack:inventory-updated", () => {
        hydrateInventoryModuleState();
        flushAllNow();
        refreshInventoryViews();
      });
    }

    switchInventoryTab(state.currentInventoryTab || "items");
    refreshInventoryViews();
  }

  window.RackTrackInventoryPanel = {
    renderInventoryTable,
    renderProductsTable,
    renderStockHistoryTable,
    renderRecentInventoryDashboard,
    renderRecentStockHistoryDashboard,
    renderCategoryList,
    switchInventoryTab,
    setupInventoryEvents,
    openSellModal,
    deleteCategory,
    applyInventoryFilters,
    applyProductFilters,
    applyStockHistoryFilters,
    generateSkuFromAttributes,
    generateNextProductId,
    ensureUniqueProductId,
    formatAttributeLine,
    findProductBySkuOrProductId,
    preventFormModalOutsideClose,
    hydrateInventoryModuleState,
    persistAllInventoryModuleState,
    hardSaveAllNow,
    flushAllNow,
    showToast,
    refreshInventoryViews
  };

  document.addEventListener("DOMContentLoaded", function () {
    hydrateInventoryModuleState();
    setupInventoryEvents();

    setTimeout(() => {
      flushAllNow();
      refreshInventoryViews();
    }, 0);
  });
})();