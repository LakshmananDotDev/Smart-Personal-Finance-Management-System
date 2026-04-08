/**
 * Profile & Settings page logic
 */
(function () {
    'use strict';

    var user = null;
    var entitlements = null;
    var isEditing = false;
    var checkoutBusy = false;
    var PREMIUM_ORDER_CACHE_TTL_MS = 8 * 60 * 1000;
    var premiumOrderCache = {
        monthly: null,
        yearly: null,
    };
    var pendingUpgradePlan = readUpgradeIntent();
    var upgradeIntentHandled = false;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        loadProfile();
    }

    function isAdminContext() {
        return !!(user && (user.role === 'admin' || user.is_superuser === true));
    }

    function applyProfilePageMode() {
        var adminMode = isAdminContext();
        var headerTitle = document.querySelector('.main-header-title');
        var contextTitle = document.querySelector('.page-context-title');
        var contextDesc = document.querySelector('.page-context-desc');

        if (headerTitle) {
            headerTitle.textContent = adminMode ? 'Admin Profile' : 'Profile & Settings';
        }
        if (contextTitle) {
            contextTitle.textContent = adminMode ? 'Admin Profile' : 'Profile & Settings';
        }
        if (contextDesc) {
            contextDesc.textContent = adminMode
                ? 'Manage your admin account details and security controls.'
                : 'Update your personal details, change your password, configure notification preferences, and export your financial data whenever you need it.';
        }

        [
            '.profile-card-preferences',
            '.profile-card-premium',
            '.profile-card-data',
            '.profile-hero-panel',
        ].forEach(function (selector) {
            var el = document.querySelector(selector);
            if (!el) return;
            el.style.display = adminMode ? 'none' : '';
        });

        var heroPlanPill = document.getElementById('heroPlanPill');
        if (heroPlanPill && adminMode) {
            heroPlanPill.textContent = 'Admin Access';
            heroPlanPill.classList.add('premium');
        }
    }

    function readUpgradeIntent() {
        try {
            var params = new URLSearchParams(window.location.search || '');
            var requested = (params.get('upgrade') || '').trim().toLowerCase();
            if (requested === 'monthly' || requested === 'yearly') {
                return requested;
            }
            return '';
        } catch (_) {
            return '';
        }
    }

    function clearUpgradeIntentFromUrl() {
        if (!window.history || typeof window.history.replaceState !== 'function') return;

        try {
            var current = new URL(window.location.href);
            current.searchParams.delete('upgrade');
            var nextPath = current.pathname + (current.search || '') + (current.hash || '');
            window.history.replaceState({}, '', nextPath);
        } catch (_) {
            // Ignore URL rewrite issues.
        }
    }

    function maybeRunUpgradeIntent() {
        if (upgradeIntentHandled) return;
        if (!pendingUpgradePlan) return;
        if (!user) return;

        upgradeIntentHandled = true;
        clearUpgradeIntentFromUrl();

        if (hasPremiumPlan()) {
            Utils.showToast('Premium is already active on your account.', 'info');
            return;
        }

        window.setTimeout(function () {
            startPremiumCheckout(pendingUpgradePlan);
        }, 120);
    }

    /* ── Load profile data ── */
    function loadProfile() {
        API.getProfile().then(function (data) {
            user = data;
            API.setUser(data);
            populateProfile();

            if (isAdminContext()) {
                upgradeIntentHandled = true;
            } else {
                loadEntitlements();
                loadAccounts();
                maybeRunUpgradeIntent();
            }
        }).catch(function () {
            Utils.showToast('Failed to load profile', 'error');
        });
    }

    function loadEntitlements() {
        API.getEntitlements().then(function (data) {
            entitlements = data;
            renderPremiumCard();
            warmPremiumOrderCache();
        }).catch(function () {
            // Premium card should still work with profile fallback values.
            renderPremiumCard();
        });
    }

    function hasPremiumPlan() {
        return !!(user && user.is_premium);
    }

    function getCachedPremiumOrder(planCode) {
        var cached = premiumOrderCache[planCode];
        if (!cached || !cached.data || !cached.createdAt) return null;
        if ((Date.now() - cached.createdAt) > PREMIUM_ORDER_CACHE_TTL_MS) return null;
        return cached.data;
    }

    function setCachedPremiumOrder(planCode, order) {
        premiumOrderCache[planCode] = {
            data: order,
            createdAt: Date.now(),
        };
    }

    function warmPremiumOrderCache() {
        if (hasPremiumPlan()) return;

        ['monthly', 'yearly'].forEach(function (planCode) {
            if (getCachedPremiumOrder(planCode)) return;

            API.createPremiumOrder(planCode)
                .then(function (order) {
                    if (order && order.order_id && order.key_id) {
                        setCachedPremiumOrder(planCode, order);
                    }
                })
                .catch(function () {
                    // Best-effort prefetch only.
                });
        });
    }

    function populateProfile() {
        if (!user) return;

        // Avatar
        var avatarEl = document.getElementById('profileAvatar');
        if (user.avatar) {
            avatarEl.style.backgroundImage = 'url(' + user.avatar + ')';
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.textContent = '';
        } else {
            avatarEl.textContent = (user.first_name || user.username || 'U').charAt(0).toUpperCase();
        }

        // Info
        var name = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username;
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileEmail').textContent = user.email;

        if (user.created_at) {
            var d = new Date(user.created_at);
            document.getElementById('profileJoined').textContent = 'Joined ' + d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        }

        // Form fields
        document.getElementById('firstName').value = user.first_name || '';
        document.getElementById('lastName').value = user.last_name || '';
        document.getElementById('emailField').value = user.email || '';
        document.getElementById('avatarUrl').value = user.avatar || '';

        // Preferences
        document.getElementById('currencySelect').value = user.currency || 'INR';

        var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        document.getElementById('themeSelect').value = currentTheme;

        applyProfilePageMode();
        renderPremiumCard();
    }

    function getPriceDisplay(planCode, fallback) {
        var pricing = entitlements && entitlements.pricing;
        var plan = pricing && pricing[planCode];
        var amount = plan && plan.amount_inr;
        if (typeof amount !== 'number' || amount <= 0) return fallback;
        return 'Rs.' + amount;
    }

    function renderPremiumCard() {
        var badge = document.getElementById('planBadge');
        var label = document.getElementById('planStatusLabel');
        var desc = document.getElementById('planStatusDesc');
        var expiry = document.getElementById('premiumExpiryText');
        var monthlyBtn = document.getElementById('upgradeMonthlyBtn');
        var yearlyBtn = document.getElementById('upgradeYearlyBtn');
        var heroPlanPill = document.getElementById('heroPlanPill');

        if (!badge || !label || !desc || !expiry || !monthlyBtn || !yearlyBtn) return;

        var isPremium = !!(user && user.is_premium);
        var monthlyPrice = getPriceDisplay('monthly', 'Rs.149');
        var yearlyPrice = getPriceDisplay('yearly', 'Rs.1499');

        if (heroPlanPill) {
            heroPlanPill.textContent = isPremium ? 'Premium Member' : 'Basic Member';
            heroPlanPill.classList.toggle('premium', isPremium);
        }

        badge.textContent = 'Plan: ' + (isPremium ? 'Premium' : 'Basic');
        badge.style.background = isPremium ? 'rgba(16,185,129,0.2)' : 'rgba(148,163,184,0.2)';
        badge.style.color = isPremium ? 'var(--color-success)' : 'var(--color-text-secondary)';

        if (isPremium) {
            label.textContent = 'Premium is active';
            desc.textContent = 'You have full access to all AI insights, simulator, health score, advanced imports, and tax intelligence.';
            if (user && user.premium_expires_at) {
                var expiryDate = new Date(user.premium_expires_at);
                if (!Number.isNaN(expiryDate.getTime())) {
                    expiry.textContent = 'Active until ' + expiryDate.toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'long', year: 'numeric'
                    });
                } else {
                    expiry.textContent = '';
                }
            } else {
                expiry.textContent = '';
            }
            monthlyBtn.textContent = 'Extend Monthly - ' + monthlyPrice;
            yearlyBtn.textContent = 'Extend Yearly - ' + yearlyPrice;
        } else {
            label.textContent = 'Unlock premium intelligence and automation';
            desc.textContent = 'Upgrade to access full AI insights, simulator projections, health score, and advanced tax optimization.';
            expiry.textContent = '';
            monthlyBtn.textContent = 'Upgrade Monthly - ' + monthlyPrice;
            yearlyBtn.textContent = 'Upgrade Yearly - ' + yearlyPrice;
        }

        monthlyBtn.disabled = checkoutBusy;
        yearlyBtn.disabled = checkoutBusy;
    }

    /* ── Load accounts for default account picker ── */
    function loadAccounts() {
        API.getAccounts().then(function (data) {
            var select = document.getElementById('defaultAccountSelect');
            var accounts = data.results || data;
            select.innerHTML = '<option value="">None</option>';
            accounts.forEach(function (acc) {
                var opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.name;
                if (acc.is_default) opt.selected = true;
                select.appendChild(opt);
            });
        }).catch(function () { });
    }

    /* ── Bind all events ── */
    function bindEvents() {
        // Edit personal info
        document.getElementById('editPersonalBtn').addEventListener('click', toggleEdit);
        document.getElementById('cancelPersonalBtn').addEventListener('click', cancelEdit);
        document.getElementById('personalForm').addEventListener('submit', savePersonal);

        // Preferences
        document.getElementById('currencySelect').addEventListener('change', saveCurrency);
        document.getElementById('themeSelect').addEventListener('change', saveTheme);
        document.getElementById('defaultAccountSelect').addEventListener('change', saveDefaultAccount);

        // Password
        document.getElementById('passwordForm').addEventListener('submit', changePassword);

        // Premium billing
        var monthlyBtn = document.getElementById('upgradeMonthlyBtn');
        var yearlyBtn = document.getElementById('upgradeYearlyBtn');
        if (monthlyBtn) {
            monthlyBtn.addEventListener('click', function (event) {
                event.preventDefault();
                startPremiumCheckout('monthly');
            });
        }
        if (yearlyBtn) {
            yearlyBtn.addEventListener('click', function (event) {
                event.preventDefault();
                startPremiumCheckout('yearly');
            });
        }

        // Export – populate year dropdown and set defaults
        (function initExportSelectors() {
            var yearSel = document.getElementById('exportYear');
            var now = new Date();
            var curYear = now.getFullYear();
            for (var y = curYear; y >= curYear - 5; y--) {
                var opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                yearSel.appendChild(opt);
            }
            yearSel.value = curYear;
            document.getElementById('exportMonth').value = now.getMonth() + 1;

            var typeSel = document.getElementById('exportType');
            function toggleMonthVisibility() {
                document.getElementById('exportMonth').style.display = typeSel.value === 'monthly' ? '' : 'none';
            }
            typeSel.addEventListener('change', toggleMonthVisibility);
            toggleMonthVisibility();
        })();
        document.getElementById('exportDataBtn').addEventListener('click', exportData);

        // Delete account
        document.getElementById('deleteAccountBtn').addEventListener('click', function () {
            document.getElementById('deleteConfirmModal').classList.add('active');
            document.getElementById('deleteConfirmInput').value = '';
            document.getElementById('confirmDeleteBtn').disabled = true;
        });
        document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
        document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
        document.getElementById('deleteConfirmInput').addEventListener('input', function () {
            document.getElementById('confirmDeleteBtn').disabled = this.value !== 'DELETE';
        });
        document.getElementById('confirmDeleteBtn').addEventListener('click', deleteAccount);
    }

    function setCheckoutBusyState(nextState) {
        checkoutBusy = !!nextState;
        renderPremiumCard();
    }

    function startPremiumCheckout(planCode) {
        if (checkoutBusy) return;

        if (typeof window.Razorpay === 'undefined') {
            Utils.showToast('Razorpay checkout failed to load. Refresh and try again.', 'error');
            return;
        }

        var cachedOrder = getCachedPremiumOrder(planCode);
        if (cachedOrder) {
            openRazorpayCheckout(planCode, cachedOrder);
            return;
        }

        setCheckoutBusyState(true);

        API.createPremiumOrder(planCode)
            .then(function (order) {
                if (!order || !order.order_id || !order.key_id) {
                    throw new Error('Unable to initialize checkout. Please try again.');
                }
                setCachedPremiumOrder(planCode, order);
                openRazorpayCheckout(planCode, order);
            })
            .catch(function (err) {
                setCheckoutBusyState(false);
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function openRazorpayCheckout(planCode, order) {
        setCheckoutBusyState(true);

        var fullName = '';
        if (user) {
            fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username || '';
        }

        var options = {
            key: order.key_id,
            amount: order.amount,
            currency: order.currency || 'INR',
            name: 'Finyx Premium',
            description: order.plan_label || 'Premium Subscription',
            order_id: order.order_id,
            prefill: {
                name: fullName,
                email: (user && user.email) || '',
            },
            notes: {
                plan: planCode,
            },
            theme: {
                color: '#0ea5e9',
            },
            modal: {
                ondismiss: function () {
                    setCheckoutBusyState(false);
                },
            },
            handler: function (response) {
                verifyPremiumPayment(planCode, response);
            },
        };

        try {
            var checkout = new window.Razorpay(options);
            checkout.on('payment.failed', function (event) {
                setCheckoutBusyState(false);
                var err = event && event.error ? event.error.description : '';
                Utils.showToast(err || 'Payment was not completed.', 'error');
            });
            checkout.open();
        } catch (err) {
            setCheckoutBusyState(false);
            Utils.showToast(Utils.parseApiErrors(err), 'error');
        }
    }

    function verifyPremiumPayment(planCode, paymentResponse) {
        API.verifyPremiumPayment({
            plan: planCode,
            razorpay_order_id: paymentResponse.razorpay_order_id,
            razorpay_payment_id: paymentResponse.razorpay_payment_id,
            razorpay_signature: paymentResponse.razorpay_signature,
        }).then(function (data) {
            setCheckoutBusyState(false);

            if (data.user) {
                user = data.user;
                API.setUser(data.user);
                populateProfile();
            }

            if (data.entitlements) {
                entitlements = data.entitlements;
            } else {
                loadEntitlements();
            }

            if (window.populateUserInfo) window.populateUserInfo();
            Utils.showToast(data.message || 'Premium activated successfully.', 'success');
        }).catch(function (err) {
            setCheckoutBusyState(false);
            Utils.showToast(Utils.parseApiErrors(err), 'error');
        });
    }

    /* ── Personal info edit ── */
    function toggleEdit() {
        isEditing = true;
        document.getElementById('firstName').disabled = false;
        document.getElementById('lastName').disabled = false;
        document.getElementById('avatarUrl').disabled = false;
        document.getElementById('personalActions').style.display = 'flex';
        document.getElementById('editPersonalBtn').style.display = 'none';
        document.getElementById('firstName').focus();
    }

    function cancelEdit() {
        isEditing = false;
        populateProfile();
        document.getElementById('firstName').disabled = true;
        document.getElementById('lastName').disabled = true;
        document.getElementById('avatarUrl').disabled = true;
        document.getElementById('personalActions').style.display = 'none';
        document.getElementById('editPersonalBtn').style.display = '';
    }

    function savePersonal(e) {
        e.preventDefault();
        var data = {
            first_name: document.getElementById('firstName').value.trim(),
            last_name: document.getElementById('lastName').value.trim(),
            avatar: document.getElementById('avatarUrl').value.trim()
        };

        API.updateProfile(data).then(function (updated) {
            user = updated;
            API.setUser(updated);
            cancelEdit();
            populateProfile();
            Utils.showToast('Profile updated', 'success');
            // Update sidebar name/avatar
            if (window.populateUserInfo) window.populateUserInfo();
        }).catch(function (err) {
            Utils.showToast(err.message || 'Failed to update profile', 'error');
        });
    }

    /* ── Preferences ── */
    function saveCurrency() {
        var currency = document.getElementById('currencySelect').value;
        API.updateProfile({ currency: currency }).then(function (updated) {
            user = updated;
            API.setUser(updated);
            loadAccounts();
            Utils.showToast('Currency updated to ' + currency + '. Amounts converted.', 'success');
        }).catch(function () {
            Utils.showToast('Failed to update currency', 'error');
        });
    }

    function saveTheme() {
        var theme = document.getElementById('themeSelect').value;
        if (typeof window.setAppTheme === 'function') {
            window.setAppTheme(theme);
        } else {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('sf_theme', theme);
        }
        API.updateProfile({ dark_mode: theme === 'dark' }).catch(function () { });
        Utils.showToast('Theme changed to ' + theme, 'success');
    }

    function saveDefaultAccount() {
        var accountId = document.getElementById('defaultAccountSelect').value;
        if (!accountId) return;

        // Set this account as default via the accounts API
        API.updateAccount(accountId, { is_default: true }).then(function () {
            Utils.showToast('Default account updated', 'success');
        }).catch(function () {
            Utils.showToast('Failed to update default account', 'error');
        });
    }

    /* ── Password ── */
    function changePassword(e) {
        e.preventDefault();
        var current = document.getElementById('currentPassword').value;
        var newPw = document.getElementById('newPassword').value;
        var confirm = document.getElementById('confirmPassword').value;

        if (!current || !newPw) {
            Utils.showToast('Please fill in all password fields', 'error');
            return;
        }
        if (newPw.length < 6) {
            Utils.showToast('Password must be at least 6 characters', 'error');
            return;
        }
        if (newPw !== confirm) {
            Utils.showToast('Passwords do not match', 'error');
            return;
        }

        API.changePassword({
            current_password: current,
            new_password: newPw
        }).then(function () {
            Utils.showToast('Password changed successfully', 'success');
            document.getElementById('passwordForm').reset();
        }).catch(function (err) {
            Utils.showToast(err.message || (typeof err.error === 'string' ? err.error : '') || 'Failed to change password', 'error');
        });
    }

    /* ── Export Data ── */
    function exportData() {
        var exportType = document.getElementById('exportType').value;
        var exportYear = parseInt(document.getElementById('exportYear').value);
        var exportMonth = parseInt(document.getElementById('exportMonth').value);

        Utils.showToast('Preparing comprehensive PDF report...', 'info');

        buildFullReport(user, exportType, exportYear, exportMonth)
            .then(function () {
                Utils.showToast('PDF report exported successfully!', 'success');
            })
            .catch(function (err) {
                console.error('Export error:', err);
                Utils.showToast('Failed to export report: ' + (err.message || 'Unknown error'), 'error');
            });
    }

    /* ── Delete Account ── */
    function closeDeleteModal() {
        document.getElementById('deleteConfirmModal').classList.remove('active');
    }

    function deleteAccount() {
        if (document.getElementById('deleteConfirmInput').value !== 'DELETE') return;

        // Clear all local data and redirect to login
        API.clearAuth();
        localStorage.removeItem('sf_theme');
        localStorage.removeItem('sf_sidebar_scroll');
        Utils.showToast('Account deletion requested', 'info');
        setTimeout(function () {
            window.location.href = 'login.html';
        }, 1000);
    }
})();
