(function () {
  const {
    state,
    peso,
    escapeHtml,
    formatDisplayDate,
    statusClass,
    setText,
    changePercent,
    previousMetrics,
    saveMetricsSnapshot,
    getMetrics,
    setActiveSection,
    registerPanel
  } = window.RackTrack;

  const graphState = {
    revenueGraph: [],
    expenseGraph: [],
    customerGraph: [],
    orderGraph: []
  };

  let profileMenuBound = false;

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function getDateKey(dateValue) {
    const date = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(date.getTime())) {
      const fallback = new Date();
      return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}-${String(
        fallback.getDate()
      ).padStart(2, "0")}`;
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
  }

  function getTodayKey() {
    return getDateKey(new Date());
  }

  function getSalesHistory() {
    if (Array.isArray(state.salesHistory) && state.salesHistory.length) {
      return state.salesHistory;
    }

    if (Array.isArray(state.sales) && state.sales.length) {
      return state.sales;
    }

    return [];
  }

  function getSaleQuantity(sale) {
    return (
      toNumber(sale.quantity) ||
      toNumber(sale.quantitySold) ||
      toNumber(sale.sold) ||
      0
    );
  }

  function getSaleRevenue(sale) {
    if (sale && sale.saleAmount != null) {
      return toNumber(sale.saleAmount);
    }

    if (sale && sale.totalRevenue != null) {
      return toNumber(sale.totalRevenue);
    }

    const qty = getSaleQuantity(sale);
    const srp =
      toNumber(sale.srp) ||
      toNumber(sale.price) ||
      toNumber(sale.sellPrice) ||
      0;

    return qty * srp;
  }

  function getSaleProfit(sale) {
    if (sale && sale.profitAmount != null) {
      return toNumber(sale.profitAmount);
    }

    if (sale && sale.totalProfit != null) {
      return toNumber(sale.totalProfit);
    }

    const qty = getSaleQuantity(sale);
    const srp =
      toNumber(sale.srp) ||
      toNumber(sale.price) ||
      toNumber(sale.sellPrice) ||
      0;
    const cost = toNumber(sale.cost);

    return (srp - cost) * qty;
  }

  function getSaleDate(sale) {
    return (
      sale.createdAt ||
      sale.date ||
      sale.soldAt ||
      sale.occurredAt ||
      sale.timestamp ||
      new Date().toISOString()
    );
  }

  function getTodayProfitTotal() {
    const todayKey = getTodayKey();

    return getSalesHistory()
      .filter(sale => getDateKey(getSaleDate(sale)) === todayKey)
      .reduce((total, sale) => total + getSaleProfit(sale), 0);
  }

  function getTodayRevenueTotal() {
    const todayKey = getTodayKey();

    return getSalesHistory()
      .filter(sale => getDateKey(getSaleDate(sale)) === todayKey)
      .reduce((total, sale) => total + getSaleRevenue(sale), 0);
  }

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
    const base = toNumber(value);

    if (base <= 0) {
      return [2, 3, 2, 4, 3, 5, 4];
    }

    return [
      base * 0.45,
      base * 0.62,
      base * 0.58,
      base * 0.76,
      base * 0.7,
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
    const metrics = getMetrics();
    const todayProfit = getTodayProfitTotal();

    updateSingleGraph("revenueGraph", todayProfit);
    updateSingleGraph("expenseGraph", metrics.inventoryValue);
    updateSingleGraph("customerGraph", metrics.customersTotal);
    updateSingleGraph("orderGraph", metrics.ordersTotal);
  }

  function renderLowStock() {
    const list = document.getElementById("lowStockList");
    if (!list) return;

    const inventory = Array.isArray(state.inventory) ? state.inventory : [];
    const lowItems = inventory.filter(item => toNumber(item.quantity) <= 5);

    if (!lowItems.length) {
      list.innerHTML = `<div class="empty-state">No low stock items.</div>`;
      return;
    }

    list.innerHTML = lowItems.slice(0, 3).map(item => `
      <div class="low-stock-item">
        <strong>${escapeHtml(item.productName || "Unnamed Product")}</strong>
        <div class="low-stock-meta">
          <span>Available: ${toNumber(item.quantity)}</span>
          <button class="order-link" type="button" data-jump="inventory-section">Restock</button>
        </div>
      </div>
    `).join("");

    list.querySelectorAll(".order-link").forEach(btn => {
      btn.addEventListener("click", () => {
        setActiveSection("inventory-section");

        if (
          window.RackTrackInventoryPanel &&
          typeof window.RackTrackInventoryPanel.switchInventoryTab === "function"
        ) {
          window.RackTrackInventoryPanel.switchInventoryTab("items");
        }
      });
    });
  }

  function renderRecentOrders() {
    const list = document.getElementById("recentOrdersList");
    if (!list) return;

    const orders = Array.isArray(state.orders) ? state.orders : [];

    if (!orders.length) {
      list.innerHTML = `<div class="empty-state">No recent orders.</div>`;
      return;
    }

    list.innerHTML = orders.slice(0, 3).map(order => `
      <div class="recent-item">
        <div class="recent-left">
          <img src="../assets/images/package.png" alt="Order item" />
          <div class="recent-main">
            <strong>${escapeHtml(order.item || "Unnamed Item")}</strong>
            <em>Order id: ${escapeHtml(order.orderId || "N/A")}</em>
          </div>
        </div>
        <div class="recent-right">
          <time>${formatDisplayDate ? formatDisplayDate(order.date) : (order.date || "-")}</time>
          <span class="status-pill ${statusClass ? statusClass(order.status) : ""}">
            ${escapeHtml(order.status || "Pending")}
          </span>
        </div>
      </div>
    `).join("");
  }

  function renderTopSelling() {
    const tbody = document.getElementById("topSellingBody");
    if (!tbody) return;

    const salesHistory = getSalesHistory();

    if (!salesHistory.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No sales data yet.</td></tr>`;
      return;
    }

    const salesMap = {};

    salesHistory.forEach(sale => {
      const itemName = String(sale.productName || sale.name || "").trim() || "Unnamed Product";

      if (!salesMap[itemName]) {
        salesMap[itemName] = {
          name: itemName,
          sold: 0,
          total: 0
        };
      }

      salesMap[itemName].sold += getSaleQuantity(sale);
      salesMap[itemName].total += getSaleRevenue(sale);
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

  function renderDashboardStats() {
    const metrics = getMetrics();
    const todayProfit = getTodayProfitTotal();
    const todayRevenue = getTodayRevenueTotal();

    setText("packedCount", metrics.pendingOrders);
    setText("shippedCount", metrics.processingOrders);
    setText("deliveredCount", metrics.doneOrders);
    setText("invoicedCount", metrics.ordersTotal);

    setText("inventorySummaryInStock", metrics.inventoryTotal - metrics.lowStockTotal);
    setText("inventorySummaryRestock", metrics.lowStockTotal);

    setText("dashboardRevenue", peso(todayProfit));
    setText("dashboardExpenses", peso(metrics.inventoryValue));
    setText("dashboardCustomersCount", metrics.customersTotal);
    setText("dashboardOrdersCount", metrics.ordersTotal);

    setText(
      "dashboardRevenuePercent",
      `${changePercent(previousMetrics.profitValue, todayProfit).toFixed(1)}%`
    );
    setText(
      "dashboardExpensesPercent",
      `${changePercent(previousMetrics.inventoryValue, metrics.inventoryValue).toFixed(1)}%`
    );
    setText(
      "dashboardCustomersPercent",
      `${changePercent(previousMetrics.customersTotal, metrics.customersTotal).toFixed(1)}%`
    );
    setText(
      "dashboardOrdersPercent",
      `${changePercent(previousMetrics.ordersTotal, metrics.ordersTotal).toFixed(1)}%`
    );
    setText("lowStockItemsCount", `${metrics.lowStockTotal} items`);

    previousMetrics.inventoryTotal = metrics.inventoryTotal;
    previousMetrics.ordersTotal = metrics.ordersTotal;
    previousMetrics.customersTotal = metrics.customersTotal;
    previousMetrics.lowStockTotal = metrics.lowStockTotal;
    previousMetrics.inventoryValue = metrics.inventoryValue;
    previousMetrics.revenueValue = todayRevenue;
    previousMetrics.profitValue = todayProfit;
    previousMetrics.doneOrders = metrics.doneOrders;
    previousMetrics.pendingOrders = metrics.pendingOrders;
    previousMetrics.processingOrders = metrics.processingOrders;

    saveMetricsSnapshot(previousMetrics);
  }

  function getStoredUserFromBrowser() {
    try {
      return (
        JSON.parse(localStorage.getItem("racktrackCurrentUser") || "null") ||
        JSON.parse(sessionStorage.getItem("racktrackCurrentUser") || "null") ||
        null
      );
    } catch (error) {
      return null;
    }
  }

  function getLoggedInAccount() {
    const currentUser = state.currentUser || getStoredUserFromBrowser();

    if (currentUser) {
      return {
        fullName:
          currentUser.fullName ||
          currentUser.name ||
          currentUser.displayName ||
          currentUser.username ||
          "Admin",
        username: currentUser.username || currentUser.userName || "admin",
        role: currentUser.role || "Administrator",
        email: currentUser.email || "N/A",
        lastLogin: currentUser.lastLogin || new Date().toLocaleString()
      };
    }

    const adminAccount = state.adminAccount || state.admin || null;

    if (adminAccount) {
      return {
        fullName:
          adminAccount.fullName ||
          adminAccount.name ||
          adminAccount.username ||
          "Admin",
        username: adminAccount.username || "admin",
        role: adminAccount.role || "Administrator",
        email: adminAccount.email || "N/A",
        lastLogin: adminAccount.lastLogin || new Date().toLocaleString()
      };
    }

    return {
      fullName: "Admin",
      username: "admin",
      role: "Administrator",
      email: "N/A",
      lastLogin: new Date().toLocaleString()
    };
  }

  function renderLoggedInProfile() {
    const account = getLoggedInAccount();

    setText("topbarUsername", account.username);
    setText("profileDisplayName", account.fullName);
    setText("profileDisplayRole", account.role);
    setText("profileUsername", account.username);
    setText("profileEmail", account.email);
    setText("profileLastLogin", account.lastLogin);
  }

  function closeProfileDropdown() {
    const dropdown = document.getElementById("userProfileDropdown");
    if (dropdown) {
      dropdown.classList.add("hidden");
    }
  }

  function setupUserProfileMenu() {
    if (profileMenuBound) return;

    const profileBtn = document.getElementById("profileBtn");
    const dropdown = document.getElementById("userProfileDropdown");
    const manageBtn = document.getElementById("profileManageBtn");
    const logoutBtn = document.getElementById("profileLogoutBtn");
    const sidebarLogoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
    const settingsBtn = document.getElementById("settingsBtn");

    if (profileBtn && dropdown) {
      profileBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        renderLoggedInProfile();
        dropdown.classList.toggle("hidden");
      });

      document.addEventListener("click", function (event) {
        if (!dropdown.contains(event.target) && !profileBtn.contains(event.target)) {
          dropdown.classList.add("hidden");
        }
      });
    }

    if (manageBtn) {
      manageBtn.addEventListener("click", function () {
        closeProfileDropdown();
        setActiveSection("settings-section");
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener("click", function () {
        closeProfileDropdown();
        setActiveSection("settings-section");
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        closeProfileDropdown();

        if (logoutModal) {
          logoutModal.classList.add("active");
        } else {
          doLogout();
        }
      });
    }

    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener("click", function () {
        closeProfileDropdown();

        if (logoutModal) {
          logoutModal.classList.add("active");
        } else {
          doLogout();
        }
      });
    }

    if (cancelLogoutBtn && logoutModal) {
      cancelLogoutBtn.addEventListener("click", function () {
        logoutModal.classList.remove("active");
      });
    }

    if (confirmLogoutBtn) {
      confirmLogoutBtn.addEventListener("click", function () {
        doLogout();
      });
    }

    if (logoutModal) {
      logoutModal.addEventListener("click", function (event) {
        if (event.target === logoutModal) {
          logoutModal.classList.remove("active");
        }
      });
    }

    profileMenuBound = true;
  }

  function doLogout() {
    localStorage.removeItem("racktrackCurrentUser");
    sessionStorage.removeItem("racktrackCurrentUser");

    if (state) {
      state.currentUser = null;
    }

    window.location.href = "../index.html";
  }

  function render() {
    renderLowStock();
    renderRecentOrders();
    renderTopSelling();
    renderDashboardStats();
    updateGraphs();
    renderLoggedInProfile();
    setupUserProfileMenu();
  }

  registerPanel({ name: "dashboard", render });

  window.RackTrackDashboardPanel = {
    render,
    getTodayProfitTotal
  };
})();