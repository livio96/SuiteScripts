/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * License Plate Management Suitelet
 * ----------------------------------
 * Full CRUD, QR/barcode scanning, bin transfers,
 * and sales order fulfillment for license plate records.
 * 
 * Record: customrecord_tq_license_plate
 */
define([
    'N/ui/serverWidget',
    'N/record',
    'N/search',
    'N/log',
    'N/runtime',
    'N/url',
    'N/task',
    'N/encode'
], (serverWidget, record, search, log, runtime, url, task, encode) => {

    const RECORD_TYPE = 'customrecord_tq_license_plate';

    const onRequest = (context) => {
        const action = context.request.parameters.action || 'page';

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
                    if (plate.binId) {
                        invDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'binnumber',
                            value: parseInt(plate.binId)
                        });
                    }
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

        // Optionally update plate status to "Fulfilled" or similar
        // record.submitFields({ type: RECORD_TYPE, id: data.plateId, values: { custrecord_tq_license_plate_status: FULFILLED_STATUS_ID } });

        return {
            success: true,
            message: 'Item Fulfillment ' + ffTranId + ' created with ' + plate.serialList.length + ' serial(s).',
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
            columns: ['item', 'quantity', 'quantityfulfilled', 'quantityremaining']
        });
        const items = [];
        lineSrch.run().each(r => {
            items.push({
                itemId: r.getValue('item'),
                item: r.getText('item'),
                qty: r.getValue('quantity'),
                fulfilled: r.getValue('quantityfulfilled'),
                remaining: r.getValue('quantityremaining')
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
            const tempRec = record.create({ type: RECORD_TYPE, isDynamic: false });
            const field = tempRec.getField({ fieldId: 'custrecord_tq_license_plate_status' });
            if (field) {
                const opts = field.getSelectOptions();
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
.nav-section {
    padding: 20px 20px 6px; font-size:10px;
    text-transform: uppercase; letter-spacing:1.5px;
    color: var(--text-dim); font-weight:700;
}

/* ─── MAIN CONTENT ─── */
.main { flex:1; padding:24px 32px; overflow-y:auto; max-height: calc(100vh - 56px); }
.view { display:none; }
.view.active { display:block; }

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

/* ─── RESPONSIVE ─── */
@media (max-width:768px) {
    .sidebar { display:none; }
    .main { padding:16px; }
    .form-grid { grid-template-columns:1fr; }
    .plate-detail { grid-template-columns:1fr; }
    .stats-row { grid-template-columns:1fr 1fr; }
}
</style>
</head>
<body>

<!-- ═══ TOP BAR ═══ -->
<div class="topbar">
    <div class="topbar-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>
        License Plate Manager
    </div>
    <div class="topbar-user">TelQuest Warehouse</div>
</div>

<!-- ═══ LAYOUT ═══ -->
<div class="layout">

<!-- ═══ SIDEBAR ═══ -->
<nav class="sidebar">
    <div class="nav-section">Overview</div>
    <div class="nav-item active" data-view="dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
    </div>
    <div class="nav-section">Operations</div>
    <div class="nav-item" data-view="scan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
        Scan &amp; Lookup
    </div>
    <div class="nav-item" data-view="create">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Create Plate
    </div>
    <div class="nav-item" data-view="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Search &amp; List
    </div>
    <div class="nav-section">Actions</div>
    <div class="nav-item" data-view="transfer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        Bin Transfer
    </div>
    <div class="nav-item" data-view="fulfill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Fulfill SO
    </div>
</nav>

<!-- ═══ MAIN CONTENT ═══ -->
<div class="main">

<!-- ═══════ DASHBOARD VIEW ═══════ -->
<div class="view active" id="view-dashboard">
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
//  NAVIGATION
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('view-' + el.dataset.view).classList.add('active');

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
//  INIT
// ═══════════════════════════════════════════════════════════
(async function init() {
    await Promise.all([initCreateForm(), initSearchForm()]);
    loadDashboard();

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
