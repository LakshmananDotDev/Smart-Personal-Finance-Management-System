/**
 * AI Insights page — display and refresh AI-generated financial insights
 */

(function () {
    'use strict';

    var PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
    var currentView = 'suggestions';

    function userHasPremiumAccess() {
        var user = API.getUser() || {};
        if (user.is_premium === true || user.premium_active === true) {
            return true;
        }

        var plan = String(user.plan || '').toLowerCase();
        return plan === 'premium';
    }

    function isPremiumRequired(err) {
        return !!(err && (err.error_code === 'premium_required' || err.upgrade_required));
    }

    function premiumLockedHtml(message) {
        return '<div class="card" style="text-align:center;padding:1.25rem">' +
            '<p style="font-weight:600;margin-bottom:0.4rem">Premium feature</p>' +
            '<p class="text-secondary" style="margin-bottom:0.8rem">' + Utils.escapeHtml(message || 'Upgrade to Premium to unlock this section.') + '</p>' +
            '<a href="index.html#pricing" class="btn btn-primary btn-sm">Upgrade to Premium</a>' +
        '</div>';
    }

    function normalizeType(type) {
        var t = (type || 'info').toLowerCase();
        return ['danger', 'warning', 'success', 'info'].indexOf(t) >= 0 ? t : 'info';
    }

    function iconForInsight(ins) {
        if (ins && ins.icon) return ins.icon;
        var type = normalizeType(ins && ins.type);
        if (type === 'danger') return 'alert-triangle';
        if (type === 'warning') return 'alert-circle';
        if (type === 'success') return 'check-circle';
        return 'activity';
    }

    function compactText(text, maxLen) {
        var source = (text || '').trim();
        if (source.length <= maxLen) return source;
        return source.slice(0, Math.max(0, maxLen - 1)).trim() + '...';
    }

    function updateSummary(insights) {
        var total = insights.length;
        var high = insights.filter(function (i) { return (i.priority || '').toLowerCase() === 'high'; }).length;
        var opportunities = insights.filter(function (i) {
            var t = normalizeType(i.type);
            return t === 'success' || t === 'info';
        }).length;

        var totalEl = document.getElementById('insightsTotalCount');
        if (totalEl) totalEl.textContent = total;

        var highEl = document.getElementById('insightsHighCount');
        if (highEl) highEl.textContent = high;

        var oppEl = document.getElementById('insightsOpportunityCount');
        if (oppEl) oppEl.textContent = opportunities;
    }

    function init() {
        bindEvents();
        setInsightsView('suggestions');
        loadInsights();
        if (userHasPremiumAccess()) {
            loadBehavioral();
        } else {
            renderBehavioralLocked();
        }
        loadAlerts();
    }

    function renderBehavioralLocked() {
        var container = document.getElementById('behavioralList');
        if (!container) return;
        container.innerHTML = premiumLockedHtml('Upgrade to Premium to unlock behavioral pattern analysis.');
    }

    function setInsightsView(view) {
        currentView = view || 'suggestions';

        var buttons = document.querySelectorAll('[data-insights-view]');
        buttons.forEach(function (btn) {
            var isActive = btn.getAttribute('data-insights-view') === currentView;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        var panels = document.querySelectorAll('[data-insights-panel]');
        panels.forEach(function (panel) {
            var isActive = panel.getAttribute('data-insights-panel') === currentView;
            panel.classList.toggle('active', isActive);
        });
    }

    function loadInsights() {
        var container = document.getElementById('insightsList');
        if (!container) return;

        container.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';

        API.getInsights()
            .then(function (data) {
                renderInsights(data.insights || [], !!data.is_limited, data.upgrade_message || 'Upgrade to Premium for full AI insights.');
            })
            .catch(function () {
                container.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center;">Failed to load insights. Please try again.</p>';
            });
    }

    function renderInsights(insights, isLimited, upgradeMessage) {
        var container = document.getElementById('insightsList');
        if (!container) return;

        updateSummary(insights);

        if (!insights.length) {
            container.innerHTML = '<div class="empty-state" style="padding:3rem;text-align:center;">' +
                '<p>No insights available yet.</p>' +
                '<p class="text-muted">Add a little more activity to unlock personalized recommendations.</p>' +
            '</div>';
            return;
        }

        // Sort by priority (high first)
        insights.sort(function (a, b) {
            return (PRIORITY_ORDER[(a.priority || '').toLowerCase()] || 2) - (PRIORITY_ORDER[(b.priority || '').toLowerCase()] || 2);
        });

        var html = '';

        if (isLimited) {
            html += '<div class="card" style="margin-bottom:1rem;padding:1rem;display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap">' +
                '<p class="text-secondary" style="margin:0">' + Utils.escapeHtml(upgradeMessage || 'Upgrade to Premium for full AI insights.') + '</p>' +
                '<a href="index.html#pricing" class="btn btn-primary btn-sm">Unlock Premium</a>' +
            '</div>';
        }

        html += '<div class="insights-grid">' + insights.map(function (ins) {
            var typeClass = normalizeType(ins.type);
            var priority = (ins.priority || 'low').toLowerCase();
            return '<div class="insight-card compact ' + typeClass + '">' +
                '<div class="insight-icon icon-svg">' + Utils.iconSVG(iconForInsight(ins), 18) + '</div>' +
                '<div class="insight-content">' +
                    '<div class="insight-header">' +
                        '<h3>' + Utils.escapeHtml(ins.title || '') + '</h3>' +
                        '<span class="badge badge-' + typeClass + '">' + Utils.escapeHtml(priority) + '</span>' +
                    '</div>' +
                    '<p class="insight-message clamp-2">' + Utils.escapeHtml(compactText(ins.message || '', 140)) + '</p>' +
                '</div>' +
            '</div>';
        }).join('') + '</div>';

        container.innerHTML = html;
    }

    function bindEvents() {
        var refreshBtn = document.getElementById('refreshInsightsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                loadInsights();
                if (userHasPremiumAccess()) {
                    loadBehavioral();
                } else {
                    renderBehavioralLocked();
                }
                loadAlerts();
                Utils.showToast('Refreshing insights...', 'info');
            });
        }

        var viewButtons = document.querySelectorAll('[data-insights-view]');
        viewButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                setInsightsView(btn.getAttribute('data-insights-view'));
            });
        });
    }

    function loadBehavioral() {
        var container = document.getElementById('behavioralList');
        if (!container) return;

        if (!userHasPremiumAccess()) {
            renderBehavioralLocked();
            return;
        }

        API.getBehavioralInsights()
            .then(function (data) {
                var patterns = data.patterns || [];
                if (!patterns.length) {
                    container.innerHTML = '<p class="text-muted" style="padding:1.5rem;text-align:center">Not enough data for behavioral analysis yet.</p>';
                    return;
                }
                container.innerHTML = patterns.map(function (p) {
                    var typeClass = normalizeType(p.type);
                    return '<div class="insight-card ' + typeClass + '">' +
                        '<div class="insight-icon icon-svg">' + Utils.iconSVG(iconForInsight(p), 18) + '</div>' +
                        '<div class="insight-content">' +
                            '<h4>' + Utils.escapeHtml(p.title || '') + '</h4>' +
                            '<p>' + Utils.escapeHtml(compactText(p.message || '', 150)) + '</p>' +
                        '</div>' +
                    '</div>';
                }).join('');
            })
            .catch(function (err) {
                if (isPremiumRequired(err)) {
                    container.innerHTML = premiumLockedHtml(err.message || (typeof err.error === 'string' ? err.error : ''));
                    return;
                }
                container.innerHTML = '<p class="text-muted" style="padding:1rem;text-align:center">Could not load behavioral insights.</p>';
            });
    }

    function loadAlerts() {
        var container = document.getElementById('alertsList');
        if (!container) return;

        API.getBudgetAlerts()
            .then(function (data) {
                var alerts = data.alerts || [];
                if (!alerts.length) {
                    container.innerHTML = '<p class="text-muted" style="padding:1.5rem;text-align:center">No budget alerts. You are on track.</p>';
                    return;
                }
                container.innerHTML = alerts.map(function (a) {
                    var pct = a.percentage || 0;
                    var typeClass = pct >= 100 ? 'danger' : 'warning';
                    return '<div class="insight-card ' + typeClass + '">' +
                        '<div class="insight-icon icon-svg">' + Utils.iconSVG(pct >= 100 ? 'alert-triangle' : 'alert-circle', 18) + '</div>' +
                        '<div class="insight-content">' +
                            '<h4>' + Utils.escapeHtml(a.category || '') + ' Budget</h4>' +
                            '<p>Spent ' + Utils.formatCurrency(a.spent) + ' of ' + Utils.formatCurrency(a.budget) + ' (' + Math.round(pct) + '%)</p>' +
                        '</div>' +
                    '</div>';
                }).join('');
            })
            .catch(function () {
                container.innerHTML = '<p class="text-muted" style="padding:1rem;text-align:center">Could not load alerts.</p>';
            });
    }

    init();
})();
