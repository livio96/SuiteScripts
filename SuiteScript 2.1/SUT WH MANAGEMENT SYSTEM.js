/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * TelQuest Warehouse — Unified App
 * ---------------------------------
 * Warehouse Assistant (scan/process/print labels)
 * + License Plate Management (CRUD, QR, bin transfers, SO fulfillment)
 */
define([
    'N/ui/serverWidget',
    'N/record',
    'N/search',
    'N/log',
    'N/runtime',
    'N/url',
    'N/task',
    'N/encode',
    'N/render'
], (serverWidget, record, search, log, runtime, url, task, encode, render) => {

    const RECORD_TYPE = 'customrecord_tq_license_plate';

    const onRequest = (context) => {
        const action = context.request.parameters.action || 'page';
        const custAction = context.request.parameters.custpage_action;
        const ajaxAction = context.request.parameters.ajax_action;

        // ── Print Label AJAX routes (GET) ────────────────────
        if (ajaxAction) {
            try {
                if (ajaxAction === 'validate') {
                    const result = plValidateSerialNumbers(context.request.parameters.serials);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify(result));
                    return;
                }
                if (ajaxAction === 'printpdf') return plHandlePrintPdf(context);
                if (ajaxAction === 'printpage') return plHandlePrintPage(context);
            } catch (plErr) {
                log.error({ title: 'PL Ajax Error', details: plErr.message + '\n' + plErr.stack });
                context.response.write('Error: ' + plErr.message);
                return;
            }
        }

        // ── Warehouse Assistant routing ──────────────────────
        const WH_ACTIONS = ['go_home','lookup_serials','process_actions','process_nonserialized','process_nonserialized_multi','process_inventory_found','process_bin_putaway','printpdf'];
        if (action === 'warehouse' || WH_ACTIONS.includes(custAction)) {
            try {
                if (!custAction || custAction === 'go_home') {
                    return createEntryForm(context);
                }
                if (custAction === 'lookup_serials') return handleLookupSerials(context);
                if (custAction === 'process_actions') return handleProcessActions(context);
                if (custAction === 'process_nonserialized') return handleProcessNonSerialized(context);
                if (custAction === 'process_nonserialized_multi') return handleProcessNonSerializedMulti(context);
                if (custAction === 'process_inventory_found') return handleProcessInventoryFound(context);
                if (custAction === 'process_bin_putaway') return handleBinPutaway(context);
                if (custAction === 'printpdf') {
                    const printDataRaw = context.request.parameters.custpage_print_data;
                    const recordId = context.request.parameters.custpage_print_record_id || '';
                    if (!printDataRaw) { createEntryForm(context, 'No print data found.', 'error'); return; }
                    let printData;
                    try { printData = JSON.parse(printDataRaw); } catch (pe) { createEntryForm(context, 'Invalid print data.', 'error'); return; }
                    const pdfFile = generateLabelsPdf(printData, recordId);
                    context.response.writeFile({ file: pdfFile, isInline: true });
                    return;
                }
                return createEntryForm(context, 'Unknown action.', 'warning');
            } catch (whErr) {
                log.error({ title: 'WH Assistant Error', details: whErr.message + '\n' + whErr.stack });
                try { createEntryForm(context, 'An unexpected error occurred: ' + whErr.message, 'error'); }
                catch (e2) { context.response.write('Error: ' + whErr.message); }
                return;
            }
        }

        // ── Print Label routing ──────────────────────────────
        const PL_ACTIONS = ['search_po','print_selected','create_labels','reprint'];
        if (action === 'printlabel' || PL_ACTIONS.includes(custAction)) {
            try {
                if (!custAction) return plCreateEntryForm(context);
                if (custAction === 'search_po') return plHandlePOSearch(context);
                if (custAction === 'print_selected') return plHandlePrintSelected(context);
                if (custAction === 'create_labels') return plHandleCreateLabels(context);
                if (custAction === 'reprint') return plHandleReprint(context);
                return plCreateEntryForm(context, 'Unknown action.', 'warning');
            } catch (plErr) {
                log.error({ title: 'Print Label Error', details: plErr.message + '\n' + plErr.stack });
                try { plCreateEntryForm(context, 'An unexpected error occurred: ' + plErr.message, 'error'); }
                catch (e2) { context.response.write('Error: ' + plErr.message); }
                return;
            }
        }

        try {
            switch (action) {
                // ── API Endpoints (return JSON) ──────────────────
                case 'searchPlates':
                    return respondJson(context, searchPlates(context.request.parameters));
                case 'getPlate':
                    return respondJson(context, getPlate(context.request.parameters.id));
                case 'getPlateByName':
                    return respondJson(context, getPlateByName(context.request.parameters.name));
                case 'savePlate':
                    return respondJson(context, savePlate(JSON.parse(context.request.body)));
                case 'deletePlate':
                    return respondJson(context, deletePlate(context.request.parameters.id));
                case 'binTransfer':
                    return respondJson(context, executeBinTransfer(JSON.parse(context.request.body)));
                case 'fulfillSO':
                    return respondJson(context, fulfillSalesOrder(JSON.parse(context.request.body)));
                case 'lookupSO':
                    return respondJson(context, lookupSalesOrder(context.request.parameters.tranid));
                case 'getItems':
                    return respondJson(context, getItemOptions(context.request.parameters.q));
                case 'getBins':
                    return respondJson(context, getBinOptions(context.request.parameters.location));
                case 'getLocations':
                    return respondJson(context, getLocationOptions());
                case 'getStatuses':
                    return respondJson(context, getStatusOptions());
                case 'getStatusCodes':
                    return respondJson(context, getStatusCodeOptions());
                case 'lookupPOSerials':
                    return respondJson(context, lookupPOSerials(context.request.parameters));
                case 'createFromPO':
                    return respondJson(context, createFromPO(JSON.parse(context.request.body)));
                // ── Default: Serve the HTML page ─────────────────
                default:
                    return servePage(context);
            }
        } catch (e) {
            log.error({ title: 'LP Manager Error', details: e.message + '\n' + e.stack });
            if (action !== 'page') {
                return respondJson(context, { success: false, message: e.message });
            }
            throw e;
        }
    };

    // ═══════════════════════════════════════════════════════════
    //  HELPER: JSON Response
    // ═══════════════════════════════════════════════════════════
    const respondJson = (context, data) => {
        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        context.response.write(JSON.stringify(data));
    };

    // ═══════════════════════════════════════════════════════════
    //  SEARCH PLATES
    // ═══════════════════════════════════════════════════════════
    const searchPlates = (params) => {
        const filters = [['isinactive', 'is', 'F']];

        if (params.keyword) {
            filters.push('AND');
            filters.push([
                ['name', 'contains', params.keyword],
                'OR',
                ['custrecord_tq_license_plate_serial_num', 'contains', params.keyword],
                'OR',
                ['custrecord_tq_license_plate_notes', 'contains', params.keyword]
            ]);
        }
        if (params.location) {
            filters.push('AND');
            filters.push(['custrecord_location', 'anyof', params.location]);
        }
        if (params.status) {
            filters.push('AND');
            filters.push(['custrecord_tq_license_plate_status', 'anyof', params.status]);
        }
        if (params.bin) {
            filters.push('AND');
            filters.push(['custrecord_tq_license_plate_bin', 'anyof', params.bin]);
        }
        if (params.item) {
            filters.push('AND');
            filters.push(['custrecord_tq_license_place_item', 'anyof', params.item]);
        }

        const columns = [
            search.createColumn({ name: 'name', sort: search.Sort.DESC }),
            search.createColumn({ name: 'custrecord_location' }),
            search.createColumn({ name: 'custrecord_tq_license_place_item' }),
            search.createColumn({ name: 'custrecord_tq_license_plate_bin' }),
            search.createColumn({ name: 'custrecord_tq_license_plate_serial_num' }),
            search.createColumn({ name: 'custrecord_tq_license_plate_status' }),
            search.createColumn({ name: 'custrecord_tq_license_plate_notes' }),
            search.createColumn({ name: 'custrecord_tq_license_plate_sc' }),
            search.createColumn({ name: 'custrecord_tq_license_plate_created_by' }),
            search.createColumn({ name: 'created' })
        ];

        const results = [];
        const srch = search.create({ type: RECORD_TYPE, filters, columns });
        const pagedData = srch.runPaged({ pageSize: 50 });
        const page = parseInt(params.page) || 0;

        if (pagedData.count > 0 && page < pagedData.pageRanges.length) {
            pagedData.fetch({ index: page }).data.forEach(r => {
                const serials = r.getValue('custrecord_tq_license_plate_serial_num') || '';
                results.push({
                    id: r.id,
                    name: r.getValue('name'),
                    location: r.getText('custrecord_location'),
                    locationId: r.getValue('custrecord_location'),
                    item: r.getText('custrecord_tq_license_place_item'),
                    itemId: r.getValue('custrecord_tq_license_place_item'),
                    bin: r.getText('custrecord_tq_license_plate_bin'),
                    binId: r.getValue('custrecord_tq_license_plate_bin'),
                    serialCount: serials ? serials.split(/\r?\n/).filter(s => s.trim()).length : 0,
                    serials: serials,
                    status: r.getText('custrecord_tq_license_plate_status'),
                    statusId: r.getValue('custrecord_tq_license_plate_status'),
                    statusCode: r.getValue('custrecord_tq_license_plate_sc'),
                    statusCodeText: r.getText('custrecord_tq_license_plate_sc'),
                    notes: r.getValue('custrecord_tq_license_plate_notes'),
                    createdBy: r.getText('custrecord_tq_license_plate_created_by'),
                    created: r.getValue('created')
                });
            });
        }

        return {
            success: true,
            results,
            total: pagedData.count,
            pageCount: pagedData.pageRanges.length,
            page
        };
    };

    // ═══════════════════════════════════════════════════════════
    //  GET SINGLE PLATE
    // ═══════════════════════════════════════════════════════════
    const getPlate = (id) => {
        const rec = record.load({ type: RECORD_TYPE, id });
        const serials = rec.getValue('custrecord_tq_license_plate_serial_num') || '';
        return {
            success: true,
            plate: {
                id: rec.id,
                name: rec.getValue('name'),
                locationId: rec.getValue('custrecord_location'),
                location: rec.getText('custrecord_location'),
                itemId: rec.getValue('custrecord_tq_license_place_item'),
                item: rec.getText('custrecord_tq_license_place_item'),
                binId: rec.getValue('custrecord_tq_license_plate_bin'),
                bin: rec.getText('custrecord_tq_license_plate_bin'),
                serials: serials,
                serialList: serials ? serials.split(/\r?\n/).filter(s => s.trim()) : [],
                serialCount: serials ? serials.split(/\r?\n/).filter(s => s.trim()).length : 0,
                statusId: rec.getValue('custrecord_tq_license_plate_status'),
                status: rec.getText('custrecord_tq_license_plate_status'),
                statusCodeId: rec.getValue('custrecord_tq_license_plate_sc'),
                statusCode: rec.getText('custrecord_tq_license_plate_sc'),
                notes: rec.getValue('custrecord_tq_license_plate_notes'),
                createdById: rec.getValue('custrecord_tq_license_plate_created_by'),
                createdBy: rec.getText('custrecord_tq_license_plate_created_by')
            }
        };
    };

    // ═══════════════════════════════════════════════════════════
    //  GET PLATE BY NAME (for QR scan)
    // ═══════════════════════════════════════════════════════════
    const getPlateByName = (name) => {
        const srch = search.create({
            type: RECORD_TYPE,
            filters: [['name', 'is', name], 'AND', ['isinactive', 'is', 'F']],
            columns: ['internalid']
        });
        const res = srch.run().getRange({ start: 0, end: 1 });
        if (!res.length) return { success: false, message: 'License plate "' + name + '" not found.' };
        return getPlate(res[0].id);
    };

    // ═══════════════════════════════════════════════════════════
    //  SAVE (Create / Update) PLATE
    // ═══════════════════════════════════════════════════════════
    const savePlate = (data) => {
        let rec;
        if (data.id) {
            rec = record.load({ type: RECORD_TYPE, id: data.id });
        } else {
            rec = record.create({ type: RECORD_TYPE });
        }

        if (data.name) rec.setValue('name', data.name);
        if (data.locationId) rec.setValue('custrecord_location', data.locationId);
        if (data.itemId) rec.setValue('custrecord_tq_license_place_item', data.itemId);
        if (data.binId) rec.setValue('custrecord_tq_license_plate_bin', data.binId);
        if (data.serials !== undefined) rec.setValue('custrecord_tq_license_plate_serial_num', data.serials);
        if (data.statusId) rec.setValue('custrecord_tq_license_plate_status', data.statusId);
        if (data.statusCodeId) rec.setValue('custrecord_tq_license_plate_sc', data.statusCodeId);
        if (data.notes !== undefined) rec.setValue('custrecord_tq_license_plate_notes', data.notes);

        // Set created-by on new records
        if (!data.id) {
            const userId = runtime.getCurrentUser().id;
            rec.setValue('custrecord_tq_license_plate_created_by', userId);
        }

        const savedId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });
        return { success: true, id: savedId, message: data.id ? 'License plate updated.' : 'License plate created.' };
    };

    // ═══════════════════════════════════════════════════════════
    //  DELETE PLATE (set inactive)
    // ═══════════════════════════════════════════════════════════
    const deletePlate = (id) => {
        record.submitFields({
            type: RECORD_TYPE,
            id,
            values: { isinactive: true }
        });
        return { success: true, message: 'License plate deactivated.' };
    };

    // ═══════════════════════════════════════════════════════════
    //  BIN TRANSFER
    //  Move all serials on a plate from current bin to a new bin
    // ═══════════════════════════════════════════════════════════
    const executeBinTransfer = (data) => {
        // data: { plateId, destinationBinId, destinationBinName }
        const plateData = getPlate(data.plateId);
        if (!plateData.success) return plateData;
        const plate = plateData.plate;

        if (!plate.serialList.length) {
            return { success: false, message: 'No serial numbers on this license plate.' };
        }
        if (!plate.itemId) {
            return { success: false, message: 'No item assigned to this license plate.' };
        }
        if (!plate.locationId) {
            return { success: false, message: 'No location assigned to this license plate.' };
        }

        // Create a Bin Transfer record
        const bt = record.create({ type: record.Type.BIN_TRANSFER, isDynamic: true });
        bt.setValue('location', parseInt(plate.locationId));
        bt.setValue('memo', 'License Plate Transfer: ' + plate.name);

        // Add item line
        bt.selectNewLine({ sublistId: 'inventory' });
        bt.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: parseInt(plate.itemId) });
        bt.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: plate.serialList.length });

        // Set inventory detail — serial numbers + destination bin
        const invDetail = bt.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });

        plate.serialList.forEach((serial) => {
            invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
            // Bin transfer uses the serial number TEXT, not internal ID
            invDetail.setCurrentSublistText({
                sublistId: 'inventoryassignment',
                fieldId: 'issueinventorynumber',
                text: serial.trim()
            });
            invDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'quantity',
                value: 1
            });
            // From-bin is auto-determined by NetSuite based on where the serial lives
            // Only set the destination bin
            invDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'tobinnumber',
                value: parseInt(data.destinationBinId)
            });
            if (data.statusId) {
                invDetail.setCurrentSublistValue({
                    sublistId: 'inventoryassignment',
                    fieldId: 'toinventorystatus',
                    value: parseInt(data.statusId)
                });
            }
            invDetail.commitLine({ sublistId: 'inventoryassignment' });
        });

        bt.commitLine({ sublistId: 'inventory' });
        const btId = bt.save({ enableSourcing: true, ignoreMandatoryFields: false });

        // Get the tranid for display
        const btTranId = search.lookupFields({ type: record.Type.BIN_TRANSFER, id: btId, columns: ['tranid'] }).tranid || btId;

        // Update the license plate record's bin
        record.submitFields({
            type: RECORD_TYPE,
            id: data.plateId,
            values: { custrecord_tq_license_plate_bin: data.destinationBinId }
        });

        return {
            success: true,
            message: 'Bin transfer ' + btTranId + ' completed. ' + plate.serialList.length + ' serial(s) moved.',
            transferId: btId,
            tranId: btTranId,
            serialCount: plate.serialList.length
        };
    };

    // ═══════════════════════════════════════════════════════════
    //  HELPER: Get Inventory Number internal ID from serial string
    // ═══════════════════════════════════════════════════════════
    const getInventoryNumberId = (itemId, serialNumber) => {
        const srch = search.create({
            type: 'inventorynumber',
            filters: [
                ['inventorynumber', 'is', serialNumber.trim()],
                'AND',
                ['item', 'anyof', itemId]
            ],
            columns: ['internalid']
        });
        const res = srch.run().getRange({ start: 0, end: 1 });
        if (!res.length) {
            throw new Error('Serial number "' + serialNumber.trim() + '" not found in inventory for this item.');
        }
        return parseInt(res[0].id);
    };

    // ═══════════════════════════════════════════════════════════
    //  FULFILL SALES ORDER
    //  Create item fulfillment from SO using serials on a plate
    // ═══════════════════════════════════════════════════════════
    const fulfillSalesOrder = (data) => {
        // data: { plateId, salesOrderId }
        const plateData = getPlate(data.plateId);
        if (!plateData.success) return plateData;
        const plate = plateData.plate;

        if (!plate.serialList.length) {
            return { success: false, message: 'No serial numbers on this license plate.' };
        }

        // Transform SO to Item Fulfillment
        const fulfillment = record.transform({
            fromType: record.Type.SALES_ORDER,
            fromId: data.salesOrderId,
            toType: record.Type.ITEM_FULFILLMENT,
            isDynamic: true
        });

        // Find the matching item line on the fulfillment
        const lineCount = fulfillment.getLineCount({ sublistId: 'item' });
        let matchedLine = -1;

        for (let i = 0; i < lineCount; i++) {
            const lineItem = fulfillment.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (String(lineItem) === String(plate.itemId)) {
                matchedLine = i;
                break;
            }
        }

        if (matchedLine === -1) {
            return { success: false, message: 'Item on license plate not found on this sales order.' };
        }

        // Set all other lines to NOT ship
        for (let i = 0; i < lineCount; i++) {
            fulfillment.selectLine({ sublistId: 'item', line: i });
            fulfillment.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'itemreceive',
                value: (i === matchedLine)
            });
            if (i === matchedLine) {
                fulfillment.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    value: plate.serialList.length
                });

                // Set inventory detail
                const invDetail = fulfillment.getCurrentSublistSubrecord({
                    sublistId: 'item',
                    fieldId: 'inventorydetail'
                });

                // Clear existing lines
                const existingLines = invDetail.getLineCount({ sublistId: 'inventoryassignment' });
                for (let x = existingLines - 1; x >= 0; x--) {
                    invDetail.removeLine({ sublistId: 'inventoryassignment', line: x });
                }

                // Add serial number lines
                plate.serialList.forEach((serial) => {
                    invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    invDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: 1
                    });
                    invDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'issueinventorynumber',
                        value: getInventoryNumberId(plate.itemId, serial)
                    });
                    invDetail.commitLine({ sublistId: 'inventoryassignment' });
                });
            }
            fulfillment.commitLine({ sublistId: 'item' });
        }

        const ffId = fulfillment.save({ enableSourcing: true, ignoreMandatoryFields: false });

        // Get the tranid for display
        const ffTranId = search.lookupFields({ type: record.Type.ITEM_FULFILLMENT, id: ffId, columns: ['tranid'] }).tranid || ffId;

        // Update license plate status to "Shipped" (ID: 3)
        record.submitFields({
            type: RECORD_TYPE,
            id: data.plateId,
            values: { custrecord_tq_license_plate_status: 3 }
        });

        return {
            success: true,
            message: 'Item Fulfillment ' + ffTranId + ' created with ' + plate.serialList.length + ' serial(s). License plate status changed to Shipped.',
            fulfillmentId: ffId,
            tranId: ffTranId,
            serialCount: plate.serialList.length
        };
    };

    // ═══════════════════════════════════════════════════════════
    //  LOOKUP SALES ORDER
    // ═══════════════════════════════════════════════════════════
    const lookupSalesOrder = (tranid) => {
        const srch = search.create({
            type: search.Type.SALES_ORDER,
            filters: [
                ['numbertext', 'is', tranid],
                'AND',
                ['mainline', 'is', 'T'],
                'AND',
                ['status', 'noneof', 'SalesOrd:C'] // not fully billed/closed
            ],
            columns: ['tranid', 'entity', 'trandate', 'status', 'amount']
        });
        const res = srch.run().getRange({ start: 0, end: 1 });
        if (!res.length) return { success: false, message: 'Sales order "' + tranid + '" not found or already closed.' };

        // Get line items
        const lineSrch = search.create({
            type: search.Type.SALES_ORDER,
            filters: [
                ['numbertext', 'is', tranid],
                'AND',
                ['mainline', 'is', 'F'],
                'AND',
                ['taxline', 'is', 'F'],
                'AND',
                ['shipping', 'is', 'F'],
                'AND',
                ['cogs', 'is', 'F']
            ],
            columns: [
                search.createColumn({ name: 'item' }),
                search.createColumn({ name: 'quantity' }),
                search.createColumn({ name: 'quantityshiprecv' }),
                search.createColumn({ name: 'quantitypacked' })
            ]
        });
        const items = [];
        lineSrch.run().each(r => {
            const qty = parseFloat(r.getValue('quantity')) || 0;
            const shipped = parseFloat(r.getValue('quantityshiprecv')) || 0;
            const packed = parseFloat(r.getValue('quantitypacked')) || 0;
            const fulfilled = shipped + packed;
            items.push({
                itemId: r.getValue('item'),
                item: r.getText('item'),
                qty: qty,
                fulfilled: fulfilled,
                remaining: qty - fulfilled
            });
            return true;
        });

        return {
            success: true,
            salesOrder: {
                id: res[0].id,
                tranid: res[0].getValue('tranid'),
                customer: res[0].getText('entity'),
                date: res[0].getValue('trandate'),
                status: res[0].getText('status'),
                amount: res[0].getValue('amount'),
                items
            }
        };
    };

    // ═══════════════════════════════════════════════════════════
    //  DROPDOWN OPTIONS HELPERS
    // ═══════════════════════════════════════════════════════════
    const getItemOptions = (q) => {
        const filters = [['type', 'anyof', 'InvtPart', 'SerializedInventoryItem']];
        if (q) {
            filters.push('AND');
            filters.push([
                ['itemid', 'contains', q], 'OR', ['displayname', 'contains', q]
            ]);
        }
        const results = [];
        search.create({
            type: search.Type.ITEM,
            filters,
            columns: [
                search.createColumn({ name: 'itemid', sort: search.Sort.ASC }),
                'displayname'
            ]
        }).run().getRange({ start: 0, end: 25 }).forEach(r => {
            results.push({ id: r.id, name: r.getValue('itemid'), display: r.getValue('displayname') });
        });
        return { success: true, results };
    };

    const getBinOptions = (locationId) => {
        const filters = [];
        if (locationId) {
            filters.push(['location', 'anyof', locationId]);
        }
        const results = [];
        search.create({
            type: search.Type.BIN,
            filters,
            columns: [search.createColumn({ name: 'binnumber', sort: search.Sort.ASC })]
        }).run().getRange({ start: 0, end: 200 }).forEach(r => {
            results.push({ id: r.id, name: r.getValue('binnumber') });
        });
        return { success: true, results };
    };

    const getLocationOptions = () => {
        const results = [];
        search.create({
            type: search.Type.LOCATION,
            filters: [['isinactive', 'is', 'F']],
            columns: [search.createColumn({ name: 'name', sort: search.Sort.ASC })]
        }).run().getRange({ start: 0, end: 50 }).forEach(r => {
            results.push({ id: r.id, name: r.getValue('name') });
        });
        return { success: true, results };
    };

    const getStatusOptions = () => {
        const results = [];
        try {
            const tempRec = record.create({ type: RECORD_TYPE, isDynamic: true });
            const field = tempRec.getField({ fieldId: 'custrecord_tq_license_plate_status' });
            if (field) {
                const opts = field.getSelectOptions({ filter: null, operator: null });
                opts.forEach(o => {
                    if (o.value) results.push({ id: o.value, name: o.text });
                });
            }
        } catch (e) {
            log.debug('Status options lookup failed', e.message);
        }
        return { success: true, results };
    };

    const getStatusCodeOptions = () => {
        const results = [];
        try {
            // Search inventory status records
            search.create({
                type: 'inventorystatus',
                filters: [['isinactive', 'is', 'F']],
                columns: [search.createColumn({ name: 'name', sort: search.Sort.ASC })]
            }).run().getRange({ start: 0, end: 50 }).forEach(r => {
                results.push({ id: r.id, name: r.getValue('name') });
            });
        } catch (e) {
            log.debug('Inventory status lookup failed, trying field options', e.message);
            // Fallback: try to read select options from a temp record
            try {
                const tempRec = record.create({ type: RECORD_TYPE, isDynamic: false });
                const field = tempRec.getField({ fieldId: 'custrecord_tq_license_plate_sc' });
                if (field && typeof field.getSelectOptions === 'function') {
                    field.getSelectOptions().forEach(o => {
                        if (o.value) results.push({ id: o.value, name: o.text });
                    });
                }
            } catch (e2) {
                log.debug('Field options fallback also failed', e2.message);
            }
        }
        return { success: true, results };
    };

    // ═══════════════════════════════════════════════════════════
    //  LOOKUP PO SERIALS
    //  Find all serial numbers received on a PO for a given item
    // ═══════════════════════════════════════════════════════════
    const lookupPOSerials = (params) => {
        const itemId = params.itemId;
        const poNumber = params.poNumber;
        if (!itemId || !poNumber) return { success: false, message: 'Item and PO number are required.' };

        // Find PO by number
        const poSearch = search.create({
            type: search.Type.PURCHASE_ORDER,
            filters: [['numbertext', 'is', poNumber], 'AND', ['mainline', 'is', 'T']],
            columns: ['tranid']
        });
        const poRes = poSearch.run().getRange({ start: 0, end: 1 });
        if (!poRes.length) return { success: false, message: 'Purchase order "' + poNumber + '" not found.' };
        const poId = poRes[0].id;
        const poTranId = poRes[0].getValue('tranid');

        // Find Item Receipts created from this PO
        const receiptSearch = search.create({
            type: search.Type.ITEM_RECEIPT,
            filters: [['createdfrom', 'anyof', poId], 'AND', ['mainline', 'is', 'T']],
            columns: ['internalid']
        });
        const receiptIds = [];
        receiptSearch.run().each(r => { receiptIds.push(r.id); return true; });
        if (!receiptIds.length) return { success: false, message: 'No item receipts found for PO ' + poTranId + '.' };

        // Load each receipt and extract serial numbers for the item
        const serialNumbers = [];
        receiptIds.forEach(receiptId => {
            const rec = record.load({ type: record.Type.ITEM_RECEIPT, id: receiptId });
            const lineCount = rec.getLineCount({ sublistId: 'item' });
            for (let i = 0; i < lineCount; i++) {
                const lineItem = rec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                if (String(lineItem) === String(itemId)) {
                    try {
                        const invDetail = rec.getSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail', line: i });
                        if (invDetail) {
                            const assignCount = invDetail.getLineCount({ sublistId: 'inventoryassignment' });
                            for (let j = 0; j < assignCount; j++) {
                                const serial = invDetail.getSublistText({
                                    sublistId: 'inventoryassignment',
                                    fieldId: 'receiptinventorynumber',
                                    line: j
                                });
                                if (serial && serial.trim() && !serialNumbers.includes(serial.trim())) {
                                    serialNumbers.push(serial.trim());
                                }
                            }
                        }
                    } catch (e) {
                        // Line may not have inventory detail (non-serialized)
                    }
                }
            }
        });

        if (!serialNumbers.length) return { success: false, message: 'No serial numbers found on receipts for this item on PO ' + poTranId + '.' };
        return { success: true, poId, poTranId, serialNumbers, serialCount: serialNumbers.length };
    };

    // ═══════════════════════════════════════════════════════════
    //  CREATE LICENSE PLATE FROM PO
    // ═══════════════════════════════════════════════════════════
    const createFromPO = (data) => {
        // data: { itemId, poNumber, locationId, binId }
        const lookup = lookupPOSerials({ itemId: data.itemId, poNumber: data.poNumber });
        if (!lookup.success) return lookup;

        // Find "In Use" status ID
        let inUseStatusId = null;
        try {
            const tempRec = record.create({ type: RECORD_TYPE, isDynamic: true });
            const field = tempRec.getField({ fieldId: 'custrecord_tq_license_plate_status' });
            if (field) {
                const opts = field.getSelectOptions();
                for (let i = 0; i < opts.length; i++) {
                    const txt = (opts[i].text || '').toLowerCase().replace(/[\s\-_]/g, '');
                    if (txt === 'inuse') { inUseStatusId = opts[i].value; break; }
                }
            }
        } catch (e) { log.debug('In Use status lookup failed', e.message); }

        // Create the license plate
        const plateRec = record.create({ type: RECORD_TYPE });
        const plateName = String(Math.floor(Math.random() * 900000000) + 100000000);
        plateRec.setValue('name', plateName);
        if (data.locationId) plateRec.setValue('custrecord_location', data.locationId);
        plateRec.setValue('custrecord_tq_license_place_item', data.itemId);
        if (data.binId) plateRec.setValue('custrecord_tq_license_plate_bin', data.binId);
        plateRec.setValue('custrecord_tq_license_plate_serial_num', lookup.serialNumbers.join('\n'));
        if (inUseStatusId) plateRec.setValue('custrecord_tq_license_plate_status', inUseStatusId);
        plateRec.setValue('custrecord_tq_license_plate_notes', 'Created from PO ' + lookup.poTranId);
        plateRec.setValue('custrecord_tq_license_plate_created_by', runtime.getCurrentUser().id);

        const savedId = plateRec.save({ enableSourcing: true, ignoreMandatoryFields: false });

        return {
            success: true,
            message: 'License plate ' + plateName + ' created with ' + lookup.serialNumbers.length + ' serial(s) from PO ' + lookup.poTranId + '.',
            plateId: savedId,
            plateName: plateName,
            serialCount: lookup.serialNumbers.length
        };
    };


    // ═══════════════════════════════════════════════════════════
    //  WAREHOUSE ASSISTANT — Server-side code
    //  (imported from SUT Warehouse Assistant Dashboard)
    // ═══════════════════════════════════════════════════════════
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
        // BATCH-THEN-INDIVIDUAL RETRY HELPER
        // ====================================================================
        // Tries batch first (all items in one transaction). If batch fails,
        // retries each item individually so good items go through and bad
        // items are tracked as failures.

        function tryBatchThenIndividual(items, createFn, memo) {
            if (items.length === 0) return { tranIds: [], succeeded: [], failed: [] };
            // Try batch first (happy path - 1 transaction)
            try {
                const r = createFn(items, memo);
                var tid = r.tranId || r.transferId || r.adjId || '';
                return { tranIds: [String(tid)], succeeded: items, failed: [] };
            } catch (batchErr) {
                log.debug('Batch failed, retrying individually', batchErr.message);
                // If only 1 item, no point retrying
                if (items.length === 1) {
                    items[0]._error = batchErr.message;
                    return { tranIds: [], succeeded: [], failed: items };
                }
                // Retry each item individually
                var succeeded = [], failed = [], tranIds = [];
                items.forEach(function(item) {
                    try {
                        var r = createFn([item], memo);
                        var tid = r.tranId || r.transferId || r.adjId || '';
                        tranIds.push(String(tid));
                        succeeded.push(item);
                    } catch (e) {
                        item._error = e.message;
                        failed.push(item);
                    }
                });
                return { tranIds: tranIds, succeeded: succeeded, failed: failed };
            }
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
                html, body { overflow-x:hidden !important; max-width:100vw !important; margin:0 !important; padding:0 !important; }
                #main_form { background:#eef1f5 !important; overflow-x:hidden !important; }
                #div__body, #outerdiv, .uir-record-type { overflow-x:hidden !important; max-width:100vw !important; }
                /* Hide ALL NetSuite headers, nav, and page chrome */
                #ns_navigation, #ns-header-menu-main, .ns-navigation,
                #div__header, .bglt, #ns_header, .ns_header_body,
                .uir-page-title,.uir-page-title-firstline,.uir-page-title-secondline,
                .uir-page-title-wrap, .uir-header-buttons,.uir-button-bar,
                #ns-dashboard-page-header, .ns-role-menuitem,
                .ns-header-decorator, #ns_headerportal,
                #div__nav, #div__navmenu, .ns-menubar,
                .uir-breadcrumbs, .uir-record-name,
                #system_alert_pane, #nsBackButton { display:none !important; height:0 !important; min-height:0 !important; overflow:hidden !important; }
                #div__body { margin-top:0 !important; padding-top:0 !important; }
                #main_form > tbody > tr:first-child { display:none !important; }
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

        function createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId, transferOrderTranId, errors, failedGroups) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });
            const suiteletUrl = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId, returnExternalUrl: true });
            errors = errors || [];
            failedGroups = failedGroups || [];

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

            // Build failed items HTML (red highlighted)
            let failedHtml = '';
            if (failedGroups.length > 0) {
                let failedRowsHtml = '';
                failedGroups.forEach(f => {
                    failedRowsHtml += '<tr style="background:#fef2f2;"><td data-label="Serial" style="color:#991b1b;font-weight:700;">' + escapeXml(f.serialNumber) + '</td>'
                        + '<td data-label="Item" style="color:#991b1b;">' + escapeXml(f.itemText) + '</td>'
                        + '<td data-label="Action" style="color:#991b1b;">' + escapeXml(ACTION_LABELS[f.action] || f.action) + '</td>'
                        + '<td data-label="Error" style="color:#dc2626;font-weight:700;">' + escapeXml(f.error) + '</td></tr>';
                });
                failedHtml = '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:16px;margin-bottom:20px;">'
                    + '<h3 style="color:#dc2626;margin:0 0 10px;font-size:16px;">&#9888; ' + failedGroups.length + ' Serial' + (failedGroups.length !== 1 ? 's' : '') + ' FAILED</h3>'
                    + '<table class="results-table" style="margin:0;"><thead><tr><th>Serial</th><th>Item</th><th>Action</th><th>Error</th></tr></thead>'
                    + '<tbody>' + failedRowsHtml + '</tbody></table></div>';
            }

            let groupsHtml = '';
            labelGroups.forEach(group => {
                const serialListHtml = group.serialNumbers.map(s => '<li>' + escapeXml(s) + '</li>').join('');
                groupsHtml += '<div class="label-group"><h3>' + escapeXml(group.itemText) + '</h3>'
                    + '<p style="color:#6b7280;margin:0 0 10px;font-size:13px;">' + group.serialNumbers.length + ' label' + (group.serialNumbers.length !== 1 ? 's' : '') + ' &bull; ' + (ACTION_LABELS[group.action] || group.action) + '</p>'
                    + '<ul class="serial-list">' + serialListHtml + '</ul></div>';
            });

            const totalSerials = labelGroups.reduce((sum, g) => sum + g.serialNumbers.length, 0);
            const hasErrors = failedGroups.length > 0;
            const iconHtml = hasErrors ? '<div style="font-size:56px;color:#f59e0b;margin-bottom:12px;">&#9888;</div>' : '<div class="success-icon">&#10003;</div>';
            const headingHtml = hasErrors ? '<h2 style="color:#92400e;">Partially Complete</h2>' : '<h2>Done!</h2>';

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
                                ${iconHtml}
                                ${headingHtml}
                                ${transactionInfoHtml}
                                <p style="color:#6b7280;margin-top:12px;">${totalSerials} serial${totalSerials !== 1 ? 's' : ''} processed successfully</p>
                                ${failedHtml}
                                ${groupsHtml}
                            </div>
                        </div>
                        <div class="btn-area" style="flex-direction:column;">
                            ${totalSerials > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (' + totalSerials + ')</button>' : ''}
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

        function createNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors, transferOrderTranId, failedItems) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });
            const suiteletUrl = url.resolveScript({ scriptId: runtime.getCurrentScript().id, deploymentId: runtime.getCurrentScript().deploymentId, returnExternalUrl: true });
            const printData = processedItems.map(function(item) { return { itemText: item.itemText || '', description: item.description || '', quantity: item.quantity }; });
            const recordIdForPrint = adjustmentTranId || binTransferTranId || inventoryFoundTranId || transferOrderTranId || '';
            failedItems = failedItems || [];

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
                itemRows += '<tr style="background:#f0fdf4;"><td data-label="Item"><strong style="color:#166534;">' + escapeXml(item.itemText) + '</strong></td><td data-label="Qty">' + item.quantity + '</td><td data-label="Action">' + escapeXml(ACTION_LABELS[item.action] || item.action) + '</td><td data-label="Status" style="color:#059669;font-weight:700;">&#10003; OK</td></tr>';
            });

            // Failed items in red
            let failedHtml = '';
            if (failedItems.length > 0) {
                let failedRowsHtml = '';
                failedItems.forEach(function(item) {
                    failedRowsHtml += '<tr style="background:#fef2f2;"><td data-label="Item" style="color:#991b1b;font-weight:700;">' + escapeXml(item.itemText) + '</td>'
                        + '<td data-label="Qty" style="color:#991b1b;">' + item.quantity + '</td>'
                        + '<td data-label="Action" style="color:#991b1b;">' + escapeXml(ACTION_LABELS[item.action] || item.action) + '</td>'
                        + '<td data-label="Error" style="color:#dc2626;font-weight:700;">' + escapeXml(item.error) + '</td></tr>';
                });
                failedHtml = '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:16px;margin:20px 0;text-align:left;">'
                    + '<h3 style="color:#dc2626;margin:0 0 10px;font-size:16px;">&#9888; ' + failedItems.length + ' Row' + (failedItems.length !== 1 ? 's' : '') + ' FAILED — Needs Attention</h3>'
                    + '<table class="results-table" style="margin:0;"><thead><tr><th>Item</th><th>Qty</th><th>Action</th><th>Error</th></tr></thead>'
                    + '<tbody>' + failedRowsHtml + '</tbody></table></div>';
            }

            const hasErrors = failedItems.length > 0;
            const iconHtml = hasErrors ? '<div style="font-size:56px;color:#f59e0b;margin-bottom:12px;">&#9888;</div>' : '<div class="success-icon">&#10003;</div>';
            const headingHtml = hasErrors ? '<h2 style="color:#92400e;">Partially Complete</h2>' : '<h2>Done!</h2>';

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container"><div class="main-card"><div class="form-body"><div class="success-card">
                    ${iconHtml}
                    ${headingHtml}
                    ${transactionInfoHtml}
                    <p style="color:#6b7280;margin-top:12px;">${processedItems.length} item${processedItems.length !== 1 ? 's' : ''} (${totalQty} total qty) processed successfully</p>
                    ${failedHtml}
                    <table class="results-table" style="margin-top:20px;text-align:left;">
                        <thead><tr><th>Item</th><th>Qty</th><th>Action</th><th>Status</th></tr></thead>
                        <tbody>${itemRows}</tbody>
                    </table>
                </div></div>
                <div class="btn-area" style="flex-direction:column;">
                    ${totalQty > 0 ? '<button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (' + totalQty + ')</button>' : ''}
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

            const failedGroups = [];

            if (adjustmentGroups.length > 0) {
                const result = tryBatchThenIndividual(adjustmentGroups, createConditionChangeAdjustment, 'Created via WH Assistant');
                if (result.tranIds.length > 0) adjustmentTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => {
                    let ex = labelGroups.find(lg => lg.itemId === g.targetItemId && lg.action === g.action);
                    if (!ex) { ex = { itemId: g.targetItemId, itemText: g.targetDisplayName || g.targetItemName, description: g.targetDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                    g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                });
                result.failed.forEach(g => {
                    g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.targetDisplayName || g.targetItemName, action: g.action, error: g._error || 'Adjustment failed' }); });
                });
                if (result.failed.length > 0) errors.push(result.failed.length + ' adjustment group(s) failed');
            }
            if (binTransferGroups.length > 0) {
                const result = tryBatchThenIndividual(binTransferGroups, createBinTransfer, 'Via WH Assistant');
                if (result.tranIds.length > 0) binTransferTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => {
                    let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action);
                    if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                    g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                });
                result.failed.forEach(g => {
                    g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: g._error || 'Bin transfer failed' }); });
                });
                if (result.failed.length > 0) errors.push(result.failed.length + ' bin transfer group(s) failed');
            }
            if (serialChangeList.length > 0) {
                const result = tryBatchThenIndividual(serialChangeList, createSerialNumberChangeAdjustment, 'Serial Change via WH Assistant');
                if (result.tranIds.length > 0) serialChangeTranId = result.tranIds.join(', ');
                result.succeeded.forEach(c => {
                    let ex = labelGroups.find(lg => lg.itemId === c.itemId && lg.action === c.action);
                    if (!ex) { ex = { itemId: c.itemId, itemText: c.itemText, description: c.itemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); }
                    ex.serialNumbers.push(c.newSerialNumber);
                });
                result.failed.forEach(c => {
                    failedGroups.push({ serialNumber: c.oldSerialNumber, itemText: c.itemText, action: c.action, error: c._error || 'Serial change failed' });
                });
                if (result.failed.length > 0) errors.push(result.failed.length + ' serial change(s) failed');
            }
            if (partNumberChangeList.length > 0) {
                const result = tryBatchThenIndividual(partNumberChangeList, createPartNumberChangeAdjustment, 'Part # Change via WH Assistant');
                if (result.tranIds.length > 0) partNumberChangeTranId = result.tranIds.join(', ');
                result.succeeded.forEach(c => {
                    let ex = labelGroups.find(lg => lg.itemId === c.newItemId && lg.action === c.action);
                    if (!ex) { ex = { itemId: c.newItemId, itemText: c.newItemText, description: c.newItemDescription, action: c.action, serialNumbers: [] }; labelGroups.push(ex); }
                    ex.serialNumbers.push(c.serialNumber);
                });
                result.failed.forEach(c => {
                    failedGroups.push({ serialNumber: c.serialNumber, itemText: c.oldItemText || c.newItemText, action: c.action, error: c._error || 'Part # change failed' });
                });
                if (result.failed.length > 0) errors.push(result.failed.length + ' part # change(s) failed');
            }
            if (inventoryFoundGroups.length > 0) {
                const result = tryBatchThenIndividual(inventoryFoundGroups, createInventoryFoundAdjustment, 'Inv Found via WH Assistant');
                if (result.tranIds.length > 0) inventoryFoundTranId = result.tranIds.join(', ');
                result.succeeded.forEach(g => {
                    let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action);
                    if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                    g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                });
                result.failed.forEach(g => {
                    g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: g._error || 'Inventory found failed' }); });
                });
                if (result.failed.length > 0) errors.push(result.failed.length + ' inventory found group(s) failed');
            }
            if (transferUpchargeGroups.length > 0) {
                const toTranIds = [];
                transferUpchargeGroups.forEach(g => {
                    try {
                        const r = createTransferOrderWithUpcharge({ itemId: g.itemId, itemText: g.itemText, serials: g.serials, upchargePerUnit: g.upchargePerUnit, memo: 'Xfer & Upcharge via WH Asst' });
                        toTranIds.push(r.transferOrderTranId);
                        let ex = labelGroups.find(lg => lg.itemId === g.itemId && lg.action === g.action);
                        if (!ex) { ex = { itemId: g.itemId, itemText: g.itemText, description: g.itemDescription, action: g.action, serialNumbers: [] }; labelGroups.push(ex); }
                        g.serials.forEach(s => ex.serialNumbers.push(s.serialNumber));
                    } catch (e) {
                        log.error('Transfer Order Error', e.message);
                        g.serials.forEach(s => { failedGroups.push({ serialNumber: s.serialNumber, itemText: g.itemText, action: g.action, error: e.message }); });
                        errors.push('Transfer order failed for ' + g.itemText + ': ' + e.message);
                    }
                });
                if (toTranIds.length > 0) transferOrderTranId = toTranIds.join(', ');
            }

            if (labelGroups.length === 0 && failedGroups.length > 0) {
                createResultsPage(context, serialData, 'All operations failed: ' + errors.join('; '), 'error'); return;
            }

            createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId, transferOrderTranId, errors, failedGroups);
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
            const failedItems = [];

            if (adjustmentRows.length > 0) {
                const result = tryBatchThenIndividual(adjustmentRows, createNonSerializedAdjustmentMulti, 'Created via WH Assistant');
                if (result.tranIds.length > 0) adjustmentTranId = result.tranIds.join(', ');
                result.succeeded.forEach(function(row) { processedItems.push({ itemText: row.targetDisplayName || row.targetItemName, description: row.targetDescription, quantity: row.quantity, action: row.action }); });
                result.failed.forEach(function(row) { failedItems.push({ itemText: row.targetDisplayName || row.targetItemName || row.sourceItemName, description: row.targetDescription, quantity: row.quantity, action: row.action, error: row._error || 'Adjustment failed' }); });
                if (result.failed.length > 0) errors.push(result.failed.length + ' adjustment row(s) failed');
            }
            if (binTransferRows.length > 0) {
                const result = tryBatchThenIndividual(binTransferRows, createNonSerializedBinTransferMulti, 'Via WH Assistant');
                if (result.tranIds.length > 0) binTransferTranId = result.tranIds.join(', ');
                result.succeeded.forEach(function(row) { processedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action }); });
                result.failed.forEach(function(row) { failedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action, error: row._error || 'Bin transfer failed' }); });
                if (result.failed.length > 0) errors.push(result.failed.length + ' bin transfer row(s) failed');
            }
            if (inventoryFoundRows.length > 0) {
                const result = tryBatchThenIndividual(inventoryFoundRows, createNonSerializedInventoryFoundMulti, 'Inv Found via WH Assistant');
                if (result.tranIds.length > 0) inventoryFoundTranId = result.tranIds.join(', ');
                result.succeeded.forEach(function(row) { processedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action }); });
                result.failed.forEach(function(row) { failedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action, error: row._error || 'Inventory found failed' }); });
                if (result.failed.length > 0) errors.push(result.failed.length + ' inventory found row(s) failed');
            }
            if (transferUpchargeRows.length > 0) {
                const toTranIds = [];
                transferUpchargeRows.forEach(function(row) {
                    try {
                        const r = createTransferOrderWithUpcharge({ itemId: row.itemId, itemText: row.itemText, serials: [], quantity: row.quantity, upchargePerUnit: row.upcharge, memo: 'Xfer & Upcharge via WH Asst' });
                        toTranIds.push(r.transferOrderTranId);
                        processedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action });
                    } catch (e) {
                        log.error('NS Transfer Error', e.message);
                        failedItems.push({ itemText: row.itemText, description: row.description, quantity: row.quantity, action: row.action, error: e.message });
                        errors.push('Transfer failed for ' + row.itemText + ': ' + e.message);
                    }
                });
                if (toTranIds.length > 0) transferOrderTranId = toTranIds.join(', ');
            }

            if (processedItems.length === 0 && failedItems.length > 0) { createEntryForm(context, 'All operations failed: ' + errors.join('; '), 'error'); return; }
            createNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors, transferOrderTranId, failedItems);
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

    // ═══════════════════════════════════════════════════════════════════
    //  PRINT LABEL DASHBOARD — Server-side code (embedded, pl-prefixed)
    // ═══════════════════════════════════════════════════════════════════

        function plValidateSerialNumbers(serialNumbers) {
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

        function plSearchPOReceipts(poNumber) {
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

        function plGenerateLabelsPdf(labelData) {
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


        function plGetStyles() {
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
                html, body { overflow-x:hidden !important; max-width:100vw !important; margin:0 !important; padding:0 !important; }
                #main_form { background-color: #f4f7f9 !important; overflow-x:hidden !important; }
                #div__body, #outerdiv, .uir-record-type { overflow-x:hidden !important; max-width:100vw !important; }

                /* Hide NetSuite chrome */
                #ns_navigation, #ns-header-menu-main, .ns-navigation,
                #div__header, .bglt, #ns_header, .ns_header_body,
                .uir-page-title, .uir-page-title-wrap, .uir-header-buttons, .uir-button-bar,
                #div__nav, #div__navmenu, .ns-menubar,
                .uir-breadcrumbs, .uir-record-name,
                #system_alert_pane, #nsBackButton,
                #tbl_submitter, #submitter_row, .uir_form_tab_bg { display:none !important; height:0 !important; }
                #main_form > tbody > tr:first-child { display:none !important; }

                /* Force NS table/field containers to not overflow */
                #main_form, #main_form > tbody, #main_form > tbody > tr, #main_form > tbody > tr > td,
                .uir-field-widget, .uir-field, [id$="_fs"], [id$="_fs_lbl"] {
                    max-width:100vw !important; overflow-x:hidden !important;
                }
                /* NS field wrappers moved into our layout — force tables/containers full width */
                #po-field-wrap > *, #serial-field-wrap > *, #reprint-field-wrap > *,
                #po-field-wrap table, #serial-field-wrap table, #reprint-field-wrap table {
                    width:100% !important; max-width:100% !important;
                }
                #item-field-wrap > *, #item-field-wrap table { width:100% !important; max-width:100% !important; }
                /* NS item selector popup widget */
                .dropdownDiv, .uir-field-widget-container { max-width:100vw !important; }

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

                /* === MOBILE RESPONSIVE === */
                @media screen and (max-width:768px) {
                    /* Nuke all NS page-level width/padding */
                    html, body, #main_form, #div__body, #outerdiv, .uir-record-type {
                        padding:0 !important; margin:0 !important;
                        overflow-x:hidden !important; max-width:100vw !important; width:100% !important;
                    }
                    #main_form { background:#f4f7f9 !important; }
                    #main_form > tbody, #main_form > tbody > tr, #main_form > tbody > tr > td {
                        display:block !important; width:100% !important; max-width:100vw !important;
                        padding:0 !important; margin:0 !important;
                    }

                    /* Kill all NS field container tables and inline widths (simple fields only) */
                    #po-field-wrap td, #po-field-wrap table, #po-field-wrap span,
                    #serial-field-wrap td, #serial-field-wrap table, #serial-field-wrap span,
                    #reprint-field-wrap td, #reprint-field-wrap table, #reprint-field-wrap span {
                        display:block !important; width:100% !important; max-width:100% !important;
                        padding:0 !important; margin:0 !important; border:none !important;
                    }
                    /* Item selector — only constrain outer container, preserve widget internals */
                    #item-field-wrap {
                        overflow:hidden !important; max-width:100% !important; width:100% !important;
                    }
                    #item-field-wrap > * { max-width:100% !important; }
                    #item-field-wrap table { width:100% !important; border-collapse:collapse; }
                    #item-field-wrap td { padding:0 !important; margin:0 !important; border:none !important; }
                    /* NS field labels generated by serverWidget — hide since we have custom labels */
                    [id$="_fs_lbl_uir_label"], [id$="_fs_lbl"] span.smallgraytextnolink,
                    .uir-label { display:none !important; }

                    /* App layout */
                    .app-container {
                        padding:0 !important; margin:0 !important;
                        max-width:100% !important; width:100% !important; overflow-x:hidden !important;
                    }
                    .main-card {
                        border-radius:0; box-shadow:none; border:none;
                        overflow-x:hidden !important; max-width:100vw !important;
                    }
                    .card-header { padding:14px 16px; }
                    .card-header h1 { font-size:17px; }
                    .card-header p { font-size:12px; margin-top:4px; }

                    .form-body { padding:14px; overflow-x:hidden !important; }
                    .input-group { margin-bottom:16px; }
                    .custom-label { font-size:11px; margin-bottom:6px; }

                    .input-group input[type="text"],
                    .input-group select,
                    .input-group textarea {
                        padding:12px !important; font-size:16px !important;
                        border-radius:8px !important; border-width:1.5px !important;
                        width:100% !important; max-width:100% !important;
                    }
                    .input-group select { height:50px !important; }
                    .input-group textarea {
                        min-height:140px !important;
                        width:100% !important; max-width:100% !important;
                        cols:unset !important;
                    }

                    .input-row { flex-direction:column; gap:8px; }
                    .input-row .flex-grow { width:100%; }
                    .input-row .custom-btn { width:100%; text-align:center; }

                    .btn-area { padding:10px 0; gap:8px; flex-direction:column; border-top:none; }
                    .custom-btn {
                        padding:14px; font-size:14px; border-radius:8px;
                        width:100%; text-align:center;
                    }

                    .alert { padding:10px 12px; font-size:13px; margin-bottom:12px; border-radius:8px; }
                    .badge-count { padding:2px 8px; font-size:10px; margin-left:6px; }

                    /* Results table → card layout */
                    .results-table, .results-table thead, .results-table tbody,
                    .results-table tr, .results-table th, .results-table td {
                        display:block !important; width:100% !important; white-space:normal !important;
                    }
                    .results-table thead { display:none !important; }
                    .results-table tr {
                        background:#f9fafb; border:1px solid #e5e7eb;
                        border-radius:8px; padding:12px; margin-bottom:8px;
                        position:relative;
                    }
                    .results-table td {
                        padding:3px 0 !important; border-bottom:none !important;
                        font-size:14px !important; text-align:left !important;
                    }
                    .results-table td:first-child {
                        position:absolute; top:12px; right:12px; width:auto !important;
                    }
                    .results-table input[type="checkbox"] { width:22px; height:22px; }
                    .results-table tr:hover td { background:transparent !important; }

                    .success-icon { font-size:40px; margin-bottom:10px; }
                    .success-card { padding:20px 14px; }
                    .success-card h2 { font-size:20px; }
                    .success-card p { font-size:14px; margin-bottom:20px; }

                    .serial-list {
                        grid-template-columns:repeat(auto-fill, minmax(110px, 1fr));
                        gap:6px; margin:16px 0;
                    }
                    .serial-list li { font-size:11px; padding:8px 10px; word-break:break-all; }

                    /* Reprint section */
                    div[style*="border-top: 2px"] { margin-top:16px !important; padding-top:16px !important; }

                    /* PO results page - wider container */
                    .app-container[style*="max-width: 900px"] { max-width:100% !important; }
                    /* Selected items bar */
                    div[style*="background:#f8fafc"][style*="justify-content:space-between"] {
                        padding:12px 14px !important; border-radius:8px !important;
                    }
                }

                @media screen and (max-width:400px) {
                    .card-header { padding:10px 12px; }
                    .card-header h1 { font-size:15px; }
                    .card-header p { display:none; }
                    .form-body { padding:10px; }
                    .serial-list { grid-template-columns:repeat(auto-fill, minmax(90px, 1fr)); }
                }
            </style>
            `;
        }

        function plGetEntryFormScript() {
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

        function plGetPOResultsScript(suiteletUrl) {
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

        function plGetSuccessPageScript(suiteletUrl, pdfUrl) {
            return `
                <script>
                    function printLabels() { window.open('${escapeForJs(pdfUrl)}', '_blank'); }
                    function createAnother() { window.location.href = '${escapeForJs(suiteletUrl)}'; }
                </script>
            `;
        }

        function plCreateEntryForm(context, message, messageType, prefill) {
            const form = serverWidget.createForm({ title: 'Print Labels' });

            // Styles and Scripts
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = plGetStyles() + plGetEntryFormScript();

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

                    // Strip inline widths from NS elements inside simple field wrappers (not item selector)
                    [poWrap, serialWrap, reprintWrap].forEach(function(wrap) {
                        if (!wrap) return;
                        var els = wrap.querySelectorAll('*');
                        for (var i = 0; i < els.length; i++) {
                            if (els[i].style.width) els[i].style.width = '100%';
                            if (els[i].style.maxWidth) els[i].style.maxWidth = '100%';
                        }
                    });
                    // Force textarea cols attribute removal (causes fixed width)
                    var ta = document.getElementById('custpage_serial_numbers');
                    if (ta) { ta.removeAttribute('cols'); ta.style.width = '100%'; }
                    // Item selector — only reset the outermost table containers, leave widget internals alone
                    if (itemWrap) {
                        var topTables = itemWrap.querySelectorAll(':scope > table, :scope > * > table');
                        for (var i = 0; i < topTables.length; i++) {
                            topTables[i].style.width = '100%';
                        }
                    }

                    updateCount();
                });
            </script>`;

            context.response.writePage(form);
        }

        function plCreatePOResultsPage(context, poResults, message, messageType) {
            const form = serverWidget.createForm({ title: 'PO Results' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                params: { action: 'printlabel' }
            });

            // Styles
            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = plGetStyles() + plGetPOResultsScript(suiteletUrl);

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

        function plCreateSuccessPage(context, recordId, labelData) {
            const form = serverWidget.createForm({ title: 'Labels Created' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true,
                params: { action: 'printlabel' }
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
            styleField.defaultValue = plGetStyles() + plGetSuccessPageScript(suiteletUrl, printUrl);

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

        function plHandlePrintPdf(context) {
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
                const pdfFile = plGenerateLabelsPdf({ itemText, description, serialNumbers, recordId });

                context.response.setHeader({ name: 'Content-Type', value: 'application/pdf' });
                context.response.setHeader({ name: 'Content-Disposition', value: 'inline; filename="Labels_' + recordId + '.pdf"' });
                context.response.write(pdfFile.getContents());
            } catch (e) {
                log.error('PDF Error', e.message);
                context.response.write('Error: ' + e.message);
            }
        }

        function plHandlePrintPage(context) {
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

        function plHandlePOSearch(context) {
            const poNumber = context.request.parameters.custpage_po_number;

            if (!poNumber || !poNumber.trim()) {
                plCreateEntryForm(context, 'Enter a PO number', 'warning');
                return;
            }

            const poResults = plSearchPOReceipts(poNumber.trim());

            if (!poResults.found) {
                plCreateEntryForm(context, 'PO not found: ' + escapeXml(poNumber), 'error', { poNumber });
                return;
            }

            if (poResults.items.length === 0) {
                plCreateEntryForm(context, 'No receipts found for PO: ' + escapeXml(poNumber), 'warning', { poNumber });
                return;
            }

            plCreatePOResultsPage(context, poResults);
        }

        function plHandlePrintSelected(context) {
            const poDataRaw = context.request.parameters.custpage_po_data;
            const selectedItems = context.request.parameters.custpage_select_item;

            if (!poDataRaw) {
                plCreateEntryForm(context, 'Error: PO data not found', 'error');
                return;
            }

            let poResults;
            try {
                poResults = JSON.parse(poDataRaw);
            } catch (e) {
                plCreateEntryForm(context, 'Error: Invalid data', 'error');
                return;
            }

            let selectedIndexes = [];
            if (Array.isArray(selectedItems)) {
                selectedIndexes = selectedItems.map(i => parseInt(i, 10));
            } else if (selectedItems) {
                selectedIndexes = [parseInt(selectedItems, 10)];
            }

            if (selectedIndexes.length === 0) {
                plCreatePOResultsPage(context, poResults, 'Select at least one item', 'warning');
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
                plCreatePOResultsPage(context, poResults, 'Selected items have no serial numbers', 'warning');
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

                plCreateSuccessPage(context, recordId, {
                    item: firstItem.itemId,
                    itemText: itemText,
                    description: description,
                    serialNumbers: allSerials
                });

            } catch (e) {
                log.error('Error creating record', e.message);
                plCreatePOResultsPage(context, poResults, 'Error: ' + e.message, 'error');
            }
        }

        function plHandleCreateLabels(context) {
            const item = context.request.parameters.custpage_item;
            const serialNumbers = context.request.parameters.custpage_serial_numbers || '';
            const poNumber = context.request.parameters.custpage_po_number || '';

            if (!item) {
                plCreateEntryForm(context, 'Select a part number', 'error', { item, serialNumbers, poNumber });
                return;
            }

            let validSerials = [];
            if (serialNumbers.trim()) {
                const result = plValidateSerialNumbers(serialNumbers);
                if (result.invalid.length > 0) {
                    plCreateEntryForm(context, 'Invalid serials: ' + result.invalid.join(', '), 'error', { item, serialNumbers, poNumber });
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

            plCreateSuccessPage(context, recordId, { item, itemText, description, serialNumbers: validSerials });
        }

        function plHandleReprint(context) {
            const reprintId = context.request.parameters.custpage_reprint_id;

            if (!reprintId || !reprintId.trim()) {
                plCreateEntryForm(context, 'Enter a Print Label record ID', 'warning');
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

                plCreateSuccessPage(context, reprintId.trim(), {
                    item: itemId,
                    itemText: itemText,
                    description: description,
                    serialNumbers: serialNumbers
                });

            } catch (e) {
                log.error('Reprint Error', e.message);
                plCreateEntryForm(context, 'Could not load record #' + escapeXml(reprintId) + ': ' + e.message, 'error');
            }
        }

    // ═══════════════════════════════════════════════════════════
    //  SERVE THE HTML PAGE
    // ═══════════════════════════════════════════════════════════
    const servePage = (context) => {
        const suiteletUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId,
            returnExternalUrl: false
        });

        const html = buildHtml(suiteletUrl);
        context.response.write(html);
    };

    // ═══════════════════════════════════════════════════════════
    //  BUILD THE FULL HTML PAGE
    // ═══════════════════════════════════════════════════════════
    const buildHtml = (apiUrl) => {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>License Plate Manager</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<style>
/* ──────────────────────────────────────────────────
   DESIGN SYSTEM — Industrial / Warehouse Aesthetic
   ────────────────────────────────────────────────── */
:root {
    --bg: #f4f6f9;
    --surface: #ffffff;
    --surface-hover: #f0f2f5;
    --surface-active: #e8ebf0;
    --border: #e0e4ea;
    --border-light: #cdd3dc;
    --text: #1a1d27;
    --text-muted: #5f6577;
    --text-dim: #9198a8;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --accent-glow: rgba(59,130,246,.1);
    --success: #16a34a;
    --success-bg: rgba(22,163,74,.08);
    --warning: #d97706;
    --warning-bg: rgba(217,119,6,.08);
    --danger: #dc2626;
    --danger-bg: rgba(220,38,38,.08);
    --radius: 10px;
    --radius-sm: 6px;
    --shadow: 0 2px 12px rgba(0,0,0,.08);
    --font: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    --mono: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

* { margin:0; padding:0; box-sizing:border-box; }

body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    overflow-x: hidden;
}

/* ─── TOP NAV ─── */
.topbar {
    position: sticky; top:0; z-index:100;
    display: flex; align-items:center; justify-content:space-between;
    padding: 0 24px; height: 56px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
}
.topbar-brand {
    display: flex; align-items:center; gap:10px;
    font-weight: 700; font-size: 15px; letter-spacing: .3px;
}
.topbar-brand svg { color: var(--accent); }
.topbar-user {
    font-size: 13px; color: var(--text-muted);
}

/* ─── SIDEBAR NAV ─── */
.layout { display:flex; min-height: calc(100vh - 56px); }

.sidebar {
    width: 220px; flex-shrink:0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 16px 0;
    display: flex; flex-direction: column;
}
.nav-item {
    display: flex; align-items:center; gap:10px;
    padding: 10px 20px; margin: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 13.5px; color: var(--text-muted);
    cursor: pointer; transition: all .15s;
    user-select: none;
}
.nav-item:hover { background: var(--surface-hover); color: var(--text); }
.nav-item.active { background: var(--accent-glow); color: var(--accent); font-weight:600; }
.nav-item svg { width:18px; height:18px; flex-shrink:0; }
/* ─── NAV GROUPS (collapsible) ─── */
.nav-group { margin: 2px 0; }
.nav-group-toggle {
    display: flex; align-items:center; justify-content:space-between;
    padding: 10px 20px; margin: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 13.5px; color: var(--text-muted);
    cursor: pointer; transition: all .15s;
    user-select: none;
}
.nav-group-toggle:hover { background: var(--surface-hover); color: var(--text); }
.nav-group.open .nav-group-toggle { color: var(--text); }
.nav-chevron { transition: transform .2s; }
.nav-group.open .nav-chevron { transform: rotate(180deg); }
.nav-group-items {
    max-height: 0; overflow: hidden;
    transition: max-height .25s ease;
}
.nav-group.open .nav-group-items { max-height: 400px; }
.nav-item.nav-sub { padding-left: 36px; font-size: 13px; }

/* ─── MAIN CONTENT ─── */
.main { flex:1; padding:24px 32px; overflow-y:auto; max-height: calc(100vh - 56px); }
.view { display:none; }
.view.active { display:block; }

/* ─── IFRAME VIEWS ─── */
#view-warehouse, #view-printlabel { padding:0; margin:0; overflow:hidden; }
#view-warehouse.active, #view-printlabel.active { display:flex; }
#view-warehouse iframe, #view-printlabel iframe { flex:1; }

/* ─── PAGE HEADER ─── */
.page-header {
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom: 24px;
}
.page-title { font-size:22px; font-weight:700; letter-spacing:-.3px; }
.page-subtitle { font-size:13px; color:var(--text-muted); margin-top:2px; }

/* ─── CARDS ─── */
.card {
    background: var(--surface); border:1px solid var(--border);
    border-radius: var(--radius); padding:20px;
    margin-bottom:16px;
}
.card-title {
    font-size:14px; font-weight:600; margin-bottom:16px;
    display:flex; align-items:center; gap:8px;
}

/* ─── STAT CARDS ─── */
.stats-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap:12px; margin-bottom:24px; }
.stat-card {
    background: var(--surface); border:1px solid var(--border);
    border-radius: var(--radius); padding:16px 20px;
}
.stat-card .label { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--text-dim); font-weight:600; }
.stat-card .value { font-size:28px; font-weight:700; margin-top:4px; font-variant-numeric:tabular-nums; }

/* ─── BUTTONS ─── */
.btn {
    display:inline-flex; align-items:center; gap:6px;
    padding: 8px 16px; border-radius:var(--radius-sm);
    font-size:13px; font-weight:600; cursor:pointer;
    border:1px solid var(--border); background:var(--surface);
    color:var(--text); transition:all .15s; user-select:none;
    white-space:nowrap;
}
.btn:hover { background:var(--surface-hover); border-color:var(--border-light); }
.btn-primary { background:var(--accent); border-color:var(--accent); color:#fff; }
.btn-primary:hover { background:var(--accent-hover); }
.btn-danger { background:var(--danger); border-color:var(--danger); color:#fff; }
.btn-danger:hover { opacity:.85; }
.btn-success { background:var(--success); border-color:var(--success); color:#fff; }
.btn-success:hover { opacity:.85; }
.btn-sm { padding:6px 12px; font-size:12px; }
.btn-group { display:flex; gap:8px; flex-wrap:wrap; }

/* ─── FORM ELEMENTS ─── */
.form-grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
.form-group { display:flex; flex-direction:column; gap:5px; }
.form-group.full { grid-column: 1/-1; }
.form-label { font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; }

input[type="text"], input[type="number"], select, textarea {
    padding: 9px 12px; border-radius:var(--radius-sm);
    border:1px solid var(--border); background:var(--bg);
    color:var(--text); font-size:14px; font-family:var(--font);
    transition: border-color .15s;
    width:100%;
}
input:focus, select:focus, textarea:focus {
    outline:none; border-color:var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
}
textarea { resize:vertical; min-height:80px; font-family:var(--mono); font-size:13px; }

/* ─── TABLE ─── */
.table-wrap { overflow-x:auto; border-radius:var(--radius); border:1px solid var(--border); }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { background:var(--surface-active); padding:10px 14px; text-align:left; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px; color:var(--text-muted); white-space:nowrap; }
td { padding:10px 14px; border-top:1px solid var(--border); white-space:nowrap; }
tr:hover td { background:var(--surface-hover); }
.clickable-row { cursor:pointer; }

/* ─── BADGES ─── */
.badge {
    display:inline-flex; align-items:center; padding:3px 10px;
    border-radius:20px; font-size:11px; font-weight:600;
}
.badge-success { background:var(--success-bg); color:var(--success); }
.badge-warning { background:var(--warning-bg); color:var(--warning); }
.badge-danger  { background:var(--danger-bg);  color:var(--danger); }
.badge-info    { background:var(--accent-glow); color:var(--accent); }

/* ─── SCANNER ─── */
.scanner-container {
    border:2px dashed var(--border-light);
    border-radius:var(--radius); padding:24px;
    text-align:center; margin-bottom:16px;
    min-height:280px; display:flex; flex-direction:column;
    align-items:center; justify-content:center;
}
.scanner-container.active { border-color:var(--accent); background:var(--accent-glow); }
#qr-reader { width:100%; max-width:400px; margin:0 auto; }
#qr-reader video { border-radius:var(--radius); }

.scan-input-wrap {
    display:flex; gap:8px; max-width:500px; margin:0 auto;
}
.scan-input-wrap input { flex:1; font-family:var(--mono); font-size:18px; text-align:center; padding:14px; letter-spacing:2px; }

/* ─── PLATE DETAIL PANEL ─── */
.plate-detail { display:grid; grid-template-columns:2fr 1fr; gap:20px; }
.serial-list {
    background:var(--bg); border:1px solid var(--border);
    border-radius:var(--radius-sm); padding:12px;
    max-height:300px; overflow-y:auto;
    font-family:var(--mono); font-size:13px; line-height:1.8;
}
.serial-list .serial-item {
    padding:2px 8px; border-radius:4px;
}
.serial-list .serial-item:hover { background:var(--surface-hover); }

/* ─── TOAST NOTIFICATIONS ─── */
.toast-container { position:fixed; top:70px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px; }
.toast {
    padding:12px 20px; border-radius:var(--radius-sm);
    font-size:13px; font-weight:500;
    animation: slideIn .25s ease; min-width:280px;
    display:flex; align-items:center; gap:8px;
    box-shadow: var(--shadow);
}
.toast-success { background:#f0fdf4; color:#166534; border:1px solid #86efac; }
.toast-error   { background:#fef2f2; color:#991b1b; border:1px solid #fca5a5; }
.toast-info    { background:#eff6ff; color:#1e40af; border:1px solid #93c5fd; }

@keyframes slideIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }

/* ─── MODAL ─── */
.modal-overlay {
    display:none; position:fixed; inset:0; z-index:500;
    background:rgba(0,0,0,.3); backdrop-filter:blur(4px);
    align-items:center; justify-content:center;
}
.modal-overlay.open { display:flex; }
.modal {
    background:var(--surface); border:1px solid var(--border);
    border-radius:var(--radius); padding:24px;
    width:90%; max-width:600px; max-height:85vh; overflow-y:auto;
    box-shadow: var(--shadow);
}
.modal-title { font-size:18px; font-weight:700; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; }
.modal-close { cursor:pointer; color:var(--text-muted); background:none; border:none; font-size:20px; }

/* ─── LOADING SPINNER ─── */
.spinner { display:inline-block; width:18px; height:18px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin .6s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

/* ─── HAMBURGER BUTTON ─── */
.hamburger {
    display:none; background:none; border:none; cursor:pointer;
    padding:6px; color:var(--text); border-radius:var(--radius-sm);
}
.hamburger:hover { background:var(--surface-hover); }
.hamburger svg { display:block; }

/* ─── MOBILE OVERLAY ─── */
.sidebar-overlay {
    display:none; position:fixed; inset:0; z-index:199;
    background:rgba(0,0,0,.3); backdrop-filter:blur(2px);
}
.sidebar-overlay.open { display:block; }

/* ─── RESPONSIVE ─── */
@media (max-width:768px) {
    .hamburger { display:block; }
    .sidebar {
        display:none; position:fixed; top:56px; left:0; bottom:0;
        z-index:200; width:240px;
        box-shadow: 4px 0 24px rgba(0,0,0,.15);
    }
    .sidebar.open { display:flex; }
    .main { padding:16px; }
    .main:has(#view-warehouse.active), .main:has(#view-printlabel.active) { padding:0; }
    .form-grid { grid-template-columns:1fr; }
    .plate-detail { grid-template-columns:1fr; }
    .stats-row { grid-template-columns:1fr 1fr; }
    #view-warehouse iframe, #view-printlabel iframe { height: calc(100vh - 56px); }
}
</style>
</head>
<body>

<!-- ═══ TOP BAR ═══ -->
<div class="topbar">
    <div style="display:flex;align-items:center;gap:8px;">
        <button class="hamburger" id="hamburger-btn" onclick="toggleMobileMenu()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div class="topbar-brand">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>
            TelQuest Warehouse
        </div>
    </div>
    <div class="topbar-user">Warehouse Management</div>
</div>

<!-- ═══ LAYOUT ═══ -->
<div class="layout">

<!-- ═══ MOBILE OVERLAY ═══ -->
<div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleMobileMenu()"></div>

<!-- ═══ SIDEBAR ═══ -->
<nav class="sidebar">
    <div class="nav-item active" data-view="warehouse">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
        Assistant
    </div>
    <div class="nav-item" data-view="printlabel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print Label
    </div>
    <div class="nav-group">
        <div class="nav-group-toggle" onclick="toggleNavGroup(this)">
            <div style="display:flex;align-items:center;gap:10px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;flex-shrink:0;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>
                TQ License Plates
            </div>
            <svg class="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;transition:transform .2s;"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="nav-group-items">
            <div class="nav-item nav-sub" data-view="dashboard">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                Dashboard
            </div>
            <div class="nav-item nav-sub" data-view="scan">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                Scan &amp; Lookup
            </div>
            <div class="nav-item nav-sub" data-view="create">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                Create Plate
            </div>
            <div class="nav-item nav-sub" data-view="search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Search &amp; List
            </div>
            <div class="nav-item nav-sub" data-view="transfer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                Bin Transfer
            </div>
            <div class="nav-item nav-sub" data-view="fulfill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Fulfill SO
            </div>
            <div class="nav-item nav-sub" data-view="poimport">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                Create from PO
            </div>
        </div>
    </div>
</nav>

<!-- ═══ MAIN CONTENT ═══ -->
<div class="main">

<!-- ═══════ WAREHOUSE ASSISTANT VIEW ═══════ -->
<div class="view active" id="view-warehouse">
    <iframe id="wh-iframe" src="${apiUrl}&action=warehouse" style="width:100%;height:calc(100vh - 56px);border:none;display:block;"></iframe>
</div>

<!-- ═══════ PRINT LABEL VIEW ═══════ -->
<div class="view" id="view-printlabel">
    <iframe id="pl-iframe" src="${apiUrl}&action=printlabel" style="width:100%;height:calc(100vh - 56px);border:none;display:block;"></iframe>
</div>

<!-- ═══════ DASHBOARD VIEW ═══════ -->
<div class="view" id="view-dashboard">
    <div class="page-header">
        <div><div class="page-title">Dashboard</div><div class="page-subtitle">License plate overview</div></div>
    </div>
    <div class="stats-row" id="dashboard-stats">
        <div class="stat-card"><div class="label">Total Plates</div><div class="value" id="stat-total">—</div></div>
        <div class="stat-card"><div class="label">Total Serials</div><div class="value" id="stat-serials">—</div></div>
        <div class="stat-card"><div class="label">Active</div><div class="value" id="stat-active" style="color:var(--success)">—</div></div>
    </div>
    <div class="card">
        <div class="card-title">Recent License Plates</div>
        <div class="table-wrap"><table>
            <thead><tr><th>Plate ID</th><th>Item</th><th>Bin</th><th>Serials</th><th>Status</th><th>Created</th></tr></thead>
            <tbody id="dashboard-table"><tr><td colspan="6" style="text-align:center;color:var(--text-dim)">Loading…</td></tr></tbody>
        </table></div>
    </div>
</div>

<!-- ═══════ SCAN & LOOKUP VIEW ═══════ -->
<div class="view" id="view-scan">
    <div class="page-header">
        <div><div class="page-title">Scan &amp; Lookup</div><div class="page-subtitle">Scan a QR code or type a license plate ID</div></div>
    </div>
    <div class="card">
        <div class="scan-input-wrap" style="margin-bottom:20px;">
            <input type="text" id="scan-input" placeholder="Scan or type plate ID…" autofocus>
            <button class="btn btn-primary" onclick="scanLookup()">Lookup</button>
        </div>
        <div style="text-align:center; margin-bottom:12px;">
            <button class="btn btn-sm" onclick="toggleCamera()" id="btn-camera">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Open Camera Scanner
            </button>
        </div>
        <div id="qr-reader" style="display:none;"></div>
    </div>
    <div id="scan-result" style="display:none;"></div>
</div>

<!-- ═══════ CREATE / EDIT PLATE VIEW ═══════ -->
<div class="view" id="view-create">
    <div class="page-header">
        <div><div class="page-title" id="create-title">Create License Plate</div><div class="page-subtitle" id="create-subtitle">Fill in the details below</div></div>
    </div>
    <div class="card">
        <form id="plate-form" onsubmit="return savePlateForm(event)">
            <input type="hidden" id="form-id">
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label">Plate ID / Name *</label>
                    <input type="text" id="form-name" required placeholder="e.g. LP-000123">
                </div>
                <div class="form-group">
                    <label class="form-label">Location *</label>
                    <select id="form-location" required></select>
                </div>
                <div class="form-group">
                    <label class="form-label">Item *</label>
                    <input type="text" id="form-item-search" placeholder="Type to search items…" autocomplete="off">
                    <input type="hidden" id="form-item-id">
                    <div id="form-item-dropdown" style="position:relative;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">Bin</label>
                    <select id="form-bin"></select>
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select id="form-status"></select>
                </div>
                <div class="form-group">
                    <label class="form-label">Inventory Status</label>
                    <select id="form-sc">
                        <option value="">— Select —</option>
                    </select>
                </div>
                <div class="form-group full">
                    <label class="form-label">Serial Numbers (one per line)</label>
                    <textarea id="form-serials" rows="6" placeholder="Enter serial numbers, one per line"></textarea>
                </div>
                <div class="form-group full">
                    <label class="form-label">Notes</label>
                    <textarea id="form-notes" rows="3" placeholder="Optional notes…" style="font-family:var(--font);"></textarea>
                </div>
            </div>
            <div style="margin-top:20px;" class="btn-group">
                <button type="submit" class="btn btn-primary">Save License Plate</button>
                <button type="button" class="btn" onclick="resetPlateForm()">Clear</button>
            </div>
        </form>
    </div>
</div>

<!-- ═══════ SEARCH & LIST VIEW ═══════ -->
<div class="view" id="view-search">
    <div class="page-header">
        <div><div class="page-title">Search License Plates</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
        <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr 1fr auto; align-items:end;">
            <div class="form-group">
                <label class="form-label">Keyword</label>
                <input type="text" id="search-keyword" placeholder="Plate ID, serial…">
            </div>
            <div class="form-group">
                <label class="form-label">Location</label>
                <select id="search-location"><option value="">All</option></select>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select id="search-status"><option value="">All</option></select>
            </div>
            <div class="form-group">
                <label class="form-label">Bin</label>
                <select id="search-bin"><option value="">All</option></select>
            </div>
            <button class="btn btn-primary" onclick="doSearch()" style="height:38px;">Search</button>
        </div>
    </div>
    <div class="card">
        <div class="table-wrap"><table>
            <thead><tr><th>Plate ID</th><th>Item</th><th>Location</th><th>Bin</th><th>Serials</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="search-results"><tr><td colspan="7" style="text-align:center;color:var(--text-dim)">Use the filters above to search</td></tr></tbody>
        </table></div>
        <div id="search-pagination" style="margin-top:12px; display:flex; gap:8px; justify-content:center;"></div>
    </div>
</div>

<!-- ═══════ BIN TRANSFER VIEW ═══════ -->
<div class="view" id="view-transfer">
    <div class="page-header">
        <div><div class="page-title">Bin Transfer</div><div class="page-subtitle">Scan a plate and move all serials to a new bin</div></div>
    </div>
    <div class="card">
        <div class="form-grid" style="grid-template-columns:1fr auto; align-items:end; margin-bottom:20px;">
            <div class="form-group">
                <label class="form-label">Scan / Enter Plate ID</label>
                <input type="text" id="transfer-plate-input" placeholder="Scan plate QR code…">
            </div>
            <button class="btn btn-primary" onclick="loadTransferPlate()" style="height:38px;">Load Plate</button>
        </div>
    </div>
    <div id="transfer-detail" style="display:none;">
        <div class="card">
            <div class="card-title">Plate Details</div>
            <div id="transfer-plate-info"></div>
        </div>
        <div class="card">
            <div class="card-title">Transfer To</div>
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label">Destination Bin *</label>
                    <select id="transfer-dest-bin" required></select>
                </div>
                <div class="form-group">
                    <label class="form-label">Inventory Status *</label>
                    <select id="transfer-dest-status" required></select>
                </div>
            </div>
            <div style="margin-top:16px;">
                <button class="btn btn-success" onclick="executeBinTransfer()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    Execute Bin Transfer
                </button>
            </div>
        </div>
    </div>
</div>

<!-- ═══════ FULFILL SO VIEW ═══════ -->
<div class="view" id="view-fulfill">
    <div class="page-header">
        <div><div class="page-title">Fulfill Sales Order</div><div class="page-subtitle">Scan a plate to fulfill an SO with its serials</div></div>
    </div>
    <div class="card">
        <div class="form-grid" style="align-items:end;">
            <div class="form-group">
                <label class="form-label">Scan / Enter Plate ID</label>
                <input type="text" id="fulfill-plate-input" placeholder="Scan plate QR code…">
            </div>
            <div class="form-group">
                <label class="form-label">Sales Order Number</label>
                <input type="text" id="fulfill-so-input" placeholder="e.g. SO123456">
            </div>
        </div>
        <div class="btn-group" style="margin-top:16px;">
            <button class="btn btn-primary" onclick="loadFulfillData()">Load</button>
        </div>
    </div>
    <div id="fulfill-detail" style="display:none;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px;">
            <div class="card">
                <div class="card-title">License Plate</div>
                <div id="fulfill-plate-info"></div>
            </div>
            <div class="card">
                <div class="card-title">Sales Order</div>
                <div id="fulfill-so-info"></div>
            </div>
        </div>
        <div class="card" style="margin-top:16px;">
            <button class="btn btn-success" onclick="executeFulfillment()" style="width:100%; justify-content:center; padding:14px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Fulfill Sales Order
            </button>
        </div>
    </div>
</div>

<!-- ═══════ CREATE FROM PO VIEW ═══════ -->
<div class="view" id="view-poimport">
    <div class="page-header">
        <div><div class="page-title">Create from PO</div><div class="page-subtitle">Create a license plate from serial numbers received on a purchase order</div></div>
    </div>
    <div class="card">
        <div class="card-title">Step 1: Lookup Serials</div>
        <div class="form-grid" style="align-items:end;">
            <div class="form-group">
                <label class="form-label">Item *</label>
                <input type="text" id="po-item-search" placeholder="Type to search items…" autocomplete="off">
                <input type="hidden" id="po-item-id">
                <div id="po-item-dropdown" style="position:relative;"></div>
            </div>
            <div class="form-group">
                <label class="form-label">PO Number *</label>
                <input type="text" id="po-number-input" placeholder="e.g. PO123456">
            </div>
        </div>
        <div style="margin-top:16px;">
            <button class="btn btn-primary" onclick="lookupPOSerials()">Lookup Serials</button>
        </div>
    </div>
    <div id="po-serials-preview" style="display:none;">
        <div class="card">
            <div class="card-title">Serials Found: <span id="po-serial-count" class="badge badge-success">0</span></div>
            <div class="serial-list" id="po-serial-list"></div>
        </div>
        <div class="card">
            <div class="card-title">Step 2: Plate Details</div>
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label">Location *</label>
                    <select id="po-location" required></select>
                </div>
                <div class="form-group">
                    <label class="form-label">Bin</label>
                    <select id="po-bin"></select>
                </div>
            </div>
            <div style="margin-top:16px;">
                <button class="btn btn-success" onclick="createPlateFromPO()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    Create License Plate
                </button>
            </div>
        </div>
    </div>
</div>

</div><!-- /main -->
</div><!-- /layout -->

<!-- ═══ TOAST CONTAINER ═══ -->
<div class="toast-container" id="toasts"></div>

<!-- ═══ MODAL (plate detail) ═══ -->
<div class="modal-overlay" id="plate-modal">
    <div class="modal">
        <div class="modal-title">
            <span id="modal-plate-title">License Plate</span>
            <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <div id="modal-plate-body"></div>
    </div>
</div>

<script>
// ═══════════════════════════════════════════════════════════
//  APP STATE & CONFIG
// ═══════════════════════════════════════════════════════════
const API = '${apiUrl}';
let cameraScanner = null;
let cameraActive = false;
let currentTransferPlate = null;
let currentFulfillPlate = null;
let currentFulfillSO = null;

// Dropdown data caches
let _locations = null;
let _statuses = null;
let _bins = {};

// ═══════════════════════════════════════════════════════════
//  MOBILE MENU
// ═══════════════════════════════════════════════════════════
function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
}

function toggleNavGroup(toggleEl) {
    const group = toggleEl.closest('.nav-group');
    group.classList.toggle('open');
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════
let dashboardLoaded = false;
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('view-' + el.dataset.view).classList.add('active');

        // Adjust main padding for iframe vs regular views
        const main = document.querySelector('.main');
        if (el.dataset.view === 'warehouse' || el.dataset.view === 'printlabel') { main.style.padding = '0'; }
        else { main.style.padding = ''; }

        // Lazy-load dashboard on first visit
        if (el.dataset.view === 'dashboard' && !dashboardLoaded) {
            dashboardLoaded = true;
            loadDashboard();
        }

        // Close mobile menu on nav
        document.querySelector('.sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('open');

        // Auto-focus scan inputs
        if (el.dataset.view === 'scan') document.getElementById('scan-input').focus();
        if (el.dataset.view === 'transfer') document.getElementById('transfer-plate-input').focus();
    });
});

// ═══════════════════════════════════════════════════════════
//  API HELPERS
// ═══════════════════════════════════════════════════════════
async function apiGet(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(API + '&' + qs);
    return res.json();
}

async function apiPost(action, body) {
    const res = await fetch(API + '&action=' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
function toast(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = 'toast toast-' + type;
    div.innerHTML = msg;
    document.getElementById('toasts').appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════
//  LOAD DROPDOWN OPTIONS
// ═══════════════════════════════════════════════════════════
async function loadLocations() {
    if (_locations) return _locations;
    const data = await apiGet('getLocations');
    _locations = data.results || [];
    return _locations;
}

async function loadStatuses() {
    if (_statuses) return _statuses;
    const data = await apiGet('getStatuses');
    _statuses = data.results || [];
    return _statuses;
}

async function loadBins(locationId) {
    if (!locationId) return [];
    if (_bins[locationId]) return _bins[locationId];
    const data = await apiGet('getBins', { location: locationId });
    _bins[locationId] = data.results || [];
    return _bins[locationId];
}

function populateSelect(selectEl, items, includeEmpty = true) {
    const val = selectEl.value;
    selectEl.innerHTML = '';
    if (includeEmpty) {
        const opt = document.createElement('option');
        opt.value = ''; opt.textContent = '— Select —';
        selectEl.appendChild(opt);
    }
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id; opt.textContent = item.name;
        selectEl.appendChild(opt);
    });
    selectEl.value = val;
}

// ═══════════════════════════════════════════════════════════
//  ITEM SEARCH AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════
let itemSearchTimeout;
document.getElementById('form-item-search').addEventListener('input', function() {
    clearTimeout(itemSearchTimeout);
    const q = this.value.trim();
    if (q.length < 2) { hideItemDropdown(); return; }
    itemSearchTimeout = setTimeout(() => searchItems(q), 300);
});

async function searchItems(q) {
    const data = await apiGet('getItems', { q });
    const dd = document.getElementById('form-item-dropdown');
    if (!data.results || !data.results.length) { hideItemDropdown(); return; }
    dd.innerHTML = '<div style="position:absolute;top:0;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);z-index:50;max-height:200px;overflow-y:auto;box-shadow:var(--shadow);">' +
        data.results.map(r => '<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);" onmouseover="this.style.background=\\'var(--surface-hover)\\'" onmouseout="this.style.background=\\'transparent\\'" onclick="selectItem(' + r.id + ',\\'' + escHtml(r.name) + '\\')">' + escHtml(r.name) + (r.display ? ' — ' + escHtml(r.display) : '') + '</div>').join('') +
        '</div>';
}

function selectItem(id, name) {
    document.getElementById('form-item-id').value = id;
    document.getElementById('form-item-search').value = name;
    hideItemDropdown();
}

function hideItemDropdown() {
    document.getElementById('form-item-dropdown').innerHTML = '';
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
    const data = await apiGet('searchPlates', {});
    if (!data.success) return;

    document.getElementById('stat-total').textContent = data.total;
    let totalSerials = 0;
    data.results.forEach(p => totalSerials += p.serialCount);
    document.getElementById('stat-serials').textContent = totalSerials;
    document.getElementById('stat-active').textContent = data.results.filter(p => p.statusId !== '3').length; // rough

    const tbody = document.getElementById('dashboard-table');
    if (!data.results.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim)">No plates found</td></tr>';
        return;
    }
    tbody.innerHTML = data.results.slice(0, 15).map(p => 
        '<tr class="clickable-row" onclick="viewPlateModal(' + p.id + ')">' +
        '<td style="font-family:var(--mono);font-weight:600;">' + escHtml(p.name) + '</td>' +
        '<td>' + escHtml(p.item || '—') + '</td>' +
        '<td>' + escHtml(p.bin || '—') + '</td>' +
        '<td><span class="badge badge-info">' + p.serialCount + '</span></td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td style="color:var(--text-muted);font-size:12px;">' + escHtml(p.created || '') + '</td>' +
        '</tr>'
    ).join('');
}

// ═══════════════════════════════════════════════════════════
//  SCAN & LOOKUP
// ═══════════════════════════════════════════════════════════
document.getElementById('scan-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); scanLookup(); }
});

async function scanLookup() {
    const name = document.getElementById('scan-input').value.trim();
    if (!name) return;
    const data = await apiGet('getPlateByName', { name });
    const container = document.getElementById('scan-result');
    container.style.display = 'block';
    if (!data.success) {
        container.innerHTML = '<div class="card" style="border-color:var(--danger);"><p style="color:var(--danger);">' + escHtml(data.message) + '</p></div>';
        return;
    }
    container.innerHTML = '<div class="card">' + renderPlateDetail(data.plate) +
        '<div class="btn-group" style="margin-top:16px;">' +
        '<button class="btn" onclick="printPlateQR(' + data.plate.id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print QR</button>' +
        '<button class="btn btn-primary" onclick="editPlate(' + data.plate.id + ')">Edit</button>' +
        '</div></div>';
}

function toggleCamera() {
    const el = document.getElementById('qr-reader');
    if (cameraActive) {
        if (cameraScanner) cameraScanner.stop().then(() => { cameraScanner.clear(); });
        el.style.display = 'none';
        cameraActive = false;
        document.getElementById('btn-camera').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Open Camera Scanner';
        return;
    }
    el.style.display = 'block';
    cameraActive = true;
    document.getElementById('btn-camera').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Close Camera';
    cameraScanner = new Html5Qrcode('qr-reader');
    cameraScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            document.getElementById('scan-input').value = decodedText;
            scanLookup();
            cameraScanner.stop();
            el.style.display = 'none';
            cameraActive = false;
        },
        () => {}
    ).catch(err => toast('Camera error: ' + err, 'error'));
}

// ═══════════════════════════════════════════════════════════
//  CREATE / EDIT PLATE FORM
// ═══════════════════════════════════════════════════════════
async function initCreateForm() {
    const locs = await loadLocations();
    populateSelect(document.getElementById('form-location'), locs);

    const stats = await loadStatuses();
    populateSelect(document.getElementById('form-status'), stats);

    // Load inventory status codes
    const scData = await apiGet('getStatusCodes');
    if (scData.results) populateSelect(document.getElementById('form-sc'), scData.results);

    // Bin refresh on location change
    document.getElementById('form-location').addEventListener('change', async function() {
        const bins = await loadBins(this.value);
        populateSelect(document.getElementById('form-bin'), bins);
    });

    // Auto-generate plate ID on first load
    if (!document.getElementById('form-id').value) {
        document.getElementById('form-name').value = generatePlateId();
    }
}

async function savePlateForm(e) {
    e.preventDefault();
    const body = {
        id: document.getElementById('form-id').value || null,
        name: document.getElementById('form-name').value,
        locationId: document.getElementById('form-location').value,
        itemId: document.getElementById('form-item-id').value,
        binId: document.getElementById('form-bin').value,
        statusId: document.getElementById('form-status').value,
        statusCodeId: document.getElementById('form-sc').value,
        serials: document.getElementById('form-serials').value,
        notes: document.getElementById('form-notes').value
    };
    if (!body.itemId) { toast('Please select an item.', 'error'); return false; }
    const data = await apiPost('savePlate', body);
    if (data.success) {
        toast(data.message, 'success');
        if (!body.id) resetPlateForm();
    } else {
        toast(data.message || 'Save failed.', 'error');
    }
    return false;
}

function resetPlateForm() {
    document.getElementById('form-id').value = '';
    document.getElementById('plate-form').reset();
    document.getElementById('form-item-id').value = '';
    document.getElementById('form-item-search').value = '';
    document.getElementById('create-title').textContent = 'Create License Plate';
    document.getElementById('create-subtitle').textContent = 'Fill in the details below';
    // Auto-generate a random 9-digit plate ID
    document.getElementById('form-name').value = generatePlateId();
}

function generatePlateId() {
    const min = 100000000; // 9 digits min
    const max = 999999999; // 9 digits max
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

async function editPlate(id) {
    const data = await apiGet('getPlate', { id });
    if (!data.success) { toast('Failed to load plate.', 'error'); return; }
    const p = data.plate;

    // Navigate to create view
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelector('[data-view="create"]').classList.add('active');
    document.getElementById('view-create').classList.add('active');

    document.getElementById('create-title').textContent = 'Edit License Plate';
    document.getElementById('create-subtitle').textContent = 'Editing: ' + p.name;

    document.getElementById('form-id').value = p.id;
    document.getElementById('form-name').value = p.name;
    document.getElementById('form-location').value = p.locationId || '';

    // Load bins for this location then set bin
    if (p.locationId) {
        const bins = await loadBins(p.locationId);
        populateSelect(document.getElementById('form-bin'), bins);
    }
    document.getElementById('form-bin').value = p.binId || '';

    document.getElementById('form-item-search').value = p.item || '';
    document.getElementById('form-item-id').value = p.itemId || '';
    document.getElementById('form-status').value = p.statusId || '';
    document.getElementById('form-sc').value = p.statusCodeId || '';
    document.getElementById('form-serials').value = p.serials || '';
    document.getElementById('form-notes').value = p.notes || '';

    closeModal();
}

// ═══════════════════════════════════════════════════════════
//  SEARCH & LIST
// ═══════════════════════════════════════════════════════════
async function initSearchForm() {
    const locs = await loadLocations();
    populateSelect(document.getElementById('search-location'), locs);
    const stats = await loadStatuses();
    populateSelect(document.getElementById('search-status'), stats);
}

document.getElementById('search-keyword').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
});

async function doSearch(page = 0) {
    const params = {
        keyword: document.getElementById('search-keyword').value,
        location: document.getElementById('search-location').value,
        status: document.getElementById('search-status').value,
        page: page
    };
    const data = await apiGet('searchPlates', params);
    const tbody = document.getElementById('search-results');
    if (!data.success || !data.results.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim)">No results found</td></tr>';
        document.getElementById('search-pagination').innerHTML = '';
        return;
    }
    tbody.innerHTML = data.results.map(p =>
        '<tr>' +
        '<td style="font-family:var(--mono);font-weight:600;">' + escHtml(p.name) + '</td>' +
        '<td>' + escHtml(p.item || '—') + '</td>' +
        '<td>' + escHtml(p.location || '—') + '</td>' +
        '<td>' + escHtml(p.bin || '—') + '</td>' +
        '<td><span class="badge badge-info">' + p.serialCount + '</span></td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td><div class="btn-group">' +
            '<button class="btn btn-sm" onclick="viewPlateModal(' + p.id + ')">View</button>' +
            '<button class="btn btn-sm" onclick="editPlate(' + p.id + ')">Edit</button>' +
            '<button class="btn btn-sm" onclick="printPlateQR(' + p.id + ')" title="Print QR"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>' +
        '</div></td>' +
        '</tr>'
    ).join('');

    // Pagination
    const pagDiv = document.getElementById('search-pagination');
    if (data.pageCount > 1) {
        let html = '';
        for (let i = 0; i < data.pageCount; i++) {
            html += '<button class="btn btn-sm ' + (i === page ? 'btn-primary' : '') + '" onclick="doSearch(' + i + ')">' + (i+1) + '</button>';
        }
        pagDiv.innerHTML = html;
    } else {
        pagDiv.innerHTML = '';
    }
}

// ═══════════════════════════════════════════════════════════
//  BIN TRANSFER
// ═══════════════════════════════════════════════════════════
document.getElementById('transfer-plate-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); loadTransferPlate(); }
});

async function loadTransferPlate() {
    const name = document.getElementById('transfer-plate-input').value.trim();
    if (!name) return;
    const data = await apiGet('getPlateByName', { name });
    if (!data.success) { toast(data.message, 'error'); return; }
    currentTransferPlate = data.plate;

    document.getElementById('transfer-plate-info').innerHTML = renderPlateInfoCompact(data.plate);
    document.getElementById('transfer-detail').style.display = 'block';

    // Load bins for transfer destination
    if (data.plate.locationId) {
        const bins = await loadBins(data.plate.locationId);
        populateSelect(document.getElementById('transfer-dest-bin'), bins);
    }

    // Load inventory statuses for transfer
    const scData = await apiGet('getStatusCodes');
    if (scData.results) populateSelect(document.getElementById('transfer-dest-status'), scData.results);
}

async function executeBinTransfer() {
    if (!currentTransferPlate) { toast('No plate loaded.', 'error'); return; }
    const destBin = document.getElementById('transfer-dest-bin').value;
    const destStatus = document.getElementById('transfer-dest-status').value;
    if (!destBin) { toast('Please select a destination bin.', 'error'); return; }
    if (!destStatus) { toast('Please select an inventory status.', 'error'); return; }
    if (destBin === currentTransferPlate.binId) { toast('Destination bin is the same as current bin.', 'error'); return; }

    toast('Processing bin transfer…', 'info');
    const data = await apiPost('binTransfer', {
        plateId: currentTransferPlate.id,
        destinationBinId: destBin,
        statusId: destStatus
    });
    if (data.success) {
        toast(data.message, 'success');
        currentTransferPlate = null;
        document.getElementById('transfer-detail').style.display = 'none';
        document.getElementById('transfer-plate-input').value = '';
        document.getElementById('transfer-plate-input').focus();
    } else {
        toast(data.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════
//  FULFILL SALES ORDER
// ═══════════════════════════════════════════════════════════
document.getElementById('fulfill-plate-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('fulfill-so-input').focus(); }
});
document.getElementById('fulfill-so-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); loadFulfillData(); }
});

async function loadFulfillData() {
    const plateName = document.getElementById('fulfill-plate-input').value.trim();
    const soNum = document.getElementById('fulfill-so-input').value.trim();
    if (!plateName || !soNum) { toast('Enter both plate ID and SO number.', 'error'); return; }

    // Load plate
    const plateData = await apiGet('getPlateByName', { name: plateName });
    if (!plateData.success) { toast(plateData.message, 'error'); return; }
    currentFulfillPlate = plateData.plate;
    document.getElementById('fulfill-plate-info').innerHTML = renderPlateInfoCompact(plateData.plate);

    // Load SO
    const soData = await apiGet('lookupSO', { tranid: soNum });
    if (!soData.success) { toast(soData.message, 'error'); return; }
    currentFulfillSO = soData.salesOrder;
    document.getElementById('fulfill-so-info').innerHTML =
        '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:13px;">' +
        '<span style="color:var(--text-muted)">SO#</span><span style="font-weight:600;">' + escHtml(soData.salesOrder.tranid) + '</span>' +
        '<span style="color:var(--text-muted)">Customer</span><span>' + escHtml(soData.salesOrder.customer) + '</span>' +
        '<span style="color:var(--text-muted)">Date</span><span>' + escHtml(soData.salesOrder.date) + '</span>' +
        '<span style="color:var(--text-muted)">Status</span><span>' + escHtml(soData.salesOrder.status) + '</span>' +
        '<span style="color:var(--text-muted)">Amount</span><span>$' + escHtml(soData.salesOrder.amount) + '</span>' +
        '</div>' +
        '<div style="margin-top:12px;"><strong style="font-size:12px;color:var(--text-muted);">LINE ITEMS</strong>' +
        '<div style="margin-top:6px;font-size:13px;">' +
        soData.salesOrder.items.map(i =>
            '<div style="padding:4px 0;border-bottom:1px solid var(--border);">' + escHtml(i.item) + ' — Qty: ' + i.qty + ' | Remaining: ' + (i.remaining || 0) + '</div>'
        ).join('') +
        '</div></div>';

    document.getElementById('fulfill-detail').style.display = 'block';
}

async function executeFulfillment() {
    if (!currentFulfillPlate || !currentFulfillSO) { toast('Load plate and SO first.', 'error'); return; }
    toast('Creating item fulfillment…', 'info');
    const data = await apiPost('fulfillSO', {
        plateId: currentFulfillPlate.id,
        salesOrderId: currentFulfillSO.id
    });
    if (data.success) {
        toast(data.message, 'success');
        currentFulfillPlate = null;
        currentFulfillSO = null;
        document.getElementById('fulfill-detail').style.display = 'none';
        document.getElementById('fulfill-plate-input').value = '';
        document.getElementById('fulfill-so-input').value = '';
        document.getElementById('fulfill-plate-input').focus();
    } else {
        toast(data.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════
//  PLATE DETAIL MODAL
// ═══════════════════════════════════════════════════════════
async function viewPlateModal(id) {
    const data = await apiGet('getPlate', { id });
    if (!data.success) { toast('Failed to load plate.', 'error'); return; }
    document.getElementById('modal-plate-title').textContent = 'Plate: ' + data.plate.name;
    document.getElementById('modal-plate-body').innerHTML = renderPlateDetail(data.plate) +
        '<div class="btn-group" style="margin-top:16px;">' +
        '<button class="btn btn-primary" onclick="editPlate(' + id + ')">Edit</button>' +
        '<button class="btn" onclick="printPlateQR(' + id + ')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print QR</button>' +
        '<button class="btn btn-danger btn-sm" onclick="if(confirm(\\'Deactivate this plate?\\')) deactivatePlate(' + id + ')">Deactivate</button>' +
        '</div>';
    document.getElementById('plate-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('plate-modal').classList.remove('open');
}
document.getElementById('plate-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

async function deactivatePlate(id) {
    const data = await apiGet('deletePlate', { id });
    if (data.success) { toast(data.message, 'success'); closeModal(); loadDashboard(); }
    else toast(data.message, 'error');
}

// ═══════════════════════════════════════════════════════════
//  PRINT QR CODE
// ═══════════════════════════════════════════════════════════
async function printPlateQR(id) {
    const data = await apiGet('getPlate', { id });
    if (!data.success) { toast('Failed to load plate.', 'error'); return; }
    const p = data.plate;
    const serialList = p.serialList || [];

    // Generate QR code as data URL
    const qrDataUrl = await generateQRDataUrl(p.name, 200);

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    printWindow.document.write(\`<!DOCTYPE html>
<html>
<head>
<title>License Plate QR - \${escHtml(p.name)}</title>
<style>
    @page { size: auto; margin: 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:#1a1d27; padding:24px; }
    .print-header { text-align:center; border-bottom:2px solid #1a1d27; padding-bottom:16px; margin-bottom:20px; }
    .print-header h1 { font-size:22px; letter-spacing:1px; }
    .print-header .subtitle { font-size:12px; color:#666; margin-top:4px; }
    .qr-section { text-align:center; margin:24px 0; }
    .qr-section img { border:3px solid #1a1d27; padding:8px; border-radius:8px; }
    .plate-id { font-family:'Courier New',monospace; font-size:28px; font-weight:700; letter-spacing:3px; margin-top:12px; }
    .info-grid { display:grid; grid-template-columns:140px 1fr; gap:8px 16px; font-size:13px; margin:20px 0; border:1px solid #ddd; border-radius:8px; padding:16px; }
    .info-label { font-weight:600; color:#555; text-transform:uppercase; font-size:11px; letter-spacing:.5px; padding:4px 0; }
    .info-value { padding:4px 0; border-bottom:1px solid #eee; }
    .serial-section { margin-top:20px; }
    .serial-section h3 { font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#555; margin-bottom:8px; border-bottom:1px solid #ddd; padding-bottom:6px; }
    .serial-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px,1fr)); gap:4px 16px; font-family:'Courier New',monospace; font-size:12px; }
    .serial-item { padding:3px 6px; background:#f5f5f5; border-radius:3px; }
    .print-footer { text-align:center; margin-top:24px; padding-top:12px; border-top:1px solid #ddd; font-size:10px; color:#999; }
    .no-print { margin:20px auto; text-align:center; }
    .no-print button { padding:10px 32px; font-size:14px; font-weight:600; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer; margin:0 8px; }
    .no-print button.secondary { background:#e5e7eb; color:#333; }
    @media print { .no-print { display:none !important; } }
</style>
</head>
<body>
    <div class="no-print">
        <button onclick="window.print()">🖨️ Print</button>
        <button class="secondary" onclick="window.close()">Close</button>
    </div>

    <div class="print-header">
        <h1>LICENSE PLATE</h1>
        <div class="subtitle">TelQuest International — Warehouse Management</div>
    </div>

    <div class="qr-section">
        <img src="\${qrDataUrl}" width="200" height="200" alt="QR Code">
        <div class="plate-id">\${escHtml(p.name)}</div>
    </div>

    <div class="info-grid">
        <div class="info-label">Item</div>
        <div class="info-value">\${escHtml(p.item || '—')}</div>
        <div class="info-label">Location</div>
        <div class="info-value">\${escHtml(p.location || '—')}</div>
        <div class="info-label">Bin</div>
        <div class="info-value">\${escHtml(p.bin || '—')}</div>
        <div class="info-label">Status</div>
        <div class="info-value">\${escHtml(p.status || '—')}</div>
        <div class="info-label">Inv. Status</div>
        <div class="info-value">\${escHtml(p.statusCode || '—')}</div>
        <div class="info-label">Serial Count</div>
        <div class="info-value">\${serialList.length}</div>
        <div class="info-label">Notes</div>
        <div class="info-value">\${escHtml(p.notes || '—')}</div>
    </div>

    \${serialList.length ? \`
    <div class="serial-section">
        <h3>Serial Numbers (\${serialList.length})</h3>
        <div class="serial-grid">
            \${serialList.map(s => '<div class="serial-item">' + escHtml(s.trim()) + '</div>').join('')}
        </div>
    </div>\` : ''}

    <div class="print-footer">
        Printed on \${new Date().toLocaleString()} — License Plate Manager
    </div>
</body>
</html>\`);
    printWindow.document.close();
}

function generateQRDataUrl(text, size) {
    return new Promise((resolve) => {
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'fixed';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);

        new QRCode(tempDiv, {
            text: text,
            width: size,
            height: size,
            colorDark: '#1a1d27',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        // QRCode.js renders to a canvas, grab it
        setTimeout(() => {
            const canvas = tempDiv.querySelector('canvas');
            const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
            document.body.removeChild(tempDiv);
            resolve(dataUrl);
        }, 100);
    });
}

// ═══════════════════════════════════════════════════════════
//  RENDER HELPERS
// ═══════════════════════════════════════════════════════════
function renderPlateDetail(p) {
    return '<div class="plate-detail">' +
        '<div>' +
            '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:13px;">' +
            '<span style="color:var(--text-muted)">Plate ID</span><span style="font-family:var(--mono);font-weight:700;font-size:16px;">' + escHtml(p.name) + '</span>' +
            '<span style="color:var(--text-muted)">Item</span><span>' + escHtml(p.item || '—') + '</span>' +
            '<span style="color:var(--text-muted)">Location</span><span>' + escHtml(p.location || '—') + '</span>' +
            '<span style="color:var(--text-muted)">Bin</span><span>' + escHtml(p.bin || '—') + '</span>' +
            '<span style="color:var(--text-muted)">Status</span><span>' + statusBadge(p.status) + '</span>' +
            '<span style="color:var(--text-muted)">Inv. Status</span><span>' + escHtml(p.statusCode || '—') + '</span>' +
            '<span style="color:var(--text-muted)">Created By</span><span>' + escHtml(p.createdBy || '—') + '</span>' +
            '<span style="color:var(--text-muted)">Notes</span><span>' + escHtml(p.notes || '—') + '</span>' +
            '</div>' +
        '</div>' +
        '<div>' +
            '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">SERIAL NUMBERS (' + (p.serialList ? p.serialList.length : p.serialCount) + ')</div>' +
            '<div class="serial-list">' +
            (p.serialList || (p.serials ? p.serials.split(/\\r?\\n/).filter(s=>s.trim()) : [])).map(s => '<div class="serial-item">' + escHtml(s.trim()) + '</div>').join('') +
            ((!p.serialList || !p.serialList.length) ? '<span style="color:var(--text-dim)">No serials</span>' : '') +
            '</div>' +
        '</div>' +
    '</div>';
}

function renderPlateInfoCompact(p) {
    return '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px;">' +
        '<span style="color:var(--text-muted)">Plate</span><span style="font-family:var(--mono);font-weight:700;">' + escHtml(p.name) + '</span>' +
        '<span style="color:var(--text-muted)">Item</span><span>' + escHtml(p.item || '—') + '</span>' +
        '<span style="color:var(--text-muted)">Current Bin</span><span>' + escHtml(p.bin || '—') + '</span>' +
        '<span style="color:var(--text-muted)">Location</span><span>' + escHtml(p.location || '—') + '</span>' +
        '<span style="color:var(--text-muted)">Serials</span><span class="badge badge-info">' + (p.serialList ? p.serialList.length : p.serialCount) + ' serial(s)</span>' +
        '</div>';
}

function statusBadge(status) {
    if (!status) return '<span class="badge badge-info">—</span>';
    const s = status.toLowerCase();
    if (s.includes('active') || s.includes('open') || s.includes('available')) return '<span class="badge badge-success">' + escHtml(status) + '</span>';
    if (s.includes('closed') || s.includes('used') || s.includes('fulfilled')) return '<span class="badge badge-danger">' + escHtml(status) + '</span>';
    return '<span class="badge badge-warning">' + escHtml(status) + '</span>';
}

function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ═══════════════════════════════════════════════════════════
//  CREATE FROM PO
// ═══════════════════════════════════════════════════════════
let poItemSearchTimeout;
document.getElementById('po-item-search').addEventListener('input', function() {
    clearTimeout(poItemSearchTimeout);
    const q = this.value.trim();
    if (q.length < 2) { document.getElementById('po-item-dropdown').innerHTML = ''; return; }
    poItemSearchTimeout = setTimeout(() => searchPOItems(q), 300);
});

document.getElementById('po-number-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); lookupPOSerials(); }
});

async function searchPOItems(q) {
    const data = await apiGet('getItems', { q });
    const dd = document.getElementById('po-item-dropdown');
    if (!data.results || !data.results.length) { dd.innerHTML = ''; return; }
    dd.innerHTML = '<div style="position:absolute;top:0;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);z-index:50;max-height:200px;overflow-y:auto;box-shadow:var(--shadow);">' +
        data.results.map(r => '<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);" onmouseover="this.style.background=\\'var(--surface-hover)\\'" onmouseout="this.style.background=\\'transparent\\'" onclick="selectPOItem(' + r.id + ',\\'' + escHtml(r.name) + '\\')">' + escHtml(r.name) + (r.display ? ' — ' + escHtml(r.display) : '') + '</div>').join('') +
        '</div>';
}

function selectPOItem(id, name) {
    document.getElementById('po-item-id').value = id;
    document.getElementById('po-item-search').value = name;
    document.getElementById('po-item-dropdown').innerHTML = '';
}

async function lookupPOSerials() {
    const itemId = document.getElementById('po-item-id').value;
    const poNumber = document.getElementById('po-number-input').value.trim();
    if (!itemId) { toast('Please select an item.', 'error'); return; }
    if (!poNumber) { toast('Please enter a PO number.', 'error'); return; }

    toast('Looking up serials…', 'info');
    const data = await apiGet('lookupPOSerials', { itemId, poNumber });
    if (!data.success) { toast(data.message, 'error'); return; }

    document.getElementById('po-serial-count').textContent = data.serialCount;
    document.getElementById('po-serial-list').innerHTML = data.serialNumbers.map(s => '<div class="serial-item">' + escHtml(s) + '</div>').join('');
    document.getElementById('po-serials-preview').style.display = 'block';

    toast(data.serialCount + ' serial(s) found on PO ' + data.poTranId + '.', 'success');
}

async function initPOForm() {
    const locs = await loadLocations();
    populateSelect(document.getElementById('po-location'), locs);
    document.getElementById('po-location').addEventListener('change', async function() {
        const bins = await loadBins(this.value);
        populateSelect(document.getElementById('po-bin'), bins);
    });
}

async function createPlateFromPO() {
    const itemId = document.getElementById('po-item-id').value;
    const poNumber = document.getElementById('po-number-input').value.trim();
    const locationId = document.getElementById('po-location').value;
    const binId = document.getElementById('po-bin').value;

    if (!itemId || !poNumber) { toast('Item and PO number are required.', 'error'); return; }
    if (!locationId) { toast('Please select a location.', 'error'); return; }

    toast('Creating license plate…', 'info');
    const data = await apiPost('createFromPO', { itemId, poNumber, locationId, binId });
    if (data.success) {
        toast(data.message, 'success');
        document.getElementById('po-item-id').value = '';
        document.getElementById('po-item-search').value = '';
        document.getElementById('po-number-input').value = '';
        document.getElementById('po-serials-preview').style.display = 'none';
        loadDashboard();
    } else {
        toast(data.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
(async function init() {
    // Set initial padding for warehouse view (default)
    document.querySelector('.main').style.padding = '0';

    await Promise.all([initCreateForm(), initSearchForm(), initPOForm()]);
    // Dashboard loads lazily on first nav click (warehouse is default view)

    // Also populate search bin dropdown
    const locs = await loadLocations();
    if (locs.length) {
        const bins = await loadBins(locs[0].id);
        populateSelect(document.getElementById('search-bin'), bins);
    }
})();
<\/script>
</body>
</html>`;
    };

    return { onRequest };
});
