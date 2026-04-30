// js/app.js — Expense & Budget Visualizer application logic

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = ["Food", "Transport", "Fun"];
const STORAGE_KEY = "expense_app_state";

// ─── Module-level flags ───────────────────────────────────────────────────────

let _loadError = false;          // true when localStorage contains malformed JSON
let _storageUnavailable = false; // true when localStorage throws on read/write

// ─── AppState ─────────────────────────────────────────────────────────────────

/**
 * Single source of truth for the running application.
 * `activeView` is intentionally excluded from persistence.
 *
 * @type {{
 *   transactions: Array<{id: string, name: string, amount: number, category: string, timestamp: string}>,
 *   categories: string[],
 *   budgetLimits: Object.<string, number>,
 *   activeView: "main" | "monthly"
 * }}
 */
let AppState = {
  transactions: [],   // Transaction[]
  categories: [],     // string[]
  budgetLimits: {},   // { [category: string]: number }
  activeView: "main"  // "main" | "monthly" — NOT persisted
};

// ─── Storage Module ───────────────────────────────────────────────────────────

/**
 * Reads and parses the full app state from localStorage.
 *
 * - Returns the parsed object when the key exists and JSON is valid.
 * - Returns `null` (with `_loadError = false`) when the key simply doesn't exist.
 * - Returns `null` (with `_loadError = true`) when JSON parsing fails.
 * - Returns `null` (with `_storageUnavailable = true`) when localStorage is inaccessible.
 *
 * @returns {Object|null}
 */
function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    _storageUnavailable = true;
    return null;
  }

  // Key not present — first run, no error
  if (raw === null) {
    return null;
  }

  // Key present — attempt to parse
  try {
    return JSON.parse(raw);
  } catch (e) {
    _loadError = true;
    return null;
  }
}

/**
 * Serialises AppState (excluding `activeView`) and writes it to localStorage.
 * Sets `_storageUnavailable = true` if the write throws (quota exceeded, etc.).
 *
 * @param {typeof AppState} state
 */
function saveState(state) {
  // Exclude activeView from the persisted payload
  const { activeView, ...persistable } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch (e) {
    _storageUnavailable = true;
  }
}

// ─── Banner (stub — wired to DOM in task 10) ──────────────────────────────────

/**
 * Displays a non-blocking informational banner to the user.
 * This is a stub; full DOM wiring happens in task 10.
 *
 * @param {string} message
 */
function showBanner(message) {
  const banner = document.getElementById("error-banner");
  if (banner) {
    banner.textContent = message;
    banner.classList.remove("hidden");
  }
}

// ─── initState ────────────────────────────────────────────────────────────────

/**
 * Bootstraps AppState from localStorage (or defaults on first run / error).
 *
 * Behaviour matrix:
 *   loadState() → null, _loadError = false  → defaults, silent
 *   loadState() → null, _loadError = true   → defaults + error banner
 *   loadState() → object                    → merge into AppState
 *
 * After init, if `_storageUnavailable` is true, shows a storage warning banner.
 */
function initState() {
  const saved = loadState();

  if (saved === null) {
    // Initialise with defaults
    AppState.transactions = [];
    AppState.categories = [...DEFAULT_CATEGORIES];
    AppState.budgetLimits = {};
    AppState.activeView = "main";

    if (_loadError) {
      showBanner("Could not load saved data. Starting fresh.");
    }
    // If _loadError is false the key simply didn't exist — silent init
  } else {
    // Merge persisted data into AppState
    AppState.transactions = Array.isArray(saved.transactions) ? saved.transactions : [];
    AppState.categories = Array.isArray(saved.categories) ? saved.categories : [...DEFAULT_CATEGORIES];
    AppState.budgetLimits = (saved.budgetLimits && typeof saved.budgetLimits === "object") ? saved.budgetLimits : {};
    AppState.activeView = "main"; // always reset to main on load
  }

  if (_storageUnavailable) {
    showBanner("Storage unavailable — data will not be saved.");
  }

  // Handle transactions with unknown categories (data migration)
  const knownCategories = new Set(AppState.categories);
  const hasUnknown = AppState.transactions.some(t => !knownCategories.has(t.category));
  if (hasUnknown) {
    if (!AppState.categories.includes("Other")) {
      AppState.categories.push("Other");
    }
    AppState.transactions = AppState.transactions.map(t =>
      knownCategories.has(t.category) ? t : { ...t, category: "Other" }
    );
  }
}

