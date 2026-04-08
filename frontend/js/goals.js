/**
 * Savings Goals page — list, add, edit, delete goals
 */

(function () {
    'use strict';

    function parseDateOnly(dateStr) {
        if (!dateStr) return null;
        var d = new Date(dateStr + 'T00:00:00');
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function daysUntil(dateStr) {
        var target = parseDateOnly(dateStr);
        if (!target) return null;

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var diffMs = target.getTime() - today.getTime();
        return Math.ceil(diffMs / 86400000);
    }

    function getGoalUrgency(goal) {
        var pct = goal.progress || 0;
        var leftDays = daysUntil(goal.deadline);

        if (!goal.deadline) {
            return {
                cardClass: 'goal-urgency-none',
                chipClass: 'goal-due-none',
                chipLabel: 'No deadline',
                dateLabel: 'No deadline',
                sortValue: 999999,
            };
        }

        var dateLabel = Utils.formatDate(goal.deadline);

        if (pct >= 100) {
            return {
                cardClass: 'goal-urgency-complete',
                chipClass: 'goal-due-complete',
                chipLabel: 'Goal complete',
                dateLabel: dateLabel,
                sortValue: 900000,
            };
        }

        if (leftDays < 0) {
            return {
                cardClass: 'goal-urgency-overdue',
                chipClass: 'goal-due-overdue',
                chipLabel: 'Overdue by ' + Math.abs(leftDays) + 'd',
                dateLabel: dateLabel,
                sortValue: leftDays,
            };
        }

        if (leftDays <= 7) {
            return {
                cardClass: 'goal-urgency-critical',
                chipClass: 'goal-due-critical',
                chipLabel: leftDays === 0 ? 'Due today' : 'Due in ' + leftDays + 'd',
                dateLabel: dateLabel,
                sortValue: leftDays,
            };
        }

        if (leftDays <= 30) {
            return {
                cardClass: 'goal-urgency-soon',
                chipClass: 'goal-due-soon',
                chipLabel: 'Due in ' + leftDays + 'd',
                dateLabel: dateLabel,
                sortValue: leftDays,
            };
        }

        if (leftDays <= 60) {
            return {
                cardClass: 'goal-urgency-watch',
                chipClass: 'goal-due-watch',
                chipLabel: 'Due in ' + leftDays + 'd',
                dateLabel: dateLabel,
                sortValue: leftDays,
            };
        }

        return {
            cardClass: 'goal-urgency-future',
            chipClass: 'goal-due-future',
            chipLabel: 'Due in ' + leftDays + 'd',
            dateLabel: dateLabel,
            sortValue: leftDays,
        };
    }

    function init() {
        bindEvents();
        loadGoals();
    }

    function loadGoals() {
        API.getSavingsGoals()
            .then(function (data) {
                renderGoals(data.results || data);
            })
            .catch(function () {
                Utils.showToast('Failed to load savings goals.', 'error');
            });
    }

    function renderGoals(goals) {
        var container = document.getElementById('goalsGrid');
        if (!container) return;

        if (!goals.length) {
            container.innerHTML = '<div class="empty-state"><p>No savings goals yet. Set a goal and start saving!</p></div>';
            return;
        }

        var sortedGoals = goals.slice().sort(function (a, b) {
            var ua = getGoalUrgency(a);
            var ub = getGoalUrgency(b);
            if (ua.sortValue !== ub.sortValue) return ua.sortValue - ub.sortValue;
            return (b.progress || 0) - (a.progress || 0);
        });

        var html = sortedGoals.map(function (g) {
            var pct = g.progress || 0;
            var statusClass = pct >= 100 ? 'success' : pct >= 50 ? 'warning' : 'info';
            var urgency = getGoalUrgency(g);

            return '<div class="goal-card ' + urgency.cardClass + '">' +
                '<div class="goal-header">' +
                    '<h3 class="goal-name">' + Utils.escapeHtml(g.name) + '</h3>' +
                    '<div class="goal-actions">' +
                        '<button class="btn btn-sm btn-primary add-funds-goal" data-id="' + g.id + '" data-name="' + Utils.escapeHtml(g.name) + '" data-current="' + (g.current_amount || 0) + '">+ Add Funds</button>' +
                        '<button class="btn btn-sm btn-ghost edit-goal" data-id="' + g.id + '">Edit</button>' +
                        '<button class="btn btn-sm btn-ghost delete-goal" data-id="' + g.id + '" style="color:var(--color-danger);">Delete</button>' +
                    '</div>' +
                '</div>' +
                '<div class="goal-amounts">' +
                    '<span class="current">' + Utils.formatCurrency(g.current_amount || 0) + '</span>' +
                    '<span class="target">of ' + Utils.formatCurrency(g.target_amount) + '</span>' +
                '</div>' +
                '<div class="progress-bar">' +
                    '<div class="progress-fill ' + statusClass + '" style="width:' + Math.min(pct, 100) + '%"></div>' +
                '</div>' +
                '<div class="goal-footer">' +
                    '<span>' + Math.round(pct) + '% saved</span>' +
                    '<span class="goal-deadline">' + urgency.dateLabel + '</span>' +
                '</div>' +
                '<div class="goal-due-chip ' + urgency.chipClass + '">' + urgency.chipLabel + '</div>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function bindEvents() {
        // Add goal
        var addBtn = document.getElementById('addGoalBtn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                openGoalModal();
            });
        }

        // Cancel / Close modal buttons
        var cancelBtn = document.getElementById('cancelGoalBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', function () { Utils.closeModal('goalModal'); });
        var closeBtn = document.getElementById('closeGoalModal');
        if (closeBtn) closeBtn.addEventListener('click', function () { Utils.closeModal('goalModal'); });

        // Close add-funds modal
        var cancelFundsBtn = document.getElementById('cancelFundsBtn');
        if (cancelFundsBtn) cancelFundsBtn.addEventListener('click', function () { Utils.closeModal('fundsModal'); });
        var closeFundsBtn = document.getElementById('closeFundsModal');
        if (closeFundsBtn) closeFundsBtn.addEventListener('click', function () { Utils.closeModal('fundsModal'); });

        // Add funds form
        var fundsForm = document.getElementById('fundsForm');
        if (fundsForm) {
            fundsForm.addEventListener('submit', function (e) {
                e.preventDefault();
                addFunds();
            });
        }

        // Form submit
        var goalForm = document.getElementById('goalForm');
        if (goalForm) {
            goalForm.addEventListener('submit', function (e) {
                e.preventDefault();
                saveGoal();
            });
        }

        // Delegate edit / delete / add-funds
        var grid = document.getElementById('goalsGrid');
        if (grid) {
            grid.addEventListener('click', function (e) {
                var editBtn = e.target.closest('.edit-goal');
                var deleteBtn = e.target.closest('.delete-goal');
                var fundsBtn = e.target.closest('.add-funds-goal');
                if (editBtn) editGoal(editBtn.dataset.id);
                if (deleteBtn) deleteGoal(deleteBtn.dataset.id);
                if (fundsBtn) openFundsModal(fundsBtn.dataset.id, fundsBtn.dataset.name, fundsBtn.dataset.current);
            });
        }
    }

    function openGoalModal(goal) {
        var title = document.getElementById('goalModalTitle');
        var idField = document.getElementById('goalId');
        var nameField = document.getElementById('goalName');
        var targetField = document.getElementById('goalTarget');
        var currentField = document.getElementById('goalCurrent');
        var deadlineField = document.getElementById('goalDeadline');

        if (goal) {
            if (title) title.textContent = 'Edit Goal';
            if (idField) idField.value = goal.id;
            if (nameField) nameField.value = goal.name;
            if (targetField) targetField.value = goal.target_amount;
            if (currentField) currentField.value = goal.current_amount;
            if (deadlineField) deadlineField.value = goal.deadline || '';
        } else {
            if (title) title.textContent = 'Add Goal';
            if (idField) idField.value = '';
            if (nameField) nameField.value = '';
            if (targetField) targetField.value = '';
            if (currentField) currentField.value = '0';
            if (deadlineField) deadlineField.value = '';
        }
        Utils.openModal('goalModal');
    }

    function editGoal(id) {
        API.getSavingsGoals().then(function (data) {
            var goals = data.results || data;
            var goal = goals.find(function (g) { return g.id == id; });
            if (goal) openGoalModal(goal);
        });
    }

    function saveGoal() {
        var idField = document.getElementById('goalId');
        var id = idField ? idField.value : '';

        var payload = {
            name: document.getElementById('goalName').value,
            target_amount: document.getElementById('goalTarget').value,
            current_amount: document.getElementById('goalCurrent').value,
            deadline: document.getElementById('goalDeadline').value || null,
        };

        var promise = id ? API.updateSavingsGoal(id, payload) : API.createSavingsGoal(payload);

        promise
            .then(function () {
                Utils.closeModal('goalModal');
                Utils.showToast(id ? 'Goal updated!' : 'Goal created!', 'success');
                loadGoals();
            })
            .catch(function (err) {
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function deleteGoal(id) {
        if (!confirm('Delete this savings goal?')) return;
        API.deleteSavingsGoal(id)
            .then(function () {
                Utils.showToast('Goal deleted.', 'success');
                loadGoals();
            })
            .catch(function () {
                Utils.showToast('Failed to delete goal.', 'error');
            });
    }

    function openFundsModal(goalId, goalName, currentAmount) {
        var titleEl = document.getElementById('fundsGoalName');
        var idField = document.getElementById('fundsGoalId');
        var currentEl = document.getElementById('fundsCurrentAmount');
        var amountField = document.getElementById('fundsAmount');
        var notesField = document.getElementById('fundsNotes');

        if (titleEl) titleEl.textContent = goalName;
        if (idField) idField.value = goalId;
        if (currentEl) currentEl.textContent = Utils.formatCurrency(parseFloat(currentAmount));
        if (amountField) amountField.value = '';
        if (notesField) notesField.value = '';
        loadAccountsForFunds();
        loadContributionHistory(goalId);
        Utils.openModal('fundsModal');
    }

    function loadAccountsForFunds() {
        var sel = document.getElementById('fundsAccount');
        if (!sel) return;
        API.getAccounts().then(function (data) {
            var accounts = data.results || data;
            sel.innerHTML = '<option value="">— No account —</option>';
            accounts.forEach(function (a) {
                sel.innerHTML += '<option value="' + a.id + '">' + Utils.escapeHtml(a.name) + ' (' + Utils.formatCurrency(a.balance) + ')</option>';
            });
        });
    }

    function loadContributionHistory(goalId) {
        var container = document.getElementById('fundsHistory');
        if (!container) return;
        container.innerHTML = '';
        API.getGoalContributions(goalId).then(function (data) {
            var contribs = data.contributions || [];
            if (!contribs.length) {
                container.innerHTML = '<p style="font-size:0.8rem;color:var(--color-text-muted)">No fund additions yet.</p>';
                return;
            }
            var html = '<p style="font-size:0.8rem;font-weight:600;margin-bottom:0.5rem;color:var(--color-text-muted)">Recent additions:</p>';
            contribs.slice(0, 5).forEach(function (c) {
                html += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:0.25rem 0;border-bottom:1px solid var(--color-border)">' +
                    '<span>+' + Utils.formatCurrency(c.amount) + (c.account_name ? ' from ' + Utils.escapeHtml(c.account_name) : '') + '</span>' +
                    '<span style="color:var(--color-text-muted)">' + Utils.formatDate(c.created_at) + '</span>' +
                '</div>';
            });
            container.innerHTML = html;
        }).catch(function () {});
    }

    function addFunds() {
        var idField = document.getElementById('fundsGoalId');
        var amountField = document.getElementById('fundsAmount');
        var accountField = document.getElementById('fundsAccount');
        var notesField = document.getElementById('fundsNotes');
        var id = idField ? idField.value : '';
        var amount = parseFloat(amountField ? amountField.value : 0);

        if (!amount || amount <= 0) {
            Utils.showToast('Enter a valid amount.', 'error');
            return;
        }

        var payload = { amount: amount };
        if (accountField && accountField.value) payload.account_id = accountField.value;
        if (notesField && notesField.value) payload.notes = notesField.value;

        API.addFundsToGoal(id, payload).then(function (resp) {
            Utils.closeModal('fundsModal');
            Utils.showToast(resp.message || 'Funds added!', 'success');
            loadGoals();
        }).catch(function (err) {
            Utils.showToast(Utils.parseApiErrors(err), 'error');
        });
    }

    init();
})();
