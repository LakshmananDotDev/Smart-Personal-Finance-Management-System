/**
 * PDF Report Export — comprehensive 12-section financial report
 * Renders Chart.js charts to hidden canvas and embeds them in the PDF.
 */
/* exported buildFullReport */
function buildFullReport(user, exportType, exportYear, exportMonth) {
    'use strict';

    var monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

    var periodLabel = exportType === 'yearly'
        ? 'Year ' + exportYear
        : monthNames[exportMonth - 1] + ' ' + exportYear;

    /* ── Currency formatter (ASCII-safe for Helvetica) ── */
    var currencyCode = (user.currency || 'INR').toUpperCase();
    var currencyPrefix = { INR: 'Rs.', USD: '$', EUR: 'EUR ', GBP: 'GBP ' };
    var cPrefix = currencyPrefix[currencyCode] || '';
    function fmt(val) {
        var n = parseFloat(val) || 0;
        var parts = Math.abs(n).toFixed(2).split('.');
        var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (n < 0 ? '-' : '') + cPrefix + intPart + '.' + parts[1];
    }
    function fmtShort(val) {
        var n = parseFloat(val) || 0;
        if (Math.abs(n) >= 100000) return (n < 0 ? '-' : '') + cPrefix + (Math.abs(n)/1000).toFixed(1) + 'K';
        var parts = Math.abs(n).toFixed(0).split('.');
        var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (n < 0 ? '-' : '') + cPrefix + intPart;
    }

    /* ── Build API params ── */
    var txParams  = { limit: 10000, year: exportYear };
    var budgetParams = {};
    var reportParams = { year: exportYear };
    if (exportType === 'monthly') {
        txParams.month = exportMonth;
        budgetParams.month = exportMonth;
        budgetParams.year  = exportYear;
        reportParams.month = exportMonth;
    }

    /* Fetch previous-period transactions for comparison */
    var prevParams = { limit: 10000 };
    if (exportType === 'monthly') {
        var pm = exportMonth - 1, py = exportYear;
        if (pm === 0) { pm = 12; py--; }
        prevParams.year = py; prevParams.month = pm;
    } else {
        prevParams.year = exportYear - 1;
    }

    return Promise.all([
        API.getTransactions(txParams),          // 0
        API.getBudgets(budgetParams),           // 1
        API.getSavingsGoals(),                  // 2
        API.getAccounts(),                      // 3
        API.getSubscriptions(),                 // 4
        API.getReports(reportParams),           // 5
        API.getInsights(),                      // 6
        API.getHealthScore(),                   // 7
        API.getBehavioralInsights(),            // 8
        API.getSimulatorBaseline(),             // 9
        API.getBudgetAlerts(),                  // 10
        API.getTransactions(prevParams),        // 11 (previous period)
        API.getTaxSummary(reportParams).catch(function () { return {}; }),
        API.getTaxRegimeComparison(reportParams).catch(function () { return {}; }),
        API.getTaxSuggestions(reportParams).catch(function () { return { suggestions: [] }; })
    ]).then(function (R) {
        var transactions = R[0].results || R[0];
        var budgets      = R[1].results || R[1];
        var goals        = R[2].results || R[2];
        var accounts     = R[3].results || R[3];
        var subs         = R[4].results || R[4];
        var report       = R[5] || {};
        var insights     = (R[6] && R[6].insights) || [];
        var health       = R[7] || {};
        var behavioral   = (R[8] && R[8].patterns) || [];
        var simBaseline  = R[9] || {};
        var budgetAlerts = (R[10] && R[10].alerts) || [];
        var prevTx       = R[11].results || R[11];
        var taxSummary   = R[12] || {};
        var taxComparison = R[13] || {};
        var taxSuggestions = (R[14] && R[14].suggestions) || [];

        /* Filter yearly budgets client-side */
        if (exportType === 'yearly') {
            budgets = budgets.filter(function (b) { return b.year === exportYear; });
        }

        /* ── Compute totals ── */
        var income = 0, expense = 0;
        transactions.forEach(function (t) {
            var a = parseFloat(t.amount) || 0;
            if (t.type === 'income') income += a; else expense += a;
        });
        var netSavings = income - expense;
        var savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;

        var prevIncome = 0, prevExpense = 0;
        prevTx.forEach(function (t) {
            var a = parseFloat(t.amount) || 0;
            if (t.type === 'income') prevIncome += a; else prevExpense += a;
        });

        /* ── Category aggregation ── */
        var catMap = {};
        transactions.forEach(function (t) {
            if (t.type !== 'expense') return;
            var cat = t.category_name || 'Other';
            catMap[cat] = (catMap[cat] || 0) + (parseFloat(t.amount) || 0);
        });
        var catArr = Object.keys(catMap).map(function (k) { return { name: k, total: catMap[k] }; });
        catArr.sort(function (a, b) { return b.total - a.total; });
        var topCats = catArr.slice(0, 7);

        /* ── Report monthly data ── */
        var monthlyData = report.monthly_data || [];

        /* ── Chart rendering helper ── */
        var canvas = document.getElementById('pdfChartCanvas');
        var chartInstance = null;

        function renderChart(cfg, w, h) {
            canvas.width = w || 800;
            canvas.height = h || 400;
            if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cfg.options = cfg.options || {};
            cfg.options.responsive = false;
            cfg.options.animation = false;
            cfg.options.devicePixelRatio = 2;
            chartInstance = new Chart(ctx, cfg);
            return canvas.toDataURL('image/png');
        }

        /* ═══════════════════════════════════════════════════
           BUILD PDF
           ═══════════════════════════════════════════════════ */
        var jsPDF  = window.jspdf.jsPDF;
        var doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        var pageW  = doc.internal.pageSize.getWidth();
        var pageH  = doc.internal.pageSize.getHeight();
        var mL = 15, mR = 15;
        var contentW = pageW - mL - mR;
        var exportSemantic = Utils.getChartSemanticColors ? Utils.getChartSemanticColors() : {
            income: '#0f8f7a',
            expense: '#cf3e48',
            incomeFill: 'rgba(15,143,122,0.7)',
            expenseFill: 'rgba(207,62,72,0.62)'
        };

        /* Colors */
        var primary   = [15, 143, 122];
        var darkBg    = [15, 23, 42];
        var white     = [255, 255, 255];
        var lightGray = [241, 245, 249];
        var textDark  = [30, 41, 59];
        var textMuted = [100, 116, 139];
        var green     = [15, 143, 122];
        var red       = [207, 62, 72];
        var amber     = [201, 134, 18];
        var fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim();
        var userName = fullName || user.username || 'User';
        var summaryUserName = user.username || userName || 'User';
        var today     = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

        var cursorY = 0;

        /* ── Helpers ── */
        function ensureSpace(need) {
            if (cursorY + need > pageH - 18) { doc.addPage(); cursorY = 26; }
        }

        function drawPageHeader(pageNumber) {
            if (pageNumber === 1) {
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor.apply(doc, white);
                doc.text('Finyx Financial Report', mL, 8);

                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(180, 210, 200);
                doc.text(periodLabel, pageW - mR, 8, { align: 'right' });
                return;
            }

            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageW, 14, 'F');

            doc.setDrawColor(226, 232, 240);
            doc.line(mL, 12, pageW - mR, 12);

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor.apply(doc, textDark);
            doc.text('Finyx Financial Report', mL, 8);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, textMuted);
            doc.text(periodLabel, pageW - mR, 8, { align: 'right' });
        }

        function sectionTitle(icon, title) {
            ensureSpace(20);
            doc.setFillColor.apply(doc, primary);
            doc.roundedRect(mL, cursorY, 3, 8, 1.5, 1.5, 'F');
            doc.setTextColor.apply(doc, textDark);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(icon + '  ' + title, mL + 7, cursorY + 6.5);
            cursorY += 14;
        }

        function statBoxes(items) {
            ensureSpace(24);
            var boxW = (contentW - (items.length - 1) * 4) / items.length;
            items.forEach(function (item, i) {
                var x = mL + i * (boxW + 4);
                doc.setFillColor.apply(doc, item.bg || lightGray);
                doc.roundedRect(x, cursorY, boxW, 18, 2, 2, 'F');
                doc.setTextColor.apply(doc, textMuted);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(item.label, x + boxW / 2, cursorY + 6, { align: 'center' });
                doc.setTextColor.apply(doc, item.color || primary);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text(String(item.value), x + boxW / 2, cursorY + 14, { align: 'center' });
            });
            cursorY += 24;
        }

        function bulletList(items, indent) {
            var x = mL + (indent || 0);
            items.forEach(function (item) {
                ensureSpace(8);
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor.apply(doc, textDark);
                var lines = doc.splitTextToSize(item, contentW - (indent || 0) - 5);
                doc.text('>', x, cursorY + 4);
                doc.text(lines, x + 5, cursorY + 4);
                cursorY += lines.length * 4.5 + 2;
            });
        }

        var tableTheme = {
            headStyles: { fillColor: primary, textColor: white, fontStyle: 'bold', fontSize: 8.5,
                          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
            bodyStyles: { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: textDark },
            alternateRowStyles: { fillColor: [245, 250, 248] },
            styles: { lineColor: [226, 232, 240], lineWidth: 0.2, overflow: 'linebreak' },
            tableWidth: 'auto',
            margin: { left: mL, right: mR, top: 24, bottom: 16 },
            tableLineColor: [226, 232, 240], tableLineWidth: 0.1
        };

        /* ═══════════════════════════════════════════
           COVER / HEADER BANNER (page 1)
           ═══════════════════════════════════════════ */
        doc.setFillColor.apply(doc, darkBg);
        doc.rect(0, 0, pageW, 52, 'F');
        doc.setFillColor.apply(doc, primary);
        doc.rect(0, 48, pageW, 4, 'F');

        doc.setTextColor.apply(doc, white);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('Finyx', mL, 18);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('Financial Report  |  ' + periodLabel, mL, 27);
        doc.setFontSize(9);
        doc.setTextColor(180, 210, 200);
        doc.text('Generated: ' + today, mL, 35);
        doc.text('Prepared for: ' + userName + '  (' + (user.email || '') + ')', mL, 42);

        cursorY = 62;

        /* ═══════════════════════════════════════════
              1. USER SUMMARY
           ═══════════════════════════════════════════ */
          sectionTitle('#1', summaryUserName + ' Summary');
        statBoxes([
            { label: 'TOTAL INCOME',   value: fmt(income) },
            { label: 'TOTAL EXPENSES', value: fmt(expense), color: red },
            { label: 'NET SAVINGS',    value: fmt(netSavings), color: netSavings >= 0 ? green : red },
            { label: 'SAVINGS RATE',   value: savingsRate + '%', color: savingsRate >= 20 ? green : savingsRate >= 10 ? amber : red }
        ]);

        /* Period comparison */
        if (prevTx.length) {
            var expChange = prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : 0;
            var incChange = prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : 0;
            ensureSpace(10);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor.apply(doc, textMuted);
            var cmpLabel = exportType === 'monthly' ? 'vs previous month' : 'vs previous year';
            doc.text('Income ' + (incChange >= 0 ? '+' : '') + incChange + '% ' + cmpLabel +
                     '   |   Expenses ' + (expChange >= 0 ? '+' : '') + expChange + '% ' + cmpLabel, mL, cursorY + 3);
            cursorY += 10;
        }

        /* ═══════════════════════════════════════════
           2. FINANCIAL OVERVIEW  (bar chart)
           ═══════════════════════════════════════════ */
        sectionTitle('#2', 'Financial Overview');

        /* Monthly trend bar chart */
        if (monthlyData.length) {
            var chartLabels = monthlyData.map(function (m) { return monthNames[m.month - 1].substring(0, 3); });
            var incomeData  = monthlyData.map(function (m) { return m.income || 0; });
            var expenseData = monthlyData.map(function (m) { return m.expenses || 0; });

            var barImg = renderChart({
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [
                        { label: 'Income',   data: incomeData,  backgroundColor: exportSemantic.incomeFill || 'rgba(15,143,122,0.7)' },
                        { label: 'Expenses', data: expenseData, backgroundColor: exportSemantic.expenseFill || 'rgba(207,62,72,0.62)' }
                    ]
                },
                options: {
                    plugins: { legend: { position: 'top' }, title: { display: true, text: 'Monthly Income vs Expenses (' + exportYear + ')' } },
                    scales: { y: { beginAtZero: true } }
                }
            }, 800, 350);

            ensureSpace(72);
            doc.addImage(barImg, 'PNG', mL, cursorY, contentW, 65);
            cursorY += 70;

            /* summary stats */
            var totalMonths = monthlyData.filter(function (m) { return (m.expenses || 0) > 0; }).length || 1;
            var avgSpending = expense / totalMonths;
            var highestMonth = monthlyData.reduce(function (max, m) { return (m.expenses || 0) > (max.expenses || 0) ? m : max; }, monthlyData[0]);

            statBoxes([
                { label: 'AVG MONTHLY SPENDING', value: fmtShort(avgSpending) },
                { label: 'HIGHEST SPEND MONTH',  value: monthNames[(highestMonth.month || 1) - 1].substring(0, 3) + ' (' + fmtShort(highestMonth.expenses) + ')', color: red },
                { label: 'TRANSACTIONS', value: String(transactions.length) }
            ]);
        }

        /* ═══════════════════════════════════════════
           3. CATEGORY BREAKDOWN  (doughnut + table)
           ═══════════════════════════════════════════ */
        if (topCats.length) {
            ensureSpace(30);
            sectionTitle('#3', 'Category Breakdown');

            var catColors = Utils.buildChartPalette ? Utils.buildChartPalette(topCats.length) : ['#0f8f7a','#2d6fd8','#c98612','#cf3e48','#6b58d6','#d24890','#1283b1'];
            var doughnutImg = renderChart({
                type: 'doughnut',
                data: {
                    labels: topCats.map(function (c) { return c.name; }),
                    datasets: [{
                        data: topCats.map(function (c) { return c.total; }),
                        backgroundColor: catColors.slice(0, topCats.length)
                    }]
                },
                options: {
                    plugins: {
                        legend: { position: 'right', labels: { font: { size: 13 } } },
                        title: { display: true, text: 'Expense Distribution by Category' }
                    }
                }
            }, 800, 400);

            ensureSpace(75);
            doc.addImage(doughnutImg, 'PNG', mL + 15, cursorY, contentW - 30, 65);
            cursorY += 70;

            /* Category table */
            ensureSpace(20);
            doc.autoTable(Object.assign({}, tableTheme, {
                startY: cursorY,
                head: [['Category', 'Amount', '% Share']],
                body: topCats.map(function (c) {
                    return [c.name, fmt(c.total), (expense > 0 ? Math.round(c.total / expense * 100) : 0) + '%'];
                }),
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { halign: 'right', cellWidth: 55 },
                    2: { halign: 'center', cellWidth: 35 }
                }
            }));
            cursorY = doc.lastAutoTable.finalY + 12;
        }

        /* ═══════════════════════════════════════════
           4. BUDGET PERFORMANCE
           ═══════════════════════════════════════════ */
        if (budgets.length) {
            sectionTitle('#4', 'Budget Performance');

            var goodBudgets = [], warnBudgets = [], overBudgets = [];
            budgets.forEach(function (b) {
                var amt = parseFloat(b.amount) || 0;
                var sp  = parseFloat(b.spent) || 0;
                var pct = amt > 0 ? Math.round(sp / amt * 100) : 0;
                var item = { name: b.category_name || b.category || '-', budget: amt, spent: sp, pct: pct };
                if (pct > 100) overBudgets.push(item);
                else if (pct >= 80) warnBudgets.push(item);
                else goodBudgets.push(item);
            });

            /* Status summary boxes */
            statBoxes([
                { label: 'UNDER CONTROL', value: String(goodBudgets.length), color: green },
                { label: 'WARNING (>80%)', value: String(warnBudgets.length), color: amber },
                { label: 'OVER BUDGET',    value: String(overBudgets.length), color: red }
            ]);

            /* Budget table with color-coded usage */
            ensureSpace(20);
            doc.autoTable(Object.assign({}, tableTheme, {
                startY: cursorY,
                head: [['Status', 'Category', 'Budget', 'Spent', 'Usage']],
                body: overBudgets.concat(warnBudgets, goodBudgets).map(function (b) {
                    var status = b.pct > 100 ? 'OVER' : b.pct >= 80 ? 'WARN' : 'OK';
                    return [status, b.name, fmt(b.budget), fmt(b.spent), b.pct + '%'];
                }),
                columnStyles: {
                    0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
                    1: { cellWidth: 50 },
                    2: { halign: 'right', cellWidth: 35 },
                    3: { halign: 'right', cellWidth: 35 },
                    4: { halign: 'center', cellWidth: 25 }
                },
                didParseCell: function (data) {
                    if (data.section === 'body' && data.column.index === 0) {
                        if (data.cell.raw === 'OVER') data.cell.styles.textColor = red;
                        else if (data.cell.raw === 'WARN') data.cell.styles.textColor = amber;
                        else data.cell.styles.textColor = green;
                    }
                    if (data.section === 'body' && data.column.index === 4) {
                        var p = parseInt(data.cell.raw);
                        data.cell.styles.textColor = p > 100 ? red : p >= 80 ? amber : green;
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }));
            cursorY = doc.lastAutoTable.finalY + 12;

            /* Budget alerts */
            if (budgetAlerts.length) {
                ensureSpace(10);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor.apply(doc, red);
                doc.text('Budget Alerts:', mL, cursorY + 3);
                cursorY += 7;
                bulletList(budgetAlerts.map(function (a) { return a.title + ' - ' + a.message; }), 3);
            }
        }

        /* ═══════════════════════════════════════════
           5. SAVINGS & GOALS  (progress bars)
           ═══════════════════════════════════════════ */
        if (goals.length) {
            sectionTitle('#5', 'Savings & Goals');

            statBoxes([
                { label: 'NET SAVINGS THIS PERIOD', value: fmt(netSavings), color: netSavings >= 0 ? green : red },
                { label: 'ACTIVE GOALS', value: String(goals.length) }
            ]);

            /* Draw progress bars for each goal */
            goals.forEach(function (g) {
                var tgt = parseFloat(g.target_amount) || 0;
                var cur = parseFloat(g.current_amount) || 0;
                var pct = tgt > 0 ? Math.min(Math.round(cur / tgt * 100), 100) : 0;
                var name = g.name || g.title || 'Goal';

                ensureSpace(18);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor.apply(doc, textDark);
                doc.text(name, mL, cursorY + 4);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.text(fmt(cur) + ' / ' + fmt(tgt) + '  (' + pct + '%)', pageW - mR, cursorY + 4, { align: 'right' });
                cursorY += 7;

                /* Progress bar background */
                doc.setFillColor(226, 232, 240);
                doc.roundedRect(mL, cursorY, contentW, 5, 2.5, 2.5, 'F');
                /* Progress bar fill */
                var barColor = pct >= 100 ? green : pct >= 50 ? primary : amber;
                doc.setFillColor.apply(doc, barColor);
                var fillW = Math.max(contentW * pct / 100, 0);
                if (fillW > 0) doc.roundedRect(mL, cursorY, fillW, 5, 2.5, 2.5, 'F');
                cursorY += 10;
            });
            cursorY += 4;
        }

        /* ═══════════════════════════════════════════
           6. SUBSCRIPTIONS SUMMARY
           ═══════════════════════════════════════════ */
        if (subs.length) {
            sectionTitle('#6', 'Subscriptions Summary');

            var monthlySubCost = subs.reduce(function (s, sub) {
                var a = parseFloat(sub.amount) || 0;
                if (sub.frequency === 'yearly' || sub.frequency === 'annual') return s + a / 12;
                if (sub.frequency === 'weekly') return s + a * 4.33;
                return s + a;
            }, 0);

            statBoxes([
                { label: 'ACTIVE SUBSCRIPTIONS', value: String(subs.length) },
                { label: 'MONTHLY COST', value: fmt(monthlySubCost) },
                { label: 'YEARLY PROJECTION', value: fmt(monthlySubCost * 12), color: red }
            ]);

            ensureSpace(20);
            doc.autoTable(Object.assign({}, tableTheme, {
                startY: cursorY,
                head: [['Name', 'Amount', 'Frequency', 'Next Billing']],
                body: subs.map(function (sub) {
                    return [sub.name || '-', fmt(sub.amount), sub.frequency || '-',
                            sub.next_billing_date || sub.next_payment || sub.next_date || '-'];
                }),
                columnStyles: {
                    0: { cellWidth: 50 }, 1: { halign: 'right', cellWidth: 40 },
                    2: { cellWidth: 35 }, 3: { cellWidth: 40 }
                }
            }));
            cursorY = doc.lastAutoTable.finalY + 6;

            /* Suggestion */
            ensureSpace(10);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor.apply(doc, primary);
            doc.text('Tip: Review your subscriptions regularly. You could save ' + fmt(monthlySubCost * 12) + '/year by cancelling unused ones.', mL, cursorY + 4);
            cursorY += 12;
        }

        /* ═══════════════════════════════════════════
           7. AI INSIGHTS  (core feature)
           ═══════════════════════════════════════════ */
        if (insights.length) {
            sectionTitle('#7', 'AI Insights');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor.apply(doc, textMuted);
            doc.text('Powered by Finyx Insights Engine — 7 analytical modules', mL, cursorY);
            cursorY += 6;

            insights.forEach(function (ins) {
                ensureSpace(14);
                var prefix = ins.type === 'danger' ? '[!] ' : ins.type === 'warning' ? '[!] ' : ins.type === 'success' ? '[+] ' : '[i] ';
                var color = ins.type === 'danger' ? red : ins.type === 'warning' ? amber : ins.type === 'success' ? green : textDark;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor.apply(doc, color);
                doc.text(prefix + (ins.title || ''), mL, cursorY + 4);
                cursorY += 5;

                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor.apply(doc, textDark);
                var msgLines = doc.splitTextToSize(ins.message || '', contentW - 5);
                doc.text(msgLines, mL + 3, cursorY + 3);
                cursorY += msgLines.length * 4 + 4;
            });
            cursorY += 4;
        }

        /* ═══════════════════════════════════════════
           8. FINANCIAL HEALTH SCORE
           ═══════════════════════════════════════════ */
        if (health && health.score !== undefined) {
            sectionTitle('#8', 'Financial Health Score');

            var grade = health.grade || {};
            var scoreVal = health.score || 0;

            /* Big score display */
            ensureSpace(35);
            doc.setFillColor.apply(doc, lightGray);
            doc.roundedRect(mL, cursorY, contentW, 28, 3, 3, 'F');

            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            var scoreColor = scoreVal >= 80 ? green : scoreVal >= 60 ? amber : red;
            doc.setTextColor.apply(doc, scoreColor);
            doc.text(scoreVal + '/100', mL + 20, cursorY + 18);

            doc.setFontSize(14);
            doc.text('Grade: ' + (grade.letter || '-'), mL + 80, cursorY + 18);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, textMuted);
            doc.text(grade.label || '', mL + 130, cursorY + 18);
            cursorY += 34;

            /* Breakdown table */
            var breakdown = health.breakdown || {};
            var bKeys = Object.keys(breakdown);
            if (bKeys.length) {
                ensureSpace(20);
                doc.autoTable(Object.assign({}, tableTheme, {
                    startY: cursorY,
                    head: [['Metric', 'Score', 'Detail']],
                    body: bKeys.map(function (k) {
                        var b = breakdown[k];
                        return [b.label || k, (b.score || 0) + '/100', b.detail || '-'];
                    }),
                    columnStyles: {
                        0: { cellWidth: 45, fontStyle: 'bold' },
                        1: { cellWidth: 25, halign: 'center' },
                        2: { cellWidth: 95 }
                    },
                    didParseCell: function (data) {
                        if (data.section === 'body' && data.column.index === 1) {
                            var s = parseInt(data.cell.raw);
                            data.cell.styles.textColor = s >= 70 ? green : s >= 50 ? amber : red;
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }));
                cursorY = doc.lastAutoTable.finalY + 12;
            }

            /* Health suggestions */
            if (health.suggestions && health.suggestions.length) {
                ensureSpace(10);
                bulletList(health.suggestions.map(function (s) { return s.text || s; }), 3);
            }
        }

        /* ═══════════════════════════════════════════
           9. BEHAVIORAL ANALYSIS
           ═══════════════════════════════════════════ */
        if (behavioral.length) {
            sectionTitle('#9', 'Behavioral Analysis');

            behavioral.forEach(function (p) {
                ensureSpace(14);
                var color = p.type === 'danger' ? red : p.type === 'warning' ? amber : textDark;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor.apply(doc, color);
                doc.text('> ' + (p.title || ''), mL, cursorY + 4);
                cursorY += 5;
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor.apply(doc, textDark);
                var lines = doc.splitTextToSize(p.message || '', contentW - 8);
                doc.text(lines, mL + 5, cursorY + 3);
                cursorY += lines.length * 4 + 5;
            });
            cursorY += 4;
        }

        /* ═══════════════════════════════════════════
           10. WHAT-IF SIMULATION
           ═══════════════════════════════════════════ */
        if (simBaseline && simBaseline.categories && simBaseline.categories.length) {
            sectionTitle('#10', 'What-If Simulation');

            var simCats = simBaseline.categories.slice(0, 3);
            var simIncome  = simBaseline.monthly_income || income;
            var simExpense = simBaseline.monthly_expenses || expense;
            var simSavings = simBaseline.monthly_savings || netSavings;

            statBoxes([
                { label: 'AVG MONTHLY INCOME', value: fmtShort(simIncome) },
                { label: 'AVG MONTHLY EXPENSES', value: fmtShort(simExpense), color: red },
                { label: 'AVG MONTHLY SAVINGS', value: fmtShort(simSavings), color: simSavings >= 0 ? green : red }
            ]);

            /* Scenario: reduce top categories by 20% */
            if (simCats.length) {
                ensureSpace(16);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor.apply(doc, primary);
                doc.text('Scenario: "Reduce top spending categories by 20%"', mL, cursorY + 4);
                cursorY += 8;

                var potentialSaving = simCats.reduce(function (s, c) { return s + (c.monthly_average || 0) * 0.2; }, 0);
                var newMonthlySaving = simSavings + potentialSaving;

                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor.apply(doc, textDark);

                var scenarioLines = [
                    'Categories: ' + simCats.map(function (c) { return c.category_name; }).join(', '),
                    'Potential monthly savings: ' + fmt(potentialSaving),
                    'New monthly savings: ' + fmt(newMonthlySaving) + '  (from ' + fmt(simSavings) + ')',
                    'Projected extra in 12 months: ' + fmt(potentialSaving * 12)
                ];
                bulletList(scenarioLines, 3);
            }
        }

        /* ═══════════════════════════════════════════
           11. TAX OPTIMIZATION (INDIA)
           ═══════════════════════════════════════════ */
        if (taxComparison && (taxComparison.old_regime || taxComparison.new_regime)) {
            sectionTitle('#11', 'Tax Optimization (India)');

            var annualIncomeTax = parseFloat(taxSummary.annual_income || taxComparison.annual_income || 0);
            var eligibleDeductionsTax = parseFloat(taxSummary.total_deductions_eligible || taxComparison.eligible_deductions_old_regime || 0);
            var oldTaxTotal = parseFloat((taxComparison.old_regime && taxComparison.old_regime.total_tax) || 0);
            var newTaxTotal = parseFloat((taxComparison.new_regime && taxComparison.new_regime.total_tax) || 0);

            statBoxes([
                { label: 'ANNUAL INCOME', value: fmt(annualIncomeTax) },
                { label: 'ELIGIBLE DEDUCTIONS', value: fmt(eligibleDeductionsTax), color: green },
                { label: 'OLD REGIME TAX', value: fmt(oldTaxTotal), color: amber },
                { label: 'NEW REGIME TAX', value: fmt(newTaxTotal), color: primary }
            ]);

            if (taxSummary.sections && taxSummary.sections.length) {
                ensureSpace(20);
                doc.autoTable(Object.assign({}, tableTheme, {
                    startY: cursorY,
                    head: [['Section', 'Limit', 'Eligible', 'Remaining']],
                    body: taxSummary.sections.map(function (s) {
                        return [
                            s.section || '-',
                            fmt(s.limit || 0),
                            fmt(s.eligible_deduction || 0),
                            fmt(s.remaining_limit || 0)
                        ];
                    }),
                    columnStyles: {
                        0: { cellWidth: 30, fontStyle: 'bold' },
                        1: { cellWidth: 35, halign: 'right' },
                        2: { cellWidth: 35, halign: 'right' },
                        3: { cellWidth: 35, halign: 'right' }
                    }
                }));
                cursorY = doc.lastAutoTable.finalY + 10;
            }

            ensureSpace(18);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor.apply(doc, textDark);
            doc.text('Recommended regime: ' + String((taxComparison.recommended_regime || 'either')).toUpperCase(), mL, cursorY + 4);
            cursorY += 8;

            var taxNotes = [];
            if (taxComparison.tax_difference) {
                taxNotes.push('Potential savings vs alternate regime: ' + fmt(taxComparison.tax_difference));
            }
            if (taxSuggestions.length) {
                taxNotes = taxNotes.concat(taxSuggestions.slice(0, 3).map(function (s) {
                    return (s.title || 'Suggestion') + ': ' + (s.message || '');
                }));
            }
            if (taxNotes.length) {
                bulletList(taxNotes, 3);
            }
        }

        /* ═══════════════════════════════════════════
           12. PERSONALIZED SUGGESTIONS
           ═══════════════════════════════════════════ */
        sectionTitle('#12', 'Personalized Suggestions');

        var suggestions = [];

        /* Expense control */
        if (topCats.length) {
            suggestions.push('-- Expense Control --');
            suggestions.push('Reduce "' + topCats[0].name + '" spending by 20% to save ' + fmt(topCats[0].total * 0.2) + ' this period.');
            if (topCats.length > 1) {
                suggestions.push('Review "' + topCats[1].name + '" expenses (' + fmt(topCats[1].total) + ') for optimization opportunities.');
            }
        }
        if (subs.length > 2) {
            suggestions.push('You have ' + subs.length + ' active subscriptions. Review and cancel any unused ones to free up cash.');
        }

        /* Savings improvement */
        suggestions.push('-- Savings Improvement --');
        if (savingsRate < 20 && income > 0) {
            var targetSaving = income * 0.2;
            suggestions.push('Increase savings rate from ' + savingsRate + '% to 20%. Target: ' + fmt(targetSaving) + ' saved per period.');
        } else if (savingsRate >= 20) {
            suggestions.push('Great! Your savings rate of ' + savingsRate + '% is above the recommended 20%. Keep it up!');
        }
        if (income > 0) {
            suggestions.push('Suggested monthly saving target: ' + fmt(income * 0.25) + ' (25% of income).');
        }

        /* Budget optimization */
        if (budgets.length) {
            suggestions.push('-- Budget Optimization --');
            var overCount = budgets.filter(function (b) { return (parseFloat(b.spent) || 0) > (parseFloat(b.amount) || 0); }).length;
            var underCount = budgets.filter(function (b) {
                var a = parseFloat(b.amount) || 0; var s = parseFloat(b.spent) || 0;
                return a > 0 && s / a < 0.5;
            }).length;
            if (overCount) suggestions.push(overCount + ' budget(s) exceeded. Consider increasing limits or reducing spending in those categories.');
            if (underCount) suggestions.push(underCount + ' budget(s) under 50% utilization. Consider reallocating unused budget to overspent categories.');
        }

        bulletList(suggestions, 0);
        cursorY += 4;

        /* ═══════════════════════════════════════════
           13. TRANSACTION SUMMARY (Appendix)
           ═══════════════════════════════════════════ */
        if (transactions.length) {
            doc.addPage();
            cursorY = 26;
            sectionTitle('#13', 'Transaction Summary (Appendix)');

            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor.apply(doc, textMuted);
            doc.text('Showing ' + Math.min(transactions.length, 200) + ' of ' + transactions.length + ' transactions for ' + periodLabel, mL, cursorY);
            cursorY += 6;

            doc.autoTable(Object.assign({}, tableTheme, {
                startY: cursorY,
                head: [['Date', 'Description', 'Category', 'Type', 'Amount']],
                body: transactions.slice(0, 200).map(function (t) {
                    var d = t.date || t.created_at || '';
                    if (d.length > 10) d = d.slice(0, 10);
                    return [
                        d,
                        (t.description || t.title || '-').substring(0, 40),
                        t.category_name || t.category || '-',
                        t.type || '-',
                        fmt(t.amount)
                    ];
                }),
                columnStyles: {
                    0: { cellWidth: 24 }, 1: { cellWidth: 55 }, 2: { cellWidth: 34 },
                    3: { cellWidth: 22 }, 4: { halign: 'right', cellWidth: 35 }
                },
                didParseCell: function (data) {
                    if (data.section === 'body' && data.column.index === 3) {
                        data.cell.styles.textColor = data.cell.raw === 'income' ? green : red;
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }));
            cursorY = doc.lastAutoTable.finalY + 8;
        }

        /* ═══════════════════════════════════════════
           FOOTER on every page
           ═══════════════════════════════════════════ */
        var totalPages = doc.internal.getNumberOfPages();
        for (var p = 1; p <= totalPages; p++) {
            doc.setPage(p);

            drawPageHeader(p);

            doc.setFillColor(241, 245, 249);
            doc.rect(0, pageH - 12, pageW, 12, 'F');
            doc.setFontSize(7);
            doc.setTextColor.apply(doc, textMuted);
            doc.setFont('helvetica', 'normal');
            doc.text('Finyx  |  Confidential  |  ' + periodLabel, mL, pageH - 5);
            doc.text('Page ' + p + ' of ' + totalPages, pageW - mR, pageH - 5, { align: 'right' });
        }

        /* Save */
        var fileSuffix = exportType === 'yearly'
            ? exportYear
            : exportYear + '-' + (exportMonth < 10 ? '0' : '') + exportMonth;
        doc.save('finyx-report-' + fileSuffix + '.pdf');

        /* Cleanup chart */
        if (chartInstance) { chartInstance.destroy(); }

        return true;
    });
}