// ─── Currency formatter ───────────────────────────────────────────────────────

/**
 * Formats a number as Indonesian Rupiah.
 * e.g. 15000 → "Rp 15.000"
 *
 * @param {number} amount
 * @returns {string}
 */
function formatRupiah(amount) {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

// ─── generateId ───────────────────────────────────────────────────────────────

/**
 * Generates a unique identifier for a new transaction.
 * Prefers `crypto.randomUUID()` when available; falls back to a
 * timestamp + random string combination for older browsers.
 *
 * @returns {string}
 */
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString() + Math.random().toString(36).slice(2);
}

// ─── Chart colour palette ─────────────────────────────────────────────────────

const CHART_COLORS = [
  "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0",
  "#9966FF", "#FF9F40", "#C9CBCF", "#7BC8A4"
];

// ─── Module-level Chart.js instance ──────────────────────────────────────────

let chartInstance = null;

// ─── Stubs (implemented in later tasks) ──────────────────────────────────────

/**
 * Returns true iff the category's total spending meets or exceeds its budget
 * limit. Returns false when no limit is set for the category.
 *
 * @param {string} category
 * @returns {boolean}
 */
function isCategoryOverBudget(category) {
  const limit = AppState.budgetLimits[category];
  if (limit === undefined || limit === null) return false;
  const total = AppState.transactions
    .filter(t => t.category === category)
    .reduce((sum, t) => sum + t.amount, 0);
  return total >= limit;
}

/**
 * Clears and rebuilds `#budget-panel` from `AppState.categories` and
 * `AppState.budgetLimits`. Each category gets a row with a label, a number
 * input pre-filled with the current limit (if set), Save and Clear buttons,
 * and an error span for validation messages.
 *
 * Shows "No categories available." when `AppState.categories` is empty.
 */
function renderBudgetPanel() {
  const panel = document.getElementById("budget-panel");
  if (!panel) return;

  panel.innerHTML = "";

  if (AppState.categories.length === 0) {
    const msg = document.createElement("p");
    msg.className = "empty-state";
    msg.textContent = "No categories available.";
    panel.appendChild(msg);
    return;
  }

  AppState.categories.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "budget-row";

    // Category label
    const label = document.createElement("span");
    label.className = "budget-category-label";
    label.textContent = cat;

    // Number input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.01";
    input.step = "0.01";
    input.placeholder = "0.00";
    if (AppState.budgetLimits[cat] !== undefined && AppState.budgetLimits[cat] !== null) {
      input.value = AppState.budgetLimits[cat];
    }

    // Save button
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-save";
    saveBtn.dataset.category = cat;
    saveBtn.textContent = "Save";

    // Clear button
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-clear";
    clearBtn.dataset.category = cat;
    clearBtn.textContent = "Clear";

    // Error span
    const errorSpan = document.createElement("span");
    errorSpan.className = "field-error";
    errorSpan.id = "budget-error-" + cat;

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(saveBtn);
    row.appendChild(clearBtn);
    row.appendChild(errorSpan);
    panel.appendChild(row);
  });
}

/**
 * Attaches a single delegated click event listener to `#budget-panel`.
 * Handles Save and Clear button clicks via event delegation so the listener
 * survives full panel re-renders.
 */
function setupBudgetPanel() {
  const panel = document.getElementById("budget-panel");
  if (!panel) return;

  panel.addEventListener("click", function (event) {
    // ── Save button ──────────────────────────────────────────────────────────
    if (event.target.classList.contains("btn-save")) {
      const category = event.target.dataset.category;
      const row = event.target.closest(".budget-row");
      const input = row ? row.querySelector("input[type='number']") : null;
      const errorSpanId = "budget-error-" + category;

      if (!input) return;

      const parsedValue = parseFloat(input.value);

      if (isNaN(parsedValue) || parsedValue <= 0) {
        setFieldError(errorSpanId, "Please enter a positive number.");
        return;
      }

      // Valid — save and re-render
      clearFieldError(errorSpanId);
      AppState.budgetLimits[category] = parsedValue;
      saveState(AppState);
      render();
      return;
    }

    // ── Clear button ─────────────────────────────────────────────────────────
    if (event.target.classList.contains("btn-clear")) {
      const category = event.target.dataset.category;
      delete AppState.budgetLimits[category];
      saveState(AppState);
      render();
    }
  });
}

