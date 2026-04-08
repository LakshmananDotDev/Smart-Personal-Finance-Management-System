/**
 * Dashboard page — stats, charts, recent transactions, insights preview
 */

(function () {
    'use strict';

    var expenseChartInstance = null;
    var categoryChartInstance = null;
    var dashboardLocationMap = null;
    var dashboardLocationLayer = null;
    var dashboardLocationTiles = { light: null, dark: null, active: null };
    var dashboardLocationThemeObserver = null;

    function loadDashboard() {
        API.getDashboard()
            .then(function (data) {
                renderStats(data);
                renderIncomeExpenseChart(data.monthly_breakdown || []);
                renderCategoryChart(data.expense_by_category || []);
                renderRecentTransactions(data.recent_transactions || []);
                renderBudgetAlerts(data.budget_alerts || []);
                renderSavingsGoals(data.savings_goals || []);
                loadLocationInsights(data.month, data.year);
            })
            .catch(function () {
                Utils.showToast('Failed to load dashboard data.', 'error');
            });

        API.getInsights()
            .then(function (data) {
                renderInsightsPreview(data.insights || []);
            })
            .catch(function () {});
    }

    function getCurrentThemeMode() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function getDashboardChartTheme() {
        if (Utils.getChartTheme) return Utils.getChartTheme();
        return {
            text: '#a0a0b0',
            grid: 'rgba(255,255,255,0.05)',
            tooltipBg: 'rgba(17,17,17,0.92)',
            tooltipBorder: 'rgba(255,255,255,0.14)'
        };
    }

    function getDashboardChartSemantic() {
        if (Utils.getChartSemanticColors) return Utils.getChartSemanticColors();
        return {
            income: '#0f8f7a',
            expense: '#cf3e48',
            incomeFill: 'rgba(15,143,122,0.26)',
            expenseFill: 'rgba(207,62,72,0.24)'
        };
    }

    function buildDashboardPalette(count) {
        if (Utils.buildChartPalette) return Utils.buildChartPalette(count);
        return ['#0f8f7a', '#2d6fd8', '#c98612', '#cf3e48', '#6b58d6', '#d24890', '#1283b1', '#d86b1b'].slice(0, count);
    }

    function syncDashboardLocationTiles() {
        if (!dashboardLocationMap || !dashboardLocationTiles.light || !dashboardLocationTiles.dark) {
            return;
        }
        var next = getCurrentThemeMode() === 'light' ? dashboardLocationTiles.light : dashboardLocationTiles.dark;
        if (dashboardLocationTiles.active !== next) {
            if (dashboardLocationTiles.active) {
                dashboardLocationMap.removeLayer(dashboardLocationTiles.active);
            }
            next.addTo(dashboardLocationMap);
            dashboardLocationTiles.active = next;
        }
    }

    function ensureDashboardLocationMap() {
        var mapEl = document.getElementById('dashboardLocationMap');
        if (!mapEl || typeof L === 'undefined') {
            return false;
        }

        if (!dashboardLocationMap) {
            dashboardLocationMap = L.map('dashboardLocationMap', {
                zoomControl: true,
                scrollWheelZoom: false,
            }).setView([20.5937, 78.9629], 4);

            dashboardLocationTiles.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: '&copy; OpenStreetMap &copy; CARTO',
            });
            dashboardLocationTiles.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: '&copy; OpenStreetMap &copy; CARTO',
            });

            syncDashboardLocationTiles();
            dashboardLocationLayer = L.layerGroup().addTo(dashboardLocationMap);

            if (!dashboardLocationThemeObserver && typeof MutationObserver !== 'undefined') {
                dashboardLocationThemeObserver = new MutationObserver(function (mutations) {
                    for (var i = 0; i < mutations.length; i += 1) {
                        if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'data-theme') {
                            syncDashboardLocationTiles();
                            break;
                        }
                    }
                });
                dashboardLocationThemeObserver.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-theme'],
                });
            }
        }

        setTimeout(function () {
            dashboardLocationMap.invalidateSize();
        }, 80);

        return true;
    }

    function updateLocationMetrics(totalMappedExpense, hotspotCount) {
        var totalEl = document.getElementById('dashboardLocationTotal');
        if (totalEl) totalEl.textContent = Utils.formatCurrency(totalMappedExpense || 0);

        var countEl = document.getElementById('dashboardLocationCount');
        if (countEl) countEl.textContent = hotspotCount || 0;
    }

    function getLocationSpendColor(ratio) {
        var tones = Utils.getSpendIntensityColors ? Utils.getSpendIntensityColors() : {
            low: '#0f8f7a',
            medium: '#c98612',
            high: '#d86b1b',
            peak: '#cf3e48'
        };
        if (ratio >= 0.75) return tones.peak;
        if (ratio >= 0.5) return tones.high;
        if (ratio >= 0.3) return tones.medium;
        return tones.low;
    }

    function renderLocationList(hotspots) {
        var list = document.getElementById('dashboardLocationList');
        if (!list) return;

        if (!hotspots.length) {
            list.innerHTML = '<div class="text-muted" style="font-size:0.813rem;padding:0.25rem 0">No mapped expense locations for this month yet.</div>';
            return;
        }

        list.innerHTML = hotspots.slice(0, 8).map(function (spot, index) {
            return '<div class="dashboard-location-item" data-lat="' + spot.latitude + '" data-lng="' + spot.longitude + '">' +
                '<div class="dashboard-location-item-head">' +
                    '<span class="dashboard-location-item-name">#' + (index + 1) + ' ' + Utils.escapeHtml(spot.location_name || 'Unknown location') + '</span>' +
                    '<span class="dashboard-location-item-amount">' + Utils.formatCurrency(spot.total_spent || 0) + '</span>' +
                '</div>' +
                '<div class="dashboard-location-item-meta">' + (spot.transaction_count || 0) + ' transactions | Last: ' + Utils.escapeHtml(spot.last_spent || '') + '</div>' +
            '</div>';
        }).join('');
    }

    function renderLocationMap(hotspots) {
        var mapEl = document.getElementById('dashboardLocationMap');
        if (!mapEl) return;

        if (!ensureDashboardLocationMap()) {
            mapEl.innerHTML = '<div class="text-muted" style="padding:1rem;font-size:0.813rem">Map unavailable right now.</div>';
            return;
        }

        dashboardLocationLayer.clearLayers();

        if (!hotspots.length) {
            dashboardLocationMap.setView([20.5937, 78.9629], 4);
            return;
        }

        var maxSpend = hotspots[0].total_spent || 1;
        var bounds = [];

        hotspots.forEach(function (spot) {
            var lat = parseFloat(spot.latitude);
            var lng = parseFloat(spot.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            var ratio = Math.min(1, (spot.total_spent || 0) / maxSpend);
            var color = getLocationSpendColor(ratio);
            var txCount = spot.transaction_count || 0;

            L.circle([lat, lng], {
                radius: Math.round(260 + ratio * 1300 + Math.min(txCount * 25, 700)),
                color: color,
                opacity: 0.32,
                weight: 1.2,
                fillColor: color,
                fillOpacity: 0.14,
                interactive: false,
            }).addTo(dashboardLocationLayer);

            var marker = L.circleMarker([lat, lng], {
                radius: Math.round(5 + ratio * 8),
                color: '#ffffff',
                weight: 1.4,
                fillColor: color,
                fillOpacity: 0.9,
            }).addTo(dashboardLocationLayer);

            marker.bindPopup(
                '<div style="min-width:170px">' +
                    '<div style="font-weight:700;margin-bottom:0.25rem">' + Utils.escapeHtml(spot.location_name || 'Unknown location') + '</div>' +
                    '<div style="font-size:0.75rem;color:var(--color-text-secondary)">Spent: ' + Utils.escapeHtml(Utils.formatCurrency(spot.total_spent || 0)) + '</div>' +
                    '<div style="font-size:0.75rem;color:var(--color-text-secondary)">Transactions: ' + Utils.escapeHtml(String(spot.transaction_count || 0)) + '</div>' +
                '</div>'
            );

            bounds.push([lat, lng]);
        });

        if (bounds.length === 1) {
            dashboardLocationMap.setView(bounds[0], 11);
        } else if (bounds.length > 1) {
            dashboardLocationMap.fitBounds(bounds, { padding: [22, 22], maxZoom: 11 });
        }
    }

    function bindLocationListClicks() {
        var list = document.getElementById('dashboardLocationList');
        if (!list) return;

        list.addEventListener('click', function (e) {
            var item = e.target.closest('.dashboard-location-item');
            if (!item || !dashboardLocationMap) return;

            var lat = parseFloat(item.dataset.lat);
            var lng = parseFloat(item.dataset.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            dashboardLocationMap.flyTo([lat, lng], 12, { duration: 0.7 });
        });
    }

    function loadLocationInsights(month, year) {
        var list = document.getElementById('dashboardLocationList');
        if (list) {
            list.innerHTML = '<div class="text-muted" style="font-size:0.813rem;padding:0.25rem 0">Loading location insights...</div>';
        }

        var now = new Date();
        var params = {
            month: month || (now.getMonth() + 1),
            year: year || now.getFullYear(),
        };

        API.getSpendingMap(params)
            .then(function (payload) {
                var hotspots = payload.hotspots || [];
                updateLocationMetrics(payload.total_mapped_expense || 0, payload.hotspot_count || hotspots.length);
                renderLocationList(hotspots);
                renderLocationMap(hotspots);
            })
            .catch(function () {
                updateLocationMetrics(0, 0);
                if (list) {
                    list.innerHTML = '<div class="text-muted" style="font-size:0.813rem;padding:0.25rem 0">Could not load location insights.</div>';
                }
            });
    }

    function renderStats(data) {
        animateValue('totalBalance', data.balance || 0);
        animateValue('totalIncome', data.total_income || 0);
        animateValue('totalExpenses', data.total_expenses || 0);
        animateCount('alertCount', (data.budget_alerts || []).length);
    }

    /* ── Animated count-up for currency values ── */
    function animateValue(id, target) {
        var el = document.getElementById(id);
        if (!el) return;
        var start = 0;
        var duration = 1200;
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            // ease-out cubic
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = start + (target - start) * eased;
            el.textContent = Utils.formatCurrency(current);
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    function animateCount(id, target) {
        var el = document.getElementById(id);
        if (!el) return;
        var start = 0;
        var duration = 800;
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(start + (target - start) * eased);
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    /* ── Stat card click → navigate ── */
    function initStatCardClicks() {
        document.querySelectorAll('.stat-card[data-navigate]').forEach(function (card) {
            card.addEventListener('click', function () {
                var url = card.getAttribute('data-navigate');
                if (url) window.location.href = url;
            });
        });
    }

    function renderIncomeExpenseChart(breakdown) {
        var ctx = document.getElementById('incomeExpenseChart');
        if (!ctx) return;

        var chartTheme = getDashboardChartTheme();
        var semantic = getDashboardChartSemantic();

        var labels = breakdown.map(function (m) { return m.month; });
        var incomeData = breakdown.map(function (m) { return m.income || 0; });
        var expenseData = breakdown.map(function (m) { return m.expenses || 0; });

        if (expenseChartInstance) expenseChartInstance.destroy();

        expenseChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData,
                        backgroundColor: semantic.incomeFill,
                        borderColor: semantic.income,
                        borderWidth: 1,
                        borderRadius: 6,
                    },
                    {
                        label: 'Expenses',
                        data: expenseData,
                        backgroundColor: semantic.expenseFill,
                        borderColor: semantic.expense,
                        borderWidth: 1,
                        borderRadius: 6,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: chartTheme.text } },
                    tooltip: {
                        backgroundColor: chartTheme.tooltipBg,
                        borderColor: chartTheme.tooltipBorder,
                        borderWidth: 1,
                        titleColor: chartTheme.text,
                        bodyColor: chartTheme.text,
                    }
                },
                scales: {
                    x: { ticks: { color: chartTheme.text }, grid: { color: chartTheme.grid } },
                    y: { ticks: { color: chartTheme.text }, grid: { color: chartTheme.grid } }
                }
            }
        });
    }

    function renderCategoryChart(categories) {
        var ctx = document.getElementById('categoryChart');
        if (!ctx) return;

        var chartTheme = getDashboardChartTheme();

        var labels = categories.map(function (c) { return c.category__name || c.name; });
        var amounts = categories.map(function (c) { return c.total || c.amount || 0; });
        var colors = buildDashboardPalette(labels.length);

        if (categoryChartInstance) categoryChartInstance.destroy();

        categoryChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: amounts,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: chartTheme.text, padding: 12, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: chartTheme.tooltipBg,
                        borderColor: chartTheme.tooltipBorder,
                        borderWidth: 1,
                        titleColor: chartTheme.text,
                        bodyColor: chartTheme.text,
                    }
                }
            }
        });
    }

    function renderRecentTransactions(transactions) {
        var container = document.getElementById('recentTransactions');
        if (!container) return;

        if (!transactions.length) {
            container.innerHTML = '<p class="text-muted" style="padding:1rem;">No transactions yet. Start by adding one!</p>';
            return;
        }

        var html = transactions.slice(0, 5).map(function (tx) {
            var isIncome = tx.type === 'income';
            var sign = isIncome ? '+' : '-';
            var cls = isIncome ? 'income' : 'expense';
            var fallbackCategoryColor = Utils.getCssVar ? Utils.getCssVar('--chart-1', '#0f8f7a') : '#0f8f7a';
            var txColor = tx.category_color || fallbackCategoryColor;
            return '<div class="transaction-item">' +
                '<div class="transaction-icon" style="background:' + txColor + '20;color:' + txColor + '">' +
                    Utils.iconEmoji(tx.category_icon) +
                '</div>' +
                '<div class="transaction-details">' +
                    '<span class="transaction-name">' + Utils.escapeHtml(tx.category_name || 'Uncategorized') + '</span>' +
                    '<span class="transaction-date">' + Utils.formatDate(tx.date) + '</span>' +
                '</div>' +
                '<span class="transaction-amount ' + cls + '">' + sign + Utils.formatCurrency(tx.amount) + '</span>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function renderBudgetAlerts(alerts) {
        var badge = document.getElementById('alertCount');
        if (badge) badge.textContent = alerts.length;
    }

    function renderInsightsPreview(insights) {
        var container = document.getElementById('dashboardInsights');
        if (!container) return;

        if (!insights.length) {
            container.innerHTML = '<p class="text-muted" style="padding:1rem;">Add more transactions to unlock AI insights.</p>';
            return;
        }

        var html = insights.slice(0, 4).map(function (ins) {
            var iconName = ins.icon || (ins.type === 'danger' ? 'alert-triangle' : ins.type === 'warning' ? 'alert-circle' : ins.type === 'success' ? 'check-circle' : 'activity');
            return '<div class="insight-card ' + (ins.type || 'info') + '">' +
                '<div class="insight-icon icon-svg">' + Utils.iconSVG(iconName, 18) + '</div>' +
                '<div class="insight-content">' +
                    '<h4>' + Utils.escapeHtml(ins.title || '') + '</h4>' +
                    '<p>' + Utils.escapeHtml((ins.message || '').length > 120 ? (ins.message || '').slice(0, 119).trim() + '...' : (ins.message || '')) + '</p>' +
                '</div>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function renderSavingsGoals(goals) {
        var container = document.getElementById('dashboardGoals');
        if (!container) return;

        if (!goals.length) {
            container.innerHTML = '<p class="text-muted" style="padding:1rem;">No savings goals yet. <a href="goals.html" style="color:var(--color-primary)">Create one</a></p>';
            return;
        }

        var html = goals.slice(0, 4).map(function (g) {
            var pct = g.progress || 0;
            var statusColor = pct >= 100 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-primary)';
            return '<div style="padding:0.75rem 0;border-bottom:1px solid var(--color-border)">' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:0.25rem">' +
                    '<span style="font-weight:500;font-size:0.875rem">' + Utils.escapeHtml(g.name) + '</span>' +
                    '<span style="font-size:0.8rem;color:var(--color-text-muted)">' + Math.round(pct) + '%</span>' +
                '</div>' +
                '<div style="height:6px;background:var(--color-border);border-radius:3px;overflow:hidden">' +
                    '<div style="width:' + Math.min(pct, 100) + '%;height:100%;background:' + statusColor + ';border-radius:3px;transition:width 0.6s ease"></div>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;margin-top:0.25rem;font-size:0.75rem;color:var(--color-text-muted)">' +
                    '<span>' + Utils.formatCurrency(g.current_amount || 0) + '</span>' +
                    '<span>' + Utils.formatCurrency(g.target_amount) + '</span>' +
                '</div>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    initStatCardClicks();
    bindLocationListClicks();
    loadDashboard();
})();

