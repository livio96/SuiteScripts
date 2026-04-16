/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Amazon Removal Order Suitelet — Custom HTML UI (Light Mode, Optimized)
 * Creates ARO record, ARO items, Transfer Order, Item Fulfillment, and Item Receipt
 * + Embedded Warehouse Assistant (Scan / Process / Print Labels)
 */
define(['N/record', 'N/search', 'N/log', 'N/url', 'N/runtime', 'N/ui/serverWidget', 'N/render', 'N/encode', 'N/file'],
    (record, search, log, url, runtime, serverWidget, render, encode, file) => {

        // ══════════════════════════════════════════════
        // ARO CONSTANTS
        // ══════════════════════════════════════════════
        const LOCATIONS = {
            AMAZON_US: '22',
            AMAZON_CA: '23',
            AMAZON_MX: '28',
            TRANSFER_TO: '1',
            LINE_TRANSFER: '2',
        };

        const ACCOUNT_TO_LOCATION = {
            '1': '22',
            '101': '23',
            '201': '28'
        };

        // ══════════════════════════════════════════════
        // WAREHOUSE ASSISTANT CONSTANTS
        // ══════════════════════════════════════════════
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

        const RECEIPT_BIN_ID = 1028;
        const RECEIPT_STATUS_ID = 6;

        const SERIAL_LOOKUP_LOCATION_ID = '1';
        const TRANSFER_SOURCE_LOCATION_ID = '26';
        const SERIAL_LOOKUP_LOCATION_IDS = [SERIAL_LOOKUP_LOCATION_ID, TRANSFER_SOURCE_LOCATION_ID];
        const TRANSFER_DESTINATION_LOCATION_ID = '1';
        const LANDED_COST_CATEGORY_ID = 21697;

        // ──────────────────────────────────────────────
        // PAGED SEARCH HELPER (avoids 4000-result limit)
        // ──────────────────────────────────────────────
        const runSearchAll = (searchObj, callback) => {
            const pagedData = searchObj.runPaged({ pageSize: 1000 });
            pagedData.pageRanges.forEach(pageRange => {
                pagedData.fetch({ index: pageRange.index }).data.forEach(result => {
                    callback(result);
                });
            });
        };

        // ──────────────────────────────────────────────
        // ENTRY POINT
        // ──────────────────────────────────────────────
        const WH_ACTIONS = ['go_home','lookup_serials','process_actions','process_nonserialized','process_nonserialized_multi','process_inventory_found','process_aro_received','next_stage','printpdf','new_aro'];

        const onRequest = (context) => {
            if (context.request.method === 'GET') {
                renderForm(context);
                return;
            }

            // POST routing
            const custAction = context.request.parameters.custpage_action;

            if (!custAction) {
                processForm(context);
                return;
            }

            if (custAction === 'new_aro') { renderForm(context); return; }
            if (custAction === 'create_issue') { handleCreateIssue(context); return; }
            if (custAction === 'validate_fnskus') { handleValidateFnskus(context); return; }

            // Warehouse Assistant routing
            try {
                if (custAction === 'go_home') return createWhEntryForm(context);
                if (custAction === 'lookup_serials') return whHandleLookupSerials(context);
                if (custAction === 'process_actions') return whHandleProcessActions(context);
                if (custAction === 'process_nonserialized') return whHandleProcessNonSerialized(context);
                if (custAction === 'process_nonserialized_multi') return whHandleProcessNonSerializedMulti(context);
                if (custAction === 'process_inventory_found') return whHandleProcessInventoryFound(context);
                if (custAction === 'process_aro_received') return handleProcessAroReceived(context);
                if (custAction === 'next_stage') return whHandleNextStage(context);
                if (custAction === 'printpdf') {
                    const printDataRaw = context.request.parameters.custpage_print_data;
                    const recordId = context.request.parameters.custpage_print_record_id || '';
                    if (!printDataRaw) { createWhEntryForm(context, 'No print data found.', 'error'); return; }
                    let printData;
                    try { printData = JSON.parse(printDataRaw); } catch (pe) { createWhEntryForm(context, 'Invalid print data.', 'error'); return; }
                    const pdfFile = whGenerateLabelsPdf(printData, recordId);
                    context.response.writeFile({ file: pdfFile, isInline: true });
                    return;
                }
                createWhEntryForm(context, 'Unknown action.', 'warning');
            } catch (whErr) {
                log.error({ title: 'WH Assistant Error', details: whErr.message + '\n' + whErr.stack });
                try { createWhEntryForm(context, 'An unexpected error occurred: ' + whErr.message, 'error'); }
                catch (e2) { context.response.write('Error: ' + whErr.message); }
            }
        };

        // ──────────────────────────────────────────────
        // GET — Render HTML Form
        // ──────────────────────────────────────────────
        const renderForm = (context) => {
            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId
            });
            context.response.write(getFormHtml(suiteletUrl));
        };

        // ──────────────────────────────────────────────
        // POST — Process form and create all records
        // ──────────────────────────────────────────────
        const processForm = (context) => {
            const results = {
                aroId: null,
                aroName: null,
                aroItemIds: [],
                transferOrderId: null,
                transferOrderTranId: null,
                fulfillmentId: null,
                fulfillmentTranId: null,
                receiptId: null,
                receiptTranId: null,
                errors: [],
                warnings: [],
                itemsSummary: []
            };

            try {
                const request = context.request;
                const removalOrderId = request.parameters.custpage_removal_order_id;
                const trackingNumber = request.parameters.custpage_tracking_number;
                const rawItems = JSON.parse(request.parameters.custpage_items_json || '[]');

                if (!removalOrderId) {
                    throw new Error('Removal Order ID is required.');
                }
                if (!rawItems.length) {
                    throw new Error('No items entered. Add at least one FNSKU.');
                }

                // ── Step 1: BATCH resolve all FNSKUs in one search ──
                const fnskuList = rawItems.map(r => r.fnsku);
                const fnskuMap = batchLookupFNSKUs(fnskuList);

                const items = [];
                for (const raw of rawItems) {
                    const lookup = fnskuMap[raw.fnsku];
                    if (!lookup) {
                        throw new Error('No matching Celigo eTail item alias found for FNSKU: ' + raw.fnsku);
                    }
                    items.push({
                        fnsku: raw.fnsku,
                        quantity: raw.quantity,
                        itemId: lookup.itemId,
                        amazonAccount: lookup.amazonAccount
                    });
                }

                const fromLocation = ACCOUNT_TO_LOCATION[items[0].amazonAccount] || LOCATIONS.AMAZON_US;

                // ── Step 2: Create ARO Parent ──
                const aroRec = record.create({ type: 'customrecord_aro', isDynamic: true });
                aroRec.setValue({ fieldId: 'custrecord_aro_id', value: removalOrderId });
                aroRec.setValue({ fieldId: 'name', value: removalOrderId });
                aroRec.setValue({ fieldId: 'custrecord_aro_status', value: '1' });
                if (trackingNumber) {
                    aroRec.setValue({ fieldId: 'custrecord_aro_shipment_id', value: trackingNumber });
                }
                results.aroId = aroRec.save({ enableSourcing: false, ignoreMandatoryFields: true });
                results.aroName = removalOrderId;
                log.audit('ARO Created', results.aroId);

                // ── Step 3: Create ARO Item Children ──
                for (const item of items) {
                    const aroItemRec = record.create({ type: 'customrecord_aro_item', isDynamic: false });
                    aroItemRec.setValue({ fieldId: 'custrecord_aro_item_fnsku', value: item.fnsku });
                    aroItemRec.setValue({ fieldId: 'custrecord_aro_item_quantity', value: item.quantity });
                    aroItemRec.setValue({ fieldId: 'custrecord_aro_item_item', value: item.itemId });
                    aroItemRec.setValue({ fieldId: 'custrecord_aro_item_removal_order', value: results.aroId });
                    results.aroItemIds.push(
                        aroItemRec.save({ enableSourcing: false, ignoreMandatoryFields: true })
                    );
                    results.itemsSummary.push({ fnsku: item.fnsku, qty: item.quantity });
                }
                log.audit('ARO Items Created', results.aroItemIds.length);

                // ── Step 4: Create Transfer Order ──
                const toRec = record.create({ type: record.Type.TRANSFER_ORDER, isDynamic: true });
                toRec.setValue({ fieldId: 'subsidiary', value: '1' });
                toRec.setValue({ fieldId: 'location', value: fromLocation });
                toRec.setValue({ fieldId: 'transferlocation', value: LOCATIONS.TRANSFER_TO });
                toRec.setValue({ fieldId: 'memo', value: removalOrderId });
                toRec.setValue({ fieldId: 'custbody_cps_fba_shipment_id', value: removalOrderId });
                toRec.setValue({ fieldId: 'custbody_cps_fba_removal_order_id', value: removalOrderId });

                for (const item of items) {
                    toRec.selectNewLine({ sublistId: 'item' });
                    toRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item.itemId });
                    toRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: item.quantity });
                    toRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: LOCATIONS.LINE_TRANSFER });
                    toRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_fnsku', value: item.fnsku });
                    toRec.commitLine({ sublistId: 'item' });
                }

                toRec.setValue({ fieldId: 'orderstatus', value: 'B' });
                toRec.setValue({ fieldId: 'shipmethod', value: 186632 });
                results.transferOrderId = toRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
                results.transferOrderTranId = getTranId(record.Type.TRANSFER_ORDER, results.transferOrderId);
                log.audit('TO Created', results.transferOrderTranId);

                // ── Step 5: BATCH pre-fetch serialization + serial numbers, then fulfill ──
                const uniqueItemIds = [...new Set(items.map(i => i.itemId))];
                let serializedSet = new Set();
                let usedSerials = {};
                try {
                    serializedSet = batchCheckSerialized(uniqueItemIds);
                    const serialMap = batchGetSerialNumbers(uniqueItemIds, fromLocation, serializedSet);

                    const fulfillResult = createItemFulfillment(
                        results.transferOrderId, serializedSet, serialMap
                    );
                    results.fulfillmentId = fulfillResult.fulfillmentId;
                    usedSerials = fulfillResult.usedSerials;
                    results.fulfillmentTranId = getTranId(record.Type.ITEM_FULFILLMENT, results.fulfillmentId);
                    log.audit('IF Created', results.fulfillmentTranId);
                } catch (e) {
                    const msg = 'Fulfillment: ' + ((e && e.message) ? e.message : e.toString());
                    log.error('Fulfillment Error', msg);
                    results.warnings.push(msg);
                }

                // ── Step 6: Item Receipt ──
                if (results.fulfillmentId) {
                    try {
                        results.receiptId = createItemReceipt(results.transferOrderId);
                        results.receiptTranId = getTranId(record.Type.ITEM_RECEIPT, results.receiptId);
                        log.audit('IR Created', results.receiptTranId);
                    } catch (e) {
                        const msg = 'Receipt: ' + ((e && e.message) ? e.message : e.toString());
                        log.error('Receipt Error', msg);
                        results.warnings.push(msg);
                    }
                }

                // ── Step 6b: Look up received items for the action table ──
                if (results.receiptId) {
                    try {
                        // Batch get item names + lot item flag
                        const itemNameMap = {};
                        runSearchAll(search.create({
                            type: 'item',
                            filters: [['internalid', 'anyof', uniqueItemIds]],
                            columns: ['itemid', 'displayname', 'description', 'islotitem']
                        }), r => {
                            itemNameMap[String(r.id)] = {
                                itemid: r.getValue('itemid'),
                                displayname: r.getValue('displayname'),
                                description: r.getValue('description'),
                                islotitem: r.getValue('islotitem')
                            };
                        });

                        // Collect serial texts from fulfilled serials and look them up at destination
                        const allSerialTexts = [];
                        Object.values(usedSerials).forEach(serials => {
                            serials.forEach(s => { if (s.text) allSerialTexts.push(s.text); });
                        });

                        if (allSerialTexts.length > 0) {
                            results.serialData = whLookupSerialDetails(allSerialTexts);
                            log.audit('Post-Receipt Serial Lookup', allSerialTexts.length + ' serials, ' + results.serialData.valid.length + ' found');
                        }

                        // Build received items list for non-serialized
                        // All items received on the TO receipt land in bin 1028 / status 6
                        const nsItemIds = items
                            .filter(i => !serializedSet.has(String(i.itemId)))
                            .map(i => String(i.itemId));

                        // For lot-numbered items, look up the lot number at the receipt bin
                        const nsLotMap = {}; // { itemId: { lotNumberId, lotNumberText } }
                        const lotItemIds = nsItemIds.filter(iid => {
                            const info = itemNameMap[iid] || {};
                            return info.islotitem === true || info.islotitem === 'T';
                        });
                        if (lotItemIds.length > 0) {
                            try {
                                runSearchAll(search.create({
                                    type: 'inventorybalance',
                                    filters: [
                                        ['item', 'anyof', lotItemIds],
                                        'AND',
                                        ['location', 'anyof', LOCATIONS.TRANSFER_TO],
                                        'AND',
                                        ['binnumber', 'anyof', String(RECEIPT_BIN_ID)],
                                        'AND',
                                        ['onhand', 'greaterthan', '0']
                                    ],
                                    columns: [
                                        search.createColumn({ name: 'item' }),
                                        search.createColumn({ name: 'inventorynumber' })
                                    ]
                                }), r => {
                                    const iid = String(r.getValue('item'));
                                    if (!nsLotMap[iid]) {
                                        nsLotMap[iid] = {
                                            lotNumberId: r.getValue('inventorynumber') || '',
                                            lotNumberText: r.getText('inventorynumber') || ''
                                        };
                                    }
                                });
                            } catch (e) {
                                log.debug('NS Lot Lookup', e.message);
                            }
                        }

                        results.nonSerializedItems = items
                            .filter(i => !serializedSet.has(String(i.itemId)))
                            .map(i => {
                                const info = itemNameMap[String(i.itemId)] || {};
                                const lotInfo = nsLotMap[String(i.itemId)] || {};
                                return {
                                    itemId: i.itemId,
                                    fnsku: i.fnsku,
                                    quantity: i.quantity,
                                    itemText: info.displayname || info.itemid || String(i.itemId),
                                    itemName: info.itemid || '',
                                    description: info.description || '',
                                    binId: String(RECEIPT_BIN_ID),
                                    binText: 'Receiving',
                                    statusId: String(RECEIPT_STATUS_ID),
                                    isLotItem: (info.islotitem === true || info.islotitem === 'T'),
                                    lotNumberId: lotInfo.lotNumberId || '',
                                    lotNumberText: lotInfo.lotNumberText || ''
                                };
                            });
                    } catch (e) {
                        log.error('Post-Receipt Lookup Error', e.message);
                        // Non-fatal: results page will still show transactions without action table
                    }
                }

                // ── Step 7: Update ARO with submitFields ──
                const aroValues = {
                    custrecord_aro_transfer_order: results.transferOrderId,
                    custrecord_transfer_order_created: true
                };
                if (results.fulfillmentId) aroValues.custrecord_aro_item_fulfilment = results.fulfillmentId;
                if (results.receiptId) aroValues.custrecord_aro_item_receipt = results.receiptId;

                record.submitFields({
                    type: 'customrecord_aro',
                    id: results.aroId,
                    values: aroValues,
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });
                log.audit('ARO Updated', 'All links saved.');

            } catch (e) {
                const errorMsg = (e && e.message) ? e.message : e.toString();
                log.error('Processing Error', errorMsg);
                results.errors.push(errorMsg);

                if (results.aroId) {
                    try {
                        record.submitFields({
                            type: 'customrecord_aro',
                            id: results.aroId,
                            values: { custrecord_aro_error_details: errorMsg },
                            options: { enableSourcing: false, ignoreMandatoryFields: true }
                        });
                    } catch (ignore) { /* best effort */ }
                }
            }

            renderResultsPage(context, results);
        };

        // ──────────────────────────────────────────────
        // GET TRANID — lightweight lookup
        // ──────────────────────────────────────────────
        const getTranId = (recordType, internalId) => {
            try {
                const fields = search.lookupFields({
                    type: recordType,
                    id: internalId,
                    columns: ['tranid']
                });
                return fields.tranid || String(internalId);
            } catch (e) {
                return String(internalId);
            }
        };

        // ──────────────────────────────────────────────
        // BATCH FNSKU LOOKUP
        // ──────────────────────────────────────────────
        const batchLookupFNSKUs = (fnskuList) => {
            const filters = [['isinactive', 'is', 'F']];
            const orFilters = [];
            for (const fnsku of fnskuList) {
                if (orFilters.length > 0) orFilters.push('OR');
                orFilters.push(['custrecord_fnsku', 'contains', fnsku]);
            }
            filters.push('AND');
            filters.push(orFilters);

            const aliasSearch = search.create({
                type: 'customrecord_celigo_etail_item_alias',
                filters: filters,
                columns: [
                    search.createColumn({ name: 'custrecord_fnsku' }),
                    search.createColumn({ name: 'internalid', join: 'CUSTRECORD_CELIGO_ETAIL_ALIAS_PAR_ITEM' }),
                    search.createColumn({ name: 'custrecord_celigo_etail_alias_amz_acc' })
                ]
            });

            const map = {};
            runSearchAll(aliasSearch, (result) => {
                const fnsku = result.getValue({ name: 'custrecord_fnsku' });
                for (const requested of fnskuList) {
                    if (fnsku && fnsku.indexOf(requested) !== -1 && !map[requested]) {
                        map[requested] = {
                            itemId: result.getValue({ name: 'internalid', join: 'CUSTRECORD_CELIGO_ETAIL_ALIAS_PAR_ITEM' }),
                            amazonAccount: result.getValue({ name: 'custrecord_celigo_etail_alias_amz_acc' })
                        };
                    }
                }
            });

            return map;
        };

        // ──────────────────────────────────────────────
        // BATCH SERIALIZATION CHECK
        // ──────────────────────────────────────────────
        const batchCheckSerialized = (itemIds) => {
            const serializedSet = new Set();
            if (!itemIds.length) return serializedSet;

            runSearchAll(search.create({
                type: 'item',
                filters: [
                    ['internalid', 'anyof', itemIds],
                    'AND',
                    ['isserialitem', 'is', 'T']
                ],
                columns: ['internalid']
            }), (result) => {
                serializedSet.add(String(result.id));
            });

            return serializedSet;
        };

        // ──────────────────────────────────────────────
        // BATCH SERIAL NUMBERS
        // ──────────────────────────────────────────────
        const batchGetSerialNumbers = (itemIds, locationId, serializedSet) => {
            const serialMap = {};
            const serializedIds = itemIds.filter(id => serializedSet.has(String(id)));
            if (!serializedIds.length) return serialMap;

            runSearchAll(search.create({
                type: 'inventorybalance',
                filters: [
                    ['item', 'anyof', serializedIds],
                    'AND',
                    ['location', 'anyof', locationId],
                    'AND',
                    ['inventorynumber.isonhand', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'item' }),
                    search.createColumn({ name: 'inventorynumber', sort: search.Sort.ASC })
                ]
            }), (result) => {
                const itemId = String(result.getValue({ name: 'item' }));
                if (!serialMap[itemId]) serialMap[itemId] = [];
                serialMap[itemId].push({
                    id: result.getValue({ name: 'inventorynumber' }),
                    text: result.getText({ name: 'inventorynumber' })
                });
            });

            return serialMap;
        };

        // ──────────────────────────────────────────────
        // ITEM FULFILLMENT
        // ──────────────────────────────────────────────
        const createItemFulfillment = (transferOrderId, serializedSet, serialMap) => {
            const fulfillment = record.transform({
                fromType: record.Type.TRANSFER_ORDER,
                fromId: transferOrderId,
                toType: record.Type.ITEM_FULFILLMENT,
                isDynamic: true
            });

            fulfillment.setValue({ fieldId: 'shipstatus', value: 'C' });

            const numLines = fulfillment.getLineCount({ sublistId: 'item' });
            let hasFulfillmentLines = false;
            const usedSerials = {}; // { itemId: [{id, text}] }

            for (let i = 0; i < numLines; i++) {
                fulfillment.selectLine({ sublistId: 'item', line: i });

                const itemId = String(fulfillment.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' }));

                if (serializedSet.has(itemId)) {
                    const quantity = fulfillment.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });
                    const available = serialMap[itemId] || [];

                    if (available.length >= quantity) {
                        const selectedSerials = pickRandomSerials(available, quantity);

                        fulfillment.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });

                        const inventoryDetail = fulfillment.getCurrentSublistSubrecord({
                            sublistId: 'item',
                            fieldId: 'inventorydetail'
                        });

                        for (const serial of selectedSerials) {
                            inventoryDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                            inventoryDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: serial.id
                            });
                            inventoryDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment', fieldId: 'quantity', value: 1
                            });
                            inventoryDetail.commitLine({ sublistId: 'inventoryassignment' });
                        }

                        // Remove used serials from pool
                        for (const s of selectedSerials) {
                            const idx = available.findIndex(a => a.id === s.id);
                            if (idx !== -1) available.splice(idx, 1);
                        }

                        // Track used serials for post-receipt lookup
                        if (!usedSerials[itemId]) usedSerials[itemId] = [];
                        selectedSerials.forEach(s => usedSerials[itemId].push(s));

                        hasFulfillmentLines = true;
                    } else {
                        log.debug('Insufficient Serials', 'Item ' + itemId + ': need ' + quantity + ', have ' + available.length);
                        fulfillment.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: false });
                    }
                } else {
                    fulfillment.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });
                    hasFulfillmentLines = true;
                }

                fulfillment.commitLine({ sublistId: 'item' });
            }

            if (!hasFulfillmentLines) {
                throw new Error('No items could be fulfilled (insufficient serial numbers or no items).');
            }

            const fulfillmentId = fulfillment.save({ enableSourcing: false, ignoreMandatoryFields: true });
            return { fulfillmentId, usedSerials };
        };

        // ──────────────────────────────────────────────
        // ITEM RECEIPT
        // ──────────────────────────────────────────────
        const createItemReceipt = (transferOrderId) => {
            const receipt = record.transform({
                fromType: record.Type.TRANSFER_ORDER,
                fromId: transferOrderId,
                toType: record.Type.ITEM_RECEIPT,
                isDynamic: true
            });

            const numLines = receipt.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < numLines; i++) {
                receipt.selectLine({ sublistId: 'item', line: i });
                receipt.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });

                const qty = receipt.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });

                // Override inventory detail to receive into bin 1028 / status 6
                try {
                    const invDetail = receipt.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                    const existingLines = invDetail.getLineCount({ sublistId: 'inventoryassignment' });
                    if (existingLines > 0) {
                        // Modify the existing default line
                        invDetail.selectLine({ sublistId: 'inventoryassignment', line: 0 });
                        invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: RECEIPT_BIN_ID });
                        invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: RECEIPT_STATUS_ID });
                        invDetail.commitLine({ sublistId: 'inventoryassignment' });
                    } else {
                        // No default line — create one
                        invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                        invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: qty });
                        invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: RECEIPT_BIN_ID });
                        invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: RECEIPT_STATUS_ID });
                        invDetail.commitLine({ sublistId: 'inventoryassignment' });
                    }
                } catch (detailErr) {
                    // Item may not use bins/inventory detail — safe to skip
                    log.debug('IR inventory detail skip', 'Line ' + i + ': ' + detailErr.message);
                }

                receipt.commitLine({ sublistId: 'item' });
            }

            return receipt.save({ enableSourcing: false, ignoreMandatoryFields: true });
        };

        const pickRandomSerials = (pool, quantity) => {
            const copy = pool.slice();
            const selected = [];
            for (let i = 0; i < quantity; i++) {
                const idx = Math.floor(Math.random() * copy.length);
                selected.push(copy[idx]);
                copy.splice(idx, 1);
            }
            return selected;
        };

        // ══════════════════════════════════════════════
        // HTML TEMPLATES
        // ══════════════════════════════════════════════

        const getSharedStyles = () => {
            return `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #f4f5f7;
    --surface: #ffffff;
    --surface-hover: #fafafa;
    --border: #e2e4e9;
    --border-focus: #e97a0b;
    --text: #1a1d27;
    --text-muted: #6b7080;
    --accent: #e97a0b;
    --accent-dim: rgba(233, 122, 11, 0.08);
    --danger: #dc2626;
    --danger-dim: rgba(220, 38, 38, 0.06);
    --success: #16a34a;
    --success-dim: rgba(22, 163, 74, 0.07);
    --warning: #d97706;
    --warning-dim: rgba(217, 119, 6, 0.07);
    --mono: 'JetBrains Mono', monospace;
    --sans: 'DM Sans', sans-serif;
    --radius: 8px;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  }

  body { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; }

  .topbar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 16px 32px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: var(--shadow-sm);
  }

  .topbar-icon {
    width: 38px; height: 38px;
    border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }

  .topbar h1 { font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
  .topbar span { font-size: 12px; color: var(--text-muted); }

  .container { max-width: 900px; margin: 32px auto; padding: 0 24px; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 20px;
    box-shadow: var(--shadow-sm);
  }

  .card-header { padding: 20px 24px 0; }

  .card-header h2 {
    font-size: 13px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .card-body { padding: 20px 24px 24px; }`;
        };

        const getFormHtml = (suiteletUrl) => {
            return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Amazon Removal Order</title>
<style>
  ${getSharedStyles()}

  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-group label { font-size: 13px; font-weight: 500; color: var(--text-muted); }

  .form-group input {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 10px 14px;
    font-family: var(--mono); font-size: 14px; color: var(--text);
    outline: none; transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-group input:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--accent-dim); }
  .form-group input::placeholder { color: #b0b4c0; }

  .items-table { width: 100%; border-collapse: collapse; }

  .items-table thead th {
    text-align: left; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted); padding: 0 12px 12px;
    border-bottom: 1px solid var(--border);
  }

  .items-table thead th:first-child { padding-left: 0; }
  .items-table thead th:last-child { width: 48px; text-align: center; }
  .items-table tbody tr { transition: background 0.15s; }
  .items-table tbody tr:hover { background: var(--surface-hover); }
  .items-table tbody td { padding: 6px 12px; vertical-align: middle; }
  .items-table tbody td:first-child { padding-left: 0; }
  .items-table tbody td:last-child { text-align: center; padding-right: 0; }

  .items-table input {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 9px 12px;
    font-family: var(--mono); font-size: 14px; color: var(--text);
    width: 100%; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
  }

  .items-table input:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--accent-dim); }
  .items-table input::placeholder { color: #b0b4c0; }

  .row-num { font-family: var(--mono); font-size: 12px; color: var(--text-muted); width: 28px; text-align: center; }

  .btn-remove-row {
    background: none; border: 1px solid transparent; border-radius: 6px;
    color: #c0c4d0; cursor: pointer; width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; transition: all 0.15s;
  }

  .btn-remove-row:hover { color: var(--danger); background: var(--danger-dim); border-color: rgba(220,38,38,0.2); }

  .btn-add-row {
    background: none; border: 1px dashed var(--border); border-radius: var(--radius);
    color: var(--text-muted); font-family: var(--sans); font-size: 13px; font-weight: 500;
    padding: 10px; width: 100%; cursor: pointer; transition: all 0.2s; margin-top: 12px;
  }

  .btn-add-row:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }

  .btn-submit {
    background: var(--accent); color: #fff; border: none; border-radius: var(--radius);
    padding: 12px 32px; font-family: var(--sans); font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center;
    gap: 8px; box-shadow: 0 1px 3px rgba(233,122,11,0.3);
  }

  .btn-submit:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 3px 8px rgba(233,122,11,0.25); }
  .btn-submit:active { transform: translateY(0); }
  .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; filter: none; box-shadow: none; }

  .actions { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
  .actions-hint { font-size: 12px; color: var(--text-muted); }

  .loading-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(244,245,247,0.88); backdrop-filter: blur(4px);
    z-index: 1000; justify-content: center; align-items: center;
    flex-direction: column; gap: 20px;
  }

  .loading-overlay.active { display: flex; }

  .spinner {
    width: 40px; height: 40px; border: 3px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-text { font-size: 14px; color: var(--text-muted); font-weight: 500; }
  .field-error { border-color: var(--danger) !important; box-shadow: 0 0 0 3px var(--danger-dim) !important; }
  .fnsku-error { display:block; color:var(--danger); font-size:12px; margin-top:4px; font-weight:500; }
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-icon" style="background:var(--accent-dim);">&#x1F4E6;</div>
  <div>
    <h1>Amazon Removal Order</h1>
    <span>Create ARO &bull; Transfer Order &bull; Fulfillment &bull; Receipt</span>
  </div>
</div>

<div class="container">
  <form id="aroForm" method="POST" action="${suiteletUrl}">
    <div class="card">
      <div class="card-header"><h2>Order Details</h2></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group">
            <label for="removal_id">Removal Order ID</label>
            <input type="text" id="removal_id" name="custpage_removal_order_id" placeholder="e.g. k2cmsLHhpG" required>
          </div>
          <div class="form-group">
            <label for="tracking_number">Tracking Number</label>
            <input type="text" id="tracking_number" name="custpage_tracking_number" placeholder="e.g. 1Z999AA10123456784">
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Items</h2></div>
      <div class="card-body">
        <table class="items-table">
          <thead><tr>
            <th style="width:40px">#</th><th>FNSKU</th><th style="width:140px">Qty</th><th></th>
          </tr></thead>
          <tbody id="itemRows">
            <tr data-row="0">
              <td class="row-num">1</td>
              <td><input type="text" name="fnsku_0" placeholder="B0XXXXXXXXX" required></td>
              <td><input type="number" name="qty_0" placeholder="1" min="1" required></td>
              <td><button type="button" class="btn-remove-row" onclick="removeRow(this)" title="Remove">&times;</button></td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="btn-add-row" onclick="addRow()">+ Add Item</button>
      </div>
    </div>

    <input type="hidden" id="itemsJson" name="custpage_items_json" value="[]">

    <div class="actions">
      <span class="actions-hint">All transactions created in a single operation</span>
      <button type="submit" class="btn-submit" id="submitBtn">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.3 2.7L6 10l-3.3-3.3L1.3 8 6 12.7l8.7-8.7-1.4-1.3z" fill="currentColor"/></svg>
        Create Removal Order
      </button>
    </div>
  </form>
</div>

<div class="loading-overlay" id="loadingOverlay">
  <div class="spinner"></div>
  <div class="loading-text">Creating records&#8230; this may take a moment</div>
</div>

<script>
  var rowCounter = 1;
  function addRow() {
    var tbody = document.getElementById('itemRows');
    var idx = rowCounter++;
    var tr = document.createElement('tr');
    tr.setAttribute('data-row', idx);
    tr.innerHTML = '<td class="row-num">' + (tbody.children.length + 1) + '</td>'
      + '<td><input type="text" name="fnsku_' + idx + '" placeholder="B0XXXXXXXXX" required></td>'
      + '<td><input type="number" name="qty_' + idx + '" placeholder="1" min="1" required></td>'
      + '<td><button type="button" class="btn-remove-row" onclick="removeRow(this)" title="Remove">&times;</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
    renumberRows();
  }
  function removeRow(btn) {
    var tbody = document.getElementById('itemRows');
    if (tbody.children.length <= 1) return;
    btn.closest('tr').remove();
    renumberRows();
  }
  function renumberRows() {
    var rows = document.querySelectorAll('#itemRows tr');
    for (var i = 0; i < rows.length; i++) rows[i].querySelector('.row-num').textContent = i + 1;
  }
  function clearFnskuErrors() {
    var old = document.querySelectorAll('.fnsku-error');
    for (var i = 0; i < old.length; i++) old[i].remove();
  }

  document.getElementById('aroForm').addEventListener('submit', function(e) {
    e.preventDefault();
    clearFnskuErrors();
    var form = this;
    var rows = document.querySelectorAll('#itemRows tr');
    var items = [], valid = true;
    for (var i = 0; i < rows.length; i++) {
      var fi = rows[i].querySelector('input[name^="fnsku_"]');
      var qi = rows[i].querySelector('input[name^="qty_"]');
      var f = fi.value.trim(), q = parseInt(qi.value, 10);
      fi.classList.remove('field-error'); qi.classList.remove('field-error');
      if (!f) { fi.classList.add('field-error'); valid = false; }
      if (!q || q < 1) { qi.classList.add('field-error'); valid = false; }
      if (f && q > 0) items.push({ fnsku: f, quantity: q });
    }
    if (!valid || !items.length) return;
    document.getElementById('itemsJson').value = JSON.stringify(items);
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('loadingOverlay').classList.add('active');

    // Validate FNSKUs via AJAX before submitting
    var formAction = form.action;
    var fnskuList = items.map(function(it) { return it.fnsku; });
    fetch(formAction + '&custpage_action=validate_fnskus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fnskus: fnskuList })
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      if (data.valid) {
        form.submit();
      } else {
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('loadingOverlay').classList.remove('active');
        var invalidSet = {};
        for (var k = 0; k < (data.invalid || []).length; k++) invalidSet[data.invalid[k]] = true;
        var allRows = document.querySelectorAll('#itemRows tr');
        var firstErr = null;
        for (var j = 0; j < allRows.length; j++) {
          var inp = allRows[j].querySelector('input[name^="fnsku_"]');
          var val = inp.value.trim();
          if (val && invalidSet[val]) {
            inp.classList.add('field-error');
            var errSpan = document.createElement('span');
            errSpan.className = 'fnsku-error';
            errSpan.textContent = 'FNSKU not found';
            inp.parentNode.appendChild(errSpan);
            if (!firstErr) firstErr = inp;
          }
        }
        if (data.error) alert('Validation error: ' + data.error);
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    })
    .catch(function() {
      // Network error — fall back to normal form submit
      form.submit();
    });
  });
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
      document.getElementById('aroForm').dispatchEvent(new Event('submit'));
  });
