/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Print Label UI Suitelet with PO Search
 */
define(['N/ui/serverWidget', 'N/record', 'N/search', 'N/log', 'N/url', 'N/runtime', 'N/render'],
    function(serverWidget, record, search, log, url, runtime, render) {

        function validateSerialNumbers(serialNumbers) {
            if (!serialNumbers) return { valid: [], invalid: [], details: {} };

            const cleanedSerials = serialNumbers
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .split('\n')
                .map(sn => sn.trim())
                .filter(sn => sn !== '');

            if (cleanedSerials.length === 0) return { valid: [], invalid: [], details: {} };

            const filterExpression = [];
            cleanedSerials.forEach((serial, index) => {
                if (index > 0) filterExpression.push('OR');
                filterExpression.push(['inventorynumber', 'is', serial]);
            });

            const foundSerials = {};

            try {
                search.create({
                    type: 'inventorynumber',
                    filters: filterExpression,
                    columns: ['inventorynumber']
                }).run().each(result => {
                    const sn = result.getValue('inventorynumber');
                    foundSerials[sn] = true;
                    return true;
                });
            } catch (e) {
                log.error('Search Error', e.message);
            }

            const valid = [];
            const invalid = [];

            cleanedSerials.forEach(serial => {
                if (foundSerials[serial]) {
                    valid.push(serial);
                } else {
                    invalid.push(serial);
                }
            });

            return { valid, invalid };
        }

        function searchPOReceipts(poNumber) {
            if (!poNumber) return { found: false, items: [], poId: null };

            const results = {
                found: false,
                items: [],
                poId: null,
                poTranId: poNumber
            };

            try {
                const poSearch = search.create({
                    type: 'purchaseorder',
                    filters: [
                        ['tranid', 'is', poNumber],
                        'AND',
                        ['mainline', 'is', 'T']
                    ],
                    columns: ['internalid', 'tranid']
                });

                let poId = null;
                poSearch.run().each(function(result) {
                    poId = result.getValue('internalid');
                    results.poTranId = result.getValue('tranid');
                    return false;
                });

                if (!poId) return results;

                results.poId = poId;
                results.found = true;

                const itemReceiptSearch = search.create({
                    type: 'itemreceipt',
                    filters: [
                        ['type', 'anyof', 'ItemRcpt'],
                        'AND',
                        ['createdfrom.type', 'anyof', 'PurchOrd'],
                        'AND',
                        ['createdfrom.internalid', 'anyof', poId],
                        'AND',
                        ['mainline', 'is', 'F'],
                        'AND',
                        ['shipping', 'is', 'F'],
                        'AND',
                        ['taxline', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'tranid' }),
                        search.createColumn({ name: 'item' }),
                        search.createColumn({ name: 'quantity' }),
                        search.createColumn({ name: 'inventorynumber', join: 'itemNumber' })
                    ]
                });

                const itemMap = {};

                itemReceiptSearch.run().each(function(result) {
                    const itemId = result.getValue('item');
                    const itemText = result.getText('item');
                    const serialNumber = result.getValue({ name: 'inventorynumber', join: 'itemNumber' });
                    const receiptId = result.getValue('internalid');
                    const receiptNumber = result.getValue('tranid');
                    const quantity = result.getValue('quantity');

                    const key = itemId + '_' + receiptId;

                    if (!itemMap[key]) {
                        itemMap[key] = {
                            itemId: itemId,
                            itemText: itemText,
                            receiptId: receiptId,
                            receiptNumber: receiptNumber,
                            quantity: quantity,
                            serialNumbers: []
                        };
                    }

                    if (serialNumber) {
                        itemMap[key].serialNumbers.push(serialNumber);
                    }

                    return true;
                });

                results.items = Object.values(itemMap);

            } catch (e) {
                log.error('PO Search Error', e.message);
            }

            return results;
        }

        function escapeXml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        function generateLabelsPdf(labelData) {
            const itemName = escapeXml(labelData.itemText || labelData.item);
            const description = escapeXml(labelData.description);
            const recordId = labelData.recordId || '';

            let bodyContent = '';

            if (labelData.serialNumbers && labelData.serialNumbers.length > 0) {
                labelData.serialNumbers.forEach(serialNumber => {
                    const escapedSerial = escapeXml(serialNumber);
                    bodyContent += `
                    <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">
                        <table align="right" width="98%" height="50%">
                            <tr height="12%">
                                <td align="center">
                                    <table width="100%">
                                        <tr>
                                            <td style="font-size:18px;">${itemName}</td>
                                            <td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">${recordId}</td></tr></table></td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <tr height="25%">
                                <td align="center"><table width="100%"><tr><td style="font-size:11px;">${description}</td></tr></table></td>
                            </tr>
                        </table>
                        <table align="left" width="100%" height="50%" v-align="bottom">
                            <tr height="60px">
                                <td height="60px" align="left" style="font-size:10px;">
                                    <barcode height="60px" width="240px" codetype="code128" showtext="true" value="${escapedSerial}"/>
                                </td>
                            </tr>
                            <tr>
                                <td align="left" style="font-size:25px;">
                                    <barcode height="60px" width="220px" codetype="code128" showtext="true" value="${itemName}"/>
                                </td>
                            </tr>
                        </table>
                    </body>`;
                });
            } else {
                bodyContent += `
                <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">
                    <table align="right" width="98%" height="50%">
                        <tr height="12%">
                            <td align="center">
                                <table width="100%">
                                    <tr>
                                        <td style="font-size:18px;">${itemName}</td>
                                        <td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">${recordId}</td></tr></table></td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr height="25%">
                            <td align="center"><table width="100%"><tr><td style="font-size:11px;">${description}</td></tr></table></td>
                        </tr>
                    </table>
                    <table align="left" width="100%" height="50%" v-align="bottom">
                        <tr>
                            <td align="left" style="font-size:25px;">
                                <barcode height="60px" width="220px" codetype="code128" showtext="true" value="${itemName}"/>
                            </td>
                        </tr>
                    </table>
                </body>`;
            }

            const xml = `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
    <head>
        <style>th { background-color: #3c8dbc; color: white; } body { font-family: Helvetica; }</style>
    </head>
    ${bodyContent}
</pdf>`;

            return render.xmlToPdf({ xmlString: xml });
        }

        function escapeForJs(str) {
            if (!str) return '';
            return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        }

        function getStyles() {
            return `
            <style>
                /* Hide NetSuite chrome */
                #main_form { background-color: #f4f7f9 !important; }
                .uir-page-title, .uir-page-title-firstline, .uir-page-title-secondline,
                .uir-header-buttons, .uir-button-bar { display: none !important; }

                * { box-sizing: border-box; }

                .app-container {
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    max-width: 700px;
                    margin: 40px auto;
                    padding: 0 20px;
                }

                .main-card {
                    background: #ffffff;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.08);
                    border: 1px solid #e1e8ed;
                    overflow: hidden;
                }

                .card-header {
                    background: #1e3c72;
                    color: white;
                    padding: 28px 32px;
                    text-align: center;
                }
                .card-header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                .card-header p { margin: 10px 0 0; opacity: 0.8; font-size: 15px; }

                .form-body { padding: 32px; }

                .input-group { margin-bottom: 28px; }
                .input-row { display: flex; gap: 12px; align-items: flex-end; }
                .flex-grow { flex-grow: 1; }

                .custom-label {
                    display: block;
                    font-weight: 600;
                    color: #475569;
                    margin-bottom: 10px;
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                /* Override NetSuite Field Styles */
                .input-group input[type="text"],
                .input-group select,
                .input-group textarea {
                    width: 100% !important;
                    padding: 18px 20px !important;
                    border: 2px solid #e2e8f0 !important;
                    border-radius: 12px !important;
                    font-size: 18px !important;
                    background: #f8fafc !important;
                    transition: all 0.2s !important;
                    box-sizing: border-box !important;
                    color: #1e293b !important;
                }
                .input-group select {
                    height: 65px !important;
                    cursor: pointer;
                }
                .input-group textarea {
                    min-height: 200px !important;
                    resize: vertical;
                    line-height: 1.6 !important;
                }
                .input-group input:focus, .input-group select:focus, .input-group textarea:focus {
                    border-color: #1e3c72 !important;
                    background: #fff !important;
                    outline: none !important;
                    box-shadow: 0 0 0 4px rgba(30, 60, 114, 0.1) !important;
                }

                .btn-area {
                    display: flex;
                    gap: 12px;
                    margin-top: 10px;
                    padding-top: 24px;
                    border-top: 1px solid #f1f5f9;
                }

                .custom-btn {
                    padding: 16px 28px;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    font-size: 15px;
                    transition: all 0.2s;
                }
                .btn-primary { background: #1e3c72; color: white; }
                .btn-primary:hover { background: #2a5298; transform: translateY(-1px); }

                .btn-success { background: #10b981; color: white; flex: 1; }
                .btn-success:hover { background: #059669; transform: translateY(-1px); }

                .btn-outline { background: #fff; color: #64748b; border: 2px solid #e2e8f0; }
                .btn-outline:hover { background: #f8fafc; border-color: #cbd5e1; }

                .badge-count {
                    background: #1e3c72;
                    color: #fff;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-left: 10px;
                }

                .alert {
                    padding: 16px 20px;
                    border-radius: 12px;
                    margin-bottom: 24px;
                    font-size: 15px;
                    font-weight: 500;
                }
                .alert-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
                .alert-warning { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
                .alert-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

                /* Results Table */
                .results-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                .results-table th {
                    background: #f8fafc;
                    padding: 14px 16px;
                    text-align: left;
                    font-size: 12px;
                    font-weight: 700;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid #e2e8f0;
                }
                .results-table td {
                    padding: 16px;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 15px;
                    color: #334155;
                }
                .results-table tr:hover td { background: #f8fafc; }
                .results-table input[type="checkbox"] {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    accent-color: #1e3c72;
                }

                .badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                }
                .badge-success { background: #10b981; color: #fff; }
                .badge-muted { background: #e2e8f0; color: #64748b; }

                /* Success Page */
                .success-icon { font-size: 60px; color: #10b981; margin-bottom: 16px; }
                .success-card { text-align: center; padding: 48px 32px; }
                .success-card h2 { margin: 0 0 8px; font-size: 26px; color: #1e293b; }
                .success-card p { color: #64748b; margin-bottom: 32px; font-size: 16px; }

                .serial-list {
                    list-style: none;
                    padding: 0;
                    margin: 24px 0;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                    gap: 8px;
                    text-align: left;
                }
                .serial-list li {
                    font-family: 'SF Mono', Monaco, monospace;
                    font-size: 13px;
                    padding: 10px 14px;
                    background: #f8fafc;
                    border-radius: 8px;
                    color: #475569;
                    border: 1px solid #e2e8f0;
                }
            </style>
            `;
        }

        function getEntryFormScript() {
            return `
                <script>
                    // Disable "Leave page?" warning
                    window.onbeforeunload = null;
                    if (typeof setWindowChanged === 'function') setWindowChanged(window, false);

                    function updateCount() {
                        var field = document.getElementById('custpage_serial_numbers');
                        var display = document.getElementById('serial_count');
                        if (!field || !display) return;
                        var lines = field.value.split(/[\\r\\n]+/).filter(function(s) { return s.trim() !== ''; });
                        display.textContent = lines.length;
                    }

                    function searchPO() {
                        var po = document.getElementById('custpage_po_number');
                        if (!po || !po.value.trim()) { alert('Enter a PO number'); return; }
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'search_po';
                        form.appendChild(action);
                        form.submit();
                    }

                    function createLabels() {
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'create_labels';
                        form.appendChild(action);
                        form.submit();
                    }

                    function reprintLabels() {
                        var reprintId = document.getElementById('custpage_reprint_id');
                        if (!reprintId || !reprintId.value.trim()) { alert('Enter a Print Label record ID'); return; }
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'reprint';
                        form.appendChild(action);
                        form.submit();
                    }

                    function clearForm() {
                        var item = document.getElementById('custpage_item');
                        var serial = document.getElementById('custpage_serial_numbers');
                        var po = document.getElementById('custpage_po_number');
                        var reprintId = document.getElementById('custpage_reprint_id');
                        if (item) item.selectedIndex = 0;
                        if (serial) serial.value = '';
                        if (po) po.value = '';
                        if (reprintId) reprintId.value = '';
                        updateCount();
                    }

                    document.addEventListener('DOMContentLoaded', function() {
                        // Disable NS change tracking
                        window.onbeforeunload = null;
                        if (typeof NS !== 'undefined' && NS.form) NS.form.setChanged(false);

                        updateCount();
                        var field = document.getElementById('custpage_serial_numbers');
                        if (field) {
                            field.addEventListener('input', updateCount);
                            field.addEventListener('paste', function() { setTimeout(updateCount, 50); });
                        }
                    });
                </script>
            `;
        }

        function getPOResultsScript(suiteletUrl) {
            return `
                <script>
                    function toggleAll(cb) {
                        var boxes = document.querySelectorAll('input[name="custpage_select_item"]');
                        for (var i = 0; i < boxes.length; i++) boxes[i].checked = cb.checked;
                        updateSelected();
                    }

                    function updateSelected() {
                        var boxes = document.querySelectorAll('input[name="custpage_select_item"]:checked');
                        var display = document.getElementById('selected_count');
                        if (display) display.textContent = boxes.length;
                    }

                    function printSelected() {
                        var boxes = document.querySelectorAll('input[name="custpage_select_item"]:checked');
                        if (boxes.length === 0) { alert('Select at least one item'); return; }
                        var form = document.forms[0];
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'print_selected';
                        form.appendChild(action);
                        form.submit();
                    }

                    function goBack() { window.location.href = '${suiteletUrl}'; }

                    document.addEventListener('DOMContentLoaded', function() {
                        var boxes = document.querySelectorAll('input[name="custpage_select_item"]');
                        for (var i = 0; i < boxes.length; i++) boxes[i].addEventListener('change', updateSelected);
                        updateSelected();
                    });
                </script>
            `;
        }

        function getSuccessPageScript(suiteletUrl, pdfUrl) {
            return `
                <script>
                    function printLabels() { window.open('${escapeForJs(pdfUrl)}', '_blank'); }
                    function createAnother() { window.location.href = '${escapeForJs(suiteletUrl)}'; }
                </script>
            `;
        }

        function createEntryForm(context, message, messageType, prefill) {
            const form = serverWidget.createForm({ title: 'Print Labels' });

            // Styles and Scripts
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getEntryFormScript();

            // Message
            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'alert-success' : messageType === 'warning' ? 'alert-warning' : 'alert-error';
                msgHtml = `<div class="alert ${cls}">${message}</div>`;
            }

            // Container Start with placeholders
            const containerStart = form.addField({ id: 'custpage_container_start', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerStart.defaultValue = `
                <div class="app-container">
                    ${msgHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>Print Labels</h1>
                            <p>Search by PO or manually select a part number</p>
                        </div>
                        <div class="form-body">
                            <div class="input-group">
                                <label class="custom-label">PO Number</label>
                                <div class="input-row">
                                    <div class="flex-grow" id="po-field-wrap"></div>
                                    <button type="button" class="custom-btn btn-primary" onclick="searchPO()">Search</button>
                                </div>
                            </div>
                            <div class="input-group">
                                <label class="custom-label">Part Number</label>
                                <div id="item-field-wrap"></div>
                            </div>
                            <div class="input-group">
                                <label class="custom-label">Serial Numbers <span class="badge-count"><span id="serial_count">0</span> labels</span></label>
                                <div id="serial-field-wrap"></div>
                            </div>
                            <div class="btn-area">
                                <button type="button" class="custom-btn btn-success" onclick="createLabels()">Generate Labels</button>
                                <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                            </div>

                            <div style="border-top: 2px solid #e2e8f0; margin-top: 28px; padding-top: 24px;">
                                <label class="custom-label">Reprint Labels</label>
                                <p style="color:#64748b; font-size:13px; margin-bottom:12px;">Enter an existing Print Label record ID to reprint</p>
                                <div class="input-row">
                                    <div class="flex-grow" id="reprint-field-wrap"></div>
                                    <button type="button" class="custom-btn btn-primary" onclick="reprintLabels()">Reprint</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="display:none;">
            `;

            // NetSuite Fields (will be moved via JS)
            const poField = form.addField({ id: 'custpage_po_number', type: serverWidget.FieldType.TEXT, label: 'PO Number' });
            if (prefill && prefill.poNumber) poField.defaultValue = prefill.poNumber;

            const itemField = form.addField({ id: 'custpage_item', type: serverWidget.FieldType.SELECT, label: 'Part Number', source: 'item' });
            if (prefill && prefill.item) itemField.defaultValue = prefill.item;

            const serialField = form.addField({ id: 'custpage_serial_numbers', type: serverWidget.FieldType.TEXTAREA, label: 'Serials' });
            serialField.updateDisplaySize({ height: 8, width: 60 });
            if (prefill && prefill.serialNumbers) serialField.defaultValue = prefill.serialNumbers;

            const reprintField = form.addField({ id: 'custpage_reprint_id', type: serverWidget.FieldType.TEXT, label: 'Reprint Record ID' });

            // Container End + Field mover script
            const containerEnd = form.addField({ id: 'custpage_container_end', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerEnd.defaultValue = `</div>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    // Move NS fields into our layout (need to move parent container)
                    var poWrap = document.getElementById('po-field-wrap');
                    var itemWrap = document.getElementById('item-field-wrap');
                    var serialWrap = document.getElementById('serial-field-wrap');
                    var reprintWrap = document.getElementById('reprint-field-wrap');

                    var poLabel = document.getElementById('custpage_po_number_fs_lbl_uir_label');
                    var itemLabel = document.getElementById('custpage_item_fs_lbl_uir_label');
                    var serialLabel = document.getElementById('custpage_serial_numbers_fs_lbl_uir_label');
                    var reprintLabel = document.getElementById('custpage_reprint_id_fs_lbl_uir_label');

                    if (poWrap && poLabel) poWrap.appendChild(poLabel.parentNode);
                    if (itemWrap && itemLabel) itemWrap.appendChild(itemLabel.parentNode);
                    if (serialWrap && serialLabel) serialWrap.appendChild(serialLabel.parentNode);
                    if (reprintWrap && reprintLabel) reprintWrap.appendChild(reprintLabel.parentNode);

                    updateCount();
                });
            </script>`;

            context.response.writePage(form);
        }

        function createPOResultsPage(context, poResults, message, messageType) {
            const form = serverWidget.createForm({ title: 'PO Results' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId
            });

            // Styles
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getPOResultsScript(suiteletUrl);

            // Build table rows
            let rows = '';
            poResults.items.forEach((item, idx) => {
                const cnt = item.serialNumbers.length;
                const badge = cnt > 0
                    ? `<span class="badge badge-success">${cnt}</span>`
                    : `<span class="badge badge-muted">0</span>`;
                rows += `<tr>
                    <td><input type="checkbox" name="custpage_select_item" value="${idx}" /></td>
                    <td><strong>${escapeXml(item.itemText)}</strong></td>
                    <td>${escapeXml(item.receiptNumber)}</td>
                    <td>${item.quantity}</td>
                    <td>${badge}</td>
                </tr>`;
            });

            // Message
            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'alert-success' : messageType === 'warning' ? 'alert-warning' : 'alert-error';
                msgHtml = `<div class="alert ${cls}">${message}</div>`;
            }

            // Content
            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container" style="max-width: 900px;">
                    ${msgHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>PO: ${escapeXml(poResults.poTranId)}</h1>
                            <p>Select items to print labels</p>
                        </div>
                        <div class="form-body">
                            <table class="results-table">
                                <thead>
                                    <tr>
                                        <th style="width:50px;"><input type="checkbox" onclick="toggleAll(this)" /></th>
                                        <th>Item</th>
                                        <th>Receipt #</th>
                                        <th>Qty</th>
                                        <th>Serials</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                            <div style="background:#f8fafc; padding:16px 20px; border-radius:12px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
                                <span style="color:#64748b; font-weight:500;">Selected Items</span>
                                <span style="font-size:28px; font-weight:700; color:#1e3c72;" id="selected_count">0</span>
                            </div>
                            <div class="btn-area" style="border-top:none; padding-top:0;">
                                <button type="button" class="custom-btn btn-success" onclick="printSelected()">Print Labels</button>
                                <button type="button" class="custom-btn btn-outline" onclick="goBack()">Back</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Hidden data
            const dataField = form.addField({ id: 'custpage_po_data', type: serverWidget.FieldType.LONGTEXT, label: 'Data' });
            dataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            dataField.defaultValue = JSON.stringify(poResults);

            context.response.writePage(form);
        }

        function createSuccessPage(context, recordId, labelData) {
            const form = serverWidget.createForm({ title: 'Labels Created' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true
            });

            const serialsParam = (labelData.serialNumbers || []).join('\n');
            const printUrl = suiteletUrl +
                '&ajax_action=printpage' +
                '&record_id=' + encodeURIComponent(recordId) +
                '&item_text=' + encodeURIComponent(labelData.itemText || '') +
                '&description=' + encodeURIComponent(labelData.description || '') +
                '&serials=' + encodeURIComponent(serialsParam);

            // Styles
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl, printUrl);

            const hasSerials = labelData.serialNumbers && labelData.serialNumbers.length > 0;
            const count = hasSerials ? labelData.serialNumbers.length : 1;
            const serialList = hasSerials ? labelData.serialNumbers.map(s => `<li>${escapeXml(s)}</li>`).join('') : '';

            // Content
            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    <div class="main-card">
                        <div class="success-card">
                            <div class="success-icon">✓</div>
                            <h2>Labels Ready</h2>
                            <p>Record #${recordId} • ${count} label${count !== 1 ? 's' : ''} created</p>

                            <div style="background:#f8fafc; border-radius:12px; padding:20px; margin:24px 0; text-align:center;">
                                <div style="font-size:24px; font-weight:700; color:#1e3c72;">${escapeXml(labelData.itemText)}</div>
                            </div>

                            ${hasSerials ? `<ul class="serial-list">${serialList}</ul>` : ''}

                            <button type="button" class="custom-btn btn-success" style="width:100%; margin-bottom:12px;" onclick="printLabels()">Print Labels</button>
                            <button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Create More</button>
                        </div>
                    </div>
                </div>
            `;

            context.response.writePage(form);
        }

        function handlePrintPdf(context) {
            const recordId = context.request.parameters.record_id;
            const itemText = context.request.parameters.item_text || '';
            const description = context.request.parameters.description || '';
            const serialsRaw = context.request.parameters.serials || '';

            if (!recordId) {
                context.response.write('Error: No record ID');
                return;
            }

            try {
                const serialNumbers = serialsRaw.split('\n').map(s => s.trim()).filter(s => s !== '');
                const pdfFile = generateLabelsPdf({ itemText, description, serialNumbers, recordId });

                context.response.setHeader({ name: 'Content-Type', value: 'application/pdf' });
                context.response.setHeader({ name: 'Content-Disposition', value: 'inline; filename="Labels_' + recordId + '.pdf"' });
                context.response.write(pdfFile.getContents());
            } catch (e) {
                log.error('PDF Error', e.message);
                context.response.write('Error: ' + e.message);
            }
        }

        function handlePrintPage(context) {
            const recordId = context.request.parameters.record_id || '';
            const itemText = context.request.parameters.item_text || '';
            const description = context.request.parameters.description || '';
            const serials = context.request.parameters.serials || '';

            const pdfUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true,
                params: { ajax_action: 'printpdf', record_id: recordId, item_text: itemText, description: description, serials: serials }
            });

            const html = `<!DOCTYPE html>
<html><head><title>Print Labels</title>
<style>* { margin: 0; padding: 0; } html, body, iframe { width: 100%; height: 100%; border: none; }</style>
</head><body>
<iframe id="pdf" src="${escapeXml(pdfUrl)}"></iframe>
<script>
var printed = false;
function doPrint() { if (printed) return; printed = true; try { document.getElementById('pdf').contentWindow.print(); } catch(e) { window.print(); } }
document.getElementById('pdf').onload = function() { setTimeout(doPrint, 500); };
setTimeout(doPrint, 2000);
</script>
</body></html>`;

            context.response.setHeader({ name: 'Content-Type', value: 'text/html' });
            context.response.write(html);
        }

        function handlePOSearch(context) {
            const poNumber = context.request.parameters.custpage_po_number;

            if (!poNumber || !poNumber.trim()) {
                createEntryForm(context, 'Enter a PO number', 'warning');
                return;
            }

            const poResults = searchPOReceipts(poNumber.trim());

            if (!poResults.found) {
                createEntryForm(context, 'PO not found: ' + escapeXml(poNumber), 'error', { poNumber });
                return;
            }

            if (poResults.items.length === 0) {
                createEntryForm(context, 'No receipts found for PO: ' + escapeXml(poNumber), 'warning', { poNumber });
                return;
            }

            createPOResultsPage(context, poResults);
        }

        function handlePrintSelected(context) {
            const poDataRaw = context.request.parameters.custpage_po_data;
            const selectedItems = context.request.parameters.custpage_select_item;

            if (!poDataRaw) {
                createEntryForm(context, 'Error: PO data not found', 'error');
                return;
            }

            let poResults;
            try {
                poResults = JSON.parse(poDataRaw);
            } catch (e) {
                createEntryForm(context, 'Error: Invalid data', 'error');
                return;
            }

            let selectedIndexes = [];
            if (Array.isArray(selectedItems)) {
                selectedIndexes = selectedItems.map(i => parseInt(i, 10));
            } else if (selectedItems) {
                selectedIndexes = [parseInt(selectedItems, 10)];
            }

            if (selectedIndexes.length === 0) {
                createPOResultsPage(context, poResults, 'Select at least one item', 'warning');
                return;
            }

            const allSerials = [];
            let firstItem = null;

            selectedIndexes.forEach(index => {
                if (poResults.items[index]) {
                    const item = poResults.items[index];
                    if (!firstItem) firstItem = item;
                    allSerials.push(...item.serialNumbers);
                }
            });

            if (allSerials.length === 0) {
                createPOResultsPage(context, poResults, 'Selected items have no serial numbers', 'warning');
                return;
            }

            let itemText = firstItem.itemText;
            let description = '';

            if (firstItem.itemId) {
                try {
                    const lookup = search.lookupFields({
                        type: search.Type.ITEM,
                        id: firstItem.itemId,
                        columns: ['itemid', 'displayname', 'salesdescription']
                    });
                    itemText = lookup.displayname || lookup.itemid || firstItem.itemText;
                    description = lookup.salesdescription || '';
                } catch (e) {
                    log.debug('Item lookup failed', e.message);
                }
            }

            try {
                const rec = record.create({ type: 'customrecord_print_label', isDynamic: true });
                rec.setValue({ fieldId: 'custrecord_pl_item_number', value: firstItem.itemId });
                rec.setValue({ fieldId: 'custrecord_express_entry', value: allSerials.join('<br>') });

                const recordId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });

                log.audit('Print Label Created', 'ID: ' + recordId + ', PO: ' + poResults.poTranId + ', Labels: ' + allSerials.length);

                createSuccessPage(context, recordId, {
                    item: firstItem.itemId,
                    itemText: itemText,
                    description: description,
                    serialNumbers: allSerials
                });

            } catch (e) {
                log.error('Error creating record', e.message);
                createPOResultsPage(context, poResults, 'Error: ' + e.message, 'error');
            }
        }

        function handleCreateLabels(context) {
            const item = context.request.parameters.custpage_item;
            const serialNumbers = context.request.parameters.custpage_serial_numbers || '';
            const poNumber = context.request.parameters.custpage_po_number || '';

            if (!item) {
                createEntryForm(context, 'Select a part number', 'error', { item, serialNumbers, poNumber });
                return;
            }

            let validSerials = [];
            if (serialNumbers.trim()) {
                const result = validateSerialNumbers(serialNumbers);
                if (result.invalid.length > 0) {
                    createEntryForm(context, 'Invalid serials: ' + result.invalid.join(', '), 'error', { item, serialNumbers, poNumber });
                    return;
                }
                validSerials = result.valid;
            }

            let itemText = '';
            let description = '';
            try {
                const lookup = search.lookupFields({
                    type: search.Type.ITEM,
                    id: item,
                    columns: ['itemid', 'displayname', 'salesdescription']
                });
                itemText = lookup.displayname || lookup.itemid || item;
                description = lookup.salesdescription || '';
            } catch (e) {
                itemText = item;
            }

            const rec = record.create({ type: 'customrecord_print_label', isDynamic: true });
            rec.setValue({ fieldId: 'custrecord_pl_item_number', value: item });
            rec.setValue({ fieldId: 'custrecord_express_entry', value: validSerials.join('<br>') });

            const recordId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });

            log.audit('Print Label Created', 'ID: ' + recordId + ', Labels: ' + (validSerials.length || 1));

            createSuccessPage(context, recordId, { item, itemText, description, serialNumbers: validSerials });
        }

        function handleReprint(context) {
            const reprintId = context.request.parameters.custpage_reprint_id;

            if (!reprintId || !reprintId.trim()) {
                createEntryForm(context, 'Enter a Print Label record ID', 'warning');
                return;
            }

            try {
                const rec = record.load({ type: 'customrecord_print_label', id: reprintId.trim() });
                const itemId = rec.getValue({ fieldId: 'custrecord_pl_item_number' });
                const serialsRaw = rec.getValue({ fieldId: 'custrecord_express_entry' }) || '';

                const serialNumbers = serialsRaw
                    .replace(/<br\s*\/?>/gi, '\n')
                    .split('\n')
                    .map(s => s.trim())
                    .filter(s => s !== '');

                let itemText = '';
                let description = '';

                if (itemId) {
                    try {
                        const lookup = search.lookupFields({
                            type: search.Type.ITEM,
                            id: itemId,
                            columns: ['itemid', 'displayname', 'salesdescription']
                        });
                        itemText = lookup.displayname || lookup.itemid || '';
                        description = lookup.salesdescription || '';
                    } catch (e) {
                        log.debug('Item lookup failed on reprint', e.message);
                    }
                }

                log.audit('Reprint Labels', 'Record ID: ' + reprintId + ', Labels: ' + (serialNumbers.length || 1));

                createSuccessPage(context, reprintId.trim(), {
                    item: itemId,
                    itemText: itemText,
                    description: description,
                    serialNumbers: serialNumbers
                });

            } catch (e) {
                log.error('Reprint Error', e.message);
                createEntryForm(context, 'Could not load record #' + escapeXml(reprintId) + ': ' + e.message, 'error');
            }
        }

        function onRequest(context) {
            try {
                if (context.request.method === 'GET') {
                    const ajaxAction = context.request.parameters.ajax_action;

                    if (ajaxAction === 'validate') {
                        const result = validateSerialNumbers(context.request.parameters.serials);
                        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                        context.response.write(JSON.stringify(result));
                        return;
                    }

                    if (ajaxAction === 'printpdf') {
                        handlePrintPdf(context);
                        return;
                    }

                    if (ajaxAction === 'printpage') {
                        handlePrintPage(context);
                        return;
                    }

                    createEntryForm(context);

                } else {
                    const action = context.request.parameters.custpage_action;

                    if (action === 'search_po') {
                        handlePOSearch(context);
                        return;
                    }

                    if (action === 'print_selected') {
                        handlePrintSelected(context);
                        return;
                    }

                    if (action === 'create_labels') {
                        handleCreateLabels(context);
                        return;
                    }

                    if (action === 'reprint') {
                        handleReprint(context);
                        return;
                    }

                    // Fallback - check if PO entered without item
                    const poNumber = context.request.parameters.custpage_po_number || '';
                    const item = context.request.parameters.custpage_item;

                    if (poNumber && !item) {
                        handlePOSearch(context);
                    } else {
                        handleCreateLabels(context);
                    }
                }
            } catch (e) {
                log.error('Suitelet Error', e.message + ' | ' + e.stack);
                createEntryForm(context, 'Error: ' + e.message, 'error');
            }
        }

        return { onRequest };
    });
