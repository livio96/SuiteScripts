/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Condition Change Suitelet
 * - Scan serial numbers to look up item, bin, and location
 * - Change item condition to Like New (-LN) via inventory adjustment
 * - Print labels for adjusted items
 */
define(['N/ui/serverWidget', 'N/record', 'N/search', 'N/log', 'N/url', 'N/runtime', 'N/render'],
    function(serverWidget, record, search, log, url, runtime, render) {

        // ====================================================================
        // CONFIGURATION
        // ====================================================================

        // GL account internal ID for inventory adjustments.
        // Find under: Lists > Accounting > Accounts (type: Inventory Adjustment or expense account)
        const ADJUSTMENT_ACCOUNT_ID = '154';

        // Bin internal ID used when "Change to Like New & Back to Stock" is selected
        const BACK_TO_STOCK_BIN_ID = 3555;

        // Inventory status internal ID for "Back to Stock" (1 = typically default/good status)
        const BACK_TO_STOCK_STATUS_ID = 1;

        // ====================================================================
        // UTILITY FUNCTIONS
        // ====================================================================

        function escapeXml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        function escapeForJs(str) {
            if (!str) return '';
            return String(str)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
        }

        function cleanSerialInput(input) {
            if (!input) return [];
            return input
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .split('\n')
                .map(s => s.trim())
                .filter(s => s !== '');
        }

        /**
         * Derive the Like New item name from the current item name.
         * Strips the suffix after the last '-' and replaces with 'LN'.
         * If no '-' exists, appends '-LN'.
         *
         * ABC-N    → ABC-LN
         * PART-123-N → PART-123-LN
         * GADGET   → GADGET-LN
         */
        function getLikeNewItemName(itemName) {
            if (!itemName) return '';
            const lastDash = itemName.lastIndexOf('-');
            if (lastDash >= 0) {
                return itemName.substring(0, lastDash) + '-LN';
            }
            return itemName + '-LN';
        }

        // ====================================================================
        // NETSUITE LOOKUPS
        // ====================================================================

        /**
         * Search for an item by its itemid (SKU).
         * Returns { id, itemid, displayname, description } or null.
         */
        function findItemByName(itemName) {
            let result = null;
            try {
                search.create({
                    type: search.Type.ITEM,
                    filters: [['itemid', 'is', itemName]],
                    columns: ['internalid', 'itemid', 'displayname', 'salesdescription']
                }).run().each(function(r) {
                    result = {
                        id: r.getValue('internalid'),
                        itemid: r.getValue('itemid'),
                        displayname: r.getValue('displayname') || r.getValue('itemid'),
                        description: r.getValue('salesdescription') || ''
                    };
                    return false;
                });
            } catch (e) {
                log.error('findItemByName Error', e.message);
            }
            return result;
        }

        /**
         * Look up item details by internal ID.
         */
        function getItemDetails(itemId) {
            try {
                const lookup = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['itemid', 'displayname', 'salesdescription']
                });
                return {
                    itemid: lookup.itemid || '',
                    displayname: lookup.displayname || lookup.itemid || '',
                    description: lookup.salesdescription || ''
                };
            } catch (e) {
                log.error('getItemDetails Error', e.message);
                return null;
            }
        }

        /**
         * Look up serial numbers and return item, location, and bin details.
         * Two-phase approach:
         *   Phase 1 – find serials and their items using direct inventorynumber columns
         *   Phase 2 – enrich with bin/location via inventoryNumberBinOnHand join (best-effort)
         * Returns { valid: [...], invalid: [...] }
         */
        function lookupSerialDetails(serialTexts) {
            if (!serialTexts || serialTexts.length === 0) {
                return { valid: [], invalid: [] };
            }

            const filterExpression = [];
            serialTexts.forEach((serial, index) => {
                if (index > 0) filterExpression.push('OR');
                filterExpression.push(['inventorynumber', 'is', serial]);
            });

            const foundSerials = {};

            // --- Phase 1: Basic lookup (no join) ---
            try {
                search.create({
                    type: 'inventorynumber',
                    filters: filterExpression,
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'inventorynumber' }),
                        search.createColumn({ name: 'item' }),
                        search.createColumn({ name: 'location' }),
                        search.createColumn({ name: 'quantityonhand' }),
                        search.createColumn({ name: 'quantityavailable' })
                    ]
                }).run().each(result => {
                    const serial = result.getValue('inventorynumber');
                    if (!foundSerials[serial]) {
                        foundSerials[serial] = {
                            serialNumber: serial,
                            serialId: result.getValue('internalid'),
                            itemId: result.getValue('item'),
                            itemText: result.getText('item'),
                            locationId: result.getValue('location'),
                            locationText: result.getText('location') || '',
                            binId: '',
                            binText: '',
                            statusId: '',
                            statusText: '',
                            quantityOnHand: parseFloat(result.getValue('quantityonhand')) || 0
                        };
                    }
                    return true;
                });
            } catch (e) {
                log.error('lookupSerialDetails Phase1 Error', e.message);
            }

            // --- Phase 2: Enrich with bin info (best-effort) ---
            try {
                search.create({
                    type: 'inventorynumber',
                    filters: filterExpression,
                    columns: [
                        search.createColumn({ name: 'inventorynumber' }),
                        search.createColumn({ name: 'location', join: 'inventoryNumberBinOnHand' }),
                        search.createColumn({ name: 'binnumber', join: 'inventoryNumberBinOnHand' }),
                        search.createColumn({ name: 'quantityonhand', join: 'inventoryNumberBinOnHand' }),
                        search.createColumn({ name: 'status', join: 'inventoryNumberBinOnHand' })
                    ]
                }).run().each(result => {
                    const serial = result.getValue('inventorynumber');
                    const binQty = parseFloat(result.getValue({ name: 'quantityonhand', join: 'inventoryNumberBinOnHand' })) || 0;

                    if (binQty > 0 && foundSerials[serial]) {
                        const locId = result.getValue({ name: 'location', join: 'inventoryNumberBinOnHand' });
                        const locText = result.getText({ name: 'location', join: 'inventoryNumberBinOnHand' });
                        if (locId) {
                            foundSerials[serial].locationId = locId;
                            foundSerials[serial].locationText = locText || foundSerials[serial].locationText;
                        }
                        foundSerials[serial].binId = result.getValue({ name: 'binnumber', join: 'inventoryNumberBinOnHand' }) || '';
                        foundSerials[serial].binText = result.getText({ name: 'binnumber', join: 'inventoryNumberBinOnHand' }) || '';
                        foundSerials[serial].statusId = result.getValue({ name: 'status', join: 'inventoryNumberBinOnHand' }) || '';
                        foundSerials[serial].statusText = result.getText({ name: 'status', join: 'inventoryNumberBinOnHand' }) || '';
                    }
                    return true;
                });
            } catch (e) {
                // Bin join not available – Phase 1 data is still usable
                log.debug('lookupSerialDetails Phase2 (bin enrichment) skipped', e.message);
            }

            const valid = [];
            const invalid = [];

            serialTexts.forEach(serial => {
                if (foundSerials[serial]) {
                    valid.push(foundSerials[serial]);
                } else {
                    invalid.push(serial);
                }
            });

            return { valid, invalid };
        }

        // ====================================================================
        // LABEL PDF GENERATION
        // ====================================================================

        function generateLabelsPdf(labelData) {
            const itemName = escapeXml(labelData.itemText || '');
            const description = escapeXml(labelData.description || '');
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

        // ====================================================================
        // INVENTORY ADJUSTMENT
        // ====================================================================

        /**
         * Create inventory adjustment for condition change.
         *
         * @param {Array} groups - Grouped adjustment data:
         *   { sourceItemId, sourceItemName, targetItemId, targetItemName,
         *     locationId, action, serials: [{ serialNumber, serialId, binId }] }
         * @param {string} memo - Transaction memo
         * @returns {string} Adjustment record internal ID
         */
        function createConditionChangeAdjustment(groups, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            // Subsidiary must be set first — other fields depend on it
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });

            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Condition Change to Like New' });

            groups.forEach(group => {
                const serialCount = group.serials.length;

                // --- REMOVAL LINE: take serials out of source item ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.sourceItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -serialCount });

                const removeDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });

                group.serials.forEach(serial => {
                    removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    removeDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'issueinventorynumber',
                        value: serial.serialId
                    });
                    removeDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: -1
                    });
                    if (serial.binId) {
                        removeDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'binnumber',
                            value: serial.binId
                        });
                    }
                    removeDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                adjRecord.commitLine({ sublistId: 'inventory' });

                // --- ADDITION LINE: add serials under target -LN item ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.targetItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: serialCount });

                const addDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });

                group.serials.forEach(serial => {
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'receiptinventorynumber',
                        value: serial.serialNumber
                    });
                    addDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: 1
                    });

                    if (group.action === 'likenew_stock') {
                        addDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'binnumber',
                            value: BACK_TO_STOCK_BIN_ID
                        });
                        addDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'inventorystatus',
                            value: BACK_TO_STOCK_STATUS_ID
                        });
                    } else if (serial.binId) {
                        addDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'binnumber',
                            value: serial.binId
                        });
                    }

                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            // Look up the tranid (document number) for display purposes
            let tranId = String(adjId);
            try {
                const adjLookup = search.lookupFields({
                    type: search.Type.INVENTORY_ADJUSTMENT,
                    id: adjId,
                    columns: ['tranid']
                });
                tranId = adjLookup.tranid || String(adjId);
            } catch (e) {
                log.debug('Could not look up adjustment tranid', e.message);
            }

            return { adjId: adjId, tranId: tranId };
        }

        // ====================================================================
        // STYLES
        // ====================================================================

        function getStyles() {
            return `
            <style>
                #main_form { background-color: #f4f7f9 !important; }
                .uir-page-title, .uir-page-title-firstline, .uir-page-title-secondline,
                .uir-header-buttons, .uir-button-bar { display: none !important; }

                * { box-sizing: border-box; }

                .app-container {
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    max-width: 900px;
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

                .custom-label {
                    display: block;
                    font-weight: 600;
                    color: #475569;
                    margin-bottom: 10px;
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

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

                .action-select {
                    padding: 10px 14px;
                    border: 2px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    background: #f8fafc;
                    color: #1e293b;
                    cursor: pointer;
                    min-width: 200px;
                }
                .action-select:focus {
                    border-color: #1e3c72;
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(30, 60, 114, 0.1);
                }

                .badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                }
                .badge-success { background: #10b981; color: #fff; }
                .badge-info { background: #3b82f6; color: #fff; }
                .badge-muted { background: #e2e8f0; color: #64748b; }
                .badge-error { background: #ef4444; color: #fff; }

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

                .bulk-action-bar {
                    background: #f8fafc;
                    padding: 16px 20px;
                    border-radius: 12px;
                    margin-bottom: 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                }
                .bulk-action-bar label {
                    font-weight: 600;
                    color: #475569;
                    font-size: 14px;
                    white-space: nowrap;
                }

                .label-group {
                    background: #f8fafc;
                    border-radius: 12px;
                    padding: 20px;
                    margin: 16px 0;
                    text-align: left;
                }
                .label-group h3 {
                    margin: 0 0 12px;
                    font-size: 18px;
                    color: #1e3c72;
                }
            </style>
            `;
        }

        // ====================================================================
        // CLIENT-SIDE SCRIPTS
        // ====================================================================

        function getEntryFormScript() {
            return `
                <script>
                    window.onbeforeunload = null;
                    if (typeof setWindowChanged === 'function') setWindowChanged(window, false);

                    function updateCount() {
                        var field = document.getElementById('custpage_serial_numbers');
                        var display = document.getElementById('serial_count');
                        if (!field || !display) return;
                        var lines = field.value.split(/[\\r\\n]+/).filter(function(s) { return s.trim() !== ''; });
                        display.textContent = lines.length;
                    }

                    function submitSerials() {
                        var field = document.getElementById('custpage_serial_numbers');
                        if (!field || !field.value.trim()) { alert('Scan or enter at least one serial number'); return; }
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'lookup_serials';
                        form.appendChild(action);
                        form.submit();
                    }

                    function clearForm() {
                        var field = document.getElementById('custpage_serial_numbers');
                        if (field) field.value = '';
                        updateCount();
                    }

                    document.addEventListener('DOMContentLoaded', function() {
                        window.onbeforeunload = null;
                        if (typeof NS !== 'undefined' && NS.form) NS.form.setChanged(false);
                        updateCount();
                        var field = document.getElementById('custpage_serial_numbers');
                        if (field) {
                            field.addEventListener('input', updateCount);
                            field.addEventListener('paste', function() { setTimeout(updateCount, 50); });
                            field.focus();
                        }
                    });
                </script>
            `;
        }

        function getResultsPageScript(suiteletUrl) {
            return `
                <script>
                    window.onbeforeunload = null;

                    function setAllActions(value) {
                        var selects = document.querySelectorAll('.action-select');
                        for (var i = 0; i < selects.length; i++) {
                            selects[i].value = value;
                        }
                        updateActionCount();
                    }

                    function updateActionCount() {
                        var selects = document.querySelectorAll('.action-select');
                        var count = 0;
                        for (var i = 0; i < selects.length; i++) {
                            if (selects[i].value !== '') count++;
                        }
                        var display = document.getElementById('action_count');
                        if (display) display.textContent = count;
                    }

                    function submitActions() {
                        var selects = document.querySelectorAll('.action-select');
                        var actions = [];
                        var hasAction = false;
                        for (var i = 0; i < selects.length; i++) {
                            var idx = selects[i].getAttribute('data-index');
                            var val = selects[i].value;
                            actions.push({ index: parseInt(idx), action: val });
                            if (val !== '') hasAction = true;
                        }
                        if (!hasAction) { alert('Select an action for at least one serial number'); return; }

                        window.onbeforeunload = null;
                        var form = document.forms[0];

                        var jsonField = document.getElementById('custpage_actions_json');
                        if (jsonField) jsonField.value = JSON.stringify(actions);

                        var actionInput = document.createElement('input');
                        actionInput.type = 'hidden'; actionInput.name = 'custpage_action'; actionInput.value = 'process_actions';
                        form.appendChild(actionInput);
                        form.submit();
                    }

                    function goBack() { window.location.href = '${escapeForJs(suiteletUrl)}'; }

                    document.addEventListener('DOMContentLoaded', function() {
                        window.onbeforeunload = null;
                        var selects = document.querySelectorAll('.action-select');
                        for (var i = 0; i < selects.length; i++) {
                            selects[i].addEventListener('change', updateActionCount);
                        }
                        updateActionCount();
                    });
                </script>
            `;
        }

        function getSuccessPageScript(suiteletUrl, printUrls) {
            // printUrls is an array of { label, url }
            let printFunctions = '';
            printUrls.forEach((pu, idx) => {
                printFunctions += `
                    function printLabels${idx}() { window.open('${escapeForJs(pu.url)}', '_blank'); }
                `;
            });

            return `
                <script>
                    ${printFunctions}
                    function createAnother() { window.location.href = '${escapeForJs(suiteletUrl)}'; }
                </script>
            `;
        }

        // ====================================================================
        // PAGE BUILDERS
        // ====================================================================

        function createEntryForm(context, message, messageType) {
            const form = serverWidget.createForm({ title: 'Condition Change' });

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getEntryFormScript();

            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'alert-success' : messageType === 'warning' ? 'alert-warning' : 'alert-error';
                msgHtml = `<div class="alert ${cls}">${message}</div>`;
            }

            const containerStart = form.addField({ id: 'custpage_container_start', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerStart.defaultValue = `
                <div class="app-container">
                    ${msgHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>Condition Change</h1>
                            <p>Scan serial numbers to change item condition</p>
                        </div>
                        <div class="form-body">
                            <div class="input-group">
                                <label class="custom-label">Serial Numbers <span class="badge-count"><span id="serial_count">0</span> scanned</span></label>
                                <div id="serial-field-wrap"></div>
                            </div>
                            <div class="btn-area">
                                <button type="button" class="custom-btn btn-success" onclick="submitSerials()">Submit</button>
                                <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="display:none;">
            `;

            const serialField = form.addField({ id: 'custpage_serial_numbers', type: serverWidget.FieldType.TEXTAREA, label: 'Serials' });
            serialField.updateDisplaySize({ height: 10, width: 60 });

            const containerEnd = form.addField({ id: 'custpage_container_end', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerEnd.defaultValue = `</div>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    var serialWrap = document.getElementById('serial-field-wrap');
                    var serialLabel = document.getElementById('custpage_serial_numbers_fs_lbl_uir_label');
                    if (serialWrap && serialLabel) serialWrap.appendChild(serialLabel.parentNode);
                    updateCount();
                });
            </script>`;

            context.response.writePage(form);
        }

        function createResultsPage(context, serialData, message, messageType) {
            const form = serverWidget.createForm({ title: 'Serial Lookup Results' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId
            });

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getResultsPageScript(suiteletUrl);

            // Build table rows for valid serials
            let rows = '';
            serialData.valid.forEach((s, idx) => {
                rows += `<tr>
                    <td style="font-family: 'SF Mono', Monaco, monospace; font-size: 14px;">${escapeXml(s.serialNumber)}</td>
                    <td><strong>${escapeXml(s.itemText)}</strong></td>
                    <td>${escapeXml(s.binText) || '<span style="color:#94a3b8;">N/A</span>'}</td>
                    <td>${escapeXml(s.locationText) || '<span style="color:#94a3b8;">N/A</span>'}</td>
                    <td>
                        <select class="action-select" data-index="${idx}">
                            <option value="">-- No Action --</option>
                            <option value="likenew">Change to Like New</option>
                            <option value="likenew_stock">Change to Like New &amp; Back to Stock</option>
                        </select>
                    </td>
                </tr>`;
            });

            // Invalid serials section
            let invalidHtml = '';
            if (serialData.invalid.length > 0) {
                const invalidList = serialData.invalid.map(s => `<span class="badge badge-error">${escapeXml(s)}</span>`).join(' ');
                invalidHtml = `<div class="alert alert-warning" style="margin-top:0;">
                    <strong>Not found or not in stock (${serialData.invalid.length}):</strong><br>
                    <div style="margin-top:8px;">${invalidList}</div>
                </div>`;
            }

            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'alert-success' : messageType === 'warning' ? 'alert-warning' : 'alert-error';
                msgHtml = `<div class="alert ${cls}">${message}</div>`;
            }

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container" style="max-width:1100px;">
                    ${msgHtml}
                    ${invalidHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>Serial Lookup Results</h1>
                            <p>${serialData.valid.length} serial${serialData.valid.length !== 1 ? 's' : ''} found in stock</p>
                        </div>
                        <div class="form-body">
                            <div class="bulk-action-bar">
                                <label>Apply to All:</label>
                                <select class="action-select" onchange="setAllActions(this.value)" style="flex:1;">
                                    <option value="">-- No Action --</option>
                                    <option value="likenew">Change to Like New</option>
                                    <option value="likenew_stock">Change to Like New &amp; Back to Stock</option>
                                </select>
                                <div>
                                    <span style="color:#64748b; font-weight:500;">With Action:</span>
                                    <span style="font-size:28px; font-weight:700; color:#1e3c72; margin-left:8px;" id="action_count">0</span>
                                </div>
                            </div>

                            <table class="results-table">
                                <thead>
                                    <tr>
                                        <th>Serial Number</th>
                                        <th>Item</th>
                                        <th>Bin</th>
                                        <th>Location</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>

                            <div class="btn-area" style="border-top:none; padding-top:0;">
                                <button type="button" class="custom-btn btn-success" onclick="submitActions()">Submit</button>
                                <button type="button" class="custom-btn btn-outline" onclick="goBack()">Back</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Hidden fields for data persistence
            const dataField = form.addField({ id: 'custpage_serial_data', type: serverWidget.FieldType.LONGTEXT, label: 'Data' });
            dataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            dataField.defaultValue = JSON.stringify(serialData);

            const actionsField = form.addField({ id: 'custpage_actions_json', type: serverWidget.FieldType.LONGTEXT, label: 'Actions' });
            actionsField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            actionsField.defaultValue = '';

            context.response.writePage(form);
        }

        function createSuccessPage(context, adjTranId, labelGroups) {
            const form = serverWidget.createForm({ title: 'Condition Change Complete' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true
            });

            // Build print URLs for each label group
            const printUrls = [];
            labelGroups.forEach((group, idx) => {
                const serialsParam = group.serialNumbers.join('\n');

                // Create print label record
                let recordId = '';
                try {
                    const rec = record.create({ type: 'customrecord_print_label', isDynamic: true });
                    rec.setValue({ fieldId: 'custrecord_pl_item_number', value: group.itemId });
                    rec.setValue({ fieldId: 'custrecord_express_entry', value: group.serialNumbers.join('<br>') });
                    recordId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                    log.audit('Print Label Created', 'ID: ' + recordId + ', Item: ' + group.itemText + ', Labels: ' + group.serialNumbers.length);
                } catch (e) {
                    log.error('Print Label Record Error', e.message);
                    recordId = 'ERR';
                }

                group.recordId = recordId;

                // Use adjustment tranid on the label instead of internal record ID
                const printUrl = suiteletUrl +
                    '&ajax_action=printpage' +
                    '&record_id=' + encodeURIComponent(adjTranId) +
                    '&item_text=' + encodeURIComponent(group.itemText || '') +
                    '&description=' + encodeURIComponent(group.description || '') +
                    '&serials=' + encodeURIComponent(serialsParam);

                printUrls.push({ label: group.itemText, url: printUrl });
            });

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl, printUrls);

            // Build label group sections
            let groupsHtml = '';
            labelGroups.forEach((group, idx) => {
                const serialListHtml = group.serialNumbers.map(s => `<li>${escapeXml(s)}</li>`).join('');
                groupsHtml += `
                    <div class="label-group">
                        <h3>${escapeXml(group.itemText)}</h3>
                        <p style="color:#64748b; margin:0 0 12px; font-size:14px;">
                            Record #${group.recordId} &bull; ${group.serialNumbers.length} label${group.serialNumbers.length !== 1 ? 's' : ''}
                            &bull; ${group.action === 'likenew_stock' ? 'Like New + Back to Stock' : 'Like New'}
                        </p>
                        <ul class="serial-list">${serialListHtml}</ul>
                        <button type="button" class="custom-btn btn-primary" onclick="printLabels${idx}()" style="width:100%;">
                            Print Labels - ${escapeXml(group.itemText)}
                        </button>
                    </div>
                `;
            });

            const totalSerials = labelGroups.reduce((sum, g) => sum + g.serialNumbers.length, 0);

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    <div class="main-card">
                        <div class="success-card">
                            <div class="success-icon">&#10003;</div>
                            <h2>Condition Change Complete</h2>
                            <p>Inventory Adjustment ${escapeXml(String(adjTranId))} &bull; ${totalSerials} serial${totalSerials !== 1 ? 's' : ''} processed</p>

                            ${groupsHtml}

                            <button type="button" class="custom-btn btn-outline" style="width:100%; margin-top:16px;" onclick="createAnother()">Process More</button>
                        </div>
                    </div>
                </div>
            `;

            context.response.writePage(form);
        }

        // ====================================================================
        // POST HANDLERS
        // ====================================================================

        function handleLookupSerials(context) {
            const serialInput = context.request.parameters.custpage_serial_numbers || '';
            const serialTexts = cleanSerialInput(serialInput);

            if (serialTexts.length === 0) {
                createEntryForm(context, 'Enter or scan at least one serial number.', 'warning');
                return;
            }

            const serialData = lookupSerialDetails(serialTexts);

            if (serialData.valid.length === 0) {
                createEntryForm(context, 'None of the scanned serial numbers were found in stock.', 'error');
                return;
            }

            createResultsPage(context, serialData);
        }

        function handleProcessActions(context) {
            const serialDataRaw = context.request.parameters.custpage_serial_data;
            const actionsRaw = context.request.parameters.custpage_actions_json;

            if (!serialDataRaw || !actionsRaw) {
                createEntryForm(context, 'Missing data. Please start over.', 'error');
                return;
            }

            let serialData, actions;
            try {
                serialData = JSON.parse(serialDataRaw);
                actions = JSON.parse(actionsRaw);
            } catch (e) {
                createEntryForm(context, 'Invalid data. Please start over.', 'error');
                return;
            }

            // Build map of index → action
            const actionMap = {};
            actions.forEach(a => {
                if (a.action && a.action !== '') {
                    actionMap[a.index] = a.action;
                }
            });

            if (Object.keys(actionMap).length === 0) {
                createResultsPage(context, serialData, 'Select an action for at least one serial number.', 'warning');
                return;
            }

            // For each serial with an action, look up source item details and find -LN target
            const errors = [];
            const targetItemCache = {}; // sourceItemId → { found, targetItem }

            // Collect serials with actions and their group keys
            const groupMap = {}; // key → group object

            for (const [idxStr, action] of Object.entries(actionMap)) {
                const idx = parseInt(idxStr, 10);
                const serial = serialData.valid[idx];
                if (!serial) continue;

                const sourceItemId = serial.itemId;

                // Look up source item name if not cached
                if (!targetItemCache[sourceItemId]) {
                    const itemDetails = getItemDetails(sourceItemId);
                    if (!itemDetails) {
                        errors.push('Could not look up item details for: ' + serial.itemText);
                        targetItemCache[sourceItemId] = { found: false };
                        continue;
                    }

                    const likeNewName = getLikeNewItemName(itemDetails.itemid);
                    const targetItem = findItemByName(likeNewName);

                    if (!targetItem) {
                        errors.push('Like New item not found: ' + likeNewName + ' (source: ' + itemDetails.itemid + ')');
                        targetItemCache[sourceItemId] = { found: false };
                        continue;
                    }

                    targetItemCache[sourceItemId] = {
                        found: true,
                        sourceItemName: itemDetails.itemid,
                        targetItem: targetItem
                    };
                }

                const cache = targetItemCache[sourceItemId];
                if (!cache.found) continue;

                // Group key: sourceItem + location + action
                const key = sourceItemId + '_' + serial.locationId + '_' + action;

                if (!groupMap[key]) {
                    groupMap[key] = {
                        sourceItemId: sourceItemId,
                        sourceItemName: cache.sourceItemName,
                        targetItemId: cache.targetItem.id,
                        targetItemName: cache.targetItem.itemid,
                        targetDisplayName: cache.targetItem.displayname,
                        targetDescription: cache.targetItem.description,
                        locationId: serial.locationId,
                        action: action,
                        serials: []
                    };
                }

                groupMap[key].serials.push({
                    serialNumber: serial.serialNumber,
                    serialId: serial.serialId,
                    binId: serial.binId
                });
            }

            const groups = Object.values(groupMap);

            if (groups.length === 0) {
                const errMsg = errors.length > 0
                    ? 'Could not process: ' + errors.join('; ')
                    : 'No valid serials to process.';
                createResultsPage(context, serialData, errMsg, 'error');
                return;
            }

            // Show errors as warning but still process what we can
            if (errors.length > 0) {
                log.audit('Condition Change Warnings', errors.join(' | '));
            }

            // Create inventory adjustment
            let adjResult;
            try {
                const memoItems = groups.map(g => g.sourceItemName + ' → ' + g.targetItemName).join(', ');
                adjResult = createConditionChangeAdjustment(groups, 'Condition Change: ' + memoItems);
                log.audit('Inventory Adjustment Created', 'TranID: ' + adjResult.tranId + ' (Internal: ' + adjResult.adjId + ')');
            } catch (e) {
                log.error('Inventory Adjustment Error', e.message + ' | ' + e.stack);
                createResultsPage(context, serialData, 'Inventory adjustment failed: ' + e.message, 'error');
                return;
            }

            // Build label groups for the success page (grouped by target item)
            const labelGroupMap = {};
            groups.forEach(group => {
                const tKey = group.targetItemId + '_' + group.action;
                if (!labelGroupMap[tKey]) {
                    labelGroupMap[tKey] = {
                        itemId: group.targetItemId,
                        itemText: group.targetDisplayName || group.targetItemName,
                        description: group.targetDescription,
                        action: group.action,
                        serialNumbers: []
                    };
                }
                group.serials.forEach(s => {
                    labelGroupMap[tKey].serialNumbers.push(s.serialNumber);
                });
            });

            const labelGroups = Object.values(labelGroupMap);

            createSuccessPage(context, adjResult.tranId, labelGroups);
        }

        // ====================================================================
        // GET (AJAX) HANDLERS
        // ====================================================================

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
                context.response.write('Error generating PDF: ' + e.message);
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
                params: {
                    ajax_action: 'printpdf',
                    record_id: recordId,
                    item_text: itemText,
                    description: description,
                    serials: serials
                }
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

        // ====================================================================
        // MAIN ENTRY POINT
        // ====================================================================

        function onRequest(context) {
            try {
                if (context.request.method === 'GET') {
                    const ajaxAction = context.request.parameters.ajax_action;

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

                    if (action === 'lookup_serials') {
                        handleLookupSerials(context);
                        return;
                    }

                    if (action === 'process_actions') {
                        handleProcessActions(context);
                        return;
                    }

                    createEntryForm(context);
                }
            } catch (e) {
                log.error('Suitelet Error', e.message + ' | ' + e.stack);
                createEntryForm(context, 'Unexpected error: ' + e.message, 'error');
            }
        }

        return { onRequest };
    });
