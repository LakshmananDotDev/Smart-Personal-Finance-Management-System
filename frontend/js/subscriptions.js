/**
 * Subscriptions page — list, detect, add/edit subscriptions
 */

(function () {
    'use strict';

    function isPremiumRequired(err) {
        return !!(err && (err.error_code === 'premium_required' || err.upgrade_required));
    }

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

    function getSubscriptionUrgency(sub) {
        if (!sub.is_active) {
            return {
                rowClass: 'sub-urgency-inactive',
                chipClass: 'sub-due-inactive',
                chipLabel: 'Inactive',
                sortValue: 999998,
            };
        }

        var leftDays = daysUntil(sub.next_date);

        if (leftDays === null) {
            return {
                rowClass: 'sub-urgency-unknown',
                chipClass: 'sub-due-unknown',
                chipLabel: 'No next date',
                sortValue: 999997,
            };
        }

        if (leftDays < 0) {
            return {
                rowClass: 'sub-urgency-overdue',
                chipClass: 'sub-due-overdue',
                chipLabel: 'Overdue ' + Math.abs(leftDays) + 'd',
                sortValue: leftDays,
            };
        }

        if (leftDays <= 3) {
            return {
                rowClass: 'sub-urgency-critical',
                chipClass: 'sub-due-critical',
                chipLabel: leftDays === 0 ? 'Due today' : 'Due in ' + leftDays + 'd',
                sortValue: leftDays,
            };
        }

        if (leftDays <= 7) {
            return {
                rowClass: 'sub-urgency-soon',
                chipClass: 'sub-due-soon',
                chipLabel: 'Due in ' + leftDays + 'd',
                sortValue: leftDays,
            };
        }

        if (leftDays <= 14) {
            return {
                rowClass: 'sub-urgency-watch',
                chipClass: 'sub-due-watch',
                chipLabel: 'Due in ' + leftDays + 'd',
                sortValue: leftDays,
            };
        }

        return {
            rowClass: 'sub-urgency-future',
            chipClass: 'sub-due-future',
            chipLabel: 'Due in ' + leftDays + 'd',
            sortValue: leftDays,
        };
    }

    function init() {
        bindEvents();
        loadSubscriptions();
    }

    function bindEvents() {
        var addBtn = document.getElementById('addSubBtn');
        if (addBtn) addBtn.addEventListener('click', function () {
            resetForm();
            document.getElementById('subModalTitle').textContent = 'Add Subscription';
            Utils.openModal('subModal');
        });

        var detectBtn = document.getElementById('detectSubsBtn');
        if (detectBtn) detectBtn.addEventListener('click', detectSubscriptions);

        var form = document.getElementById('subForm');
        if (form) form.addEventListener('submit', handleSave);
    }

    function loadSubscriptions() {
        API.getSubscriptions()
            .then(function (data) {
                var subs = Array.isArray(data) ? data : data.results || [];
                renderList(subs);
                renderSummary(subs);
            })
            .catch(function () {
                Utils.showToast('Failed to load subscriptions.', 'error');
            });
    }

    function renderSummary(subs) {
        var active = subs.filter(function (s) { return s.is_active; });
        var monthly = 0;
        active.forEach(function (s) {
            if (s.frequency === 'weekly') monthly += parseFloat(s.amount) * 4.33;
            else if (s.frequency === 'yearly') monthly += parseFloat(s.amount) / 12;
            else monthly += parseFloat(s.amount);
        });

        setText('subMonthly', Utils.formatCurrency(monthly));
        setText('subYearly', Utils.formatCurrency(monthly * 12));
        setText('subCount', active.length);
    }

    function renderList(subs) {
        var container = document.getElementById('subsList');
        if (!container) return;

        if (!subs.length) {
            container.innerHTML = '<p class="text-muted" style="padding:1.5rem;text-align:center">No subscriptions yet. Click "Detect" to scan your transactions or "Add" to create one manually.</p>';
            return;
        }

        var sortedSubs = subs.slice().sort(function (a, b) {
            var ua = getSubscriptionUrgency(a);
            var ub = getSubscriptionUrgency(b);
            if (ua.sortValue !== ub.sortValue) return ua.sortValue - ub.sortValue;
            return (a.name || '').localeCompare(b.name || '');
        });

        container.innerHTML = sortedSubs.map(function (sub) {
            var statusClass = sub.is_active ? 'text-success' : 'text-muted';
            var statusText = sub.is_active ? 'Active' : 'Inactive';
            var urgency = getSubscriptionUrgency(sub);
            return '<div class="transaction-item subscription-item ' + urgency.rowClass + '">' +
                '<div class="transaction-icon" style="background:rgba(42,168,137,0.12);color:var(--color-primary);display:flex;align-items:center;justify-content:center">' + Utils.iconSVG('repeat') + '</div>' +
                '<div class="transaction-details" style="flex:1">' +
                    '<div style="display:flex;align-items:center;gap:0.5rem">' +
                        '<span class="transaction-name">' + Utils.escapeHtml(sub.name) + '</span>' +
                        '<span class="badge" style="font-size:0.65rem;padding:0.15rem 0.4rem;border-radius:var(--radius-full);background:var(--color-bg-card);color:var(--color-text-secondary)">' + sub.frequency + '</span>' +
                        '<span class="sub-due-chip ' + urgency.chipClass + '">' + urgency.chipLabel + '</span>' +
                    '</div>' +
                    '<span class="transaction-date ' + statusClass + '">' + statusText +
                        (sub.next_date ? ' | Next: ' + Utils.formatDate(sub.next_date) : '') +
                    '</span>' +
                '</div>' +
                '<span class="transaction-amount expense" style="margin-right:0.75rem">' + Utils.formatCurrency(sub.amount) + '</span>' +
                '<div style="display:flex;gap:0.25rem">' +
                    '<button class="btn btn-ghost btn-icon btn-sm" onclick="SubsPage.edit(' + sub.id + ')" title="Edit">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
                    '</button>' +
                    '<button class="btn btn-ghost btn-icon btn-sm" onclick="SubsPage.remove(' + sub.id + ')" title="Delete" style="color:var(--color-danger)">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
                    '</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function detectSubscriptions() {
        Utils.showToast('Scanning transactions for recurring payments...', 'info');
        API.detectSubscriptions()
            .then(function (data) {
                var detected = data.detected || [];
                if (!detected.length) {
                    Utils.showToast('No recurring payments detected.', 'info');
                    return;
                }
                renderDetected(detected);
            })
            .catch(function (err) {
                if (isPremiumRequired(err)) {
                    Utils.showToast('Subscription auto-detection is Premium. Upgrade from Profile.', 'warning');
                    return;
                }
                Utils.showToast('Detection failed. Try adding more transactions.', 'error');
            });
    }

    function renderDetected(items) {
        var card = document.getElementById('detectedCard');
        var list = document.getElementById('detectedList');
        if (!card || !list) return;

        card.style.display = 'block';
        list.innerHTML = items.map(function (item, i) {
            return '<div class="transaction-item">' +
                '<div class="transaction-details" style="flex:1">' +
                    '<span class="transaction-name">' + Utils.escapeHtml(item.merchant || item.description || 'Unknown') + '</span>' +
                    '<span class="transaction-date">~' + Utils.formatCurrency(item.amount) + ' / ' + (item.frequency || 'monthly') +
                        ' · Confidence: ' + (item.confidence || 0) + '%</span>' +
                '</div>' +
                '<button class="btn btn-outline btn-sm" onclick="SubsPage.confirmDetected(' + i + ')">Add</button>' +
            '</div>';
        }).join('');

        // Store for later use
        window._detectedSubs = items;
    }

    function confirmDetected(index) {
        var item = (window._detectedSubs || [])[index];
        if (!item) return;
        API.createSubscription({
            name: item.merchant || item.description || 'Subscription',
            amount: item.amount,
            frequency: item.frequency || 'monthly',
            detected_auto: true,
        }).then(function () {
            Utils.showToast('Subscription added!', 'success');
            loadSubscriptions();
        }).catch(function (err) {
            Utils.showToast(Utils.parseApiErrors(err), 'error');
        });
    }

    function resetForm() {
        document.getElementById('subName').value = '';
        document.getElementById('subAmount').value = '';
        document.getElementById('subFrequency').value = 'monthly';
        document.getElementById('subNextDate').value = '';
        document.getElementById('subEditId').value = '';
    }

    function handleSave(e) {
        e.preventDefault();
        var id = document.getElementById('subEditId').value;
        var payload = {
            name: document.getElementById('subName').value,
            amount: document.getElementById('subAmount').value,
            frequency: document.getElementById('subFrequency').value,
            next_date: document.getElementById('subNextDate').value || null,
        };

        var promise = id ? API.updateSubscription(id, payload) : API.createSubscription(payload);
        promise.then(function () {
            Utils.closeModal('subModal');
            Utils.showToast(id ? 'Subscription updated!' : 'Subscription added!', 'success');
            loadSubscriptions();
        }).catch(function (err) {
            Utils.showToast(Utils.parseApiErrors(err), 'error');
        });
    }

    function editSub(id) {
        API.getSubscriptions().then(function (data) {
            var subs = Array.isArray(data) ? data : data.results || [];
            var sub = subs.find(function (s) { return s.id === id; });
            if (!sub) return;
            document.getElementById('subName').value = sub.name;
            document.getElementById('subAmount').value = sub.amount;
            document.getElementById('subFrequency').value = sub.frequency;
            document.getElementById('subNextDate').value = sub.next_date || '';
            document.getElementById('subEditId').value = sub.id;
            document.getElementById('subModalTitle').textContent = 'Edit Subscription';
            Utils.openModal('subModal');
        });
    }

    function removeSub(id) {
        if (!confirm('Delete this subscription?')) return;
        API.deleteSubscription(id)
            .then(function () {
                Utils.showToast('Subscription deleted.', 'success');
                loadSubscriptions();
            })
            .catch(function () {
                Utils.showToast('Delete failed.', 'error');
            });
    }

    function setText(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // Expose for inline onclick handlers
    window.SubsPage = {
        edit: editSub,
        remove: removeSub,
        confirmDetected: confirmDetected,
    };

    init();
})();