</script>
</body>
</html>`;
        };

        // ──────────────────────────────────────────────
        // RESULTS PAGE
        // ──────────────────────────────────────────────
        const renderResultsPage = (context, results) => {
            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId
            });

            const hasErrors = results.errors.length > 0;
            const hasWarnings = results.warnings.length > 0;

            // Check if we have received items data to show the action table
            const hasSerialData = results.serialData && results.serialData.valid && results.serialData.valid.length > 0;
            const hasNonSerialized = results.nonSerializedItems && results.nonSerializedItems.length > 0;
            const showActionTable = results.receiptId && (hasSerialData || hasNonSerialized);

            const steps = [
                { label: 'Amazon Removal Order', id: results.aroId, displayId: results.aroName, type: 'customrecord_aro', rectype: '1692', icon: '&#x1F4E6;' },
                { label: 'ARO Items', id: results.aroItemIds.length ? 'items' : null, icon: '&#x1F4CB;' },
                { label: 'Transfer Order', id: results.transferOrderId, displayId: results.transferOrderTranId, type: 'transferorder', icon: '&#x1F504;' },
                { label: 'Item Fulfillment', id: results.fulfillmentId, displayId: results.fulfillmentTranId, type: 'itemfulfillment', icon: '&#x1F69A;' },
                { label: 'Item Receipt', id: results.receiptId, displayId: results.receiptTranId, type: 'itemreceipt', icon: '&#x1F4E5;' },
            ];

            let stepsHtml = '';
            for (const step of steps) {
                const done = !!step.id;
                const cls = done ? 'step-done' : (hasErrors ? 'step-error' : 'step-pending');
                const ico = done ? '&#10003;' : (hasErrors ? '&#10007;' : '&#8212;');
                let link = '';
                if (done && step.id !== 'items') {
                    let href = '';
                    try {
                        href = url.resolveRecord({ recordType: step.type, recordId: step.id, isEditMode: false });
                    } catch (e) {
                        href = step.rectype
                            ? '/app/common/custom/custrecordentry.nl?rectype=' + step.rectype + '&id=' + step.id
                            : '/app/accounting/transactions/' + step.type + '.nl?id=' + step.id;
                    }
                    const display = step.displayId || step.id;
                    link = '<a href="' + href + '" target="_blank" class="step-link">' + escapeHtml(display) + ' &rarr;</a>';
                } else if (step.id === 'items') {
                    link = '<span class="step-meta">' + results.aroItemIds.length + ' item(s)</span>';
                }
                stepsHtml += '<div class="step ' + cls + '"><div class="step-indicator">' + ico + '</div>'
                    + '<div class="step-content"><div class="step-icon">' + step.icon + '</div>'
                    + '<div class="step-label">' + step.label + '</div>' + link + '</div></div>';
            }

            let alertsHtml = '';
            for (const e of results.errors) {
                alertsHtml += '<div class="alert alert-error"><div class="alert-icon">&#10007;</div>'
                    + '<div class="alert-body"><div class="alert-title">Error</div>'
                    + '<div class="alert-message">' + escapeHtml(e) + '</div></div></div>';
            }
            for (const w of results.warnings) {
                alertsHtml += '<div class="alert alert-warning"><div class="alert-icon">&#9888;</div>'
                    + '<div class="alert-body"><div class="alert-title">Warning</div>'
                    + '<div class="alert-message">' + escapeHtml(w) + '</div></div></div>';
            }

            // ── Build the received items / action table HTML ──
            let actionTableHtml = '';
            if (showActionTable) {
                // -- Serialized items rows --
                let serializedRowsHtml = '';
                if (hasSerialData) {
                    results.serialData.valid.forEach((s, idx) => {
                        const isLoc26 = String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID;
                        const transferOption = isLoc26 ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : '';
                        serializedRowsHtml += '<tr data-type="serial" data-index="' + idx + '">'
                            + '<td data-label="Serial" style="font-family:var(--mono);font-size:13px;">' + escapeHtml(s.serialNumber) + '</td>'
                            + '<td data-label="Item"><strong>' + escapeHtml(s.itemText) + '</strong></td>'
                            + '<td data-label="Bin">' + (escapeHtml(s.binText) || '<span style="color:#9ca3af;">N/A</span>') + '</td>'
                            + '<td data-label="Location">' + (escapeHtml(s.locationText) || '<span style="color:#9ca3af;">N/A</span>') + '</td>'
                            + '<td data-label="Action">'
                            + '<select class="action-select serial-action" data-index="' + idx + '" data-location="' + escapeHtml(String(s.locationId)) + '" onchange="handleActionChange(this);updateActionCount();">'
                            + '<option value="">-- Select Action --</option>'
                            + '<option value="back_to_stock">Back to Stock</option>'
                            + '<option value="likenew">Change to Like New</option>'
                            + '<option value="likenew_stock">Change to Like New &amp; Back to Stock</option>'
                            + '<option value="serial_change_stock">Change Serial &amp; Back to Stock</option>'
                            + '<option value="serial_change_testing">Change Serial &amp; Move to Testing</option>'
                            + '<option value="serial_change_refurbishing">Change Serial &amp; Move to Refurbishing</option>'
                            + '<option value="defective">Defective</option>'
                            + '<option value="move_refurbishing">Move to Refurbishing</option>'
                            + '<option value="move_testing">Move to Testing</option>'
                            + '<option value="part_number_change">Part Number Change</option>'
                            + '<option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option>'
                            + '<option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option>'
                            + '<option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option>'
                            + '<option value="return_to_vendor">Return to Vendor</option>'
                            + '<option value="serial_change">Serial Number Change</option>'
                            + '<option value="trash">Trash</option>'
                            + transferOption
                            + '</select>'
                            + '<input type="text" class="new-serial-input extra-input" data-index="' + idx + '" placeholder="New serial number" style="display:none;">'
                            + '<input type="text" class="new-item-input extra-input" data-index="' + idx + '" placeholder="New item name" style="display:none;">'
                            + '<input type="number" class="upcharge-input extra-input" data-index="' + idx + '" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;">'
                            + '</td>'
                            + '<td data-label="Issue" style="text-align:center;">'
                            + '<a href="#" class="issue-link" onclick="openIssueModal(\'serial\',' + idx + ');return false;" title="Report Issue">&#9888;</a>'
                            + '</td></tr>';
                    });
                }

                // -- Non-serialized items rows --
                let nsRowsHtml = '';
                if (hasNonSerialized) {
                    results.nonSerializedItems.forEach((item, idx) => {
                        nsRowsHtml += '<tr data-type="ns" data-ns-index="' + idx + '">'
                            + '<td data-label="Item"><strong>' + escapeHtml(item.itemText) + '</strong>'
                            + '<br><span style="font-size:12px;color:#6b7280;">FNSKU: ' + escapeHtml(item.fnsku) + '</span></td>'
                            + '<td data-label="Qty" style="font-weight:600;">' + item.quantity + '</td>'
                            + '<td data-label="Bin">' + (item.binText ? escapeHtml(item.binText) : '<span style="color:#9ca3af;">N/A</span>') + '</td>'
                            + '<td data-label="Action">'
                            + '<select class="action-select ns-action" data-ns-index="' + idx + '" onchange="handleNsActionChange(this);updateActionCount();">'
                            + '<option value="">-- Select Action --</option>'
                            + '<option value="back_to_stock">Back to Stock</option>'
                            + '<option value="likenew">Change to Like New</option>'
                            + '<option value="likenew_stock">Change to Like New &amp; Back to Stock</option>'
                            + '<option value="defective">Defective</option>'
                            + '<option value="move_refurbishing">Move to Refurbishing</option>'
                            + '<option value="move_testing">Move to Testing</option>'
                            + '<option value="return_to_vendor">Return to Vendor</option>'
                            + '<option value="part_number_change">Part Number Change</option>'
                            + '<option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option>'
                            + '<option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option>'
                            + '<option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option>'
                            + '<option value="trash">Trash</option>'
                            + '<option value="inventory_found">Inventory Found</option>'
                            + '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>'
                            + '</select>'
                            + '<input type="text" class="ns-newitem-input extra-input" data-ns-index="' + idx + '" placeholder="New item name" style="display:none;">'
                            + '<input type="number" class="ns-upcharge-input extra-input" data-ns-index="' + idx + '" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;">'
                            + '</td>'
                            + '<td data-label="Issue" style="text-align:center;">'
                            + '<a href="#" class="issue-link" onclick="openIssueModal(\'ns\',' + idx + ');return false;" title="Report Issue">&#9888;</a>'
                            + '</td></tr>';
                    });
                }

                // -- Build serialized table --
                let serialTableHtml = '';
                if (hasSerialData) {
                    const hasLoc26 = results.serialData.valid.some(s => String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID);
                    serialTableHtml = '<div style="margin-bottom:16px;">'
                        + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">'
                        + '<span style="font-weight:600;font-size:14px;color:#1a4971;">Serialized Items (' + results.serialData.valid.length + ')</span>'
                        + '<label style="font-size:13px;color:#6b7280;">Apply to all:</label>'
                        + '<select class="action-select" onchange="setAllSerialActions(this.value)" style="flex:1;max-width:240px;">'
                        + '<option value="">-- No Action --</option>'
                        + '<option value="back_to_stock">Back to Stock</option>'
                        + '<option value="likenew">Change to Like New</option>'
                        + '<option value="likenew_stock">Change to Like New &amp; Back to Stock</option>'
                        + '<option value="serial_change_stock">Change Serial &amp; Back to Stock</option>'
                        + '<option value="serial_change_testing">Change Serial &amp; Move to Testing</option>'
                        + '<option value="serial_change_refurbishing">Change Serial &amp; Move to Refurbishing</option>'
                        + '<option value="defective">Defective</option>'
                        + '<option value="move_refurbishing">Move to Refurbishing</option>'
                        + '<option value="move_testing">Move to Testing</option>'
                        + '<option value="part_number_change">Part Number Change</option>'
                        + '<option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option>'
                        + '<option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option>'
                        + '<option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option>'
                        + '<option value="return_to_vendor">Return to Vendor</option>'
                        + '<option value="serial_change">Serial Number Change</option>'
                        + '<option value="trash">Trash</option>'
                        + (hasLoc26 ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : '')
                        + '</select></div>'
                        + '<div style="overflow-x:auto;">'
                        + '<table class="action-table"><thead><tr><th>Serial</th><th>Item</th><th>Bin</th><th>Location</th><th>Action</th><th style="width:50px;">Issue</th></tr></thead>'
                        + '<tbody>' + serializedRowsHtml + '</tbody></table></div></div>';

                    // Invalid serials alert
                    if (results.serialData.invalid && results.serialData.invalid.length > 0) {
                        serialTableHtml += '<div class="alert alert-warning" style="margin-bottom:16px;"><div class="alert-icon">&#9888;</div>'
                            + '<div class="alert-body"><div class="alert-title">' + results.serialData.invalid.length + ' serial(s) not found at destination</div>'
                            + '<div class="alert-message">' + results.serialData.invalid.map(s => escapeHtml(s)).join(', ') + '</div></div></div>';
                    }
                }

                // -- Build non-serialized table --
                let nsTableHtml = '';
                if (hasNonSerialized) {
                    nsTableHtml = '<div style="margin-bottom:16px;">'
                        + '<span style="font-weight:600;font-size:14px;color:#1a4971;display:block;margin-bottom:12px;">Non-Serialized Items (' + results.nonSerializedItems.length + ')</span>'
                        + '<div style="overflow-x:auto;">'
                        + '<table class="action-table"><thead><tr><th>Item</th><th>Qty</th><th>Bin</th><th>Action</th><th style="width:50px;">Issue</th></tr></thead>'
                        + '<tbody>' + nsRowsHtml + '</tbody></table></div></div>';
                }

                actionTableHtml = '<div class="card"><div class="card-header"><h2>Received Items &mdash; Assign Actions</h2>'
                    + '<p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Select what to do with each received item, then submit.</p></div>'
                    + '<div class="card-body">'
                    + serialTableHtml + nsTableHtml
                    + '<div style="display:flex;align-items:center;gap:16px;padding-top:16px;border-top:1px solid var(--border);flex-wrap:wrap;">'
                    + '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#6b7280;font-weight:600;font-size:13px;">Actions selected:</span>'
                    + '<span id="action_count" style="font-size:22px;font-weight:800;color:#1a4971;">0</span></div>'
                    + '<button type="button" class="btn-wh" onclick="submitAroActions()">Submit Actions</button>'
                    + '<a href="' + suiteletUrl + '" class="btn-new" style="padding:10px 20px;font-size:14px;">+ Create Another ARO</a>'
                    + '<button type="button" onclick="document.getElementById(\'actionTableCard\').style.display=\'none\'" style="background:none;border:1px solid #d1d5db;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer;color:#6b7280;">Skip / Do Later</button>'
                    + '</div></div></div>';

                actionTableHtml = '<div id="actionTableCard">' + actionTableHtml + '</div>';
            }

            // Fallback buttons if no action table
            let fallbackButtonsHtml = '';
            if (!showActionTable) {
                fallbackButtonsHtml = '<div class="actions-row">'
                    + '<form method="POST" action="' + suiteletUrl + '" style="margin:0;">'
                    + '<input type="hidden" name="custpage_action" value="go_home">'
                    + '<button type="submit" class="btn-wh">Continue to Warehouse Assistant</button>'
                    + '</form>'
                    + '<a href="' + suiteletUrl + '" class="btn-new">+ Create Another Removal Order</a>'
                    + '</div>';
            }

            const serialDataJson = hasSerialData ? JSON.stringify(results.serialData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') : 'null';
            const nsItemsJson = hasNonSerialized ? JSON.stringify(results.nonSerializedItems).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') : '[]';

            // ── Load issue type options for modal ──
            let issueTypeOptionsHtml = '<option value="">-- Select Issue Type --</option>';
            try {
                const tmpRec = record.create({ type: 'customrecord_aroii', isDynamic: true });
                const issueField = tmpRec.getField({ fieldId: 'custrecord_aroii_issue' });
                if (issueField) {
                    const opts = issueField.getSelectOptions();
                    opts.forEach(function(o) {
                        if (o.value) issueTypeOptionsHtml += '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.text) + '</option>';
                    });
                }
            } catch (issueOptErr) {
                log.debug('Issue type options load', issueOptErr.message);
            }

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Removal Order ${hasErrors ? 'Error' : 'Created'}</title>
<style>
  ${getSharedStyles()}

  .alert {
    border-radius: 12px; padding: 16px 20px; margin-bottom: 20px;
    display: flex; gap: 12px; align-items: flex-start; border: 1px solid;
    box-shadow: var(--shadow-sm);
  }
  .alert-error { background: var(--danger-dim); border-color: rgba(220,38,38,0.18); }
  .alert-warning { background: var(--warning-dim); border-color: rgba(217,119,6,0.18); }
  .alert-icon { font-size: 18px; line-height: 1.4; }
  .alert-body { flex: 1; }
  .alert-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .alert-error .alert-title { color: var(--danger); }
  .alert-warning .alert-title { color: var(--warning); }
  .alert-message { font-size: 13px; color: var(--text-muted); line-height: 1.5; }

  .steps { display: flex; flex-direction: column; }
  .step { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--border); }
  .step:last-child { border-bottom: none; }
  .step-indicator {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; flex-shrink: 0;
  }
  .step-done .step-indicator { background: var(--success-dim); color: var(--success); }
  .step-error .step-indicator { background: var(--danger-dim); color: var(--danger); }
  .step-pending .step-indicator { background: rgba(0,0,0,0.04); color: var(--text-muted); }
  .step-content { display: flex; align-items: center; gap: 10px; flex: 1; }
  .step-icon { font-size: 16px; }
  .step-label { font-size: 14px; font-weight: 500; }
  .step-link {
    margin-left: auto; font-family: var(--mono); font-size: 13px;
    color: var(--accent); text-decoration: none; padding: 4px 12px;
    border-radius: 6px; background: var(--accent-dim); font-weight: 500;
  }
  .step-link:hover { background: rgba(233,122,11,0.14); }
  .step-meta { margin-left: auto; font-size: 12px; color: var(--text-muted); font-family: var(--mono); }

  .summary-table { width: 100%; border-collapse: collapse; }
  .summary-table th {
    text-align: left; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted); padding: 0 0 10px; border-bottom: 1px solid var(--border);
  }
  .summary-table td { padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
  .summary-table code {
    font-family: var(--mono); font-size: 13px; color: var(--accent);
    background: var(--accent-dim); padding: 2px 8px; border-radius: 4px;
  }
  .summary-table tr:last-child td { border-bottom: none; }

  .action-table { width: 100%; border-collapse: collapse; }
  .action-table th {
    text-align: left; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted); padding: 10px 8px; border-bottom: 2px solid var(--border);
  }
  .action-table td {
    padding: 10px 8px; border-bottom: 1px solid var(--border);
    font-size: 14px; vertical-align: middle;
  }
  .action-table tr:hover { background: rgba(0,0,0,0.015); }
  .action-select {
    width: 100%; padding: 10px 12px; border: 1.5px solid #d1d5db;
    border-radius: 8px; font-size: 14px; min-height: 44px;
    background: #fff; cursor: pointer;
  }
  .action-select:focus { border-color: #1a4971; outline: none; box-shadow: 0 0 0 3px rgba(26,73,113,0.1); }
  .extra-input {
    margin-top: 6px; width: 100%; padding: 10px 12px;
    border: 1.5px solid #d1d5db; border-radius: 8px;
    font-size: 14px; min-height: 44px;
  }
  .extra-input:focus { border-color: #1a4971; outline: none; box-shadow: 0 0 0 3px rgba(26,73,113,0.1); }

  .btn-new, .btn-wh {
    display: inline-flex; align-items: center; gap: 8px;
    border: none; border-radius: var(--radius); padding: 12px 28px;
    font-family: var(--sans); font-size: 15px; font-weight: 600;
    text-decoration: none; transition: all 0.2s; cursor: pointer;
  }
  .btn-new {
    background: var(--accent); color: #fff;
    box-shadow: 0 1px 3px rgba(233,122,11,0.3);
  }
  .btn-new:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .btn-wh {
    background: #1a4971; color: #fff;
    box-shadow: 0 1px 3px rgba(26,73,113,0.3);
  }
  .btn-wh:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .actions-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

  @media (max-width: 600px) {
    .action-table thead { display: none; }
    .action-table tr { display: block; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
    .action-table td { display: block; padding: 4px 0; border: none; }
    .action-table td:before { content: attr(data-label); font-weight: 600; font-size: 11px; color: var(--text-muted); text-transform: uppercase; display: block; }
  }

  /* Issue Modal */
  .issue-link {
    display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;
    border-radius:50%;transition:background 0.2s;color:var(--warning);font-size:18px;text-decoration:none;
  }
  .issue-link:hover { background:rgba(217,119,6,0.12); }
  .issue-link.has-issue { color:var(--success) !important; }
  #issueModal {
    display:none;position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.5);z-index:9999;justify-content:center;align-items:center;
  }
  #issueModal.active { display:flex; }
  .issue-modal-content {
    background:#fff;border-radius:12px;padding:28px;max-width:560px;width:94%;
    box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;
  }
  .issue-modal-content h2 { margin:0 0 6px;color:#1a4971;font-size:18px;font-weight:700; }
  .issue-modal-subtitle { margin:0 0 18px;color:#6b7280;font-size:13px; }
  .issue-modal-content label { display:block;font-weight:600;margin-bottom:5px;color:#374151;font-size:13px; }
  .issue-modal-content input[type="text"],
  .issue-modal-content select,
  .issue-modal-content textarea {
    width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;
    font-size:14px;min-height:42px;margin-bottom:14px;font-family:inherit;box-sizing:border-box;
  }
  .issue-modal-content textarea { resize:vertical;min-height:80px; }
  .issue-modal-content input[type="file"] { margin-bottom:14px; }
  .issue-prefilled {
    font-size:13px;color:#374151;margin-bottom:14px;
    background:#f9fafb;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;line-height:1.6;
  }
  .issue-prefilled strong { color:#1a4971; }
  .issue-actions { display:flex;gap:10px;justify-content:flex-end;margin-top:8px;align-items:center; }
  .issue-btn-cancel {
    padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;
    background:#f3f4f6;color:#374151;border:1px solid #d1d5db;
  }
  .issue-btn-cancel:hover { background:#e5e7eb; }
  .issue-btn-submit {
    padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;
    background:#1a4971;color:#fff;border:none;
  }
  .issue-btn-submit:hover { filter:brightness(1.12); }
  .issue-btn-submit:disabled { opacity:0.5;cursor:not-allowed; }
  .img-preview-list { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px; }
  .img-preview-item {
    position:relative;width:64px;height:64px;border-radius:6px;
    overflow:hidden;border:1px solid #e5e7eb;
  }
  .img-preview-item img { width:100%;height:100%;object-fit:cover; }
  .img-preview-item .remove-img {
    position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;
    border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;line-height:1;
  }
  .issue-spinner {
    display:none;width:20px;height:20px;border:2px solid #d1d5db;
    border-top-color:#1a4971;border-radius:50%;animation:issueSpin 0.6s linear infinite;
  }
  @keyframes issueSpin { to { transform:rotate(360deg); } }
  .issue-success-msg { display:none;color:var(--success);font-size:13px;font-weight:600;padding:10px;text-align:center; }
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-icon" style="background:${hasErrors ? 'var(--danger-dim)' : 'var(--success-dim)'};">${hasErrors ? '&#9888;' : '&#10003;'}</div>
  <div>
    <h1>${hasErrors ? 'Removal Order &#8212; Error' : 'Removal Order Created'}</h1>
    <span>${hasErrors ? 'An error occurred during processing' : 'All records created successfully'}</span>
  </div>
</div>
<div class="container">
  ${alertsHtml}
  <div class="card"><div class="card-header"><h2>Processing Steps</h2></div>
    <div class="card-body"><div class="steps">${stepsHtml}</div></div></div>
  ${actionTableHtml}
  ${fallbackButtonsHtml}
</div>

<form id="aroActionForm" method="POST" action="${suiteletUrl}" style="display:none;">
  <input type="hidden" name="custpage_action" value="process_aro_received">
  <input type="hidden" name="custpage_serial_data" id="hdn_serial_data">
  <input type="hidden" name="custpage_actions_json" id="hdn_actions_json">
  <input type="hidden" name="custpage_ns_cart_json" id="hdn_ns_cart_json">
</form>

<script>
var _serialData = ${serialDataJson};
var _nsItems = ${nsItemsJson};
var _aroId = ${results.aroId || 'null'};
var _aroName = '${escapeHtml(results.aroName || '')}';
var _suiteletUrl = '${suiteletUrl}';
var _issueTypeOptions = '${issueTypeOptionsHtml.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';

function handleActionChange(sel) {
  var idx = sel.getAttribute('data-index');
  var row = sel.closest('tr');
  var newSerialInput = row.querySelector('.new-serial-input');
  var newItemInput = row.querySelector('.new-item-input');
  var upchargeInput = row.querySelector('.upcharge-input');
  var v = sel.value;
  if (newSerialInput) newSerialInput.style.display = (v === 'serial_change' || v === 'serial_change_stock' || v === 'serial_change_testing' || v === 'serial_change_refurbishing') ? 'block' : 'none';
  if (newItemInput) newItemInput.style.display = (v === 'part_number_change' || v === 'part_number_change_stock' || v === 'part_number_change_testing' || v === 'part_number_change_refurbishing') ? 'block' : 'none';
  if (upchargeInput) upchargeInput.style.display = (v === 'transfer_upcharge') ? 'block' : 'none';
}

function handleNsActionChange(sel) {
  var idx = sel.getAttribute('data-ns-index');
  var row = sel.closest('tr');
  var upchargeInput = row.querySelector('.ns-upcharge-input');
  var newItemInput = row.querySelector('.ns-newitem-input');
  var v = sel.value;
  if (upchargeInput) upchargeInput.style.display = (v === 'transfer_upcharge') ? 'block' : 'none';
  if (newItemInput) newItemInput.style.display = (v === 'part_number_change' || v === 'part_number_change_stock' || v === 'part_number_change_testing' || v === 'part_number_change_refurbishing') ? 'block' : 'none';
}

function setAllSerialActions(val) {
  var selects = document.querySelectorAll('select.serial-action');
  for (var i = 0; i < selects.length; i++) {
    selects[i].value = val;
    handleActionChange(selects[i]);
  }
  updateActionCount();
}

function updateActionCount() {
  var count = 0;
  var selects = document.querySelectorAll('select.serial-action, select.ns-action');
  for (var i = 0; i < selects.length; i++) { if (selects[i].value) count++; }
  var el = document.getElementById('action_count');
  if (el) el.textContent = count;
}

function submitAroActions() {
  // Collect serialized actions
  var serialActions = [];
  var serialSelects = document.querySelectorAll('select.serial-action');
  for (var i = 0; i < serialSelects.length; i++) {
    var sel = serialSelects[i];
    if (!sel.value) continue;
    var idx = parseInt(sel.getAttribute('data-index'), 10);
    var row = sel.closest('tr');
    serialActions.push({
      index: idx,
      action: sel.value,
      newSerial: (row.querySelector('.new-serial-input') || {}).value || '',
      newItemName: (row.querySelector('.new-item-input') || {}).value || '',
      upcharge: (row.querySelector('.upcharge-input') || {}).value || ''
    });
  }

  // Collect non-serialized actions
  var nsCart = [];
  var nsSelects = document.querySelectorAll('select.ns-action');
  for (var j = 0; j < nsSelects.length; j++) {
    var nsSel = nsSelects[j];
    if (!nsSel.value) continue;
    var nsIdx = parseInt(nsSel.getAttribute('data-ns-index'), 10);
    var nsItem = _nsItems[nsIdx];
    if (!nsItem) continue;
    var nsRow = nsSel.closest('tr');
    nsCart.push({
      itemName: nsItem.itemName || nsItem.itemText,
      quantity: nsItem.quantity,
      action: nsSel.value,
      binNumber: nsItem.binText || '',
      binId: nsItem.binId || '',
      statusId: nsItem.statusId || '',
      isLotItem: nsItem.isLotItem || false,
      lotNumberId: nsItem.lotNumberId || '',
      lotNumberText: nsItem.lotNumberText || '',
      upcharge: (nsRow.querySelector('.ns-upcharge-input') || {}).value || '',
      newItemName: (nsRow.querySelector('.ns-newitem-input') || {}).value || ''
    });
  }

  if (serialActions.length === 0 && nsCart.length === 0) {
    alert('Select an action for at least one item.');
    return;
  }

  document.getElementById('hdn_serial_data').value = _serialData ? JSON.stringify(_serialData) : '';
  document.getElementById('hdn_actions_json').value = JSON.stringify(serialActions);
  document.getElementById('hdn_ns_cart_json').value = JSON.stringify(nsCart);
  document.getElementById('aroActionForm').submit();
}

// ── Issue Modal Functions ──
var _issueImages = [];

function openIssueModal(itemType, idx) {
  _issueImages = [];
  document.getElementById('issue_image_previews').innerHTML = '';
  document.getElementById('issue_success_msg').style.display = 'none';
  document.getElementById('issue_submit_btn').disabled = false;
  document.getElementById('issue_spinner').style.display = 'none';
  document.getElementById('issue_notes').value = '';
  document.getElementById('issue_case_id').value = '';
  document.getElementById('issue_rma').value = '';
  document.getElementById('issue_lpn').value = '';
  document.getElementById('issue_shipment_id').value = '';
  document.getElementById('issue_images').value = '';
  document.getElementById('issue_type').innerHTML = _issueTypeOptions;

  var itemText = '', fnsku = '', qty = 1, itemId = '';
  var infoHtml = '';

  if (itemType === 'serial' && _serialData && _serialData.valid && _serialData.valid[idx]) {
    var s = _serialData.valid[idx];
    itemText = s.itemText || '';
    itemId = s.itemId || '';
    fnsku = s.serialNumber || '';
    qty = 1;
    infoHtml = '<strong>Item:</strong> ' + _escHtml(itemText)
      + '<br><strong>Serial:</strong> ' + _escHtml(s.serialNumber)
      + (s.binText ? '<br><strong>Bin:</strong> ' + _escHtml(s.binText) : '')
      + (s.locationText ? '<br><strong>Location:</strong> ' + _escHtml(s.locationText) : '');
  } else if (itemType === 'ns' && _nsItems && _nsItems[idx]) {
    var ns = _nsItems[idx];
    itemText = ns.itemText || '';
    itemId = ns.itemId || '';
    fnsku = ns.fnsku || '';
    qty = ns.quantity || 1;
    infoHtml = '<strong>Item:</strong> ' + _escHtml(itemText)
      + '<br><strong>FNSKU:</strong> ' + _escHtml(fnsku)
      + '<br><strong>Qty:</strong> ' + qty
      + (ns.binText ? '<br><strong>Bin:</strong> ' + _escHtml(ns.binText) : '');
  }

  document.getElementById('issue_item_info').innerHTML = infoHtml;
  document.getElementById('issue_item_id').value = itemId;
  document.getElementById('issue_item_type').value = itemType;
  document.getElementById('issue_item_index').value = idx;
  document.getElementById('issue_fnsku').value = fnsku;
  document.getElementById('issue_quantity').value = qty;
  document.getElementById('issue_item_text').value = itemText;
  document.getElementById('issueModal').classList.add('active');
}

function closeIssueModal() {
  document.getElementById('issueModal').classList.remove('active');
  _issueImages = [];
}

function _escHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function previewIssueImages(input) {
  var previews = document.getElementById('issue_image_previews');
  var files = input.files;
  var currentCount = _issueImages.filter(function(x) { return x !== null; }).length;
  if (currentCount + files.length > 5) {
    alert('Maximum 5 images allowed.');
    input.value = '';
    return;
  }
  for (var i = 0; i < files.length; i++) {
    (function(f) {
      compressImage(f, 1200, 0.7, function(base64, mimeType) {
        var imgIndex = _issueImages.length;
        _issueImages.push({ name: f.name, type: mimeType, base64: base64 });
        var div = document.createElement('div');
        div.className = 'img-preview-item';
        div.setAttribute('data-img-index', imgIndex);
        div.innerHTML = '<img src="data:' + mimeType + ';base64,' + base64 + '">'
          + '<button type="button" class="remove-img" onclick="removeIssueImage(' + imgIndex + ',this)">&times;</button>';
        previews.appendChild(div);
      });
    })(files[i]);
  }
}

function removeIssueImage(imgIndex, btn) {
  _issueImages[imgIndex] = null;
  var item = btn.closest('.img-preview-item');
  if (item) item.remove();
}

function compressImage(f, maxWidth, quality, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      callback(dataUrl.split(',')[1], 'image/jpeg');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(f);
}

function submitIssue() {
  var issueType = document.getElementById('issue_type').value;
  if (!issueType) { alert('Please select an issue type.'); return; }

  var btn = document.getElementById('issue_submit_btn');
  var spinner = document.getElementById('issue_spinner');
  btn.disabled = true;
  spinner.style.display = 'inline-block';

  var images = _issueImages.filter(function(img) { return img !== null; });

  var payload = {
    aroId: _aroId,
    aroName: _aroName,
    itemId: document.getElementById('issue_item_id').value,
    itemText: document.getElementById('issue_item_text').value,
    fnsku: document.getElementById('issue_fnsku').value,
    quantity: document.getElementById('issue_quantity').value,
    issueType: issueType,
    notes: document.getElementById('issue_notes').value,
    caseId: document.getElementById('issue_case_id').value,
    rma: document.getElementById('issue_rma').value,
    lpn: document.getElementById('issue_lpn').value,
    shipmentId: document.getElementById('issue_shipment_id').value,
    images: images
  };

  fetch(_suiteletUrl + '&custpage_action=create_issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(resp) { return resp.json(); })
  .then(function(data) {
    spinner.style.display = 'none';
    if (data.success) {
      document.getElementById('issue_success_msg').style.display = 'block';
      var itemType = document.getElementById('issue_item_type').value;
      var idx = document.getElementById('issue_item_index').value;
      var selector = itemType === 'serial'
        ? 'tr[data-index="' + idx + '"] .issue-link'
        : 'tr[data-ns-index="' + idx + '"] .issue-link';
      var link = document.querySelector(selector);
      if (link) { link.classList.add('has-issue'); link.innerHTML = '&#10003;'; link.title = 'Issue created'; }
      setTimeout(function() { closeIssueModal(); }, 1200);
    } else {
      alert('Error creating issue: ' + (data.error || 'Unknown error'));
      btn.disabled = false;
    }
  })
  .catch(function(err) {
    spinner.style.display = 'none';
    btn.disabled = false;
    alert('Network error: ' + err.message);
  });
}

// ── Barcode scanner support: Enter/Tab on serial input advances to next row ──
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  var el = e.target;
  if (!el || !el.classList.contains('new-serial-input')) return;
  e.preventDefault();
  var allInputs = Array.prototype.slice.call(document.querySelectorAll('.new-serial-input'));
  var visibleInputs = allInputs.filter(function(inp) {
    return inp.offsetParent !== null && inp.style.display !== 'none';
  });
  var currentIdx = visibleInputs.indexOf(el);
  if (currentIdx >= 0 && currentIdx < visibleInputs.length - 1) {
    visibleInputs[currentIdx + 1].focus();
  }
});
</script>

<div id="issueModal">
  <div class="issue-modal-content">
    <h2>&#9888; Report Issue</h2>
    <p class="issue-modal-subtitle">Create an issue record for this item</p>
    <div class="issue-prefilled" id="issue_item_info"></div>
    <input type="hidden" id="issue_item_id">
    <input type="hidden" id="issue_item_type">
    <input type="hidden" id="issue_item_index">
    <input type="hidden" id="issue_fnsku">
    <input type="hidden" id="issue_quantity" value="1">
    <input type="hidden" id="issue_item_text">
    <label>Issue Type *</label>
    <select id="issue_type"></select>
    <label>Notes</label>
    <textarea id="issue_notes" placeholder="Describe the issue..."></textarea>
    <label>Amazon Case ID</label>
    <input type="text" id="issue_case_id" placeholder="Optional">
    <label>RMA</label>
    <input type="text" id="issue_rma" placeholder="Optional">
    <label>LPN</label>
    <input type="text" id="issue_lpn" placeholder="Optional">
    <label>Shipment ID</label>
    <input type="text" id="issue_shipment_id" placeholder="Optional">
    <label>Attach Photos</label>
    <input type="file" id="issue_images" accept="image/*" multiple onchange="previewIssueImages(this)">
    <div class="img-preview-list" id="issue_image_previews"></div>
    <div class="issue-success-msg" id="issue_success_msg">&#10003; Issue created successfully!</div>
    <div class="issue-actions">
      <div class="issue-spinner" id="issue_spinner"></div>
      <button type="button" class="issue-btn-cancel" onclick="closeIssueModal()">Cancel</button>
      <button type="button" class="issue-btn-submit" id="issue_submit_btn" onclick="submitIssue()">Create Issue</button>
    </div>
  </div>
</div>
</body>
</html>`;

            context.response.write(html);
        };

        const escapeHtml = (str) => {
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        // ══════════════════════════════════════════════════════════════
        //  WAREHOUSE ASSISTANT — UTILITY FUNCTIONS
        // ══════════════════════════════════════════════════════════════

        function whEscapeXml(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        }

        function whEscapeForJs(str) {
            if (!str) return '';
            return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        }

        function whCleanSerialInput(input) {
            if (!input) return [];
            return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/<br\s*\/?>/gi, '\n').split('\n').map(s => s.trim()).filter(s => s !== '');
        }

        function whGetLikeNewItemName(itemName) {
            if (!itemName) return '';
            if (itemName.endsWith('-N')) return itemName.slice(0, -2) + '-LN';
            if (itemName.endsWith('-RF')) return itemName.slice(0, -3) + '-LN';
            return itemName + '-LN';
        }

        // ══════════════════════════════════════════════════════════════
        //  WAREHOUSE ASSISTANT — NETSUITE LOOKUPS
        // ══════════════════════════════════════════════════════════════

        function whFindItemByName(itemName) {
            let result = null;
            try {
                search.create({
                    type: search.Type.ITEM,
                    filters: [['itemid', 'is', itemName]],
                    columns: ['internalid', 'itemid', 'displayname', 'salesdescription']
                }).run().each(function(r) {
                    result = { id: r.getValue('internalid'), itemid: r.getValue('itemid'), displayname: r.getValue('displayname') || r.getValue('itemid'), description: r.getValue('salesdescription') || '' };
                    return false;
                });
            } catch (e) { log.error('whFindItemByName Error', e.message); }
            return result;
        }

        function whGetItemDetails(itemId) {
            try {
                const lookup = search.lookupFields({ type: search.Type.ITEM, id: itemId, columns: ['itemid', 'displayname', 'salesdescription'] });
                return { itemid: lookup.itemid || '', displayname: lookup.displayname || lookup.itemid || '', description: lookup.salesdescription || '' };
            } catch (e) { log.error('whGetItemDetails Error', e.message); return null; }
        }

        function whGetBinsForLocation(locationId) {
            const bins = [];
            try {
                search.create({
                    type: 'bin', filters: [['location', 'anyof', locationId]],
                    columns: [search.createColumn({ name: 'internalid' }), search.createColumn({ name: 'binnumber', sort: search.Sort.ASC })]
                }).run().each(function(r) {
                    bins.push({ id: r.getValue('internalid'), name: r.getValue('binnumber') });
                    return bins.length < 1000;
                });
            } catch (e) { log.error('whGetBinsForLocation Error', e.message); }
            return bins;
        }

        function whFindBinByNumber(binNumber, locationId) {
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
            } catch (e) { log.error('whFindBinByNumber Error', e.message); }
            return result;
        }

        function whLookupSerialDetails(serialTexts) {
            if (!serialTexts || serialTexts.length === 0) return { valid: [], invalid: [] };
            const serialFilterExpression = [];
            serialTexts.forEach((serial, index) => {
                if (index > 0) serialFilterExpression.push('OR');
                serialFilterExpression.push(['inventorynumber', 'is', serial]);
            });
            const foundSerials = {};
            try {
                runSearchAll(search.create({
                    type: 'inventorynumber', filters: serialFilterExpression,
                    columns: [
                        search.createColumn({ name: 'internalid' }), search.createColumn({ name: 'inventorynumber' }),
                        search.createColumn({ name: 'item' }), search.createColumn({ name: 'location' }),
                        search.createColumn({ name: 'quantityonhand' })
                    ]
                }), result => {
                    const serial = result.getValue('inventorynumber');
                    const locId = String(result.getValue('location') || '');
                    const qtyOnHand = parseFloat(result.getValue('quantityonhand')) || 0;
                    if (SERIAL_LOOKUP_LOCATION_IDS.indexOf(locId) !== -1 && qtyOnHand > 0) {
                        if (!foundSerials[serial]) {
                            foundSerials[serial] = {
                                serialNumber: serial, serialId: result.getValue('internalid'),
                                itemId: result.getValue('item'), itemText: result.getText('item'),
                                locationId: locId, locationText: result.getText('location') || '',
                                binId: '', binText: '', statusId: '', statusText: '', quantityOnHand: qtyOnHand
                            };
                        }
                    }
                });
            } catch (e) { log.error('whLookupSerialDetails Phase1 Error', e.message); }

            if (Object.keys(foundSerials).length > 0) {
                try {
                    const serialIdToText = {};
                    const serialIds = [];
                    Object.keys(foundSerials).forEach(serial => {
                        const sid = foundSerials[serial].serialId;
                        if (sid) { serialIdToText[sid] = serial; serialIds.push(sid); }
                    });
                    if (serialIds.length > 0) {
                        runSearchAll(search.create({
                            type: 'inventorybalance',
                            filters: [['inventorynumber', 'anyof', serialIds], 'AND', ['location', 'anyof', SERIAL_LOOKUP_LOCATION_IDS]],
                            columns: [search.createColumn({ name: 'inventorynumber' }), search.createColumn({ name: 'binnumber' }), search.createColumn({ name: 'status' })]
                        }), result => {
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
                        });
                    }
                } catch (e) { log.debug('whLookupSerialDetails Phase2 skipped', e.message); }
            }

            const valid = [];
            const invalid = [];
            serialTexts.forEach(serial => {
                if (foundSerials[serial]) valid.push(foundSerials[serial]);
                else invalid.push(serial);
            });
            return { valid, invalid };
        }

        // ══════════════════════════════════════════════════════════════
        //  WAREHOUSE ASSISTANT — LABEL PDF GENERATION
        // ══════════════════════════════════════════════════════════════

        function whGenerateLabelsPdf(labelGroups, recordId) {
            let bodyContent = '';
            labelGroups.forEach(group => {
                const itemName = whEscapeXml(group.itemText || '');
                const description = whEscapeXml(group.description || '');
                const escapedRecordId = whEscapeXml(recordId || '');
                const isTesting = String(group.action || '').indexOf('testing') !== -1;
                var wrapOpen = isTesting ? '<table width="100%" height="100%"><tr><td>' : '';
                var wrapClose = isTesting ? '</td><td width="12mm" valign="middle" align="center" style="font-size:19px; color:#AAAAAA; font-weight:bold; line-height:21px;">T<br/>E<br/>S<br/>T<br/>I<br/>N<br/>G</td></tr></table>' : '';
                if (group.serialNumbers && group.serialNumbers.length > 0) {
                    group.serialNumbers.forEach(serialNumber => {
                        const escapedSerial = whEscapeXml(serialNumber);
                        bodyContent += '<body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">'
                            + wrapOpen
                            + '<table align="right" width="98%" height="50%"><tr height="12%"><td align="center"><table width="100%"><tr>'
                            + '<td style="font-size:18px;">' + itemName + '</td>'
                            + '<td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">' + escapedRecordId + '</td></tr></table></td>'
                            + '</tr></table></td></tr>'
                            + '<tr height="25%"><td align="center"><table width="100%"><tr><td style="font-size:11px;">' + description + '</td></tr></table></td></tr>'
                            + '</table>'
                            + '<table align="left" width="100%" height="50%" v-align="bottom">'
                            + '<tr height="60px"><td height="60px" align="left" style="font-size:10px;">'
                            + '<barcode height="60px" width="240px" codetype="code128" showtext="true" value="' + escapedSerial + '"/>'
                            + '</td></tr>'
                            + '<tr><td align="left" style="font-size:25px;">'
                            + '<barcode height="60px" width="220px" codetype="code128" showtext="true" value="' + itemName + '"/>'
                            + '</td></tr></table>'
                            + wrapClose + '</body>';
                    });
                } else if (group.quantity && group.quantity > 0) {
                    for (let i = 0; i < group.quantity; i++) {
                        bodyContent += '<body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">'
                            + wrapOpen
                            + '<table align="right" width="98%" height="50%"><tr height="12%"><td align="center"><table width="100%"><tr>'
                            + '<td style="font-size:18px;">' + itemName + '</td>'
                            + '<td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">' + escapedRecordId + '</td></tr></table></td>'
                            + '</tr></table></td></tr>'
                            + '<tr height="25%"><td align="center"><table width="100%"><tr><td style="font-size:11px;">' + description + '</td></tr></table></td></tr>'
                            + '</table>'
                            + '<table align="left" width="100%" height="50%" v-align="bottom">'
                            + '<tr height="60px"><td height="60px" align="left"></td></tr>'
                            + '<tr><td align="left" style="font-size:25px;">'
                            + '<barcode height="60px" width="220px" codetype="code128" showtext="true" value="' + itemName + '"/>'
                            + '</td></tr></table>'
                            + wrapClose + '</body>';
                    }
                }
            });
            const xml = '<?xml version="1.0"?><!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd"><pdf>'
                + '<head><style>th { background-color: #3c8dbc; color: white; } body { font-family: Helvetica; }</style></head>'
                + bodyContent + '</pdf>';
            return render.xmlToPdf({ xmlString: xml });
        }

        // ══════════════════════════════════════════════════════════════
        //  WAREHOUSE ASSISTANT — BATCH RETRY HELPER
        // ══════════════════════════════════════════════════════════════

        function whTryBatchThenIndividual(items, createFn, memo) {
            if (items.length === 0) return { tranIds: [], succeeded: [], failed: [] };
            try {
                const r = createFn(items, memo);
                var tid = r.tranId || r.transferId || r.adjId || '';
                return { tranIds: [String(tid)], succeeded: items, failed: [] };
            } catch (batchErr) {
                log.debug('Batch failed, splitting in half', batchErr.message);
                if (items.length === 1) { items[0]._error = batchErr.message; return { tranIds: [], succeeded: [], failed: items }; }
                // Binary split: try each half recursively to isolate bad items
                // while keeping good items batched in fewer transactions
                var mid = Math.ceil(items.length / 2);
                var leftResult = whTryBatchThenIndividual(items.slice(0, mid), createFn, memo);
                var rightResult = whTryBatchThenIndividual(items.slice(mid), createFn, memo);
                return {
                    tranIds: leftResult.tranIds.concat(rightResult.tranIds),
                    succeeded: leftResult.succeeded.concat(rightResult.succeeded),
                    failed: leftResult.failed.concat(rightResult.failed)
                };
            }
        }

        // ══════════════════════════════════════════════════════════════
        //  WAREHOUSE ASSISTANT — TRANSACTION CREATION
        // ══════════════════════════════════════════════════════════════

        function whCreateConditionChangeAdjustment(groups, memo) {
            const adjRecord = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Created via WH Assistant' });
            const costCache = {};
            groups.forEach(group => {
                if (!costCache[group.sourceItemId]) {
                    try { const costLookup = search.lookupFields({ type: search.Type.ITEM, id: group.sourceItemId, columns: ['averagecost'] }); costCache[group.sourceItemId] = parseFloat(costLookup.averagecost) || 0; } catch (e) { costCache[group.sourceItemId] = 0; }
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

        function whCreateBinTransfer(groups, memo) {
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

        function whCreateNonSerializedAdjustment(data, memo) {
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
            if (data.fromBinId || data.lotNumberId) {
                const rd = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                rd.selectNewLine({ sublistId: 'inventoryassignment' });
                rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -data.quantity });
                if (data.fromBinId) rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
                if (data.lotNumberId) rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: data.lotNumberId });
                rd.commitLine({ sublistId: 'inventoryassignment' });
            }
            adjRecord.commitLine({ sublistId: 'inventory' });
            adjRecord.selectNewLine({ sublistId: 'inventory' });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.targetItemId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
            if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
            if (data.toBinId || data.lotNumberText) {
                const ad = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                ad.selectNewLine({ sublistId: 'inventoryassignment' });
                ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                if (data.toBinId) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.toBinId });
                if (data.toStatusId) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: data.toStatusId });
                if (data.lotNumberText) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: data.lotNumberText });
                ad.commitLine({ sublistId: 'inventoryassignment' });
            }
            adjRecord.commitLine({ sublistId: 'inventory' });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function whCreateNonSerializedAdjustmentMulti(rows, memo) {
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
                if (data.fromBinId || data.lotNumberId) {
                    const rd = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                    rd.selectNewLine({ sublistId: 'inventoryassignment' });
                    rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -data.quantity });
                    if (data.fromBinId) rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
                    if (data.lotNumberId) rd.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: data.lotNumberId });
                    rd.commitLine({ sublistId: 'inventoryassignment' });
                }
                adjRecord.commitLine({ sublistId: 'inventory' });
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.targetItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
                if (itemCost > 0) adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                if (data.toBinId || data.lotNumberText) {
                    const ad = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                    ad.selectNewLine({ sublistId: 'inventoryassignment' });
                    ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                    if (data.toBinId) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.toBinId });
                    if (data.toStatusId) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: data.toStatusId });
                    if (data.lotNumberText) ad.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: data.lotNumberText });
                    ad.commitLine({ sublistId: 'inventoryassignment' });
                }
                adjRecord.commitLine({ sublistId: 'inventory' });
            });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function whCreateNonSerializedBinTransfer(data, memo) {
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
            if (data.lotNumberId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: data.lotNumberId });
            invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'tobinnumber', value: data.toBinId });
            if (data.toStatusId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'toinventorystatus', value: data.toStatusId });
            invDetail.commitLine({ sublistId: 'inventoryassignment' });
            tr.commitLine({ sublistId: 'inventory' });
            const transferId = tr.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(transferId);
            try { const l = search.lookupFields({ type: record.Type.BIN_TRANSFER, id: transferId, columns: ['tranid'] }); tranId = l.tranid || String(transferId); } catch (e) {}
            return { transferId: transferId, tranId: tranId };
        }

        function whCreateNonSerializedBinTransferMulti(rows, memo) {
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
                if (data.lotNumberId) invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: data.lotNumberId });
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

        function whCreateInventoryFoundAdjustment(groups, memo) {
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

        function whCreateNonSerializedInventoryFoundAdjustment(data, memo) {
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
            if (data.lotNumberText) addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: data.lotNumberText });
            addDetail.commitLine({ sublistId: 'inventoryassignment' });
            adjRecord.commitLine({ sublistId: 'inventory' });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function whCreateNonSerializedInventoryFoundMulti(rows, memo) {
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
                if (data.lotNumberText) addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: data.lotNumberText });
                addDetail.commitLine({ sublistId: 'inventoryassignment' });
                adjRecord.commitLine({ sublistId: 'inventory' });
            });
            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
            let tranId = String(adjId);
            try { const l = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] }); tranId = l.tranid || String(adjId); } catch (e) {}
            return { adjId: adjId, tranId: tranId };
        }

        function whCreateTransferOrderWithUpcharge(params) {
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

        function whCreateSerialNumberChangeAdjustment(changes, memo) {
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
                    } else if (change.action === 'serial_change_testing') {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: TESTING_BIN_ID });
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: TESTING_STATUS_ID });
                    } else if (change.action === 'serial_change_refurbishing') {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: REFURBISHING_BIN_ID });
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: REFURBISHING_STATUS_ID });
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

        function whCreatePartNumberChangeAdjustment(changes, memo) {
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
                    } else if (change.action === 'part_number_change_testing') {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: TESTING_BIN_ID });
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: TESTING_STATUS_ID });
                    } else if (change.action === 'part_number_change_refurbishing') {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: REFURBISHING_BIN_ID });
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: REFURBISHING_STATUS_ID });
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

        // ══════════════════════════════════════════════════════════════
        //  WH ASSISTANT — STYLES, CLIENT SCRIPTS, PAGE BUILDERS, HANDLERS
        //  (continued in next section)
        // ══════════════════════════════════════════════════════════════
        // ══════════════════════════════════════════════════════════════
        //  WH ASSISTANT — STYLES
        // ══════════════════════════════════════════════════════════════

        function whGetStyles() {
            return `<script>(function(){if(!document.querySelector('meta[name="viewport"]')){var m=document.createElement('meta');m.name='viewport';m.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no';document.head.appendChild(m);}})();</script>
            <style>
                html,body{overflow-x:hidden!important;max-width:100vw!important;margin:0!important;padding:0!important;}
                #main_form{background:#eef1f5!important;overflow-x:hidden!important;}
                #div__body,#outerdiv,.uir-record-type{overflow-x:hidden!important;max-width:100vw!important;}
                #ns_navigation,#ns-header-menu-main,.ns-navigation,#div__header,.bglt,#ns_header,.ns_header_body,.uir-page-title,.uir-page-title-firstline,.uir-page-title-secondline,.uir-page-title-wrap,.uir-header-buttons,.uir-button-bar,#ns-dashboard-page-header,.ns-role-menuitem,.ns-header-decorator,#ns_headerportal,#div__nav,#div__navmenu,.ns-menubar,.uir-breadcrumbs,.uir-record-name,#system_alert_pane,#nsBackButton{display:none!important;height:0!important;min-height:0!important;overflow:hidden!important;}
                #div__body{margin-top:0!important;padding-top:0!important;}
                #main_form>tbody>tr:first-child{display:none!important;}
                *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
                .app-container{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;max-width:920px;margin:16px auto;padding:0 12px;height:calc(100vh - 32px);display:flex;flex-direction:column;}
                .app-container-wide{max-width:1120px;}
                .main-card{background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.07);overflow:hidden;display:flex;flex-direction:column;min-height:0;flex:1;}
                .wh-card-header{background:linear-gradient(135deg,#0f2b46 0%,#1a4971 100%);color:#fff;padding:22px 28px;text-align:center;border-bottom:3px solid #f59e0b;}
                .wh-card-header h1{margin:0;font-size:20px;font-weight:700;letter-spacing:-.3px;}
                .wh-card-header p{margin:6px 0 0;opacity:.7;font-size:13px;}
                .form-body{padding:24px;overflow-y:auto;flex:1;min-height:0;-webkit-overflow-scrolling:touch;}
                .input-group{margin-bottom:22px;}
                .custom-label{display:block;font-weight:700;color:#374151;margin-bottom:8px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;}
                .input-group input[type="text"],.input-group select,.input-group textarea{width:100%!important;padding:14px 16px!important;border:2px solid #d1d5db!important;border-radius:10px!important;font-size:16px!important;background:#f9fafb!important;transition:border-color .15s,box-shadow .15s!important;color:#111827!important;min-height:48px;}
                .input-group textarea{min-height:200px!important;resize:vertical;line-height:1.5!important;font-family:'SF Mono',Monaco,'Courier New',monospace!important;}
                .input-group input:focus,.input-group select:focus,.input-group textarea:focus{border-color:#1a4971!important;background:#fff!important;outline:none!important;box-shadow:0 0 0 3px rgba(26,73,113,.15)!important;}
                .btn-area{display:flex;gap:10px;padding:16px 24px;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0;}
                .custom-btn{padding:14px 22px;border-radius:10px;font-weight:700;cursor:pointer;border:none;font-size:15px;transition:all .15s;min-height:48px;touch-action:manipulation;}
                .btn-primary{background:#1a4971;color:#fff;}.btn-primary:hover{background:#0f2b46;}
                .btn-success{background:#059669;color:#fff;flex:1;}.btn-success:hover{background:#047857;}
                .btn-outline{background:#fff;color:#6b7280;border:2px solid #d1d5db;}.btn-outline:hover{background:#f3f4f6;border-color:#9ca3af;}
                .btn-warning{background:#f59e0b;color:#fff;}.btn-warning:hover{background:#d97706;}
                .btn-danger{background:#ef4444;color:#fff;}.btn-danger:hover{background:#dc2626;}
                .mode-toggle{display:flex;gap:0;margin-bottom:22px;background:#f3f4f6;border-radius:10px;padding:3px;}
                .mode-btn{flex:1;padding:12px 16px;border:none;background:transparent;color:#6b7280;font-weight:700;font-size:13px;cursor:pointer;border-radius:8px;transition:all .15s;min-height:44px;touch-action:manipulation;}
                .mode-btn.active{background:#1a4971;color:#fff;box-shadow:0 2px 6px rgba(15,43,70,.3);}
                .mode-btn:hover:not(.active){background:#e5e7eb;color:#374151;}
                .badge-count{background:#1a4971;color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px;}
                .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;}
                .badge-success{background:#059669;color:#fff;}.badge-info{background:#2563eb;color:#fff;}.badge-muted{background:#e5e7eb;color:#6b7280;}.badge-error{background:#ef4444;color:#fff;}
                .wh-alert{padding:14px 18px;border-radius:10px;margin-bottom:20px;font-size:14px;font-weight:500;flex-shrink:0;}
                .wh-alert-error{background:#fef2f2;color:#991b1b;border-left:4px solid #ef4444;}
                .wh-alert-warning{background:#fffbeb;color:#92400e;border-left:4px solid #f59e0b;}
                .wh-alert-success{background:#f0fdf4;color:#166534;border-left:4px solid #10b981;}
                .results-table{width:100%;border-collapse:collapse;margin-bottom:20px;table-layout:fixed;overflow-wrap:break-word;}
                .results-table th{background:#f3f4f6;padding:10px 12px;text-align:left;font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e5e7eb;position:sticky;top:0;z-index:1;}
                .results-table td{padding:12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;}
                .results-table tr:hover td{background:#f9fafb;}
                .action-select{padding:10px 12px;border:2px solid #d1d5db;border-radius:8px;font-size:14px;background:#f9fafb;color:#111827;cursor:pointer;min-width:200px;min-height:44px;max-width:100%;}
                .action-select:focus{border-color:#1a4971;outline:none;box-shadow:0 0 0 3px rgba(26,73,113,.12);}
                .success-icon{font-size:56px;color:#059669;margin-bottom:12px;}
                .success-card{text-align:center;padding:24px 0 0;}
                .success-card h2{margin:0 0 6px;font-size:22px;color:#111827;font-weight:800;}
                .success-card p{color:#6b7280;margin-bottom:24px;font-size:14px;}
                .serial-list{list-style:none;padding:0;margin:16px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;text-align:left;}
                .serial-list li{font-family:'SF Mono',Monaco,monospace;font-size:12px;padding:8px 12px;background:#f3f4f6;border-radius:6px;color:#374151;border:1px solid #e5e7eb;}
                .bulk-action-bar{background:#f9fafb;padding:14px 16px;border-radius:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:0;z-index:2;border:1px solid #e5e7eb;}
                .bulk-action-bar label{font-weight:700;color:#374151;font-size:13px;white-space:nowrap;}
                .label-group{background:#f9fafb;border-radius:10px;padding:16px;margin:12px 0;text-align:left;border:1px solid #e5e7eb;}
                .label-group h3{margin:0 0 8px;font-size:15px;color:#1a4971;font-weight:700;}
                .form-section{display:none;}.form-section.active{display:block;}
                @media screen and (max-width:768px){
                    #main_form{padding:0!important;margin:0!important;overflow-x:hidden!important;}
                    body,#div__body,#outerdiv,.uir-record-type{padding:0!important;margin:0!important;overflow-x:hidden!important;max-width:100vw!important;}
                    .uir-page-title,.uir-page-title-firstline,.uir-page-title-secondline,.uir-header-buttons,.uir-button-bar,#tbl_submitter,#submitter_row,.uir_form_tab_bg{display:none!important;}
                    .app-container{padding:0!important;margin:0!important;height:100vh;max-width:100%!important;overflow-x:hidden!important;}
                    .main-card{border-radius:0;box-shadow:none;border:none;}
                    .wh-card-header{padding:10px 14px;}.wh-card-header h1{font-size:16px;}.wh-card-header p{font-size:11px;margin-top:2px;}
                    .form-body{padding:10px;flex:0 1 auto;}
                    .input-group{margin-bottom:12px;}.custom-label{font-size:11px;margin-bottom:5px;}
                    .input-group input[type="text"],.input-group select,.input-group textarea{padding:12px!important;font-size:16px!important;border-radius:8px!important;border-width:1.5px!important;}
                    .input-group textarea{min-height:140px!important;}
                    .mode-toggle{margin-bottom:12px;padding:2px;border-radius:8px;}.mode-btn{padding:10px 6px;font-size:12px;border-radius:6px;}
                    .btn-area{padding:8px 10px;gap:8px;flex-direction:column;}.custom-btn{padding:14px;font-size:14px;border-radius:8px;width:100%;text-align:center;}
                    .results-table,.results-table thead,.results-table tbody,.results-table tr,.results-table th,.results-table td{display:block!important;width:100%!important;white-space:normal!important;}
                    .results-table thead{display:none!important;}
                    .results-table tr{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;}
                    .results-table td{padding:3px 0!important;border-bottom:none!important;font-size:14px!important;text-align:left!important;}
                    .results-table td[data-label]::before{content:attr(data-label) ": ";font-weight:800;font-size:10px;text-transform:uppercase;color:#6b7280;letter-spacing:.3px;display:block;margin-bottom:1px;}
                    .action-select{min-width:unset!important;width:100%!important;max-width:100%!important;}
                    .wh-alert{padding:10px 12px;font-size:13px;margin-bottom:10px;}
                    .bulk-action-bar{flex-direction:column!important;align-items:stretch!important;gap:8px!important;padding:10px!important;margin-bottom:10px;}
                    .bulk-action-bar label{font-size:11px;white-space:normal!important;}
                    .bulk-action-bar select{width:100%!important;font-size:16px!important;}
                    .success-icon{font-size:36px;margin-bottom:8px;}.success-card{padding:10px 0 0;}.success-card h2{font-size:18px;}.success-card p{font-size:13px!important;margin-bottom:16px;}
                    .serial-list{grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:4px;margin:8px 0;}.serial-list li{font-size:11px;padding:6px 8px;word-break:break-all;}
                    #inventoryFoundModal>div{padding:16px!important;width:96%!important;max-width:96%!important;border-radius:10px!important;}
                    #inventoryFoundModal h2{font-size:16px!important;}
                    #inventoryFoundModal input,#inventoryFoundModal textarea{font-size:16px!important;padding:10px!important;}
                    #ns-grid-table select,#ns-grid-table input{min-width:unset!important;width:100%!important;max-width:100%!important;}
                    #ns-grid-table{table-layout:fixed!important;width:100%!important;}
                    .new-serial-input,.new-item-input{font-size:16px!important;padding:10px!important;min-width:unset!important;width:100%!important;}
                }
                @media screen and (max-width:400px){
                    .wh-card-header{padding:8px 10px;}.wh-card-header h1{font-size:14px;}.wh-card-header p{display:none;}
                    .mode-btn{padding:8px 3px;font-size:11px;}
                    .serial-list{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));}
                }
            </style>`;
        }

        // ══════════════════════════════════════════════════════════════
        //  WH ASSISTANT — CLIENT-SIDE SCRIPTS
        // ══════════════════════════════════════════════════════════════

        function whGetEntryFormScript(nsBinOptionsHtml) {
            return `<script>
                window.onbeforeunload=null;if(typeof setWindowChanged==='function')setWindowChanged(window,false);
                var currentMode='serialized';var nsGridRowId=0;
                var nsBinOptions='${(nsBinOptionsHtml||'').replace(/'/g,"\\'")}';
                var nsActionOptions='<option value="">-- Select Action --</option><option value="back_to_stock">Back to Stock</option><option value="likenew">Change to Like New</option><option value="likenew_stock">Change to Like New &amp; Back to Stock</option><option value="defective">Defective</option><option value="move_refurbishing">Move to Refurbishing</option><option value="move_testing">Move to Testing</option><option value="return_to_vendor">Return to Vendor</option><option value="part_number_change">Part Number Change</option><option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option><option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option><option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option><option value="trash">Trash</option><option value="inventory_found">Inventory Found</option><option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>';
                function addNsGridRow(){var tbody=document.getElementById('ns-grid-body');if(!tbody)return;nsGridRowId++;var tr=document.createElement('tr');tr.setAttribute('data-row-id',nsGridRowId);tr.innerHTML='<td data-label="SKU"><input type="text" class="ns-grid-input ns-item-input" data-row="'+nsGridRowId+'" placeholder="Enter SKU" style="width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;box-sizing:border-box;min-height:44px;"></td><td data-label="From Bin"><select class="action-select ns-bin-input" data-row="'+nsGridRowId+'" style="min-width:120px;min-height:44px;">'+nsBinOptions+'</select></td><td data-label="Qty"><input type="number" class="ns-grid-input ns-qty-input" data-row="'+nsGridRowId+'" placeholder="Qty" min="1" style="width:80px;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td><td data-label="Action"><select class="action-select ns-action-input" data-row="'+nsGridRowId+'" style="min-width:180px;min-height:44px;" onchange="handleNsActionChange(this)">'+nsActionOptions+'</select><input type="text" class="ns-grid-input ns-newitem-input" data-row="'+nsGridRowId+'" placeholder="New item name" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><input type="number" class="ns-grid-input ns-upcharge-input" data-row="'+nsGridRowId+'" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td><td><button type="button" onclick="removeNsGridRow('+nsGridRowId+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:20px;padding:6px 10px;min-height:44px;min-width:44px;" title="Remove">&times;</button></td>';tbody.appendChild(tr);updateNsRowCount();var newInput=tr.querySelector('.ns-item-input');if(newInput)newInput.focus();}
                function removeNsGridRow(rowId){var row=document.querySelector('#ns-grid-body tr[data-row-id="'+rowId+'"]');if(row)row.remove();updateNsRowCount();var tbody=document.getElementById('ns-grid-body');if(tbody&&tbody.children.length===0)addNsGridRow();}
                function updateNsRowCount(){var tbody=document.getElementById('ns-grid-body');var countEl=document.getElementById('ns_row_count');if(tbody&&countEl)countEl.textContent=tbody.children.length;}
                function clearNsGrid(){var tbody=document.getElementById('ns-grid-body');if(tbody)tbody.innerHTML='';nsGridRowId=0;addNsGridRow();}
                function handleNsActionChange(selectEl){var row=selectEl.closest('tr');if(!row)return;var v=selectEl.value;var upchargeInput=row.querySelector('.ns-upcharge-input');if(upchargeInput){upchargeInput.style.display=v==='transfer_upcharge'?'block':'none';if(v!=='transfer_upcharge')upchargeInput.value='';}var newItemInput=row.querySelector('.ns-newitem-input');if(newItemInput){var isPnc=v==='part_number_change'||v==='part_number_change_stock'||v==='part_number_change_testing'||v==='part_number_change_refurbishing';newItemInput.style.display=isPnc?'block':'none';if(!isPnc)newItemInput.value='';}}
                function submitNonSerializedMulti(){var rows=document.querySelectorAll('#ns-grid-body tr');var gridData=[];var hasError=false;var pncActions=['part_number_change','part_number_change_stock','part_number_change_testing','part_number_change_refurbishing'];for(var i=0;i<rows.length;i++){var row=rows[i];var itemInput=row.querySelector('.ns-item-input');var binInput=row.querySelector('.ns-bin-input');var qtyInput=row.querySelector('.ns-qty-input');var actionSelect=row.querySelector('.ns-action-input');var upchargeInput=row.querySelector('.ns-upcharge-input');var newItemInput=row.querySelector('.ns-newitem-input');var itemName=itemInput?itemInput.value.trim():'';var binNumber=binInput?binInput.value.trim():'';var qty=qtyInput?parseInt(qtyInput.value)||0:0;var action=actionSelect?actionSelect.value:'';var upcharge=upchargeInput?parseFloat(upchargeInput.value)||0:0;var newItemName=newItemInput?newItemInput.value.trim():'';if(!itemName&&!binNumber&&qty===0&&!action)continue;if(!itemName){if(itemInput)itemInput.style.borderColor='#ef4444';hasError=true;}else{if(itemInput)itemInput.style.borderColor='#d1d5db';}if(!binNumber){if(binInput)binInput.style.borderColor='#ef4444';hasError=true;}else{if(binInput)binInput.style.borderColor='#d1d5db';}if(qty<=0){if(qtyInput)qtyInput.style.borderColor='#ef4444';hasError=true;}else{if(qtyInput)qtyInput.style.borderColor='#d1d5db';}if(!action){if(actionSelect)actionSelect.style.borderColor='#ef4444';hasError=true;}else{if(actionSelect)actionSelect.style.borderColor='#d1d5db';}if(action==='transfer_upcharge'&&upcharge<=0){if(upchargeInput)upchargeInput.style.borderColor='#ef4444';hasError=true;}else{if(upchargeInput)upchargeInput.style.borderColor='#d1d5db';}if(pncActions.indexOf(action)!==-1&&!newItemName){if(newItemInput)newItemInput.style.borderColor='#ef4444';hasError=true;}else{if(newItemInput)newItemInput.style.borderColor='#d1d5db';}gridData.push({itemName:itemName,binNumber:binNumber,quantity:qty,action:action,upcharge:action==='transfer_upcharge'?upcharge:0,newItemName:pncActions.indexOf(action)!==-1?newItemName:''});}if(gridData.length===0){alert('Please fill in at least one row.');return;}if(hasError){alert('Please fix the highlighted fields.');return;}window.onbeforeunload=null;var form=document.forms[0];var cartField=document.getElementById('custpage_ns_cart_json');if(cartField)cartField.value=JSON.stringify(gridData);var actionInput=document.createElement('input');actionInput.type='hidden';actionInput.name='custpage_action';actionInput.value='process_nonserialized_multi';form.appendChild(actionInput);form.submit();}
                function switchMode(mode){currentMode=mode;['serialized','nonserialized'].forEach(function(m){var sec=document.getElementById(m+'-section');var btn=document.getElementById('mode-'+m);var area=document.getElementById(m+'-btn-area');if(sec)sec.classList.remove('active');if(btn)btn.classList.remove('active');if(area)area.style.display='none';});var sec=document.getElementById(mode+'-section');var btn=document.getElementById('mode-'+mode);var area=document.getElementById(mode+'-btn-area');if(sec)sec.classList.add('active');if(btn)btn.classList.add('active');if(area)area.style.display='flex';if(mode==='serialized'){var f=document.getElementById('custpage_serial_numbers');if(f)f.focus();}}
                function updateCount(){var field=document.getElementById('custpage_serial_numbers');var display=document.getElementById('serial_count');if(!field||!display)return;display.textContent=field.value.split(/[\\r\\n]+/).filter(function(s){return s.trim()!=='';}).length;}
                function submitSerials(){var field=document.getElementById('custpage_serial_numbers');if(!field||!field.value.trim()){alert('Scan or enter at least one serial number');return;}window.onbeforeunload=null;var form=document.forms[0];var action=document.createElement('input');action.type='hidden';action.name='custpage_action';action.value='lookup_serials';form.appendChild(action);form.submit();}
                function showInventoryFoundModal(){var modal=document.getElementById('inventoryFoundModal');if(modal)modal.style.display='flex';var itemInput=document.getElementById('if_item_name');if(itemInput)itemInput.focus();}
                function hideInventoryFoundModal(){var modal=document.getElementById('inventoryFoundModal');if(modal)modal.style.display='none';}
                function submitInventoryFound(){var itemName=(document.getElementById('if_item_name').value||'').trim();var serialsRaw=(document.getElementById('if_serials').value||'').trim();if(!itemName){alert('Please enter an item name / SKU.');return;}if(!serialsRaw){alert('Please enter at least one serial number.');return;}window.onbeforeunload=null;var form=document.forms[0];var ifItemField=document.getElementById('custpage_if_item_name');if(ifItemField)ifItemField.value=itemName;var ifSerialsField=document.getElementById('custpage_if_serials');if(ifSerialsField)ifSerialsField.value=serialsRaw;var actionInput=document.createElement('input');actionInput.type='hidden';actionInput.name='custpage_action';actionInput.value='process_inventory_found';form.appendChild(actionInput);form.submit();}
                function clearForm(){if(currentMode==='serialized'){var f=document.getElementById('custpage_serial_numbers');if(f)f.value='';updateCount();}else if(currentMode==='nonserialized'){clearNsGrid();}}
                document.addEventListener('DOMContentLoaded',function(){window.onbeforeunload=null;if(typeof NS!=='undefined'&&NS.form)NS.form.setChanged(false);updateCount();var field=document.getElementById('custpage_serial_numbers');if(field){field.addEventListener('input',updateCount);field.addEventListener('paste',function(){setTimeout(updateCount,50);});field.focus();}});
            </script>`;
        }

        function whGetResultsPageScript() {
            return `<script>
                window.onbeforeunload=null;
                function setAllActions(value){if(value==='serial_change'||value==='serial_change_stock'||value==='serial_change_testing'||value==='serial_change_refurbishing'){alert('Serial change actions must be set individually.');return;}var bulkNewItem=document.getElementById('bulk-new-item');var bulkUpcharge=document.getElementById('bulk-upcharge');var isPnChange=value==='part_number_change'||value==='part_number_change_stock'||value==='part_number_change_testing'||value==='part_number_change_refurbishing';if(bulkNewItem){bulkNewItem.style.display=isPnChange?'block':'none';if(!isPnChange)bulkNewItem.value='';}if(bulkUpcharge){bulkUpcharge.style.display=value==='transfer_upcharge'?'block':'none';if(value!=='transfer_upcharge')bulkUpcharge.value='';}if(isPnChange){var bulkItemName=bulkNewItem?bulkNewItem.value.trim():'';var selects=document.querySelectorAll('select.action-select[data-index]');for(var i=0;i<selects.length;i++){selects[i].value=value;handleActionChange(selects[i]);}if(bulkItemName){var inputs=document.querySelectorAll('.new-item-input[data-index]');for(var j=0;j<inputs.length;j++)inputs[j].value=bulkItemName;}else{if(bulkNewItem)bulkNewItem.focus();}updateActionCount();return;}if(value==='transfer_upcharge'){var bulkUpchargeVal=bulkUpcharge?bulkUpcharge.value.trim():'';var selects=document.querySelectorAll('select.action-select[data-index]');for(var i=0;i<selects.length;i++){var loc=selects[i].getAttribute('data-location');if(loc==='${TRANSFER_SOURCE_LOCATION_ID}'){selects[i].value=value;handleActionChange(selects[i]);}}if(bulkUpchargeVal&&parseFloat(bulkUpchargeVal)>0){for(var i=0;i<selects.length;i++){if(selects[i].getAttribute('data-location')==='${TRANSFER_SOURCE_LOCATION_ID}'){var idx=selects[i].getAttribute('data-index');var ui=document.querySelector('.upcharge-input[data-index="'+idx+'"]');if(ui)ui.value=bulkUpchargeVal;}}}else{if(bulkUpcharge)bulkUpcharge.focus();}updateActionCount();return;}var selects=document.querySelectorAll('select.action-select[data-index]');for(var i=0;i<selects.length;i++){selects[i].value=value;handleActionChange(selects[i]);}updateActionCount();}
                function handleActionChange(selectEl){var idx=selectEl.getAttribute('data-index');var nsi=document.querySelector('.new-serial-input[data-index="'+idx+'"]');var nii=document.querySelector('.new-item-input[data-index="'+idx+'"]');var uci=document.querySelector('.upcharge-input[data-index="'+idx+'"]');var v=selectEl.value;if(nsi){var show=v==='serial_change'||v==='serial_change_stock'||v==='serial_change_testing'||v==='serial_change_refurbishing';nsi.style.display=show?'block':'none';if(!show)nsi.value='';}if(nii){var show=v==='part_number_change'||v==='part_number_change_stock'||v==='part_number_change_testing'||v==='part_number_change_refurbishing';nii.style.display=show?'block':'none';if(!show)nii.value='';}if(uci){var show=v==='transfer_upcharge';uci.style.display=show?'block':'none';if(!show)uci.value='';}updateActionCount();}
                function updateActionCount(){var selects=document.querySelectorAll('select.action-select[data-index]');var count=0;for(var i=0;i<selects.length;i++){if(selects[i].value!=='')count++;}var display=document.getElementById('action_count');if(display)display.textContent=count;}
                function submitActions(){var selects=document.querySelectorAll('select.action-select[data-index]');var actions=[];var hasAction=false;var missingNewSerial=false,missingNewItem=false,missingUpcharge=false;var bulkNewItem=document.getElementById('bulk-new-item');var bulkItemName=bulkNewItem?bulkNewItem.value.trim():'';var bulkUpcharge=document.getElementById('bulk-upcharge');var bulkUpchargeVal=bulkUpcharge?bulkUpcharge.value.trim():'';for(var i=0;i<selects.length;i++){var idx=selects[i].getAttribute('data-index');var val=selects[i].value;var newSerial='',newItemName='',upcharge=0;if(val==='serial_change'||val==='serial_change_stock'||val==='serial_change_testing'||val==='serial_change_refurbishing'){var ni=document.querySelector('.new-serial-input[data-index="'+idx+'"]');if(ni){newSerial=ni.value.trim();if(!newSerial){missingNewSerial=true;ni.style.borderColor='#ef4444';}else{ni.style.borderColor='#d1d5db';}}}if(val==='part_number_change'||val==='part_number_change_stock'||val==='part_number_change_testing'||val==='part_number_change_refurbishing'){var ni=document.querySelector('.new-item-input[data-index="'+idx+'"]');if(ni){newItemName=ni.value.trim();if(!newItemName&&bulkItemName){newItemName=bulkItemName;ni.value=bulkItemName;}if(!newItemName){missingNewItem=true;ni.style.borderColor='#ef4444';}else{ni.style.borderColor='#d1d5db';}}}if(val==='transfer_upcharge'){var ui=document.querySelector('.upcharge-input[data-index="'+idx+'"]');if(ui){var uv=ui.value.trim();if(!uv&&bulkUpchargeVal){uv=bulkUpchargeVal;ui.value=bulkUpchargeVal;}upcharge=parseFloat(uv)||0;if(upcharge<=0){missingUpcharge=true;ui.style.borderColor='#ef4444';}else{ui.style.borderColor='#d1d5db';}}}actions.push({index:parseInt(idx),action:val,newSerial:newSerial,newItemName:newItemName,upcharge:upcharge});if(val!=='')hasAction=true;}if(!hasAction){alert('Select an action for at least one serial');return;}if(missingNewSerial){alert('Enter a new serial for all Serial Change actions');return;}if(missingNewItem){alert('Enter a new item name for all Part Number Change actions');return;}if(missingUpcharge){alert('Enter an upcharge amount for all Transfer & Upcharge actions');return;}window.onbeforeunload=null;var form=document.forms[0];var jsonField=document.getElementById('custpage_actions_json');if(jsonField)jsonField.value=JSON.stringify(actions);var actionInput=document.createElement('input');actionInput.type='hidden';actionInput.name='custpage_action';actionInput.value='process_actions';form.appendChild(actionInput);form.submit();}
                function goBack(){window.onbeforeunload=null;if(typeof setWindowChanged==='function')setWindowChanged(window,false);var form=document.forms[0];var existing=form.querySelectorAll('input[name="custpage_action"]');for(var i=0;i<existing.length;i++)existing[i].parentNode.removeChild(existing[i]);var ai=document.createElement('input');ai.type='hidden';ai.name='custpage_action';ai.value='go_home';form.appendChild(ai);form.submit();}
                document.addEventListener('DOMContentLoaded',function(){window.onbeforeunload=null;var selects=document.querySelectorAll('select.action-select[data-index]');for(var i=0;i<selects.length;i++){selects[i].addEventListener('change',function(){handleActionChange(this);});}updateActionCount();document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.classList.contains('new-serial-input')){e.preventDefault();var allInputs=Array.from(document.querySelectorAll('.new-serial-input'));var visibleInputs=allInputs.filter(function(inp){return inp.style.display!=='none'&&inp.offsetParent!==null;});var currentIdx=visibleInputs.indexOf(e.target);if(currentIdx!==-1&&currentIdx<visibleInputs.length-1){visibleInputs[currentIdx+1].focus();}}});});
            </script>`;
        }

        function whGetSuccessPageScript(returnAction) {
            const homeAction = returnAction || 'go_home';
            return `<script>
                function printLabels(){window.onbeforeunload=null;if(typeof setWindowChanged==='function')setWindowChanged(window,false);var form=document.forms[0];form.target='_blank';var action=document.createElement('input');action.type='hidden';action.name='custpage_action';action.value='printpdf';form.appendChild(action);form.submit();form.removeChild(action);form.target='';}
                function createAnother(){window.onbeforeunload=null;if(typeof setWindowChanged==='function')setWindowChanged(window,false);var form=document.forms[0];var existing=form.querySelectorAll('input[name="custpage_action"]');for(var i=0;i<existing.length;i++)existing[i].parentNode.removeChild(existing[i]);var ai=document.createElement('input');ai.type='hidden';ai.name='custpage_action';ai.value='${homeAction}';form.appendChild(ai);form.submit();}
                function nextStage(){window.onbeforeunload=null;if(typeof setWindowChanged==='function')setWindowChanged(window,false);var form=document.forms[0];var existing=form.querySelectorAll('input[name="custpage_action"]');for(var i=0;i<existing.length;i++)existing[i].parentNode.removeChild(existing[i]);var ai=document.createElement('input');ai.type='hidden';ai.name='custpage_action';ai.value='next_stage';form.appendChild(ai);form.submit();}
            </script>`;
        }

        // ══════════════════════════════════════════════════════════════
        //  WH ASSISTANT — PAGE BUILDERS
        // ══════════════════════════════════════════════════════════════

        function createWhEntryForm(context, message, messageType) {
            const form = serverWidget.createForm({ title: 'Warehouse Assistant' });
            const binList = whGetBinsForLocation('1');
            let nsBinOptionsHtml = '<option value="">-- Select Bin --</option>';
            binList.forEach(function(b) { nsBinOptionsHtml += '<option value="' + whEscapeXml(b.name) + '">' + whEscapeXml(b.name) + '</option>'; });

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = whGetStyles() + whGetEntryFormScript(nsBinOptionsHtml);

            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'wh-alert-success' : messageType === 'warning' ? 'wh-alert-warning' : 'wh-alert-error';
                msgHtml = '<div class="wh-alert ' + cls + '">' + message + '</div>';
            }

            const containerStart = form.addField({ id: 'custpage_container_start', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerStart.defaultValue = '<div class="app-container">' + msgHtml + '<div class="main-card"><div class="wh-card-header"><h1>Warehouse Assistant</h1><p>Scan &bull; Process &bull; Print</p></div><div class="form-body"><div class="mode-toggle"><button type="button" id="mode-serialized" class="mode-btn active" onclick="switchMode(\'serialized\')">Serialized</button><button type="button" id="mode-nonserialized" class="mode-btn" onclick="switchMode(\'nonserialized\')">Non-Serialized</button></div><div id="serialized-section" class="form-section active"><div class="input-group"><label class="custom-label">Serial Numbers <span class="badge-count"><span id="serial_count">0</span> scanned</span></label><div id="serial-field-wrap"></div></div></div><div id="nonserialized-section" class="form-section"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><label class="custom-label" style="margin-bottom:0;">Items <span class="badge-count"><span id="ns_row_count">1</span> rows</span></label><button type="button" class="custom-btn btn-outline" style="padding:8px 14px;font-size:12px;margin:0;min-height:36px;" onclick="addNsGridRow()">+ Add Row</button></div><table class="results-table" id="ns-grid-table"><thead><tr><th style="width:35%;">Part Number / SKU</th><th>From Bin</th><th>Qty</th><th>Action</th><th style="width:40px;"></th></tr></thead><tbody id="ns-grid-body"></tbody></table></div></div><div id="serialized-btn-area" class="btn-area"><button type="button" class="custom-btn btn-success" onclick="submitSerials()">Submit</button><button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button><button type="button" class="custom-btn btn-warning" style="padding:10px 14px;font-size:13px;" onclick="showInventoryFoundModal()">Inv. Found</button></div><div id="nonserialized-btn-area" class="btn-area" style="display:none;"><button type="button" class="custom-btn btn-success" onclick="submitNonSerializedMulti()">Submit</button><button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button><button type="button" class="custom-btn btn-warning" style="padding:10px 14px;font-size:13px;" onclick="showInventoryFoundModal()">Inv. Found</button></div></div></div><div id="inventoryFoundModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;justify-content:center;align-items:center;"><div style="background:#fff;border-radius:12px;padding:28px;max-width:500px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3);"><h2 style="margin:0 0 6px;color:#1a4971;font-size:18px;font-weight:700;">Inventory Found</h2><p style="margin:0 0 18px;color:#6b7280;font-size:13px;">Enter item name and serial number(s) to adjust in.</p><label style="display:block;font-weight:700;margin-bottom:5px;color:#374151;font-size:13px;">Item Name / SKU</label><input type="text" id="if_item_name" placeholder="Exact item name" style="width:100%;padding:12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:16px;margin-bottom:14px;min-height:44px;"><label style="display:block;font-weight:700;margin-bottom:5px;color:#374151;font-size:13px;">Serial Numbers (one per line)</label><textarea id="if_serials" rows="5" placeholder="Scan or type serials" style="width:100%;padding:12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:16px;resize:vertical;margin-bottom:18px;font-family:\'SF Mono\',Monaco,monospace;"></textarea><div style="display:flex;gap:10px;justify-content:flex-end;"><button type="button" class="custom-btn btn-outline" style="padding:10px 20px;margin:0;" onclick="hideInventoryFoundModal()">Cancel</button><button type="button" class="custom-btn btn-success" style="padding:10px 20px;margin:0;" onclick="submitInventoryFound()">Submit</button></div></div></div><div style="display:none;">';

            const serialField = form.addField({ id: 'custpage_serial_numbers', type: serverWidget.FieldType.TEXTAREA, label: 'Serials' });
            serialField.updateDisplaySize({ height: 10, width: 60 });
            const ifItemField = form.addField({ id: 'custpage_if_item_name', type: serverWidget.FieldType.TEXT, label: 'IF Item' });
            ifItemField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); ifItemField.defaultValue = '';
            const ifSerialsField = form.addField({ id: 'custpage_if_serials', type: serverWidget.FieldType.LONGTEXT, label: 'IF Serials' });
            ifSerialsField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); ifSerialsField.defaultValue = '';
            const nsCartDataField = form.addField({ id: 'custpage_ns_cart_json', type: serverWidget.FieldType.LONGTEXT, label: 'NS Cart Data' });
            nsCartDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); nsCartDataField.defaultValue = '';

            const containerEnd = form.addField({ id: 'custpage_container_end', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerEnd.defaultValue = '</div><script>document.addEventListener("DOMContentLoaded",function(){var sw=document.getElementById("serial-field-wrap");var sl=document.getElementById("custpage_serial_numbers_fs_lbl_uir_label");if(sw&&sl)sw.appendChild(sl.parentNode);updateCount();addNsGridRow();});</script>';
            context.response.writePage(form);
        }

        function createWhResultsPage(context, serialData, message, messageType) {
            const form = serverWidget.createForm({ title: 'Serial Lookup Results' });
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = whGetStyles() + whGetResultsPageScript();

            let rows = '';
            const hasLocation26Serials = serialData.valid.some(s => String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID);
            serialData.valid.forEach((s, idx) => {
                const isLoc26 = String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID;
                const transferOption = isLoc26 ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : '';
                rows += '<tr><td data-label="Serial" style="font-family:\'SF Mono\',Monaco,monospace;font-size:14px;">' + whEscapeXml(s.serialNumber) + '</td><td data-label="Item"><strong>' + whEscapeXml(s.itemText) + '</strong></td><td data-label="Bin">' + (whEscapeXml(s.binText) || '<span style="color:#9ca3af;">N/A</span>') + '</td><td data-label="Location">' + (whEscapeXml(s.locationText) || '<span style="color:#9ca3af;">N/A</span>') + '</td><td data-label="Action"><select class="action-select" data-index="' + idx + '" data-location="' + whEscapeXml(String(s.locationId)) + '" onchange="handleActionChange(this)"><option value="">-- No Action --</option><option value="back_to_stock">Back to Stock</option><option value="likenew">Change to Like New</option><option value="likenew_stock">Change to Like New &amp; Back to Stock</option><option value="serial_change_stock">Change Serial &amp; Back to Stock</option><option value="serial_change_testing">Change Serial &amp; Move to Testing</option><option value="serial_change_refurbishing">Change Serial &amp; Move to Refurbishing</option><option value="defective">Defective</option><option value="move_refurbishing">Move to Refurbishing</option><option value="move_testing">Move to Testing</option><option value="part_number_change">Part Number Change</option><option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option><option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option><option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option><option value="return_to_vendor">Return to Vendor</option><option value="serial_change">Serial Number Change</option><option value="trash">Trash</option>' + transferOption + '</select><input type="text" class="new-serial-input" data-index="' + idx + '" placeholder="New serial" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><input type="text" class="new-item-input" data-index="' + idx + '" placeholder="New item name" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><input type="number" class="upcharge-input" data-index="' + idx + '" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td></tr>';
            });

            let invalidHtml = '';
            if (serialData.invalid.length > 0) {
                const invalidList = serialData.invalid.map(s => '<span class="badge badge-error">' + whEscapeXml(s) + '</span>').join(' ');
                invalidHtml = '<div class="wh-alert wh-alert-warning"><strong>Not found (' + serialData.invalid.length + '):</strong><br><div style="margin-top:8px;">' + invalidList + '</div></div>';
            }
            let msgHtml = '';
            if (message) {
                const cls = messageType === 'success' ? 'wh-alert-success' : messageType === 'warning' ? 'wh-alert-warning' : 'wh-alert-error';
                msgHtml = '<div class="wh-alert ' + cls + '">' + message + '</div>';
            }

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = '<div class="app-container app-container-wide">' + msgHtml + invalidHtml + '<div class="main-card"><div class="wh-card-header"><h1>Lookup Results</h1><p>' + serialData.valid.length + ' serial' + (serialData.valid.length !== 1 ? 's' : '') + ' found</p></div><div class="form-body"><div class="bulk-action-bar" style="flex-wrap:wrap;"><label>Apply to All:</label><select class="action-select" onchange="setAllActions(this.value)" style="flex:1;"><option value="">-- No Action --</option><option value="back_to_stock">Back to Stock</option><option value="likenew">Change to Like New</option><option value="likenew_stock">Change to Like New &amp; Back to Stock</option><option value="serial_change_stock">Change Serial &amp; Back to Stock</option><option value="serial_change_testing">Change Serial &amp; Move to Testing</option><option value="serial_change_refurbishing">Change Serial &amp; Move to Refurbishing</option><option value="defective">Defective</option><option value="move_refurbishing">Move to Refurbishing</option><option value="move_testing">Move to Testing</option><option value="part_number_change">Part Number Change</option><option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option><option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option><option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option><option value="return_to_vendor">Return to Vendor</option><option value="serial_change">Serial Number Change</option><option value="trash">Trash</option>' + (hasLocation26Serials ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : '') + '</select><input type="text" id="bulk-new-item" placeholder="New item name" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><input type="number" id="bulk-upcharge" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><div style="display:flex;align-items:center;gap:10px;"><span style="color:#6b7280;font-weight:600;font-size:13px;">Selected:</span><span style="font-size:22px;font-weight:800;color:#1a4971;" id="action_count">0</span><button type="button" class="custom-btn btn-success" style="padding:10px 20px;margin:0;" onclick="submitActions()">Submit</button><button type="button" class="custom-btn btn-outline" style="padding:10px 20px;margin:0;" onclick="goBack()">Back</button></div></div><table class="results-table"><thead><tr><th>Serial</th><th>Item</th><th>Bin</th><th>Location</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';

            const dataField = form.addField({ id: 'custpage_serial_data', type: serverWidget.FieldType.LONGTEXT, label: 'Data' });
            dataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            dataField.defaultValue = JSON.stringify(serialData);
            const actionsField = form.addField({ id: 'custpage_actions_json', type: serverWidget.FieldType.LONGTEXT, label: 'Actions' });
            actionsField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            actionsField.defaultValue = '';
            context.response.writePage(form);
        }

        function createWhSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId, transferOrderTranId, errors, failedGroups, returnAction) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });
            errors = errors || []; failedGroups = failedGroups || [];
            labelGroups.forEach((group) => {
                try {
                    const rec = record.create({ type: 'customrecord_print_label', isDynamic: true });
                    rec.setValue({ fieldId: 'custrecord_pl_item_number', value: group.itemId });
                    rec.setValue({ fieldId: 'custrecord_express_entry', value: group.serialNumbers.join('<br>') });
                    group.recordId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                } catch (e) { log.error('Print Label Record Error', e.message); group.recordId = 'ERR'; }
            });
            const printData = labelGroups.map(g => ({ itemText: g.itemText || '', description: g.description || '', serialNumbers: g.serialNumbers, action: g.action || '' }));
            const recordIdForPrint = (adjustmentTranId || binTransferTranId || serialChangeTranId || partNumberChangeTranId || transferOrderTranId || '').split(',')[0].trim();
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = whGetStyles() + whGetSuccessPageScript(returnAction);
            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printDataField.defaultValue = JSON.stringify(printData);
            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printRecordIdField.defaultValue = String(recordIdForPrint);
            const allSerials = [];
            labelGroups.forEach(g => { g.serialNumbers.forEach(sn => allSerials.push(sn)); });
            const nextStageData = { serials: allSerials, nsItems: [] };
            const nextStageField = form.addField({ id: 'custpage_next_stage_data', type: serverWidget.FieldType.LONGTEXT, label: 'Next Stage Data' });
            nextStageField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); nextStageField.defaultValue = JSON.stringify(nextStageData);
            const ACTION_LABELS = {'back_to_stock':'Back to Stock','defective':'Defective','likenew':'Like New','likenew_stock':'Like New + Back to Stock','move_refurbishing':'Move to Refurbishing','move_testing':'Move to Testing','return_to_vendor':'Return to Vendor','serial_change':'Serial Number Change','serial_change_stock':'Change Serial & Back to Stock','serial_change_testing':'Change Serial & Move to Testing','serial_change_refurbishing':'Change Serial & Move to Refurbishing','part_number_change':'Part Number Change','part_number_change_stock':'Part Number Change & Back to Stock','part_number_change_testing':'Part Number Change & Move to Testing','part_number_change_refurbishing':'Part Number Change & Move to Refurbishing','trash':'Trash','inventory_found':'Inventory Found','transfer_upcharge':'Transfer to A & Upcharge'};

            let failedHtml = '';
            if (failedGroups.length > 0) {
                let failedRowsHtml = '';
                failedGroups.forEach(f => { failedRowsHtml += '<tr style="background:#fef2f2;"><td data-label="Serial" style="color:#991b1b;font-weight:700;">' + whEscapeXml(f.serialNumber) + '</td><td data-label="Item" style="color:#991b1b;">' + whEscapeXml(f.itemText) + '</td><td data-label="Action" style="color:#991b1b;">' + whEscapeXml(ACTION_LABELS[f.action] || f.action) + '</td><td data-label="Error" style="color:#dc2626;font-weight:700;">' + whEscapeXml(f.error) + '</td></tr>'; });
                failedHtml = '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:16px;margin-bottom:20px;"><h3 style="color:#dc2626;margin:0 0 10px;font-size:16px;">&#9888; ' + failedGroups.length + ' Serial' + (failedGroups.length !== 1 ? 's' : '') + ' FAILED</h3><table class="results-table" style="margin:0;"><thead><tr><th>Serial</th><th>Item</th><th>Action</th><th>Error</th></tr></thead><tbody>' + failedRowsHtml + '</tbody></table></div>';
            }
            let groupsHtml = '';
            labelGroups.forEach(group => {
                const serialListHtml = group.serialNumbers.map(s => '<li>' + whEscapeXml(s) + '</li>').join('');
                groupsHtml += '<div class="label-group"><h3>' + whEscapeXml(group.itemText) + '</h3><p style="color:#6b7280;margin:0 0 10px;font-size:13px;">' + group.serialNumbers.length + ' label' + (group.serialNumbers.length !== 1 ? 's' : '') + ' &bull; ' + (ACTION_LABELS[group.action] || group.action) + '</p><ul class="serial-list">' + serialListHtml + '</ul></div>';
            });
            const totalSerials = labelGroups.reduce((sum, g) => sum + g.serialNumbers.length, 0);
            const hasErrors = failedGroups.length > 0;
            const iconHtml = hasErrors ? '<div style="font-size:56px;color:#f59e0b;margin-bottom:12px;">&#9888;</div>' : '<div class="success-icon">&#10003;</div>';
            const headingHtml = hasErrors ? '<h2 style="color:#92400e;">Partially Complete</h2>' : '<h2>Done!</h2>';
            let transactionInfoHtml = '';
            if (adjustmentTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Adjustment:</strong> ' + whEscapeXml(String(adjustmentTranId)) + '</p>';
            if (binTransferTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Bin Transfer:</strong> ' + whEscapeXml(String(binTransferTranId)) + '</p>';
            if (serialChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Serial Change:</strong> ' + whEscapeXml(String(serialChangeTranId)) + '</p>';
            if (partNumberChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Part # Change:</strong> ' + whEscapeXml(String(partNumberChangeTranId)) + '</p>';
            if (inventoryFoundTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Found:</strong> ' + whEscapeXml(String(inventoryFoundTranId)) + '</p>';
            if (transferOrderTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Transfer Order:</strong> ' + whEscapeXml(String(transferOrderTranId)) + '</p>';

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = '<div class="app-container"><div class="main-card"><div class="form-body"><div class="success-card">' + iconHtml + headingHtml + transactionInfoHtml + '<p style="color:#6b7280;margin-top:12px;">' + totalSerials + ' serial' + (totalSerials !== 1 ? 's' : '') + ' processed successfully</p>' + failedHtml + groupsHtml + '</div></div><div class="btn-area" style="flex-direction:column;">' + (totalSerials > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (' + totalSerials + ')</button>' : '') + (totalSerials > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;background:#7c3aed;" onclick="nextStage()">Next Stage (' + totalSerials + ')</button>' : '') + '<button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Process More</button></div></div></div>';
            context.response.writePage(form);
        }

        function createWhNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors, transferOrderTranId, failedItems, returnAction, partNumberChangeTranId) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });
            const printData = processedItems.map(function(item) { return { itemText: item.itemText || '', description: item.description || '', quantity: item.quantity, action: item.action || '' }; });
            const recordIdForPrint = (adjustmentTranId || binTransferTranId || partNumberChangeTranId || inventoryFoundTranId || transferOrderTranId || '').split(',')[0].trim();
            failedItems = failedItems || [];
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = whGetStyles() + whGetSuccessPageScript(returnAction);
            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printDataField.defaultValue = JSON.stringify(printData);
            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); printRecordIdField.defaultValue = String(recordIdForPrint);
            const nsNextStageItems = processedItems.map(function(item) { return { itemText: item.itemText, itemId: item.itemId || '', quantity: item.quantity, action: item.action }; });
            const nsNextStageData = { serials: [], nsItems: nsNextStageItems };
            const nextStageField = form.addField({ id: 'custpage_next_stage_data', type: serverWidget.FieldType.LONGTEXT, label: 'Next Stage Data' });
            nextStageField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); nextStageField.defaultValue = JSON.stringify(nsNextStageData);
            const ACTION_LABELS = {'back_to_stock':'Back to Stock','defective':'Defective','likenew':'Change to Like New','likenew_stock':'Change to Like New & Back to Stock','move_refurbishing':'Move to Refurbishing','move_testing':'Move to Testing','return_to_vendor':'Return to Vendor','serial_change':'Serial Number Change','serial_change_stock':'Change Serial & Back to Stock','serial_change_testing':'Change Serial & Move to Testing','serial_change_refurbishing':'Change Serial & Move to Refurbishing','part_number_change':'Part Number Change','part_number_change_stock':'Part Number Change & Back to Stock','part_number_change_testing':'Part Number Change & Move to Testing','part_number_change_refurbishing':'Part Number Change & Move to Refurbishing','trash':'Trash','inventory_found':'Inventory Found','transfer_upcharge':'Transfer to A & Upcharge'};
            let transactionInfoHtml = '';
            if (adjustmentTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Adjustment:</strong> ' + whEscapeXml(String(adjustmentTranId)) + '</p>';
            if (binTransferTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Bin Transfer:</strong> ' + whEscapeXml(String(binTransferTranId)) + '</p>';
            if (partNumberChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Part # Change:</strong> ' + whEscapeXml(String(partNumberChangeTranId)) + '</p>';
            if (inventoryFoundTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Inv. Found:</strong> ' + whEscapeXml(String(inventoryFoundTranId)) + '</p>';
            if (transferOrderTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Transfer Order:</strong> ' + whEscapeXml(String(transferOrderTranId)) + '</p>';
            let itemRows = '', totalQty = 0;
            processedItems.forEach(function(item) { totalQty += item.quantity; itemRows += '<tr style="background:#f0fdf4;"><td data-label="Item"><strong style="color:#166534;">' + whEscapeXml(item.itemText) + '</strong></td><td data-label="Qty">' + item.quantity + '</td><td data-label="Action">' + whEscapeXml(ACTION_LABELS[item.action] || item.action) + '</td><td data-label="Status" style="color:#059669;font-weight:700;">&#10003; OK</td></tr>'; });
            let failedHtml = '';
            if (failedItems.length > 0) {
                let failedRowsHtml = '';
                failedItems.forEach(function(item) { failedRowsHtml += '<tr style="background:#fef2f2;"><td data-label="Item" style="color:#991b1b;font-weight:700;">' + whEscapeXml(item.itemText) + '</td><td data-label="Qty" style="color:#991b1b;">' + item.quantity + '</td><td data-label="Action" style="color:#991b1b;">' + whEscapeXml(ACTION_LABELS[item.action] || item.action) + '</td><td data-label="Error" style="color:#dc2626;font-weight:700;">' + whEscapeXml(item.error) + '</td></tr>'; });
                failedHtml = '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:16px;margin:20px 0;text-align:left;"><h3 style="color:#dc2626;margin:0 0 10px;font-size:16px;">&#9888; ' + failedItems.length + ' Row' + (failedItems.length !== 1 ? 's' : '') + ' FAILED</h3><table class="results-table" style="margin:0;"><thead><tr><th>Item</th><th>Qty</th><th>Action</th><th>Error</th></tr></thead><tbody>' + failedRowsHtml + '</tbody></table></div>';
            }
            const hasErrors = failedItems.length > 0;
            const iconHtml = hasErrors ? '<div style="font-size:56px;color:#f59e0b;margin-bottom:12px;">&#9888;</div>' : '<div class="success-icon">&#10003;</div>';
            const headingHtml = hasErrors ? '<h2 style="color:#92400e;">Partially Complete</h2>' : '<h2>Done!</h2>';
            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = '<div class="app-container"><div class="main-card"><div class="form-body"><div class="success-card">' + iconHtml + headingHtml + transactionInfoHtml + '<p style="color:#6b7280;margin-top:12px;">' + processedItems.length + ' item' + (processedItems.length !== 1 ? 's' : '') + ' (' + totalQty + ' total qty) processed successfully</p>' + failedHtml + '<table class="results-table" style="margin-top:20px;text-align:left;"><thead><tr><th>Item</th><th>Qty</th><th>Action</th><th>Status</th></tr></thead><tbody>' + itemRows + '</tbody></table></div></div><div class="btn-area" style="flex-direction:column;">' + (totalQty > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (' + totalQty + ')</button>' : '') + (processedItems.length > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;background:#7c3aed;" onclick="nextStage()">Next Stage (' + processedItems.length + ' item' + (processedItems.length !== 1 ? 's' : '') + ')</button>' : '') + '<button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Process More</button></div></div></div>';
            context.response.writePage(form);
        }

        // ══════════════════════════════════════════════════════════════
        //  WH ASSISTANT — NEXT STAGE SCRIPTS & PAGE BUILDERS
        // ══════════════════════════════════════════════════════════════

        function whGetNextStageNsScript() {
            return `<script>
                window.onbeforeunload=null;
                function handleNsActionChange(sel){var row=sel.closest('tr');if(!row)return;var v=sel.value;var newItemInput=row.querySelector('.ns-newitem-input');var isPnc=v==='part_number_change'||v==='part_number_change_stock'||v==='part_number_change_testing'||v==='part_number_change_refurbishing';if(newItemInput){newItemInput.style.display=isPnc?'block':'none';if(!isPnc)newItemInput.value='';}updateNsActionCount();}
                function setAllNsActions(value){var isPnc=value==='part_number_change'||value==='part_number_change_stock'||value==='part_number_change_testing'||value==='part_number_change_refurbishing';var bulkNewItem=document.getElementById('ns-bulk-new-item');if(bulkNewItem){bulkNewItem.style.display=isPnc?'block':'none';if(!isPnc)bulkNewItem.value='';}var selects=document.querySelectorAll('select.ns-action-select');for(var i=0;i<selects.length;i++){selects[i].value=value;handleNsActionChange(selects[i]);}if(isPnc&&bulkNewItem){var bv=bulkNewItem.value.trim();if(bv){var inputs=document.querySelectorAll('.ns-newitem-input');for(var j=0;j<inputs.length;j++)inputs[j].value=bv;}else bulkNewItem.focus();}updateNsActionCount();}
                function updateNsActionCount(){var selects=document.querySelectorAll('select.ns-action-select');var count=0;for(var i=0;i<selects.length;i++){if(selects[i].value!=='')count++;}var display=document.getElementById('ns_action_count');if(display)display.textContent=count;}
                function submitNsNextStage(){var rows=document.querySelectorAll('#ns-next-stage-body tr');var cartData=[];var hasAction=false;var missingNewItem=false;var bulkNewItem=document.getElementById('ns-bulk-new-item');var bulkItemName=bulkNewItem?bulkNewItem.value.trim():'';var pncActions=['part_number_change','part_number_change_stock','part_number_change_testing','part_number_change_refurbishing'];for(var i=0;i<rows.length;i++){var row=rows[i];var itemName=row.getAttribute('data-item-name')||'';var binNumber=row.getAttribute('data-bin-name')||'';var qty=parseInt(row.getAttribute('data-quantity'))||0;var actionSelect=row.querySelector('.ns-action-select');var newItemInput=row.querySelector('.ns-newitem-input');var action=actionSelect?actionSelect.value:'';var newItemName=newItemInput?newItemInput.value.trim():'';if(!action)continue;hasAction=true;if(pncActions.indexOf(action)!==-1){if(!newItemName&&bulkItemName){newItemName=bulkItemName;if(newItemInput)newItemInput.value=bulkItemName;}if(!newItemName){missingNewItem=true;if(newItemInput)newItemInput.style.borderColor='#ef4444';}else{if(newItemInput)newItemInput.style.borderColor='#d1d5db';}}cartData.push({itemName:itemName,binNumber:binNumber,quantity:qty,action:action,upcharge:0,newItemName:pncActions.indexOf(action)!==-1?newItemName:''});}if(!hasAction){alert('Select an action for at least one item.');return;}if(missingNewItem){alert('Enter a new item name for all Part Number Change actions.');return;}window.onbeforeunload=null;var form=document.forms[0];var cartField=document.getElementById('custpage_ns_cart_json');if(cartField)cartField.value=JSON.stringify(cartData);var actionInput=document.createElement('input');actionInput.type='hidden';actionInput.name='custpage_action';actionInput.value='process_nonserialized_multi';form.appendChild(actionInput);form.submit();}
                function goBack(){window.onbeforeunload=null;if(typeof setWindowChanged==='function')setWindowChanged(window,false);var form=document.forms[0];var existing=form.querySelectorAll('input[name="custpage_action"]');for(var i=0;i<existing.length;i++)existing[i].parentNode.removeChild(existing[i]);var ai=document.createElement('input');ai.type='hidden';ai.name='custpage_action';ai.value='go_home';form.appendChild(ai);form.submit();}
                document.addEventListener('DOMContentLoaded',function(){window.onbeforeunload=null;updateNsActionCount();});
            </script>`;
        }

        function whGetNextStageCombinedScript() {
            return `<script>
                window.onbeforeunload=null;
                function setAllSerialActions(value){if(value==='serial_change'||value==='serial_change_stock'||value==='serial_change_testing'||value==='serial_change_refurbishing'){alert('Serial change must be set individually.');return;}var isPnc=value==='part_number_change'||value==='part_number_change_stock'||value==='part_number_change_testing'||value==='part_number_change_refurbishing';var bulkNewItem=document.getElementById('serial-bulk-new-item');if(bulkNewItem){bulkNewItem.style.display=isPnc?'block':'none';if(!isPnc)bulkNewItem.value='';}var bulkUpcharge=document.getElementById('serial-bulk-upcharge');if(bulkUpcharge){bulkUpcharge.style.display=value==='transfer_upcharge'?'block':'none';if(value!=='transfer_upcharge')bulkUpcharge.value='';}var selects=document.querySelectorAll('select.serial-action-select');for(var i=0;i<selects.length;i++){selects[i].value=value;handleSerialActionChange(selects[i]);}if(isPnc&&bulkNewItem){var bv=bulkNewItem.value.trim();if(bv){var inputs=document.querySelectorAll('.new-item-input');for(var j=0;j<inputs.length;j++)inputs[j].value=bv;}else bulkNewItem.focus();}updateCounts();}
                function handleSerialActionChange(sel){var idx=sel.getAttribute('data-index');var nsi=document.querySelector('.new-serial-input[data-index="'+idx+'"]');var nii=document.querySelector('.new-item-input[data-index="'+idx+'"]');var uci=document.querySelector('.upcharge-input[data-index="'+idx+'"]');var v=sel.value;if(nsi){var show=v==='serial_change'||v==='serial_change_stock'||v==='serial_change_testing'||v==='serial_change_refurbishing';nsi.style.display=show?'block':'none';if(!show)nsi.value='';}if(nii){var show=v==='part_number_change'||v==='part_number_change_stock'||v==='part_number_change_testing'||v==='part_number_change_refurbishing';nii.style.display=show?'block':'none';if(!show)nii.value='';}if(uci){uci.style.display=v==='transfer_upcharge'?'block':'none';if(v!=='transfer_upcharge')uci.value='';}updateCounts();}
                function setAllNsActions(value){var isPnc=value==='part_number_change'||value==='part_number_change_stock'||value==='part_number_change_testing'||value==='part_number_change_refurbishing';var bulkNewItem=document.getElementById('ns-bulk-new-item');if(bulkNewItem){bulkNewItem.style.display=isPnc?'block':'none';if(!isPnc)bulkNewItem.value='';}var selects=document.querySelectorAll('select.ns-action-select');for(var i=0;i<selects.length;i++){selects[i].value=value;handleNsActionChange(selects[i]);}if(isPnc&&bulkNewItem){var bv=bulkNewItem.value.trim();if(bv){var inputs=document.querySelectorAll('.ns-newitem-input');for(var j=0;j<inputs.length;j++)inputs[j].value=bv;}else bulkNewItem.focus();}updateCounts();}
                function handleNsActionChange(sel){var row=sel.closest('tr');if(!row)return;var v=sel.value;var newItemInput=row.querySelector('.ns-newitem-input');var isPnc=v==='part_number_change'||v==='part_number_change_stock'||v==='part_number_change_testing'||v==='part_number_change_refurbishing';if(newItemInput){newItemInput.style.display=isPnc?'block':'none';if(!isPnc)newItemInput.value='';}updateCounts();}
                function updateCounts(){var ss=document.querySelectorAll('select.serial-action-select');var sc=0;for(var i=0;i<ss.length;i++){if(ss[i].value!=='')sc++;}var sd=document.getElementById('serial_action_count');if(sd)sd.textContent=sc;var ns=document.querySelectorAll('select.ns-action-select');var nc=0;for(var i=0;i<ns.length;i++){if(ns[i].value!=='')nc++;}var nd=document.getElementById('ns_action_count');if(nd)nd.textContent=nc;var td=document.getElementById('total_action_count');if(td)td.textContent=(sc+nc);}
                function submitCombinedNextStage(){var serialSelects=document.querySelectorAll('select.serial-action-select');var actions=[];var hasSerialAction=false;var missingSerial=false;var missingItem=false;var missingUpcharge=false;var serialBulkNewItem=document.getElementById('serial-bulk-new-item');var serialBulkVal=serialBulkNewItem?serialBulkNewItem.value.trim():'';var serialBulkUpcharge=document.getElementById('serial-bulk-upcharge');var serialBulkUpVal=serialBulkUpcharge?serialBulkUpcharge.value.trim():'';for(var i=0;i<serialSelects.length;i++){var idx=serialSelects[i].getAttribute('data-index');var val=serialSelects[i].value;var newSerial='',newItemName='',upcharge=0;if(val==='serial_change'||val==='serial_change_stock'||val==='serial_change_testing'||val==='serial_change_refurbishing'){var ni=document.querySelector('.new-serial-input[data-index="'+idx+'"]');if(ni){newSerial=ni.value.trim();if(!newSerial){missingSerial=true;ni.style.borderColor='#ef4444';}else ni.style.borderColor='#d1d5db';}}if(val==='part_number_change'||val==='part_number_change_stock'||val==='part_number_change_testing'||val==='part_number_change_refurbishing'){var ni=document.querySelector('.new-item-input[data-index="'+idx+'"]');if(ni){newItemName=ni.value.trim();if(!newItemName&&serialBulkVal){newItemName=serialBulkVal;ni.value=serialBulkVal;}if(!newItemName){missingItem=true;ni.style.borderColor='#ef4444';}else ni.style.borderColor='#d1d5db';}}if(val==='transfer_upcharge'){var ui=document.querySelector('.upcharge-input[data-index="'+idx+'"]');if(ui){var uv=ui.value.trim();if(!uv&&serialBulkUpVal){uv=serialBulkUpVal;ui.value=serialBulkUpVal;}upcharge=parseFloat(uv)||0;if(upcharge<=0){missingUpcharge=true;ui.style.borderColor='#ef4444';}else ui.style.borderColor='#d1d5db';}}actions.push({index:parseInt(idx),action:val,newSerial:newSerial,newItemName:newItemName,upcharge:upcharge});if(val!=='')hasSerialAction=true;}var nsRows=document.querySelectorAll('#ns-next-stage-body tr');var cartData=[];var hasNsAction=false;var nsMissingItem=false;var nsBulkNewItem=document.getElementById('ns-bulk-new-item');var nsBulkVal=nsBulkNewItem?nsBulkNewItem.value.trim():'';var pncActions=['part_number_change','part_number_change_stock','part_number_change_testing','part_number_change_refurbishing'];for(var i=0;i<nsRows.length;i++){var row=nsRows[i];var itemName=row.getAttribute('data-item-name')||'';var binId=row.getAttribute('data-bin-id')||'';var statusId=row.getAttribute('data-status-id')||'';var qty=parseInt(row.getAttribute('data-quantity'))||0;var actionSelect=row.querySelector('.ns-action-select');var newItemInput=row.querySelector('.ns-newitem-input');var action=actionSelect?actionSelect.value:'';var newItemName=newItemInput?newItemInput.value.trim():'';if(!action)continue;hasNsAction=true;if(pncActions.indexOf(action)!==-1){if(!newItemName&&nsBulkVal){newItemName=nsBulkVal;if(newItemInput)newItemInput.value=nsBulkVal;}if(!newItemName){nsMissingItem=true;if(newItemInput)newItemInput.style.borderColor='#ef4444';}else{if(newItemInput)newItemInput.style.borderColor='#d1d5db';}}cartData.push({itemName:itemName,binId:binId,statusId:statusId,quantity:qty,action:action,upcharge:0,newItemName:pncActions.indexOf(action)!==-1?newItemName:''});}if(!hasSerialAction&&!hasNsAction){alert('Select an action for at least one item.');return;}if(missingSerial){alert('Enter a new serial for all Serial Change actions.');return;}if(missingItem||nsMissingItem){alert('Enter a new item name for all Part Number Change actions.');return;}if(missingUpcharge){alert('Enter an upcharge amount for all Transfer & Upcharge actions.');return;}window.onbeforeunload=null;var form=document.forms[0];var jsonField=document.getElementById('custpage_actions_json');if(jsonField)jsonField.value=JSON.stringify(actions);var cartField=document.getElementById('custpage_ns_cart_json');if(cartField)cartField.value=JSON.stringify(cartData);var actionInput=document.createElement('input');actionInput.type='hidden';actionInput.name='custpage_action';actionInput.value='process_aro_received';form.appendChild(actionInput);form.submit();}
                function goBack(){window.onbeforeunload=null;if(typeof setWindowChanged==='function')setWindowChanged(window,false);var form=document.forms[0];var existing=form.querySelectorAll('input[name="custpage_action"]');for(var i=0;i<existing.length;i++)existing[i].parentNode.removeChild(existing[i]);var ai=document.createElement('input');ai.type='hidden';ai.name='custpage_action';ai.value='go_home';form.appendChild(ai);form.submit();}
                document.addEventListener('DOMContentLoaded',function(){window.onbeforeunload=null;updateCounts();document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.classList.contains('new-serial-input')){e.preventDefault();var allInputs=Array.from(document.querySelectorAll('.new-serial-input'));var visibleInputs=allInputs.filter(function(inp){return inp.style.display!=='none'&&inp.offsetParent!==null;});var currentIdx=visibleInputs.indexOf(e.target);if(currentIdx!==-1&&currentIdx<visibleInputs.length-1){visibleInputs[currentIdx+1].focus();}}});});
            </script>`;
        }

        function createWhNextStageNsResultsPage(context, nsItems) {
            const form = serverWidget.createForm({ title: 'Next Stage — Select Actions' });
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = whGetStyles() + whGetNextStageNsScript();
            const nsActionOptionsHtml = '<option value="">-- No Action --</option><option value="back_to_stock">Back to Stock</option><option value="likenew">Change to Like New</option><option value="likenew_stock">Change to Like New &amp; Back to Stock</option><option value="defective">Defective</option><option value="move_refurbishing">Move to Refurbishing</option><option value="move_testing">Move to Testing</option><option value="return_to_vendor">Return to Vendor</option><option value="part_number_change">Part Number Change</option><option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option><option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option><option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option><option value="trash">Trash</option>';
            let rows = '';
            nsItems.forEach((item, idx) => {
                rows += '<tr data-item-name="' + whEscapeXml(item.itemName) + '" data-bin-name="' + whEscapeXml(item.binText) + '" data-quantity="' + item.quantity + '"><td data-label="Item"><strong>' + whEscapeXml(item.itemText) + '</strong></td><td data-label="Current Bin">' + (whEscapeXml(item.binText) || '<span style="color:#9ca3af;">N/A</span>') + '</td><td data-label="Qty">' + item.quantity + '</td><td data-label="Action"><select class="action-select ns-action-select" data-ns-index="' + idx + '" onchange="handleNsActionChange(this)">' + nsActionOptionsHtml + '</select><input type="text" class="ns-newitem-input" placeholder="New item name" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td></tr>';
            });
            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = '<div class="app-container app-container-wide"><div class="main-card"><div class="wh-card-header"><h1>Next Stage</h1><p>' + nsItems.length + ' item' + (nsItems.length !== 1 ? 's' : '') + ' ready for next action</p></div><div class="form-body"><div class="bulk-action-bar" style="flex-wrap:wrap;"><label>Apply to All:</label><select class="action-select" onchange="setAllNsActions(this.value)" style="flex:1;">' + nsActionOptionsHtml + '</select><input type="text" id="ns-bulk-new-item" placeholder="New item name" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><div style="display:flex;align-items:center;gap:10px;"><span style="color:#6b7280;font-weight:600;font-size:13px;">Selected:</span><span style="font-size:22px;font-weight:800;color:#1a4971;" id="ns_action_count">0</span><button type="button" class="custom-btn btn-success" style="padding:10px 20px;margin:0;" onclick="submitNsNextStage()">Submit</button><button type="button" class="custom-btn btn-outline" style="padding:10px 20px;margin:0;" onclick="goBack()">Back</button></div></div><table class="results-table"><thead><tr><th>Item</th><th>Current Bin</th><th>Qty</th><th>Action</th></tr></thead><tbody id="ns-next-stage-body">' + rows + '</tbody></table></div></div></div>';
            const nsCartField = form.addField({ id: 'custpage_ns_cart_json', type: serverWidget.FieldType.LONGTEXT, label: 'NS Cart Data' });
            nsCartField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); nsCartField.defaultValue = '';
            context.response.writePage(form);
        }

        function createWhNextStageResultsPage(context, serialData, nsItems) {
            const form = serverWidget.createForm({ title: 'Next Stage — Select Actions' });
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = whGetStyles() + whGetNextStageCombinedScript();
            const hasLocation26Serials = serialData.valid.some(s => String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID);
            let serialRows = '';
            serialData.valid.forEach((s, idx) => {
                const isLoc26 = String(s.locationId) === TRANSFER_SOURCE_LOCATION_ID;
                const transferOption = isLoc26 ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : '';
                serialRows += '<tr><td data-label="Serial" style="font-family:\'SF Mono\',Monaco,monospace;font-size:14px;">' + whEscapeXml(s.serialNumber) + '</td><td data-label="Item"><strong>' + whEscapeXml(s.itemText) + '</strong></td><td data-label="Bin">' + (whEscapeXml(s.binText) || '<span style="color:#9ca3af;">N/A</span>') + '</td><td data-label="Action"><select class="action-select serial-action-select" data-index="' + idx + '" onchange="handleSerialActionChange(this)"><option value="">-- No Action --</option><option value="back_to_stock">Back to Stock</option><option value="likenew">Change to Like New</option><option value="likenew_stock">Change to Like New &amp; Back to Stock</option><option value="serial_change_stock">Change Serial &amp; Back to Stock</option><option value="serial_change_testing">Change Serial &amp; Move to Testing</option><option value="serial_change_refurbishing">Change Serial &amp; Move to Refurbishing</option><option value="defective">Defective</option><option value="move_refurbishing">Move to Refurbishing</option><option value="move_testing">Move to Testing</option><option value="part_number_change">Part Number Change</option><option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option><option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option><option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option><option value="return_to_vendor">Return to Vendor</option><option value="serial_change">Serial Number Change</option><option value="trash">Trash</option>' + transferOption + '</select><input type="text" class="new-serial-input" data-index="' + idx + '" placeholder="New serial" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><input type="text" class="new-item-input" data-index="' + idx + '" placeholder="New item name" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><input type="number" class="upcharge-input" data-index="' + idx + '" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td></tr>';
            });
            const nsActionOptionsHtml = '<option value="">-- No Action --</option><option value="back_to_stock">Back to Stock</option><option value="likenew">Change to Like New</option><option value="likenew_stock">Change to Like New &amp; Back to Stock</option><option value="defective">Defective</option><option value="move_refurbishing">Move to Refurbishing</option><option value="move_testing">Move to Testing</option><option value="return_to_vendor">Return to Vendor</option><option value="part_number_change">Part Number Change</option><option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option><option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option><option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option><option value="trash">Trash</option>';
            let nsRows = '';
            nsItems.forEach((item, idx) => {
                nsRows += '<tr data-item-name="' + whEscapeXml(item.itemName) + '" data-bin-id="' + whEscapeXml(String(item.binId)) + '" data-status-id="' + whEscapeXml(String(item.statusId)) + '" data-quantity="' + item.quantity + '"><td data-label="Item"><strong>' + whEscapeXml(item.itemText) + '</strong></td><td data-label="Current Bin">' + (whEscapeXml(item.binText) || '<span style="color:#9ca3af;">N/A</span>') + '</td><td data-label="Qty">' + item.quantity + '</td><td data-label="Action"><select class="action-select ns-action-select" data-ns-index="' + idx + '" onchange="handleNsActionChange(this)">' + nsActionOptionsHtml + '</select><input type="text" class="ns-newitem-input" placeholder="New item name" style="display:none;margin-top:6px;width:100%;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"></td></tr>';
            });
            let contentHtml = '<div class="app-container app-container-wide"><div class="main-card"><div class="wh-card-header"><h1>Next Stage</h1><p>' + serialData.valid.length + ' serial(s) + ' + nsItems.length + ' non-serialized item(s)</p></div><div class="form-body">';
            contentHtml += '<h3 style="color:#1a4971;font-size:16px;margin:0 0 12px;">Serialized Items</h3>';
            contentHtml += '<div class="bulk-action-bar" style="flex-wrap:wrap;margin-bottom:16px;"><label>Apply to All Serials:</label><select class="action-select" onchange="setAllSerialActions(this.value)" style="flex:1;"><option value="">-- No Action --</option><option value="back_to_stock">Back to Stock</option><option value="likenew">Change to Like New</option><option value="likenew_stock">Change to Like New &amp; Back to Stock</option><option value="serial_change_stock">Change Serial &amp; Back to Stock</option><option value="serial_change_testing">Change Serial &amp; Move to Testing</option><option value="serial_change_refurbishing">Change Serial &amp; Move to Refurbishing</option><option value="defective">Defective</option><option value="move_refurbishing">Move to Refurbishing</option><option value="move_testing">Move to Testing</option><option value="part_number_change">Part Number Change</option><option value="part_number_change_stock">Part Number Change &amp; Back to Stock</option><option value="part_number_change_testing">Part Number Change &amp; Move to Testing</option><option value="part_number_change_refurbishing">Part Number Change &amp; Move to Refurbishing</option><option value="return_to_vendor">Return to Vendor</option><option value="serial_change">Serial Number Change</option><option value="trash">Trash</option>' + (hasLocation26Serials ? '<option value="transfer_upcharge">Transfer to A &amp; Upcharge</option>' : '') + '</select><input type="text" id="serial-bulk-new-item" placeholder="New item name" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><input type="number" id="serial-bulk-upcharge" placeholder="Upcharge $/unit" min="0" step="0.01" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><span style="color:#6b7280;font-weight:600;font-size:13px;">Selected: <span style="font-size:18px;font-weight:800;color:#1a4971;" id="serial_action_count">0</span></span></div>';
            contentHtml += '<table class="results-table"><thead><tr><th>Serial</th><th>Item</th><th>Bin</th><th>Action</th></tr></thead><tbody>' + serialRows + '</tbody></table>';
            contentHtml += '<h3 style="color:#1a4971;font-size:16px;margin:20px 0 12px;">Non-Serialized Items</h3>';
            contentHtml += '<div class="bulk-action-bar" style="flex-wrap:wrap;margin-bottom:16px;"><label>Apply to All NS:</label><select class="action-select" onchange="setAllNsActions(this.value)" style="flex:1;">' + nsActionOptionsHtml + '</select><input type="text" id="ns-bulk-new-item" placeholder="New item name" style="display:none;flex:1;padding:10px;border:1.5px solid #d1d5db;border-radius:6px;font-size:16px;min-height:44px;"><span style="color:#6b7280;font-weight:600;font-size:13px;">Selected: <span style="font-size:18px;font-weight:800;color:#1a4971;" id="ns_action_count">0</span></span></div>';
            contentHtml += '<table class="results-table"><thead><tr><th>Item</th><th>Current Bin</th><th>Qty</th><th>Action</th></tr></thead><tbody id="ns-next-stage-body">' + nsRows + '</tbody></table>';
            contentHtml += '</div><div class="btn-area" style="flex-direction:row;"><div style="display:flex;align-items:center;gap:10px;"><span style="color:#6b7280;font-weight:600;font-size:13px;">Total:</span><span style="font-size:22px;font-weight:800;color:#1a4971;" id="total_action_count">0</span></div><button type="button" class="custom-btn btn-success" style="flex:1;" onclick="submitCombinedNextStage()">Submit All</button><button type="button" class="custom-btn btn-outline" onclick="goBack()">Back</button></div></div></div>';
            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = contentHtml;
            const dataField = form.addField({ id: 'custpage_serial_data', type: serverWidget.FieldType.LONGTEXT, label: 'Data' });
            dataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); dataField.defaultValue = JSON.stringify(serialData);
            const actionsField = form.addField({ id: 'custpage_actions_json', type: serverWidget.FieldType.LONGTEXT, label: 'Actions' });
            actionsField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); actionsField.defaultValue = '';
            const nsCartField = form.addField({ id: 'custpage_ns_cart_json', type: serverWidget.FieldType.LONGTEXT, label: 'NS Cart Data' });
            nsCartField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); nsCartField.defaultValue = '';
            const returnActionField = form.addField({ id: 'custpage_return_action', type: serverWidget.FieldType.TEXT, label: 'Return Action' });
            returnActionField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); returnActionField.defaultValue = 'go_home';
            context.response.writePage(form);
        }

        // ══════════════════════════════════════════════════════════════
        //  WH ASSISTANT — POST HANDLERS
        // ══════════════════════════════════════════════════════════════

        function whHandleLookupSerials(context) {
            const serialInput = context.request.parameters.custpage_serial_numbers || '';
            const serialTexts = whCleanSerialInput(serialInput);
            if (serialTexts.length === 0) { createWhEntryForm(context, 'Enter or scan at least one serial number.', 'warning'); return; }
            const serialData = whLookupSerialDetails(serialTexts);
            if (serialData.valid.length === 0) { createWhEntryForm(context, 'None of the scanned serial numbers were found in stock.', 'error'); return; }
            createWhResultsPage(context, serialData);
        }

        function whHandleProcessActions(context) {
            const serialDataRaw = context.request.parameters.custpage_serial_data;
            const actionsRaw = context.request.parameters.custpage_actions_json;
            if (!serialDataRaw || !actionsRaw) { createWhEntryForm(context, 'Missing data. Please start over.', 'error'); return; }
            let serialData, actions;
            try { serialData = JSON.parse(serialDataRaw); actions = JSON.parse(actionsRaw); } catch (e) { createWhEntryForm(context, 'Invalid data. Please start over.', 'error'); return; }
            const actionMap = {};
            actions.forEach(a => { if (a.action && a.action !== '') actionMap[a.index] = { action: a.action, newSerial: a.newSerial || '', newItemName: a.newItemName || '', upcharge: parseFloat(a.upcharge) || 0 }; });
            if (Object.keys(actionMap).length === 0) { createWhResultsPage(context, serialData, 'Select an action for at least one serial number.', 'warning'); return; }

            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const SERIAL_CHANGE_ACTIONS = ['serial_change', 'serial_change_stock', 'serial_change_testing', 'serial_change_refurbishing'];
            const PART_NUMBER_CHANGE_ACTIONS = ['part_number_change', 'part_number_change_stock', 'part_number_change_testing', 'part_number_change_refurbishing'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];
            const TRANSFER_UPCHARGE_ACTIONS = ['transfer_upcharge'];
            const errors = [], itemDetailsCache = {}, targetItemCache = {}, partNumberTargetCache = {};
            const adjustmentGroupMap = {}, binTransferGroupMap = {}, serialChangeList = [], partNumberChangeList = [];
            const inventoryFoundGroupMap = {}, transferUpchargeGroupMap = {};

            for (const [idxStr, actionData] of Object.entries(actionMap)) {
                const idx = parseInt(idxStr, 10); const serial = serialData.valid[idx]; if (!serial) continue;
                const action = actionData.action, newItemName = actionData.newItemName, newSerial = actionData.newSerial, itemId = serial.itemId;
                if (!itemDetailsCache[itemId]) { const details = whGetItemDetails(itemId); if (details) itemDetailsCache[itemId] = details; else { errors.push('Could not look up item details for: ' + serial.itemText); continue; } }
                const itemDetails = itemDetailsCache[itemId];

                if (ADJUSTMENT_ACTIONS.includes(action)) {
                    if (!targetItemCache[itemId]) { const likeNewName = whGetLikeNewItemName(itemDetails.itemid); const targetItem = whFindItemByName(likeNewName); targetItemCache[itemId] = targetItem ? { found: true, targetItem: targetItem } : { found: false }; if (!targetItem) errors.push('Like New item not found: ' + likeNewName); }
                    if (!targetItemCache[itemId].found) continue;
                    const cache = targetItemCache[itemId]; const key = itemId + '_' + serial.locationId + '_' + action;
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
                    if (!partNumberTargetCache[newItemName]) { const ti = whFindItemByName(newItemName); partNumberTargetCache[newItemName] = ti ? { found: true, targetItem: ti } : { found: false }; if (!ti) errors.push('Item not found: ' + newItemName); }
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

            const adjustmentGroups = Object.values(adjustmentGroupMap), binTransferGroups = Object.values(binTransferGroupMap);
            const inventoryFoundGroups = Object.values(inventoryFoundGroupMap), transferUpchargeGroups = Object.values(transferUpchargeGroupMap);
            if (adjustmentGroups.length === 0 && binTransferGroups.length === 0 && serialChangeList.length === 0 && partNumberChangeList.length === 0 && inventoryFoundGroups.length === 0 && transferUpchargeGroups.length === 0) {
                createWhResultsPage(context, serialData, errors.length > 0 ? 'Could not process: ' + errors.join('; ') : 'No valid serials to process.', 'error'); return;
            }

            let adjustmentTranId = null, binTransferTranId = null, serialChangeTranId = null, partNumberChangeTranId = null, inventoryFoundTranId = null, transferOrderTranId = null;
            const labelGroups = [], failedGroups = [];

            if (adjustmentGroups.length > 0) {
                const result = whTryBatchThenIndividual(adjustmentGroups, whCreateConditionChangeAdjustment, 'Created via WH Assistant');
                if (result.tranIds.length > 0) adjustmentTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => { let ex = labelGroups.find(lg => lg.itemId === g.targetItemId && lg.action === g.action); if (!ex) { ex = { itemId: g.targetItemId, itemText: g.targetDisplayName || g.targetItemName, description: g.targetDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); } g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber)); });
                result.failed.forEach(g => { g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.targetDisplayName || g.targetItemName, action: g.action, error: g._error || 'Adjustment failed' }); }); });
            }
            if (binTransferGroups.length > 0) {
                const result = whTryBatchThenIndividual(binTransferGroups, whCreateBinTransfer, 'Via WH Assistant');
                if (result.tranIds.length > 0) binTransferTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => { let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action); if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); } g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber)); });
                result.failed.forEach(g => { g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: g._error || 'Bin transfer failed' }); }); });
            }
            if (serialChangeList.length > 0) {
                const result = whTryBatchThenIndividual(serialChangeList, whCreateSerialNumberChangeAdjustment, 'Serial Change via WH Assistant');
                if (result.tranIds.length > 0) serialChangeTranId = result.tranIds.join(', ');
                result.succeeded.forEach(c => { let ex = labelGroups.find(lg => lg.itemId === c.itemId && lg.action === c.action); if (!ex) { ex = { itemId: c.itemId, itemText: c.itemText, description: c.itemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); } ex.serialNumbers.push(c.newSerialNumber); });
                result.failed.forEach(c => { failedGroups.push({ serialNumber: c.oldSerialNumber, itemText: c.itemText, action: c.action, error: c._error || 'Serial change failed' }); });
            }
            if (partNumberChangeList.length > 0) {
                const result = whTryBatchThenIndividual(partNumberChangeList, whCreatePartNumberChangeAdjustment, 'Part # Change via WH Assistant');
                if (result.tranIds.length > 0) partNumberChangeTranId = result.tranIds.join(', ');
                result.succeeded.forEach(c => { let ex = labelGroups.find(lg => lg.itemId === c.newItemId && lg.action === c.action); if (!ex) { ex = { itemId: c.newItemId, itemText: c.newItemText, description: c.newItemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); } ex.serialNumbers.push(c.serialNumber); });
                result.failed.forEach(c => { failedGroups.push({ serialNumber: c.serialNumber, itemText: c.oldItemText || c.newItemText, action: c.action, error: c._error || 'Part # change failed' }); });
            }
            if (inventoryFoundGroups.length > 0) {
                const result = whTryBatchThenIndividual(inventoryFoundGroups, whCreateInventoryFoundAdjustment, 'Inv Found via WH Assistant');
                if (result.tranIds.length > 0) inventoryFoundTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => { let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action); if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); } g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber)); });
                result.failed.forEach(g => { g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: g._error || 'Inventory found failed' }); }); });
            }
            if (transferUpchargeGroups.length > 0) {
                const toTranIds = [];
                transferUpchargeGroups.forEach(g => {
                    try {
                        const r = whCreateTransferOrderWithUpcharge({ itemId: g.itemId, itemText: g.itemText, serials: g.serials, upchargePerUnit: g.upchargePerUnit, memo: 'Xfer & Upcharge via WH Asst' });
                        toTranIds.push(r.transferOrderTranId);
                        let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action); if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                        g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                    } catch (e) { log.error('Transfer Order Error', e.message); g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: e.message }); }); errors.push('Transfer order failed for ' + g.itemText + ': ' + e.message); }
                });
                if (toTranIds.length > 0) transferOrderTranId = toTranIds.join(', ');
            }

            if (labelGroups.length === 0 && failedGroups.length > 0) { createWhResultsPage(context, serialData, 'All operations failed: ' + errors.join('; '), 'error'); return; }
            createWhSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId, transferOrderTranId, errors, failedGroups);
        }

        function whHandleProcessInventoryFound(context) {
            const itemName = (context.request.parameters.custpage_if_item_name || '').trim();
            const serialsRaw = (context.request.parameters.custpage_if_serials || '').trim();
            if (!itemName) { createWhEntryForm(context, 'Item name is required.', 'error'); return; }
            if (!serialsRaw) { createWhEntryForm(context, 'At least one serial number is required.', 'error'); return; }
            const item = whFindItemByName(itemName);
            if (!item) { createWhEntryForm(context, 'Item not found: ' + itemName, 'error'); return; }
            const serials = serialsRaw.split(/[\r\n]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
            const uniqueSerials = []; const seen = {};
            serials.forEach(function(s) { if (!seen[s]) { seen[s] = true; uniqueSerials.push(s); } });
            if (uniqueSerials.length === 0) { createWhEntryForm(context, 'No valid serial numbers.', 'error'); return; }
            const groups = [{ itemId: item.id, itemText: item.displayname || item.itemid, itemDescription: item.description, locationId: '1', action: 'inventory_found', serials: uniqueSerials.map(function(s) { return { serialNumber: s, serialId: null, binId: null }; }) }];
            try {
                const r = whCreateInventoryFoundAdjustment(groups, 'Inv Found via WH Assistant');
                createWhSuccessPage(context, null, null, [{ itemId: item.id, itemText: item.displayname || item.itemid, description: item.description, action: 'inventory_found', serialNumbers: uniqueSerials }], null, r.tranId, null);
            } catch (e) { log.error('Inventory Found Error', e.message); createWhEntryForm(context, 'Adjustment failed: ' + e.message, 'error'); }
        }

        function whHandleProcessNonSerialized(context) {
            createWhEntryForm(context, 'Single non-serialized mode is handled via the multi-row grid. Please use the Non-Serialized tab.', 'warning');
        }

        function whHandleProcessNonSerializedMulti(context) {
            const cartDataRaw = context.request.parameters.custpage_ns_cart_json;
            if (!cartDataRaw) { createWhEntryForm(context, 'Missing cart data.', 'error'); return; }
            let cartRows;
            try { cartRows = JSON.parse(cartDataRaw); } catch (e) { createWhEntryForm(context, 'Invalid cart data.', 'error'); return; }
            if (!cartRows || cartRows.length === 0) { createWhEntryForm(context, 'No items in the grid.', 'warning'); return; }

            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const PART_NUMBER_CHANGE_ACTIONS = ['part_number_change', 'part_number_change_stock', 'part_number_change_testing', 'part_number_change_refurbishing'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];
            const TRANSFER_UPCHARGE_ACTIONS = ['transfer_upcharge'];
            const locationId = '1'; const errors = [];
            const adjustmentRows = [], binTransferRows = [], partNumberChangeRows = [], inventoryFoundRows = [], transferUpchargeRows = [];
            const itemCache = {}, binCache = {}, tgtItemCache = {}, pnTargetCache = {};

            cartRows.forEach(function(row, idx) {
                const itemName = (row.itemName || '').trim(), binNumber = (row.binNumber || '').trim();
                const action = row.action, quantity = parseInt(row.quantity) || 0, upcharge = parseFloat(row.upcharge) || 0;
                const newItemName = (row.newItemName || '').trim();
                const rowLabel = 'Row ' + (idx + 1);
                if (!itemName || !action || quantity <= 0) { errors.push(rowLabel + ': missing fields'); return; }
                if (!itemCache[itemName]) { const i = whFindItemByName(itemName); if (i) itemCache[itemName] = i; else { errors.push(rowLabel + ': item not found "' + itemName + '"'); return; } }
                const itemData = itemCache[itemName];
                let fromBinId = null;
                if (binNumber) { if (!binCache[binNumber]) { const b = whFindBinByNumber(binNumber, locationId); if (b) binCache[binNumber] = b; else { errors.push(rowLabel + ': bin not found "' + binNumber + '"'); return; } } fromBinId = binCache[binNumber].id; }

                if (ADJUSTMENT_ACTIONS.indexOf(action) !== -1) {
                    if (!tgtItemCache[itemData.id]) { const ln = whGetLikeNewItemName(itemData.itemid); const ti = whFindItemByName(ln); if (!ti) { errors.push(rowLabel + ': LN item not found "' + ln + '"'); tgtItemCache[itemData.id] = { found: false }; } else tgtItemCache[itemData.id] = { found: true, targetItem: ti }; }
                    if (!tgtItemCache[itemData.id].found) return;
                    const c = tgtItemCache[itemData.id];
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
                } else if (PART_NUMBER_CHANGE_ACTIONS.indexOf(action) !== -1) {
                    if (!newItemName) { errors.push(rowLabel + ': new item name required for part number change'); return; }
                    if (!pnTargetCache[newItemName]) { const ti = whFindItemByName(newItemName); pnTargetCache[newItemName] = ti ? { found: true, targetItem: ti } : { found: false }; if (!ti) errors.push(rowLabel + ': item not found "' + newItemName + '"'); }
                    if (!pnTargetCache[newItemName].found) return;
                    const pnc = pnTargetCache[newItemName];
                    let toBinId = null, toStatusId = null;
                    if (action === 'part_number_change_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                    else if (action === 'part_number_change_testing') { toBinId = TESTING_BIN_ID; toStatusId = TESTING_STATUS_ID; }
                    else if (action === 'part_number_change_refurbishing') { toBinId = REFURBISHING_BIN_ID; toStatusId = REFURBISHING_STATUS_ID; }
                    partNumberChangeRows.push({ sourceItemId: itemData.id, sourceItemName: itemData.itemid, targetItemId: pnc.targetItem.id, targetItemName: pnc.targetItem.itemid, targetDisplayName: pnc.targetItem.displayname, targetDescription: pnc.targetItem.description, locationId: locationId, quantity: quantity, fromBinId: fromBinId, toBinId: toBinId || fromBinId, toStatusId: toStatusId, action: action });
                } else if (INVENTORY_FOUND_ACTIONS.indexOf(action) !== -1) {
                    inventoryFoundRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId: locationId, quantity: quantity, action: action });
                } else if (TRANSFER_UPCHARGE_ACTIONS.indexOf(action) !== -1) {
                    if (upcharge <= 0) { errors.push(rowLabel + ': upcharge required'); return; }
                    transferUpchargeRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId: locationId, quantity: quantity, upcharge: upcharge, action: action });
                }
            });

            if (adjustmentRows.length === 0 && binTransferRows.length === 0 && partNumberChangeRows.length === 0 && inventoryFoundRows.length === 0 && transferUpchargeRows.length === 0) {
                createWhEntryForm(context, errors.length > 0 ? 'Errors: ' + errors.join('; ') : 'No valid items to process.', 'error'); return;
            }

            let adjustmentTranId = null, binTransferTranId = null, partNumberChangeTranId = null, inventoryFoundTranId = null, transferOrderTranId = null;
            const processedItems = [], failedItems = [];

            if (adjustmentRows.length > 0) {
                const result = whTryBatchThenIndividual(adjustmentRows, whCreateNonSerializedAdjustmentMulti, 'Created via WH Assistant');
                if (result.tranIds.length > 0) adjustmentTranId = result.tranIds.join(', ');
                result.succeeded.forEach(function(row) { processedItems.push({ itemText: row.targetDisplayName || row.targetItemName, itemId: row.targetItemId, description: row.targetDescription, quantity: row.quantity, action: row.action }); });
                result.failed.forEach(function(row) { failedItems.push({ itemText: row.targetDisplayName || row.targetItemName || row.sourceItemName, description: row.targetDescription, quantity: row.quantity, action: row.action, error: row._error || 'Adjustment failed' }); });
            }
            if (binTransferRows.length > 0) {
                const result = whTryBatchThenIndividual(binTransferRows, whCreateNonSerializedBinTransferMulti, 'Via WH Assistant');
                if (result.tranIds.length > 0) binTransferTranId = result.tranIds.join(', ');
                result.succeeded.forEach(function(row) { processedItems.push({ itemText: row.itemText, itemId: row.itemId, description: row.description, quantity: row.quantity, action: row.action }); });
                result.failed.forEach(function(row) { failedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action, error: row._error || 'Bin transfer failed' }); });
            }
            if (partNumberChangeRows.length > 0) {
                const result = whTryBatchThenIndividual(partNumberChangeRows, whCreateNonSerializedAdjustmentMulti, 'Part # Change via WH Assistant');
                if (result.tranIds.length > 0) partNumberChangeTranId = result.tranIds.join(', ');
                result.succeeded.forEach(function(row) { processedItems.push({ itemText: row.targetDisplayName || row.targetItemName, itemId: row.targetItemId, description: row.targetDescription, quantity: row.quantity, action: row.action }); });
                result.failed.forEach(function(row) { failedItems.push({ itemText: row.targetDisplayName || row.targetItemName || row.sourceItemName, description: row.targetDescription, quantity: row.quantity, action: row.action, error: row._error || 'Part # change failed' }); });
            }
            if (inventoryFoundRows.length > 0) {
                const result = whTryBatchThenIndividual(inventoryFoundRows, whCreateNonSerializedInventoryFoundMulti, 'Inv Found via WH Assistant');
                if (result.tranIds.length > 0) inventoryFoundTranId = result.tranIds.join(', ');
                result.succeeded.forEach(function(row) { processedItems.push({ itemText: row.itemText, itemId: row.itemId, description: row.description, quantity: row.quantity, action: row.action }); });
                result.failed.forEach(function(row) { failedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action, error: row._error || 'Inventory found failed' }); });
            }
            if (transferUpchargeRows.length > 0) {
                const toTranIds = [];
                transferUpchargeRows.forEach(function(row) {
                    try {
                        const r = whCreateTransferOrderWithUpcharge({ itemId: row.itemId, itemText: row.itemText, serials: [], quantity: row.quantity, upchargePerUnit: row.upcharge, memo: 'Xfer & Upcharge via WH Asst' });
                        toTranIds.push(r.transferOrderTranId);
                        processedItems.push({ itemText: row.itemText, itemId: row.itemId, description: row.description, quantity: row.quantity, action: row.action });
                    } catch (e) { log.error('NS Transfer Error', e.message); failedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action, error: e.message }); errors.push('Transfer failed for ' + row.itemText + ': ' + e.message); }
                });
                if (toTranIds.length > 0) transferOrderTranId = toTranIds.join(', ');
            }

            if (processedItems.length === 0 && failedItems.length > 0) { createWhEntryForm(context, 'All operations failed: ' + errors.join('; '), 'error'); return; }
            createWhNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors, transferOrderTranId, failedItems, null, partNumberChangeTranId);
        }

        function whHandleNextStage(context) {
            const nextStageDataRaw = context.request.parameters.custpage_next_stage_data;
            if (!nextStageDataRaw) { createWhEntryForm(context, 'No next stage data found.', 'error'); return; }
            let nextStageData;
            try { nextStageData = JSON.parse(nextStageDataRaw); } catch (e) { createWhEntryForm(context, 'Invalid next stage data.', 'error'); return; }

            const serials = nextStageData.serials || [];
            const nsItems = nextStageData.nsItems || [];
            let serialData = null;
            const nsResultItems = [];

            // Re-lookup serialized items for fresh data
            if (serials.length > 0) {
                serialData = whLookupSerialDetails(serials);
                if (serialData.valid.length === 0) serialData = null;
            }

            // Process non-serialized items
            if (nsItems.length > 0) {
                const ACTION_TO_BIN = {
                    'back_to_stock': { binId: BACK_TO_STOCK_BIN_ID, statusId: BACK_TO_STOCK_STATUS_ID },
                    'likenew_stock': { binId: BACK_TO_STOCK_BIN_ID, statusId: BACK_TO_STOCK_STATUS_ID },
                    'part_number_change_stock': { binId: BACK_TO_STOCK_BIN_ID, statusId: BACK_TO_STOCK_STATUS_ID },
                    'move_testing': { binId: TESTING_BIN_ID, statusId: TESTING_STATUS_ID },
                    'part_number_change_testing': { binId: TESTING_BIN_ID, statusId: TESTING_STATUS_ID },
                    'move_refurbishing': { binId: REFURBISHING_BIN_ID, statusId: REFURBISHING_STATUS_ID },
                    'part_number_change_refurbishing': { binId: REFURBISHING_BIN_ID, statusId: REFURBISHING_STATUS_ID },
                    'defective': { binId: DEFECTIVE_BIN_ID, statusId: DEFECTIVE_STATUS_ID },
                    'trash': { binId: TRASH_BIN_ID, statusId: TRASH_STATUS_ID },
                    'return_to_vendor': { binId: RETURN_TO_VENDOR_BIN_ID, statusId: RETURN_TO_VENDOR_STATUS_ID },
                    'inventory_found': { binId: RECEIPT_BIN_ID, statusId: RECEIPT_STATUS_ID }
                };

                // Look up bin names for all needed bin IDs
                const binNameCache = {};
                const binIdsNeeded = new Set();
                nsItems.forEach(item => { const m = ACTION_TO_BIN[item.action]; if (m) binIdsNeeded.add(String(m.binId)); });
                binIdsNeeded.forEach(binIdStr => {
                    try {
                        const l = search.lookupFields({ type: 'bin', id: binIdStr, columns: ['binnumber'] });
                        binNameCache[binIdStr] = l.binnumber || '';
                    } catch (e) { log.debug('Bin name lookup failed for ' + binIdStr, e.message); }
                });

                // Look up item details by internal ID
                const itemDetailsCache = {};
                nsItems.forEach(item => {
                    if (item.itemId && !itemDetailsCache[item.itemId]) {
                        const details = whGetItemDetails(item.itemId);
                        if (details) itemDetailsCache[item.itemId] = details;
                    }
                });

                nsItems.forEach(item => {
                    let itemDetails = item.itemId ? itemDetailsCache[item.itemId] : null;
                    // Fallback: try to find by item text (display name might match itemid)
                    if (!itemDetails && item.itemText) {
                        const found = whFindItemByName(item.itemText);
                        if (found) itemDetails = { itemid: found.itemid, displayname: found.displayname, description: found.description || '' };
                    }
                    if (!itemDetails) return; // skip items we can't look up

                    const mapping = ACTION_TO_BIN[item.action];
                    let binId = '', binText = '', statusId = '';

                    if (mapping) {
                        binId = String(mapping.binId);
                        binText = binNameCache[binId] || '';
                        statusId = String(mapping.statusId);
                    } else {
                        // Actions like 'likenew' or 'part_number_change' (no suffix) — items stay in original bin
                        // Look up via inventorybalance
                        try {
                            const lookupItemId = item.itemId || (whFindItemByName(item.itemText) || {}).id;
                            if (lookupItemId) {
                                search.create({
                                    type: 'inventorybalance',
                                    filters: [['item', 'is', lookupItemId], 'AND', ['location', 'anyof', '1'], 'AND', ['onhand', 'greaterthan', '0']],
                                    columns: [search.createColumn({ name: 'binnumber' }), search.createColumn({ name: 'status' })]
                                }).run().each(r => {
                                    binId = r.getValue('binnumber') || '';
                                    binText = r.getText('binnumber') || '';
                                    statusId = r.getValue('status') || '';
                                    return false;
                                });
                            }
                        } catch (e) { log.debug('NS next stage bin lookup', e.message); }
                    }

                    nsResultItems.push({
                        itemName: itemDetails.itemid,
                        itemText: itemDetails.displayname || itemDetails.itemid,
                        itemId: item.itemId || '',
                        quantity: item.quantity,
                        binId: binId,
                        binText: binText,
                        statusId: statusId
                    });
                });
            }

            // Route to appropriate page
            if (serialData && serialData.valid.length > 0 && nsResultItems.length > 0) {
                createWhNextStageResultsPage(context, serialData, nsResultItems);
            } else if (serialData && serialData.valid.length > 0) {
                createWhResultsPage(context, serialData);
            } else if (nsResultItems.length > 0) {
                createWhNextStageNsResultsPage(context, nsResultItems);
            } else {
                createWhEntryForm(context, 'No items found for next stage. Items may have been moved or removed.', 'warning');
            }
        }

        // ══════════════════════════════════════════════════════════════
        //  ARO RECEIVED — COMBINED SERIALIZED + NON-SERIALIZED HANDLER
        // ══════════════════════════════════════════════════════════════

        function handleProcessAroReceived(context) {
            const serialDataRaw = context.request.parameters.custpage_serial_data || '';
            const actionsRaw = context.request.parameters.custpage_actions_json || '[]';
            const nsCartRaw = context.request.parameters.custpage_ns_cart_json || '[]';
            const returnAction = context.request.parameters.custpage_return_action || 'new_aro';

            let serialData = null, serialActions = [], nsCart = [];
            try { if (serialDataRaw) serialData = JSON.parse(serialDataRaw); } catch (e) { /* ignore */ }
            try { serialActions = JSON.parse(actionsRaw); } catch (e) { /* ignore */ }
            try { nsCart = JSON.parse(nsCartRaw); } catch (e) { /* ignore */ }

            const suiteletUrl = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId });
            const errors = [];

            // ── PART 1: Process serialized items ──
            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const SERIAL_CHANGE_ACTIONS = ['serial_change', 'serial_change_stock', 'serial_change_testing', 'serial_change_refurbishing'];
            const PART_NUMBER_CHANGE_ACTIONS = ['part_number_change', 'part_number_change_stock', 'part_number_change_testing', 'part_number_change_refurbishing'];
            const TRANSFER_UPCHARGE_ACTIONS = ['transfer_upcharge'];

            const itemDetailsCache = {}, targetItemCache = {}, partNumberTargetCache = {};
            const adjustmentGroupMap = {}, binTransferGroupMap = {}, serialChangeList = [], partNumberChangeList = [];
            const transferUpchargeGroupMap = {};

            if (serialData && serialData.valid && serialActions.length > 0) {
                const actionMap = {};
                serialActions.forEach(a => { if (a.action) actionMap[a.index] = { action: a.action, newSerial: a.newSerial || '', newItemName: a.newItemName || '', upcharge: parseFloat(a.upcharge) || 0 }; });

                for (const [idxStr, actionData] of Object.entries(actionMap)) {
                    const idx = parseInt(idxStr, 10);
                    const serial = serialData.valid[idx];
                    if (!serial) continue;
                    const action = actionData.action, newItemName = actionData.newItemName, newSerial = actionData.newSerial, itemId = serial.itemId;

                    if (!itemDetailsCache[itemId]) {
                        const details = whGetItemDetails(itemId);
                        if (details) itemDetailsCache[itemId] = details;
                        else { errors.push('Could not look up item: ' + serial.itemText); continue; }
                    }
                    const itemDetails = itemDetailsCache[itemId];

                    if (ADJUSTMENT_ACTIONS.includes(action)) {
                        if (!targetItemCache[itemId]) {
                            const likeNewName = whGetLikeNewItemName(itemDetails.itemid);
                            const targetItem = whFindItemByName(likeNewName);
                            targetItemCache[itemId] = targetItem ? { found: true, targetItem } : { found: false };
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
                        serialChangeList.push({ itemId, itemText: itemDetails.displayname || itemDetails.itemid, itemDescription: itemDetails.description, locationId: serial.locationId, oldSerialNumber: serial.serialNumber, oldSerialId: serial.serialId, newSerialNumber: newSerial, binId: serial.binId, statusId: serial.statusId, action });
                    } else if (PART_NUMBER_CHANGE_ACTIONS.includes(action)) {
                        if (!newItemName) { errors.push('New item name required for: ' + serial.serialNumber); continue; }
                        if (!partNumberTargetCache[newItemName]) {
                            const ti = whFindItemByName(newItemName);
                            partNumberTargetCache[newItemName] = ti ? { found: true, targetItem: ti } : { found: false };
                            if (!ti) errors.push('Item not found: ' + newItemName);
                        }
                        if (!partNumberTargetCache[newItemName].found) continue;
                        const pnc = partNumberTargetCache[newItemName];
                        partNumberChangeList.push({ oldItemId: itemId, oldItemText: itemDetails.displayname || itemDetails.itemid, newItemId: pnc.targetItem.id, newItemName: pnc.targetItem.itemid, newItemText: pnc.targetItem.displayname || pnc.targetItem.itemid, newItemDescription: pnc.targetItem.description, locationId: serial.locationId, serialNumber: serial.serialNumber, serialId: serial.serialId, binId: serial.binId, statusId: serial.statusId, action });
                    } else if (TRANSFER_UPCHARGE_ACTIONS.includes(action)) {
                        const upchargeAmount = actionData.upcharge || 0;
                        if (upchargeAmount <= 0) { errors.push('Upcharge amount required for: ' + serial.serialNumber); continue; }
                        const key = itemId + '_' + upchargeAmount;
                        if (!transferUpchargeGroupMap[key]) transferUpchargeGroupMap[key] = { itemId, itemText: itemDetails.displayname || itemDetails.itemid, itemDescription: itemDetails.description, upchargePerUnit: upchargeAmount, action, serials: [] };
                        transferUpchargeGroupMap[key].serials.push({ serialNumber: serial.serialNumber, serialId: serial.serialId, binId: serial.binId });
                    }
                }
            }

            const adjustmentGroups = Object.values(adjustmentGroupMap);
            const binTransferGroups = Object.values(binTransferGroupMap);
            const transferUpchargeGroups = Object.values(transferUpchargeGroupMap);

            let adjustmentTranId = null, binTransferTranId = null, serialChangeTranId = null;
            let partNumberChangeTranId = null, transferOrderTranId = null;
            const labelGroups = [], failedGroups = [];

            if (adjustmentGroups.length > 0) {
                const result = whTryBatchThenIndividual(adjustmentGroups, whCreateConditionChangeAdjustment, 'Created via ARO');
                if (result.tranIds.length > 0) adjustmentTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => { let ex = labelGroups.find(lg => lg.itemId === g.targetItemId && lg.action === g.action); if (!ex) { ex = { itemId: g.targetItemId, itemText: g.targetDisplayName || g.targetItemName, description: g.targetDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); } g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber)); });
                result.failed.forEach(g => { g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.targetDisplayName || g.targetItemName, action: g.action, error: g._error || 'Adjustment failed' }); }); });
            }
            if (binTransferGroups.length > 0) {
                const result = whTryBatchThenIndividual(binTransferGroups, whCreateBinTransfer, 'Via ARO');
                if (result.tranIds.length > 0) binTransferTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => { let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action); if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); } g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber)); });
                result.failed.forEach(g => { g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: g._error || 'Bin transfer failed' }); }); });
            }
            if (serialChangeList.length > 0) {
                const result = whTryBatchThenIndividual(serialChangeList, whCreateSerialNumberChangeAdjustment, 'Serial Change via ARO');
                if (result.tranIds.length > 0) serialChangeTranId = result.tranIds.join(', ');
                result.succeeded.forEach(c => { let ex = labelGroups.find(lg => lg.itemId === c.itemId && lg.action === c.action); if (!ex) { ex = { itemId: c.itemId, itemText: c.itemText, description: c.itemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); } ex.serialNumbers.push(c.newSerialNumber); });
                result.failed.forEach(c => { failedGroups.push({ serialNumber: c.oldSerialNumber, itemText: c.itemText, action: c.action, error: c._error || 'Serial change failed' }); });
            }
            if (partNumberChangeList.length > 0) {
                const result = whTryBatchThenIndividual(partNumberChangeList, whCreatePartNumberChangeAdjustment, 'Part # Change via ARO');
                if (result.tranIds.length > 0) partNumberChangeTranId = result.tranIds.join(', ');
                result.succeeded.forEach(c => { let ex = labelGroups.find(lg => lg.itemId === c.newItemId && lg.action === c.action); if (!ex) { ex = { itemId: c.newItemId, itemText: c.newItemText, description: c.newItemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); } ex.serialNumbers.push(c.serialNumber); });
                result.failed.forEach(c => { failedGroups.push({ serialNumber: c.serialNumber, itemText: c.oldItemText || c.newItemText, action: c.action, error: c._error || 'Part # change failed' }); });
            }
            if (transferUpchargeGroups.length > 0) {
                const toTranIds = [];
                transferUpchargeGroups.forEach(g => {
                    try {
                        const r = whCreateTransferOrderWithUpcharge({ itemId: g.itemId, itemText: g.itemText, serials: g.serials, upchargePerUnit: g.upchargePerUnit, memo: 'Xfer & Upcharge via ARO' });
                        toTranIds.push(r.transferOrderTranId);
                        let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action);
                        if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                        g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                    } catch (e) {
                        log.error('ARO Transfer Error', e.message);
                        g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: e.message }); });
                        errors.push('Transfer failed for ' + g.itemText + ': ' + e.message);
                    }
                });
                if (toTranIds.length > 0) transferOrderTranId = toTranIds.join(', ');
            }

            // ── PART 2: Process non-serialized items ──
            const nsItemCache = {}, nsBinCache = {}, nsTgtItemCache = {}, nsPnTargetCache = {};
            const nsAdjustmentRows = [], nsBinTransferRows = [], nsPartNumberChangeRows = [], nsInventoryFoundRows = [], nsTransferUpchargeRows = [];
            const nsProcessedItems = [], nsFailedItems = [];
            let nsAdjustmentTranId = null, nsBinTransferTranId = null, nsPartNumberChangeTranId = null, nsInventoryFoundTranId = null, nsTransferOrderTranId = null;
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];
            const NS_PART_NUMBER_CHANGE_ACTIONS = ['part_number_change', 'part_number_change_stock', 'part_number_change_testing', 'part_number_change_refurbishing'];

            if (nsCart.length > 0) {
                const locationId = '1';
                nsCart.forEach((row, idx) => {
                    const itemName = (row.itemName || '').trim();
                    const action = row.action, quantity = parseInt(row.quantity) || 0, upcharge = parseFloat(row.upcharge) || 0;
                    const newItemName = (row.newItemName || '').trim();
                    const rowLabel = 'NS Row ' + (idx + 1);
                    if (!itemName || !action || quantity <= 0) { errors.push(rowLabel + ': missing fields'); return; }
                    if (!nsItemCache[itemName]) {
                        const i = whFindItemByName(itemName);
                        if (i) nsItemCache[itemName] = i; else { errors.push(rowLabel + ': item not found "' + itemName + '"'); return; }
                    }
                    const itemData = nsItemCache[itemName];

                    // Items received via ARO always land in the receipt bin
                    let fromBinId = row.binId || String(RECEIPT_BIN_ID);
                    let lotNumberId = row.lotNumberId || '';
                    let lotNumberText = row.lotNumberText || '';
                    const isLotItem = row.isLotItem || false;
                    if (!row.statusId) row.statusId = String(RECEIPT_STATUS_ID);

                    // For lot items without a lot number, look it up at the receipt bin
                    if (isLotItem && !lotNumberId) {
                        try {
                            search.create({
                                type: 'inventorybalance',
                                filters: [['item', 'is', itemData.id], 'AND', ['location', 'anyof', locationId], 'AND', ['binnumber', 'anyof', String(RECEIPT_BIN_ID)], 'AND', ['onhand', 'greaterthan', '0']],
                                columns: [search.createColumn({ name: 'inventorynumber' })]
                            }).run().each(r => {
                                lotNumberId = r.getValue('inventorynumber') || '';
                                lotNumberText = r.getText('inventorynumber') || '';
                                return false; // first result only
                            });
                        } catch (e) { log.debug('NS lot lookup fallback', e.message); }
                    }

                    if (ADJUSTMENT_ACTIONS.indexOf(action) !== -1) {
                        if (!nsTgtItemCache[itemData.id]) {
                            const ln = whGetLikeNewItemName(itemData.itemid);
                            const ti = whFindItemByName(ln);
                            if (!ti) { errors.push(rowLabel + ': LN item not found "' + ln + '"'); nsTgtItemCache[itemData.id] = { found: false }; }
                            else nsTgtItemCache[itemData.id] = { found: true, targetItem: ti };
                        }
                        if (!nsTgtItemCache[itemData.id].found) return;
                        const c = nsTgtItemCache[itemData.id];
                        let toBinId = null, toStatusId = null;
                        if (action === 'likenew_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                        nsAdjustmentRows.push({ sourceItemId: itemData.id, sourceItemName: itemData.itemid, targetItemId: c.targetItem.id, targetItemName: c.targetItem.itemid, targetDisplayName: c.targetItem.displayname, targetDescription: c.targetItem.description, locationId, quantity, fromBinId, toBinId: toBinId || fromBinId, toStatusId, action, lotNumberId, lotNumberText });
                    } else if (BIN_TRANSFER_ACTIONS.indexOf(action) !== -1) {
                        let toBinId, toStatusId;
                        if (action === 'move_testing') { toBinId = TESTING_BIN_ID; toStatusId = TESTING_STATUS_ID; }
                        else if (action === 'move_refurbishing') { toBinId = REFURBISHING_BIN_ID; toStatusId = REFURBISHING_STATUS_ID; }
                        else if (action === 'back_to_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                        else if (action === 'defective') { toBinId = DEFECTIVE_BIN_ID; toStatusId = DEFECTIVE_STATUS_ID; }
                        else if (action === 'trash') { toBinId = TRASH_BIN_ID; toStatusId = TRASH_STATUS_ID; }
                        else if (action === 'return_to_vendor') { toBinId = RETURN_TO_VENDOR_BIN_ID; toStatusId = RETURN_TO_VENDOR_STATUS_ID; }
                        nsBinTransferRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId, quantity, fromBinId, toBinId, toStatusId, action, lotNumberId, lotNumberText });
                    } else if (NS_PART_NUMBER_CHANGE_ACTIONS.indexOf(action) !== -1) {
                        if (!newItemName) { errors.push(rowLabel + ': new item name required for part number change'); return; }
                        if (!nsPnTargetCache[newItemName]) { const ti = whFindItemByName(newItemName); nsPnTargetCache[newItemName] = ti ? { found: true, targetItem: ti } : { found: false }; if (!ti) errors.push(rowLabel + ': item not found "' + newItemName + '"'); }
                        if (!nsPnTargetCache[newItemName].found) return;
                        const pnc = nsPnTargetCache[newItemName];
                        let toBinId = null, toStatusId = null;
                        if (action === 'part_number_change_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                        else if (action === 'part_number_change_testing') { toBinId = TESTING_BIN_ID; toStatusId = TESTING_STATUS_ID; }
                        else if (action === 'part_number_change_refurbishing') { toBinId = REFURBISHING_BIN_ID; toStatusId = REFURBISHING_STATUS_ID; }
                        nsPartNumberChangeRows.push({ sourceItemId: itemData.id, sourceItemName: itemData.itemid, targetItemId: pnc.targetItem.id, targetItemName: pnc.targetItem.itemid, targetDisplayName: pnc.targetItem.displayname, targetDescription: pnc.targetItem.description, locationId, quantity, fromBinId, toBinId: toBinId || fromBinId, toStatusId, action, lotNumberId, lotNumberText });
                    } else if (INVENTORY_FOUND_ACTIONS.indexOf(action) !== -1) {
                        nsInventoryFoundRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId, quantity, action, lotNumberId, lotNumberText });
                    } else if (TRANSFER_UPCHARGE_ACTIONS.indexOf(action) !== -1) {
                        if (upcharge <= 0) { errors.push(rowLabel + ': upcharge amount required'); return; }
                        nsTransferUpchargeRows.push({ itemId: itemData.id, itemText: itemData.displayname || itemData.itemid, description: itemData.description, locationId, quantity, upcharge, action, lotNumberId, lotNumberText });
                    }
                });

                if (nsAdjustmentRows.length > 0) {
                    const result = whTryBatchThenIndividual(nsAdjustmentRows, whCreateNonSerializedAdjustmentMulti, 'Created via ARO');
                    if (result.tranIds.length > 0) nsAdjustmentTranId = result.tranIds.join(', ');
                    result.succeeded.forEach(r => nsProcessedItems.push({ itemText: r.targetDisplayName || r.targetItemName, itemId: r.targetItemId, description: r.targetDescription, quantity: r.quantity, action: r.action }));
                    result.failed.forEach(r => nsFailedItems.push({ itemText: r.targetDisplayName || r.targetItemName || r.sourceItemName, description: r.targetDescription, quantity: r.quantity, action: r.action, error: r._error || 'Adjustment failed' }));
                }
                if (nsBinTransferRows.length > 0) {
                    const result = whTryBatchThenIndividual(nsBinTransferRows, whCreateNonSerializedBinTransferMulti, 'Via ARO');
                    if (result.tranIds.length > 0) nsBinTransferTranId = result.tranIds.join(', ');
                    result.succeeded.forEach(r => nsProcessedItems.push({ itemText: r.itemText, itemId: r.itemId, description: r.description, quantity: r.quantity, action: r.action }));
                    result.failed.forEach(r => nsFailedItems.push({ itemText: r.itemText, description: r.description, quantity: r.quantity, action: r.action, error: r._error || 'Bin transfer failed' }));
                }
                if (nsPartNumberChangeRows.length > 0) {
                    const result = whTryBatchThenIndividual(nsPartNumberChangeRows, whCreateNonSerializedAdjustmentMulti, 'Part # Change via ARO');
                    if (result.tranIds.length > 0) nsPartNumberChangeTranId = result.tranIds.join(', ');
                    result.succeeded.forEach(r => nsProcessedItems.push({ itemText: r.targetDisplayName || r.targetItemName, itemId: r.targetItemId, description: r.targetDescription, quantity: r.quantity, action: r.action }));
                    result.failed.forEach(r => nsFailedItems.push({ itemText: r.targetDisplayName || r.targetItemName || r.sourceItemName, description: r.targetDescription, quantity: r.quantity, action: r.action, error: r._error || 'Part # change failed' }));
                }
                if (nsInventoryFoundRows.length > 0) {
                    const result = whTryBatchThenIndividual(nsInventoryFoundRows, whCreateNonSerializedInventoryFoundMulti, 'Inv Found via ARO');
                    if (result.tranIds.length > 0) nsInventoryFoundTranId = result.tranIds.join(', ');
                    result.succeeded.forEach(r => nsProcessedItems.push({ itemText: r.itemText, itemId: r.itemId, description: r.description, quantity: r.quantity, action: r.action }));
                    result.failed.forEach(r => nsFailedItems.push({ itemText: r.itemText, description: r.description, quantity: r.quantity, action: r.action, error: r._error || 'Inventory found failed' }));
                }
                if (nsTransferUpchargeRows.length > 0) {
                    const toTranIds = [];
                    nsTransferUpchargeRows.forEach(row => {
                        try {
                            const r = whCreateTransferOrderWithUpcharge({ itemId: row.itemId, itemText: row.itemText, serials: [], quantity: row.quantity, upchargePerUnit: row.upcharge, memo: 'Xfer & Upcharge via ARO' });
                            toTranIds.push(r.transferOrderTranId);
                            nsProcessedItems.push({ itemText: row.itemText, itemId: row.itemId, description: row.description, quantity: row.quantity, action: row.action });
                        } catch (e) { nsFailedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action, error: e.message }); }
                    });
                    if (toTranIds.length > 0) nsTransferOrderTranId = toTranIds.join(', ');
                }
            }

            // ── Combine and render success ──
            const hasSerialResults = labelGroups.length > 0 || failedGroups.length > 0;
            const hasNsResults = nsProcessedItems.length > 0 || nsFailedItems.length > 0;

            if (!hasSerialResults && !hasNsResults) {
                // Nothing was processed
                renderForm(context);
                return;
            }

            // If only serialized results, use the existing serialized success page
            if (hasSerialResults && !hasNsResults) {
                createWhSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, null, partNumberChangeTranId, transferOrderTranId, errors, failedGroups, returnAction);
                return;
            }

            // If only non-serialized results, use the existing non-serialized success page
            if (!hasSerialResults && hasNsResults) {
                createWhNonSerializedMultiSuccessPage(context,
                    nsAdjustmentTranId, nsBinTransferTranId, nsInventoryFoundTranId, nsProcessedItems, errors,
                    nsTransferOrderTranId, nsFailedItems, returnAction, nsPartNumberChangeTranId);
                return;
            }

            // Mixed: both serialized and non-serialized — build a combined success page
            const form = serverWidget.createForm({ title: 'ARO Actions Completed' });
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = whGetStyles() + whGetSuccessPageScript(returnAction);

            // Build print data from serial label groups + non-serialized items
            labelGroups.forEach(group => {
                try {
                    const rec = record.create({ type: 'customrecord_print_label', isDynamic: true });
                    rec.setValue({ fieldId: 'custrecord_pl_item_number', value: group.itemId });
                    rec.setValue({ fieldId: 'custrecord_express_entry', value: group.serialNumbers.join('<br>') });
                    group.recordId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                } catch (e) { log.error('Print Label Record Error', e.message); group.recordId = 'ERR'; }
            });
            const printData = labelGroups.map(g => ({ itemText: g.itemText || '', description: g.description || '', serialNumbers: g.serialNumbers, action: g.action || '' }));
            nsProcessedItems.forEach(item => { printData.push({ itemText: item.itemText || '', description: item.description || '', quantity: item.quantity }); });
            const recordIdForPrint = (adjustmentTranId || binTransferTranId || serialChangeTranId || partNumberChangeTranId || transferOrderTranId || nsAdjustmentTranId || nsBinTransferTranId || nsPartNumberChangeTranId || nsInventoryFoundTranId || nsTransferOrderTranId || '').split(',')[0].trim();
            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printDataField.defaultValue = JSON.stringify(printData);
            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printRecordIdField.defaultValue = String(recordIdForPrint);
            const combinedAllSerials = [];
            labelGroups.forEach(g => { g.serialNumbers.forEach(sn => combinedAllSerials.push(sn)); });
            const combinedNsNextStage = nsProcessedItems.map(item => ({ itemText: item.itemText, itemId: item.itemId || '', quantity: item.quantity, action: item.action }));
            const combinedNextStageData = { serials: combinedAllSerials, nsItems: combinedNsNextStage };
            const nextStageField = form.addField({ id: 'custpage_next_stage_data', type: serverWidget.FieldType.LONGTEXT, label: 'Next Stage Data' });
            nextStageField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }); nextStageField.defaultValue = JSON.stringify(combinedNextStageData);

            const ACTION_LABELS = { 'back_to_stock':'Back to Stock','defective':'Defective','likenew':'Change to Like New','likenew_stock':'Change to Like New & Back to Stock','move_refurbishing':'Move to Refurbishing','move_testing':'Move to Testing','return_to_vendor':'Return to Vendor','serial_change':'Serial Number Change','serial_change_stock':'Change Serial & Back to Stock','serial_change_testing':'Change Serial & Move to Testing','serial_change_refurbishing':'Change Serial & Move to Refurbishing','part_number_change':'Part Number Change','part_number_change_stock':'Part Number Change & Back to Stock','part_number_change_testing':'Part Number Change & Move to Testing','part_number_change_refurbishing':'Part Number Change & Move to Refurbishing','trash':'Trash','inventory_found':'Inventory Found','transfer_upcharge':'Transfer to A & Upcharge' };

            // Transaction info
            let transactionInfoHtml = '';
            if (adjustmentTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Serialized Adj:</strong> ' + whEscapeXml(String(adjustmentTranId)) + '</p>';
            if (binTransferTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Serialized Bin Xfer:</strong> ' + whEscapeXml(String(binTransferTranId)) + '</p>';
            if (serialChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Serial Change:</strong> ' + whEscapeXml(String(serialChangeTranId)) + '</p>';
            if (partNumberChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Part # Change:</strong> ' + whEscapeXml(String(partNumberChangeTranId)) + '</p>';
            if (transferOrderTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>Serialized TO:</strong> ' + whEscapeXml(String(transferOrderTranId)) + '</p>';
            if (nsAdjustmentTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>NS Adj:</strong> ' + whEscapeXml(String(nsAdjustmentTranId)) + '</p>';
            if (nsBinTransferTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>NS Bin Xfer:</strong> ' + whEscapeXml(String(nsBinTransferTranId)) + '</p>';
            if (nsPartNumberChangeTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>NS Part # Change:</strong> ' + whEscapeXml(String(nsPartNumberChangeTranId)) + '</p>';
            if (nsInventoryFoundTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>NS Inv Found:</strong> ' + whEscapeXml(String(nsInventoryFoundTranId)) + '</p>';
            if (nsTransferOrderTranId) transactionInfoHtml += '<p style="font-size:15px;margin:6px 0;color:#1a4971;"><strong>NS TO:</strong> ' + whEscapeXml(String(nsTransferOrderTranId)) + '</p>';

            // Serial label groups HTML
            let groupsHtml = '';
            const totalSerials = labelGroups.reduce((sum, g) => sum + g.serialNumbers.length, 0);
            const totalNsQty = nsProcessedItems.reduce((sum, item) => sum + item.quantity, 0);
            const totalLabels = totalSerials + totalNsQty;
            labelGroups.forEach(group => {
                const serialListHtml = group.serialNumbers.map(s => '<li>' + whEscapeXml(s) + '</li>').join('');
                groupsHtml += '<div class="label-group"><h3>' + whEscapeXml(group.itemText) + '</h3><p style="color:#6b7280;margin:0 0 10px;font-size:13px;">' + group.serialNumbers.length + ' label(s) &bull; ' + (ACTION_LABELS[group.action] || group.action) + '</p><ul class="serial-list">' + serialListHtml + '</ul></div>';
            });

            // Failed serials
            let failedHtml = '';
            if (failedGroups.length > 0) {
                let failedRowsHtml = '';
                failedGroups.forEach(f => { failedRowsHtml += '<tr style="background:#fef2f2;"><td style="color:#991b1b;font-weight:700;">' + whEscapeXml(f.serialNumber) + '</td><td style="color:#991b1b;">' + whEscapeXml(f.itemText) + '</td><td style="color:#991b1b;">' + whEscapeXml(ACTION_LABELS[f.action] || f.action) + '</td><td style="color:#dc2626;font-weight:700;">' + whEscapeXml(f.error) + '</td></tr>'; });
                failedHtml += '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:16px;margin:16px 0;"><h3 style="color:#dc2626;margin:0 0 10px;font-size:16px;">Serialized Failures (' + failedGroups.length + ')</h3><table class="results-table" style="margin:0;"><thead><tr><th>Serial</th><th>Item</th><th>Action</th><th>Error</th></tr></thead><tbody>' + failedRowsHtml + '</tbody></table></div>';
            }

            // Non-serialized results
            let nsResultsHtml = '';
            if (nsProcessedItems.length > 0) {
                let nsRowsHtml = '';
                nsProcessedItems.forEach(item => { nsRowsHtml += '<tr style="background:#f0fdf4;"><td><strong style="color:#166534;">' + whEscapeXml(item.itemText) + '</strong></td><td>' + item.quantity + '</td><td>' + whEscapeXml(ACTION_LABELS[item.action] || item.action) + '</td><td style="color:#059669;font-weight:700;">OK</td></tr>'; });
                nsResultsHtml += '<div style="margin:16px 0;"><h3 style="color:#1a4971;font-size:16px;">Non-Serialized Items</h3><table class="results-table" style="margin:0;"><thead><tr><th>Item</th><th>Qty</th><th>Action</th><th>Status</th></tr></thead><tbody>' + nsRowsHtml + '</tbody></table></div>';
            }
            if (nsFailedItems.length > 0) {
                let nsFailedRowsHtml = '';
                nsFailedItems.forEach(item => { nsFailedRowsHtml += '<tr style="background:#fef2f2;"><td style="color:#991b1b;">' + whEscapeXml(item.itemText) + '</td><td style="color:#991b1b;">' + item.quantity + '</td><td style="color:#991b1b;">' + whEscapeXml(ACTION_LABELS[item.action] || item.action) + '</td><td style="color:#dc2626;font-weight:700;">' + whEscapeXml(item.error) + '</td></tr>'; });
                nsResultsHtml += '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:16px;margin:16px 0;"><h3 style="color:#dc2626;margin:0 0 10px;font-size:16px;">NS Failures (' + nsFailedItems.length + ')</h3><table class="results-table" style="margin:0;"><thead><tr><th>Item</th><th>Qty</th><th>Action</th><th>Error</th></tr></thead><tbody>' + nsFailedRowsHtml + '</tbody></table></div>';
            }

            const allFailed = failedGroups.length > 0 || nsFailedItems.length > 0;
            const iconHtml = allFailed ? '<div style="font-size:56px;color:#f59e0b;margin-bottom:12px;">&#9888;</div>' : '<div class="success-icon">&#10003;</div>';
            const headingHtml = allFailed ? '<h2 style="color:#92400e;">Partially Complete</h2>' : '<h2>Done!</h2>';

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = '<div class="app-container"><div class="main-card"><div class="form-body"><div class="success-card">'
                + iconHtml + headingHtml + transactionInfoHtml
                + '<p style="color:#6b7280;margin-top:12px;">' + totalSerials + ' serial(s) + ' + nsProcessedItems.length + ' non-serialized item(s) (' + totalNsQty + ' qty) processed</p>'
                + failedHtml + groupsHtml + nsResultsHtml
                + '</div></div><div class="btn-area" style="flex-direction:column;">'
                + (totalLabels > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (' + totalLabels + ')</button>' : '')
                + (totalLabels > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;background:#7c3aed;" onclick="nextStage()">Next Stage</button>' : '')
                + '<button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Create Another ARO</button>'
                + '</div></div></div>';

            context.response.writePage(form);
        }

        // ══════════════════════════════════════════════
        // ISSUE RECORD HANDLER (AJAX JSON endpoint)
        // ══════════════════════════════════════════════
        const ARO_ISSUE_FOLDER_ID = 4498; // TODO: update to actual File Cabinet folder ID for ARO issue images

        const handleCreateIssue = (context) => {
            const resp = { success: false, error: '' };
            try {
                const body = JSON.parse(context.request.body);
                const aroId = body.aroId;
                const itemId = body.itemId;
                const itemText = body.itemText || '';
                const fnsku = body.fnsku || '';
                const quantity = parseInt(body.quantity) || 1;
                const issueType = body.issueType;
                const notes = body.notes || '';
                const caseId = body.caseId || '';
                const rma = body.rma || '';
                const lpn = body.lpn || '';
                const shipmentId = body.shipmentId || '';
                const images = body.images || [];

                if (!aroId) throw new Error('ARO ID is required.');
                if (!issueType) throw new Error('Issue type is required.');

                // ── Upload images to File Cabinet ──
                const uploadedFileIds = [];
                const fileTypeMap = {
                    jpg: file.Type.JPGIMAGE, jpeg: file.Type.JPGIMAGE,
                    png: file.Type.PNGIMAGE, gif: file.Type.GIFIMAGE,
                    bmp: file.Type.BMPIMAGE, webp: file.Type.JPGIMAGE
                };

                for (let i = 0; i < images.length; i++) {
                    const img = images[i];
                    if (!img || !img.base64) continue;
                    const ext = (img.name || 'image.jpg').split('.').pop().toLowerCase();
                    const fType = fileTypeMap[ext] || file.Type.JPGIMAGE;
                    const ts = new Date().getTime();
                    const fName = 'ARO_' + aroId + '_issue_' + ts + '_' + i + '.' + (ext === 'webp' ? 'jpg' : ext);

                    const newFile = file.create({
                        name: fName,
                        fileType: fType,
                        contents: img.base64,
                        encoding: file.Encoding.BASE_64,
                        folder: ARO_ISSUE_FOLDER_ID,
                        isOnline: false
                    });
                    uploadedFileIds.push(newFile.save());
                    log.audit('Issue Image Uploaded', 'File ID: ' + uploadedFileIds[uploadedFileIds.length - 1]);
                }

                // ── Create customrecord_aroii ──
                const issueRec = record.create({ type: 'customrecord_aroii', isDynamic: false });
                issueRec.setValue({ fieldId: 'custrecord_aroii_ticket_item', value: fnsku || itemText });
                issueRec.setValue({ fieldId: 'custrecord_aroii_quantity', value: quantity });
                if (itemId) issueRec.setValue({ fieldId: 'custrecord_aroii_physical_item', value: itemId });
                issueRec.setValue({ fieldId: 'custrecord_aroii_issue', value: issueType });
                issueRec.setValue({ fieldId: 'custrecord_aroii_notes', value: notes });
                issueRec.setValue({ fieldId: 'custrecord_aroii_removal_order', value: aroId });
                issueRec.setValue({ fieldId: 'custrecord_arii_status', value: '4' });
                if (caseId) issueRec.setValue({ fieldId: 'custrecord_arii_amazon_case_id', value: caseId });
                if (rma) issueRec.setValue({ fieldId: 'custrecord_arii_rma', value: rma });
                if (lpn) issueRec.setValue({ fieldId: 'custrecord_ari_lpn', value: lpn });
                if (shipmentId) issueRec.setValue({ fieldId: 'custrecord_ari_shipment_id', value: shipmentId });
                const issueId = issueRec.save({ enableSourcing: false, ignoreMandatoryFields: true });
                log.audit('Issue Record Created', 'ID: ' + issueId + ' for ARO: ' + aroId);

                // Attach all images to the record
                for (let f = 0; f < uploadedFileIds.length; f++) {
                    try {
                        record.attach({
                            record: { type: 'file', id: uploadedFileIds[f] },
                            to: { type: 'customrecord_aroii', id: issueId }
                        });
                    } catch (attachErr) {
                        log.debug('Attach image', attachErr.message);
                    }
                }

                resp.success = true;
                resp.issueId = issueId;
                resp.fileCount = uploadedFileIds.length;

            } catch (e) {
                log.error('handleCreateIssue Error', e.message + '\n' + (e.stack || ''));
                resp.error = e.message;
            }

            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(resp));
        };

        // ══════════════════════════════════════════════
        // FNSKU VALIDATION HANDLER (AJAX JSON endpoint)
        // ══════════════════════════════════════════════
        const handleValidateFnskus = (context) => {
            const resp = { valid: true, invalid: [] };
            try {
                const body = JSON.parse(context.request.body);
                const fnskus = body.fnskus || [];
                if (!fnskus.length) {
                    resp.valid = false;
                    resp.error = 'No FNSKUs provided.';
                } else {
                    const fnskuMap = batchLookupFNSKUs(fnskus);
                    for (const fnsku of fnskus) {
                        if (!fnskuMap[fnsku]) {
                            resp.invalid.push(fnsku);
                        }
                    }
                    resp.valid = resp.invalid.length === 0;
                }
            } catch (e) {
                log.error('handleValidateFnskus Error', e.message);
                resp.valid = false;
                resp.error = e.message;
            }
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(resp));
        };

        return { onRequest };
    });
