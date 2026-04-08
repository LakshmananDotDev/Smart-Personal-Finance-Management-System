/**
 * Accounts page — list, create, edit, delete accounts
 */

(function () {
    'use strict';

    var TYPE_SVGS = {
        bank: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7"></polygon><line x1="2" y1="22" x2="22" y2="22"></line></svg>',
        cash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><circle cx="12" cy="12" r="3"></circle><line x1="1" y1="8" x2="4" y2="8"></line><line x1="20" y1="8" x2="23" y2="8"></line><line x1="1" y1="16" x2="4" y2="16"></line><line x1="20" y1="16" x2="23" y2="16"></line></svg>',
        upi: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
        credit: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>',
        wallet: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>'
    };

    var TYPE_LABELS = {
        bank: 'Bank', cash: 'Cash', upi: 'UPI', credit: 'Credit Card', wallet: 'Wallet'
    };

    var accounts = [];

    function loadAccounts() {
        API.getAccounts()
            .then(function (data) {
                accounts = data.results || data || [];
                renderSummary();
                renderGrid();
            })
            .catch(function () {
                Utils.showToast('Failed to load accounts.', 'error');
            });
    }

    function renderSummary() {
        var totalBal = accounts.reduce(function (sum, a) { return sum + parseFloat(a.balance || 0); }, 0);
        var def = accounts.find(function (a) { return a.is_default; });

        var balEl = document.getElementById('totalBalance');
        if (balEl) balEl.textContent = Utils.formatCurrency(totalBal);

        var countEl = document.getElementById('totalAccounts');
        if (countEl) countEl.textContent = accounts.length;

        var defEl = document.getElementById('defaultAccount');
        if (defEl) defEl.textContent = def ? def.name : '—';
    }

    function renderGrid() {
        var grid = document.getElementById('accountsGrid');
        if (!grid) return;

        if (!accounts.length) {
            grid.innerHTML = '<div class="empty-state"><h3>No accounts yet</h3><p>Add your first account to start tracking.</p></div>';
            return;
        }

        grid.innerHTML = accounts.map(function (acct) {
            var bal = parseFloat(acct.balance || 0);
            var isNeg = bal < 0;
            var balClass = isNeg ? 'text-danger' : 'text-success';
            var icon = TYPE_SVGS[acct.type] || TYPE_SVGS.wallet;
            var label = TYPE_LABELS[acct.type] || acct.type;

            return '<div class="account-card card animate-fade-in-up" data-id="' + acct.id + '">' +
                '<div class="account-card-header">' +
                    '<div class="account-card-icon" style="background:' + (acct.color || '#6366f1') + '15;color:' + (acct.color || '#6366f1') + '">' +
                        icon +
                    '</div>' +
                    '<div class="account-card-actions">' +
                        (acct.is_default ? '<span class="badge badge-warning" style="font-size:0.65rem">DEFAULT</span> ' : '') +
                        '<button class="btn btn-ghost btn-sm edit-btn" data-id="' + acct.id + '" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>' +
                        '<button class="btn btn-ghost btn-sm delete-btn" data-id="' + acct.id + '" title="Delete" style="color:var(--color-danger)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
                    '</div>' +
                '</div>' +
                '<div class="account-card-body">' +
                    '<h3 class="account-card-name">' + Utils.escapeHtml(acct.name) + '</h3>' +
                    '<span class="badge" style="background:' + (acct.color || '#6366f1') + '15;color:' + (acct.color || '#6366f1') + ';font-size:0.7rem">' + label + '</span>' +
                '</div>' +
                '<div class="account-card-balance ' + balClass + '">' +
                    Utils.formatCurrency(bal) +
                '</div>' +
            '</div>';
        }).join('');
    }

    /* ── Modal ── */
    function openModal(acct) {
        var modal = document.getElementById('accountModal');
        var title = document.getElementById('accountModalTitle');

        if (acct) {
            title.textContent = 'Edit Account';
            document.getElementById('accountId').value = acct.id;
            document.getElementById('accountName').value = acct.name;
            document.getElementById('accountType').value = acct.type;
            document.getElementById('accountBalance').value = acct.balance;
            document.getElementById('accountColor').value = acct.color || '#6366f1';
            document.getElementById('accountDefault').checked = acct.is_default;
        } else {
            title.textContent = 'Add Account';
            document.getElementById('accountForm').reset();
            document.getElementById('accountId').value = '';
            document.getElementById('accountColor').value = '#6366f1';
        }

        modal.classList.add('active');
    }

    function closeModal() {
        document.getElementById('accountModal').classList.remove('active');
    }

    function saveAccount(e) {
        e.preventDefault();

        var id = document.getElementById('accountId').value;
        var data = {
            name: document.getElementById('accountName').value.trim(),
            type: document.getElementById('accountType').value,
            balance: document.getElementById('accountBalance').value,
            color: document.getElementById('accountColor').value,
            is_default: document.getElementById('accountDefault').checked
        };

        if (!data.name) {
            Utils.showToast('Account name is required.', 'error');
            return;
        }

        var promise = id
            ? API.updateAccount(id, data)
            : API.createAccount(data);

        promise
            .then(function () {
                Utils.showToast(id ? 'Account updated!' : 'Account created!', 'success');
                closeModal();
                loadAccounts();
            })
            .catch(function (err) {
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function deleteAccount(id) {
        if (!confirm('Delete this account? Transactions linked to it will lose their account reference.')) return;

        API.deleteAccount(id)
            .then(function () {
                Utils.showToast('Account deleted.', 'success');
                loadAccounts();
            })
            .catch(function () {
                Utils.showToast('Failed to delete account.', 'error');
            });
    }

    /* ── Event Wiring ── */
    document.getElementById('addAccountBtn').addEventListener('click', function () {
        openModal(null);
    });

    document.getElementById('closeAccountModal').addEventListener('click', closeModal);
    document.getElementById('cancelAccountBtn').addEventListener('click', closeModal);
    document.getElementById('accountForm').addEventListener('submit', saveAccount);

    // Delegate edit/delete clicks on the grid
    document.getElementById('accountsGrid').addEventListener('click', function (e) {
        var editBtn = e.target.closest('.edit-btn');
        var deleteBtn = e.target.closest('.delete-btn');

        if (editBtn) {
            var id = editBtn.getAttribute('data-id');
            var acct = accounts.find(function (a) { return String(a.id) === id; });
            if (acct) openModal(acct);
        }

        if (deleteBtn) {
            var delId = deleteBtn.getAttribute('data-id');
            deleteAccount(delId);
        }
    });

    loadAccounts();
})();
