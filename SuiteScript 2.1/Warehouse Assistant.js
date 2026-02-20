/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Warehouse Assistant Dashboard
 * - Scan serial numbers to look up item, bin, and location
 * - Change item condition to Like New (-LN) via inventory adjustment
 * - Bin transfers, serial/part number changes, inventory found, transfer & upcharge
 * - Print labels for adjusted items
 *
 * UI v2 — Improved mobile/scanner ergonomics, modern design, session-safe navigation
 */
define(['N/ui/serverWidget', 'N/record', 'N/search', 'N/log', 'N/url', 'N/runtime', 'N/render'],
    function(serverWidget, record, search, log, url, runtime, render) {

        // ====================================================================
        // CONFIGURATION
        // ====================================================================

        const ADJUSTMENT_ACCOUNT_ID = '154';
        const BACK_TO_STOCK_BIN_ID = 3555;
        const BACK_TO_STOCK_STATUS_ID = 1;
        const TESTING_BIN_ID = 3549;
        const TESTING_STATUS_ID = 6;
        const REFURBISHING_BIN_ID = 3550;
        const REFURBISHING_STATUS_ID = 9;
        const DEFECTIVE_BIN_ID = 3551;
        const DEFECTIVE_STATUS_ID = 10;
        const TRASH_BIN_ID = 2645;
        const TRASH_STATUS_ID = 10;
        const RETURN_TO_VENDOR_BIN_ID = 2143;
        const RETURN_TO_VENDOR_STATUS_ID = 21;

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

        function getLikeNewItemName(itemName) {
            if (!itemName) return '';
            if (itemName.endsWith('-N')) return itemName.slice(0, -2) + '-LN';
            if (itemName.endsWith('-RF')) return itemName.slice(0, -3) + '-LN';
            return itemName + '-LN';
        }

        // ====================================================================
        // NETSUITE LOOKUPS
        // ====================================================================

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
            } catch (e) { log.error('findItemByName Error', e.message); }
            return result;
        }

        function getItemDetails(itemId) {
            try {
                const lookup = search.lookupFields({
                    type: search.Type.ITEM, id: itemId,
                    columns: ['itemid', 'displayname', 'salesdescription']
                });
                return {
                    itemid: lookup.itemid || '',
                    displayname: lookup.displayname || lookup.itemid || '',
                    description: lookup.salesdescription || ''
                };
            } catch (e) { log.error('getItemDetails Error', e.message); return null; }
        }

        function searchItems(query, maxResults) {
            const results = [];
            maxResults = maxResults || 50;
            try {
                const filters = [];
                if (query && query.trim()) {
                    filters.push(['itemid', 'contains', query.trim()]);
                    filters.push('OR');
                    filters.push(['displayname', 'contains', query.trim()]);
                }
                filters.push('AND');
                filters.push(['type', 'anyof', ['InvtPart', 'Assembly']]);
                search.create({
                    type: search.Type.ITEM, filters: filters,
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'itemid', sort: search.Sort.ASC }),
                        search.createColumn({ name: 'displayname' }),
                        search.createColumn({ name: 'salesdescription' })
                    ]
                }).run().each(function(r) {
                    results.push({
                        id: r.getValue('internalid'), itemid: r.getValue('itemid'),
                        displayname: r.getValue('displayname') || r.getValue('itemid'),
                        description: r.getValue('salesdescription') || ''
                    });
                    return results.length < maxResults;
                });
            } catch (e) { log.error('searchItems Error', e.message); }
            return results;
        }

        function getBinsForLocation(locationId) {
            const bins = [];
            try {
                search.create({
                    type: 'bin', filters: [['location', 'anyof', locationId]],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'binnumber', sort: search.Sort.ASC })
                    ]
                }).run().each(function(r) {
                    bins.push({ id: r.getValue('internalid'), name: r.getValue('binnumber') });
                    return bins.length < 1000;
                });
            } catch (e) { log.error('getBinsForLocation Error', e.message); }
            return bins;
        }

        function getLocations() {
            const locations = [];
            try {
                search.create({
                    type: 'location', filters: [['isinactive', 'is', false]],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'name', sort: search.Sort.ASC })
                    ]
                }).run().each(function(r) {
                    locations.push({ id: r.getValue('internalid'), name: r.getValue('name') });
                    return locations.length < 100;
                });
            } catch (e) { log.error('getLocations Error', e.message); }
            return locations;
        }

        function findBinByNumber(binNumber, locationId) {
            let result = null;
            try {
                search.create({
                    type: 'bin',
                    filters: [['binnumber', 'is', binNumber], 'AND', ['location', 'anyof', locationId]],
                    columns: ['internalid', 'binnumber']
                }).run().each(function(r) {
                    result = { id: r.getValue('internalid'), binnumber: r.getValue('binnumber') };
                    return false;
                });
            } catch (e) { log.error('findBinByNumber Error', e.message); }
            return result;
        }

        // Location IDs for serial searches
        const SERIAL_LOOKUP_LOCATION_ID = '1';
        const TRANSFER_SOURCE_LOCATION_ID = '26';
        const SERIAL_LOOKUP_LOCATION_IDS = [SERIAL_LOOKUP_LOCATION_ID, TRANSFER_SOURCE_LOCATION_ID];
        const TRANSFER_DESTINATION_LOCATION_ID = '1';
        const LANDED_COST_CATEGORY_ID = 21697;

        function lookupSerialDetails(serialTexts) {
            if (!serialTexts || serialTexts.length === 0) return { valid: [], invalid: [] };

            const serialFilterExpression = [];
            serialTexts.forEach((serial, index) => {
                if (index > 0) serialFilterExpression.push('OR');
                serialFilterExpression.push(['inventorynumber', 'is', serial]);
            });

            const foundSerials = {};

            try {
                search.create({
                    type: 'inventorynumber', filters: serialFilterExpression,
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'inventorynumber' }),
                        search.createColumn({ name: 'item' }),
                        search.createColumn({ name: 'location' }),
                        search.createColumn({ name: 'quantityonhand' })
                    ]
                }).run().each(result => {
                    const serial = result.getValue('inventorynumber');
                    const locId = String(result.getValue('location') || '');
                    const qtyOnHand = parseFloat(result.getValue('quantityonhand')) || 0;
                    if (SERIAL_LOOKUP_LOCATION_IDS.indexOf(locId) !== -1 && qtyOnHand > 0) {
                        if (!foundSerials[serial]) {
                            foundSerials[serial] = {
                                serialNumber: serial, serialId: result.getValue('internalid'),
                                itemId: result.getValue('item'), itemText: result.getText('item'),
                                locationId: locId, locationText: result.getText('location') || '',
                                binId: '', binText: '', statusId: '', statusText: '',
                                quantityOnHand: qtyOnHand
                            };
                        }
                    }
                    return true;
                });
            } catch (e) { log.error('lookupSerialDetails Phase1 Error', e.message); }

            if (Object.keys(foundSerials).length > 0) {
                try {
                    const serialIdToText = {};
                    const serialIds = [];
                    Object.keys(foundSerials).forEach(serial => {
                        const sid = foundSerials[serial].serialId;
                        if (sid) { serialIdToText[sid] = serial; serialIds.push(sid); }
                    });
                    if (serialIds.length > 0) {
                        search.create({
                            type: 'inventorybalance',
                            filters: [['inventorynumber', 'anyof', serialIds], 'AND', ['location', 'anyof', SERIAL_LOOKUP_LOCATION_IDS]],
                            columns: [
                                search.createColumn({ name: 'inventorynumber' }),
                                search.createColumn({ name: 'binnumber' }),
                                search.createColumn({ name: 'status' })
                            ]
                        }).run().each(result => {
                            const serialId = result.getValue('inventorynumber') || '';
                            const serial = serialIdToText[serialId];
                            const binVal = result.getValue('binnumber') || '';
                            const binTxt = result.getText('binnumber') || '';
                            if (serial && foundSerials[serial] && binVal && !foundSerials[serial].binId) {
                                foundSerials[serial].binId = binVal;
                                foundSerials[serial].binText = binTxt;
                                foundSerials[serial].statusId = result.getValue('status') || '';
                                foundSerials[serial].statusText = result.getText('status') || '';
                            }
                            return true;
                        });
                    }
                } catch (e) { log.debug('lookupSerialDetails Phase2 skipped', e.message); }
            }

            const valid = [];
            const invalid = [];
            serialTexts.forEach(serial => {
                if (foundSerials[serial]) valid.push(foundSerials[serial]);
                else invalid.push(serial);
            });
            return { valid, invalid };
        }

        // ====================================================================
        // LABEL PDF GENERATION
        // ====================================================================

        function generateLabelsPdf(labelGroups, recordId) {
            let bodyContent = '';
            labelGroups.forEach(group => {
                const itemName = escapeXml(group.itemText || '');
                const description = escapeXml(group.description || '');
                const escapedRecordId = escapeXml(recordId || '');
                if (group.serialNumbers && group.serialNumbers.length > 0) {
                    group.serialNumbers.forEach(serialNumber => {
                        const escapedSerial = escapeXml(serialNumber);
                        bodyContent += `
                        <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">
                            <table align="right" width="98%" height="50%">
                                <tr height="12%"><td align="center"><table width="100%"><tr>
                                    <td style="font-size:18px;">${itemName}</td>
                                    <td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">${escapedRecordId}</td></tr></table></td>
                                </tr></table></td></tr>
                                <tr height="25%"><td align="center"><table width="100%"><tr><td style="font-size:11px;">${description}</td></tr></table></td></tr>
                            </table>
                            <table align="left" width="100%" height="50%" v-align="bottom">
                                <tr height="60px"><td height="60px" align="left" style="font-size:10px;">
                                    <barcode height="60px" width="240px" codetype="code128" showtext="true" value="${escapedSerial}"/>
                                </td></tr>
                                <tr><td align="left" style="font-size:25px;">
                                    <barcode height="60px" width="220px" codetype="code128" showtext="true" value="${itemName}"/>
                                </td></tr>
                            </table>
                        </body>`;
                    });
                } else if (group.quantity && group.quantity > 0) {
                    for (let i = 0; i < group.quantity; i++) {
                        bodyContent += `
                        <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">
                            <table align="right" width="98%" height="50%">
                                <tr height="12%"><td align="center"><table width="100%"><tr>
                                    <td style="font-size:18px;">${itemName}</td>
                                    <td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">${escapedRecordId}</td></tr></table></td>
                                </tr></table></td></tr>
                                <tr height="25%"><td align="center"><table width="100%"><tr><td style="font-size:11px;">${description}</td></tr></table></td></tr>
                            </table>
                            <table align="left" width="100%" height="50%" v-align="bottom">
                                <tr height="60px"><td height="60px" align="left"></td></tr>
                                <tr><td align="left" style="font-size:25px;">
                                    <barcode height="60px" width="220px" codetype="code128" showtext="true" value="${itemName}"/>
                                </td></tr>
                            </table>
                        </body>`;
                    }
                }
            });

            const xml = `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
    <head><style>th { background-color: #3c8dbc; color: white; } body { font-family: Helvetica; }</style></head>
    ${bodyContent}
</pdf>`;
            return render.xmlToPdf({ xmlString: xml });
        }

        // ====================================================================
        // INVENTORY ADJUSTMENT
        // ====================================================================

        function createConditionChangeAdjustment(groups, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Created via WH Assistant' });

            const costCache = {};
            groups.forEach(group => {
                if (!costCache[group.sourceItemId]) {
                    try {
                        const costLookup = search.lookupFields({ type: search.Type.ITEM, id: group.sourceItemId, columns: ['averagecost'] });
                        costCache[group.sourceItemId] = parseFloat(costLookup.averagecost) || 0;
                    } catch (e) { costCache[group.sourceItemId] = 0; }
                }
            });

            groups.forEach(group => {
                const serialCount = group.serials.length;
                const itemCost = costCache[group.sourceItemId] || 0;

                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.sourceItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -serialCount });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });

                const removeDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.serials.forEach(serial => {
                    removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: serial.serialId });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -1 });
                    if (serial.binId) removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: serial.binId });
                    removeDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                adjRecord.commitLine({ sublistId: 'inventory' });

                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.targetItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: serialCount });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });

                const addDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.serials.forEach(serial => {
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: serial.serialNumber });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                    if (group.action === 'likenew_stock') {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: BACK_TO_STOCK_BIN_ID });
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: BACK_TO_STOCK_STATUS_ID });
                    } else if (serial.binId) {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: serial.binId });
                    }
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function createBinTransfer(groups, memo) {
            const transferRecord = record.create({ type: record.Type.BIN_TRANSFER, isDynamic: true });
            transferRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            transferRecord.setValue({ fieldId: 'memo', value: memo || 'Via WH Assistant' });
            if (groups.length > 0 && groups[0].locationId) transferRecord.setValue({ fieldId: 'location', value: groups[0].locationId });

            groups.forEach(group => {
                const serialCount = group.serials.length;
                let toBinId, toStatusId;
                if (group.action === 'move_testing') { toBinId = TESTING_BIN_ID; toStatusId = TESTING_STATUS_ID; }
                else if (group.action === 'move_refurbishing') { toBinId = REFURBISHING_BIN_ID; toStatusId = REFURBISHING_STATUS_ID; }
                else if (group.action === 'back_to_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                else if (group.action === 'defective') { toBinId = DEFECTIVE_BIN_ID; toStatusId = DEFECTIVE_STATUS_ID; }
                else if (group.action === 'trash') { toBinId = TRASH_BIN_ID; toStatusId = TRASH_STATUS_ID; }
                else if (group.action === 'return_to_vendor') { toBinId = RETURN_TO_VENDOR_BIN_ID; toStatusId = RETURN_TO_VENDOR_STATUS_ID; }

                transferRecord.selectNewLine({ sublistId: 'inventory' });
                transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: serialCount });

                const invDetail = transferRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.serials.forEach(serial => {
                    invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    invDetail.setCurrentSublistText({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', text: serial.serialNumber });
                    invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                    if (serial.binId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: serial.binId });
                    invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'tobinnumber', value: toBinId });
                    invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'toinventorystatus', value: toStatusId });
                    invDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                transferRecord.commitLine({ sublistId: 'inventory' });
            });

            const transferId = transferRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(transferId);
            try { const l = search.lookupFields({ type: record.Type.BIN_TRANSFER, id: transferId, columns: ['tranid'] }); tranId = l.tranid || String(transferId); } catch (e) {}
            return { transferId: transferId, tranId: tranId };
        }

        function createNonSerializedAdjustment(data, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Created via WH Assistant' });
            let itemCost = 0;
            try { const cl = search.lookupFields({ type: search.Type.ITEM, id: data.sourceItemId, columns: ['averagecost'] }); itemCost = parseFloat(cl.averagecost) || 0; } catch (e) {}

            adjRecord.selectNewLine({ sublistId: 'inventory' });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.sourceItemId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -data.quantity });
            if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
            if (data.fromBinId) {
                const rd = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                rd.selectNewLine({ sublistId: 'inventoryassignment' });
                rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -data.quantity });
                rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
                rd.commitLine({ sublistId: 'inventoryassignment' });
            }
            adjRecord.commitLine({ sublistId: 'inventory' });

            adjRecord.selectNewLine({ sublistId: 'inventory' });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.targetItemId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
            if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
            if (data.toBinId) {
                const ad = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                ad.selectNewLine({ sublistId: 'inventoryassignment' });
                ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.toBinId });
                if (data.toStatusId) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: data.toStatusId });
                ad.commitLine({ sublistId: 'inventoryassignment' });
            }
            adjRecord.commitLine({ sublistId: 'inventory' });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function createNonSerializedAdjustmentMulti(rows, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Created via WH Assistant' });
            const costCache = {};
            rows.forEach(function(data) {
                if (!costCache[data.sourceItemId]) {
                    try { const cl = search.lookupFields({ type: search.Type.ITEM, id: data.sourceItemId, columns: ['averagecost'] }); costCache[data.sourceItemId] = parseFloat(cl.averagecost) || 0; } catch (e) { costCache[data.sourceItemId] = 0; }
                }
                const itemCost = costCache[data.sourceItemId];
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.sourceItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -data.quantity });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                if (data.fromBinId) {
                    const rd = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                    rd.selectNewLine({ sublistId: 'inventoryassignment' });
                    rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -data.quantity });
                    rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
                    rd.commitLine({ sublistId: 'inventoryassignment' });
                }
                adjRecord.commitLine({ sublistId: 'inventory' });
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.targetItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                if (data.toBinId) {
                    const ad = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                    ad.selectNewLine({ sublistId: 'inventoryassignment' });
                    ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                    ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.toBinId });
                    if (data.toStatusId) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: data.toStatusId });
                    ad.commitLine({ sublistId: 'inventoryassignment' });
                }
                adjRecord.commitLine({ sublistId: 'inventory' });
            });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function createNonSerializedBinTransfer(data, memo) {
            const tr = record.create({ type: record.Type.BIN_TRANSFER, isDynamic: true });
            tr.setValue({ fieldId: 'subsidiary', value: '1' });
            tr.setValue({ fieldId: 'memo', value: memo || 'Via WH Assistant' });
            tr.setValue({ fieldId: 'location', value: data.locationId });
            tr.selectNewLine({ sublistId: 'inventory' });
            tr.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
            tr.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: data.quantity });
            const invDetail = tr.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
            invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
            if (data.fromBinId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'tobinnumber', value: data.toBinId });
            if (data.toStatusId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'toinventorystatus', value: data.toStatusId });
            invDetail.commitLine({ sublistId: 'inventoryassignment' });
            tr.commitLine({ sublistId: 'inventory' });
            const transferId = tr.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(transferId);
            try { const l = search.lookupFields({ type: record.Type.BIN_TRANSFER, id: transferId, columns: ['tranid'] }); tranId = l.tranid || String(transferId); } catch (e) {}
            return { transferId: transferId, tranId: tranId };
        }

        function createNonSerializedBinTransferMulti(rows, memo) {
            const tr = record.create({ type: record.Type.BIN_TRANSFER, isDynamic: true });
            tr.setValue({ fieldId: 'subsidiary', value: '1' });
            tr.setValue({ fieldId: 'memo', value: memo || 'Via WH Assistant' });
            if (rows.length > 0) tr.setValue({ fieldId: 'location', value: rows[0].locationId });
            rows.forEach(function(data) {
                tr.selectNewLine({ sublistId: 'inventory' });
                tr.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
                tr.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: data.quantity });
                const invDetail = tr.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                if (data.fromBinId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
                invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'tobinnumber', value: data.toBinId });
                if (data.toStatusId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'toinventorystatus', value: data.toStatusId });
                invDetail.commitLine({ sublistId: 'inventoryassignment' });
                tr.commitLine({ sublistId: 'inventory' });
            });
            const transferId = tr.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(transferId);
            try { const l = search.lookupFields({ type: record.Type.BIN_TRANSFER, id: transferId, columns: ['tranid'] }); tranId = l.tranid || String(transferId); } catch (e) {}
            return { transferId: transferId, tranId: tranId };
        }

        function createInventoryFoundAdjustment(groups, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Inv Found via WH Assistant' });
            const costCache = {};
            groups.forEach(group => {
                if (!costCache[group.itemId]) {
                    try { const cl = search.lookupFields({ type: search.Type.ITEM, id: group.itemId, columns: ['averagecost'] }); costCache[group.itemId] = parseFloat(cl.averagecost) || 0; } catch (e) { costCache[group.itemId] = 0; }
                }
            });
            groups.forEach(group => {
                const serialCount = group.serials.length;
                const itemCost = costCache[group.itemId] || 0;
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: serialCount });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                const addDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.serials.forEach(serial => {
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: serial.serialNumber });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: BACK_TO_STOCK_BIN_ID });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: BACK_TO_STOCK_STATUS_ID });
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                adjRecord.commitLine({ sublistId: 'inventory' });
            });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function createNonSerializedInventoryFoundAdjustment(data, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Inv Found via WH Assistant' });
            let itemCost = 0;
            try { const cl = search.lookupFields({ type: search.Type.ITEM, id: data.itemId, columns: ['averagecost'] }); itemCost = parseFloat(cl.averagecost) || 0; } catch (e) {}
            adjRecord.selectNewLine({ sublistId: 'inventory' });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
            if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
            const addDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
            addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
            addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
            addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: BACK_TO_STOCK_BIN_ID });
            addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: BACK_TO_STOCK_STATUS_ID });
            addDetail.commitLine({ sublistId: 'inventoryassignment' });
            adjRecord.commitLine({ sublistId: 'inventory' });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function createNonSerializedInventoryFoundMulti(rows, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Inv Found via WH Assistant' });
            const costCache = {};
            rows.forEach(function(data) {
                if (!costCache[data.itemId]) {
                    try { const cl = search.lookupFields({ type: search.Type.ITEM, id: data.itemId, columns: ['averagecost'] }); costCache[data.itemId] = parseFloat(cl.averagecost) || 0; } catch (e) { costCache[data.itemId] = 0; }
                }
                const itemCost = costCache[data.itemId];
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                const addDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: BACK_TO_STOCK_BIN_ID });
                addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: BACK_TO_STOCK_STATUS_ID });
                addDetail.commitLine({ sublistId: 'inventoryassignment' });
                adjRecord.commitLine({ sublistId: 'inventory' });
            });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        // ====================================================================
        // TRANSFER ORDER + UPCHARGE
        // ====================================================================

        function createTransferOrderWithUpcharge(params) {
            const itemId = params.itemId;
            const serials = params.serials || [];
            const quantity = params.quantity || serials.length;
            const upchargePerUnit = params.upchargePerUnit || 0;
            const memo = params.memo || 'Xfer & Upcharge via WH Asst';
            const isSerialized = serials.length > 0;

            const toRecord = record.create({ type: record.Type.TRANSFER_ORDER, isDynamic: true });
            toRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            toRecord.setValue({ fieldId: 'location', value: TRANSFER_SOURCE_LOCATION_ID });
            toRecord.setValue({ fieldId: 'transferlocation', value: TRANSFER_DESTINATION_LOCATION_ID });
            toRecord.setValue({ fieldId: 'memo', value: memo });
            toRecord.setValue({ fieldId: 'orderstatus', value: 'B' });
            toRecord.selectNewLine({ sublistId: 'item' });
            toRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: itemId });
            toRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: quantity });
            toRecord.commitLine({ sublistId: 'item' });
            const toId = toRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            log.audit('Transfer Order Created', 'ID: ' + toId);
            let toTranId = String(toId);
            try { const tl = search.lookupFields({ type: record.Type.TRANSFER_ORDER, id: toId, columns: ['tranid'] }); toTranId = tl.tranid || String(toId); } catch (e) {}

            const ifRecord = record.transform({ fromType: record.Type.TRANSFER_ORDER, fromId: toId, toType: record.Type.ITEM_FULFILLMENT, isDynamic: true });
            ifRecord.setValue({ fieldId: 'shipstatus', value: 'C' });
            const lineCount = ifRecord.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < lineCount; i++) {
                ifRecord.selectLine({ sublistId: 'item', line: i });
                const lineItemId = ifRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                if (String(lineItemId) === String(itemId)) {
                    ifRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });
                    if (isSerialized) {
                        const invDetail = ifRecord.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                        serials.forEach((s, sIdx) => {
                            if (sIdx > 0) invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                            else { try { invDetail.selectLine({ sublistId: 'inventoryassignment', line: 0 }); } catch (e) { invDetail.selectNewLine({ sublistId: 'inventoryassignment' }); } }
                            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: s.serialId || s.serialNumber });
                            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                            if (s.binId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: s.binId });
                            invDetail.commitLine({ sublistId: 'inventoryassignment' });
                        });
                    }
                    ifRecord.commitLine({ sublistId: 'item' });
                }
            }
            const ifId = ifRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            log.audit('Item Fulfillment Created', 'ID: ' + ifId + ' for TO: ' + toId);

            const irRecord = record.transform({ fromType: record.Type.TRANSFER_ORDER, fromId: toId, toType: record.Type.ITEM_RECEIPT, isDynamic: true });
            if (upchargePerUnit > 0) { try { irRecord.setValue({ fieldId: 'landedcostperline', value: true }); } catch (plErr) {} }
            const irLineCount = irRecord.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < irLineCount; i++) {
                irRecord.selectLine({ sublistId: 'item', line: i });
                const lineItemId = irRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                if (String(lineItemId) === String(itemId)) {
                    irRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });
                    if (upchargePerUnit > 0) irRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'landedcost', value: LANDED_COST_CATEGORY_ID });
                    if (isSerialized) {
                        const invDetail = irRecord.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                        const existingLines = invDetail.getLineCount({ sublistId: 'inventoryassignment' });
                        serials.forEach((s, sIdx) => {
                            if (sIdx < existingLines) invDetail.selectLine({ sublistId: 'inventoryassignment', line: sIdx });
                            else invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: s.serialNumber });
                            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                            invDetail.commitLine({ sublistId: 'inventoryassignment' });
                        });
                    }
                    irRecord.commitLine({ sublistId: 'item' });
                }
            }
            const irId = irRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            log.audit('Item Receipt Created', 'ID: ' + irId + ' for TO: ' + toId);

            if (upchargePerUnit > 0) {
                try {
                    const totalLandedCost = upchargePerUnit * quantity;
                    const irEdit = record.load({ type: record.Type.ITEM_RECEIPT, id: irId, isDynamic: false });
                    const irEditLineCount = irEdit.getLineCount({ sublistId: 'item' });
                    for (let li = 0; li < irEditLineCount; li++) {
                        const liItemId = irEdit.getSublistValue({ sublistId: 'item', fieldId: 'item', line: li });
                        if (String(liItemId) === String(itemId)) {
                            const lcSubrec = irEdit.getSublistSubrecord({ sublistId: 'item', fieldId: 'landedcost', line: li });
                            const lcLineCount = lcSubrec.getLineCount({ sublistId: 'landedcostdata' });
                            if (lcLineCount > 0) lcSubrec.setSublistValue({ sublistId: 'landedcostdata', fieldId: 'amount', line: 0, value: totalLandedCost });
                            break;
                        }
                    }
                    irEdit.save({ enableSourcing: true, ignoreMandatoryFields: true });
                    log.audit('Landed Cost Applied', 'IR ID: ' + irId + ', amount: ' + totalLandedCost);
                } catch (lcErr) { log.error('Landed Cost Error', lcErr.message); }
            }

            return { transferOrderId: toId, transferOrderTranId: toTranId, itemFulfillmentId: ifId, itemReceiptId: irId };
        }

        function createSerialNumberChangeAdjustment(changes, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Serial Change via WH Assistant' });

            const groupMap = {};
            changes.forEach(change => {
                const key = change.itemId + '_' + change.locationId + '_' + change.action;
                if (!groupMap[key]) groupMap[key] = { itemId: change.itemId, locationId: change.locationId, action: change.action, changes: [] };
                groupMap[key].changes.push(change);
            });

            const costCache = {};
            Object.values(groupMap).forEach(group => {
                if (!costCache[group.itemId]) {
                    try { const cl = search.lookupFields({ type: search.Type.ITEM, id: group.itemId, columns: ['averagecost'] }); costCache[group.itemId] = parseFloat(cl.averagecost) || 0; } catch (e) { costCache[group.itemId] = 0; }
                }
            });

            Object.values(groupMap).forEach(group => {
                const itemCost = costCache[group.itemId] || 0;
                const changeCount = group.changes.length;

                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -changeCount });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                const removeDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.changes.forEach(change => {
                    removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: change.oldSerialId });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -1 });
                    if (change.binId) removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: change.binId });
                    removeDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                adjRecord.commitLine({ sublistId: 'inventory' });

                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: changeCount });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                const addDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.changes.forEach(change => {
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: change.newSerialNumber });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                    if (change.action === 'serial_change_stock') {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: BACK_TO_STOCK_BIN_ID });
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: BACK_TO_STOCK_STATUS_ID });
                    } else {
                        if (change.binId) addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: change.binId });
                        if (change.statusId) addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: change.statusId });
                    }
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function createPartNumberChangeAdjustment(changes, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Part # Change via WH Assistant' });

            const groupMap = {};
            changes.forEach(change => {
                const key = change.oldItemId + '_' + change.newItemId + '_' + change.locationId + '_' + change.action;
                if (!groupMap[key]) groupMap[key] = { oldItemId: change.oldItemId, newItemId: change.newItemId, locationId: change.locationId, action: change.action, changes: [] };
                groupMap[key].changes.push(change);
            });

            const costCache = {};
            Object.values(groupMap).forEach(group => {
                if (!costCache[group.oldItemId]) {
                    try { const cl = search.lookupFields({ type: search.Type.ITEM, id: group.oldItemId, columns: ['averagecost'] }); costCache[group.oldItemId] = parseFloat(cl.averagecost) || 0; } catch (e) { costCache[group.oldItemId] = 0; }
                }
            });

            Object.values(groupMap).forEach(group => {
                const itemCost = costCache[group.oldItemId] || 0;
                const changeCount = group.changes.length;

                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.oldItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -changeCount });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                const removeDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.changes.forEach(change => {
                    removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: change.serialId });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -1 });
                    if (change.binId) removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: change.binId });
                    removeDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                adjRecord.commitLine({ sublistId: 'inventory' });

                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.newItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: changeCount });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                const addDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                group.changes.forEach(change => {
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: change.serialNumber });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                    if (change.action === 'part_number_change_stock') {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: BACK_TO_STOCK_BIN_ID });
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: BACK_TO_STOCK_STATUS_ID });
                    } else {
                        if (change.binId) addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: change.binId });
                        if (change.statusId) addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: change.statusId });
                    }
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        // ====================================================================
        // STYLES — v2 (modern, mobile-first, scanner-optimized)
        // ====================================================================

        function getStyles() {
            return `
            <script>
                (function() {
                    if (!document.querySelector('meta[name="viewport"]')) {
                        var m = document.createElement('meta');
                        m.name = 'viewport';
                        m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
                        document.head.appendChild(m);
                    }
                })();
            </script>
            <style>
                /* === RESET NS CHROME === */
                html, body { overflow-x:hidden !important; max-width:100vw !important; }
                #main_form { background:#eef1f5 !important; overflow-x:hidden !important; }
                #div__body, #outerdiv, .uir-record-type { overflow-x:hidden !important; max-width:100vw !important; }
                .uir-page-title,.uir-page-title-firstline,.uir-page-title-secondline,
                .uir-header-buttons,.uir-button-bar { display:none !important; }
                * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }

                /* === LAYOUT === */
                .app-container {
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
                    max-width:920px; margin:16px auto; padding:0 12px;
                    height:calc(100vh - 32px); display:flex; flex-direction:column;
                }
                .app-container-wide { max-width:1120px; }

                .main-card {
                    background:#fff; border-radius:14px;
                    box-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.07);
                    overflow:hidden; display:flex; flex-direction:column;
                    min-height:0; flex:1;
                }

                /* === HEADER === */
                .card-header {
                    background:linear-gradient(135deg,#0f2b46 0%,#1a4971 100%);
                    color:#fff; padding:22px 28px; text-align:center;
                    border-bottom:3px solid #f59e0b;
                }
                .card-header h1 { margin:0; font-size:20px; font-weight:700; letter-spacing:-.3px; }
                .card-header p  { margin:6px 0 0; opacity:.7; font-size:13px; }

                /* === BODY === */
                .form-body { padding:24px; overflow-y:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch; }

                /* === INPUTS === */
                .input-group { margin-bottom:22px; }
                .custom-label {
                    display:block; font-weight:700; color:#374151; margin-bottom:8px;
                    font-size:12px; text-transform:uppercase; letter-spacing:.6px;
                }
                .input-group input[type="text"],
                .input-group select,
                .input-group textarea {
                    width:100% !important; padding:14px 16px !important;
                    border:2px solid #d1d5db !important; border-radius:10px !important;
                    font-size:16px !important; background:#f9fafb !important;
                    transition:border-color .15s,box-shadow .15s !important;
                    color:#111827 !important; min-height:48px;
                }
                .input-group textarea {
                    min-height:200px !important; resize:vertical;
                    line-height:1.5 !important; font-family:'SF Mono',Monaco,'Courier New',monospace !important;
                }
                .input-group input:focus,.input-group select:focus,.input-group textarea:focus {
                    border-color:#1a4971 !important; background:#fff !important;
                    outline:none !important; box-shadow:0 0 0 3px rgba(26,73,113,.15) !important;
                }

                /* === BUTTONS === */
                .btn-area {
                    display:flex; gap:10px; padding:16px 24px;
                    border-top:1px solid #e5e7eb; background:#fff; flex-shrink:0;
                }
                .custom-btn {
                    padding:14px 22px; border-radius:10px; font-weight:700;
                    cursor:pointer; border:none; font-size:15px;
                    transition:all .15s; min-height:48px; touch-action:manipulation;
                }
                .btn-primary { background:#1a4971; color:#fff; }
                .btn-primary:hover { background:#0f2b46; }
                .btn-success { background:#059669; color:#fff; flex:1; }
                .btn-success:hover { background:#047857; }
                .btn-outline { background:#fff; color:#6b7280; border:2px solid #d1d5db; }
                .btn-outline:hover { background:#f3f4f6; border-color:#9ca3af; }
                .btn-warning { background:#f59e0b; color:#fff; }
                .btn-warning:hover { background:#d97706; }
                .btn-danger  { background:#ef4444; color:#fff; }
                .btn-danger:hover  { background:#dc2626; }

                /* === MODE TOGGLE === */
                .mode-toggle {
                    display:flex; gap:0; margin-bottom:22px;
                    background:#f3f4f6; border-radius:10px; padding:3px;
                }
                .mode-btn {
                    flex:1; padding:12px 16px; border:none;
                    background:transparent; color:#6b7280; font-weight:700;
                    font-size:13px; cursor:pointer; border-radius:8px;
                    transition:all .15s; min-height:44px; touch-action:manipulation;
                }
                .mode-btn.active {
                    background:#1a4971; color:#fff;
                    box-shadow:0 2px 6px rgba(15,43,70,.3);
                }
                .mode-btn:hover:not(.active) { background:#e5e7eb; color:#374151; }

                /* === BADGES === */
                .badge-count {
                    background:#1a4971; color:#fff; padding:3px 10px;
                    border-radius:20px; font-size:11px; font-weight:700; margin-left:8px;
                }
                .badge {
                    display:inline-block; padding:3px 10px; border-radius:20px;
                    font-size:11px; font-weight:700;
                }
                .badge-success { background:#059669; color:#fff; }
                .badge-info   { background:#2563eb; color:#fff; }
                .badge-muted  { background:#e5e7eb; color:#6b7280; }
                .badge-error  { background:#ef4444; color:#fff; }

                /* === ALERTS === */
                .alert {
                    padding:14px 18px; border-radius:10px; margin-bottom:20px;
                    font-size:14px; font-weight:500; flex-shrink:0;
                }
                .alert-error   { background:#fef2f2; color:#991b1b; border-left:4px solid #ef4444; }
                .alert-warning { background:#fffbeb; color:#92400e; border-left:4px solid #f59e0b; }
                .alert-success { background:#f0fdf4; color:#166534; border-left:4px solid #10b981; }

                /* === TABLES === */
                .results-table { width:100%; border-collapse:collapse; margin-bottom:20px; table-layout:fixed; overflow-wrap:break-word; }
                .results-table th {
                    background:#f3f4f6; padding:10px 12px; text-align:left;
                    font-size:11px; font-weight:800; color:#6b7280;
                    text-transform:uppercase; letter-spacing:.5px;
                    border-bottom:2px solid #e5e7eb; position:sticky; top:0; z-index:1;
                }
                .results-table td {
                    padding:12px; border-bottom:1px solid #f3f4f6;
                    font-size:14px; color:#374151;
                }
                .results-table tr:hover td { background:#f9fafb; }

                .action-select {
                    padding:10px 12px; border:2px solid #d1d5db; border-radius:8px;
                    font-size:14px; background:#f9fafb; color:#111827;
                    cursor:pointer; min-width:200px; min-height:44px; max-width:100%;
                }
                .action-select:focus {
                    border-color:#1a4971; outline:none;
                    box-shadow:0 0 0 3px rgba(26,73,113,.12);
                }

                /* === SUCCESS PAGE === */
                .success-icon { font-size:56px; color:#059669; margin-bottom:12px; }
                .success-card { text-align:center; padding:24px 0 0; }
                .success-card h2 { margin:0 0 6px; font-size:22px; color:#111827; font-weight:800; }
                .success-card p  { color:#6b7280; margin-bottom:24px; font-size:14px; }

                .serial-list {
                    list-style:none; padding:0; margin:16px 0;
                    display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
                    gap:6px; text-align:left;
                }
                .serial-list li {
                    font-family:'SF Mono',Monaco,monospace; font-size:12px;
                    padding:8px 12px; background:#f3f4f6; border-radius:6px;
                    color:#374151; border:1px solid #e5e7eb;
                }

                .bulk-action-bar {
                    background:#f9fafb; padding:14px 16px; border-radius:10px;
                    margin-bottom:16px; display:flex; justify-content:space-between;
                    align-items:center; gap:12px; position:sticky; top:0; z-index:2;
                    border:1px solid #e5e7eb;
                }
                .bulk-action-bar label { font-weight:700; color:#374151; font-size:13px; white-space:nowrap; }

                .label-group {
                    background:#f9fafb; border-radius:10px; padding:16px;
                    margin:12px 0; text-align:left; border:1px solid #e5e7eb;
                }
                .label-group h3 { margin:0 0 8px; font-size:15px; color:#1a4971; font-weight:700; }

                .form-section { display:none; }
                .form-section.active { display:block; }

                #ns-grid-body tr { animation:rowIn .25s ease; }
                @keyframes rowIn { from { background:#dbeafe; } to { background:transparent; } }

                /* === MOBILE RESPONSIVE === */
                @media screen and (max-width:768px) {
                    #main_form { padding:0 !important; margin:0 !important; overflow-x:hidden !important; }
                    body,#div__body,#outerdiv,.uir-record-type { padding:0 !important; margin:0 !important; overflow-x:hidden !important; max-width:100vw !important; }
                    .uir-page-title,.uir-page-title-firstline,.uir-page-title-secondline,
                    .uir-header-buttons,.uir-button-bar,
                    #tbl_submitter,#submitter_row,.uir_form_tab_bg { display:none !important; }

                    .app-container { padding:0 !important; margin:0 !important; height:100vh; max-width:100% !important; overflow-x:hidden !important; }
                    .main-card { border-radius:0; box-shadow:none; border:none; }
                    .card-header { padding:10px 14px; }
                    .card-header h1 { font-size:16px; }
                    .card-header p { font-size:11px; margin-top:2px; }
                    .form-body { padding:10px; flex:0 1 auto; }
                    .input-group { margin-bottom:12px; }
                    .custom-label { font-size:11px; margin-bottom:5px; }

                    .input-group input[type="text"],
                    .input-group select,
                    .input-group textarea {
                        padding:12px !important; font-size:16px !important;
                        border-radius:8px !important; border-width:1.5px !important;
                    }
                    .input-group textarea { min-height:140px !important; }

                    .mode-toggle { margin-bottom:12px; padding:2px; border-radius:8px; }
                    .mode-btn { padding:10px 6px; font-size:12px; border-radius:6px; }

                    .btn-area { padding:8px 10px; gap:8px; flex-direction:column; }
                    .custom-btn { padding:14px; font-size:14px; border-radius:8px; width:100%; text-align:center; }

                    /* Table → card layout */
                    .results-table,.results-table thead,.results-table tbody,
                    .results-table tr,.results-table th,.results-table td {
                        display:block !important; width:100% !important; white-space:normal !important;
                    }
                    .results-table thead { display:none !important; }
                    .results-table tr {
                        background:#f9fafb; border:1px solid #e5e7eb;
                        border-radius:8px; padding:10px; margin-bottom:8px;
                    }
                    .results-table td {
                        padding:3px 0 !important; border-bottom:none !important;
                        font-size:14px !important; text-align:left !important;
                    }
                    .results-table td[data-label]::before {
                        content:attr(data-label) ": ";
                        font-weight:800; font-size:10px; text-transform:uppercase;
                        color:#6b7280; letter-spacing:.3px; display:block; margin-bottom:1px;
                    }
                    .results-table tr:hover td { background:transparent !important; }
                    .results-table input[type="text"],
                    .results-table input[type="number"],
                    .results-table select,
                    .results-table .action-select {
                        font-size:16px !important; padding:10px !important;
                        min-width:unset !important; width:100% !important;
                        border-radius:6px !important;
                    }
                    .action-select { min-width:unset !important; width:100% !important; max-width:100% !important; }
                    .alert { padding:10px 12px; font-size:13px; margin-bottom:10px; }

                    /* Override inline min-width on dynamically generated grid rows */
                    #ns-grid-table select,
                    #ns-grid-table input,
                    #bp-ns-grid-table select,
                    #bp-ns-grid-table input {
                        min-width:unset !important; width:100% !important; max-width:100% !important;
                    }
                    #ns-grid-table, #bp-ns-grid-table { table-layout:fixed !important; width:100% !important; }
                    .main-card { overflow-x:hidden !important; max-width:100vw !important; }
                    .form-body { overflow-x:hidden !important; }

                    .bulk-action-bar {
                        flex-direction:column !important; align-items:stretch !important;
                        gap:8px !important; padding:10px !important; margin-bottom:10px;
                    }
                    .bulk-action-bar label { font-size:11px; white-space:normal !important; }
                    .bulk-action-bar select { width:100% !important; font-size:16px !important; }
                    .bulk-action-bar input[type="text"],
                    .bulk-action-bar input[type="number"] {
                        width:100% !important; font-size:16px !important;
                        padding:10px !important;
                    }
                    .bulk-action-bar > div {
                        display:flex !important; flex-wrap:wrap !important;
                        gap:6px !important; width:100% !important;
                    }
                    .bulk-action-bar > div .custom-btn { flex:1 !important; min-width:0 !important; }

                    .success-icon { font-size:36px; margin-bottom:8px; }
                    .success-card { padding:10px 0 0; }
                    .success-card h2 { font-size:18px; }
                    .success-card p  { font-size:13px !important; margin-bottom:16px; }
                    .success-card p[style] { font-size:14px !important; }
                    .label-group { padding:10px; margin:6px 0; }
                    .label-group h3 { font-size:14px; }
                    .serial-list { grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); gap:4px; margin:8px 0; }
                    .serial-list li { font-size:11px; padding:6px 8px; word-break:break-all; }
                    .badge-count { padding:2px 7px; font-size:10px; margin-left:5px; }

                    #inventoryFoundModal > div {
                        padding:16px !important; width:96% !important; max-width:96% !important; border-radius:10px !important;
                    }
                    #inventoryFoundModal h2 { font-size:16px !important; }
                    #inventoryFoundModal input,
                    #inventoryFoundModal textarea { font-size:16px !important; padding:10px !important; }
                    #inventoryFoundModal > div > div:last-child {
                        flex-direction:column !important; gap:6px !important;
                    }
                    #inventoryFoundModal > div > div:last-child .custom-btn {
                        width:100% !important; text-align:center !important;
                    }

                    #bp_to_bin { padding:12px !important; font-size:16px !important; border-radius:8px !important; }
                    .new-serial-input,.new-item-input {
                        font-size:16px !important; padding:10px !important;
                        min-width:unset !important; width:100% !important;
                    }

                    #ns-grid-table td:last-child,
                    #bp-ns-grid-table td:last-child {
                        position:absolute; top:6px; right:6px; width:auto !important; padding:0 !important;
                    }
                }

                @media screen and (max-width:400px) {
                    .card-header { padding:8px 10px; }
                    .card-header h1 { font-size:14px; }
                    .card-header p { display:none; }
                    .mode-btn { padding:8px 3px; font-size:11px; }
                    .serial-list { grid-template-columns:repeat(auto-fill,minmax(80px,1fr)); }
                }
            </style>
            `;
        }

        // ====================================================================
        // CLIENT-SIDE SCRIPTS
        // ====================================================================

        function getEntryFormScript(nsBinOptionsHtml) {
            return `
                <script>
                    window.onbeforeunload = null;
                    if (typeof setWindowChanged === 'function') setWindowChanged(window, false);

                    var currentMode = 'serialized';
                    var nsGridRowId = 0;
                    var nsBinOptions = '${(nsBinOptionsHtml || '').replace(/'/g, "\\'")}';

                    var nsActionOptions = '<option value="">-- Select Action --</option>'
                        + '<option value="back_to_stock">Back to Stock</option>'
                        + '<option value="likenew">Change to Like New</option>'
                        + '<option value="likenew_stock">Change to Like New &amp; Back to Stock</option>'
                        + '<option value="defective">Defective</option>'
                        + '<option value="move_refurbishing">Move to Refurbishing</option>'
                        + '<option value="move_testing">Move to Testing</option>'
                        + '<option value="return_to_vendor">Return to Vendor</option>'
                        + '<option value="trash">Trash</option>'
                        + '<option value="inventory_found">Inventory Found</option>'
                        + '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>';

                    function addNsGridRow() {
                        var tbody = document.getElementById('ns-grid-body');
                        if (!tbody) return;
                        nsGridRowId++;
                        var tr = document.createElement('tr');
                        tr.setAttribute('data-row-id', nsGridRowId);
                        tr.innerHTML = '<td data-label="SKU"><input type="text" class="ns-grid-input ns-item-input" data-row="' + nsGridRowId + '" placeholder="Enter SKU" style="width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;box-sizing:border-box;min-height:44px;"></td>'
                            + '<td data-label="From Bin"><select class="action-select ns-bin-input" data-row="' + nsGridRowId + '" style="min-width:120px;min-height:44px;">' + nsBinOptions + '</select></td>'
                            + '<td data-label="Qty"><input type="number" class="ns-grid-input ns-qty-input" data-row="' + nsGridRowId + '" placeholder="Qty" min="1" style="width:80px;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td>'
                            + '<td data-label="Action"><select class="action-select ns-action-input" data-row="' + nsGridRowId + '" style="min-width:180px;min-height:44px;" onchange="handleNsActionChange(this)">' + nsActionOptions + '</select>'
                            + '<input type="number" class="ns-grid-input ns-upcharge-input" data-row="' + nsGridRowId + '" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td>'
                            + '<td><button type="button" onclick="removeNsGridRow(' + nsGridRowId + ')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:20px;padding:6px 10px;min-height:44px;min-width:44px;" title="Remove">&times;</button></td>';
                        tbody.appendChild(tr);
                        updateNsRowCount();
                        var newInput = tr.querySelector('.ns-item-input');
                        if (newInput) newInput.focus();
                    }

                    function removeNsGridRow(rowId) {
                        var row = document.querySelector('#ns-grid-body tr[data-row-id="' + rowId + '"]');
                        if (row) row.remove();
                        updateNsRowCount();
                        var tbody = document.getElementById('ns-grid-body');
                        if (tbody && tbody.children.length === 0) addNsGridRow();
                    }

                    function updateNsRowCount() {
                        var tbody = document.getElementById('ns-grid-body');
                        var countEl = document.getElementById('ns_row_count');
                        if (tbody && countEl) countEl.textContent = tbody.children.length;
                    }

                    function clearNsGrid() {
                        var tbody = document.getElementById('ns-grid-body');
                        if (tbody) tbody.innerHTML = '';
                        nsGridRowId = 0;
                        addNsGridRow();
                    }

                    function handleNsActionChange(selectEl) {
                        var row = selectEl.closest('tr');
                        if (!row) return;
                        var upchargeInput = row.querySelector('.ns-upcharge-input');
                        if (upchargeInput) {
                            upchargeInput.style.display = selectEl.value === 'transfer_upcharge' ? 'block' : 'none';
                            if (selectEl.value !== 'transfer_upcharge') upchargeInput.value = '';
                        }
                    }

                    function submitNonSerializedMulti() {
                        var rows = document.querySelectorAll('#ns-grid-body tr');
                        var gridData = [];
                        var hasError = false;
                        for (var i = 0; i < rows.length; i++) {
                            var row = rows[i];
                            var itemInput = row.querySelector('.ns-item-input');
                            var binInput = row.querySelector('.ns-bin-input');
                            var qtyInput = row.querySelector('.ns-qty-input');
                            var actionSelect = row.querySelector('.ns-action-input');
                            var upchargeInput = row.querySelector('.ns-upcharge-input');
                            var itemName = itemInput ? itemInput.value.trim() : '';
                            var binNumber = binInput ? binInput.value.trim() : '';
                            var qty = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
                            var action = actionSelect ? actionSelect.value : '';
                            var upcharge = upchargeInput ? parseFloat(upchargeInput.value) || 0 : 0;
                            if (!itemName && !binNumber && qty === 0 && !action) continue;
                            if (!itemName) { if (itemInput) itemInput.style.borderColor = '#ef4444'; hasError = true; } else { if (itemInput) itemInput.style.borderColor = '#d1d5db'; }
                            if (!binNumber) { if (binInput) binInput.style.borderColor = '#ef4444'; hasError = true; } else { if (binInput) binInput.style.borderColor = '#d1d5db'; }
                            if (qty <= 0) { if (qtyInput) qtyInput.style.borderColor = '#ef4444'; hasError = true; } else { if (qtyInput) qtyInput.style.borderColor = '#d1d5db'; }
                            if (!action) { if (actionSelect) actionSelect.style.borderColor = '#ef4444'; hasError = true; } else { if (actionSelect) actionSelect.style.borderColor = '#d1d5db'; }
                            if (action === 'transfer_upcharge' && upcharge <= 0) { if (upchargeInput) upchargeInput.style.borderColor = '#ef4444'; hasError = true; } else { if (upchargeInput) upchargeInput.style.borderColor = '#d1d5db'; }
                            gridData.push({ itemName:itemName, binNumber:binNumber, quantity:qty, action:action, upcharge: action === 'transfer_upcharge' ? upcharge : 0 });
                        }
                        if (gridData.length === 0) { alert('Please fill in at least one row.'); return; }
                        if (hasError) { alert('Please fix the highlighted fields.'); return; }
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var cartField = document.getElementById('custpage_ns_cart_json');
                        if (cartField) cartField.value = JSON.stringify(gridData);
                        var actionInput = document.createElement('input');
                        actionInput.type = 'hidden'; actionInput.name = 'custpage_action'; actionInput.value = 'process_nonserialized_multi';
                        form.appendChild(actionInput);
                        form.submit();
                    }

                    function switchMode(mode) {
                        currentMode = mode;
                        ['serialized','nonserialized','binputaway'].forEach(function(m) {
                            var sec = document.getElementById(m + '-section');
                            var btn = document.getElementById('mode-' + m);
                            var area = document.getElementById(m + '-btn-area');
                            if (sec) sec.classList.remove('active');
                            if (btn) btn.classList.remove('active');
                            if (area) area.style.display = 'none';
                        });
                        var sec = document.getElementById(mode + '-section');
                        var btn = document.getElementById('mode-' + mode);
                        var area = document.getElementById(mode + '-btn-area');
                        if (sec) sec.classList.add('active');
                        if (btn) btn.classList.add('active');
                        if (area) area.style.display = 'flex';
                        if (mode === 'serialized') { var f = document.getElementById('custpage_serial_numbers'); if (f) f.focus(); }
                    }

                    function updateCount() {
                        var field = document.getElementById('custpage_serial_numbers');
                        var display = document.getElementById('serial_count');
                        if (!field || !display) return;
                        display.textContent = field.value.split(/[\\r\\n]+/).filter(function(s) { return s.trim() !== ''; }).length;
                    }

                    function submitSerials() {
                        var field = document.getElementById('custpage_serial_numbers');
                        if (!field || !field.value.trim()) { alert('Scan or enter at least one serial number'); return; }
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'lookup_serials';
                        form.appendChild(action); form.submit();
                    }

                    function submitNonSerialized() {
                        var qtyValue = '';
                        var qtyField = document.getElementById('custpage_ns_quantity');
                        if (qtyField) qtyValue = qtyField.value;
                        if (!qtyValue) { var qi = document.querySelectorAll('input[name="custpage_ns_quantity"]'); if (qi.length > 0) qtyValue = qi[0].value; }
                        if (!qtyValue || parseInt(qtyValue) <= 0) { alert('Please enter a valid quantity'); return; }
                        var actionValue = '';
                        var af = document.getElementById('custpage_ns_action');
                        if (af) actionValue = af.value;
                        if (!actionValue) { var ad = document.getElementById('inpt_custpage_ns_action'); if (ad && ad.value) actionValue = ad.value; }
                        if (!actionValue) { var an = document.getElementsByName('custpage_ns_action')[0]; if (an) actionValue = an.value; }
                        if (!actionValue) { var ah = document.getElementById('hddn_custpage_ns_action'); if (ah) actionValue = ah.value; }
                        if (!actionValue) { alert('Please select an action'); return; }
                        var id = document.getElementById('inpt_custpage_ns_item');
                        if (id && !id.value.trim()) { alert('Please select an item'); return; }
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'process_nonserialized';
                        form.appendChild(action); form.submit();
                    }

                    function showInventoryFoundModal() {
                        var modal = document.getElementById('inventoryFoundModal');
                        if (modal) modal.style.display = 'flex';
                        var itemInput = document.getElementById('if_item_name');
                        if (itemInput) itemInput.focus();
                    }
                    function hideInventoryFoundModal() {
                        var modal = document.getElementById('inventoryFoundModal');
                        if (modal) modal.style.display = 'none';
                    }
                    function submitInventoryFound() {
                        var itemName = (document.getElementById('if_item_name').value || '').trim();
                        var serialsRaw = (document.getElementById('if_serials').value || '').trim();
                        if (!itemName) { alert('Please enter an item name / SKU.'); return; }
                        if (!serialsRaw) { alert('Please enter at least one serial number.'); return; }
                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var ifItemField = document.getElementById('custpage_if_item_name');
                        if (ifItemField) ifItemField.value = itemName;
                        var ifSerialsField = document.getElementById('custpage_if_serials');
                        if (ifSerialsField) ifSerialsField.value = serialsRaw;
                        var actionInput = document.createElement('input');
                        actionInput.type = 'hidden'; actionInput.name = 'custpage_action'; actionInput.value = 'process_inventory_found';
                        form.appendChild(actionInput); form.submit();
                    }

                    // Bin Putaway
                    var bpCurrentMode = 'serialized';
                    var bpNsGridRowId = 0;
                    function switchBpMode(mode) {
                        bpCurrentMode = mode;
                        ['bp-serialized-section','bp-nonserialized-section'].forEach(function(id) { var el = document.getElementById(id); if (el) el.classList.remove('active'); });
                        ['bp-mode-serialized','bp-mode-nonserialized'].forEach(function(id) { var el = document.getElementById(id); if (el) el.classList.remove('active'); });
                        document.getElementById('bp-' + mode + '-section').classList.add('active');
                        document.getElementById('bp-mode-' + mode).classList.add('active');
                        if (mode === 'serialized') { var f = document.getElementById('custpage_bp_serials'); if (f) f.focus(); }
                    }
                    function updateBpCount() {
                        var field = document.getElementById('custpage_bp_serials');
                        var display = document.getElementById('bp_serial_count');
                        if (!field || !display) return;
                        display.textContent = field.value.split(/[\\r\\n]+/).filter(function(s) { return s.trim() !== ''; }).length;
                    }
                    function addBpNsGridRow() {
                        var tbody = document.getElementById('bp-ns-grid-body');
                        if (!tbody) return;
                        bpNsGridRowId++;
                        var tr = document.createElement('tr');
                        tr.setAttribute('data-row-id', bpNsGridRowId);
                        tr.innerHTML = '<td data-label="SKU"><input type="text" class="bp-ns-item-input" data-row="' + bpNsGridRowId + '" placeholder="SKU" style="width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td>'
                            + '<td data-label="From Bin"><input type="text" class="bp-ns-frombin-input" data-row="' + bpNsGridRowId + '" list="bp-bin-datalist" autocomplete="off" placeholder="From" style="min-width:100px;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td>'
                            + '<td data-label="To Bin"><input type="text" class="bp-ns-tobin-input" data-row="' + bpNsGridRowId + '" list="bp-bin-datalist" autocomplete="off" placeholder="To" style="min-width:100px;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td>'
                            + '<td data-label="Qty"><input type="number" class="bp-ns-qty-input" data-row="' + bpNsGridRowId + '" placeholder="Qty" min="1" style="width:70px;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td>'
                            + '<td><button type="button" onclick="removeBpNsGridRow(' + bpNsGridRowId + ')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:20px;padding:6px 10px;min-height:44px;min-width:44px;">&times;</button></td>';
                        tbody.appendChild(tr);
                        updateBpNsRowCount();
                        var ni = tr.querySelector('.bp-ns-item-input'); if (ni) ni.focus();
                    }
                    function removeBpNsGridRow(rowId) {
                        var row = document.querySelector('#bp-ns-grid-body tr[data-row-id="' + rowId + '"]');
                        if (row) row.remove();
                        updateBpNsRowCount();
                        var tbody = document.getElementById('bp-ns-grid-body');
                        if (tbody && tbody.children.length === 0) addBpNsGridRow();
                    }
                    function updateBpNsRowCount() {
                        var tbody = document.getElementById('bp-ns-grid-body');
                        var countEl = document.getElementById('bp_ns_row_count');
                        if (tbody && countEl) countEl.textContent = tbody.children.length;
                    }
                    function clearBpNsGrid() { var tbody = document.getElementById('bp-ns-grid-body'); if (tbody) tbody.innerHTML = ''; bpNsGridRowId = 0; addBpNsGridRow(); }

                    function submitBinPutaway() {
                        if (bpCurrentMode === 'serialized') {
                            var toBinSelect = document.getElementById('bp_to_bin');
                            var toBinValue = toBinSelect ? toBinSelect.value : '';
                            if (!toBinValue) { alert('Please select a destination bin.'); return; }
                            var serialField = document.getElementById('custpage_bp_serials');
                            if (!serialField || !serialField.value.trim()) { alert('Scan or enter at least one serial number.'); return; }
                            window.onbeforeunload = null;
                            var form = document.forms[0];
                            var h1 = document.getElementById('custpage_bp_to_bin'); if (h1) h1.value = toBinValue;
                            var h2 = document.getElementById('custpage_bp_mode'); if (h2) h2.value = 'serialized';
                            var ai = document.createElement('input'); ai.type='hidden'; ai.name='custpage_action'; ai.value='process_bin_putaway';
                            form.appendChild(ai); form.submit();
                        } else {
                            var rows = document.querySelectorAll('#bp-ns-grid-body tr');
                            var gridData = []; var hasError = false;
                            for (var i = 0; i < rows.length; i++) {
                                var row = rows[i];
                                var iI = row.querySelector('.bp-ns-item-input'), fI = row.querySelector('.bp-ns-frombin-input'),
                                    tI = row.querySelector('.bp-ns-tobin-input'), qI = row.querySelector('.bp-ns-qty-input');
                                var n = iI?iI.value.trim():'', fb = fI?fI.value.trim():'', tb = tI?tI.value.trim():'', q = qI?parseInt(qI.value)||0:0;
                                if (!n && !fb && !tb && q===0) continue;
                                if (!n) { if(iI)iI.style.borderColor='#ef4444'; hasError=true; } else { if(iI)iI.style.borderColor='#d1d5db'; }
                                if (!fb) { if(fI)fI.style.borderColor='#ef4444'; hasError=true; } else { if(fI)fI.style.borderColor='#d1d5db'; }
                                if (!tb) { if(tI)tI.style.borderColor='#ef4444'; hasError=true; } else { if(tI)tI.style.borderColor='#d1d5db'; }
                                if (q<=0) { if(qI)qI.style.borderColor='#ef4444'; hasError=true; } else { if(qI)qI.style.borderColor='#d1d5db'; }
                                gridData.push({ itemName:n, fromBinNumber:fb, toBinNumber:tb, quantity:q });
                            }
                            if (gridData.length===0) { alert('Please fill in at least one row.'); return; }
                            if (hasError) { alert('Please fix the highlighted fields.'); return; }
                            window.onbeforeunload = null;
                            var form = document.forms[0];
                            var cf = document.getElementById('custpage_bp_cart_json'); if (cf) cf.value = JSON.stringify(gridData);
                            var h2 = document.getElementById('custpage_bp_mode'); if (h2) h2.value = 'nonserialized';
                            var ai = document.createElement('input'); ai.type='hidden'; ai.name='custpage_action'; ai.value='process_bin_putaway';
                            form.appendChild(ai); form.submit();
                        }
                    }

                    function clearForm() {
                        if (currentMode === 'serialized') { var f = document.getElementById('custpage_serial_numbers'); if (f) f.value = ''; updateCount(); }
                        else if (currentMode === 'nonserialized') { clearNsGrid(); }
                        else if (currentMode === 'binputaway') {
                            if (bpCurrentMode === 'serialized') {
                                var f = document.getElementById('custpage_bp_serials'); if (f) f.value = ''; updateBpCount();
                                var b = document.getElementById('bp_to_bin'); if (b) b.value = '';
                            } else { clearBpNsGrid(); }
                        }
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
                        if (value === 'serial_change' || value === 'serial_change_stock') { alert('Serial change actions must be set individually.'); return; }
                        var bulkNewItem = document.getElementById('bulk-new-item');
                        var bulkUpcharge = document.getElementById('bulk-upcharge');
                        if (bulkNewItem) { bulkNewItem.style.display = (value==='part_number_change'||value==='part_number_change_stock') ? 'block' : 'none'; if (value!=='part_number_change'&&value!=='part_number_change_stock') bulkNewItem.value=''; }
                        if (bulkUpcharge) { bulkUpcharge.style.display = value==='transfer_upcharge' ? 'block' : 'none'; if (value!=='transfer_upcharge') bulkUpcharge.value=''; }

                        if (value === 'part_number_change' || value === 'part_number_change_stock') {
                            var bulkItemName = bulkNewItem ? bulkNewItem.value.trim() : '';
                            var selects = document.querySelectorAll('select.action-select[data-index]');
                            for (var i = 0; i < selects.length; i++) { selects[i].value = value; handleActionChange(selects[i]); }
                            if (bulkItemName) {
                                var inputs = document.querySelectorAll('.new-item-input[data-index]');
                                for (var j = 0; j < inputs.length; j++) inputs[j].value = bulkItemName;
                            } else { if (bulkNewItem) bulkNewItem.focus(); }
                            updateActionCount(); return;
                        }

                        if (value === 'transfer_upcharge') {
                            var bulkUpchargeVal = bulkUpcharge ? bulkUpcharge.value.trim() : '';
                            var selects = document.querySelectorAll('select.action-select[data-index]');
                            for (var i = 0; i < selects.length; i++) {
                                var loc = selects[i].getAttribute('data-location');
                                if (loc === '${TRANSFER_SOURCE_LOCATION_ID}') { selects[i].value = value; handleActionChange(selects[i]); }
                            }
                            if (bulkUpchargeVal && parseFloat(bulkUpchargeVal) > 0) {
                                for (var i = 0; i < selects.length; i++) {
                                    if (selects[i].getAttribute('data-location') === '${TRANSFER_SOURCE_LOCATION_ID}') {
                                        var idx = selects[i].getAttribute('data-index');
                                        var ui = document.querySelector('.upcharge-input[data-index="'+idx+'"]');
                                        if (ui) ui.value = bulkUpchargeVal;
                                    }
                                }
                            } else { if (bulkUpcharge) bulkUpcharge.focus(); }
                            updateActionCount(); return;
                        }

                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        for (var i = 0; i < selects.length; i++) { selects[i].value = value; handleActionChange(selects[i]); }
                        updateActionCount();
                    }

                    function handleActionChange(selectEl) {
                        var idx = selectEl.getAttribute('data-index');
                        var nsi = document.querySelector('.new-serial-input[data-index="'+idx+'"]');
                        var nii = document.querySelector('.new-item-input[data-index="'+idx+'"]');
                        var uci = document.querySelector('.upcharge-input[data-index="'+idx+'"]');
                        if (nsi) { var show = selectEl.value==='serial_change'||selectEl.value==='serial_change_stock'; nsi.style.display = show?'block':'none'; if (!show) nsi.value=''; }
                        if (nii) { var show = selectEl.value==='part_number_change'||selectEl.value==='part_number_change_stock'; nii.style.display = show?'block':'none'; if (!show) nii.value=''; }
                        if (uci) { var show = selectEl.value==='transfer_upcharge'; uci.style.display = show?'block':'none'; if (!show) uci.value=''; }
                        updateActionCount();
                    }

                    function updateActionCount() {
                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        var count = 0;
                        for (var i = 0; i < selects.length; i++) { if (selects[i].value !== '') count++; }
                        var display = document.getElementById('action_count');
                        if (display) display.textContent = count;
                    }

                    function submitActions() {
                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        var actions = []; var hasAction = false;
                        var missingNewSerial = false, missingNewItem = false, missingUpcharge = false;
                        var bulkNewItem = document.getElementById('bulk-new-item');
                        var bulkItemName = bulkNewItem ? bulkNewItem.value.trim() : '';
                        var bulkUpcharge = document.getElementById('bulk-upcharge');
                        var bulkUpchargeVal = bulkUpcharge ? bulkUpcharge.value.trim() : '';

                        for (var i = 0; i < selects.length; i++) {
                            var idx = selects[i].getAttribute('data-index');
                            var val = selects[i].value;
                            var newSerial = '', newItemName = '', upcharge = 0;
                            if (val==='serial_change'||val==='serial_change_stock') {
                                var ni = document.querySelector('.new-serial-input[data-index="'+idx+'"]');
                                if (ni) { newSerial = ni.value.trim(); if (!newSerial) { missingNewSerial=true; ni.style.borderColor='#ef4444'; } else { ni.style.borderColor='#d1d5db'; } }
                            }
                            if (val==='part_number_change'||val==='part_number_change_stock') {
                                var ni = document.querySelector('.new-item-input[data-index="'+idx+'"]');
                                if (ni) { newItemName = ni.value.trim(); if (!newItemName && bulkItemName) { newItemName = bulkItemName; ni.value = bulkItemName; } if (!newItemName) { missingNewItem=true; ni.style.borderColor='#ef4444'; } else { ni.style.borderColor='#d1d5db'; } }
                            }
                            if (val==='transfer_upcharge') {
                                var ui = document.querySelector('.upcharge-input[data-index="'+idx+'"]');
                                if (ui) { var uv = ui.value.trim(); if (!uv && bulkUpchargeVal) { uv = bulkUpchargeVal; ui.value = bulkUpchargeVal; } upcharge = parseFloat(uv)||0; if (upcharge<=0) { missingUpcharge=true; ui.style.borderColor='#ef4444'; } else { ui.style.borderColor='#d1d5db'; } }
                            }
                            actions.push({ index:parseInt(idx), action:val, newSerial:newSerial, newItemName:newItemName, upcharge:upcharge });
                            if (val !== '') hasAction = true;
                        }

                        if (!hasAction) { alert('Select an action for at least one serial'); return; }
                        if (missingNewSerial) { alert('Enter a new serial for all Serial Change actions'); return; }
                        if (missingNewItem) { alert('Enter a new item name for all Part Number Change actions'); return; }
                        if (missingUpcharge) { alert('Enter an upcharge amount for all Transfer & Upcharge actions'); return; }

                        window.onbeforeunload = null;
                        var form = document.forms[0];
                        var jsonField = document.getElementById('custpage_actions_json');
                        if (jsonField) jsonField.value = JSON.stringify(actions);
                        var actionInput = document.createElement('input');
                        actionInput.type = 'hidden'; actionInput.name = 'custpage_action'; actionInput.value = 'process_actions';
                        form.appendChild(actionInput); form.submit();
                    }

                    /* SESSION-SAFE BACK: POST back to suitelet instead of GET navigation */
                    function goBack() {
                        window.onbeforeunload = null;
                        if (typeof setWindowChanged === 'function') setWindowChanged(window, false);
                        var form = document.forms[0];
                        var existing = form.querySelectorAll('input[name="custpage_action"]');
                        for (var i = 0; i < existing.length; i++) existing[i].parentNode.removeChild(existing[i]);
                        var ai = document.createElement('input');
                        ai.type = 'hidden'; ai.name = 'custpage_action'; ai.value = 'go_home';
                        form.appendChild(ai); form.submit();
                    }

                    document.addEventListener('DOMContentLoaded', function() {
                        window.onbeforeunload = null;
                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        for (var i = 0; i < selects.length; i++) { selects[i].addEventListener('change', function() { handleActionChange(this); }); }
                        updateActionCount();
                    });
                </script>
            `;
        }

        function getSuccessPageScript(suiteletUrl) {
            return `
                <script>
                    function printLabels() {
                        window.onbeforeunload = null;
                        if (typeof setWindowChanged === 'function') setWindowChanged(window, false);
                        var form = document.forms[0];
                        form.target = '_blank';
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'printpdf';
                        form.appendChild(action); form.submit();
                        form.removeChild(action); form.target = '';
                    }
                    /* SESSION-SAFE: POST back instead of GET */
                    function createAnother() {
                        window.onbeforeunload = null;
                        if (typeof setWindowChanged === 'function') setWindowChanged(window, false);
                        var form = document.forms[0];
                        var existing = form.querySelectorAll('input[name="custpage_action"]');
                        for (var i = 0; i < existing.length; i++) existing[i].parentNode.removeChild(existing[i]);
                        var ai = document.createElement('input');
                        ai.type = 'hidden'; ai.name = 'custpage_action'; ai.value = 'go_home';
                        form.appendChild(ai); form.submit();
                    }
                </script>
            `;
        }

        // ====================================================================
        // PAGE BUILDERS
        // ====================================================================

        function createEntryForm(context, message, messageType, prefill) {
            const form = serverWidget.createForm({ title: 'Warehouse Assistant Dashboard' });

            const binList = getBinsForLocation('1');
            let nsBinOptionsHtml = '<option value="">-- Select Bin --</option>';
            let bpBinDatalistHtml = '';
            binList.forEach(function(b) {
                nsBinOptionsHtml += '<option value="' + escapeXml(b.name) + '">' + escapeXml(b.name) + '</option>';
                bpBinDatalistHtml += '<option value="' + escapeXml(b.name) + '">';
            });

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getEntryFormScript(nsBinOptionsHtml);

            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'alert-success' : messageType === 'warning' ? 'alert-warning' : 'alert-error';
                msgHtml = '<div class="alert ' + cls + '">' + message + '</div>';
            }

            const containerStart = form.addField({ id: 'custpage_container_start', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerStart.defaultValue = `
                <div class="app-container">
                    ${msgHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>Warehouse Assistant</h1>
                            <p>Scan &bull; Process &bull; Print</p>
                        </div>
                        <div class="form-body">
                            <div class="mode-toggle">
                                <button type="button" id="mode-serialized" class="mode-btn active" onclick="switchMode('serialized')">Serialized</button>
                                <button type="button" id="mode-nonserialized" class="mode-btn" onclick="switchMode('nonserialized')">Non-Serialized</button>
                                <button type="button" id="mode-binputaway" class="mode-btn" onclick="switchMode('binputaway')">Bin Putaway</button>
                            </div>

                            <div id="serialized-section" class="form-section active">
                                <div class="input-group">
                                    <label class="custom-label">Serial Numbers <span class="badge-count"><span id="serial_count">0</span> scanned</span></label>
                                    <div id="serial-field-wrap"></div>
                                </div>
                            </div>

                            <div id="nonserialized-section" class="form-section">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                    <label class="custom-label" style="margin-bottom:0;">Items <span class="badge-count"><span id="ns_row_count">1</span> rows</span></label>
                                    <button type="button" class="custom-btn btn-outline" style="padding:8px 14px;font-size:12px;margin:0;min-height:36px;" onclick="addNsGridRow()">+ Add Row</button>
                                </div>
                                <table class="results-table" id="ns-grid-table">
                                    <thead><tr><th style="width:35%;">Part Number / SKU</th><th>From Bin</th><th>Qty</th><th>Action</th><th style="width:40px;"></th></tr></thead>
                                    <tbody id="ns-grid-body"></tbody>
                                </table>
                            </div>

                            <div id="binputaway-section" class="form-section">
                                <div class="mode-toggle" style="margin-bottom:16px;">
                                    <button type="button" id="bp-mode-serialized" class="mode-btn active" onclick="switchBpMode('serialized')">Serialized</button>
                                    <button type="button" id="bp-mode-nonserialized" class="mode-btn" onclick="switchBpMode('nonserialized')">Non-Serialized</button>
                                </div>
                                <datalist id="bp-bin-datalist">${bpBinDatalistHtml}</datalist>
                                <div id="bp-serialized-section" class="form-section active">
                                    <div class="input-group">
                                        <label class="custom-label">Destination Bin</label>
                                        <input type="text" id="bp_to_bin" list="bp-bin-datalist" autocomplete="off" placeholder="Type or scan bin" style="width:100%;padding:14px 16px;border:2px solid #d1d5db;border-radius:10px;font-size:16px;background:#f9fafb;min-height:48px;">
                                    </div>
                                    <div class="input-group">
                                        <label class="custom-label">Serial Numbers <span class="badge-count"><span id="bp_serial_count">0</span> scanned</span></label>
                                        <div id="bp-serial-field-wrap"></div>
                                    </div>
                                </div>
                                <div id="bp-nonserialized-section" class="form-section">
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                        <label class="custom-label" style="margin-bottom:0;">Items <span class="badge-count"><span id="bp_ns_row_count">1</span> rows</span></label>
                                        <button type="button" class="custom-btn btn-outline" style="padding:8px 14px;font-size:12px;margin:0;min-height:36px;" onclick="addBpNsGridRow()">+ Add Row</button>
                                    </div>
                                    <table class="results-table" id="bp-ns-grid-table">
                                        <thead><tr><th>Part Number</th><th>From Bin</th><th>To Bin</th><th>Qty</th><th style="width:40px;"></th></tr></thead>
                                        <tbody id="bp-ns-grid-body"></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div id="serialized-btn-area" class="btn-area">
                            <button type="button" class="custom-btn btn-success" onclick="submitSerials()">Submit</button>
                            <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                            <button type="button" class="custom-btn btn-warning" style="padding:10px 14px;font-size:13px;" onclick="showInventoryFoundModal()">Inv. Found</button>
                        </div>
                        <div id="nonserialized-btn-area" class="btn-area" style="display:none;">
                            <button type="button" class="custom-btn btn-success" onclick="submitNonSerializedMulti()">Submit</button>
                            <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                            <button type="button" class="custom-btn btn-warning" style="padding:10px 14px;font-size:13px;" onclick="showInventoryFoundModal()">Inv. Found</button>
                        </div>
                        <div id="binputaway-btn-area" class="btn-area" style="display:none;">
                            <button type="button" class="custom-btn btn-success" onclick="submitBinPutaway()">Put Away</button>
                            <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                        </div>
                    </div>
                </div>

                <div id="inventoryFoundModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;justify-content:center;align-items:center;">
                    <div style="background:#fff;border-radius:12px;padding:28px;max-width:500px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3);">
                        <h2 style="margin:0 0 6px;color:#1a4971;font-size:18px;font-weight:700;">Inventory Found</h2>
                        <p style="margin:0 0 18px;color:#6b7280;font-size:13px;">Enter item name and serial number(s) to adjust in.</p>
                        <label style="display:block;font-weight:700;margin-bottom:5px;color:#374151;font-size:13px;">Item Name / SKU</label>
                        <input type="text" id="if_item_name" placeholder="Exact item name" style="width:100%;padding:12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:16px;margin-bottom:14px;min-height:44px;">
                        <label style="display:block;font-weight:700;margin-bottom:5px;color:#374151;font-size:13px;">Serial Numbers (one per line)</label>
                        <textarea id="if_serials" rows="5" placeholder="Scan or type serials" style="width:100%;padding:12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:16px;resize:vertical;margin-bottom:18px;font-family:'SF Mono',Monaco,monospace;"></textarea>
                        <div style="display:flex;gap:10px;justify-content:flex-end;">
                            <button type="button" class="custom-btn btn-outline" style="padding:10px 20px;margin:0;" onclick="hideInventoryFoundModal()">Cancel</button>
                            <button type="button" class="custom-btn btn-success" style="padding:10px 20px;margin:0;" onclick="submitInventoryFound()">Submit</button>
                        </div>
                    </div>
                </div>
                <div style="display:none;">
            `;

            const serialField = form.addField({ id: 'custpage_serial_numbers', type: serverWidget.FieldType.TEXTAREA, label: 'Serials' });
            serialField.updateDisplaySize({ height: 10, width: 60 });

            const nsItemField = form.addField({ id: 'custpage_ns_item', type: serverWidget.FieldType.SELECT, label: 'Item', source: 'item' });
            nsItemField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            const nsBinField = form.addField({ id: 'custpage_ns_bin', type: serverWidget.FieldType.SELECT, label: 'From Bin', source: 'bin' });
            nsBinField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            const nsQtyField = form.addField({ id: 'custpage_ns_quantity', type: serverWidget.FieldType.INTEGER, label: 'Quantity' });
            nsQtyField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            const nsActionField = form.addField({ id: 'custpage_ns_action', type: serverWidget.FieldType.SELECT, label: 'Action' });
            nsActionField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            nsActionField.addSelectOption({ value: '', text: '-- Select Action --' });
            nsActionField.addSelectOption({ value: 'back_to_stock', text: 'Back to Stock' });
            nsActionField.addSelectOption({ value: 'likenew', text: 'Change to Like New' });
            nsActionField.addSelectOption({ value: 'likenew_stock', text: 'Change to Like New & Back to Stock' });
            nsActionField.addSelectOption({ value: 'defective', text: 'Defective' });
            nsActionField.addSelectOption({ value: 'move_refurbishing', text: 'Move to Refurbishing' });
            nsActionField.addSelectOption({ value: 'move_testing', text: 'Move to Testing' });
            nsActionField.addSelectOption({ value: 'return_to_vendor', text: 'Return to Vendor' });
            nsActionField.addSelectOption({ value: 'trash', text: 'Trash' });
            nsActionField.addSelectOption({ value: 'inventory_found', text: 'Inventory Found' });

            const ifItemField = form.addField({ id: 'custpage_if_item_name', type: serverWidget.FieldType.TEXT, label: 'IF Item' });
            ifItemField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); ifItemField.defaultValue = '';
            const ifSerialsField = form.addField({ id: 'custpage_if_serials', type: serverWidget.FieldType.LONGTEXT, label: 'IF Serials' });
            ifSerialsField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); ifSerialsField.defaultValue = '';
            const nsCartDataField = form.addField({ id: 'custpage_ns_cart_json', type: serverWidget.FieldType.LONGTEXT, label: 'NS Cart Data' });
            nsCartDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); nsCartDataField.defaultValue = '';
            const bpSerialsField = form.addField({ id: 'custpage_bp_serials', type: serverWidget.FieldType.TEXTAREA, label: 'BP Serials' });
            bpSerialsField.updateDisplaySize({ height: 10, width: 60 });
            if (prefill && prefill.bpSerials) bpSerialsField.defaultValue = prefill.bpSerials;
            const bpToBinField = form.addField({ id: 'custpage_bp_to_bin', type: serverWidget.FieldType.TEXT, label: 'BP To Bin' });
            bpToBinField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            bpToBinField.defaultValue = (prefill && prefill.bpToBin) || '';
            const bpCartDataField = form.addField({ id: 'custpage_bp_cart_json', type: serverWidget.FieldType.LONGTEXT, label: 'BP Cart Data' });
            bpCartDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); bpCartDataField.defaultValue = '';
            const bpModeField = form.addField({ id: 'custpage_bp_mode', type: serverWidget.FieldType.TEXT, label: 'BP Mode' });
            bpModeField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); bpModeField.defaultValue = '';

            let prefillScript = '';
            if (prefill && prefill.mode === 'binputaway') {
                const escapedToBin = (prefill.bpToBin || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                prefillScript = "switchMode('binputaway');" + (prefill.bpMode === 'nonserialized' ? "switchBpMode('nonserialized');" : '') + "var bti=document.getElementById('bp_to_bin');if(bti)bti.value='" + escapedToBin + "';updateBpCount();";
            }

            const containerEnd = form.addField({ id: 'custpage_container_end', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerEnd.defaultValue = `</div>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    var sw = document.getElementById('serial-field-wrap');
                    var sl = document.getElementById('custpage_serial_numbers_fs_lbl_uir_label');
                    if (sw && sl) sw.appendChild(sl.parentNode);
                    var bw = document.getElementById('bp-serial-field-wrap');
                    var bl = document.getElementById('custpage_bp_serials_fs_lbl_uir_label');
                    if (bw && bl) bw.appendChild(bl.parentNode);
                    updateCount();
                    addNsGridRow();
                    addBpNsGridRow();
                    var bf = document.getElementById('custpage_bp_serials');
                    if (bf) { bf.addEventListener('input', updateBpCount); bf.addEventListener('paste', function() { setTimeout(updateBpCount, 50); }); }
                    ${prefillScript}
                });
            </script>`;

            context.response.writePage(form);
        }

        function createResultsPage(context, serialData, message, messageType) {
            const form = serverWidget.createForm({ title: 'Serial Lookup Results' });
            const suiteletUrl = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId });

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getResultsPageScript(suiteletUrl);

            let rows = '';
            const hasLocation26Serials = serialData.valid.some(s => String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID);
            serialData.valid.forEach((s, idx) => {
                const isLoc26 = String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID;
                const transferOption = isLoc26 ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : '';
                rows += '<tr>'
                    + '<td data-label="Serial" style="font-family:\'SF Mono\',Monaco,monospace;font-size:14px;">' + escapeXml(s.serialNumber) + '</td>'
                    + '<td data-label="Item"><strong>' + escapeXml(s.itemText) + '</strong></td>'
                    + '<td data-label="Bin">' + (escapeXml(s.binText) || '<span style="color:#9ca3af;">N/A</span>') + '</td>'
                    + '<td data-label="Location">' + (escapeXml(s.locationText) || '<span style="color:#9ca3af;">N/A</span>') + '</td>'
                    + '<td data-label="Action"><select class="action-select" data-index="' + idx + '" data-location="' + escapeXml(String(s.locationId)) + '" onchange="handleActionChange(this)">'
                    + '<option value="">-- No Action --</option>'
                    + '<option value="back_to_stock">Back to Stock</option>'
                    + '<option value="likenew">Change to Like New</option>'
                    + '<option value="likenew_stock">Change to Like New &amp; Back to Stock</option>'
                    + '<option value="serial_change_stock">Change Serial &amp; Back to Stock</option>'
                    + '<option value="defective">Defective</option>'
                    + '<option value="move_refurbishing">Move to Refurbishing</option>'
                    + '<option value="move_testing">Move to Testing</option>'
                    + '<option value="part_number_change">Part Number Change</option>'
                    + '<option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option>'
                    + '<option value="return_to_vendor">Return to Vendor</option>'
                    + '<option value="serial_change">Serial Number Change</option>'
                    + '<option value="trash">Trash</option>'
                    + transferOption
                    + '</select>'
                    + '<input type="text" class="new-serial-input" data-index="' + idx + '" placeholder="New serial" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;">'
                    + '<input type="text" class="new-item-input" data-index="' + idx + '" placeholder="New item name" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;">'
                    + '<input type="number" class="upcharge-input" data-index="' + idx + '" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;">'
                    + '</td></tr>';
            });

            let invalidHtml = '';
            if (serialData.invalid.length > 0) {
                const invalidList = serialData.invalid.map(s => '<span class="badge badge-error">' + escapeXml(s) + '</span>').join(' ');
                invalidHtml = '<div class="alert alert-warning"><strong>Not found (' + serialData.invalid.length + '):</strong><br><div style="margin-top:8px;">' + invalidList + '</div></div>';
            }

            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'alert-success' : messageType === 'warning' ? 'alert-warning' : 'alert-error';
                msgHtml = '<div class="alert ' + cls + '">' + message + '</div>';
            }

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container app-container-wide">
                    ${msgHtml}${invalidHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>Lookup Results</h1>
                            <p>${serialData.valid.length} serial${serialData.valid.length !== 1 ? 's' : ''} found</p>
                        </div>
                        <div class="form-body">
                            <div class="bulk-action-bar" style="flex-wrap:wrap;">
                                <label>Apply to All:</label>
                                <select class="action-select" onchange="setAllActions(this.value)" style="flex:1;">
                                    <option value="">-- No Action --</option>
                                    <option value="back_to_stock">Back to Stock</option>
                                    <option value="likenew">Change to Like New</option>
                                    <option value="likenew_stock">Change to Like New &amp; Back to Stock</option>
                                    <option value="serial_change_stock">Change Serial &amp; Back to Stock</option>
                                    <option value="defective">Defective</option>
                                    <option value="move_refurbishing">Move to Refurbishing</option>
                                    <option value="move_testing">Move to Testing</option>
                                    <option value="part_number_change">Part Number Change</option>
                                    <option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option>
                                    <option value="return_to_vendor">Return to Vendor</option>
                                    <option value="serial_change">Serial Number Change</option>
                                    <option value="trash">Trash</option>
                                    ${hasLocation26Serials ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : ''}
                                </select>
                                <input type="text" id="bulk-new-item" placeholder="New item name" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;">
                                <input type="number" id="bulk-upcharge" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;">
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <span style="color:#6b7280;font-weight:600;font-size:13px;">Selected:</span>
                                    <span style="font-size:22px;font-weight:800;color:#1a4971;" id="action_count">0</span>
                                    <button type="button" class="custom-btn btn-success" style="padding:10px 20px;margin:0;" onclick="submitActions()">Submit</button>
                                    <button type="button" class="custom-btn btn-outline" style="padding:10px 20px;margin:0;" onclick="goBack()">Back</button>
                                </div>
                            </div>
                            <table class="results-table">
                                <thead><tr><th>Serial</th><th>Item</th><th>Bin</th><th>Location</th><th>Action</th></tr></thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            const dataField = form.addField({ id: 'custpage_serial_data', type: serverWidget.FieldType.LONGTEXT, label: 'Data' });
            dataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            dataField.defaultValue = JSON.stringify(serialData);
            const actionsField = form.addField({ id: 'custpage_actions_json', type: serverWidget.FieldType.LONGTEXT, label: 'Actions' });
            actionsField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            actionsField.defaultValue = '';

            context.response.writePage(form);
        }

        function createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId, transferOrderTranId) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });
            const suiteletUrl = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId, returnExternalUrl: true });

            labelGroups.forEach((group, idx) => {
                try {
                    const rec = record.create({ type: 'customrecord_print_label', isDynamic: true });
                    rec.setValue({ fieldId: 'custrecord_pl_item_number', value: group.itemId });
                    rec.setValue({ fieldId: 'custrecord_express_entry', value: group.serialNumbers.join('<br>') });
                    group.recordId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                } catch (e) { log.error('Print Label Record Error', e.message); group.recordId = 'ERR'; }
            });

            const printData = labelGroups.map(g => ({ itemText: g.itemText || '', description: g.description || '', serialNumbers: g.serialNumbers }));
            const recordIdForPrint = adjustmentTranId || binTransferTranId || serialChangeTranId || partNumberChangeTranId || transferOrderTranId || '';

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl);

            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printDataField.defaultValue = JSON.stringify(printData);
            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printRecordIdField.defaultValue = String(recordIdForPrint);

            const ACTION_LABELS = {
                'back_to_stock':'Back to Stock','defective':'Defective','likenew':'Like New',
                'likenew_stock':'Like New + Back to Stock','move_refurbishing':'Move to Refurbishing',
                'move_testing':'Move to Testing','return_to_vendor':'Return to Vendor',
                'serial_change':'Serial Number Change','serial_change_stock':'Change Serial & Back to Stock',
                'part_number_change':'Part Number Change','part_number_change_stock':'Part Number Change & Back to Stock',
                'trash':'Trash','inventory_found':'Inventory Found','bin_putaway':'Bin Putaway',
                'transfer_upcharge':'Transfer to A & Upcharge'
            };

            let groupsHtml = '';
            labelGroups.forEach(group => {
                const serialListHtml = group.serialNumbers.map(s => '<li>' + escapeXml(s) + '</li>').join('');
                groupsHtml += '<div class="label-group"><h3>' + escapeXml(group.itemText) + '</h3>'
                    + '<p style="color:#6b7280;margin:0 0 10px;font-size:13px;">' + group.serialNumbers.length + ' label' + (group.serialNumbers.length !== 1 ? 's' : '') + ' &bull; ' + (ACTION_LABELS[group.action] || group.action) + '</p>'
                    + '<ul class="serial-list">' + serialListHtml + '</ul></div>';
            });

            const totalSerials = labelGroups.reduce((sum, g) => sum + g.serialNumbers.length, 0);

            let transactionInfoHtml = '';
            if (adjustmentTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Adjustment:</strong> ' + escapeXml(String(adjustmentTranId)) + '</p>';
            if (binTransferTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Bin Transfer:</strong> ' + escapeXml(String(binTransferTranId)) + '</p>';
            if (serialChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Serial Change:</strong> ' + escapeXml(String(serialChangeTranId)) + '</p>';
            if (partNumberChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Part # Change:</strong> ' + escapeXml(String(partNumberChangeTranId)) + '</p>';
            if (inventoryFoundTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Found:</strong> ' + escapeXml(String(inventoryFoundTranId)) + '</p>';
            if (transferOrderTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Transfer Order:</strong> ' + escapeXml(String(transferOrderTranId)) + '</p>';

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    <div class="main-card">
                        <div class="form-body">
                            <div class="success-card">
                                <div class="success-icon">&#10003;</div>
                                <h2>Done!</h2>
                                ${transactionInfoHtml}
                                <p style="color:#6b7280;margin-top:12px;">${totalSerials} serial${totalSerials !== 1 ? 's' : ''} processed</p>
                                ${groupsHtml}
                            </div>
                        </div>
                        <div class="btn-area" style="flex-direction:column;">
                            <button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (${totalSerials})</button>
                            <button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Process More</button>
                        </div>
                    </div>
                </div>
            `;

            context.response.writePage(form);
        }

        function createNonSerializedSuccessPage(context, adjustmentTranId, binTransferTranId, itemDetails, quantity, action, inventoryFoundTranId) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });
            const suiteletUrl = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId, returnExternalUrl: true });
            const printData = [{ itemText: itemDetails.displayname || itemDetails.itemid, description: itemDetails.description || '', quantity: quantity }];
            const recordIdForPrint = adjustmentTranId || binTransferTranId || inventoryFoundTranId || '';

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl);
            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printDataField.defaultValue = JSON.stringify(printData);
            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printRecordIdField.defaultValue = String(recordIdForPrint);

            const ACTION_LABELS = {'back_to_stock':'Back to Stock','defective':'Defective','likenew':'Change to Like New','likenew_stock':'Change to Like New & Back to Stock','move_refurbishing':'Move to Refurbishing','move_testing':'Move to Testing','return_to_vendor':'Return to Vendor','trash':'Trash','inventory_found':'Inventory Found','bin_putaway':'Bin Putaway'};

            let transactionInfoHtml = '';
            if (adjustmentTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Adjustment:</strong> ' + escapeXml(String(adjustmentTranId)) + '</p>';
            if (binTransferTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Bin Transfer:</strong> ' + escapeXml(String(binTransferTranId)) + '</p>';
            if (inventoryFoundTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Found:</strong> ' + escapeXml(String(inventoryFoundTranId)) + '</p>';

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container"><div class="main-card"><div class="form-body"><div class="success-card">
                    <div class="success-icon">&#10003;</div><h2>Done!</h2>${transactionInfoHtml}
                    <div class="label-group" style="margin-top:20px;">
                        <h3>${escapeXml(itemDetails.displayname || itemDetails.itemid)}</h3>
                        <p style="color:#6b7280;margin:0;font-size:13px;">Qty: ${quantity} &bull; ${ACTION_LABELS[action] || action}</p>
                    </div>
                </div></div>
                <div class="btn-area" style="flex-direction:column;">
                    <button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (${quantity})</button>
                    <button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Process More</button>
                </div></div></div>
            `;
            context.response.writePage(form);
        }

        function createNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors, transferOrderTranId) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });
            const suiteletUrl = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId, returnExternalUrl: true });
            const printData = processedItems.map(function(item) { return { itemText: item.itemText || '', description: item.description || '', quantity: item.quantity }; });
            const recordIdForPrint = adjustmentTranId || binTransferTranId || inventoryFoundTranId || transferOrderTranId || '';

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl);
            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printDataField.defaultValue = JSON.stringify(printData);
            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printRecordIdField.defaultValue = String(recordIdForPrint);

            const ACTION_LABELS = {'back_to_stock':'Back to Stock','defective':'Defective','likenew':'Change to Like New','likenew_stock':'Change to Like New & Back to Stock','move_refurbishing':'Move to Refurbishing','move_testing':'Move to Testing','return_to_vendor':'Return to Vendor','trash':'Trash','inventory_found':'Inventory Found','bin_putaway':'Bin Putaway','transfer_upcharge':'Transfer to A & Upcharge'};

            let transactionInfoHtml = '';
            if (adjustmentTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Adjustment:</strong> ' + escapeXml(String(adjustmentTranId)) + '</p>';
            if (binTransferTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Bin Transfer:</strong> ' + escapeXml(String(binTransferTranId)) + '</p>';
            if (inventoryFoundTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Found:</strong> ' + escapeXml(String(inventoryFoundTranId)) + '</p>';
            if (transferOrderTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Transfer Order:</strong> ' + escapeXml(String(transferOrderTranId)) + '</p>';

            let itemRows = '', totalQty = 0;
            processedItems.forEach(function(item) {
                totalQty += item.quantity;
                itemRows += '<tr><td data-label="Item"><strong>' + escapeXml(item.itemText) + '</strong></td><td data-label="Qty">' + item.quantity + '</td><td data-label="Action">' + escapeXml(ACTION_LABELS[item.action] || item.action) + '</td></tr>';
            });

            let errorsHtml = '';
            if (errors && errors.length > 0) errorsHtml = '<div class="alert alert-warning"><strong>Warnings:</strong> ' + escapeXml(errors.join('; ')) + '</div>';

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">${errorsHtml}<div class="main-card"><div class="form-body"><div class="success-card">
                    <div class="success-icon">&#10003;</div><h2>Done!</h2>${transactionInfoHtml}
                    <p style="color:#6b7280;margin-top:12px;">${processedItems.length} item${processedItems.length !== 1 ? 's' : ''} (${totalQty} total qty)</p>
                    <table class="results-table" style="margin-top:20px;text-align:left;">
                        <thead><tr><th>Item</th><th>Qty</th><th>Action</th></tr></thead>
                        <tbody>${itemRows}</tbody>
                    </table>
                </div></div>
                <div class="btn-area" style="flex-direction:column;">
                    <button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (${totalQty})</button>
                    <button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Process More</button>
                </div></div></div>
            `;
            context.response.writePage(form);
        }

        // ====================================================================
        // POST HANDLERS (identical business logic, same as original)
        // ====================================================================

        function handleLookupSerials(context) {
            const serialInput = context.request.parameters.custpage_serial_numbers || '';
            const serialTexts = cleanSerialInput(serialInput);
            if (serialTexts.length === 0) { createEntryForm(context, 'Enter or scan at least one serial number.', 'warning'); return; }
            const serialData = lookupSerialDetails(serialTexts);
            if (serialData.valid.length === 0) { createEntryForm(context, 'None of the scanned serial numbers were found in stock.', 'error'); return; }
            createResultsPage(context, serialData);
        }

        function handleProcessActions(context) {
            const serialDataRaw = context.request.parameters.custpage_serial_data;
            const actionsRaw = context.request.parameters.custpage_actions_json;
            if (!serialDataRaw || !actionsRaw) { createEntryForm(context, 'Missing data. Please start over.', 'error'); return; }

            let serialData, actions;
            try { serialData = JSON.parse(serialDataRaw); actions = JSON.parse(actionsRaw); } catch (e) { createEntryForm(context, 'Invalid data. Please start over.', 'error'); return; }

            const actionMap = {};
            actions.forEach(a => { if (a.action && a.action !== '') actionMap[a.index] = { action: a.action, newSerial: a.newSerial || '', newItemName: a.newItemName || '', upcharge: parseFloat(a.upcharge) || 0 }; });
            if (Object.keys(actionMap).length === 0) { createResultsPage(context, serialData, 'Select an action for at least one serial number.', 'warning'); return; }

            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const SERIAL_CHANGE_ACTIONS = ['serial_change', 'serial_change_stock'];
            const PART_NUMBER_CHANGE_ACTIONS = ['part_number_change', 'part_number_change_stock'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];
            const TRANSFER_UPCHARGE_ACTIONS = ['transfer_upcharge'];

            const errors = [];
            const itemDetailsCache = {};
            const targetItemCache = {};
            const partNumberTargetCache = {};
            const adjustmentGroupMap = {};
            const binTransferGroupMap = {};
            const serialChangeList = [];
            const partNumberChangeList = [];
            const inventoryFoundGroupMap = {};
            const transferUpchargeGroupMap = {};

            for (const [idxStr, actionData] of Object.entries(actionMap)) {
                const idx = parseInt(idxStr, 10);
                const serial = serialData.valid[idx];
                if (!serial) continue;
                const action = actionData.action;
                const newItemName = actionData.newItemName;
                const newSerial = actionData.newSerial;
                const itemId = serial.itemId;

                if (!itemDetailsCache[itemId]) {
                    const details = getItemDetails(itemId);
                    if (details) itemDetailsCache[itemId] = details;
                    else { errors.push('Could not look up item details for: ' + serial.itemText); continue; }
                }
                const itemDetails = itemDetailsCache[itemId];

                if (ADJUSTMENT_ACTIONS.includes(action)) {
                    if (!targetItemCache[itemId]) {
                        const likeNewName = getLikeNewItemName(itemDetails.itemid);
                        const targetItem = findItemByName(likeNewName);
                        targetItemCache[itemId] = targetItem ? { found: true, targetItem: targetItem } : { found: false };
                        if (!targetItem) errors.push('Like New item not found: ' + likeNewName);
                    }
                    if (!targetItemCache[itemId].found) continue;
                    const cache = targetItemCache[itemId];
                    const key = itemId + '_' + serial.locationId + '_' + action;
                    if (!adjustmentGroupMap[key]) adjustmentGroupMap[key] = { sourceItemId: itemId, sourceItemName: itemDetails.itemid, targetItemId: cache.targetItem.id, targetItemName: cache.targetItem.itemid, targetDisplayName: cache.targetItem.displayname, targetDescription: cache.targetItem.description, locationId: serial.locationId, action: action, serials: [] };
                    adjustmentGroupMap[key].serials.push({ serialNumber: serial.serialNumber, serialId: serial.serialId, binId: serial.binId });
                } else if (BIN_TRANSFER_ACTIONS.includes(action)) {
                    const key = itemId + '_' + serial.locationId + '_' + action;
                    if (!binTransferGroupMap[key]) binTransferGroupMap[key] = { itemId: itemId, itemText: itemDetails.displayname || itemDetails.itemid, itemDescription: itemDetails.description, locationId: serial.locationId, action: action, serials: [] };
                    binTransferGroupMap[key].serials.push({ serialNumber: serial.serialNumber, serialId: serial.serialId, binId: serial.binId });
                } else if (SERIAL_CHANGE_ACTIONS.includes(action)) {
                    if (!newSerial) { errors.push('New serial required for: ' + serial.serialNumber); continue; }
                    serialChangeList.push({ itemId: itemId, itemText: itemDetails.displayname || itemDetails.itemid, itemDescription: itemDetails.description, locationId: serial.locationId, oldSerialNumber: serial.serialNumber, oldSerialId: serial.serialId, newSerialNumber: newSerial, binId: serial.binId, statusId: serial.statusId, action: action });
                } else if (PART_NUMBER_CHANGE_ACTIONS.includes(action)) {
                    if (!newItemName) { errors.push('New item name required for: ' + serial.serialNumber); continue; }
                    if (!partNumberTargetCache[newItemName]) {
                        const ti = findItemByName(newItemName);
                        partNumberTargetCache[newItemName] = ti ? { found: true, targetItem: ti } : { found: false };
                        if (!ti) errors.push('Item not found: ' + newItemName);
                    }
                    if (!partNumberTargetCache[newItemName].found) continue;
                    const pnc = partNumberTargetCache[newItemName];
                    partNumberChangeList.push({ oldItemId: itemId, oldItemText: itemDetails.displayname || itemDetails.itemid, newItemId: pnc.targetItem.id, newItemName: pnc.targetItem.itemid, newItemText: pnc.targetItem.displayname || pnc.targetItem.itemid, newItemDescription: pnc.targetItem.description, locationId: serial.locationId, serialNumber: serial.serialNumber, serialId: serial.serialId, binId: serial.binId, statusId: serial.statusId, action: action });
                } else if (INVENTORY_FOUND_ACTIONS.includes(action)) {
                    const key = itemId + '_' + serial.locationId + '_' + action;
                    if (!inventoryFoundGroupMap[key]) inventoryFoundGroupMap[key] = { itemId: itemId, itemText: itemDetails.displayname || itemDetails.itemid, itemDescription: itemDetails.description, locationId: serial.locationId, action: action, serials: [] };
                    inventoryFoundGroupMap[key].serials.push({ serialNumber: serial.serialNumber, serialId: serial.serialId, binId: serial.binId });
                } else if (TRANSFER_UPCHARGE_ACTIONS.includes(action)) {
                    const upchargeAmount = actionData.upcharge || 0;
                    if (upchargeAmount <= 0) { errors.push('Upcharge amount required for: ' + serial.serialNumber); continue; }
                    const key = itemId + '_' + upchargeAmount;
                    if (!transferUpchargeGroupMap[key]) transferUpchargeGroupMap[key] = { itemId: itemId, itemText: itemDetails.displayname || itemDetails.itemid, itemDescription: itemDetails.description, upchargePerUnit: upchargeAmount, action: action, serials: [] };
                    transferUpchargeGroupMap[key].serials.push({ serialNumber: serial.serialNumber, serialId: serial.serialId, binId: serial.binId });
                }
            }

            const adjustmentGroups = Object.values(adjustmentGroupMap);
            const binTransferGroups = Object.values(binTransferGroupMap);
            const inventoryFoundGroups = Object.values(inventoryFoundGroupMap);
            const transferUpchargeGroups = Object.values(transferUpchargeGroupMap);

            if (adjustmentGroups.length === 0 && binTransferGroups.length === 0 && serialChangeList.length === 0 && partNumberChangeList.length === 0 && inventoryFoundGroups.length === 0 && transferUpchargeGroups.length === 0) {
                createResultsPage(context, serialData, errors.length > 0 ? 'Could not process: ' + errors.join('; ') : 'No valid serials to process.', 'error'); return;
            }

            let adjustmentTranId = null, binTransferTranId = null, serialChangeTranId = null, partNumberChangeTranId = null, inventoryFoundTranId = null, transferOrderTranId = null;
            const labelGroups = [];

            if (adjustmentGroups.length > 0) {
                try {
                    const r = createConditionChangeAdjustment(adjustmentGroups, 'Created via WH Assistant');
                    adjustmentTranId = r.tranId;
                    adjustmentGroups.forEach(g => {
                        let ex = labelGroups.find(lg => lg.itemId === g.targetItemId && lg.action === g.action);
                        if (!ex) { ex = { itemId: g.targetItemId, itemText: g.targetDisplayName || g.targetItemName, description: g.targetDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                        g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                    });
                } catch (e) { log.error('Adjustment Error', e.message); createResultsPage(context, serialData, 'Adjustment failed: ' + e.message, 'error'); return; }
            }
            if (binTransferGroups.length > 0) {
                try {
                    const r = createBinTransfer(binTransferGroups, 'Via WH Assistant');
                    binTransferTranId = r.tranId;
                    binTransferGroups.forEach(g => {
                        let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action);
                        if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                        g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                    });
                } catch (e) { log.error('Bin Transfer Error', e.message); createResultsPage(context, serialData, 'Bin transfer failed: ' + e.message, 'error'); return; }
            }
            if (serialChangeList.length > 0) {
                try {
                    const r = createSerialNumberChangeAdjustment(serialChangeList, 'Serial Change via WH Assistant');
                    serialChangeTranId = r.tranId;
                    serialChangeList.forEach(c => {
                        let ex = labelGroups.find(lg => lg.itemId === c.itemId && lg.action === c.action);
                        if (!ex) { ex = { itemId: c.itemId, itemText: c.itemText, description: c.itemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); }
                        ex.serialNumbers.push(c.newSerialNumber);
                    });
                } catch (e) { log.error('Serial Change Error', e.message); createResultsPage(context, serialData, 'Serial change failed: ' + e.message, 'error'); return; }
            }
            if (partNumberChangeList.length > 0) {
                try {
                    const r = createPartNumberChangeAdjustment(partNumberChangeList, 'Part # Change via WH Assistant');
                    partNumberChangeTranId = r.tranId;
                    partNumberChangeList.forEach(c => {
                        let ex = labelGroups.find(lg => lg.itemId === c.newItemId && lg.action === c.action);
                        if (!ex) { ex = { itemId: c.newItemId, itemText: c.newItemText, description: c.newItemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); }
                        ex.serialNumbers.push(c.serialNumber);
                    });
                } catch (e) { log.error('Part Number Change Error', e.message); createResultsPage(context, serialData, 'Part number change failed: ' + e.message, 'error'); return; }
            }
            if (inventoryFoundGroups.length > 0) {
                try {
                    const r = createInventoryFoundAdjustment(inventoryFoundGroups, 'Inv Found via WH Assistant');
                    inventoryFoundTranId = r.tranId;
                    inventoryFoundGroups.forEach(g => {
                        let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action);
                        if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                        g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                    });
                } catch (e) { log.error('Inventory Found Error', e.message); createResultsPage(context, serialData, 'Inventory found failed: ' + e.message, 'error'); return; }
            }
            if (transferUpchargeGroups.length > 0) {
                try {
                    const toTranIds = [];
                    transferUpchargeGroups.forEach(g => {
                        const r = createTransferOrderWithUpcharge({ itemId: g.itemId, itemText: g.itemText, serials: g.serials, upchargePerUnit: g.upchargePerUnit, memo: 'Xfer & Upcharge via WH Asst' });
                        toTranIds.push(r.transferOrderTranId);
                        let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action);
                        if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                        g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                    });
                    transferOrderTranId = toTranIds.join(', ');
                } catch (e) { log.error('Transfer Order Error', e.message); createResultsPage(context, serialData, 'Transfer order failed: ' + e.message, 'error'); return; }
            }

            createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId, transferOrderTranId);
        }

        function handleProcessInventoryFound(context) {
            const itemName = (context.request.parameters.custpage_if_item_name || '').trim();
            const serialsRaw = (context.request.parameters.custpage_if_serials || '').trim();
            if (!itemName) { createEntryForm(context, 'Item name is required.', 'error'); return; }
            if (!serialsRaw) { createEntryForm(context, 'At least one serial number is required.', 'error'); return; }
            const item = findItemByName(itemName);
            if (!item) { createEntryForm(context, 'Item not found: ' + itemName, 'error'); return; }
            const serials = serialsRaw.split(/[\r\n]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
            const uniqueSerials = []; const seen = {};
            serials.forEach(function(s) { if (!seen[s]) { seen[s] = true; uniqueSerials.push(s); } });
            if (uniqueSerials.length === 0) { createEntryForm(context, 'No valid serial numbers.', 'error'); return; }

            const groups = [{ itemId: item.id, itemText: item.displayname || item.itemid, itemDescription: item.description, locationId: '1', action: 'inventory_found', serials: uniqueSerials.map(function(s) { return { serialNumber: s, serialId: null, binId: null }; }) }];
            try {
                const r = createInventoryFoundAdjustment(groups, 'Inv Found via WH Assistant');
                createSuccessPage(context, null, null, [{ itemId: item.id, itemText: item.displayname || item.itemid, description: item.description, action: 'inventory_found', serialNumbers: uniqueSerials }], null, r.tranId, null);
            } catch (e) { log.error('Inventory Found Error', e.message); createEntryForm(context, 'Adjustment failed: ' + e.message, 'error'); }
        }

        function handleProcessNonSerialized(context) {
            const itemId = context.request.parameters.custpage_ns_item;
            const fromBinId = context.request.parameters.custpage_ns_bin;
            const quantity = parseInt(context.request.parameters.custpage_ns_quantity) || 0;
            const action = context.request.parameters.custpage_ns_action;
            if (!itemId) { createEntryForm(context, 'Please select an item.', 'warning'); return; }
            if (!fromBinId) { createEntryForm(context, 'Please select a From Bin.', 'warning'); return; }
            if (quantity <= 0) { createEntryForm(context, 'Please enter a valid quantity.', 'warning'); return; }
            if (!action) { createEntryForm(context, 'Please select an action.', 'warning'); return; }
            const itemDetails = getItemDetails(itemId);
            if (!itemDetails) { createEntryForm(context, 'Could not find item details.', 'error'); return; }

            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];
            let adjustmentTranId = null, binTransferTranId = null, inventoryFoundTranId = null;
            let labelItemDetails = itemDetails;
            const locationId = '1';

            if (ADJUSTMENT_ACTIONS.includes(action)) {
                const likeNewName = getLikeNewItemName(itemDetails.itemid);
                const targetItem = findItemByName(likeNewName);
                if (!targetItem) { createEntryForm(context, 'Like New item not found: ' + likeNewName, 'error'); return; }
                labelItemDetails = { itemid: targetItem.itemid, displayname: targetItem.displayname, description: targetItem.description };
                let toBinId = null, toStatusId = null;
                if (action === 'likenew_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                try {
                    const r = createNonSerializedAdjustment({ sourceItemId: itemId, sourceItemName: itemDetails.itemid, targetItemId: targetItem.id, targetItemName: targetItem.itemid, locationId: locationId, quantity: quantity, fromBinId: fromBinId, toBinId: toBinId || fromBinId, toStatusId: toStatusId }, 'Created via WH Assistant');
                    adjustmentTranId = r.tranId;
                } catch (e) { log.error('NS Adjustment Error', e.message); createEntryForm(context, 'Adjustment failed: ' + e.message, 'error'); return; }
            } else if (BIN_TRANSFER_ACTIONS.includes(action)) {
                let toBinId, toStatusId;
                if (action === 'move_testing') { toBinId = TESTING_BIN_ID; toStatusId = TESTING_STATUS_ID; }
                else if (action === 'move_refurbishing') { toBinId = REFURBISHING_BIN_ID; toStatusId = REFURBISHING_STATUS_ID; }
                else if (action === 'back_to_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                else if (action === 'defective') { toBinId = DEFECTIVE_BIN_ID; toStatusId = DEFECTIVE_STATUS_ID; }
                else if (action === 'trash') { toBinId = TRASH_BIN_ID; toStatusId = TRASH_STATUS_ID; }
                else if (action === 'return_to_vendor') { toBinId = RETURN_TO_VENDOR_BIN_ID; toStatusId = RETURN_TO_VENDOR_STATUS_ID; }
                try {
                    const r = createNonSerializedBinTransfer({ itemId: itemId, locationId: locationId, quantity: quantity, fromBinId: fromBinId, toBinId: toBinId, toStatusId: toStatusId }, 'Via WH Assistant');
                    binTransferTranId = r.tranId;
                } catch (e) { log.error('NS Bin Transfer Error', e.message); createEntryForm(context, 'Bin transfer failed: ' + e.message, 'error'); return; }
            } else if (INVENTORY_FOUND_ACTIONS.includes(action)) {
                try {
                    const r = createNonSerializedInventoryFoundAdjustment({ itemId: itemId, locationId: locationId, quantity: quantity }, 'Inv Found via WH Assistant');
                    inventoryFoundTranId = r.tranId;
                } catch (e) { log.error('NS Inv Found Error', e.message); createEntryForm(context, 'Inventory found failed: ' + e.message, 'error'); return; }
            }
            createNonSerializedSuccessPage(context, adjustmentTranId, binTransferTranId, labelItemDetails, quantity, action, inventoryFoundTranId);
        }

        function handleProcessNonSerializedMulti(context) {
            const cartDataRaw = context.request.parameters.custpage_ns_cart_json;
            if (!cartDataRaw) { createEntryForm(context, 'Missing cart data.', 'error'); return; }
            let cartRows;
            try { cartRows = JSON.parse(cartDataRaw); } catch (e) { createEntryForm(context, 'Invalid cart data.', 'error'); return; }
            if (!cartRows || cartRows.length === 0) { createEntryForm(context, 'No items in the grid.', 'warning'); return; }

            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];
            const TRANSFER_UPCHARGE_ACTIONS = ['transfer_upcharge'];
            const locationId = '1'; const errors = [];
            const adjustmentRows = [], binTransferRows = [], inventoryFoundRows = [], transferUpchargeRows = [];
            const itemCache = {}, binCache = {}, targetItemCache = {};

            cartRows.forEach(function(row, idx) {
                const itemName = (row.itemName || '').trim(), binNumber = (row.binNumber || '').trim();
                const action = row.action, quantity = parseInt(row.quantity) || 0, upcharge = parseFloat(row.upcharge) || 0;
                const rowLabel = 'Row ' + (idx + 1);
                if (!itemName || !action || quantity <= 0) { errors.push(rowLabel + ': missing fields'); return; }
                if (!itemCache[itemName]) { const i = findItemByName(itemName); if (i) itemCache[itemName] = i; else { errors.push(rowLabel + ': item not found "' + itemName + '"'); return; } }
                const itemData = itemCache[itemName];
                let fromBinId = null;
                if (binNumber) { if (!binCache[binNumber]) { const b = findBinByNumber(binNumber, locationId); if (b) binCache[binNumber] = b; else { errors.push(rowLabel + ': bin not found "' + binNumber + '"'); return; } } fromBinId = binCache[binNumber].id; }

                if (ADJUSTMENT_ACTIONS.indexOf(action) !== -1) {
                    if (!targetItemCache[itemData.id]) { const ln = getLikeNewItemName(itemData.itemid); const ti = findItemByName(ln); if (!ti) { errors.push(rowLabel + ': LN item not found "' + ln + '"'); targetItemCache[itemData.id] = { found: false }; } else targetItemCache[itemData.id] = { found: true, targetItem: ti }; }
                    if (!targetItemCache[itemData.id].found) return;
                    const c = targetItemCache[itemData.id];
                    let toBinId = null, toStatusId = null;
                    if (action === 'likenew_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                    adjustmentRows.push({ sourceItemId: itemData.id, sourceItemName: itemData.itemid, targetItemId: c.targetItem.id, targetItemName: c.targetItem.itemid, targetDisplayName: c.targetItem.displayname, targetDescription: c.targetItem.description, locationId: locationId, quantity: quantity, fromBinId: fromBinId, toBinId: toBinId || fromBinId, toStatusId: toStatusId, action: action });
                } else if (BIN_TRANSFER_ACTIONS.indexOf(action) !== -1) {
                    let toBinId, toStatusId;
                    if (action === 'move_testing') { toBinId = TESTING_BIN_ID; toStatusId = TESTING_STATUS_ID; }
                    else if (action === 'move_refurbishing') { toBinId = REFURBISHING_BIN_ID; toStatusId = REFURBISHING_STATUS_ID; }
                    else if (action === 'back_to_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                    else if (action === 'defective') { toBinId = DEFECTIVE_BIN_ID; toStatusId = DEFECTIVE_STATUS_ID; }
                    else if (action === 'trash') { toBinId = TRASH_BIN_ID; toStatusId = TRASH_STATUS_ID; }
                    else if (action === 'return_to_vendor') { toBinId = RETURN_TO_VENDOR_BIN_ID; toStatusId = RETURN_TO_VENDOR_STATUS_ID; }
                    binTransferRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId: locationId, quantity: quantity, fromBinId: fromBinId, toBinId: toBinId, toStatusId: toStatusId, action: action });
                } else if (INVENTORY_FOUND_ACTIONS.indexOf(action) !== -1) {
                    inventoryFoundRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId: locationId, quantity: quantity, action: action });
                } else if (TRANSFER_UPCHARGE_ACTIONS.indexOf(action) !== -1) {
                    if (upcharge <= 0) { errors.push(rowLabel + ': upcharge required'); return; }
                    transferUpchargeRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId: locationId, quantity: quantity, upcharge: upcharge, action: action });
                }
            });

            if (adjustmentRows.length === 0 && binTransferRows.length === 0 && inventoryFoundRows.length === 0 && transferUpchargeRows.length === 0) {
                createEntryForm(context, errors.length > 0 ? 'Errors: ' + errors.join('; ') : 'No valid items to process.', 'error'); return;
            }

            let adjustmentTranId = null, binTransferTranId = null, inventoryFoundTranId = null, transferOrderTranId = null;
            const processedItems = [];

            if (adjustmentRows.length > 0) {
                try {
                    const r = createNonSerializedAdjustmentMulti(adjustmentRows, 'Created via WH Assistant');
                    adjustmentTranId = r.tranId;
                    adjustmentRows.forEach(function(row) { processedItems.push({ itemText: row.targetDisplayName || row.targetItemName, description: row.targetDescription, quantity: row.quantity, action: row.action }); });
                } catch (e) { log.error('NS Multi Adjustment Error', e.message); errors.push('Adjustment failed: ' + e.message); }
            }
            if (binTransferRows.length > 0) {
                try {
                    const r = createNonSerializedBinTransferMulti(binTransferRows, 'Via WH Assistant');
                    binTransferTranId = r.tranId;
                    binTransferRows.forEach(function(row) { processedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action }); });
                } catch (e) { log.error('NS Multi Bin Transfer Error', e.message); errors.push('Bin transfer failed: ' + e.message); }
            }
            if (inventoryFoundRows.length > 0) {
                try {
                    const r = createNonSerializedInventoryFoundMulti(inventoryFoundRows, 'Inv Found via WH Assistant');
                    inventoryFoundTranId = r.tranId;
                    inventoryFoundRows.forEach(function(row) { processedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action }); });
                } catch (e) { log.error('NS Multi Inv Found Error', e.message); errors.push('Inventory found failed: ' + e.message); }
            }
            if (transferUpchargeRows.length > 0) {
                try {
                    const toTranIds = [];
                    transferUpchargeRows.forEach(function(row) {
                        const r = createTransferOrderWithUpcharge({ itemId: row.itemId, itemText: row.itemText, serials: [], quantity: row.quantity, upchargePerUnit: row.upcharge, memo: 'Xfer & Upcharge via WH Asst' });
                        toTranIds.push(r.transferOrderTranId);
                        processedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action });
                    });
                    transferOrderTranId = toTranIds.join(', ');
                } catch (e) { log.error('NS Multi Transfer Error', e.message); errors.push('Transfer order failed: ' + e.message); }
            }

            if (processedItems.length === 0) { createEntryForm(context, 'All operations failed: ' + errors.join('; '), 'error'); return; }
            createNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors, transferOrderTranId);
        }

        function handleBinPutaway(context) {
            const bpMode = context.request.parameters.custpage_bp_mode || 'serialized';

            if (bpMode === 'serialized') {
                const toBinNumber = (context.request.parameters.custpage_bp_to_bin || '').trim();
                const serialsRaw = context.request.parameters.custpage_bp_serials || '';
                if (!toBinNumber) { createEntryForm(context, 'Destination bin is required.', 'warning', { mode: 'binputaway', bpSerials: serialsRaw }); return; }
                const serialTexts = cleanSerialInput(serialsRaw);
                if (serialTexts.length === 0) { createEntryForm(context, 'Enter or scan at least one serial number.', 'warning', { mode: 'binputaway', bpToBin: toBinNumber }); return; }

                const toBin = findBinByNumber(toBinNumber, '1');
                if (!toBin) { createEntryForm(context, 'Bin not found: ' + toBinNumber, 'error', { mode: 'binputaway', bpToBin: toBinNumber, bpSerials: serialsRaw }); return; }

                const serialData = lookupSerialDetails(serialTexts);
                if (serialData.valid.length === 0) {
                    const invalidMsg = serialData.invalid.length > 0 ? 'Not found: ' + serialData.invalid.join(', ') : 'None of the serials were found in stock.';
                    createEntryForm(context, invalidMsg, 'error', { mode: 'binputaway', bpToBin: toBinNumber }); return;
                }

                const groupMap = {};
                serialData.valid.forEach(function(s) {
                    const key = s.itemId + '_' + s.locationId;
                    if (!groupMap[key]) groupMap[key] = { itemId: s.itemId, itemText: s.itemText, locationId: s.locationId, action: 'bin_putaway', serials: [] };
                    groupMap[key].serials.push({ serialNumber: s.serialNumber, serialId: s.serialId, binId: s.binId });
                });

                const groups = Object.values(groupMap);
                groups.forEach(function(g) {
                    g.serials.forEach(function(s) { s.toBinId = toBin.id; });
                });

                try {
                    const transferRecord = record.create({ type: record.Type.BIN_TRANSFER, isDynamic: true });
                    transferRecord.setValue({ fieldId: 'subsidiary', value: '1' });
                    transferRecord.setValue({ fieldId: 'memo', value: 'Bin Putaway via WH Assistant' });
                    if (groups.length > 0) transferRecord.setValue({ fieldId: 'location', value: groups[0].locationId });

                    groups.forEach(function(group) {
                        transferRecord.selectNewLine({ sublistId: 'inventory' });
                        transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                        transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: group.serials.length });
                        const invDetail = transferRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                        group.serials.forEach(function(serial) {
                            invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                            invDetail.setCurrentSublistText({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', text: serial.serialNumber });
                            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1 });
                            if (serial.binId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: serial.binId });
                            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'tobinnumber', value: toBin.id });
                            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'toinventorystatus', value: BACK_TO_STOCK_STATUS_ID });
                            invDetail.commitLine({ sublistId: 'inventoryassignment' });
                        });
                        transferRecord.commitLine({ sublistId: 'inventory' });
                    });

                    const transferId = transferRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
                    let tranId = String(transferId);
                    try { const l = search.lookupFields({ type: record.Type.BIN_TRANSFER, id: transferId, columns: ['tranid'] }); tranId = l.tranid || String(transferId); } catch (e) {}

                    const labelGroups = groups.map(function(g) {
                        return { itemId: g.itemId, itemText: g.itemText, description: '', action: 'bin_putaway', serialNumbers: g.serials.map(function(s) { return s.serialNumber; }) };
                    });

                    let invalidMsg = '';
                    if (serialData.invalid.length > 0) invalidMsg = 'Note: ' + serialData.invalid.length + ' serial(s) not found and skipped.';

                    createSuccessPage(context, null, tranId, labelGroups, null, null, null, null);
                } catch (e) {
                    log.error('Bin Putaway Error', e.message);
                    createEntryForm(context, 'Bin putaway failed: ' + e.message, 'error', { mode: 'binputaway', bpToBin: toBinNumber });
                }
            } else {
                // Non-serialized bin putaway
                const cartDataRaw = context.request.parameters.custpage_bp_cart_json;
                if (!cartDataRaw) { createEntryForm(context, 'Missing cart data.', 'error', { mode: 'binputaway', bpMode: 'nonserialized' }); return; }
                let cartRows;
                try { cartRows = JSON.parse(cartDataRaw); } catch (e) { createEntryForm(context, 'Invalid cart data.', 'error', { mode: 'binputaway', bpMode: 'nonserialized' }); return; }
                if (!cartRows || cartRows.length === 0) { createEntryForm(context, 'No items in the grid.', 'warning', { mode: 'binputaway', bpMode: 'nonserialized' }); return; }

                const locationId = '1';
                const errors = [];
                const transferRows = [];
                const itemCache = {}, binCache = {};

                cartRows.forEach(function(row, idx) {
                    const itemName = (row.itemName || '').trim();
                    const fromBinNumber = (row.fromBinNumber || '').trim();
                    const toBinNumber = (row.toBinNumber || '').trim();
                    const quantity = parseInt(row.quantity) || 0;
                    const rowLabel = 'Row ' + (idx + 1);

                    if (!itemName || !fromBinNumber || !toBinNumber || quantity <= 0) { errors.push(rowLabel + ': missing fields'); return; }
                    if (!itemCache[itemName]) { const i = findItemByName(itemName); if (i) itemCache[itemName] = i; else { errors.push(rowLabel + ': item not found "' + itemName + '"'); return; } }
                    if (!binCache[fromBinNumber]) { const b = findBinByNumber(fromBinNumber, locationId); if (b) binCache[fromBinNumber] = b; else { errors.push(rowLabel + ': from bin not found "' + fromBinNumber + '"'); return; } }
                    if (!binCache[toBinNumber]) { const b = findBinByNumber(toBinNumber, locationId); if (b) binCache[toBinNumber] = b; else { errors.push(rowLabel + ': to bin not found "' + toBinNumber + '"'); return; } }

                    transferRows.push({
                        itemId: itemCache[itemName].id, itemText: itemCache[itemName].displayname || itemCache[itemName].itemid,
                        description: itemCache[itemName].description, locationId: locationId, quantity: quantity,
                        fromBinId: binCache[fromBinNumber].id, toBinId: binCache[toBinNumber].id,
                        toStatusId: BACK_TO_STOCK_STATUS_ID, action: 'bin_putaway'
                    });
                });

                if (transferRows.length === 0) { createEntryForm(context, errors.length > 0 ? 'Errors: ' + errors.join('; ') : 'No valid items.', 'error', { mode: 'binputaway', bpMode: 'nonserialized' }); return; }

                try {
                    const r = createNonSerializedBinTransferMulti(transferRows, 'Bin Putaway via WH Assistant');
                    const processedItems = transferRows.map(function(row) { return { itemText: row.itemText, description: row.description, quantity: row.quantity, action: 'bin_putaway' }; });
                    createNonSerializedMultiSuccessPage(context, null, r.tranId, null, processedItems, errors, null);
                } catch (e) {
                    log.error('NS Bin Putaway Error', e.message);
                    createEntryForm(context, 'Bin putaway failed: ' + e.message, 'error', { mode: 'binputaway', bpMode: 'nonserialized' });
                }
            }
        }

        // ====================================================================
        // MAIN ENTRY POINT
        // ====================================================================

        function onRequest(context) {
            try {
                if (context.request.method === 'GET') {
                    createEntryForm(context);
                    return;
                }

                // POST handling
                const action = context.request.parameters.custpage_action;

                // Session-safe navigation: POST-based "go home" instead of GET redirect
                if (action === 'go_home') {
                    createEntryForm(context);
                    return;
                }

                if (action === 'lookup_serials') {
                    handleLookupSerials(context);
                } else if (action === 'process_actions') {
                    handleProcessActions(context);
                } else if (action === 'process_nonserialized') {
                    handleProcessNonSerialized(context);
                } else if (action === 'process_nonserialized_multi') {
                    handleProcessNonSerializedMulti(context);
                } else if (action === 'process_inventory_found') {
                    handleProcessInventoryFound(context);
                } else if (action === 'process_bin_putaway') {
                    handleBinPutaway(context);
                } else if (action === 'printpdf') {
                    const printDataRaw = context.request.parameters.custpage_print_data;
                    const recordId = context.request.parameters.custpage_print_record_id || '';
                    if (!printDataRaw) { createEntryForm(context, 'No print data found.', 'error'); return; }
                    let printData;
                    try { printData = JSON.parse(printDataRaw); } catch (e) { createEntryForm(context, 'Invalid print data.', 'error'); return; }
                    const pdfFile = generateLabelsPdf(printData, recordId);
                    context.response.writeFile({ file: pdfFile, isInline: true });
                } else {
                    createEntryForm(context, 'Unknown action.', 'warning');
                }
            } catch (e) {
                log.error('onRequest Error', e.message + '\n' + e.stack);
                try { createEntryForm(context, 'An unexpected error occurred: ' + e.message, 'error'); }
                catch (e2) { context.response.write('Error: ' + e.message); }
            }
        }

        return { onRequest: onRequest };
    });
