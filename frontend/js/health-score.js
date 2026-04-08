/**
 * Financial Health Score page
 */

(function () {
    'use strict';

    function isPremiumRequired(err) {
        return !!(err && (err.error_code === 'premium_required' || err.upgrade_required));
    }

    function premiumLockedMessage(err) {
        var message = (err && (err.message || (typeof err.error === 'string' ? err.error : ''))) || 'Health Score is available on Premium plan.';
        return '<div class="card" style="text-align:center;padding:2rem">' +
            '<p style="font-weight:600;margin-bottom:0.5rem">Premium feature</p>' +
            '<p class="text-secondary" style="margin-bottom:1rem">' + Utils.escapeHtml(message) + '</p>' +
            '<a href="index.html#pricing" class="btn btn-primary btn-sm">Upgrade to Premium</a>' +
        '</div>';
    }

    function init() {
        loadScore();
        var btn = document.getElementById('refreshScoreBtn');
        if (btn) btn.addEventListener('click', loadScore);
    }

    function loadScore() {
        var hero = document.getElementById('scoreHero');
        if (hero) hero.innerHTML = '<div class="spinner" style="margin:2rem auto"></div>';

        API.getHealthScore()
            .then(function (data) {
                renderScoreHero(data);
                renderBreakdown(data.breakdown || {});
                renderSuggestions(data.suggestions || []);
            })
            .catch(function (err) {
                if (!hero) return;
                if (isPremiumRequired(err)) {
                    hero.innerHTML = premiumLockedMessage(err);
                    return;
                }
                hero.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center">Failed to calculate health score. Add more transactions to get started.</p>';
            });
    }

    function gradeColor(grade) {
        if (typeof grade === 'object' && grade.color) return grade.color;
        if (grade === 'A+' || grade === 'A') return 'var(--color-success)';
        if (grade === 'B+' || grade === 'B') return 'var(--color-primary)';
        if (grade === 'C+' || grade === 'C') return 'var(--color-warning)';
        return 'var(--color-danger)';
    }

    function gradeLetter(grade) {
        if (typeof grade === 'object') return grade.letter || 'N/A';
        return grade || 'N/A';
    }

    function gradeLabel(grade) {
        if (typeof grade === 'object') return grade.label || '';
        return '';
    }

    function renderScoreHero(data) {
        var hero = document.getElementById('scoreHero');
        if (!hero) return;

        var score = data.score || 0;
        var grade = data.grade || 'N/A';
        var color = gradeColor(grade);
        var letter = gradeLetter(grade);
        var label = gradeLabel(grade);
        var circumference = 2 * Math.PI * 70;
        var offset = circumference - (score / 100) * circumference;

        hero.innerHTML =
            '<div class="card score-hero-card" style="text-align:center;padding:2.5rem">' +
                '<div class="score-ring" style="position:relative;width:180px;height:180px;margin:0 auto 1.5rem">' +
                    '<svg width="180" height="180" style="transform:rotate(-90deg)">' +
                        '<circle cx="90" cy="90" r="70" fill="none" stroke="var(--color-border)" stroke-width="12"/>' +
                        '<circle cx="90" cy="90" r="70" fill="none" stroke="' + color + '" stroke-width="12" ' +
                            'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" stroke-linecap="round" style="transition:stroke-dashoffset 1s ease"/>' +
                    '</svg>' +
                    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">' +
                        '<span style="font-size:2.5rem;font-weight:800;color:' + color + '">' + score + '</span>' +
                        '<span style="font-size:1rem;font-weight:600;color:' + color + '">Grade: ' + Utils.escapeHtml(letter) + '</span>' +
                    '</div>' +
                '</div>' +
                '<h2 style="font-size:1.25rem;font-weight:700;margin-bottom:0.5rem">Your Financial Health Score</h2>' +
                (label ? '<p style="font-size:1rem;font-weight:600;color:' + color + ';margin-bottom:0.25rem">' + Utils.escapeHtml(label) + '</p>' : '') +
                '<p class="text-secondary" style="max-width:28rem;margin:0 auto">Based on your savings rate, budget adherence, spending consistency, and goal progress.</p>' +
            '</div>';
    }

    function renderBreakdown(breakdown) {
        var container = document.getElementById('scoreBreakdown');
        if (!container) return;

        var factors = [
            { key: 'savings_rate', label: 'Savings Rate', icon: '💰', weight: '30%' },
            { key: 'budget_adherence', label: 'Budget Adherence', icon: '📊', weight: '25%' },
            { key: 'expense_ratio', label: 'Expense Ratio', icon: '📉', weight: '20%' },
            { key: 'spending_consistency', label: 'Consistency', icon: '📈', weight: '15%' },
            { key: 'goal_progress', label: 'Goal Progress', icon: '🎯', weight: '10%' },
        ];

        var html = factors.map(function (f) {
            var val = breakdown[f.key];
            if (!val) return '';
            var score = val.score || 0;
            var barColor = score >= 70 ? 'var(--color-success)' : score >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';
            return '<div class="card" style="padding:1.25rem">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">' +
                    '<div style="display:flex;align-items:center;gap:0.75rem">' +
                        '<span style="font-size:1.5rem">' + Utils.iconEmoji(f.icon) + '</span>' +
                        '<div>' +
                            '<div style="font-weight:600;font-size:0.875rem">' + f.label + '</div>' +
                            '<div class="text-secondary" style="font-size:0.75rem">Weight: ' + f.weight + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<span style="font-weight:700;font-size:1.125rem;color:' + barColor + '">' + score + '</span>' +
                '</div>' +
                '<div class="progress-bar"><div class="progress-fill" style="width:' + score + '%;background:' + barColor + '"></div></div>' +
                (val.detail ? '<p class="text-secondary" style="font-size:0.75rem;margin-top:0.5rem">' + Utils.escapeHtml(val.detail) + '</p>' : '') +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function renderSuggestions(suggestions) {
        var card = document.getElementById('scoreSuggestions');
        var list = document.getElementById('suggestionsList');
        if (!card || !list || !suggestions.length) return;

        card.style.display = 'block';
        list.innerHTML = suggestions.map(function (s) {
            var icon = (typeof s === 'object') ? Utils.iconEmoji(s.icon) : '💡';
            var text = (typeof s === 'object') ? (s.text || s) : s;
            return '<div class="insight-card info" style="margin:0.75rem 1rem">' +
                '<div class="insight-icon">' + icon + '</div>' +
                '<div class="insight-content"><p>' + Utils.escapeHtml(text) + '</p></div>' +
            '</div>';
        }).join('');
    }

    init();
})();
