/**
 * Import Data page — CSV upload/preview/import + Receipt scanner
 */

(function () {
    'use strict';

    var currentFile = null;
    var previewData = null;
    var currentReceiptImage = null;

    function isPremiumRequired(err) {
        return !!(err && (err.error_code === 'premium_required' || err.upgrade_required));
    }

    function init() {
        bindEvents();
    }

    function bindEvents() {
        var dropzone = document.getElementById('dropzone');
        var fileInput = document.getElementById('csvFileInput');
        var importBtn = document.getElementById('importBtn');
        var scanBtn = document.getElementById('scanReceiptBtn');
        var receiptImageInput = document.getElementById('receiptImageInput');
        var clearReceiptImageBtn = document.getElementById('clearReceiptImageBtn');

        if (dropzone && fileInput) {
            dropzone.addEventListener('click', function () { fileInput.click(); });
            dropzone.addEventListener('dragover', function (e) {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--color-primary)';
            });
            dropzone.addEventListener('dragleave', function () {
                dropzone.style.borderColor = '';
            });
            dropzone.addEventListener('drop', function (e) {
                e.preventDefault();
                dropzone.style.borderColor = '';
                if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
            });
            fileInput.addEventListener('change', function () {
                if (this.files.length) handleFile(this.files[0]);
            });
        }

        if (importBtn) importBtn.addEventListener('click', doImport);
        if (scanBtn) scanBtn.addEventListener('click', scanReceipt);
        if (receiptImageInput) {
            receiptImageInput.addEventListener('change', function () {
                if (this.files && this.files.length) {
                    setReceiptImage(this.files[0]);
                    return;
                }
                clearReceiptImage();
            });
        }
        if (clearReceiptImageBtn) {
            clearReceiptImageBtn.addEventListener('click', clearReceiptImage);
        }
    }

    function isImageFile(file) {
        if (!file) return false;
        var type = (file.type || '').toLowerCase();
        if (type.indexOf('image/') === 0) return true;
        return /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name || '');
    }

    function setReceiptImage(file) {
        if (!isImageFile(file)) {
            Utils.showToast('Please select an image file (PNG, JPG, WEBP, etc).', 'error');
            clearReceiptImage();
            return;
        }
        currentReceiptImage = file;
        renderReceiptImageState(file);
    }

    function clearReceiptImage() {
        currentReceiptImage = null;

        var receiptImageInput = document.getElementById('receiptImageInput');
        if (receiptImageInput) receiptImageInput.value = '';

        renderReceiptImageState(null);
    }

    function renderReceiptImageState(file) {
        var metaEl = document.getElementById('receiptImageMeta');
        var previewEl = document.getElementById('receiptImagePreview');
        var clearBtn = document.getElementById('clearReceiptImageBtn');

        if (previewEl && previewEl.dataset.blobUrl) {
            try { URL.revokeObjectURL(previewEl.dataset.blobUrl); } catch (e) { }
            previewEl.dataset.blobUrl = '';
        }

        if (file) {
            var sizeKb = Math.max(1, Math.round((file.size || 0) / 1024));
            if (metaEl) metaEl.textContent = file.name + ' (' + sizeKb + ' KB)';
            if (previewEl) {
                var blobUrl = URL.createObjectURL(file);
                previewEl.src = blobUrl;
                previewEl.dataset.blobUrl = blobUrl;
                previewEl.style.display = 'block';
            }
            if (clearBtn) clearBtn.style.display = 'inline-flex';
            return;
        }

        if (metaEl) metaEl.textContent = 'No photo selected';
        if (previewEl) {
            previewEl.style.display = 'none';
            previewEl.removeAttribute('src');
        }
        if (clearBtn) clearBtn.style.display = 'none';
    }

    function handleFile(file) {
        if (!file.name.endsWith('.csv')) {
            Utils.showToast('Please upload a .csv file.', 'error');
            return;
        }
        currentFile = file;
        var formData = new FormData();
        formData.append('file', file);

        Utils.showToast('Previewing CSV...', 'info');

        API.previewCSV(formData)
            .then(function (data) {
                if (data.error) {
                    Utils.showToast(data.message || (typeof data.error === 'string' ? data.error : 'Preview failed.'), 'error');
                    return;
                }
                previewData = data;
                renderPreview(data);
            })
            .catch(function (err) {
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function renderPreview(data) {
        var card = document.getElementById('previewCard');
        var head = document.getElementById('previewHead');
        var body = document.getElementById('previewBody');
        var countEl = document.getElementById('previewCount');
        if (!card || !head || !body) return;

        card.style.display = 'block';
        if (countEl) countEl.textContent = data.total_rows || 0;

        // Header
        var mapping = data.mapping || {};
        var mappedIndices = {};
        Object.keys(mapping).forEach(function (k) { mappedIndices[mapping[k]] = k; });

        head.innerHTML = '<tr>' + data.headers.map(function (h, i) {
            var mapped = mappedIndices[i];
            var badge = mapped ? ' <span style="color:var(--color-primary);font-size:0.65rem">(' + mapped + ')</span>' : '';
            return '<th>' + Utils.escapeHtml(h) + badge + '</th>';
        }).join('') + '</tr>';

        // Body
        body.innerHTML = (data.preview || []).map(function (row) {
            return '<tr>' + row.map(function (cell) {
                return '<td>' + Utils.escapeHtml(cell || '') + '</td>';
            }).join('') + '</tr>';
        }).join('');
    }

    function doImport() {
        if (!currentFile) {
            Utils.showToast('No file selected.', 'error');
            return;
        }

        var formData = new FormData();
        formData.append('file', currentFile);

        if (previewData && previewData.mapping) {
            formData.append('mapping', JSON.stringify(previewData.mapping));
        }

        Utils.showToast('Importing transactions...', 'info');

        API.importCSV(formData)
            .then(function (data) {
                renderImportResults(data);
                Utils.showToast('Imported ' + (data.imported || 0) + ' transactions!', 'success');
            })
            .catch(function (err) {
                if (isPremiumRequired(err)) {
                    Utils.showToast('CSV import is available on Premium. Upgrade from Profile.', 'warning');
                    return;
                }
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function renderImportResults(data) {
        var card = document.getElementById('resultCard');
        var container = document.getElementById('importResults');
        if (!card || !container) return;

        card.style.display = 'block';

        var html = '<div style="padding:1rem">' +
            '<div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:1rem">' +
                '<div><span class="text-secondary">Total Rows:</span> <strong>' + (data.total_rows || 0) + '</strong></div>' +
                '<div><span class="text-secondary">Imported:</span> <strong style="color:var(--color-success)">' + (data.imported || 0) + '</strong></div>' +
                '<div><span class="text-secondary">Errors:</span> <strong style="color:var(--color-danger)">' + (data.error_count || 0) + '</strong></div>' +
            '</div>';

        if (data.errors && data.errors.length) {
            html += '<div style="font-size:0.813rem;color:var(--color-text-secondary)">' +
                '<p style="font-weight:600;margin-bottom:0.5rem">Errors:</p>' +
                data.errors.map(function (e) {
                    return '<p style="margin-bottom:0.25rem;color:var(--color-danger)">• ' + Utils.escapeHtml(e) + '</p>';
                }).join('') +
            '</div>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function scanReceipt() {
        var textEl = document.getElementById('receiptText');
        var text = textEl ? textEl.value.trim() : '';

        if (!text && !currentReceiptImage) {
            Utils.showToast('Paste receipt text or upload a bill photo first.', 'error');
            return;
        }

        var formData = new FormData();
        if (text) formData.append('text', text);
        if (currentReceiptImage) formData.append('image', currentReceiptImage);

        Utils.showToast(currentReceiptImage ? 'Extracting data from bill photo...' : 'Scanning receipt text...', 'info');

        API.scanReceipt(formData)
            .then(function (data) {
                renderReceiptResult(data);
            })
            .catch(function (err) {
                if (isPremiumRequired(err)) {
                    var container = document.getElementById('receiptResult');
                    if (container) {
                        container.style.display = 'block';
                        container.innerHTML = '<div class="card" style="padding:1rem;text-align:center">' +
                            '<p style="font-weight:600;margin-bottom:0.5rem">Premium feature</p>' +
                            '<p class="text-secondary" style="margin-bottom:0.75rem">' + Utils.escapeHtml(err.message || (typeof err.error === 'string' ? err.error : 'Receipt Scanner is available on Premium plan.')) + '</p>' +
                            '<a href="index.html#pricing" class="btn btn-primary btn-sm">Upgrade to Premium</a>' +
                        '</div>';
                    }
                    return;
                }
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    function renderReceiptResult(data) {
        var container = document.getElementById('receiptResult');
        if (!container) return;

        container.style.display = 'block';

        if (data && data.error && !data.amount && !data.date && !data.merchant) {
            container.innerHTML = '<div class="card" style="background:var(--color-bg-card);padding:1rem">' +
                '<p style="font-weight:600;color:var(--color-danger);margin-bottom:0.45rem">Unable to extract data from this image.</p>' +
                '<p class="text-secondary" style="font-size:0.85rem;margin:0">' + Utils.escapeHtml(data.error) + '</p>' +
                '</div>';
            return;
        }

        var html = '<div class="card" style="background:var(--color-bg-card);padding:1rem">' +
            '<h4 style="font-weight:600;margin-bottom:0.75rem">Extracted Details</h4>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem">';

        if (data.warning) {
            html += '<div style="grid-column:1 / -1;color:var(--color-warning);font-size:0.82rem">' + Utils.escapeHtml(data.warning) + '</div>';
        }

        if (data.amount) html += '<div><span class="text-secondary">Amount:</span> <strong>' + Utils.formatCurrency(data.amount) + '</strong></div>';
        if (data.date) html += '<div><span class="text-secondary">Date:</span> <strong>' + data.date + '</strong></div>';
        if (data.merchant) html += '<div><span class="text-secondary">Merchant:</span> <strong>' + Utils.escapeHtml(data.merchant) + '</strong></div>';
        if (data.suggested_category) html += '<div><span class="text-secondary">Category:</span> <strong>' + Utils.escapeHtml(data.suggested_category.category_name || '') + '</strong></div>';

        html += '</div>';

        if (data.amount) {
            html += '<button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="ImportPage.createFromReceipt()">Add To Transactions</button>';
        } else {
            html += '<p class="text-secondary" style="margin-top:1rem;font-size:0.83rem">No amount detected yet. Try a clearer image or include receipt text.</p>';
        }

        if (data.raw_text) {
            html += '<details style="margin-top:0.75rem">' +
                '<summary class="text-secondary" style="cursor:pointer;font-size:0.82rem">View extracted text</summary>' +
                '<pre style="white-space:pre-wrap;font-size:0.78rem;margin-top:0.45rem;max-height:160px;overflow:auto;background:var(--color-bg-elevated);padding:0.55rem;border-radius:8px;border:1px solid var(--color-border)">' + Utils.escapeHtml(data.raw_text) + '</pre>' +
                '</details>';
        }

        html += '</div>';
        container.innerHTML = html;

        window._receiptData = data;
    }

    function createFromReceipt() {
        var data = window._receiptData;
        if (!data || !data.amount) return;

        var payload = {
            type: 'expense',
            amount: data.amount,
            date: data.date || new Date().toISOString().substring(0, 10),
            notes: data.merchant || '',
            merchant: data.merchant || '',
        };
        if (data.suggested_category) {
            payload.category = data.suggested_category.category_id;
        }

        API.createTransaction(payload)
            .then(function () {
                Utils.showToast('Transaction created from receipt!', 'success');
                var container = document.getElementById('receiptResult');
                if (container) {
                    container.innerHTML += '<p class="text-secondary" style="font-size:0.82rem;margin-top:0.65rem">Saved. You can review it in <a href="transactions.html">Transactions</a>.</p>';
                }
            })
            .catch(function (err) {
                Utils.showToast(Utils.parseApiErrors(err), 'error');
            });
    }

    window.ImportPage = {
        createFromReceipt: createFromReceipt,
    };

    init();
})();