/**
 * Renders the monthly summary section.
 *
 * Groups `AppState.transactions` by YYYY-MM derived from `timestamp`.
 * For each month (most recent first) renders:
 *   - A month heading (e.g. "June 2025")
 *   - The month total formatted as $X.XX
 *   - A per-category breakdown with subtotals
 *
 * Shows an empty-state message when no transactions exist.
 */
function renderMonthlySummary() {
  const section = document.getElementById("monthly-summary");
  if (!section) return;

  // Clear existing content (keep the h2 heading)
  const heading = section.querySelector("h2");
  section.innerHTML = "";
  if (heading) section.appendChild(heading);

  if (AppState.transactions.length === 0) {
    const msg = document.createElement("p");
    msg.className = "empty-state";
    msg.textContent = "No data to summarise yet.";
    section.appendChild(msg);
    return;
  }

  // Group transactions by YYYY-MM
  const byMonth = {};
  AppState.transactions.forEach((t) => {
    const monthKey = t.timestamp.slice(0, 7); // "YYYY-MM"
    if (!byMonth[monthKey]) byMonth[monthKey] = [];
    byMonth[monthKey].push(t);
  });

  // Sort months descending (most recent first)
  const sortedMonths = Object.keys(byMonth).sort().reverse();

  sortedMonths.forEach((monthKey) => {
    const transactions = byMonth[monthKey];

    // Format month label: "June 2025" from "2025-06"
    const [year, month] = monthKey.split("-");
    const monthLabel = new Date(parseInt(year), parseInt(month) - 1, 1)
      .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Calculate month total
    const monthTotal = transactions.reduce((sum, t) => sum + t.amount, 0);

    // Group by category within the month
    const byCategory = {};
    transactions.forEach((t) => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    // Build the month group element
    const group = document.createElement("div");
    group.className = "month-group";

    const monthHeading = document.createElement("h3");
    monthHeading.className = "month-heading";
    monthHeading.textContent = monthLabel;

    const totalEl = document.createElement("p");
    totalEl.className = "month-total";
    totalEl.textContent = "Total: " + formatRupiah(monthTotal);

    group.appendChild(monthHeading);
    group.appendChild(totalEl);

    // Per-category breakdown
    Object.entries(byCategory).forEach(([cat, subtotal]) => {
      const row = document.createElement("div");
      row.className = "month-category-row";

      const catName = document.createElement("span");
      catName.textContent = cat;

      const catAmount = document.createElement("span");
      catAmount.textContent = formatRupiah(subtotal);

      row.appendChild(catName);
      row.appendChild(catAmount);
      group.appendChild(row);
    });

    section.appendChild(group);
  });
}

// ─── renderBalance (task 3.2) ─────────────────────────────────────────────────

/**
 * Sums all transaction amounts and writes the formatted `$X.XX` string to
 * `#balance-display`. Shows `$0.00` when there are no transactions.
 */
function renderBalance() {
  const total = AppState.transactions.reduce((sum, t) => sum + t.amount, 0);
  const display = document.getElementById("balance-display");
  if (display) {
    display.textContent = formatRupiah(total);
  }
}

// ─── renderTransactionList (task 3.3) ─────────────────────────────────────────

/**
 * Clears and rebuilds `<ul id="transaction-list">` from `AppState.transactions`.
 * Each `<li>` shows the item name, formatted amount, category badge, an optional
 * budget-alert indicator, and a delete button. Shows an empty-state message when
 * the list is empty.
 */
function renderTransactionList() {
  const ul = document.getElementById("transaction-list");
  if (!ul) return;

  // Clear existing items
  ul.innerHTML = "";

  if (AppState.transactions.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No transactions recorded yet.";
    ul.appendChild(li);
    return;
  }

  AppState.transactions.forEach((transaction) => {
    const overBudget = isCategoryOverBudget(transaction.category);

    const li = document.createElement("li");
    if (overBudget) {
      li.className = "over-budget";
    }

    // Item name
    const nameSpan = document.createElement("span");
    nameSpan.className = "transaction-name";
    nameSpan.textContent = transaction.name;

    // Formatted amount
    const amountSpan = document.createElement("span");
    amountSpan.className = "transaction-amount";
    amountSpan.textContent = formatRupiah(transaction.amount);

    // Category badge
    const categoryBadge = document.createElement("span");
    categoryBadge.className = "category-badge";
    categoryBadge.textContent = transaction.category;

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.dataset.id = transaction.id;
    deleteBtn.setAttribute("aria-label", "Delete " + transaction.name);
    deleteBtn.textContent = "Delete";

    li.appendChild(nameSpan);
    li.appendChild(amountSpan);
    li.appendChild(categoryBadge);

    // Budget alert indicator (only when over budget)
    if (overBudget) {
      const alertSpan = document.createElement("span");
      alertSpan.className = "alert-indicator";
      alertSpan.textContent = "⚠ Over Budget";
      li.appendChild(alertSpan);
    }

    li.appendChild(deleteBtn);
    ul.appendChild(li);
  });
}

// ─── renderCategorySelector (task 3.4) ────────────────────────────────────────

/**
 * Rebuilds the `<select id="input-category">` options from `AppState.categories`.
 * Preserves the currently selected value if it still exists in the new list.
 */
function renderCategorySelector() {
  const select = document.getElementById("input-category");
  if (!select) return;

  // Remember the current selection before clearing
  const previousValue = select.value;

  select.innerHTML = "";

  AppState.categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });

  // Restore previous selection if it still exists
  if (previousValue && AppState.categories.includes(previousValue)) {
    select.value = previousValue;
  }
}

