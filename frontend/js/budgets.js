/**
 * Budgets page — list, add, edit, delete budgets
 */

(function () {
    'use strict';

    var allCategories = [];

    function init() {
        loadCategories();
        bindEvents();
        setDefaultFilters();
        loadBudgets();
    }

    function setDefaultFilters() {
        var monthSel = document.getElementById('filterMonth');
        var yearSel = document.getElementById('filterYear');

        if (monthSel) {
            for (var m = 1; m <= 12; m++) {
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = Utils.getMonthName(m);
                monthSel.appendChild(opt);
            }
            monthSel.value = Utils.currentMonth();
        }

        if (yearSel) {
            var cy = Utils.currentYear();
            for (var y = cy - 2; y <= cy + 1; y++) {
                var opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                yearSel.appendChild(opt);
            }
            yearSel.value = cy;
        }
    }

    function loadCategories() {
        API.getCategories().then(function (data) {
            allCategories = (data.results || data).filter(function (c) {
                return c.type === 'expense';
            });
            populateCategorySelect();
        });
    }

    function populateCategorySelect() {
        var sel = document.getElementById('budgetCategory');
        if (!sel) return;
        sel.innerHTML = '<option value="">Select category</option>';
        allCategories.forEach(function (cat) {
            sel.innerHTML += '<option value="' + cat.id + '">' + Utils.escapeHtml(cat.name) + '</option>';
        });
    }

    function loadBudgets() {
        var month = document.getElementById('filterMonth');
        var year = document.getElementById('filterYear');
        var params = {};
        if (month && month.value) params.month = month.value;
        if (year && year.value) params.year = year.value;

        API.getBudgets(params)
            .then(function (data) {
                renderBudgets(data.results || data);
            })
            .catch(function () {
                Utils.showToast('Failed to load budgets.', 'error');
            });
    }

    function renderBudgets(budgets) {
        var container = document.getElementById('budgetsGrid');
        if (!container) return;

        if (!budgets.length) {
            container.innerHTML = '<div class="empty-state"><p>No budgets set for this month. Create one to start tracking!</p></div>';
            return;
        }

        var html = budgets.map(function (b) {
            var pct = b.percentage || 0;
            var statusClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success';
            return '<div class="budget-card">' +
                '<div class="budget-header">' +
                    '<div class="budget-category">' +
                        '<span class="budget-icon">' + Utils.iconEmoji(b.category_icon) + '</span>' +
                        '<span>' + Utils.escapeHtml(b.category_name || 'Category') + '</span>' +
                    '</div>' +
                    '<div class="budget-actions">' +
                        '<button class="btn btn-sm btn-ghost edit-budget" data-id="' + b.id + '">Edit</button>' +
                        '<button class="btn btn-sm btn-ghost delete-budget" data-id="' + b.id + '" style="color:var(--color-danger);">Delete</button>' +
                    '</div>' +
                '</div>' +
                '<div class="budget-amounts">' +
                    '<span class="spent">' + Utils.formatCurrency(b.spent || 0) + ' spent</span>' +
                    '<span class="total">of ' + Utils.formatCurrency(b.amount) + '</span>' +
                '</div>' +
                '<div class="progress-bar">' +
                    '<div class="progress-fill ' + statusClass + '" style="width:' + Math.min(pct, 100) + '%"></div>' +
                '</div>' +
                '<div class="budget-footer">' +
                    '<span>' + Math.round(pct) + '% used</span>' +
                    '<span>' + Utils.formatCurrency(b.remaining || 0) + ' remaining</span>' +
                '</div>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function bindEvents() {
        // Filter changes
        var filterMonth = document.getElementById('filterMonth');
        var filterYear = document.getElementById('filterYear');
        if (filterMonth) filterMonth.addEventListener('change', loadBudgets);
        if (filterYear) filterYear.addEventListener('change', loadBudgets);

        // Add budget
        var addBtn = document.getElementById('addBudgetBtn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                openBudgetModal();
            });
        }

        // Form submit
        var budgetForm = document.getElementById('budgetForm');
        if (budgetForm) {
            budgetForm.addEventListener('submit', function (e) {
                e.preventDefault();
                saveBudget();
            });
        }

        // Close / cancel modal
        var closeBtn = document.getElementById('closeBudgetModal');
        if (closeBtn) closeBtn.addEventListener('click', function () { Utils.closeModal('budgetModal'); });

        var cancelBtn = document.getElementById('cancelBudgetBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', function () { Utils.closeModal('budgetModal'); });

        // Delegate edit / delete
        var grid = document.getElementById('budgetsGrid');
        if (grid) {
            grid.addEventListener('click', function (e) {
                var editBtn = e.target.closest('.edit-budget');
                var deleteBtn = e.target.closest('.delete-budget');
                if (editBtn) editBudget(editBtn.dataset.id);
                if (deleteBtn) deleteBudget(deleteBtn.dataset.id);
            });
        }
    }

    function populateModalMonthYear() {
        var monthSel = document.getElementById('budgetMonth');
        var yearSel = document.getElementById('budgetYear');

        if (monthSel) {
            monthSel.innerHTML = '';
            for (var m = 1; m <= 12; m++) {
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = Utils.getMonthName(m);
                monthSel.appendChild(opt);
            }
        }

        if (yearSel) {
            yearSel.innerHTML = '';
            var cy = Utils.currentYear();
            for (var y = cy - 2; y <= cy + 2; y++) {
                var opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                yearSel.appendChild(opt);
            }
        }
    }

    function openBudgetModal(budget) {
        var title = document.getElementById('budgetModalTitle');
        var idField = document.getElementById('budgetId');
        var catField = document.getElementById('budgetCategory');
        var amountField = document.getElementById('budgetAmount');
        var monthSel = document.getElementById('budgetMonth');
        var yearSel = document.getElementById('budgetYear');

        populateModalMonthYear();

        if (budget) {
            if (title) title.textContent = 'Edit Budget';
            if (idField) idField.value = budget.id;
            if (catField) catField.value = budget.category;
            if (amountField) amountField.value = budget.amount;
            if (monthSel) monthSel.value = budget.month || Utils.currentMonth();
            if (yearSel) yearSel.value = budget.year || Utils.currentYear();
        } else {
            if (title) title.textContent = 'Add Budget';
            if (idField) idField.value = '';
            if (catField) catField.value = '';
            if (amountField) amountField.value = '';
            if (monthSel) monthSel.value = Utils.currentMonth();
            if (yearSel) yearSel.value = Utils.currentYear();
        }
        Utils.openModal('budgetModal');
    }

    function editBudget(id) {
        API.getBudgets().then(function (data) {
            var budgets = data.results || data;
            var budget = budgets.find(function (b) { return b.id == id; });
            if (budget) openBudgetModal(budget);
        });
    }

    function saveBudget() {
        var idField = document.getElementById('budgetId');
        var id = idField ? idField.value : '';
        var monthSel = document.getElementById('budgetMonth');
        var yearSel = document.getElementById('budgetYear');

        var payload = {
            category: document.getElementById('budgetCategory').value,
            amount: document.getElementById('budgetAmount').value,
            month: monthSel ? monthSel.value : Utils.currentMonth(),
            year: yearSel ? yearSel.value : Utils.currentYear(),
        };

        var promise = id ? API.updateBudget(id, payload) : API.createBudget(payload);

        promise
            .then(function () {
                Utils.closeModal('budgetModal');
                Utils.showToast(id ? 'Budget updated!' : 'Budget created!', 'success');
                // Sync filter bar to show the saved budget's month/year
                var filterMonth = document.getElementById('filterMonth');
                var filterYear = document.getElementById('filterYear');
                if (filterMonth && monthSel) filterMonth.value = monthSel.value;
                if (filterYear && yearSel) filterYear.value = yearSel.value;
                loadBudgets();
            })
            .catch(function (err) {
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function deleteBudget(id) {
        if (!confirm('Delete this budget?')) return;
        API.deleteBudget(id)
            .then(function () {
                Utils.showToast('Budget deleted.', 'success');
                loadBudgets();
            })
            .catch(function () {
                Utils.showToast('Failed to delete budget.', 'error');
            });
    }

    init();
})();
