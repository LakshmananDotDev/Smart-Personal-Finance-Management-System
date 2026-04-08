/**
 * What-If Simulator page — sliders + chart
 */

(function () {
    'use strict';

    var baseline = null;
    var chartInstance = null;

    function isPremiumRequired(err) {
        return !!(err && (err.error_code === 'premium_required' || err.upgrade_required));
    }

    function renderPremiumLocked(message) {
        var el = document.getElementById('simSliders');
        if (!el) return;

        el.innerHTML = '<div class="card" style="text-align:center;padding:1.5rem">' +
            '<p style="font-weight:600;margin-bottom:0.5rem">Premium feature</p>' +
            '<p class="text-secondary" style="margin-bottom:1rem">' + Utils.escapeHtml(message || 'What-If Simulator is available on Premium plan.') + '</p>' +
            '<a href="index.html#pricing" class="btn btn-primary btn-sm">Upgrade to Premium</a>' +
        '</div>';
    }

    function init() {
        loadBaseline();
        var runBtn = document.getElementById('runSimBtn');
        if (runBtn) runBtn.addEventListener('click', runSimulation);
    }

    function loadBaseline() {
        API.getSimulatorBaseline()
            .then(function (data) {
                baseline = data;
                renderSliders(data);
            })
            .catch(function (err) {
                if (isPremiumRequired(err)) {
                    renderPremiumLocked(err.message || (typeof err.error === 'string' ? err.error : ''));
                    return;
                }
                var el = document.getElementById('simSliders');
                if (el) el.innerHTML = '<p class="text-muted" style="padding:1.5rem;text-align:center">Add some transactions first to use the simulator.</p>';
            });
    }

    function renderSliders(data) {
        var container = document.getElementById('simSliders');
        if (!container) return;

        var categories = data.categories || [];

        if (!categories.length) {
            container.innerHTML = '<p class="text-muted" style="padding:1.5rem;text-align:center">No spending data yet. Add expense transactions to start simulating.</p>';
            return;
        }

        container.innerHTML = categories.map(function (cat) {
            var avg = cat.monthly_average || 0;
            var catId = cat.category_id || '';
            var catName = cat.category_name || 'Unknown';
            var icon = Utils.iconSVG(cat.icon);
            return '<div class="sim-slider-row" data-category-id="' + catId + '" data-category="' + Utils.escapeHtml(catName) + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">' +
                    '<span style="font-weight:500;font-size:0.813rem;display:inline-flex;align-items:center;gap:0.375rem">' + icon + ' ' + Utils.escapeHtml(catName) + '</span>' +
                    '<span class="text-secondary" style="font-size:0.7rem">' + Utils.formatCurrency(avg) + '/mo</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:0.5rem">' +
                    '<span class="text-secondary" style="font-size:0.7rem;width:2rem;text-align:right">-50</span>' +
                    '<input type="range" class="sim-slider" min="-50" max="50" value="0" data-cat-id="' + catId + '">' +
                    '<span class="text-secondary" style="font-size:0.7rem;width:2rem">+50</span>' +
                    '<span class="sim-slider-val" style="font-weight:600;font-size:0.75rem;width:2.5rem;text-align:center;color:var(--color-text)">0%</span>' +
                '</div>' +
            '</div>';
        }).join('');

        // Live update label
        container.querySelectorAll('.sim-slider').forEach(function (slider) {
            slider.addEventListener('input', function () {
                var val = parseInt(this.value);
                var label = this.parentElement.querySelector('.sim-slider-val');
                if (label) {
                    label.textContent = (val >= 0 ? '+' : '') + val + '%';
                    label.style.color = val < 0 ? 'var(--color-success)' : val > 0 ? 'var(--color-danger)' : 'var(--color-text)';
                }
            });
        });
    }

    function runSimulation() {
        var sliders = document.querySelectorAll('.sim-slider');
        var adjustments = [];
        sliders.forEach(function (s) {
            var val = parseInt(s.value);
            if (val !== 0) {
                adjustments.push({
                    category_id: parseInt(s.getAttribute('data-cat-id')),
                    change_percent: val,
                });
            }
        });

        var months = parseInt(document.getElementById('simMonths').value) || 12;

        Utils.showToast('Running simulation...', 'info');

        API.runSimulation(adjustments, months)
            .then(function (data) {
                renderResults(data);
            })
            .catch(function (err) {
                if (isPremiumRequired(err)) {
                    renderPremiumLocked(err.message || (typeof err.error === 'string' ? err.error : ''));
                    Utils.showToast('Upgrade to Premium to run simulations.', 'warning');
                    return;
                }
                Utils.showToast('Simulation failed.', 'error');
            });
    }

    function renderResults(data) {
        var resultsArea = document.getElementById('simResults');
        if (!resultsArea) return;
        resultsArea.style.display = 'block';
        var placeholder = document.getElementById('simPlaceholder');
        if (placeholder) placeholder.style.display = 'none';

        // Summary cards
        var summary = document.getElementById('simSummary');
        if (summary) {
            var baselineSavings = data.original_savings || data.baseline_monthly_savings || 0;
            var projectedSavings = data.adjusted_savings || data.projected_monthly_savings || 0;
            var totalExtra = data.total_extra_savings || data.total_projected_savings || 0;
            var diff = projectedSavings - baselineSavings;

            summary.innerHTML =
                '<div class="card stat-card">' +
                    '<div class="card-header"><span class="card-title">Current Monthly Savings</span></div>' +
                    '<div class="card-value">' + Utils.formatCurrency(baselineSavings) + '</div>' +
                '</div>' +
                '<div class="card stat-card">' +
                    '<div class="card-header"><span class="card-title">Projected Monthly Savings</span></div>' +
                    '<div class="card-value" style="color:' + (diff >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + '">' + Utils.formatCurrency(projectedSavings) + '</div>' +
                '</div>' +
                '<div class="card stat-card">' +
                    '<div class="card-header"><span class="card-title">Total Extra Savings</span></div>' +
                    '<div class="card-value text-primary">' + Utils.formatCurrency(totalExtra) + '</div>' +
                '</div>';
        }

        // Chart
        renderChart(data.projections || data.monthly_projections || []);
    }

    function renderChart(projections) {
        var ctx = document.getElementById('simChart');
        if (!ctx) return;

        var chartTheme = Utils.getChartTheme ? Utils.getChartTheme() : {
            text: '#a0a0b0',
            grid: 'rgba(255,255,255,0.05)',
            tooltipBg: 'rgba(17,17,17,0.92)',
            tooltipBorder: 'rgba(255,255,255,0.14)'
        };
        var semantic = Utils.getChartSemanticColors ? Utils.getChartSemanticColors() : {
            baseline: '#1283b1',
            savings: '#2d6fd8',
            baselineFill: 'rgba(18,131,177,0.22)',
            savingsFill: 'rgba(45,111,216,0.26)'
        };

        var labels = projections.map(function (p) { return 'Month ' + p.month; });
        var baselineData = projections.map(function (p) { return p.original_cumulative || p.baseline_cumulative || p.baseline || 0; });
        var projectedData = projections.map(function (p) { return p.adjusted_cumulative || p.projected_cumulative || p.projected || 0; });

        if (chartInstance) chartInstance.destroy();

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Baseline',
                        data: baselineData,
                        borderColor: semantic.baseline,
                        backgroundColor: semantic.baselineFill,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: 'Projected',
                        data: projectedData,
                        borderColor: semantic.savings,
                        backgroundColor: semantic.savingsFill,
                        fill: true,
                        tension: 0.3,
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

    init();
})();

