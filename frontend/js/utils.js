/**
 * Shared utility functions
 */

(function () {
    'use strict';

    var FONT_SIZE_KEY = 'sf_font_size';
    var FONT_SIZE_DEFAULT = 16;
    var FONT_SIZE_MIN = 14;
    var FONT_SIZE_MAX = 20;

    try {
        localStorage.removeItem('sf_lang');
        var stored = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10);
        var fontSize = Number.isNaN(stored) ? FONT_SIZE_DEFAULT : Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, stored));
        document.documentElement.style.fontSize = fontSize + 'px';
    } catch (err) {
        document.documentElement.style.fontSize = FONT_SIZE_DEFAULT + 'px';
    }
})();

(function () {
    'use strict';

    var PAGE_EXIT_DURATION_MS = 170;
    var isNavigating = false;

    function lockRootBackgroundForExit() {
        var root = document.documentElement;
        if (!root || !window.getComputedStyle) return;

        var styles = window.getComputedStyle(root);
        var bg = (styles.getPropertyValue('--color-bg') || '').trim();
        if (!bg) {
            bg = '#050505';
        }

        root.style.backgroundColor = bg;
    }

    function clearRootBackgroundLock() {
        var root = document.documentElement;
        if (!root) return;
        root.style.backgroundColor = '';
    }

    function supportsNativePageTransition() {
        var hasApi = !!(document && typeof document.startViewTransition === 'function');
        var hasCssSupport = !!(window.CSS && typeof window.CSS.supports === 'function' && window.CSS.supports('view-transition-name: root'));
        return hasApi && hasCssSupport;
    }

    function shouldHandleNavigation(event, anchor) {
        if (!anchor) return false;
        if (event.defaultPrevented) return false;
        if (event.button !== 0) return false;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        if (anchor.hasAttribute('download')) return false;

        var href = anchor.getAttribute('href') || '';
        if (!href) return false;

        var lowerHref = href.toLowerCase();
        if (href.charAt(0) === '#') return false;
        if (lowerHref.indexOf('javascript:') === 0) return false;
        if (lowerHref.indexOf('mailto:') === 0) return false;
        if (lowerHref.indexOf('tel:') === 0) return false;

        var target = (anchor.getAttribute('target') || '').toLowerCase();
        if (target && target !== '_self') return false;

        var targetUrl;
        try {
            targetUrl = new URL(anchor.href, window.location.href);
        } catch (_) {
            return false;
        }

        if (targetUrl.origin !== window.location.origin) return false;

        var samePathAndQuery = targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search;
        if (samePathAndQuery) return false;

        return true;
    }

    function initPageTransitions() {
        if (!document.body) return;

        var prefersReducedMotion = false;
        try {
            prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (_) {
            prefersReducedMotion = false;
        }

        if (prefersReducedMotion) return;

        if (supportsNativePageTransition()) {
            document.documentElement.classList.remove('has-native-transition');
        }

        document.addEventListener('click', function (event) {
            var anchor = event.target.closest ? event.target.closest('a[href]') : null;
            if (!shouldHandleNavigation(event, anchor)) return;
            if (isNavigating) {
                event.preventDefault();
                return;
            }

            var targetUrl = new URL(anchor.href, window.location.href);
            isNavigating = true;

            event.preventDefault();
            lockRootBackgroundForExit();
            document.body.classList.add('page-leaving');

            window.setTimeout(function () {
                window.location.href = targetUrl.href;
            }, PAGE_EXIT_DURATION_MS);
        });

        // Cover navigations initiated via JS (location.href/assign/replace) and browser actions.
        window.addEventListener('beforeunload', function () {
            lockRootBackgroundForExit();
            if (document.body) {
                document.body.classList.add('page-leaving');
            }
        });

        window.addEventListener('pageshow', function (event) {
            if (!event.persisted) return;
            isNavigating = false;
            if (document.body) {
                document.body.classList.remove('page-leaving');
            }
            clearRootBackgroundLock();
        });
    }

    initPageTransitions();
})();

var Utils = (function () {
    'use strict';

    var MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    var MONTHS_SHORT = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    var CURRENCY_MAP = {
        INR: { symbol: '₹', locale: 'en-IN' },
        USD: { symbol: '$', locale: 'en-US' },
        EUR: { symbol: '€', locale: 'de-DE' },
        GBP: { symbol: '£', locale: 'en-GB' }
    };

    function getUserCurrency() {
        var user = typeof API !== 'undefined' ? API.getUser() : null;
        var code = (user && user.currency) || 'INR';
        return CURRENCY_MAP[code] || CURRENCY_MAP.INR;
    }

    function formatCurrency(amount) {
        var num = parseFloat(amount) || 0;
        var cur = getUserCurrency();
        return cur.symbol + num.toLocaleString(cur.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatDate(dateStr) {
        var d = new Date(dateStr + 'T00:00:00');
        return MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    function formatDateInput(dateStr) {
        if (!dateStr) return '';
        return dateStr.substring(0, 10);
    }

    function todayStr() {
        return new Date().toISOString().substring(0, 10);
    }

    function currentMonth() {
        return new Date().getMonth() + 1;
    }

    function currentYear() {
        return new Date().getFullYear();
    }

    function getMonthName(m) {
        return MONTHS[m - 1] || '';
    }

    function getMonthNameShort(m) {
        return MONTHS_SHORT[m - 1] || '';
    }

    // Toast notifications
    function showToast(message, type) {
        type = type || 'info';
        var container = document.getElementById('toastContainer');
        if (!container) return;

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.innerHTML =
            '<div style="flex:1"><div style="font-weight:600;font-size:0.875rem;margin-bottom:0.125rem">' +
            escapeHtml(type.charAt(0).toUpperCase() + type.slice(1)) +
            '</div><div style="font-size:0.813rem;color:var(--color-text-secondary)">' +
            escapeHtml(message) +
            '</div></div><button class="btn btn-ghost btn-icon" style="width:28px;height:28px;flex-shrink:0" onclick="this.parentElement.remove()">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>';

        container.appendChild(toast);

        setTimeout(function () {
            toast.classList.add('toast-exit');
            setTimeout(function () { toast.remove(); }, 300);
        }, 4000);
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function parseApiErrors(err) {
        if (typeof err === 'string') return err;
        if (err && typeof err.message === 'string' && err.message) return err.message;
        if (err && typeof err.error === 'string' && err.error) return err.error;
        if (err.detail) return err.detail;
        var messages = [];
        Object.keys(err).forEach(function (key) {
            var val = err[key];
            if (Array.isArray(val)) {
                messages.push(key + ': ' + val.join(', '));
            } else if (typeof val === 'string') {
                messages.push(key + ': ' + val);
            }
        });
        return messages.join(' | ') || 'An error occurred.';
    }

    // Modal helpers
    function openModal(id) {
        var modal = document.getElementById(id);
        if (modal) modal.classList.add('active');
    }

    function closeModal(id) {
        var modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
    }

    function getThemeMode() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function getCssVar(name, fallback) {
        var value = '';
        try {
            value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        } catch (_) {
            value = '';
        }
        return value || fallback || '';
    }

    function normalizeHex(hex) {
        if (!hex || typeof hex !== 'string') return null;
        var cleaned = hex.trim().replace('#', '');
        if (cleaned.length === 3) {
            return cleaned.split('').map(function (c) { return c + c; }).join('');
        }
        if (cleaned.length === 6) return cleaned;
        return null;
    }

    function withAlpha(color, alpha) {
        if (typeof color !== 'string') return color;

        var safeAlpha = Math.max(0, Math.min(1, Number(alpha)));
        var c = color.trim();

        if (c.indexOf('rgba(') === 0 || c.indexOf('rgb(') === 0) {
            var parts = c.substring(c.indexOf('(') + 1, c.lastIndexOf(')')).split(',').map(function (p) { return p.trim(); });
            if (parts.length >= 3) {
                var r = parseFloat(parts[0]);
                var g = parseFloat(parts[1]);
                var b = parseFloat(parts[2]);
                if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
                    return 'rgba(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ', ' + safeAlpha + ')';
                }
            }
            return c;
        }

        if (c.charAt(0) === '#') {
            var normalized = normalizeHex(c);
            if (!normalized) return c;
            var rHex = parseInt(normalized.slice(0, 2), 16);
            var gHex = parseInt(normalized.slice(2, 4), 16);
            var bHex = parseInt(normalized.slice(4, 6), 16);
            return 'rgba(' + rHex + ', ' + gHex + ', ' + bHex + ', ' + safeAlpha + ')';
        }

        return c;
    }

    function getChartPalette() {
        return [
            getCssVar('--chart-1', '#0f8f7a'),
            getCssVar('--chart-2', '#2d6fd8'),
            getCssVar('--chart-3', '#c98612'),
            getCssVar('--chart-4', '#cf3e48'),
            getCssVar('--chart-5', '#6b58d6'),
            getCssVar('--chart-6', '#d24890'),
            getCssVar('--chart-7', '#1283b1'),
            getCssVar('--chart-8', '#d86b1b')
        ];
    }

    function buildChartPalette(count) {
        var palette = getChartPalette();
        var out = [];
        var len = Math.max(0, count || 0);
        for (var i = 0; i < len; i += 1) {
            out.push(palette[i % palette.length]);
        }
        return out;
    }

    function getChartTheme() {
        var mode = getThemeMode();
        return {
            mode: mode,
            text: getCssVar('--color-text-secondary', mode === 'light' ? '#3f5a6d' : '#a0a0b0'),
            grid: mode === 'light' ? 'rgba(63, 90, 109, 0.16)' : 'rgba(255, 255, 255, 0.08)',
            tooltipBg: mode === 'light' ? 'rgba(255, 255, 255, 0.96)' : 'rgba(17, 17, 17, 0.92)',
            tooltipBorder: mode === 'light' ? 'rgba(63, 90, 109, 0.2)' : 'rgba(255, 255, 255, 0.14)'
        };
    }

    function getChartSemanticColors() {
        var income = getCssVar('--chart-1', '#0f8f7a');
        var expense = getCssVar('--chart-4', '#cf3e48');
        var savings = getCssVar('--chart-2', '#2d6fd8');
        var baseline = getCssVar('--chart-7', '#1283b1');

        return {
            income: income,
            expense: expense,
            savings: savings,
            baseline: baseline,
            incomeFill: withAlpha(income, 0.26),
            expenseFill: withAlpha(expense, 0.24),
            savingsFill: withAlpha(savings, 0.26),
            baselineFill: withAlpha(baseline, 0.22)
        };
    }

    function getSpendIntensityColors() {
        var palette = getChartPalette();
        return {
            low: palette[0],
            medium: palette[2],
            high: palette[7],
            peak: palette[3]
        };
    }

    var ICON_MAP = {
        'book': '📚', 'film': '🎬', 'coffee': '☕', 'code': '💻',
        'heart': '❤️', 'home': '🏠', 'shield': '🛡️', 'trending-up': '📈',
        'more-horizontal': '💸', 'plus-circle': '💰', 'smile': '😊',
        'briefcase': '💼', 'shopping-bag': '🛍️', 'repeat': '🔄',
        'truck': '🚗', 'zap': '⚡', 'alert-circle': '⚠️', 'list': '📋',
        'target': '🎯', 'bar-chart': '📊', 'pie-chart': '📊',
        'dollar-sign': '💲', 'credit-card': '💳', 'activity': '📈',
        'check-circle': '✅', 'info': 'ℹ️', 'star': '⭐',
        'alert-triangle': '⚠️', 'tag': '🏷️', 'wallet': '👛',
        'smartphone': '📱', 'map-pin': '📍', 'monitor': '🖥️',
        'piggy-bank': '🐷', 'calendar': '📅', 'clock': '🕐',
        'user': '👤', 'settings': '⚙️', 'trash': '🗑️',
        'edit': '✏️', 'search': '🔍', 'bell': '🔔',
        'arrow-up': '⬆️', 'arrow-down': '⬇️', 'trending-down': '📉',
    };

    function iconEmoji(name) {
        if (!name) return '💰';
        return ICON_MAP[name] || name;
    }

    function _svg(d, w) {
        w = w || 16;
        return '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    }

    // Store svg inner paths separately for size flexibility
    var _svgPaths = {
        'briefcase':      '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>',
        'code':           '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>',
        'trending-up':    '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',
        'plus-circle':    '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>',
        'coffee':         '<path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line>',
        'truck':          '<path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"></path><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"></path><circle cx="7" cy="18" r="2"></circle><circle cx="17" cy="18" r="2"></circle>',
        'home':           '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
        'zap':            '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
        'film':           '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line><line x1="17" y1="17" x2="22" y2="17"></line>',
        'shopping-bag':   '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>',
        'heart':          '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>',
        'book':           '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
        'repeat':         '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
        'shield':         '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
        'smile':          '<circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>',
        'piggy-bank':     '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2"></path><path d="M2 9.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0"></path>',
        'more-horizontal':'<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
        'dollar-sign':    '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
        'credit-card':    '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
        'activity':       '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
        'target':         '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
        'tag':            '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>',
        'wallet':         '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>',
        'calendar':       '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
        'clock':          '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
        'bar-chart':      '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
        'trending-down':  '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline>',
    };

    var _defaultPath = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';

    function iconSVG(name, size) {
        var paths = _svgPaths[name] || _defaultPath;
        return _svg(paths, size || 16);
    }

    return {
        MONTHS: MONTHS,
        MONTHS_SHORT: MONTHS_SHORT,
        formatCurrency: formatCurrency,
        formatDate: formatDate,
        formatDateInput: formatDateInput,
        todayStr: todayStr,
        currentMonth: currentMonth,
        currentYear: currentYear,
        getMonthName: getMonthName,
        getMonthNameShort: getMonthNameShort,
        showToast: showToast,
        escapeHtml: escapeHtml,
        parseApiErrors: parseApiErrors,
        openModal: openModal,
        closeModal: closeModal,
        getThemeMode: getThemeMode,
        getCssVar: getCssVar,
        withAlpha: withAlpha,
        getChartPalette: getChartPalette,
        buildChartPalette: buildChartPalette,
        getChartTheme: getChartTheme,
        getChartSemanticColors: getChartSemanticColors,
        getSpendIntensityColors: getSpendIntensityColors,
        iconEmoji: iconEmoji,
        iconSVG: iconSVG,
    };
})();

