/**
 * Transactions page — list, filter, add, edit, delete
 */

(function () {
    'use strict';

    var allCategories = [];
    var allAccounts = [];
    var currentPage = 1;
    var currentFilters = {};
    var searchTimeout = null;
    var currentPeriod = 'monthly';
    var spendingMap = null;
    var spendingMapLayer = null;
    var spendingMapHeatLayer = null;
    var spendingMapLegend = null;
    var spendingMapThemeObserver = null;
    var spendingMapTiles = { light: null, dark: null, active: null };
    var spendingMapMode = 'hybrid';
    var latestHotspots = [];
    var latestMapPayload = null;

    function init() {
        loadCategories();
        loadAccounts();
        bindEvents();
        loadTransactions();
        loadTransactionStats();
        loadSpendingMap();
    }

    /* ── Categories ── */
    function loadCategories() {
        API.getCategories().then(function (data) {
            allCategories = data.results || data;
            populateCategorySelects();
        });
    }

    function populateCategorySelects() {
        var filterSel = document.getElementById('filterCategory');
        var formSel = document.getElementById('txCategory');

        var opts = '<option value="">All Categories</option>';

        allCategories.forEach(function (cat) {
            opts += '<option value="' + cat.id + '">' + Utils.escapeHtml(cat.name) + '</option>';
        });

        if (filterSel) filterSel.innerHTML = opts;

        // For the form, filter by selected transaction type
        updateFormCategories();
    }

    function updateFormCategories() {
        var formSel = document.getElementById('txCategory');
        if (!formSel) return;
        var typeField = document.getElementById('txType');
        var selectedType = typeField ? typeField.value : '';
        var currentVal = formSel.value;

        var formOpts = '<option value="">Select category</option>';
        allCategories.forEach(function (cat) {
            if (!selectedType || cat.type === selectedType) {
                formOpts += '<option value="' + cat.id + '">' + Utils.escapeHtml(cat.name) + '</option>';
            }
        });

        formSel.innerHTML = formOpts;
        // Restore selection if still valid
        if (currentVal) formSel.value = currentVal;
    }

    /* ── Accounts ── */
    function loadAccounts() {
        API.getAccounts().then(function (data) {
            allAccounts = data.results || data || [];
            populateAccountSelect();
        });
    }

    function populateAccountSelect() {
        var sel = document.getElementById('txAccount');
        if (!sel) return;
        var opts = '<option value="">No account</option>';
        allAccounts.forEach(function (a) {
            var labels = { bank: 'Bank', cash: 'Cash', upi: 'UPI', credit: 'Credit Card', wallet: 'Wallet' };
            var lbl = labels[a.type] ? labels[a.type] + ' — ' : '';
            opts += '<option value="' + a.id + '">' + lbl + Utils.escapeHtml(a.name) + '</option>';
        });
        sel.innerHTML = opts;
    }

    /* ── Load transactions ── */
    function loadTransactions() {
        var params = Object.assign({}, currentFilters, { page: currentPage });

        API.getTransactions(params)
            .then(function (data) {
                renderTransactions(data.results || []);
                renderPagination(data);
            })
            .catch(function () {
                Utils.showToast('Failed to load transactions.', 'error');
            });
    }

    function renderTransactions(transactions) {
        var tbody = document.getElementById('transactionsBody');
        if (!tbody) return;

        if (!transactions.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">No transactions found.</td></tr>';
            return;
        }

        var html = transactions.map(function (tx) {
            var isIncome = tx.type === 'income';
            var sign = isIncome ? '+' : '-';
            var cls = isIncome ? 'income' : 'expense';
            var catColor = tx.category_color || (isIncome ? 'var(--color-success)' : 'var(--color-danger)');
            var locationHtml = tx.location_name
                ? '<span class="tx-location-inline">📍 ' + Utils.escapeHtml(tx.location_name) + '</span>'
                : '';
            return '<tr class="row-' + cls + '">' +
                '<td>' +
                    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + catColor + ';margin-right:0.5rem;vertical-align:middle"></span>' +
                    Utils.escapeHtml(tx.category_name || '—') +
                '</td>' +
                '<td>' + Utils.escapeHtml(tx.account_name || '—') + '</td>' +
                '<td>' + Utils.escapeHtml(tx.notes || '—') + locationHtml + '</td>' +
                '<td>' + Utils.formatDate(tx.date) + '</td>' +
                '<td class="' + cls + '" style="text-align:right">' + sign + Utils.formatCurrency(tx.amount) + '</td>' +
                '<td style="text-align:right">' +
                    '<button class="btn btn-sm btn-ghost edit-tx" data-id="' + tx.id + '">Edit</button>' +
                    '<button class="btn btn-sm btn-ghost delete-tx" data-id="' + tx.id + '" style="color:var(--color-danger);">Delete</button>' +
                '</td>' +
            '</tr>';
        }).join('');

        tbody.innerHTML = html;
    }

    function renderPagination(data) {
        var container = document.getElementById('pagination');
        if (!container) return;

        var totalPages = Math.ceil((data.count || 0) / 20) || 1;
        var html = '';

        if (data.previous) {
            html += '<button class="btn btn-sm btn-ghost page-btn" data-page="' + (currentPage - 1) + '">&laquo; Prev</button>';
        }
        html += '<span class="pagination-info">Page ' + currentPage + ' of ' + totalPages + '</span>';
        if (data.next) {
            html += '<button class="btn btn-sm btn-ghost page-btn" data-page="' + (currentPage + 1) + '">Next &raquo;</button>';
        }

        container.innerHTML = html;
    }

    /* ── Transaction Stats & Category Breakdown ── */
    function loadTransactionStats() {
        var now = new Date();
        var params = {};

        if (currentPeriod === 'monthly') {
            // Use dashboard API for current month
            API.getDashboard().then(function (data) {
                data._periodLabel = 'this month';
                renderTransactionStats(data);
                renderCategoryBreakdown(data);
            }).catch(function () {});
            return;
        } else if (currentPeriod === 'yearly') {
            params = { year: now.getFullYear() };
        } else {
            params = { period: 'all' };
        }

        API.getReports(params).then(function (data) {
            data._periodLabel = currentPeriod === 'yearly' ? 'this year' : 'all time';
            renderTransactionStats(data);
            renderCategoryBreakdown(data);
        }).catch(function () {});
    }

    function renderTransactionStats(data) {
        var totalIncome = data.total_income || 0;
        var totalExpenses = data.total_expenses || 0;
        var net = totalIncome - totalExpenses;
        var label = data._periodLabel || 'this month';

        animateStatValue('txTotalIncome', totalIncome);
        animateStatValue('txTotalExpenses', totalExpenses);
        animateStatValue('txNetSavings', net);

        var incCountEl = document.getElementById('txIncomeCount');
        if (incCountEl) incCountEl.textContent = (data.income_count || 0) + ' ' + label;

        var expCountEl = document.getElementById('txExpenseCount');
        if (expCountEl) expCountEl.textContent = (data.expense_count || 0) + ' ' + label;

        var countEl = document.getElementById('txTotalCount');
        if (countEl) countEl.textContent = data.transaction_count || 0;

        var avgEl = document.getElementById('txAvgDaily');
        if (avgEl) avgEl.textContent = label;

        var netLabel = document.getElementById('txNetLabel');
        if (netLabel) {
            if (net >= 0) {
                netLabel.innerHTML = '<span style="color:var(--color-success)">&#9650;</span> positive ' + label;
            } else {
                netLabel.innerHTML = '<span style="color:var(--color-danger)">&#9660;</span> negative ' + label;
            }
        }

        var catPeriod = document.getElementById('txCatPeriod');
        if (catPeriod) catPeriod.textContent = label.charAt(0).toUpperCase() + label.slice(1);

        var mapPeriod = document.getElementById('txMapPeriod');
        if (mapPeriod) mapPeriod.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }

    function animateStatValue(id, target) {
        var el = document.getElementById(id);
        if (!el) return;
        var duration = 1000;
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = target * eased;
            el.textContent = Utils.formatCurrency(current);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function renderCategoryBreakdown(data) {
        var container = document.getElementById('txCategoryBreakdown');
        if (!container) return;

        var cats = data.expense_by_category || [];
        if (!cats.length) {
            var lbl = data._periodLabel || 'this month';
            container.innerHTML = '<div class="text-secondary" style="font-size:0.813rem;padding:0.5rem 0">No expense data ' + lbl + '</div>';
            return;
        }

        var top5 = cats.slice(0, 5);
        var maxAmount = top5[0] ? top5[0].total : 1;
        var totalExpenses = data.total_expenses || 1;

        var html = top5.map(function (cat) {
            var pct = Math.round((cat.total / totalExpenses) * 100);
            var barPct = Math.round((cat.total / maxAmount) * 100);
            var color = cat.color || 'var(--color-primary)';
            return '<div class="tx-cat-row">' +
                '<span class="tx-cat-dot" style="background:' + color + '"></span>' +
                '<span class="tx-cat-name">' + Utils.escapeHtml(cat.name) + '</span>' +
                '<div class="tx-cat-bar-wrap">' +
                    '<div class="tx-cat-bar-fill" style="width:' + barPct + '%;background:' + color + '"></div>' +
                '</div>' +
                '<span class="tx-cat-amount">' + Utils.formatCurrency(cat.total) + '</span>' +
                '<span class="tx-cat-pct">' + pct + '%</span>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    function buildSpendingMapParams() {
        var now = new Date();
        var params = {
            category: currentFilters.category || '',
            date_from: currentFilters.date_from || '',
            date_to: currentFilters.date_to || '',
            search: currentFilters.search || '',
        };

        if (!params.date_from && !params.date_to) {
            if (currentPeriod === 'monthly') {
                params.month = now.getMonth() + 1;
                params.year = now.getFullYear();
            } else if (currentPeriod === 'yearly') {
                params.year = now.getFullYear();
            }
        }

        return params;
    }

    function getCurrentThemeMode() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function syncSpendingMapBaseTiles() {
        if (!spendingMap || !spendingMapTiles.light || !spendingMapTiles.dark) {
            return;
        }

        var next = getCurrentThemeMode() === 'light' ? spendingMapTiles.light : spendingMapTiles.dark;
        if (spendingMapTiles.active !== next) {
            if (spendingMapTiles.active) {
                spendingMap.removeLayer(spendingMapTiles.active);
            }
            next.addTo(spendingMap);
            spendingMapTiles.active = next;
        }
    }

    function ensureSpendingMap() {
        var mapEl = document.getElementById('txSpendingMap');
        if (!mapEl || typeof L === 'undefined') {
            return false;
        }

        if (!spendingMap) {
            spendingMap = L.map('txSpendingMap', {
                zoomControl: true,
                scrollWheelZoom: false,
            }).setView([20.5937, 78.9629], 4);

            spendingMapTiles.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: '&copy; OpenStreetMap &copy; CARTO',
            });
            spendingMapTiles.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: '&copy; OpenStreetMap &copy; CARTO',
            });
            syncSpendingMapBaseTiles();

            spendingMapLayer = L.layerGroup().addTo(spendingMap);

            spendingMapLegend = L.control({ position: 'bottomleft' });
            spendingMapLegend.onAdd = function () {
                var div = L.DomUtil.create('div', 'tx-map-legend');
                div.innerHTML = '<div class="tx-map-legend-title">Spend Intensity</div>' +
                    '<div class="tx-map-legend-scale">' +
                        '<span>Low</span>' +
                        '<div class="tx-map-legend-gradient"></div>' +
                        '<span>High</span>' +
                    '</div>';
                return div;
            };
            spendingMapLegend.addTo(spendingMap);

            if (!spendingMapThemeObserver && typeof MutationObserver !== 'undefined') {
                spendingMapThemeObserver = new MutationObserver(function (mutations) {
                    for (var i = 0; i < mutations.length; i += 1) {
                        if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'data-theme') {
                            syncSpendingMapBaseTiles();
                            break;
                        }
                    }
                });
                spendingMapThemeObserver.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-theme'],
                });
            }
        }

        setTimeout(function () {
            spendingMap.invalidateSize();
        }, 80);

        return true;
    }

    function updateMapMetrics(totalMappedExpense, hotspotCount) {
        var totalEl = document.getElementById('txMapTotal');
        if (totalEl) totalEl.textContent = Utils.formatCurrency(totalMappedExpense || 0);

        var countEl = document.getElementById('txMapHotspotCount');
        if (countEl) countEl.textContent = hotspotCount || 0;
    }

    function getSpendColor(ratio) {
        var tones = Utils.getSpendIntensityColors ? Utils.getSpendIntensityColors() : {
            low: '#23ad8d',
            medium: '#d29a42',
            high: '#d88343',
            peak: '#d75e6b'
        };
        if (ratio >= 0.75) return tones.peak;
        if (ratio >= 0.5) return tones.high;
        if (ratio >= 0.3) return tones.medium;
        return tones.low;
    }

    function renderHotspotsList(hotspots) {
        var list = document.getElementById('txHotspotsList');
        if (!list) return;

        if (!hotspots.length) {
            list.innerHTML = '<div class="text-secondary" style="font-size:0.813rem;padding:0.25rem 0">Add expense transactions with a location to see hotspots.</div>';
            return;
        }

        list.innerHTML = hotspots.slice(0, 8).map(function (item, index) {
            return '<div class="tx-hotspot-item" data-lat="' + item.latitude + '" data-lng="' + item.longitude + '">' +
                '<div class="tx-hotspot-name">#' + (index + 1) + ' ' + Utils.escapeHtml(item.location_name || 'Unknown location') + '</div>' +
                '<div class="tx-hotspot-value">' + Utils.formatCurrency(item.total_spent || 0) + '</div>' +
                '<div class="tx-hotspot-meta">' + (item.transaction_count || 0) + ' transactions</div>' +
                '<div class="tx-hotspot-meta" style="text-align:right">' + Utils.escapeHtml(item.last_spent || '') + '</div>' +
            '</div>';
        }).join('');
    }

    function clearMapLayers() {
        if (spendingMapLayer) {
            spendingMapLayer.clearLayers();
        }
        if (spendingMap && spendingMapHeatLayer) {
            spendingMap.removeLayer(spendingMapHeatLayer);
            spendingMapHeatLayer = null;
        }
    }

    function renderSpendingMap(data) {
        var mapEl = document.getElementById('txSpendingMap');
        if (!mapEl) return;

        var payload = data || {};
        var hotspots = payload.hotspots || [];
        latestHotspots = hotspots;
        latestMapPayload = payload;

        updateMapMetrics(payload.total_mapped_expense || 0, payload.hotspot_count || hotspots.length);
        renderHotspotsList(hotspots);

        if (!ensureSpendingMap()) {
            mapEl.innerHTML = '<div class="text-secondary" style="padding:1rem;font-size:0.85rem">Map library failed to load.</div>';
            return;
        }

        clearMapLayers();

        if (!hotspots.length) {
            spendingMap.setView([20.5937, 78.9629], 4);
            return;
        }

        var maxSpend = hotspots[0].total_spent || 1;
        var bounds = [];
        var heatPoints = [];

        hotspots.forEach(function (spot) {
            var lat = parseFloat(spot.latitude);
            var lng = parseFloat(spot.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            var ratio = Math.min(1, (spot.total_spent || 0) / maxSpend);
            var pinColor = getSpendColor(ratio);
            bounds.push([lat, lng]);
            heatPoints.push([lat, lng, 0.2 + ratio * 0.8]);

            if (spendingMapMode !== 'heat') {
                var txCount = spot.transaction_count || 0;
                var circleRadius = Math.round(320 + ratio * 1750 + Math.min(txCount * 28, 820));
                L.circle([lat, lng], {
                    radius: circleRadius,
                    color: pinColor,
                    opacity: 0.35,
                    weight: 1.4,
                    fillColor: pinColor,
                    fillOpacity: 0.14,
                    interactive: false,
                }).addTo(spendingMapLayer);
            }

            if (spendingMapMode === 'heat') {
                return;
            }

            var pinSize = Math.round(18 + ratio * 20);
            var marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'tx-map-pin-wrap',
                    html: '<span class="tx-map-pin" style="width:' + pinSize + 'px;height:' + pinSize + 'px;color:' + pinColor + ';"></span>',
                    iconSize: [pinSize, pinSize],
                    iconAnchor: [pinSize / 2, pinSize / 2],
                }),
            });

            marker.bindPopup(
                '<div class="tx-map-popup">' +
                    '<div class="tx-map-popup-title">' + Utils.escapeHtml(spot.location_name || 'Unknown location') + '</div>' +
                    '<div class="tx-map-popup-meta">Spent: ' + Utils.escapeHtml(Utils.formatCurrency(spot.total_spent || 0)) + '</div>' +
                    '<div class="tx-map-popup-meta">Transactions: ' + Utils.escapeHtml(String(spot.transaction_count || 0)) + '</div>' +
                    '<div class="tx-map-popup-meta">Last: ' + Utils.escapeHtml(spot.last_spent || '') + '</div>' +
                '</div>'
            );

            marker.addTo(spendingMapLayer);
        });

        if ((spendingMapMode === 'heat' || spendingMapMode === 'hybrid') && typeof L.heatLayer === 'function') {
            var heatTones = Utils.getSpendIntensityColors ? Utils.getSpendIntensityColors() : {
                low: '#23ad8d',
                medium: '#d29a42',
                high: '#d88343',
                peak: '#d75e6b'
            };
            spendingMapHeatLayer = L.heatLayer(heatPoints, {
                radius: 34,
                blur: 26,
                maxZoom: 12,
                gradient: {
                    0.25: heatTones.low,
                    0.55: heatTones.medium,
                    0.8: heatTones.high,
                    1.0: heatTones.peak,
                },
            }).addTo(spendingMap);
        }

        if (bounds.length === 1) {
            spendingMap.setView(bounds[0], 11);
        } else if (bounds.length > 1) {
            spendingMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 });
        }
    }

    function loadSpendingMap() {
        var list = document.getElementById('txHotspotsList');
        if (list) {
            list.innerHTML = '<div class="text-secondary" style="font-size:0.813rem;padding:0.25rem 0">Loading hotspot data...</div>';
        }

        API.getSpendingMap(buildSpendingMapParams())
            .then(function (data) {
                renderSpendingMap(data || {});
            })
            .catch(function () {
                var mapEl = document.getElementById('txSpendingMap');
                if (mapEl) {
                    mapEl.innerHTML = '<div class="text-secondary" style="padding:1rem;font-size:0.85rem">Could not load location map right now.</div>';
                }
                if (list) {
                    list.innerHTML = '<div class="text-secondary" style="font-size:0.813rem;padding:0.25rem 0">Hotspot data unavailable.</div>';
                }
            });
    }

    /* ── Bind events ── */
    function bindEvents() {
        // Period tabs
        var periodTabs = document.getElementById('periodTabs');
        if (periodTabs) {
            periodTabs.addEventListener('click', function (e) {
                var tab = e.target.closest('.period-tab');
                if (!tab || tab.classList.contains('active')) return;
                periodTabs.querySelectorAll('.period-tab').forEach(function (t) {
                    t.classList.remove('active');
                });
                tab.classList.add('active');
                currentPeriod = tab.dataset.period;
                loadTransactionStats();
                loadSpendingMap();
            });
        }

        var mapModeTabs = document.getElementById('txMapModeTabs');
        if (mapModeTabs) {
            mapModeTabs.addEventListener('click', function (e) {
                var tab = e.target.closest('.tx-map-mode-tab');
                if (!tab || tab.classList.contains('active')) return;
                mapModeTabs.querySelectorAll('.tx-map-mode-tab').forEach(function (btn) {
                    btn.classList.remove('active');
                });
                tab.classList.add('active');
                spendingMapMode = tab.dataset.mode || 'hybrid';
                if (latestMapPayload) {
                    renderSpendingMap(latestMapPayload);
                }
            });
        }

        // Filters
        var applyBtn = document.getElementById('filterType');
        var filterCat = document.getElementById('filterCategory');
        var filterFrom = document.getElementById('filterDateFrom');
        var filterTo = document.getElementById('filterDateTo');
        [applyBtn, filterCat, filterFrom, filterTo].forEach(function (el) {
            if (el) el.addEventListener('change', function () {
                currentPage = 1;
                currentFilters = {};
                var type = document.getElementById('filterType');
                var cat = document.getElementById('filterCategory');
                var from = document.getElementById('filterDateFrom');
                var to = document.getElementById('filterDateTo');
                if (type && type.value) currentFilters.type = type.value;
                if (cat && cat.value) currentFilters.category = cat.value;
                if (from && from.value) currentFilters.date_from = from.value;
                if (to && to.value) currentFilters.date_to = to.value;
                loadTransactions();
                loadSpendingMap();
            });
        });

        // Search input with debounce
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(function () {
                    currentPage = 1;
                    if (searchInput.value.trim()) {
                        currentFilters.search = searchInput.value.trim();
                    } else {
                        delete currentFilters.search;
                    }
                    loadTransactions();
                    loadSpendingMap();
                }, 350);
            });
        }

        // Update form categories when transaction type changes
        var txTypeField = document.getElementById('txType');
        if (txTypeField) {
            txTypeField.addEventListener('change', function () {
                updateFormCategories();
            });
        }

        // Add transaction button
        var addBtn = document.getElementById('addTransactionBtn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                openTransactionModal();
            });
        }

        // Transaction form submit
        var txForm = document.getElementById('transactionForm');
        if (txForm) {
            txForm.addEventListener('submit', function (e) {
                e.preventDefault();
                saveTransaction();
            });
        }

        // Delegate edit / delete clicks
        var tbody = document.getElementById('transactionsBody');
        if (tbody) {
            tbody.addEventListener('click', function (e) {
                var editBtn = e.target.closest('.edit-tx');
                var deleteBtn = e.target.closest('.delete-tx');
                if (editBtn) editTransaction(editBtn.dataset.id);
                if (deleteBtn) confirmDeleteTransaction(deleteBtn.dataset.id);
            });
        }

        // Pagination
        var pagination = document.getElementById('pagination');
        if (pagination) {
            pagination.addEventListener('click', function (e) {
                var pageBtn = e.target.closest('.page-btn');
                if (pageBtn) {
                    currentPage = parseInt(pageBtn.dataset.page, 10);
                    loadTransactions();
                }
            });
        }

        var hotspotsList = document.getElementById('txHotspotsList');
        if (hotspotsList) {
            hotspotsList.addEventListener('click', function (e) {
                var row = e.target.closest('.tx-hotspot-item');
                if (!row || !spendingMap) return;
                var lat = parseFloat(row.dataset.lat);
                var lng = parseFloat(row.dataset.lng);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                spendingMap.flyTo([lat, lng], 12, { duration: 0.7 });
            });
        }

        // Delete confirm
        var confirmDelBtn = document.getElementById('confirmDeleteBtn');
        if (confirmDelBtn) {
            confirmDelBtn.addEventListener('click', function () {
                var id = confirmDelBtn.dataset.txId;
                if (id) deleteTransaction(id);
            });
        }

        // Cancel / close buttons
        var closeBtn = document.getElementById('closeTransactionModal');
        if (closeBtn) closeBtn.addEventListener('click', function () { Utils.closeModal('transactionModal'); });

        var cancelBtn = document.getElementById('cancelTransactionBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', function () { Utils.closeModal('transactionModal'); });

        var cancelDelBtn = document.getElementById('cancelDeleteBtn');
        if (cancelDelBtn) cancelDelBtn.addEventListener('click', function () { Utils.closeModal('deleteModal'); });
    }

    /* ── Modal helpers ── */
    function openTransactionModal(tx) {
        var title = document.getElementById('transactionModalTitle');
        var idField = document.getElementById('txId');
        var typeField = document.getElementById('txType');
        var amountField = document.getElementById('txAmount');
        var catField = document.getElementById('txCategory');
        var acctField = document.getElementById('txAccount');
        var dateField = document.getElementById('txDate');
        var locationField = document.getElementById('txLocation');
        var notesField = document.getElementById('txNotes');

        if (tx) {
            if (title) title.textContent = 'Edit Transaction';
            if (idField) idField.value = tx.id;
            if (typeField) typeField.value = tx.type;
            updateFormCategories();
            if (amountField) amountField.value = tx.amount;
            if (catField) catField.value = tx.category;
            if (acctField) acctField.value = tx.account || '';
            if (dateField) dateField.value = tx.date;
            if (locationField) locationField.value = tx.location_name || '';
            if (notesField) notesField.value = tx.notes || '';
        } else {
            if (title) title.textContent = 'Add Transaction';
            if (idField) idField.value = '';
            if (typeField) typeField.value = 'expense';
            updateFormCategories();
            if (amountField) amountField.value = '';
            if (catField) catField.value = '';
            if (acctField) acctField.value = '';
            if (dateField) dateField.value = Utils.todayStr();
            if (locationField) locationField.value = '';
            if (notesField) notesField.value = '';
        }
        Utils.openModal('transactionModal');
    }

    function editTransaction(id) {
        API.getTransactions({ id: id }).then(function (data) {
            var transactions = data.results || data;
            var tx = Array.isArray(transactions)
                ? transactions.find(function (t) { return t.id == id; })
                : transactions;
            if (tx) openTransactionModal(tx);
        });
    }

    function saveTransaction() {
        var idField = document.getElementById('txId');
        var id = idField ? idField.value : '';
        var payload = {
            type: document.getElementById('txType').value,
            amount: document.getElementById('txAmount').value,
            category: document.getElementById('txCategory').value,
            account: document.getElementById('txAccount').value || null,
            date: document.getElementById('txDate').value,
            location_name: document.getElementById('txLocation').value,
            notes: document.getElementById('txNotes').value,
        };

        var promise = id ? API.updateTransaction(id, payload) : API.createTransaction(payload);

        promise
            .then(function () {
                Utils.closeModal('transactionModal');
                Utils.showToast(id ? 'Transaction updated!' : 'Transaction added!', 'success');
                loadTransactions();
                loadTransactionStats();
                loadSpendingMap();
            })
            .catch(function (err) {
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function confirmDeleteTransaction(id) {
        var confirmBtn = document.getElementById('confirmDeleteBtn');
        if (confirmBtn) confirmBtn.dataset.txId = id;
        Utils.openModal('deleteModal');
    }

    function deleteTransaction(id) {
        API.deleteTransaction(id)
            .then(function () {
                Utils.closeModal('deleteModal');
                Utils.showToast('Transaction deleted.', 'success');
                loadTransactions();
                loadTransactionStats();
                loadSpendingMap();
            })
            .catch(function () {
                Utils.showToast('Failed to delete transaction.', 'error');
            });
    }

    init();
})();