// ─── renderChart (task 3.5) ───────────────────────────────────────────────────

/**
 * Destroys any existing Chart.js instance and creates a new pie chart on
 * `<canvas id="spending-chart">` with per-category totals and distinct colours.
 * Shows an empty-state message when there are no transactions.
 * Wraps Chart.js calls in try/catch; on failure hides the canvas and shows a
 * "Chart unavailable." fallback message.
 */
function renderChart() {
  const canvas = document.getElementById("spending-chart");
  const chartSection = canvas ? canvas.closest(".chart-section") : null;

  // Destroy existing chart instance to avoid memory leaks / stale renders
  if (chartInstance !== null) {
    try {
      chartInstance.destroy();
    } catch (e) {
      // Ignore destroy errors
    }
    chartInstance = null;
  }

  // Remove any existing empty-state or error message
  if (chartSection) {
    const existing = chartSection.querySelector("#chart-empty-state");
    if (existing) existing.remove();
  }

  if (AppState.transactions.length === 0) {
    // Hide canvas, show empty-state message
    if (canvas) canvas.style.display = "none";
    if (chartSection) {
      const emptyMsg = document.createElement("p");
      emptyMsg.id = "chart-empty-state";
      emptyMsg.textContent = "No spending data to display.";
      chartSection.appendChild(emptyMsg);
    }
    return;
  }

  // Show canvas (in case it was previously hidden)
  if (canvas) canvas.style.display = "";

  // Aggregate per-category totals
  const totals = {};
  AppState.transactions.forEach((t) => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(totals);
  const data = labels.map((cat) => totals[cat]);
  const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  try {
    chartInstance = new Chart(canvas, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors
          }
        ]
      },
      options: {
        plugins: {
          legend: {
            display: true
          }
        }
      }
    });
  } catch (e) {
    // Chart.js unavailable or failed — hide canvas and show fallback
    if (canvas) canvas.style.display = "none";
    if (chartSection) {
      const errorMsg = document.createElement("p");
      errorMsg.id = "chart-empty-state";
      errorMsg.textContent = "Chart unavailable.";
      chartSection.appendChild(errorMsg);
    }
  }
}

// ─── render (task 3.1) ────────────────────────────────────────────────────────

/**
 * Top-level render function. Calls all sub-renderers in sequence and
 * shows/hides sections based on `AppState.activeView`.
 *
 * - `"main"`:    shows form, list, chart, budget sections; hides monthly summary
 * - `"monthly"`: hides main sections; shows monthly summary
 *
 * Also updates the `#toggle-view` button text to reflect the current view.
 */
