/**
 * Reports page — yearly data with Chart.js visualizations
 */

(function () {
    'use strict';

    var trendChartInst = null;
    var savingsChartInst = null;
    var expensePieInst = null;
    var incomePieInst = null;

    function init() {
        setupYearSelector();
        bindEvents();
        loadReports();
    }

    function setupYearSelector() {
        var sel = document.getElementById('reportYear');
        if (!sel) return;
        var cy = Utils.currentYear();
        for (var y = cy - 3; y <= cy; y++) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            sel.appendChild(opt);
        }
        sel.value = cy;
    }

    function bindEvents() {
        var sel = document.getElementById('reportYear');
        if (sel) sel.addEventListener('change', loadReports);
    }

    function loadReports() {
        var sel = document.getElementById('reportYear');
        var year = sel ? sel.value : Utils.currentYear();

        Promise.all([
            API.getReports({ year: year }),
            API.getTaxRegimeComparison({ year: year }).catch(function () { return null; }),
            API.getTaxEstimator({ year: year }).catch(function () { return null; }),
            API.getTaxSummary({ year: year }).catch(function () { return null; }),
        ])
            .then(function (responses) {
                var data = responses[0] || {};
                var taxComparison = responses[1];
                var taxEstimator = responses[2];
                var taxSummary = responses[3];

                renderSummary(data);
                renderTrendChart(data.monthly_data || data.monthly || []);
                renderSavingsChart(data.monthly_data || data.monthly || []);
                renderExpensePie(data.expense_by_category || []);
                renderIncomePie(data.income_by_category || []);
                renderTaxSnapshot(taxComparison, taxEstimator, taxSummary);
            })
            .catch(function () {
                Utils.showToast('Failed to load reports.', 'error');
            });
    }

    function renderSummary(data) {
        setText('reportIncome', Utils.formatCurrency(data.total_income || 0));
        setText('reportExpenses', Utils.formatCurrency(data.total_expenses || 0));
        setText('reportSavings', Utils.formatCurrency((data.total_income || 0) - (data.total_expenses || 0)));
    }

    function renderTaxSnapshot(comparison, estimator, summary) {
        var card = document.getElementById('taxReportCard');
        if (!card) return;

        if (!comparison || !estimator || !summary) {
            card.style.display = 'none';
            return;
        }

        card.style.display = '';

        var recommended = (comparison.recommended_regime || 'either').toLowerCase();
        var badge = document.getElementById('reportTaxRegime');
        if (badge) {
            badge.classList.remove('tax-badge-old', 'tax-badge-new', 'tax-badge-either');
            badge.classList.add('tax-badge-' + (recommended === 'old' || recommended === 'new' ? recommended : 'either'));
            badge.textContent = 'Recommended: ' + (recommended === 'either' ? 'Either' : recommended.toUpperCase());
        }

        setText('reportTaxAnnual', Utils.formatCurrency(estimator.estimated_annual_tax || 0));
        setText('reportTaxMonthly', Utils.formatCurrency(estimator.monthly_tax_liability || 0));
        setText('reportTaxEligible', Utils.formatCurrency(summary.total_deductions_eligible || 0));

        var diff = comparison.tax_difference || 0;
        if (recommended === 'old' && diff > 0) {
            setText('reportTaxDifference', '+' + Utils.formatCurrency(diff) + ' (Old)');
        } else if (recommended === 'new' && diff > 0) {
            setText('reportTaxDifference', '+' + Utils.formatCurrency(diff) + ' (New)');
        } else {
            setText('reportTaxDifference', Utils.formatCurrency(diff));
        }

        var hint = document.getElementById('reportTaxHint');
        if (hint) {
            if (recommended === 'old') {
                hint.textContent = 'Old regime currently looks better based on your tracked deductions.';
            } else if (recommended === 'new') {
                hint.textContent = 'New regime currently looks better given your current deduction utilization.';
            } else {
                hint.textContent = 'Both regimes are currently similar. Keep tracking deductions monthly.';
            }
        }
    }

    /* ── Charts ── */
    function getReportsChartTheme() {
        if (Utils.getChartTheme) return Utils.getChartTheme();
        return {
            text: '#a0a0b0',
            grid: 'rgba(255,255,255,0.05)',
            tooltipBg: 'rgba(17,17,17,0.92)',
            tooltipBorder: 'rgba(255,255,255,0.14)'
        };
    }

    function getReportsSemanticColors() {
        if (Utils.getChartSemanticColors) return Utils.getChartSemanticColors();
        return {
            income: '#0f8f7a',
            expense: '#cf3e48',
            savings: '#2d6fd8',
            incomeFill: 'rgba(15,143,122,0.26)',
            expenseFill: 'rgba(207,62,72,0.24)',
            savingsFill: 'rgba(45,111,216,0.26)'
        };
    }

    function buildReportsPalette(count) {
        if (Utils.buildChartPalette) return Utils.buildChartPalette(count);
        var fallback = ['#0f8f7a', '#2d6fd8', '#c98612', '#cf3e48', '#6b58d6', '#d24890', '#1283b1', '#d86b1b'];
        return fallback.slice(0, count);
    }

    function buildDefaultScales(theme) {
        return {
            x: { ticks: { color: theme.text }, grid: { color: theme.grid } },
            y: { ticks: { color: theme.text }, grid: { color: theme.grid } }
        };
    }

    function renderTrendChart(monthly) {
        var ctx = document.getElementById('monthlyTrendChart');
        if (!ctx) return;

        var chartTheme = getReportsChartTheme();
        var chartColors = getReportsSemanticColors();

        var labels = monthly.map(function (m) { return Utils.getMonthName(m.month); });
        var income = monthly.map(function (m) { return m.income || 0; });
        var expenses = monthly.map(function (m) { return m.expenses || 0; });

        if (trendChartInst) trendChartInst.destroy();
        trendChartInst = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Income', data: income, borderColor: chartColors.income, backgroundColor: chartColors.incomeFill, tension: 0.4, fill: false },
                    { label: 'Expenses', data: expenses, borderColor: chartColors.expense, backgroundColor: chartColors.expenseFill, tension: 0.4, fill: false },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
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
                scales: buildDefaultScales(chartTheme)
            }
        });
    }

    function renderSavingsChart(monthly) {
        var ctx = document.getElementById('savingsChart');
        if (!ctx) return;

        var chartTheme = getReportsChartTheme();
        var chartColors = getReportsSemanticColors();

        var labels = monthly.map(function (m) { return Utils.getMonthName(m.month); });
        var savings = monthly.map(function (m) { return (m.income || 0) - (m.expenses || 0); });

        if (savingsChartInst) savingsChartInst.destroy();
        savingsChartInst = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Savings',
                    data: savings,
                    backgroundColor: savings.map(function (v) { return v >= 0 ? chartColors.savingsFill : chartColors.expenseFill; }),
                    borderColor: savings.map(function (v) { return v >= 0 ? chartColors.savings : chartColors.expense; }),
                    borderWidth: 1,
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
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
                scales: buildDefaultScales(chartTheme)
            }
        });
    }

    function renderExpensePie(categories) {
        var ctx = document.getElementById('expenseBreakdownChart');
        if (!ctx) return;

        var chartTheme = getReportsChartTheme();

        var palette = buildReportsPalette(categories.length);

        if (expensePieInst) expensePieInst.destroy();
        expensePieInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categories.map(function (c) { return c.category__name || c.name; }),
                datasets: [{ data: categories.map(function (c) { return c.total || 0; }), backgroundColor: palette.slice(0, categories.length), borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: {
                    legend: { position: 'right', labels: { color: chartTheme.text, padding: 10, usePointStyle: true } },
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

    function renderIncomePie(categories) {
        var ctx = document.getElementById('incomeSourcesChart');
        if (!ctx) return;

        var chartTheme = getReportsChartTheme();

        var palette = buildReportsPalette(categories.length);

        if (incomePieInst) incomePieInst.destroy();
        incomePieInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categories.map(function (c) { return c.category__name || c.name; }),
                datasets: [{ data: categories.map(function (c) { return c.total || 0; }), backgroundColor: palette.slice(0, categories.length), borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: {
                    legend: { position: 'right', labels: { color: chartTheme.text, padding: 10, usePointStyle: true } },
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

    function setText(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    init();
})();

