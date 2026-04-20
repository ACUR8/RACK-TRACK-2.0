(function () {
  const {
    state,
    registerPanel,
    setText,
    getMetrics,
    getDailyReportGroups,
    formatHistoryDate,
    formatHistoryTime,
    renderCategoryBadge,
    escapeHtml,
    peso,
    removeDailyRecord,
    requestSensitiveDeleteApproval,
    refreshAll
  } = window.RackTrack;

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

  function getTypeBadge(type) {
    if (type === "inventory-added") {
      return `<span class="report-type-pill added">Added to Inventory</span>`;
    }

    if (type === "sold") {
      return `<span class="report-type-pill sold">Sold</span>`;
    }

    return `<span class="report-type-pill order">Order</span>`;
  }

  function renderSummaryCards() {
    const metrics = getMetrics();

    setText("reportInventoryCount", metrics.inventoryTotal);
    setText("reportOrderCount", metrics.ordersTotal);
    setText("reportCustomerCount", metrics.customersTotal);
    setText("reportLowStockCount", metrics.lowStockTotal);
  }

  function deleteDailyRecord(recordId) {
    const approved = requestSensitiveDeleteApproval("daily report record");
    if (!approved) return;

    removeDailyRecord(recordId);
    refreshAll();
  }

  // 🔥 DAILY SUMMARY CALCULATION
  function getDailyQuickSummaries() {
    const salesHistory = getSalesHistory();
    const dailyMap = {};

    salesHistory.forEach(sale => {
      const dateKey = getDateKey(getSaleDate(sale));

      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = {
          date: dateKey,
          transactions: 0,
          unitsSold: 0,
          revenue: 0,
          profit: 0
        };
      }

      dailyMap[dateKey].transactions += 1;
      dailyMap[dateKey].unitsSold += getSaleQuantity(sale);
      dailyMap[dateKey].revenue += getSaleRevenue(sale);
      dailyMap[dateKey].profit += getSaleProfit(sale);
    });

    return Object.values(dailyMap).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
  }

  // 🎨 MODERN UI SUMMARY (MATCH YOUR DESIGN)
  function buildQuickSummaryHTML() {
    const summaries = getDailyQuickSummaries();

    if (!summaries.length) {
      return `
        <div class="crud-card">
          <div class="daily-quick-summary-header">
            <h3>Daily Profit Summary</h3>
          </div>
          <div class="empty-state">No profit summary yet.</div>
        </div>
      `;
    }

    return `
      <div class="crud-card">
        <div class="daily-quick-summary-header">
          <h3>Daily Profit Summary</h3>
        </div>

        <div class="daily-summary-grid">
          ${summaries.map(item => `
            <div class="daily-summary-card">
              <div class="daily-summary-top">
                <div class="daily-summary-date">
                  ${formatHistoryDate ? formatHistoryDate(item.date) : item.date}
                </div>
              </div>

              <div class="daily-summary-label">Net Profit</div>
              <div class="daily-summary-profit">${peso(item.profit)}</div>

              <div class="daily-summary-meta">
                <div class="daily-summary-meta-row">
                  <span>Sales</span>
                  <span>${peso(item.revenue)}</span>
                </div>
                <div class="daily-summary-meta-row">
                  <span>Transactions</span>
                  <span>${item.transactions}</span>
                </div>
                <div class="daily-summary-meta-row">
                  <span>Units Sold</span>
                  <span>${item.unitsSold}</span>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function buildDailyDetailedReportsHTML() {
    const groups = getDailyReportGroups();

    if (!groups.length) {
      return `
        <div class="crud-card">
          <div class="empty-state">No daily report records yet.</div>
        </div>
      `;
    }

    return groups.map(group => `
      <div class="daily-report-group">
        <div class="daily-report-head">
          <h3>Daily Activity Report</h3>
          <div class="daily-report-meta">
            <span class="daily-report-date">${formatHistoryDate(group.date)}</span>
          </div>
        </div>

        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Sale Amount</th>
                <th>Profit</th>
                <th>Note</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              ${group.entries.map(entry => `
                <tr>
                  <td>${formatHistoryTime(entry.occurredAt)}</td>
                  <td>${getTypeBadge(entry.sourceType)}</td>
                  <td>${escapeHtml(entry.productName || "-")}</td>
                  <td>${escapeHtml(entry.sku || "-")}</td>
                  <td>${renderCategoryBadge(entry.category || "")}</td>
                  <td>${toNumber(entry.quantity)}</td>
                  <td class="report-money">${entry.saleAmount != null ? peso(entry.saleAmount) : "-"}</td>
                  <td class="report-money">${entry.profitAmount != null ? peso(entry.profitAmount) : "-"}</td>
                  <td>${escapeHtml(entry.note || "-")}</td>
                  <td>
                    <button
                      type="button"
                      class="report-delete-row-btn"
                      onclick="window.RackTrackReportsPanel.deleteDailyRecord('${entry.id}')"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `).join("");
  }

  function renderDailyReports() {
    const wrap = document.getElementById("dailyReportsWrap");
    if (!wrap) return;

    wrap.innerHTML = `
      ${buildQuickSummaryHTML()}
      ${buildDailyDetailedReportsHTML()}
    `;
  }

  function render() {
    renderSummaryCards();
    renderDailyReports();
  }

  registerPanel({
    name: "reports",
    render
  });

  window.RackTrackReportsPanel = {
    render,
    deleteDailyRecord,
    getDailyQuickSummaries
  };
})();