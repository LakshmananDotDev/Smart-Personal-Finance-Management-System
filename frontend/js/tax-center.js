/**
 * Tax Center page - India-focused deduction tracking and regime comparison
 */

(function () {
    'use strict';

    var regimeChartInst = null;

    function userHasPremiumAccess() {
        var user = API.getUser() || {};
        if (user.is_premium === true || user.premium_active === true) {
            return true;
        }

        var plan = String(user.plan || '').toLowerCase();
        return plan === 'premium';
    }

    function isPremiumRequired(reason) {
        return !!(reason && (reason.error_code === 'premium_required' || reason.upgrade_required));
    }

    function premiumLockedHtml(message) {
        return '<div class="card" style="text-align:center;padding:1rem">' +
            '<p style="font-weight:600;margin-bottom:0.4rem">Premium feature</p>' +
            '<p class="text-secondary" style="margin-bottom:0.75rem">' + Utils.escapeHtml(message || 'Upgrade to Premium to unlock this feature.') + '</p>' +
            '<a href="index.html#pricing" class="btn btn-primary btn-sm">Upgrade to Premium</a>' +
        '</div>';
    }

    function init() {
        setupYearSelector();
        bindEvents();
        loadTaxData();
    }

    function setupYearSelector() {
        var sel = document.getElementById('taxYearSelect');
        if (!sel) return;

        var currentYear = Utils.currentYear();
        for (var y = currentYear - 3; y <= currentYear + 1; y++) {
            var option = document.createElement('option');
            option.value = y;
            option.textContent = y;
            sel.appendChild(option);
        }
        sel.value = currentYear;
    }

    function bindEvents() {
        var yearSel = document.getElementById('taxYearSelect');
        if (yearSel) {
            yearSel.addEventListener('change', loadTaxData);
        }
    }

    function loadTaxData() {
        var yearSel = document.getElementById('taxYearSelect');
        var year = yearSel ? yearSel.value : Utils.currentYear();
        var hasPremium = userHasPremiumAccess();
        var lockReason = {
            error_code: 'premium_required',
            upgrade_required: true,
            message: 'Upgrade to Premium to unlock this feature.',
        };

        var comparisonPromise = hasPremium
            ? API.getTaxRegimeComparison({ year: year })
            : Promise.reject(lockReason);
        var estimatorPromise = hasPremium
            ? API.getTaxEstimator({ year: year })
            : Promise.reject(lockReason);
        var suggestionsPromise = hasPremium
            ? API.getTaxSuggestions({ year: year })
            : Promise.reject(lockReason);

        Promise.allSettled([
            API.getTaxSummary({ year: year }),
            comparisonPromise,
            estimatorPromise,
            suggestionsPromise,
        ]).then(function (results) {
            var summary = pickSettledValue(results, 0, {});
            var comparison = pickSettledValue(results, 1, {});
            var estimator = pickSettledValue(results, 2, {});
            var suggestionsPayload = pickSettledValue(results, 3, { suggestions: [] });

            var comparisonLocked = results[1] && results[1].status === 'rejected' && isPremiumRequired(results[1].reason);
            var estimatorLocked = results[2] && results[2].status === 'rejected' && isPremiumRequired(results[2].reason);
            var suggestionsLocked = results[3] && results[3].status === 'rejected' && isPremiumRequired(results[3].reason);

            var successfulCount = results.filter(function (r) { return r.status === 'fulfilled'; }).length;
            var unexpectedFailures = results.filter(function (r) {
                return r.status === 'rejected' && !isPremiumRequired(r.reason);
            }).length;

            if (successfulCount === 0) {
                Utils.showToast('Failed to load tax insights.', 'error');
                return;
            }

            if (estimatorLocked) {
                renderSummaryLocked(summary, results[2] && results[2].reason);
            } else {
                renderSummary(summary, estimator);
            }
            renderDeductionTracker(summary.sections || []);

            if (comparisonLocked) {
                renderRegimeLocked(results[1] && results[1].reason);
            } else {
                renderRegimeComparison(comparison);
            }

            if (suggestionsLocked) {
                renderSuggestionsLocked(results[3] && results[3].reason);
            } else {
                renderSuggestions(suggestionsPayload.suggestions || []);
            }

            if (unexpectedFailures > 0) {
                Utils.showToast('Some tax widgets could not be refreshed. Showing available data.', 'warning');
            }
        }).catch(function (err) {
            console.error('Tax center load error:', err);
            Utils.showToast('Failed to load tax insights.', 'error');
        });
    }

    function pickSettledValue(results, index, fallback) {
        var item = results[index];
        if (!item || item.status !== 'fulfilled') return fallback;
        return item.value || fallback;
    }

    function renderSummary(summary, estimator) {
        var annualIncomeDisplay = estimator.projected_annual_income || summary.annual_income || 0;
        setText('taxAnnualIncome', Utils.formatCurrency(annualIncomeDisplay));
        setText('taxEligibleDeductions', Utils.formatCurrency(summary.total_deductions_eligible || 0));
        setText('taxEstimatedAnnual', Utils.formatCurrency(estimator.estimated_annual_tax || 0));
        setText('taxEstimatedMonthly', Utils.formatCurrency(estimator.monthly_tax_liability || 0));
    }

    function renderSummaryLocked(summary, reason) {
        var annualIncomeDisplay = summary.annual_income || 0;
        setText('taxAnnualIncome', Utils.formatCurrency(annualIncomeDisplay));
        setText('taxEligibleDeductions', Utils.formatCurrency(summary.total_deductions_eligible || 0));
        setText('taxEstimatedAnnual', 'Premium');
        setText('taxEstimatedMonthly', 'Premium');
    }

    function renderDeductionTracker(sections) {
        var container = document.getElementById('taxDeductionTracker');
        if (!container) return;

        if (!sections.length) {
            container.innerHTML = '<p class="text-muted" style="padding:1rem;text-align:center">No deduction data available for this year yet.</p>';
            return;
        }

        var html = sections.map(function (sec) {
            var pct = Math.max(0, Math.min(100, sec.utilization_percent || 0));
            var fillClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';

            return '<div class="tax-deduction-item">' +
                '<div class="tax-deduction-top">' +
                    '<h4>' + Utils.escapeHtml(sec.section + ' - ' + sec.label) + '</h4>' +
                    '<span class="tax-deduction-chip">Remaining ' + Utils.formatCurrency(sec.remaining_limit || 0) + '</span>' +
                '</div>' +
                '<div class="progress-bar"><div class="progress-fill ' + fillClass + '" style="width:' + pct + '%"></div></div>' +
                '<div class="tax-deduction-meta">' +
                    '<span>Used: ' + Utils.formatCurrency(sec.eligible_deduction || 0) + ' / ' + Utils.formatCurrency(sec.limit || 0) + '</span>' +
                    '<span>' + pct.toFixed(1) + '% utilized</span>' +
                '</div>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function renderRegimeComparison(comparison) {
        var oldRegime = comparison.old_regime || {};
        var newRegime = comparison.new_regime || {};
        var difference = comparison.tax_difference || 0;
        var recommended = (comparison.recommended_regime || 'either').toLowerCase();

        setText('taxOldTaxable', Utils.formatCurrency(oldRegime.taxable_income || 0));
        setText('taxOldTotal', Utils.formatCurrency(oldRegime.total_tax || 0));
        setText('taxNewTaxable', Utils.formatCurrency(newRegime.taxable_income || 0));
        setText('taxNewTotal', Utils.formatCurrency(newRegime.total_tax || 0));

        if (recommended === 'old' && difference > 0) {
            setText('taxDifferenceText', 'Difference: Old regime saves ' + Utils.formatCurrency(difference) + ' vs New.');
        } else if (recommended === 'new' && difference > 0) {
            setText('taxDifferenceText', 'Difference: New regime saves ' + Utils.formatCurrency(difference) + ' vs Old.');
        } else {
            setText('taxDifferenceText', 'Difference: Both regimes are currently similar.');
        }

        var badge = document.getElementById('taxRegimeBadge');
        if (badge) {
            badge.classList.remove('tax-badge-old', 'tax-badge-new', 'tax-badge-either');
            badge.classList.add('tax-badge-' + (recommended === 'old' || recommended === 'new' ? recommended : 'either'));
            badge.textContent = 'Recommended: ' + (recommended === 'either' ? 'Either' : recommended.toUpperCase());
        }

        renderRegimeChart(oldRegime.total_tax || 0, newRegime.total_tax || 0);
    }

    function renderRegimeLocked(reason) {
        setText('taxOldTaxable', 'Premium');
        setText('taxOldTotal', 'Premium');
        setText('taxNewTaxable', 'Premium');
        setText('taxNewTotal', 'Premium');
        setText('taxDifferenceText', (reason && (reason.message || (typeof reason.error === 'string' ? reason.error : ''))) || 'Upgrade to Premium to compare old vs new regimes.');

        var badge = document.getElementById('taxRegimeBadge');
        if (badge) {
            badge.classList.remove('tax-badge-old', 'tax-badge-new', 'tax-badge-either');
            badge.classList.add('tax-badge-either');
            badge.textContent = 'Premium required';
        }

        renderRegimeChart(0, 0);
    }

    function renderRegimeChart(oldTax, newTax) {
        var canvas = document.getElementById('taxRegimeChart');
        if (!canvas || typeof Chart === 'undefined') return;

        var chartTheme = Utils.getChartTheme ? Utils.getChartTheme() : {
            text: '#a0a0b0',
            grid: 'rgba(255,255,255,0.05)',
            tooltipBg: 'rgba(17,17,17,0.92)',
            tooltipBorder: 'rgba(255,255,255,0.14)'
        };
        var palette = Utils.getChartPalette ? Utils.getChartPalette() : ['#0f8f7a', '#2d6fd8', '#c98612', '#cf3e48'];
        var oldColor = palette[2] || '#c98612';
        var newColor = palette[1] || '#2d6fd8';

        if (regimeChartInst) {
            regimeChartInst.destroy();
            regimeChartInst = null;
        }

        regimeChartInst = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['Old Regime', 'New Regime'],
                datasets: [{
                    label: 'Tax Payable',
                    data: [oldTax, newTax],
                    backgroundColor: [Utils.withAlpha ? Utils.withAlpha(oldColor, 0.72) : oldColor, Utils.withAlpha ? Utils.withAlpha(newColor, 0.72) : newColor],
                    borderColor: [oldColor, newColor],
                    borderWidth: 1,
                    borderRadius: 8,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
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
                    y: { ticks: { color: chartTheme.text }, grid: { color: chartTheme.grid } },
                },
            },
        });
    }

    function renderSuggestions(suggestions) {
        var container = document.getElementById('taxSuggestionsList');
        if (!container) return;

        if (!suggestions.length) {
            container.innerHTML = '<p class="text-muted" style="padding:1rem;text-align:center">No suggestions yet. Keep tracking deductions and income.</p>';
            return;
        }

        container.innerHTML = suggestions.map(function (item) {
            var type = normalizeType(item.type);
            return '<div class="insight-card ' + type + '">' +
                '<div class="insight-icon icon-svg">' + Utils.iconSVG(type === 'success' ? 'check-circle' : (type === 'warning' ? 'alert-triangle' : 'shield'), 18) + '</div>' +
                '<div class="insight-content">' +
                    '<h4>' + Utils.escapeHtml(item.title || 'Tax suggestion') + '</h4>' +
                    '<p>' + Utils.escapeHtml(item.message || '') + '</p>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderSuggestionsLocked(reason) {
        var container = document.getElementById('taxSuggestionsList');
        if (!container) return;
        container.innerHTML = premiumLockedHtml(reason && (reason.message || (typeof reason.error === 'string' ? reason.error : '')));
    }

    function normalizeType(type) {
        var t = (type || '').toLowerCase();
        if (t === 'success' || t === 'warning' || t === 'danger') return t;
        return 'info';
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    init();
})();