function render() {
  // Run all sub-renderers
  renderBalance();
  renderTransactionList();
  renderCategorySelector();
  renderChart();
  renderBudgetPanel();

  // Monthly summary only when on that view
  if (AppState.activeView === "monthly") {
    renderMonthlySummary();
  }

  // Sections to show/hide based on active view
  const mainSections = document.querySelectorAll(
    ".form-section, .category-section, .budget-section, .list-section, .chart-section"
  );
  const monthlySummary = document.getElementById("monthly-summary");
  const toggleBtn = document.getElementById("toggle-view");

  if (AppState.activeView === "monthly") {
    mainSections.forEach((el) => el.classList.add("hidden"));
    if (monthlySummary) monthlySummary.classList.remove("hidden");
    if (toggleBtn) toggleBtn.textContent = "Back to Transactions";
  } else {
    mainSections.forEach((el) => el.classList.remove("hidden"));
    if (monthlySummary) monthlySummary.classList.add("hidden");
    if (toggleBtn) toggleBtn.textContent = "View Monthly Summary";
  }
}

// ─── Transaction Input Form (tasks 4.1 – 4.4) ────────────────────────────────

/**
 * Clears the inline error message for a given field's error span.
 *
 * @param {string} errorId - The id of the error <span> element.
 */
function clearFieldError(errorId) {
  const span = document.getElementById(errorId);
  if (span) span.textContent = "";
}

/**
 * Sets an inline error message on a given field's error span.
 *
 * @param {string} errorId - The id of the error <span> element.
 * @param {string} message - The error message to display.
 */
function setFieldError(errorId, message) {
  const span = document.getElementById(errorId);
  if (span) span.textContent = message;
}

/**
 * Clears all inline validation error messages on the transaction form.
 */
function clearAllFormErrors() {
  clearFieldError("error-name");
  clearFieldError("error-amount");
  clearFieldError("error-category");
}

/**
 * Sets up the transaction form submit event listener and per-field
 * live-validation clear listeners.
 *
 * - Validates name (non-empty), amount (positive number), and category
 *   (non-empty selection) on submit.
 * - On valid submission: creates a Transaction, pushes it to AppState,
 *   persists to Storage, re-renders, and resets the form.
 * - On invalid submission: shows inline errors and aborts.
 * - Clears each field's error as soon as the user corrects it.
 */
function setupTransactionForm() {
  const form = document.getElementById("transaction-form");
  if (!form) return;

  // ── 4.1  Submit event listener ──────────────────────────────────────────────
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const nameInput     = document.getElementById("input-name");
    const amountInput   = document.getElementById("input-amount");
    const categoryInput = document.getElementById("input-category");

    const nameValue     = nameInput     ? nameInput.value     : "";
    const amountValue   = amountInput   ? amountInput.value   : "";
    const categoryValue = categoryInput ? categoryInput.value : "";

    // ── 4.2  Validation ─────────────────────────────────────────────────────
    let valid = true;

    // Name: must be non-empty after trim
    if (nameValue.trim() === "") {
      setFieldError("error-name", "Item name is required.");
      valid = false;
    } else {
      clearFieldError("error-name");
    }

    // Amount: must be a positive number
    const parsedAmount = parseFloat(amountValue);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFieldError("error-amount", "Amount must be a positive number.");
      valid = false;
    } else {
      clearFieldError("error-amount");
    }

    // Category: must have a non-empty selection
    if (!categoryValue) {
      setFieldError("error-category", "Please select a category.");
      valid = false;
    } else {
      clearFieldError("error-category");
    }

    if (!valid) return; // Abort — do NOT add transaction

    // ── 4.3  Valid submission ───────────────────────────────────────────────
    const transaction = {
      id:        generateId(),
      name:      nameValue.trim(),
      amount:    parsedAmount,
      category:  categoryValue,
      timestamp: new Date().toISOString()
    };

    AppState.transactions.push(transaction);
    saveState(AppState);
    render();

    form.reset();

    // ── 4.4  Clear errors after reset ───────────────────────────────────────
    clearAllFormErrors();
  });

  // ── 4.4  Live-clear errors when the user corrects a field ──────────────────
  const nameInput     = document.getElementById("input-name");
  const amountInput   = document.getElementById("input-amount");
  const categoryInput = document.getElementById("input-category");

  if (nameInput) {
    nameInput.addEventListener("input", function () {
      clearFieldError("error-name");
    });
  }

  if (amountInput) {
    amountInput.addEventListener("input", function () {
      clearFieldError("error-amount");
    });
  }

  if (categoryInput) {
    categoryInput.addEventListener("change", function () {
      clearFieldError("error-category");
    });
  }
}

