/**
 * Admin dashboard logic
 */

(function () {
    'use strict';

    var page = 1;
    var pageSize = 20;

    function init() {
        bindEvents();
        loadOverview();
        loadUsers();
        loadAuditLogs();
    }

    function bindEvents() {
        var refreshUsersBtn = document.getElementById('adminUsersRefreshBtn');
        if (refreshUsersBtn) {
            refreshUsersBtn.addEventListener('click', function () {
                page = 1;
                loadUsers();
            });
        }

        var searchInput = document.getElementById('adminUserSearch');
        if (searchInput) {
            var timer = null;
            searchInput.addEventListener('input', function () {
                window.clearTimeout(timer);
                timer = window.setTimeout(function () {
                    page = 1;
                    loadUsers();
                }, 320);
            });
        }

        var roleFilter = document.getElementById('adminRoleFilter');
        if (roleFilter) {
            roleFilter.addEventListener('change', function () {
                page = 1;
                loadUsers();
            });
        }

        var planFilter = document.getElementById('adminPlanFilter');
        if (planFilter) {
            planFilter.addEventListener('change', function () {
                page = 1;
                loadUsers();
            });
        }

        var auditRefreshBtn = document.getElementById('adminAuditRefreshBtn');
        if (auditRefreshBtn) {
            auditRefreshBtn.addEventListener('click', loadAuditLogs);
        }

        var usersTable = document.getElementById('adminUsersTableBody');
        if (usersTable) {
            usersTable.addEventListener('click', function (event) {
                var saveBtn = event.target.closest('.admin-save-user');
                if (!saveBtn) return;

                var userId = saveBtn.getAttribute('data-user-id');
                var row = saveBtn.closest('tr');
                if (!row || !userId) return;

                var role = row.querySelector('.admin-role-select').value;
                var plan = row.querySelector('.admin-plan-select').value;
                var isActive = !!row.querySelector('.admin-active-toggle').checked;

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                API.updateAdminUser(userId, {
                    role: role,
                    plan: plan,
                    is_active: isActive,
                })
                    .then(function () {
                        Utils.showToast('User updated successfully.', 'success');
                        loadOverview();
                        loadUsers();
                    })
                    .catch(function (err) {
                        Utils.showToast(Utils.parseApiErrors(err), 'error');
                    })
                    .finally(function () {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save';
                    });
            });
        }
    }

    function loadOverview() {
        API.getAdminOverview()
            .then(function (data) {
                setText('adminTotalUsers', data.users && data.users.total);
                setText('adminPremiumUsers', data.users && data.users.premium);
                setText('adminTransactionsMonth', data.finance && data.finance.transactions_this_month);
                setText('adminEstimatedMrr', 'Rs.' + Number(data.finance && data.finance.estimated_mrr || 0).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }));
            })
            .catch(function (err) {
                Utils.showToast('Failed to load admin overview: ' + Utils.parseApiErrors(err), 'error');
            });
    }

    function loadUsers() {
        var q = (document.getElementById('adminUserSearch').value || '').trim();
        var role = (document.getElementById('adminRoleFilter').value || '').trim();
        var plan = (document.getElementById('adminPlanFilter').value || '').trim();

        API.getAdminUsers({
            q: q,
            role: role,
            plan: plan,
            page: page,
            page_size: pageSize,
        })
            .then(function (payload) {
                renderUsers(payload);
            })
            .catch(function (err) {
                var tbody = document.getElementById('adminUsersTableBody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-row">Unable to load users.</td></tr>';
                }
                Utils.showToast('Failed to load users: ' + Utils.parseApiErrors(err), 'error');
            });
    }

    function renderUsers(payload) {
        var tbody = document.getElementById('adminUsersTableBody');
        var meta = document.getElementById('adminUsersMeta');
        if (!tbody || !meta) return;

        var results = payload && payload.results ? payload.results : [];
        var total = payload && payload.count ? payload.count : 0;
        var currentPage = payload && payload.page ? payload.page : 1;
        var currentPageSize = payload && payload.page_size ? payload.page_size : pageSize;
        var start = total ? ((currentPage - 1) * currentPageSize + 1) : 0;
        var end = Math.min(total, (currentPage - 1) * currentPageSize + results.length);

        meta.textContent = total
            ? ('Showing ' + start + '-' + end + ' of ' + total + ' users')
            : 'No users found';

        if (!results.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-row">No users match your filters.</td></tr>';
            return;
        }

        tbody.innerHTML = results.map(function (user) {
            var displayName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username || user.email;
            var role = String(user.role || 'member').toLowerCase();
            var plan = String(user.plan || 'basic').toLowerCase();
            var activeChecked = user.is_active ? 'checked' : '';

            return '<tr>' +
                '<td>' +
                    '<div class="admin-user-name">' + Utils.escapeHtml(displayName) + '</div>' +
                    '<div class="admin-user-email">' + Utils.escapeHtml(user.email || '') + '</div>' +
                '</td>' +
                '<td>' +
                    '<select class="admin-role-select">' +
                        '<option value="member"' + (role === 'member' ? ' selected' : '') + '>Member</option>' +
                        '<option value="support"' + (role === 'support' ? ' selected' : '') + '>Support</option>' +
                        '<option value="admin"' + (role === 'admin' ? ' selected' : '') + '>Admin</option>' +
                    '</select>' +
                '</td>' +
                '<td>' +
                    '<select class="admin-plan-select">' +
                        '<option value="basic"' + (plan === 'basic' ? ' selected' : '') + '>Basic</option>' +
                        '<option value="premium"' + (plan === 'premium' ? ' selected' : '') + '>Premium</option>' +
                    '</select>' +
                '</td>' +
                '<td>' +
                    '<label class="admin-switch"><input type="checkbox" class="admin-active-toggle" ' + activeChecked + '><span>Active</span></label>' +
                '</td>' +
                '<td>' +
                    '<div class="admin-signal">Tx: ' + Number(user.transaction_count || 0) + '</div>' +
                    '<div class="admin-signal">Subs: ' + Number(user.subscription_count || 0) + '</div>' +
                '</td>' +
                '<td><button class="btn btn-outline btn-sm admin-save-user" data-user-id="' + user.id + '">Save</button></td>' +
            '</tr>';
        }).join('');
    }

    function loadAuditLogs() {
        var list = document.getElementById('adminAuditList');
        if (list) {
            list.innerHTML = '<div class="text-secondary" style="font-size:0.875rem">Loading audit logs...</div>';
        }

        API.getAdminAuditLogs({ limit: 25 })
            .then(function (payload) {
                renderAuditLogs(payload && payload.results ? payload.results : []);
            })
            .catch(function (err) {
                if (list) {
                    list.innerHTML = '<div class="text-danger" style="font-size:0.875rem">Failed to load audit logs.</div>';
                }
                Utils.showToast('Failed to load audit logs: ' + Utils.parseApiErrors(err), 'error');
            });
    }

    function renderAuditLogs(items) {
        var list = document.getElementById('adminAuditList');
        if (!list) return;

        if (!items.length) {
            list.innerHTML = '<div class="text-secondary" style="font-size:0.875rem">No audit events found.</div>';
            return;
        }

        list.innerHTML = items.map(function (log) {
            var created = log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : '-';
            var actor = log.actor_email || 'system';
            return '<div class="admin-audit-item">' +
                '<div class="admin-audit-top">' +
                    '<span class="admin-audit-action">' + Utils.escapeHtml(log.action || 'unknown') + '</span>' +
                    '<span class="admin-audit-time">' + Utils.escapeHtml(created) + '</span>' +
                '</div>' +
                '<div class="admin-audit-meta">Actor: ' + Utils.escapeHtml(actor) + ' | Resource: ' + Utils.escapeHtml((log.resource_type || '-') + ':' + (log.resource_id || '-')) + '</div>' +
            '</div>';
        }).join('');
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = value == null ? '-' : String(value);
    }

    init();
})();