// ─── Transaction Delete (tasks 5.1 – 5.2) ────────────────────────────────────

/**
 * Attaches a single delegated click event listener to `<ul id="transaction-list">`.
 * Detects clicks on delete buttons by checking for the `btn-delete` class or a
 * `data-id` attribute, then removes the matching transaction from AppState,
 * persists the change, and re-renders.
 *
 * Uses event delegation so the listener survives full list re-renders.
 */
function setupTransactionList() {
  const ul = document.getElementById("transaction-list");
  if (!ul) return;

  ul.addEventListener("click", function (event) {
    // 5.1 — detect clicks on delete buttons
    const target = event.target;
    if (!target.classList.contains("btn-delete") && !target.dataset.id) {
      return;
    }

    const id = target.dataset.id;
    if (!id) return;

    // 5.2 — remove the transaction, persist, and re-render
    AppState.transactions = AppState.transactions.filter(t => t.id !== id);
    saveState(AppState);
    render();
  });
}

// ─── Custom Category Manager (tasks 7.2 – 7.4) ───────────────────────────────

/**
 * Sets up the category form submit event listener.
 *
 * Validation:
 *   - Rejects empty or whitespace-only names (shows "Category name is required.")
 *   - Rejects names that match an existing category case-insensitively
 *     (shows "Category already exists.")
 *
 * On valid submission:
 *   - Pushes the trimmed name to AppState.categories
 *   - Persists via saveState()
 *   - Updates the transaction form's category selector via renderCategorySelector()
 *   - Updates the budget panel via renderBudgetPanel()
 *   - Resets the category input via form.reset()
 *   - Clears the error span
 */
function setupCategoryForm() {
  const form = document.getElementById("category-form");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const input = document.getElementById("input-new-category");
    const rawValue = input ? input.value : "";
    const newName = rawValue.trim();

    // ── 7.3  Validation ─────────────────────────────────────────────────────

    // Reject empty or whitespace-only names
    if (newName === "") {
      setFieldError("error-new-category", "Category name is required.");
      return;
    }

    // Reject case-insensitive duplicates
    if (AppState.categories.some(c => c.toLowerCase() === newName.toLowerCase())) {
      setFieldError("error-new-category", "Category already exists.");
      return;
    }

    // Validation passed — clear any previous error
    clearFieldError("error-new-category");

    // ── 7.4  Valid submission ───────────────────────────────────────────────

    AppState.categories.push(newName);
    saveState(AppState);
    renderCategorySelector();
    renderBudgetPanel();
    form.reset();
    clearFieldError("error-new-category");
  });
}

// ─── Toggle View (task 9.3) ───────────────────────────────────────────────────

/**
 * Attaches a click event listener to `#toggle-view`.
 * On click: flips `AppState.activeView` between `"main"` and `"monthly"`,
 * then calls `render()` to update the UI.
 */
function setupToggleView() {
  const btn = document.getElementById("toggle-view");
  if (!btn) return;

  btn.addEventListener("click", function () {
    AppState.activeView = AppState.activeView === "main" ? "monthly" : "main";
    render();
  });
}

// ─── Bootstrap (task 11.1) ────────────────────────────────────────────────────

/**
 * Bootstraps the application on DOMContentLoaded:
 *   1. Initialises AppState from localStorage (or defaults)
 *   2. Sets up all event listeners
 *   3. Renders the initial UI
 */
document.addEventListener("DOMContentLoaded", function () {
  // 1. Initialise state from Storage
  initState();

  // 2. Wire up all event listeners
  setupTransactionForm();
  setupTransactionList();
  setupCategoryForm();
  setupBudgetPanel();
  setupToggleView();

  // 3. Render the initial UI
  render();
});
