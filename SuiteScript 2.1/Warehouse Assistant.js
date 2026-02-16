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

        // Bin and status for "Move to Testing"
        const TESTING_BIN_ID = 3549;
        const TESTING_STATUS_ID = 6;

        // Bin and status for "Move to Refurbishing"
        const REFURBISHING_BIN_ID = 3550;
        const REFURBISHING_STATUS_ID = 9;

        // Bin and status for "Defective"
        const DEFECTIVE_BIN_ID = 3551;
        const DEFECTIVE_STATUS_ID = 10;

        // Bin and status for "Trash"
        const TRASH_BIN_ID = 2645;
        const TRASH_STATUS_ID = 10;

        // Bin and status for "Return to Vendor"
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

        /**
         * Derive the Like New item name from the current item name.
         * - If item ends with '-N', replace '-N' with '-LN'
         * - If item ends with '-RF', replace '-RF' with '-LN'
         * - Otherwise, append '-LN'
         *
         * ABC-N           → ABC-LN
         * PART-123-N      → PART-123-LN
         * PART-123-RF     → PART-123-LN
         * 2200-48820-025  → 2200-48820-025-LN
         * GADGET          → GADGET-LN
         */
        function getLikeNewItemName(itemName) {
            if (!itemName) return '';

            // Check if ends with -N (case sensitive)
            if (itemName.endsWith('-N')) {
                return itemName.slice(0, -2) + '-LN';
            }

            // Check if ends with -RF (case sensitive)
            if (itemName.endsWith('-RF')) {
                return itemName.slice(0, -3) + '-LN';
            }

            // Otherwise just append -LN
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
         * Search for items matching a query string.
         * Returns array of { id, itemid, displayname, description }
         */
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
                // Only show inventory items
                filters.push('AND');
                filters.push(['type', 'anyof', ['InvtPart', 'Assembly']]);

                search.create({
                    type: search.Type.ITEM,
                    filters: filters,
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'itemid', sort: search.Sort.ASC }),
                        search.createColumn({ name: 'displayname' }),
                        search.createColumn({ name: 'salesdescription' })
                    ]
                }).run().each(function(r) {
                    results.push({
                        id: r.getValue('internalid'),
                        itemid: r.getValue('itemid'),
                        displayname: r.getValue('displayname') || r.getValue('itemid'),
                        description: r.getValue('salesdescription') || ''
                    });
                    return results.length < maxResults;
                });
            } catch (e) {
                log.error('searchItems Error', e.message);
            }
            return results;
        }

        /**
         * Get available bins for a location.
         */
        function getBinsForLocation(locationId) {
            const bins = [];
            try {
                search.create({
                    type: 'bin',
                    filters: [['location', 'anyof', locationId]],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'binnumber', sort: search.Sort.ASC })
                    ]
                }).run().each(function(r) {
                    bins.push({
                        id: r.getValue('internalid'),
                        name: r.getValue('binnumber')
                    });
                    return bins.length < 1000;
                });
            } catch (e) {
                log.error('getBinsForLocation Error', e.message);
            }
            return bins;
        }

        /**
         * Get all locations.
         */
        function getLocations() {
            const locations = [];
            try {
                search.create({
                    type: 'location',
                    filters: [['isinactive', 'is', false]],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'name', sort: search.Sort.ASC })
                    ]
                }).run().each(function(r) {
                    locations.push({
                        id: r.getValue('internalid'),
                        name: r.getValue('name')
                    });
                    return locations.length < 100;
                });
            } catch (e) {
                log.error('getLocations Error', e.message);
            }
            return locations;
        }

        /**
         * Find a bin by its bin number for a given location.
         * Returns { id, binnumber } or null.
         */
        function findBinByNumber(binNumber, locationId) {
            let result = null;
            try {
                search.create({
                    type: 'bin',
                    filters: [
                        ['binnumber', 'is', binNumber],
                        'AND',
                        ['location', 'anyof', locationId]
                    ],
                    columns: ['internalid', 'binnumber']
                }).run().each(function(r) {
                    result = {
                        id: r.getValue('internalid'),
                        binnumber: r.getValue('binnumber')
                    };
                    return false;
                });
            } catch (e) {
                log.error('findBinByNumber Error', e.message);
            }
            return result;
        }

        /**
         * Look up serial numbers and return item, location, and bin details.
         * Two-phase approach:
         *   Phase 1 – find serials and their items using direct inventorynumber columns
         *   Phase 2 – enrich with bin/location via inventoryNumberBinOnHand join (best-effort)
         * Returns { valid: [...], invalid: [...] }
         */
        // Location ID to restrict serial number searches
        const SERIAL_LOOKUP_LOCATION_ID = '1';

        function lookupSerialDetails(serialTexts) {
            if (!serialTexts || serialTexts.length === 0) {
                return { valid: [], invalid: [] };
            }

            // Build serial number filter
            const serialFilterExpression = [];
            serialTexts.forEach((serial, index) => {
                if (index > 0) serialFilterExpression.push('OR');
                serialFilterExpression.push(['inventorynumber', 'is', serial]);
            });

            const foundSerials = {};

            // --- Phase 1: Basic lookup to find inventory number records ---
            try {
                search.create({
                    type: 'inventorynumber',
                    filters: serialFilterExpression,
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

                    // Only accept if in target location with quantity on hand
                    if (locId === SERIAL_LOOKUP_LOCATION_ID && qtyOnHand > 0) {
                        if (!foundSerials[serial]) {
                            foundSerials[serial] = {
                                serialNumber: serial,
                                serialId: result.getValue('internalid'),
                                itemId: result.getValue('item'),
                                itemText: result.getText('item'),
                                locationId: locId,
                                locationText: result.getText('location') || '',
                                binId: '',
                                binText: '',
                                statusId: '',
                                statusText: '',
                                quantityOnHand: qtyOnHand
                            };
                        }
                    }
                    return true;
                });
            } catch (e) {
                log.error('lookupSerialDetails Phase1 Error', e.message);
            }

            // --- Phase 2: Enrich with bin/status info via inventorybalance search ---
            // The inventoryNumberBinOnHand join does not expose binnumber or location columns,
            // so we query the inventorybalance record type instead, which reliably provides
            // bin, status, and location for serialized inventory.
            if (Object.keys(foundSerials).length > 0) {
                try {
                    // Build a map from serial internal ID back to serial text
                    const serialIdToText = {};
                    const serialIds = [];
                    Object.keys(foundSerials).forEach(serial => {
                        const sid = foundSerials[serial].serialId;
                        if (sid) {
                            serialIdToText[sid] = serial;
                            serialIds.push(sid);
                        }
                    });

                    if (serialIds.length > 0) {
                        search.create({
                            type: 'inventorybalance',
                            filters: [
                                ['inventorynumber', 'anyof', serialIds],
                                'AND',
                                ['location', 'anyof', SERIAL_LOOKUP_LOCATION_ID]
                            ],
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
                } catch (e) {
                    // inventorybalance search not available – Phase 1 data is still usable
                    log.debug('lookupSerialDetails Phase2 (bin enrichment) skipped', e.message);
                }
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

        /**
         * Generate label PDF for multiple item groups.
         * @param {Array} labelGroups - Array of { itemText, description, serialNumbers, quantity }
         * @param {string} recordId - The adjustment tranid to show on all labels
         */
        function generateLabelsPdf(labelGroups, recordId) {
            let bodyContent = '';

            labelGroups.forEach(group => {
                const itemName = escapeXml(group.itemText || '');
                const description = escapeXml(group.description || '');
                const escapedRecordId = escapeXml(recordId || '');

                if (group.serialNumbers && group.serialNumbers.length > 0) {
                    // Serialized items - one label per serial number
                    group.serialNumbers.forEach(serialNumber => {
                        const escapedSerial = escapeXml(serialNumber);
                        bodyContent += `
                        <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">
                            <table align="right" width="98%" height="50%">
                                <tr height="12%">
                                    <td align="center">
                                        <table width="100%">
                                            <tr>
                                                <td style="font-size:18px;">${itemName}</td>
                                                <td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">${escapedRecordId}</td></tr></table></td>
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
                } else if (group.quantity && group.quantity > 0) {
                    // Non-serialized items - one label per quantity unit
                    for (let i = 0; i < group.quantity; i++) {
                        bodyContent += `
                        <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.15in">
                            <table align="right" width="98%" height="50%">
                                <tr height="12%">
                                    <td align="center">
                                        <table width="100%">
                                            <tr>
                                                <td style="font-size:18px;">${itemName}</td>
                                                <td align="right"><table style="border:1px;"><tr><td style="font-size:16px;">${escapedRecordId}</td></tr></table></td>
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
                                    <td height="60px" align="left">
                                    </td>
                                </tr>
                                <tr>
                                    <td align="left" style="font-size:25px;">
                                        <barcode height="60px" width="220px" codetype="code128" showtext="true" value="${itemName}"/>
                                    </td>
                                </tr>
                            </table>
                        </body>`;
                    }
                }
            });

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
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Created through Warehouse Assistant Dashboard.' });

            // Look up average cost for each source item so the adjust-in matches the adjust-out
            const costCache = {};
            groups.forEach(group => {
                if (!costCache[group.sourceItemId]) {
                    try {
                        const costLookup = search.lookupFields({
                            type: search.Type.ITEM,
                            id: group.sourceItemId,
                            columns: ['averagecost']
                        });
                        costCache[group.sourceItemId] = parseFloat(costLookup.averagecost) || 0;
                    } catch (e) {
                        log.debug('Cost lookup failed for item ' + group.sourceItemId, e.message);
                        costCache[group.sourceItemId] = 0;
                    }
                }
            });

            groups.forEach(group => {
                const serialCount = group.serials.length;
                const itemCost = costCache[group.sourceItemId] || 0;

                // --- REMOVAL LINE: take serials out of source item ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.sourceItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -serialCount });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

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
                // Use same unit cost as removal so the adjustment nets to zero
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.targetItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: serialCount });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

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

        /**
         * Create bin transfer for moving serials to Testing or Refurbishing.
         * Item does not change, only bin and status.
         *
         * @param {Array} groups - Grouped transfer data:
         *   { itemId, itemText, locationId, action, serials: [{ serialNumber, serialId, binId }] }
         * @param {string} memo - Transaction memo
         * @returns {Object} { tranId }
         */
        function createBinTransfer(groups, memo) {
            const transferRecord = record.create({
                type: record.Type.BIN_TRANSFER,
                isDynamic: true
            });

            // Set header fields
            transferRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            transferRecord.setValue({ fieldId: 'memo', value: memo || 'Via Warehouse Assistant Dashboard' });

            // Set location from first group (all should be same location for bin transfer)
            if (groups.length > 0 && groups[0].locationId) {
                transferRecord.setValue({ fieldId: 'location', value: groups[0].locationId });
            }

            groups.forEach(group => {
                const serialCount = group.serials.length;

                // Determine destination bin and status based on action
                let toBinId, toStatusId;
                if (group.action === 'move_testing') {
                    toBinId = TESTING_BIN_ID;
                    toStatusId = TESTING_STATUS_ID;
                } else if (group.action === 'move_refurbishing') {
                    toBinId = REFURBISHING_BIN_ID;
                    toStatusId = REFURBISHING_STATUS_ID;
                } else if (group.action === 'back_to_stock') {
                    toBinId = BACK_TO_STOCK_BIN_ID;
                    toStatusId = BACK_TO_STOCK_STATUS_ID;
                } else if (group.action === 'defective') {
                    toBinId = DEFECTIVE_BIN_ID;
                    toStatusId = DEFECTIVE_STATUS_ID;
                } else if (group.action === 'trash') {
                    toBinId = TRASH_BIN_ID;
                    toStatusId = TRASH_STATUS_ID;
                } else if (group.action === 'return_to_vendor') {
                    toBinId = RETURN_TO_VENDOR_BIN_ID;
                    toStatusId = RETURN_TO_VENDOR_STATUS_ID;
                }

                transferRecord.selectNewLine({ sublistId: 'inventory' });
                transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: serialCount });

                const invDetail = transferRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });

                group.serials.forEach(serial => {
                    invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    // Use serial number text for bin transfers
                    invDetail.setCurrentSublistText({
                        sublistId: 'inventoryassignment',
                        fieldId: 'issueinventorynumber',
                        text: serial.serialNumber
                    });
                    invDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: 1
                    });
                    // Source bin
                    if (serial.binId) {
                        invDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'binnumber',
                            value: serial.binId
                        });
                    }
                    // Destination bin
                    invDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'tobinnumber',
                        value: toBinId
                    });
                    // Destination status
                    invDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'toinventorystatus',
                        value: toStatusId
                    });
                    invDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                transferRecord.commitLine({ sublistId: 'inventory' });
            });

            const transferId = transferRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            // Look up the tranid for display
            let tranId = String(transferId);
            try {
                const lookup = search.lookupFields({
                    type: record.Type.BIN_TRANSFER,
                    id: transferId,
                    columns: ['tranid']
                });
                tranId = lookup.tranid || String(transferId);
            } catch (e) {
                log.debug('Could not look up bin transfer tranid', e.message);
            }

            return { transferId: transferId, tranId: tranId };
        }

        /**
         * Create inventory adjustment for non-serialized condition change.
         *
         * @param {Object} data - { sourceItemId, sourceItemName, targetItemId, targetItemName, locationId, quantity, fromBinId, toBinId }
         * @param {string} memo - Transaction memo
         * @returns {Object} { adjId, tranId }
         */
        function createNonSerializedAdjustment(data, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });

            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Created through Warehouse Assistant Dashboard.' });

            // Look up average cost for the source item
            let itemCost = 0;
            try {
                const costLookup = search.lookupFields({
                    type: search.Type.ITEM,
                    id: data.sourceItemId,
                    columns: ['averagecost']
                });
                itemCost = parseFloat(costLookup.averagecost) || 0;
            } catch (e) {
                log.debug('Cost lookup failed for item ' + data.sourceItemId, e.message);
            }

            // --- REMOVAL LINE: take quantity out of source item ---
            adjRecord.selectNewLine({ sublistId: 'inventory' });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.sourceItemId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -data.quantity });
            if (itemCost > 0) {
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
            }

            // Set bin for removal if using bins
            if (data.fromBinId) {
                const removeDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });
                removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                removeDetail.setCurrentSublistValue({
                    sublistId: 'inventoryassignment',
                    fieldId: 'quantity',
                    value: -data.quantity
                });
                removeDetail.setCurrentSublistValue({
                    sublistId: 'inventoryassignment',
                    fieldId: 'binnumber',
                    value: data.fromBinId
                });
                removeDetail.commitLine({ sublistId: 'inventoryassignment' });
            }

            adjRecord.commitLine({ sublistId: 'inventory' });

            // --- ADDITION LINE: add quantity to target -LN item ---
            adjRecord.selectNewLine({ sublistId: 'inventory' });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.targetItemId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
            if (itemCost > 0) {
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
            }

            // Set bin for addition if using bins
            if (data.toBinId) {
                const addDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });
                addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                addDetail.setCurrentSublistValue({
                    sublistId: 'inventoryassignment',
                    fieldId: 'quantity',
                    value: data.quantity
                });
                addDetail.setCurrentSublistValue({
                    sublistId: 'inventoryassignment',
                    fieldId: 'binnumber',
                    value: data.toBinId
                });
                if (data.toStatusId) {
                    addDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'inventorystatus',
                        value: data.toStatusId
                    });
                }
                addDetail.commitLine({ sublistId: 'inventoryassignment' });
            }

            adjRecord.commitLine({ sublistId: 'inventory' });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            // Look up the tranid for display
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

        /**
         * Create a single inventory adjustment for multiple non-serialized condition-change rows.
         * Each row produces a removal line (source item) and an addition line (target -LN item).
         *
         * @param {Array} rows - Array of { sourceItemId, sourceItemName, targetItemId, targetItemName, locationId, quantity, fromBinId, toBinId, toStatusId }
         * @param {string} memo - Transaction memo
         * @returns {Object} { adjId, tranId }
         */
        function createNonSerializedAdjustmentMulti(rows, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Created through Warehouse Assistant Dashboard.' });

            const costCache = {};

            rows.forEach(function(data) {
                if (!costCache[data.sourceItemId]) {
                    try {
                        const costLookup = search.lookupFields({
                            type: search.Type.ITEM,
                            id: data.sourceItemId,
                            columns: ['averagecost']
                        });
                        costCache[data.sourceItemId] = parseFloat(costLookup.averagecost) || 0;
                    } catch (e) {
                        log.debug('Cost lookup failed for item ' + data.sourceItemId, e.message);
                        costCache[data.sourceItemId] = 0;
                    }
                }

                const itemCost = costCache[data.sourceItemId];

                // --- REMOVAL LINE ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.sourceItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -data.quantity });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

                if (data.fromBinId) {
                    const removeDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                    removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -data.quantity });
                    removeDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
                    removeDetail.commitLine({ sublistId: 'inventoryassignment' });
                }
                adjRecord.commitLine({ sublistId: 'inventory' });

                // --- ADDITION LINE ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.targetItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

                if (data.toBinId) {
                    const addDetail = adjRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                    addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.toBinId });
                    if (data.toStatusId) {
                        addDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: data.toStatusId });
                    }
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                }
                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            let tranId = String(adjId);
            try {
                const adjLookup = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] });
                tranId = adjLookup.tranid || String(adjId);
            } catch (e) {
                log.debug('Could not look up adjustment tranid', e.message);
            }

            return { adjId: adjId, tranId: tranId };
        }

        /**
         * Create bin transfer for non-serialized items.
         *
         * @param {Object} data - { itemId, locationId, quantity, fromBinId, toBinId, toStatusId }
         * @param {string} memo - Transaction memo
         * @returns {Object} { transferId, tranId }
         */
        function createNonSerializedBinTransfer(data, memo) {
            const transferRecord = record.create({
                type: record.Type.BIN_TRANSFER,
                isDynamic: true
            });

            transferRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            transferRecord.setValue({ fieldId: 'memo', value: memo || 'Via Warehouse Assistant Dashboard' });
            transferRecord.setValue({ fieldId: 'location', value: data.locationId });

            transferRecord.selectNewLine({ sublistId: 'inventory' });
            transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
            transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: data.quantity });

            const invDetail = transferRecord.getCurrentSublistSubrecord({
                sublistId: 'inventory',
                fieldId: 'inventorydetail'
            });

            invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
            invDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'quantity',
                value: data.quantity
            });
            // Source bin
            if (data.fromBinId) {
                invDetail.setCurrentSublistValue({
                    sublistId: 'inventoryassignment',
                    fieldId: 'binnumber',
                    value: data.fromBinId
                });
            }
            // Destination bin
            invDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'tobinnumber',
                value: data.toBinId
            });
            // Destination status
            if (data.toStatusId) {
                invDetail.setCurrentSublistValue({
                    sublistId: 'inventoryassignment',
                    fieldId: 'toinventorystatus',
                    value: data.toStatusId
                });
            }
            invDetail.commitLine({ sublistId: 'inventoryassignment' });

            transferRecord.commitLine({ sublistId: 'inventory' });

            const transferId = transferRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            // Look up the tranid for display
            let tranId = String(transferId);
            try {
                const lookup = search.lookupFields({
                    type: record.Type.BIN_TRANSFER,
                    id: transferId,
                    columns: ['tranid']
                });
                tranId = lookup.tranid || String(transferId);
            } catch (e) {
                log.debug('Could not look up bin transfer tranid', e.message);
            }

            return { transferId: transferId, tranId: tranId };
        }

        /**
         * Create a single bin transfer for multiple non-serialized items.
         * Each row adds a line to the same Bin Transfer record.
         *
         * @param {Array} rows - Array of { itemId, locationId, quantity, fromBinId, toBinId, toStatusId }
         * @param {string} memo - Transaction memo
         * @returns {Object} { transferId, tranId }
         */
        function createNonSerializedBinTransferMulti(rows, memo) {
            const transferRecord = record.create({
                type: record.Type.BIN_TRANSFER,
                isDynamic: true
            });

            transferRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            transferRecord.setValue({ fieldId: 'memo', value: memo || 'Via Warehouse Assistant Dashboard' });

            if (rows.length > 0) {
                transferRecord.setValue({ fieldId: 'location', value: rows[0].locationId });
            }

            rows.forEach(function(data) {
                transferRecord.selectNewLine({ sublistId: 'inventory' });
                transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
                transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: data.quantity });

                const invDetail = transferRecord.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });
                invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: data.quantity });
                if (data.fromBinId) {
                    invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: data.fromBinId });
                }
                invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'tobinnumber', value: data.toBinId });
                if (data.toStatusId) {
                    invDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'toinventorystatus', value: data.toStatusId });
                }
                invDetail.commitLine({ sublistId: 'inventoryassignment' });

                transferRecord.commitLine({ sublistId: 'inventory' });
            });

            const transferId = transferRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            let tranId = String(transferId);
            try {
                const lookup = search.lookupFields({ type: record.Type.BIN_TRANSFER, id: transferId, columns: ['tranid'] });
                tranId = lookup.tranid || String(transferId);
            } catch (e) {
                log.debug('Could not look up bin transfer tranid', e.message);
            }

            return { transferId: transferId, tranId: tranId };
        }

        /**
         * Create inventory adjustment for "Inventory Found" — adjust IN at warehouse average cost.
         * Works for serialized items. Adjusts into bin 3555, status 1.
         *
         * @param {Array} groups - Grouped data:
         *   { itemId, itemText, locationId, serials: [{ serialNumber, serialId, binId }] }
         * @param {string} memo - Transaction memo
         * @returns {Object} { adjId, tranId }
         */
        function createInventoryFoundAdjustment(groups, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });

            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Inventory Found — via Warehouse Assistant Dashboard.' });

            // Look up average cost for each item
            const costCache = {};
            groups.forEach(group => {
                if (!costCache[group.itemId]) {
                    try {
                        const costLookup = search.lookupFields({
                            type: search.Type.ITEM,
                            id: group.itemId,
                            columns: ['averagecost']
                        });
                        costCache[group.itemId] = parseFloat(costLookup.averagecost) || 0;
                    } catch (e) {
                        log.debug('Cost lookup failed for item ' + group.itemId, e.message);
                        costCache[group.itemId] = 0;
                    }
                }
            });

            groups.forEach(group => {
                const serialCount = group.serials.length;
                const itemCost = costCache[group.itemId] || 0;

                // --- ADDITION LINE ONLY: adjust the item in ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: serialCount });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

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
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

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

        /**
         * Create inventory adjustment for "Inventory Found" — non-serialized items.
         * Adjusts IN at warehouse average cost into bin 3555, status 1.
         *
         * @param {Object} data - { itemId, locationId, quantity }
         * @param {string} memo - Transaction memo
         * @returns {Object} { adjId, tranId }
         */
        function createNonSerializedInventoryFoundAdjustment(data, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });

            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Inventory Found — via Warehouse Assistant Dashboard.' });

            // Look up average cost for the item
            let itemCost = 0;
            try {
                const costLookup = search.lookupFields({
                    type: search.Type.ITEM,
                    id: data.itemId,
                    columns: ['averagecost']
                });
                itemCost = parseFloat(costLookup.averagecost) || 0;
            } catch (e) {
                log.debug('Cost lookup failed for item ' + data.itemId, e.message);
            }

            // --- ADDITION LINE ONLY: adjust the item in ---
            adjRecord.selectNewLine({ sublistId: 'inventory' });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
            adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
            if (itemCost > 0) {
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
            }

            const addDetail = adjRecord.getCurrentSublistSubrecord({
                sublistId: 'inventory',
                fieldId: 'inventorydetail'
            });
            addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
            addDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'quantity',
                value: data.quantity
            });
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
            addDetail.commitLine({ sublistId: 'inventoryassignment' });

            adjRecord.commitLine({ sublistId: 'inventory' });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

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

        /**
         * Create a single inventory adjustment for multiple non-serialized "Inventory Found" rows.
         * Each row adds a line (adjust-in) to the same record at bin 3555, status 1.
         *
         * @param {Array} rows - Array of { itemId, locationId, quantity }
         * @param {string} memo - Transaction memo
         * @returns {Object} { adjId, tranId }
         */
        function createNonSerializedInventoryFoundMulti(rows, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });
            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Inventory Found — via Warehouse Assistant Dashboard.' });

            const costCache = {};

            rows.forEach(function(data) {
                if (!costCache[data.itemId]) {
                    try {
                        const costLookup = search.lookupFields({ type: search.Type.ITEM, id: data.itemId, columns: ['averagecost'] });
                        costCache[data.itemId] = parseFloat(costLookup.averagecost) || 0;
                    } catch (e) {
                        log.debug('Cost lookup failed for item ' + data.itemId, e.message);
                        costCache[data.itemId] = 0;
                    }
                }

                const itemCost = costCache[data.itemId];

                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: data.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: data.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: data.quantity });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

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
            try {
                const adjLookup = search.lookupFields({ type: search.Type.INVENTORY_ADJUSTMENT, id: adjId, columns: ['tranid'] });
                tranId = adjLookup.tranid || String(adjId);
            } catch (e) {
                log.debug('Could not look up adjustment tranid', e.message);
            }

            return { adjId: adjId, tranId: tranId };
        }

        /**
         * Create inventory adjustment for serial number change.
         * Removes old serial and adds new serial for the same item.
         *
         * @param {Array} changes - Array of serial change data:
         *   { itemId, itemText, locationId, oldSerialNumber, oldSerialId, newSerialNumber, binId, statusId }
         * @param {string} memo - Transaction memo
         * @returns {Object} { adjId, tranId }
         */
        function createSerialNumberChangeAdjustment(changes, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });

            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Serial Number Change via Warehouse Assistant Dashboard.' });

            // Group changes by item, location, and action for efficiency
            const groupMap = {};
            changes.forEach(change => {
                const key = change.itemId + '_' + change.locationId + '_' + change.action;
                if (!groupMap[key]) {
                    groupMap[key] = {
                        itemId: change.itemId,
                        locationId: change.locationId,
                        action: change.action,
                        changes: []
                    };
                }
                groupMap[key].changes.push(change);
            });

            // Look up average cost for each item
            const costCache = {};
            Object.values(groupMap).forEach(group => {
                if (!costCache[group.itemId]) {
                    try {
                        const costLookup = search.lookupFields({
                            type: search.Type.ITEM,
                            id: group.itemId,
                            columns: ['averagecost']
                        });
                        costCache[group.itemId] = parseFloat(costLookup.averagecost) || 0;
                    } catch (e) {
                        log.debug('Cost lookup failed for item ' + group.itemId, e.message);
                        costCache[group.itemId] = 0;
                    }
                }
            });

            Object.values(groupMap).forEach(group => {
                const itemCost = costCache[group.itemId] || 0;
                const changeCount = group.changes.length;

                // --- REMOVAL LINE: remove old serials ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -changeCount });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

                const removeDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });

                group.changes.forEach(change => {
                    removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    removeDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'issueinventorynumber',
                        value: change.oldSerialId
                    });
                    removeDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: -1
                    });
                    if (change.binId) {
                        removeDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'binnumber',
                            value: change.binId
                        });
                    }
                    removeDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                adjRecord.commitLine({ sublistId: 'inventory' });

                // --- ADDITION LINE: add new serials (same item) ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: changeCount });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

                const addDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });

                group.changes.forEach(change => {
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'receiptinventorynumber',
                        value: change.newSerialNumber
                    });
                    addDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: 1
                    });

                    if (change.action === 'serial_change_stock') {
                        // Change Serial & Back to Stock: use bin 3555 and status 1
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
                    } else {
                        // Serial Number Change only: keep same bin and status
                        if (change.binId) {
                            addDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'binnumber',
                                value: change.binId
                            });
                        }
                        if (change.statusId) {
                            addDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'inventorystatus',
                                value: change.statusId
                            });
                        }
                    }
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            // Look up the tranid for display
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

        /**
         * Create inventory adjustment for part number change.
         * Removes serial from old item and adds same serial to new (target) item.
         *
         * @param {Array} changes - Array of part number change data:
         *   { oldItemId, newItemId, newItemName, locationId, serialNumber, serialId, binId, statusId, action }
         * @param {string} memo - Transaction memo
         * @returns {Object} { adjId, tranId }
         */
        function createPartNumberChangeAdjustment(changes, memo) {
            const adjRecord = record.create({
                type: record.Type.INVENTORY_ADJUSTMENT,
                isDynamic: true
            });

            adjRecord.setValue({ fieldId: 'subsidiary', value: '1' });

            if (ADJUSTMENT_ACCOUNT_ID) {
                adjRecord.setValue({ fieldId: 'account', value: ADJUSTMENT_ACCOUNT_ID });
            }
            adjRecord.setValue({ fieldId: 'memo', value: memo || 'Part Number Change via Warehouse Assistant Dashboard.' });

            // Group changes by oldItemId + newItemId + locationId + action
            const groupMap = {};
            changes.forEach(change => {
                const key = change.oldItemId + '_' + change.newItemId + '_' + change.locationId + '_' + change.action;
                if (!groupMap[key]) {
                    groupMap[key] = {
                        oldItemId: change.oldItemId,
                        newItemId: change.newItemId,
                        locationId: change.locationId,
                        action: change.action,
                        changes: []
                    };
                }
                groupMap[key].changes.push(change);
            });

            // Look up average cost for old items (used on both removal and addition lines for zero variance)
            const costCache = {};
            Object.values(groupMap).forEach(group => {
                if (!costCache[group.oldItemId]) {
                    try {
                        const costLookup = search.lookupFields({
                            type: search.Type.ITEM,
                            id: group.oldItemId,
                            columns: ['averagecost']
                        });
                        costCache[group.oldItemId] = parseFloat(costLookup.averagecost) || 0;
                    } catch (e) {
                        log.debug('Cost lookup failed for item ' + group.oldItemId, e.message);
                        costCache[group.oldItemId] = 0;
                    }
                }
            });

            Object.values(groupMap).forEach(group => {
                const itemCost = costCache[group.oldItemId] || 0;
                const changeCount = group.changes.length;

                // --- REMOVAL LINE: remove serials from old item ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.oldItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -changeCount });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

                const removeDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });

                group.changes.forEach(change => {
                    removeDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    removeDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'issueinventorynumber',
                        value: change.serialId
                    });
                    removeDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: -1
                    });
                    if (change.binId) {
                        removeDetail.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'binnumber',
                            value: change.binId
                        });
                    }
                    removeDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                adjRecord.commitLine({ sublistId: 'inventory' });

                // --- ADDITION LINE: add serials to new (target) item (same cost as removal for zero variance) ---
                adjRecord.selectNewLine({ sublistId: 'inventory' });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.newItemId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location', value: group.locationId });
                adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: changeCount });
                if (itemCost > 0) {
                    adjRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'unitcost', value: itemCost });
                }

                const addDetail = adjRecord.getCurrentSublistSubrecord({
                    sublistId: 'inventory',
                    fieldId: 'inventorydetail'
                });

                group.changes.forEach(change => {
                    addDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                    addDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'receiptinventorynumber',
                        value: change.serialNumber
                    });
                    addDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        value: 1
                    });

                    if (change.action === 'part_number_change_stock') {
                        // Part Number Change & Back to Stock: use bin 3555 and status 1
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
                    } else {
                        // Part Number Change only: keep same bin and status
                        if (change.binId) {
                            addDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'binnumber',
                                value: change.binId
                            });
                        }
                        if (change.statusId) {
                            addDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'inventorystatus',
                                value: change.statusId
                            });
                        }
                    }
                    addDetail.commitLine({ sublistId: 'inventoryassignment' });
                });

                adjRecord.commitLine({ sublistId: 'inventory' });
            });

            const adjId = adjRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });

            // Look up the tranid for display
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
                #main_form { background-color: #f4f7f9 !important; }
                .uir-page-title, .uir-page-title-firstline, .uir-page-title-secondline,
                .uir-header-buttons, .uir-button-bar { display: none !important; }

                * { box-sizing: border-box; }

                .app-container {
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    max-width: 900px;
                    margin: 20px auto;
                    padding: 0 20px;
                    height: calc(100vh - 40px);
                    display: flex;
                    flex-direction: column;
                }

                .main-card {
                    background: #ffffff;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.08);
                    border: 1px solid #e1e8ed;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    flex: 1;
                }

                .card-header {
                    background: #1e3c72;
                    color: white;
                    padding: 28px 32px;
                    text-align: center;
                }
                .card-header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                .card-header p { margin: 10px 0 0; opacity: 0.8; font-size: 14px; }

                .form-body {
                    padding: 32px;
                    overflow-y: auto;
                    flex: 1;
                    min-height: 0;
                }

                .input-group { margin-bottom: 28px; }

                .custom-label {
                    display: block;
                    font-weight: 600;
                    color: #475569;
                    margin-bottom: 10px;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .input-group input[type="text"],
                .input-group select,
                .input-group textarea {
                    width: 100% !important;
                    padding: 14px 16px !important;
                    border: 2px solid #e2e8f0 !important;
                    border-radius: 12px !important;
                    font-size: 14px !important;
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
                    padding: 20px 32px;
                    border-top: 1px solid #e2e8f0;
                    background: #fff;
                    flex-shrink: 0;
                }

                .custom-btn {
                    padding: 14px 24px;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    font-size: 14px;
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
                    font-size: 14px;
                    font-weight: 500;
                    flex-shrink: 0;
                }
                .alert-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
                .alert-warning { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
                .alert-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

                .results-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                .results-table th {
                    background: #f8fafc;
                    padding: 12px 14px;
                    text-align: left;
                    font-size: 12px;
                    font-weight: 700;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid #e2e8f0;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }
                .results-table td {
                    padding: 14px;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 14px;
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
                    min-width: 220px;
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
                .success-card { text-align: center; padding: 32px 0 0; }
                .success-card h2 { margin: 0 0 8px; font-size: 24px; color: #1e293b; }
                .success-card p { color: #64748b; margin-bottom: 32px; font-size: 14px; }

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
                    position: sticky;
                    top: 0;
                    z-index: 2;
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
                    font-size: 16px;
                    color: #1e3c72;
                }

                .mode-toggle {
                    display: flex;
                    gap: 0;
                    margin-bottom: 24px;
                    background: #f1f5f9;
                    border-radius: 12px;
                    padding: 4px;
                }
                .mode-btn {
                    flex: 1;
                    padding: 14px 20px;
                    border: none;
                    background: transparent;
                    color: #64748b;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    border-radius: 10px;
                    transition: all 0.2s;
                }
                .mode-btn.active {
                    background: #1e3c72;
                    color: white;
                    box-shadow: 0 2px 8px rgba(30, 60, 114, 0.3);
                }
                .mode-btn:hover:not(.active) {
                    background: #e2e8f0;
                    color: #475569;
                }

                .app-container-wide {
                    max-width: 1100px;
                }

                .form-section {
                    display: none;
                }
                .form-section.active {
                    display: block;
                }

                #ns-grid-body tr {
                    animation: cartFadeIn 0.3s ease-in;
                }
                @keyframes cartFadeIn {
                    from { background-color: #e0f2fe; }
                    to { background-color: transparent; }
                }

                /* ========= MOBILE RESPONSIVE ========= */
                @media screen and (max-width: 768px) {
                    /* Strip NetSuite chrome that eats space */
                    #main_form {
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    body, #div__body, #outerdiv, .uir-record-type {
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .uir-page-title, .uir-page-title-firstline, .uir-page-title-secondline,
                    .uir-header-buttons, .uir-button-bar,
                    #tbl_submitter, #submitter_row, .uir_form_tab_bg {
                        display: none !important;
                    }

                    /* Container — edge to edge, no wasted margins */
                    .app-container {
                        padding: 0 !important;
                        margin: 0 auto !important;
                        height: 100vh;
                        max-width: 100% !important;
                    }

                    .main-card {
                        border-radius: 0;
                        box-shadow: none;
                        border: none;
                    }

                    /* Compact header */
                    .card-header {
                        padding: 10px 14px;
                    }
                    .card-header h1 { font-size: 15px; }
                    .card-header p { font-size: 11px; margin-top: 2px; }

                    /* Tighter form body */
                    .form-body {
                        padding: 10px 8px;
                    }

                    .input-group { margin-bottom: 10px; }

                    .custom-label {
                        font-size: 11px;
                        margin-bottom: 5px;
                    }

                    /* Smaller inputs */
                    .input-group input[type="text"],
                    .input-group select,
                    .input-group textarea {
                        padding: 9px 10px !important;
                        font-size: 14px !important;
                        border-radius: 8px !important;
                        border-width: 1px !important;
                    }
                    .input-group textarea {
                        min-height: 100px !important;
                        line-height: 1.4 !important;
                    }

                    /* Mode toggle — compact pill buttons */
                    .mode-toggle {
                        margin-bottom: 10px;
                        padding: 3px;
                        border-radius: 8px;
                    }
                    .mode-btn {
                        padding: 8px 4px;
                        font-size: 11px;
                        font-weight: 600;
                        border-radius: 6px;
                    }

                    /* Button area — stacked, compact */
                    .btn-area {
                        padding: 8px;
                        gap: 6px;
                        flex-direction: column;
                    }
                    .custom-btn {
                        padding: 10px 14px;
                        font-size: 13px;
                        border-radius: 8px;
                        width: 100%;
                        text-align: center;
                    }

                    /* ---- Results table → card layout on mobile ---- */
                    .results-table,
                    .results-table thead,
                    .results-table tbody,
                    .results-table tr,
                    .results-table th,
                    .results-table td {
                        display: block !important;
                        width: 100% !important;
                        white-space: normal !important;
                    }
                    .results-table thead {
                        display: none !important;
                    }
                    .results-table tr {
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 10px;
                        margin-bottom: 8px;
                    }
                    .results-table td {
                        padding: 3px 0 !important;
                        border-bottom: none !important;
                        font-size: 13px !important;
                        text-align: left !important;
                        position: relative;
                    }
                    /* Show column names as inline labels via data-label */
                    .results-table td[data-label]::before {
                        content: attr(data-label) ": ";
                        font-weight: 700;
                        font-size: 10px;
                        text-transform: uppercase;
                        color: #64748b;
                        letter-spacing: 0.3px;
                        display: block;
                        margin-bottom: 2px;
                    }
                    .results-table td:last-child {
                        padding-top: 6px !important;
                    }
                    .results-table tr:hover td { background: transparent !important; }

                    .results-table input[type="text"],
                    .results-table input[type="number"] {
                        font-size: 14px !important;
                        padding: 8px 10px !important;
                        border-radius: 6px !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    .results-table select,
                    .results-table .action-select {
                        font-size: 14px !important;
                        padding: 8px 10px !important;
                        min-width: unset !important;
                        width: 100% !important;
                        border-radius: 6px !important;
                        box-sizing: border-box !important;
                    }

                    /* Action selects (standalone) */
                    .action-select {
                        min-width: unset;
                        width: 100%;
                        font-size: 14px;
                        padding: 8px 10px;
                        border-radius: 6px;
                    }

                    /* Alerts — compact */
                    .alert {
                        padding: 8px 10px;
                        font-size: 12px;
                        margin-bottom: 8px;
                        border-radius: 8px;
                    }

                    /* Bulk action bar — fully stacked */
                    .bulk-action-bar {
                        flex-direction: column !important;
                        flex-wrap: nowrap !important;
                        align-items: stretch !important;
                        gap: 8px !important;
                        padding: 10px !important;
                        border-radius: 8px;
                        margin-bottom: 10px;
                    }
                    .bulk-action-bar label {
                        font-size: 11px;
                    }
                    .bulk-action-bar select {
                        width: 100% !important;
                        font-size: 14px !important;
                        flex: unset !important;
                    }
                    .bulk-action-bar input[type="text"] {
                        width: 100% !important;
                        flex: unset !important;
                        font-size: 14px !important;
                        padding: 8px 10px !important;
                        box-sizing: border-box !important;
                    }
                    /* The "With Action: N / Submit / Back" row — wrap & full-width buttons */
                    .bulk-action-bar > div {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        gap: 6px !important;
                        width: 100% !important;
                    }
                    .bulk-action-bar > div span {
                        font-size: 12px !important;
                    }
                    .bulk-action-bar > div .custom-btn {
                        flex: 1 !important;
                        min-width: 0 !important;
                        padding: 10px 12px !important;
                        font-size: 13px !important;
                    }

                    /* Success page — compact */
                    .success-icon { font-size: 32px; margin-bottom: 6px; }
                    .success-card { padding: 8px 0 0; }
                    .success-card h2 { font-size: 16px; margin-bottom: 4px; }
                    .success-card p { font-size: 12px !important; margin-bottom: 12px; }
                    /* Override inline font-size on transaction info paragraphs */
                    .success-card p[style] { font-size: 13px !important; }

                    .label-group {
                        padding: 10px;
                        margin: 6px 0;
                        border-radius: 8px;
                    }
                    .label-group h3 { font-size: 13px; margin-bottom: 6px; }
                    .label-group p { font-size: 12px !important; }

                    .serial-list {
                        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
                        gap: 4px;
                        margin: 8px 0;
                    }
                    .serial-list li {
                        font-size: 10px;
                        padding: 5px 6px;
                        border-radius: 6px;
                        word-break: break-all;
                    }

                    /* Badges */
                    .badge-count {
                        padding: 2px 7px;
                        font-size: 10px;
                        margin-left: 5px;
                    }
                    .badge {
                        padding: 2px 6px;
                        font-size: 10px;
                    }

                    /* Inventory Found modal — full-width on mobile */
                    #inventoryFoundModal > div {
                        padding: 14px !important;
                        width: 96% !important;
                        max-width: 96% !important;
                        border-radius: 10px !important;
                    }
                    #inventoryFoundModal h2 { font-size: 15px !important; }
                    #inventoryFoundModal p { font-size: 12px !important; }
                    #inventoryFoundModal label { font-size: 12px !important; }
                    #inventoryFoundModal input,
                    #inventoryFoundModal textarea {
                        font-size: 14px !important;
                        padding: 8px 10px !important;
                    }
                    /* Stack modal buttons vertically */
                    #inventoryFoundModal > div > div:last-child {
                        flex-direction: column !important;
                        gap: 6px !important;
                    }
                    #inventoryFoundModal > div > div:last-child .custom-btn {
                        width: 100% !important;
                        text-align: center !important;
                    }

                    /* Bin putaway destination bin input */
                    #bp_to_bin {
                        padding: 9px 10px !important;
                        font-size: 14px !important;
                        border-radius: 8px !important;
                    }

                    /* New serial / new item inline inputs on results page */
                    .new-serial-input, .new-item-input {
                        font-size: 14px !important;
                        padding: 8px 10px !important;
                        min-width: unset !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }

                    /* Non-serialized grid — card layout */
                    #ns-grid-table tr,
                    #bp-ns-grid-table tr {
                        position: relative;
                    }
                    /* Remove button — position top-right on card */
                    #ns-grid-table td:last-child,
                    #bp-ns-grid-table td:last-child {
                        position: absolute;
                        top: 6px;
                        right: 6px;
                        width: auto !important;
                        padding: 0 !important;
                    }
                    #ns-grid-table td:last-child button,
                    #bp-ns-grid-table td:last-child button {
                        font-size: 16px !important;
                        padding: 2px 6px !important;
                    }

                    /* Non-serialized header row flex layout */
                    .form-section > div[style*="display:flex"] {
                        flex-wrap: wrap;
                        gap: 6px;
                    }
                }

                /* ========= EXTRA-SMALL SCREENS (phones) ========= */
                @media screen and (max-width: 400px) {
                    .card-header {
                        padding: 8px 10px;
                    }
                    .card-header h1 { font-size: 14px; }
                    .card-header p { display: none; }

                    .form-body {
                        padding: 8px 6px;
                    }

                    .mode-btn {
                        padding: 7px 2px;
                        font-size: 10px;
                    }

                    .btn-area {
                        padding: 6px;
                    }

                    .custom-btn {
                        padding: 9px 10px;
                        font-size: 12px;
                    }

                    .results-table tr {
                        padding: 8px;
                        margin-bottom: 6px;
                    }

                    .serial-list {
                        grid-template-columns: repeat(auto-fill, minmax(75px, 1fr));
                    }
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

                    // Non-serialized grid management
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
                        + '<option value="inventory_found">Inventory Found</option>';

                    function addNsGridRow() {
                        var tbody = document.getElementById('ns-grid-body');
                        if (!tbody) return;

                        nsGridRowId++;
                        var tr = document.createElement('tr');
                        tr.setAttribute('data-row-id', nsGridRowId);
                        tr.innerHTML = '<td data-label="SKU"><input type="text" class="ns-grid-input ns-item-input" data-row="' + nsGridRowId + '" placeholder="Enter SKU" style="width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; box-sizing:border-box;"></td>'
                            + '<td data-label="From Bin"><select class="action-select ns-bin-input" data-row="' + nsGridRowId + '" style="min-width:120px;">' + nsBinOptions + '</select></td>'
                            + '<td data-label="Qty"><input type="number" class="ns-grid-input ns-qty-input" data-row="' + nsGridRowId + '" placeholder="Qty" min="1" style="width:80px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;"></td>'
                            + '<td data-label="Action"><select class="action-select ns-action-input" data-row="' + nsGridRowId + '" style="min-width:180px;">' + nsActionOptions + '</select></td>'
                            + '<td><button type="button" onclick="removeNsGridRow(' + nsGridRowId + ')" '
                            + 'style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:18px; padding:4px 8px;" '
                            + 'title="Remove">&times;</button></td>';
                        tbody.appendChild(tr);
                        updateNsRowCount();

                        // Focus the part number input of the new row
                        var newInput = tr.querySelector('.ns-item-input');
                        if (newInput) newInput.focus();
                    }

                    function removeNsGridRow(rowId) {
                        var row = document.querySelector('#ns-grid-body tr[data-row-id="' + rowId + '"]');
                        if (row) row.remove();
                        updateNsRowCount();
                        // Ensure at least one row remains
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

                            var itemName = itemInput ? itemInput.value.trim() : '';
                            var binNumber = binInput ? binInput.value.trim() : '';
                            var qty = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
                            var action = actionSelect ? actionSelect.value : '';

                            // Skip completely empty rows
                            if (!itemName && !binNumber && qty === 0 && !action) continue;

                            // Validate filled rows
                            var rowNum = i + 1;
                            if (!itemName) {
                                if (itemInput) itemInput.style.border = '2px solid #ef4444';
                                hasError = true;
                            } else {
                                if (itemInput) itemInput.style.border = '1px solid #e2e8f0';
                            }
                            if (!binNumber) {
                                if (binInput) binInput.style.border = '2px solid #ef4444';
                                hasError = true;
                            } else {
                                if (binInput) binInput.style.border = '1px solid #e2e8f0';
                            }
                            if (qty <= 0) {
                                if (qtyInput) qtyInput.style.border = '2px solid #ef4444';
                                hasError = true;
                            } else {
                                if (qtyInput) qtyInput.style.border = '1px solid #e2e8f0';
                            }
                            if (!action) {
                                if (actionSelect) actionSelect.style.border = '2px solid #ef4444';
                                hasError = true;
                            } else {
                                if (actionSelect) actionSelect.style.border = '1px solid #e2e8f0';
                            }

                            gridData.push({
                                itemName: itemName,
                                binNumber: binNumber,
                                quantity: qty,
                                action: action
                            });
                        }

                        if (gridData.length === 0) {
                            alert('Please fill in at least one row.');
                            return;
                        }
                        if (hasError) {
                            alert('Please fill in all fields for each row (highlighted in red).');
                            return;
                        }

                        window.onbeforeunload = null;
                        var form = document.forms[0];

                        var cartField = document.getElementById('custpage_ns_cart_json');
                        if (cartField) {
                            cartField.value = JSON.stringify(gridData);
                        }

                        var actionInput = document.createElement('input');
                        actionInput.type = 'hidden';
                        actionInput.name = 'custpage_action';
                        actionInput.value = 'process_nonserialized_multi';
                        form.appendChild(actionInput);
                        form.submit();
                    }

                    function switchMode(mode) {
                        currentMode = mode;
                        var serialSection = document.getElementById('serialized-section');
                        var nonSerialSection = document.getElementById('non-serialized-section');
                        var binputawaySection = document.getElementById('binputaway-section');
                        var serialBtn = document.getElementById('mode-serialized');
                        var nonSerialBtn = document.getElementById('mode-nonserialized');
                        var binputawayBtn = document.getElementById('mode-binputaway');
                        var serialBtnArea = document.getElementById('serialized-btn-area');
                        var nonSerialBtnArea = document.getElementById('nonserialized-btn-area');
                        var binputawayBtnArea = document.getElementById('binputaway-btn-area');

                        // Hide all sections
                        serialSection.classList.remove('active');
                        nonSerialSection.classList.remove('active');
                        binputawaySection.classList.remove('active');
                        serialBtn.classList.remove('active');
                        nonSerialBtn.classList.remove('active');
                        binputawayBtn.classList.remove('active');
                        if (serialBtnArea) serialBtnArea.style.display = 'none';
                        if (nonSerialBtnArea) nonSerialBtnArea.style.display = 'none';
                        if (binputawayBtnArea) binputawayBtnArea.style.display = 'none';

                        if (mode === 'serialized') {
                            serialSection.classList.add('active');
                            serialBtn.classList.add('active');
                            if (serialBtnArea) serialBtnArea.style.display = 'flex';
                            var field = document.getElementById('custpage_serial_numbers');
                            if (field) field.focus();
                        } else if (mode === 'nonserialized') {
                            nonSerialSection.classList.add('active');
                            nonSerialBtn.classList.add('active');
                            if (nonSerialBtnArea) nonSerialBtnArea.style.display = 'flex';
                        } else if (mode === 'binputaway') {
                            binputawaySection.classList.add('active');
                            binputawayBtn.classList.add('active');
                            if (binputawayBtnArea) binputawayBtnArea.style.display = 'flex';
                        }
                    }

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

                    function submitNonSerialized() {
                        // NetSuite renders select fields with source differently
                        // Server-side will validate all fields, so just do basic checks here
                        var form = document.forms[0];

                        // For quantity, try to get the value for validation
                        var qtyValue = '';
                        var qtyField = document.getElementById('custpage_ns_quantity');
                        if (qtyField) qtyValue = qtyField.value;
                        if (!qtyValue) {
                            var qtyInputs = document.querySelectorAll('input[name="custpage_ns_quantity"]');
                            if (qtyInputs.length > 0) qtyValue = qtyInputs[0].value;
                        }
                        if (!qtyValue || parseInt(qtyValue) <= 0) {
                            alert('Please enter a valid quantity');
                            return;
                        }

                        // For action, check if selected - try multiple ways to find the value
                        var actionValue = '';
                        // Try direct ID
                        var actionField = document.getElementById('custpage_ns_action');
                        if (actionField) actionValue = actionField.value;
                        // Try display field (NetSuite pattern)
                        if (!actionValue) {
                            var actionDisplay = document.getElementById('inpt_custpage_ns_action');
                            if (actionDisplay && actionDisplay.value) actionValue = actionDisplay.value;
                        }
                        // Try by name
                        if (!actionValue) {
                            var actionByName = document.getElementsByName('custpage_ns_action')[0];
                            if (actionByName) actionValue = actionByName.value;
                        }
                        // Try hidden field pattern
                        if (!actionValue) {
                            var actionHidden = document.getElementById('hddn_custpage_ns_action');
                            if (actionHidden) actionValue = actionHidden.value;
                        }
                        if (!actionValue) {
                            alert('Please select an action');
                            return;
                        }

                        // For item - check display field has text (user selected something)
                        var itemDisplay = document.getElementById('inpt_custpage_ns_item');
                        if (itemDisplay && !itemDisplay.value.trim()) {
                            alert('Please select an item');
                            return;
                        }

                        window.onbeforeunload = null;
                        var action = document.createElement('input');
                        action.type = 'hidden'; action.name = 'custpage_action'; action.value = 'process_nonserialized';
                        form.appendChild(action);
                        form.submit();
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
                        form.appendChild(actionInput);
                        form.submit();
                    }

                    // ---- Bin Putaway functions ----
                    var bpCurrentMode = 'serialized';
                    var bpNsGridRowId = 0;

                    function switchBpMode(mode) {
                        bpCurrentMode = mode;
                        var serSection = document.getElementById('bp-serialized-section');
                        var nsSection = document.getElementById('bp-nonserialized-section');
                        var serBtn = document.getElementById('bp-mode-serialized');
                        var nsBtn = document.getElementById('bp-mode-nonserialized');

                        serSection.classList.remove('active');
                        nsSection.classList.remove('active');
                        serBtn.classList.remove('active');
                        nsBtn.classList.remove('active');

                        if (mode === 'serialized') {
                            serSection.classList.add('active');
                            serBtn.classList.add('active');
                            var f = document.getElementById('custpage_bp_serials');
                            if (f) f.focus();
                        } else {
                            nsSection.classList.add('active');
                            nsBtn.classList.add('active');
                        }
                    }

                    function updateBpCount() {
                        var field = document.getElementById('custpage_bp_serials');
                        var display = document.getElementById('bp_serial_count');
                        if (!field || !display) return;
                        var lines = field.value.split(/[\\r\\n]+/).filter(function(s) { return s.trim() !== ''; });
                        display.textContent = lines.length;
                    }

                    function addBpNsGridRow() {
                        var tbody = document.getElementById('bp-ns-grid-body');
                        if (!tbody) return;
                        bpNsGridRowId++;
                        var tr = document.createElement('tr');
                        tr.setAttribute('data-row-id', bpNsGridRowId);
                        tr.innerHTML = '<td data-label="SKU"><input type="text" class="bp-ns-item-input" data-row="' + bpNsGridRowId + '" placeholder="Enter SKU" style="width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; box-sizing:border-box;"></td>'
                            + '<td data-label="From Bin"><input type="text" class="bp-ns-frombin-input" data-row="' + bpNsGridRowId + '" list="bp-bin-datalist" autocomplete="off" placeholder="From Bin" style="min-width:120px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; box-sizing:border-box;"></td>'
                            + '<td data-label="To Bin"><input type="text" class="bp-ns-tobin-input" data-row="' + bpNsGridRowId + '" list="bp-bin-datalist" autocomplete="off" placeholder="To Bin" style="min-width:120px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; box-sizing:border-box;"></td>'
                            + '<td data-label="Qty"><input type="number" class="bp-ns-qty-input" data-row="' + bpNsGridRowId + '" placeholder="Qty" min="1" style="width:80px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;"></td>'
                            + '<td><button type="button" onclick="removeBpNsGridRow(' + bpNsGridRowId + ')" '
                            + 'style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:18px; padding:4px 8px;" '
                            + 'title="Remove">&times;</button></td>';
                        tbody.appendChild(tr);
                        updateBpNsRowCount();
                        var newInput = tr.querySelector('.bp-ns-item-input');
                        if (newInput) newInput.focus();
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

                    function clearBpNsGrid() {
                        var tbody = document.getElementById('bp-ns-grid-body');
                        if (tbody) tbody.innerHTML = '';
                        bpNsGridRowId = 0;
                        addBpNsGridRow();
                    }

                    function submitBinPutaway() {
                        if (bpCurrentMode === 'serialized') {
                            // Serialized bin putaway
                            var toBinSelect = document.getElementById('bp_to_bin');
                            var toBinValue = toBinSelect ? toBinSelect.value : '';
                            if (!toBinValue) { alert('Please select a destination bin.'); return; }

                            var serialField = document.getElementById('custpage_bp_serials');
                            if (!serialField || !serialField.value.trim()) { alert('Scan or enter at least one serial number.'); return; }

                            window.onbeforeunload = null;
                            var form = document.forms[0];

                            var bpToBinHidden = document.getElementById('custpage_bp_to_bin');
                            if (bpToBinHidden) bpToBinHidden.value = toBinValue;

                            var bpModeHidden = document.getElementById('custpage_bp_mode');
                            if (bpModeHidden) bpModeHidden.value = 'serialized';

                            var actionInput = document.createElement('input');
                            actionInput.type = 'hidden';
                            actionInput.name = 'custpage_action';
                            actionInput.value = 'process_bin_putaway';
                            form.appendChild(actionInput);
                            form.submit();
                        } else {
                            // Non-serialized bin putaway
                            var rows = document.querySelectorAll('#bp-ns-grid-body tr');
                            var gridData = [];
                            var hasError = false;

                            for (var i = 0; i < rows.length; i++) {
                                var row = rows[i];
                                var itemInput = row.querySelector('.bp-ns-item-input');
                                var fromBinInput = row.querySelector('.bp-ns-frombin-input');
                                var toBinInput = row.querySelector('.bp-ns-tobin-input');
                                var qtyInput = row.querySelector('.bp-ns-qty-input');

                                var itemName = itemInput ? itemInput.value.trim() : '';
                                var fromBin = fromBinInput ? fromBinInput.value.trim() : '';
                                var toBin = toBinInput ? toBinInput.value.trim() : '';
                                var qty = qtyInput ? parseInt(qtyInput.value) || 0 : 0;

                                if (!itemName && !fromBin && !toBin && qty === 0) continue;

                                if (!itemName) { if (itemInput) itemInput.style.border = '2px solid #ef4444'; hasError = true; }
                                else { if (itemInput) itemInput.style.border = '1px solid #e2e8f0'; }
                                if (!fromBin) { if (fromBinInput) fromBinInput.style.border = '2px solid #ef4444'; hasError = true; }
                                else { if (fromBinInput) fromBinInput.style.border = '1px solid #e2e8f0'; }
                                if (!toBin) { if (toBinInput) toBinInput.style.border = '2px solid #ef4444'; hasError = true; }
                                else { if (toBinInput) toBinInput.style.border = '1px solid #e2e8f0'; }
                                if (qty <= 0) { if (qtyInput) qtyInput.style.border = '2px solid #ef4444'; hasError = true; }
                                else { if (qtyInput) qtyInput.style.border = '1px solid #e2e8f0'; }

                                gridData.push({ itemName: itemName, fromBinNumber: fromBin, toBinNumber: toBin, quantity: qty });
                            }

                            if (gridData.length === 0) { alert('Please fill in at least one row.'); return; }
                            if (hasError) { alert('Please fill in all fields for each row (highlighted in red).'); return; }

                            window.onbeforeunload = null;
                            var form = document.forms[0];

                            var cartField = document.getElementById('custpage_bp_cart_json');
                            if (cartField) cartField.value = JSON.stringify(gridData);

                            var bpModeHidden = document.getElementById('custpage_bp_mode');
                            if (bpModeHidden) bpModeHidden.value = 'nonserialized';

                            var actionInput = document.createElement('input');
                            actionInput.type = 'hidden';
                            actionInput.name = 'custpage_action';
                            actionInput.value = 'process_bin_putaway';
                            form.appendChild(actionInput);
                            form.submit();
                        }
                    }

                    function clearForm() {
                        if (currentMode === 'serialized') {
                            var field = document.getElementById('custpage_serial_numbers');
                            if (field) field.value = '';
                            updateCount();
                        } else if (currentMode === 'nonserialized') {
                            clearNsGrid();
                        } else if (currentMode === 'binputaway') {
                            if (bpCurrentMode === 'serialized') {
                                var bpField = document.getElementById('custpage_bp_serials');
                                if (bpField) bpField.value = '';
                                updateBpCount();
                                var toBinSelect = document.getElementById('bp_to_bin');
                                if (toBinSelect) toBinSelect.selectedIndex = 0;
                            } else {
                                clearBpNsGrid();
                            }
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
                        // Don't apply serial change actions via bulk action since each needs unique new serial
                        if (value === 'serial_change' || value === 'serial_change_stock') {
                            alert('Serial change actions must be set individually for each serial.');
                            return;
                        }

                        // Show/hide bulk new item input for part number change
                        var bulkNewItem = document.getElementById('bulk-new-item');
                        if (bulkNewItem) {
                            if (value === 'part_number_change' || value === 'part_number_change_stock') {
                                bulkNewItem.style.display = 'block';
                            } else {
                                bulkNewItem.style.display = 'none';
                                bulkNewItem.value = '';
                            }
                        }

                        // For part number change, require item name before applying
                        if (value === 'part_number_change' || value === 'part_number_change_stock') {
                            var bulkItemName = bulkNewItem ? bulkNewItem.value.trim() : '';
                            if (!bulkItemName) {
                                // Just show the input, don't apply yet — user needs to type item name first
                                // Set the dropdowns so user sees the selection, populate item names on submit
                                var selects = document.querySelectorAll('select.action-select[data-index]');
                                for (var i = 0; i < selects.length; i++) {
                                    selects[i].value = value;
                                    handleActionChange(selects[i]);
                                }
                                updateActionCount();
                                bulkNewItem.focus();
                                return;
                            }
                            // Populate all per-row new-item-input fields with the bulk value
                            var itemInputs = document.querySelectorAll('.new-item-input[data-index]');
                            for (var j = 0; j < itemInputs.length; j++) {
                                itemInputs[j].value = bulkItemName;
                            }
                        }

                        // Select only row dropdowns (those with data-index attribute)
                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        for (var i = 0; i < selects.length; i++) {
                            selects[i].value = value;
                            handleActionChange(selects[i]);
                        }
                        updateActionCount();
                    }

                    function handleActionChange(selectEl) {
                        var idx = selectEl.getAttribute('data-index');
                        var newSerialInput = document.querySelector('.new-serial-input[data-index="' + idx + '"]');
                        if (newSerialInput) {
                            if (selectEl.value === 'serial_change' || selectEl.value === 'serial_change_stock') {
                                newSerialInput.style.display = 'block';
                                newSerialInput.required = true;
                            } else {
                                newSerialInput.style.display = 'none';
                                newSerialInput.required = false;
                                newSerialInput.value = '';
                            }
                        }
                        var newItemInput = document.querySelector('.new-item-input[data-index="' + idx + '"]');
                        if (newItemInput) {
                            if (selectEl.value === 'part_number_change' || selectEl.value === 'part_number_change_stock') {
                                newItemInput.style.display = 'block';
                                newItemInput.required = true;
                            } else {
                                newItemInput.style.display = 'none';
                                newItemInput.required = false;
                                newItemInput.value = '';
                            }
                        }
                        updateActionCount();
                    }

                    function updateActionCount() {
                        // Select only row dropdowns (those with data-index attribute)
                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        var count = 0;
                        for (var i = 0; i < selects.length; i++) {
                            if (selects[i].value !== '') count++;
                        }
                        var display = document.getElementById('action_count');
                        if (display) display.textContent = count;
                    }

                    function submitActions() {
                        // Select only row dropdowns (those with data-index attribute)
                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        var actions = [];
                        var hasAction = false;
                        var missingNewSerial = false;
                        var missingNewItem = false;

                        // Get bulk item name if present (for part number change via Apply to All)
                        var bulkNewItem = document.getElementById('bulk-new-item');
                        var bulkItemName = bulkNewItem ? bulkNewItem.value.trim() : '';

                        for (var i = 0; i < selects.length; i++) {
                            var idx = selects[i].getAttribute('data-index');
                            var val = selects[i].value;
                            var newSerial = '';
                            var newItemName = '';

                            if (val === 'serial_change' || val === 'serial_change_stock') {
                                var newSerialInput = document.querySelector('.new-serial-input[data-index="' + idx + '"]');
                                if (newSerialInput) {
                                    newSerial = newSerialInput.value.trim();
                                    if (!newSerial) {
                                        missingNewSerial = true;
                                        newSerialInput.style.border = '2px solid #ef4444';
                                    } else {
                                        newSerialInput.style.border = '1px solid #e2e8f0';
                                    }
                                }
                            }

                            if (val === 'part_number_change' || val === 'part_number_change_stock') {
                                var newItemInput = document.querySelector('.new-item-input[data-index="' + idx + '"]');
                                if (newItemInput) {
                                    newItemName = newItemInput.value.trim();
                                    // If per-row is empty but bulk has a value, use bulk
                                    if (!newItemName && bulkItemName) {
                                        newItemName = bulkItemName;
                                        newItemInput.value = bulkItemName;
                                    }
                                    if (!newItemName) {
                                        missingNewItem = true;
                                        newItemInput.style.border = '2px solid #ef4444';
                                    } else {
                                        newItemInput.style.border = '1px solid #e2e8f0';
                                    }
                                }
                            }

                            actions.push({ index: parseInt(idx), action: val, newSerial: newSerial, newItemName: newItemName });
                            if (val !== '') hasAction = true;
                        }

                        if (!hasAction) { alert('Select an action for at least one serial number'); return; }
                        if (missingNewSerial) { alert('Please enter a new serial number for all Serial Number Change actions'); return; }
                        if (missingNewItem) { alert('Please enter a new item name for all Part Number Change actions'); return; }

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
                        // Select only row dropdowns (those with data-index attribute)
                        var selects = document.querySelectorAll('select.action-select[data-index]');
                        for (var i = 0; i < selects.length; i++) {
                            selects[i].addEventListener('change', function() { handleActionChange(this); });
                        }
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
                        form.appendChild(action);
                        form.submit();
                        form.removeChild(action);
                        form.target = '';
                    }
                    function createAnother() { window.location.href = '${escapeForJs(suiteletUrl)}'; }
                </script>
            `;
        }

        // ====================================================================
        // PAGE BUILDERS
        // ====================================================================

        function createEntryForm(context, message, messageType, prefill) {
            const form = serverWidget.createForm({ title: 'Warehouse Assistant Dashboard' });

            // Pre-load bins for the non-serialized grid dropdowns
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
                msgHtml = `<div class="alert ${cls}">${message}</div>`;
            }

            const containerStart = form.addField({ id: 'custpage_container_start', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerStart.defaultValue = `
                <div class="app-container">
                    ${msgHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>Warehouse Assistant Dashboard</h1>
                            <p>I'm here to help.</p>
                        </div>
                        <div class="form-body">
                            <div class="mode-toggle">
                                <button type="button" id="mode-serialized" class="mode-btn active" onclick="switchMode('serialized')">Serialized Items</button>
                                <button type="button" id="mode-nonserialized" class="mode-btn" onclick="switchMode('nonserialized')">Non-Serialized Items</button>
                                <button type="button" id="mode-binputaway" class="mode-btn" onclick="switchMode('binputaway')">Bin Putaway</button>
                            </div>

                            <!-- Serialized Items Section -->
                            <div id="serialized-section" class="form-section active">
                                <div class="input-group">
                                    <label class="custom-label">Serial Numbers <span class="badge-count"><span id="serial_count">0</span> scanned</span></label>
                                    <div id="serial-field-wrap"></div>
                                </div>
                            </div>

                            <!-- Non-Serialized Items Section — Grid View -->
                            <div id="non-serialized-section" class="form-section">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                    <label class="custom-label" style="margin-bottom:0;">
                                        Items to Process
                                        <span class="badge-count"><span id="ns_row_count">1</span> rows</span>
                                    </label>
                                    <button type="button" class="custom-btn btn-outline" style="padding:6px 14px; font-size:12px; margin:0;" onclick="addNsGridRow()">+ Add Row</button>
                                </div>
                                <table class="results-table" id="ns-grid-table">
                                    <thead>
                                        <tr>
                                            <th style="width:35%;">Part Number / SKU</th>
                                            <th>From Bin</th>
                                            <th>Qty</th>
                                            <th>Action</th>
                                            <th style="width:40px;"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="ns-grid-body"></tbody>
                                </table>
                            </div>

                            <!-- Bin Putaway Section -->
                            <div id="binputaway-section" class="form-section">
                                <div class="mode-toggle" style="margin-bottom:20px;">
                                    <button type="button" id="bp-mode-serialized" class="mode-btn active" onclick="switchBpMode('serialized')">Serialized</button>
                                    <button type="button" id="bp-mode-nonserialized" class="mode-btn" onclick="switchBpMode('nonserialized')">Non-Serialized</button>
                                </div>

                                <!-- Bin Putaway - Serialized Sub-section -->
                                <datalist id="bp-bin-datalist">${bpBinDatalistHtml}</datalist>
                                <div id="bp-serialized-section" class="form-section active">
                                    <div class="input-group">
                                        <label class="custom-label">Destination Bin</label>
                                        <input type="text" id="bp_to_bin" list="bp-bin-datalist" autocomplete="off" placeholder="Type or select a bin" style="width:100%; padding:14px 16px; border:2px solid #e2e8f0; border-radius:12px; font-size:14px; background:#f8fafc; box-sizing:border-box;">
                                    </div>
                                    <div class="input-group">
                                        <label class="custom-label">Serial Numbers <span class="badge-count"><span id="bp_serial_count">0</span> scanned</span></label>
                                        <div id="bp-serial-field-wrap"></div>
                                    </div>
                                </div>

                                <!-- Bin Putaway - Non-Serialized Sub-section -->
                                <div id="bp-nonserialized-section" class="form-section">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                        <label class="custom-label" style="margin-bottom:0;">
                                            Items to Put Away
                                            <span class="badge-count"><span id="bp_ns_row_count">1</span> rows</span>
                                        </label>
                                        <button type="button" class="custom-btn btn-outline" style="padding:6px 14px; font-size:12px; margin:0;" onclick="addBpNsGridRow()">+ Add Row</button>
                                    </div>
                                    <table class="results-table" id="bp-ns-grid-table">
                                        <thead>
                                            <tr>
                                                <th>Part Number / SKU</th>
                                                <th>From Bin</th>
                                                <th>To Bin</th>
                                                <th>Qty</th>
                                                <th style="width:40px;"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="bp-ns-grid-body"></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <!-- Buttons pinned outside scrollable area -->
                        <div id="serialized-btn-area" class="btn-area">
                            <button type="button" class="custom-btn btn-success" onclick="submitSerials()">Submit</button>
                            <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                            <button type="button" class="custom-btn btn-outline" style="padding:6px 14px; font-size:12px;" onclick="showInventoryFoundModal()">Inventory Found</button>
                        </div>
                        <div id="nonserialized-btn-area" class="btn-area" style="display:none;">
                            <button type="button" class="custom-btn btn-success" onclick="submitNonSerializedMulti()">Submit</button>
                            <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                            <button type="button" class="custom-btn btn-outline" style="padding:6px 14px; font-size:12px;" onclick="showInventoryFoundModal()">Inventory Found</button>
                        </div>
                        <div id="binputaway-btn-area" class="btn-area" style="display:none;">
                            <button type="button" class="custom-btn btn-success" onclick="submitBinPutaway()">Put Away</button>
                            <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                        </div>
                    </div>
                </div>

                <!-- Inventory Found Modal -->
                <div id="inventoryFoundModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; justify-content:center; align-items:center;">
                    <div style="background:#fff; border-radius:12px; padding:32px; max-width:500px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                        <h2 style="margin:0 0 8px; color:#1e3c72; font-size:20px;">Inventory Found</h2>
                        <p style="margin:0 0 20px; color:#64748b; font-size:14px;">Enter the item name and serial number(s) to adjust in.</p>

                        <label style="display:block; font-weight:600; margin-bottom:6px; color:#334155; font-size:14px;">Item Name / SKU</label>
                        <input type="text" id="if_item_name" placeholder="Enter exact item name" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; margin-bottom:16px; box-sizing:border-box;">

                        <label style="display:block; font-weight:600; margin-bottom:6px; color:#334155; font-size:14px;">Serial Numbers (one per line)</label>
                        <textarea id="if_serials" rows="6" placeholder="Scan or type serial numbers, one per line" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:14px; resize:vertical; margin-bottom:20px; box-sizing:border-box;"></textarea>

                        <div style="display:flex; gap:12px; justify-content:flex-end;">
                            <button type="button" class="custom-btn btn-outline" style="padding:10px 20px; margin:0;" onclick="hideInventoryFoundModal()">Cancel</button>
                            <button type="button" class="custom-btn btn-success" style="padding:10px 20px; margin:0; background:linear-gradient(135deg,#059669,#047857);" onclick="submitInventoryFound()">Submit</button>
                        </div>
                    </div>
                </div>

                <div style="display:none;">
            `;

            // Serialized field
            const serialField = form.addField({ id: 'custpage_serial_numbers', type: serverWidget.FieldType.TEXTAREA, label: 'Serials' });
            serialField.updateDisplaySize({ height: 10, width: 60 });

            // Non-serialized fields (hidden — grid uses its own HTML inputs)
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

            // Hidden fields for Inventory Found modal
            const ifItemField = form.addField({ id: 'custpage_if_item_name', type: serverWidget.FieldType.TEXT, label: 'IF Item' });
            ifItemField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            ifItemField.defaultValue = '';

            const ifSerialsField = form.addField({ id: 'custpage_if_serials', type: serverWidget.FieldType.LONGTEXT, label: 'IF Serials' });
            ifSerialsField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            ifSerialsField.defaultValue = '';

            // Hidden field for Non-Serialized multi-row cart data
            const nsCartDataField = form.addField({ id: 'custpage_ns_cart_json', type: serverWidget.FieldType.LONGTEXT, label: 'NS Cart Data' });
            nsCartDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            nsCartDataField.defaultValue = '';

            // Bin Putaway fields
            const bpSerialsField = form.addField({ id: 'custpage_bp_serials', type: serverWidget.FieldType.TEXTAREA, label: 'BP Serials' });
            bpSerialsField.updateDisplaySize({ height: 10, width: 60 });
            if (prefill && prefill.bpSerials) bpSerialsField.defaultValue = prefill.bpSerials;

            const bpToBinField = form.addField({ id: 'custpage_bp_to_bin', type: serverWidget.FieldType.TEXT, label: 'BP To Bin' });
            bpToBinField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            bpToBinField.defaultValue = (prefill && prefill.bpToBin) || '';

            const bpCartDataField = form.addField({ id: 'custpage_bp_cart_json', type: serverWidget.FieldType.LONGTEXT, label: 'BP Cart Data' });
            bpCartDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            bpCartDataField.defaultValue = '';

            const bpModeField = form.addField({ id: 'custpage_bp_mode', type: serverWidget.FieldType.TEXT, label: 'BP Mode' });
            bpModeField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            bpModeField.defaultValue = '';

            // Build prefill script to restore state on error
            let prefillScript = '';
            if (prefill && prefill.mode === 'binputaway') {
                const escapedToBin = (prefill.bpToBin || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                prefillScript = `
                    // Auto-switch to Bin Putaway tab and restore state
                    switchMode('binputaway');
                    ${prefill.bpMode === 'nonserialized' ? "switchBpMode('nonserialized');" : ''}
                    var bpToBinInput = document.getElementById('bp_to_bin');
                    if (bpToBinInput) bpToBinInput.value = '${escapedToBin}';
                    updateBpCount();
                `;
            }

            const containerEnd = form.addField({ id: 'custpage_container_end', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerEnd.defaultValue = `</div>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    // Move serialized field to its wrapper
                    var serialWrap = document.getElementById('serial-field-wrap');
                    var serialLabel = document.getElementById('custpage_serial_numbers_fs_lbl_uir_label');
                    if (serialWrap && serialLabel) serialWrap.appendChild(serialLabel.parentNode);

                    // Move bin putaway serials field to its wrapper
                    var bpSerialWrap = document.getElementById('bp-serial-field-wrap');
                    var bpSerialLabel = document.getElementById('custpage_bp_serials_fs_lbl_uir_label');
                    if (bpSerialWrap && bpSerialLabel) bpSerialWrap.appendChild(bpSerialLabel.parentNode);

                    updateCount();

                    // Initialize the non-serialized grid with one empty row
                    addNsGridRow();

                    // Initialize the bin putaway non-serialized grid with one empty row
                    addBpNsGridRow();

                    // Bind bp serial count
                    var bpField = document.getElementById('custpage_bp_serials');
                    if (bpField) {
                        bpField.addEventListener('input', updateBpCount);
                        bpField.addEventListener('paste', function() { setTimeout(updateBpCount, 50); });
                    }

                    ${prefillScript}
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
                    <td data-label="Serial" style="font-family: 'SF Mono', Monaco, monospace; font-size: 14px;">${escapeXml(s.serialNumber)}</td>
                    <td data-label="Item"><strong>${escapeXml(s.itemText)}</strong></td>
                    <td data-label="Bin">${escapeXml(s.binText) || '<span style="color:#94a3b8;">N/A</span>'}</td>
                    <td data-label="Location">${escapeXml(s.locationText) || '<span style="color:#94a3b8;">N/A</span>'}</td>
                    <td data-label="Action">
                        <select class="action-select" data-index="${idx}" onchange="handleActionChange(this)">
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
                        </select>
                        <input type="text" class="new-serial-input" data-index="${idx}" placeholder="Enter new serial" style="display:none; margin-top:8px; width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
                        <input type="text" class="new-item-input" data-index="${idx}" placeholder="Enter new item name" style="display:none; margin-top:8px; width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
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
                <div class="app-container app-container-wide">
                    ${msgHtml}
                    ${invalidHtml}
                    <div class="main-card">
                        <div class="card-header">
                            <h1>Serial Lookup Results</h1>
                            <p>${serialData.valid.length} serial${serialData.valid.length !== 1 ? 's' : ''} found in stock</p>
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
                                </select>
                                <input type="text" id="bulk-new-item" placeholder="Enter new item name" style="display:none; flex:1; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <span style="color:#64748b; font-weight:500;">With Action:</span>
                                    <span style="font-size:22px; font-weight:700; color:#1e3c72;" id="action_count">0</span>
                                    <button type="button" class="custom-btn btn-success" style="padding:10px 20px; margin:0;" onclick="submitActions()">Submit</button>
                                    <button type="button" class="custom-btn btn-outline" style="padding:10px 20px; margin:0;" onclick="goBack()">Back</button>
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

        function createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true
            });

            // Create print label records for each group
            labelGroups.forEach((group, idx) => {
                try {
                    const rec = record.create({ type: 'customrecord_print_label', isDynamic: true });
                    rec.setValue({ fieldId: 'custrecord_pl_item_number', value: group.itemId });
                    rec.setValue({ fieldId: 'custrecord_express_entry', value: group.serialNumbers.join('<br>') });
                    const recordId = rec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                    group.recordId = recordId;
                    log.audit('Print Label Created', 'ID: ' + recordId + ', Item: ' + group.itemText + ', Labels: ' + group.serialNumbers.length);
                } catch (e) {
                    log.error('Print Label Record Error', e.message);
                    group.recordId = 'ERR';
                }
            });

            // Build combined label data for single print job
            const printData = labelGroups.map(g => ({
                itemText: g.itemText || '',
                description: g.description || '',
                serialNumbers: g.serialNumbers
            }));

            // Use whichever transaction ID is available for the print job
            const recordIdForPrint = adjustmentTranId || binTransferTranId || serialChangeTranId || partNumberChangeTranId || '';

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl);

            // Hidden fields for print data (submitted via POST to avoid URL length limits)
            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printDataField.defaultValue = JSON.stringify(printData);

            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printRecordIdField.defaultValue = String(recordIdForPrint);

            // Build label group sections (display only, no individual print buttons)
            let groupsHtml = '';
            labelGroups.forEach((group, idx) => {
                const serialListHtml = group.serialNumbers.map(s => `<li>${escapeXml(s)}</li>`).join('');
                const actionLabel = {
                    'back_to_stock': 'Back to Stock',
                    'defective': 'Defective',
                    'likenew': 'Like New',
                    'likenew_stock': 'Like New + Back to Stock',
                    'move_refurbishing': 'Move to Refurbishing',
                    'move_testing': 'Move to Testing',
                    'return_to_vendor': 'Return to Vendor',
                    'serial_change': 'Serial Number Change',
                    'serial_change_stock': 'Change Serial & Back to Stock',
                    'part_number_change': 'Part Number Change',
                    'part_number_change_stock': 'Part Number Change & Back to Stock',
                    'trash': 'Trash',
                    'inventory_found': 'Inventory Found',
                    'bin_putaway': 'Bin Putaway'
                }[group.action] || group.action;

                groupsHtml += `
                    <div class="label-group">
                        <h3>${escapeXml(group.itemText)}</h3>
                        <p style="color:#64748b; margin:0 0 12px; font-size:14px;">
                            ${group.serialNumbers.length} label${group.serialNumbers.length !== 1 ? 's' : ''}
                            &bull; ${actionLabel}
                        </p>
                        <ul class="serial-list">${serialListHtml}</ul>
                    </div>
                `;
            });

            const totalSerials = labelGroups.reduce((sum, g) => sum + g.serialNumbers.length, 0);

            // Build transaction info lines
            let transactionInfoHtml = '';
            if (adjustmentTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Inventory Adjustment:</strong> ${escapeXml(String(adjustmentTranId))}</p>`;
            }
            if (binTransferTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Bin Transfer:</strong> ${escapeXml(String(binTransferTranId))}</p>`;
            }
            if (serialChangeTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Serial Number Change:</strong> ${escapeXml(String(serialChangeTranId))}</p>`;
            }
            if (partNumberChangeTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Part Number Change:</strong> ${escapeXml(String(partNumberChangeTranId))}</p>`;
            }
            if (inventoryFoundTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Inventory Found:</strong> ${escapeXml(String(inventoryFoundTranId))}</p>`;
            }

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    <div class="main-card">
                        <div class="form-body">
                            <div class="success-card">
                                <div class="success-icon">&#10003;</div>
                                <h2>Transactions have been created!</h2>
                                ${transactionInfoHtml}
                                <p style="color:#64748b; margin-top:16px;">${totalSerials} serial${totalSerials !== 1 ? 's' : ''} processed</p>

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

            // Build map of index → action (including newSerial for serial_change, newItemName for part_number_change)
            const actionMap = {};
            actions.forEach(a => {
                if (a.action && a.action !== '') {
                    actionMap[a.index] = { action: a.action, newSerial: a.newSerial || '', newItemName: a.newItemName || '' };
                }
            });

            if (Object.keys(actionMap).length === 0) {
                createResultsPage(context, serialData, 'Select an action for at least one serial number.', 'warning');
                return;
            }

            // Separate actions into adjustment vs bin transfer vs serial change vs part number change vs inventory found
            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const SERIAL_CHANGE_ACTIONS = ['serial_change', 'serial_change_stock'];
            const PART_NUMBER_CHANGE_ACTIONS = ['part_number_change', 'part_number_change_stock'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];

            const errors = [];
            const itemDetailsCache = {}; // itemId → { itemid, displayname, description }
            const targetItemCache = {}; // sourceItemId → { found, targetItem } (for adjustment actions)
            const partNumberTargetCache = {}; // itemName → { found, targetItem } (for part number change actions)

            // Groups for inventory adjustment (condition change)
            const adjustmentGroupMap = {};
            // Groups for bin transfer (move to testing/refurbishing)
            const binTransferGroupMap = {};
            // List for serial number changes (each is processed individually)
            const serialChangeList = [];
            // List for part number changes
            const partNumberChangeList = [];
            // Groups for inventory found (adjust in at avg cost)
            const inventoryFoundGroupMap = {};

            for (const [idxStr, actionData] of Object.entries(actionMap)) {
                const idx = parseInt(idxStr, 10);
                const serial = serialData.valid[idx];
                if (!serial) continue;

                const action = actionData.action;
                const newItemName = actionData.newItemName;
                const newSerial = actionData.newSerial;
                const itemId = serial.itemId;

                // Cache item details
                if (!itemDetailsCache[itemId]) {
                    const details = getItemDetails(itemId);
                    if (details) {
                        itemDetailsCache[itemId] = details;
                    } else {
                        errors.push('Could not look up item details for: ' + serial.itemText);
                        continue;
                    }
                }

                const itemDetails = itemDetailsCache[itemId];

                if (ADJUSTMENT_ACTIONS.includes(action)) {
                    // --- ADJUSTMENT ACTION: Need to find -LN target item ---
                    if (!targetItemCache[itemId]) {
                        const likeNewName = getLikeNewItemName(itemDetails.itemid);
                        const targetItem = findItemByName(likeNewName);

                        if (!targetItem) {
                            errors.push('Like New item not found: ' + likeNewName + ' (source: ' + itemDetails.itemid + ')');
                            targetItemCache[itemId] = { found: false };
                        } else {
                            targetItemCache[itemId] = { found: true, targetItem: targetItem };
                        }
                    }

                    const cache = targetItemCache[itemId];
                    if (!cache.found) continue;

                    const key = itemId + '_' + serial.locationId + '_' + action;
                    if (!adjustmentGroupMap[key]) {
                        adjustmentGroupMap[key] = {
                            sourceItemId: itemId,
                            sourceItemName: itemDetails.itemid,
                            targetItemId: cache.targetItem.id,
                            targetItemName: cache.targetItem.itemid,
                            targetDisplayName: cache.targetItem.displayname,
                            targetDescription: cache.targetItem.description,
                            locationId: serial.locationId,
                            action: action,
                            serials: []
                        };
                    }
                    adjustmentGroupMap[key].serials.push({
                        serialNumber: serial.serialNumber,
                        serialId: serial.serialId,
                        binId: serial.binId
                    });

                } else if (BIN_TRANSFER_ACTIONS.includes(action)) {
                    // --- BIN TRANSFER ACTION: Same item, just move bin/status ---
                    const key = itemId + '_' + serial.locationId + '_' + action;
                    if (!binTransferGroupMap[key]) {
                        binTransferGroupMap[key] = {
                            itemId: itemId,
                            itemText: itemDetails.displayname || itemDetails.itemid,
                            itemDescription: itemDetails.description,
                            locationId: serial.locationId,
                            action: action,
                            serials: []
                        };
                    }
                    binTransferGroupMap[key].serials.push({
                        serialNumber: serial.serialNumber,
                        serialId: serial.serialId,
                        binId: serial.binId
                    });

                } else if (SERIAL_CHANGE_ACTIONS.includes(action)) {
                    // --- SERIAL NUMBER CHANGE: Same item, remove old serial, add new serial ---
                    if (!newSerial) {
                        errors.push('New serial number required for: ' + serial.serialNumber);
                        continue;
                    }
                    serialChangeList.push({
                        itemId: itemId,
                        itemText: itemDetails.displayname || itemDetails.itemid,
                        itemDescription: itemDetails.description,
                        locationId: serial.locationId,
                        oldSerialNumber: serial.serialNumber,
                        oldSerialId: serial.serialId,
                        newSerialNumber: newSerial,
                        binId: serial.binId,
                        statusId: serial.statusId,
                        action: action  // 'serial_change' or 'serial_change_stock'
                    });

                } else if (PART_NUMBER_CHANGE_ACTIONS.includes(action)) {
                    // --- PART NUMBER CHANGE: Move serial from old item to new (target) item ---
                    if (!newItemName) {
                        errors.push('New item name required for: ' + serial.serialNumber);
                        continue;
                    }

                    // Look up target item by name (cache to avoid repeated lookups)
                    if (!partNumberTargetCache[newItemName]) {
                        const targetItem = findItemByName(newItemName);
                        if (!targetItem) {
                            errors.push('Item not found: ' + newItemName + ' (for serial ' + serial.serialNumber + ')');
                            partNumberTargetCache[newItemName] = { found: false };
                        } else {
                            partNumberTargetCache[newItemName] = { found: true, targetItem: targetItem };
                        }
                    }

                    const pnCache = partNumberTargetCache[newItemName];
                    if (!pnCache.found) continue;

                    partNumberChangeList.push({
                        oldItemId: itemId,
                        oldItemText: itemDetails.displayname || itemDetails.itemid,
                        newItemId: pnCache.targetItem.id,
                        newItemName: pnCache.targetItem.itemid,
                        newItemText: pnCache.targetItem.displayname || pnCache.targetItem.itemid,
                        newItemDescription: pnCache.targetItem.description,
                        locationId: serial.locationId,
                        serialNumber: serial.serialNumber,
                        serialId: serial.serialId,
                        binId: serial.binId,
                        statusId: serial.statusId,
                        action: action  // 'part_number_change' or 'part_number_change_stock'
                    });

                } else if (INVENTORY_FOUND_ACTIONS.includes(action)) {
                    // --- INVENTORY FOUND: Adjust item in at avg cost, bin 3555, status 1 ---
                    const key = itemId + '_' + serial.locationId + '_' + action;
                    if (!inventoryFoundGroupMap[key]) {
                        inventoryFoundGroupMap[key] = {
                            itemId: itemId,
                            itemText: itemDetails.displayname || itemDetails.itemid,
                            itemDescription: itemDetails.description,
                            locationId: serial.locationId,
                            action: action,
                            serials: []
                        };
                    }
                    inventoryFoundGroupMap[key].serials.push({
                        serialNumber: serial.serialNumber,
                        serialId: serial.serialId,
                        binId: serial.binId
                    });
                }
            }

            const adjustmentGroups = Object.values(adjustmentGroupMap);
            const binTransferGroups = Object.values(binTransferGroupMap);
            const inventoryFoundGroups = Object.values(inventoryFoundGroupMap);

            if (adjustmentGroups.length === 0 && binTransferGroups.length === 0 && serialChangeList.length === 0 && partNumberChangeList.length === 0 && inventoryFoundGroups.length === 0) {
                const errMsg = errors.length > 0
                    ? 'Could not process: ' + errors.join('; ')
                    : 'No valid serials to process.';
                createResultsPage(context, serialData, errMsg, 'error');
                return;
            }

            if (errors.length > 0) {
                log.audit('Process Actions Warnings', errors.join(' | '));
            }

            // Track transaction IDs for display
            let adjustmentTranId = null;
            let binTransferTranId = null;
            let serialChangeTranId = null;
            let partNumberChangeTranId = null;
            let inventoryFoundTranId = null;
            const labelGroups = [];

            // --- Process Inventory Adjustments (condition change to -LN) ---
            if (adjustmentGroups.length > 0) {
                try {
                    const adjResult = createConditionChangeAdjustment(adjustmentGroups, 'Created through Warehouse Assistant Dashboard.');
                    log.audit('Inventory Adjustment Created', 'TranID: ' + adjResult.tranId);
                    adjustmentTranId = adjResult.tranId;

                    // Build label groups for adjustment (use target -LN item)
                    adjustmentGroups.forEach(group => {
                        const tKey = group.targetItemId + '_' + group.action;
                        let existing = labelGroups.find(lg => lg.itemId === group.targetItemId && lg.action === group.action);
                        if (!existing) {
                            existing = {
                                itemId: group.targetItemId,
                                itemText: group.targetDisplayName || group.targetItemName,
                                description: group.targetDescription,
                                action: group.action,
                                serialNumbers: []
                            };
                            labelGroups.push(existing);
                        }
                        group.serials.forEach(s => existing.serialNumbers.push(s.serialNumber));
                    });
                } catch (e) {
                    log.error('Inventory Adjustment Error', e.message + ' | ' + e.stack);
                    createResultsPage(context, serialData, 'Inventory adjustment failed: ' + e.message, 'error');
                    return;
                }
            }

            // --- Process Bin Transfers (move to testing/refurbishing) ---
            if (binTransferGroups.length > 0) {
                try {
                    const transferResult = createBinTransfer(binTransferGroups, 'Via Warehouse Assistant Dashboard');
                    log.audit('Bin Transfer Created', 'TranID: ' + transferResult.tranId);
                    binTransferTranId = transferResult.tranId;

                    // Build label groups for bin transfer (same item)
                    binTransferGroups.forEach(group => {
                        let existing = labelGroups.find(lg => lg.itemId === group.itemId && lg.action === group.action);
                        if (!existing) {
                            existing = {
                                itemId: group.itemId,
                                itemText: group.itemText,
                                description: group.itemDescription,
                                action: group.action,
                                serialNumbers: []
                            };
                            labelGroups.push(existing);
                        }
                        group.serials.forEach(s => existing.serialNumbers.push(s.serialNumber));
                    });
                } catch (e) {
                    log.error('Bin Transfer Error', e.message + ' | ' + e.stack);
                    createResultsPage(context, serialData, 'Bin transfer failed: ' + e.message, 'error');
                    return;
                }
            }

            // --- Process Serial Number Changes ---
            if (serialChangeList.length > 0) {
                try {
                    const serialChangeResult = createSerialNumberChangeAdjustment(serialChangeList, 'Serial Number Change via Warehouse Assistant Dashboard');
                    log.audit('Serial Number Change Adjustment Created', 'TranID: ' + serialChangeResult.tranId);
                    serialChangeTranId = serialChangeResult.tranId;

                    // Build label groups for serial changes (use new serial numbers)
                    serialChangeList.forEach(change => {
                        let existing = labelGroups.find(lg => lg.itemId === change.itemId && lg.action === change.action);
                        if (!existing) {
                            existing = {
                                itemId: change.itemId,
                                itemText: change.itemText,
                                description: change.itemDescription,
                                action: change.action,
                                serialNumbers: []
                            };
                            labelGroups.push(existing);
                        }
                        existing.serialNumbers.push(change.newSerialNumber);
                    });
                } catch (e) {
                    log.error('Serial Number Change Error', e.message + ' | ' + e.stack);
                    createResultsPage(context, serialData, 'Serial number change failed: ' + e.message, 'error');
                    return;
                }
            }

            // --- Process Part Number Changes ---
            if (partNumberChangeList.length > 0) {
                try {
                    const partNumberChangeResult = createPartNumberChangeAdjustment(partNumberChangeList, 'Part Number Change via Warehouse Assistant Dashboard');
                    log.audit('Part Number Change Adjustment Created', 'TranID: ' + partNumberChangeResult.tranId);
                    partNumberChangeTranId = partNumberChangeResult.tranId;

                    // Build label groups for part number changes (use new item, same serial)
                    partNumberChangeList.forEach(change => {
                        let existing = labelGroups.find(lg => lg.itemId === change.newItemId && lg.action === change.action);
                        if (!existing) {
                            existing = {
                                itemId: change.newItemId,
                                itemText: change.newItemText,
                                description: change.newItemDescription,
                                action: change.action,
                                serialNumbers: []
                            };
                            labelGroups.push(existing);
                        }
                        existing.serialNumbers.push(change.serialNumber);
                    });
                } catch (e) {
                    log.error('Part Number Change Error', e.message + ' | ' + e.stack);
                    createResultsPage(context, serialData, 'Part number change failed: ' + e.message, 'error');
                    return;
                }
            }

            // --- Process Inventory Found (adjust in at average cost) ---
            if (inventoryFoundGroups.length > 0) {
                try {
                    const foundResult = createInventoryFoundAdjustment(inventoryFoundGroups, 'Inventory Found — via Warehouse Assistant Dashboard.');
                    log.audit('Inventory Found Adjustment Created', 'TranID: ' + foundResult.tranId);
                    inventoryFoundTranId = foundResult.tranId;

                    // Build label groups for inventory found (same item)
                    inventoryFoundGroups.forEach(group => {
                        let existing = labelGroups.find(lg => lg.itemId === group.itemId && lg.action === group.action);
                        if (!existing) {
                            existing = {
                                itemId: group.itemId,
                                itemText: group.itemText,
                                description: group.itemDescription,
                                action: group.action,
                                serialNumbers: []
                            };
                            labelGroups.push(existing);
                        }
                        group.serials.forEach(s => existing.serialNumbers.push(s.serialNumber));
                    });
                } catch (e) {
                    log.error('Inventory Found Error', e.message + ' | ' + e.stack);
                    createResultsPage(context, serialData, 'Inventory found adjustment failed: ' + e.message, 'error');
                    return;
                }
            }

            createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId, inventoryFoundTranId, partNumberChangeTranId);
        }

        /**
         * Handle "Inventory Found" modal submission (serialized).
         * Looks up item by name, creates adjust-in at avg cost into bin 3555 / status 1.
         */
        function handleProcessInventoryFound(context) {
            const itemName = (context.request.parameters.custpage_if_item_name || '').trim();
            const serialsRaw = (context.request.parameters.custpage_if_serials || '').trim();

            if (!itemName) {
                createEntryForm(context, 'Item name is required for Inventory Found.', 'error');
                return;
            }
            if (!serialsRaw) {
                createEntryForm(context, 'At least one serial number is required.', 'error');
                return;
            }

            // Look up the item by name/SKU
            const item = findItemByName(itemName);
            if (!item) {
                createEntryForm(context, 'Item not found: ' + itemName, 'error');
                return;
            }

            // Parse serials (one per line, trim, deduplicate, skip blanks)
            const serials = serialsRaw.split(/[\r\n]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
            const uniqueSerials = [];
            const seen = {};
            serials.forEach(function(s) {
                if (!seen[s]) {
                    seen[s] = true;
                    uniqueSerials.push(s);
                }
            });

            if (uniqueSerials.length === 0) {
                createEntryForm(context, 'No valid serial numbers provided.', 'error');
                return;
            }

            const locationId = '1';

            // Build group for the adjustment
            const groups = [{
                itemId: item.id,
                itemText: item.displayname || item.itemid,
                itemDescription: item.description,
                locationId: locationId,
                action: 'inventory_found',
                serials: uniqueSerials.map(function(s) {
                    return { serialNumber: s, serialId: null, binId: null };
                })
            }];

            let inventoryFoundTranId = null;
            try {
                const foundResult = createInventoryFoundAdjustment(groups, 'Inventory Found — via Warehouse Assistant Dashboard.');
                log.audit('Inventory Found Adjustment Created', 'TranID: ' + foundResult.tranId);
                inventoryFoundTranId = foundResult.tranId;
            } catch (e) {
                log.error('Inventory Found Error', e.message + ' | ' + e.stack);
                createEntryForm(context, 'Inventory found adjustment failed: ' + e.message, 'error');
                return;
            }

            // Build label groups for success page
            const labelGroups = [{
                itemId: item.id,
                itemText: item.displayname || item.itemid,
                description: item.description,
                action: 'inventory_found',
                serialNumbers: uniqueSerials
            }];

            createSuccessPage(context, null, null, labelGroups, null, inventoryFoundTranId, null);
        }

        /**
         * Handle non-serialized item processing.
         */
        function handleProcessNonSerialized(context) {
            const itemId = context.request.parameters.custpage_ns_item;
            const fromBinId = context.request.parameters.custpage_ns_bin;
            const quantity = parseInt(context.request.parameters.custpage_ns_quantity) || 0;
            const action = context.request.parameters.custpage_ns_action;

            // Validate inputs
            if (!itemId) {
                createEntryForm(context, 'Please select an item.', 'warning');
                return;
            }
            if (!fromBinId) {
                createEntryForm(context, 'Please select a From Bin.', 'warning');
                return;
            }
            if (quantity <= 0) {
                createEntryForm(context, 'Please enter a valid quantity.', 'warning');
                return;
            }
            if (!action) {
                createEntryForm(context, 'Please select an action.', 'warning');
                return;
            }

            // Get item details
            const itemDetails = getItemDetails(itemId);
            if (!itemDetails) {
                createEntryForm(context, 'Could not find item details.', 'error');
                return;
            }

            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];

            let adjustmentTranId = null;
            let binTransferTranId = null;
            let inventoryFoundTranId = null;

            // Track the item details to use for label printing (may change for adjustments)
            let labelItemDetails = itemDetails;

            // Default location - using 1 as default, you may want to make this configurable
            const locationId = '1';

            if (ADJUSTMENT_ACTIONS.includes(action)) {
                // Find the -LN target item
                const likeNewName = getLikeNewItemName(itemDetails.itemid);
                const targetItem = findItemByName(likeNewName);

                if (!targetItem) {
                    createEntryForm(context, 'Like New item not found: ' + likeNewName, 'error');
                    return;
                }

                // Use the target item details for label printing (not the original item)
                labelItemDetails = {
                    itemid: targetItem.itemid,
                    displayname: targetItem.displayname,
                    description: targetItem.description
                };

                // Determine destination bin and status for 'likenew_stock' action
                let toBinId = null;
                let toStatusId = null;
                if (action === 'likenew_stock') {
                    toBinId = BACK_TO_STOCK_BIN_ID;
                    toStatusId = BACK_TO_STOCK_STATUS_ID;
                }

                try {
                    const adjResult = createNonSerializedAdjustment({
                        sourceItemId: itemId,
                        sourceItemName: itemDetails.itemid,
                        targetItemId: targetItem.id,
                        targetItemName: targetItem.itemid,
                        locationId: locationId,
                        quantity: quantity,
                        fromBinId: fromBinId,
                        toBinId: toBinId || fromBinId,
                        toStatusId: toStatusId
                    }, 'Created through Warehouse Assistant Dashboard.');

                    adjustmentTranId = adjResult.tranId;
                    log.audit('Non-Serialized Inventory Adjustment Created', 'TranID: ' + adjResult.tranId);
                } catch (e) {
                    log.error('Non-Serialized Adjustment Error', e.message + ' | ' + e.stack);
                    createEntryForm(context, 'Inventory adjustment failed: ' + e.message, 'error');
                    return;
                }
            } else if (BIN_TRANSFER_ACTIONS.includes(action)) {
                // Determine destination bin and status
                let toBinId, toStatusId;
                if (action === 'move_testing') {
                    toBinId = TESTING_BIN_ID;
                    toStatusId = TESTING_STATUS_ID;
                } else if (action === 'move_refurbishing') {
                    toBinId = REFURBISHING_BIN_ID;
                    toStatusId = REFURBISHING_STATUS_ID;
                } else if (action === 'back_to_stock') {
                    toBinId = BACK_TO_STOCK_BIN_ID;
                    toStatusId = BACK_TO_STOCK_STATUS_ID;
                } else if (action === 'defective') {
                    toBinId = DEFECTIVE_BIN_ID;
                    toStatusId = DEFECTIVE_STATUS_ID;
                } else if (action === 'trash') {
                    toBinId = TRASH_BIN_ID;
                    toStatusId = TRASH_STATUS_ID;
                } else if (action === 'return_to_vendor') {
                    toBinId = RETURN_TO_VENDOR_BIN_ID;
                    toStatusId = RETURN_TO_VENDOR_STATUS_ID;
                }

                try {
                    const transferResult = createNonSerializedBinTransfer({
                        itemId: itemId,
                        locationId: locationId,
                        quantity: quantity,
                        fromBinId: fromBinId,
                        toBinId: toBinId,
                        toStatusId: toStatusId
                    }, 'Via Warehouse Assistant Dashboard');

                    binTransferTranId = transferResult.tranId;
                    log.audit('Non-Serialized Bin Transfer Created', 'TranID: ' + transferResult.tranId);
                } catch (e) {
                    log.error('Non-Serialized Bin Transfer Error', e.message + ' | ' + e.stack);
                    createEntryForm(context, 'Bin transfer failed: ' + e.message, 'error');
                    return;
                }
            } else if (INVENTORY_FOUND_ACTIONS.includes(action)) {
                try {
                    const foundResult = createNonSerializedInventoryFoundAdjustment({
                        itemId: itemId,
                        locationId: locationId,
                        quantity: quantity
                    }, 'Inventory Found — via Warehouse Assistant Dashboard.');

                    inventoryFoundTranId = foundResult.tranId;
                    log.audit('Non-Serialized Inventory Found Created', 'TranID: ' + foundResult.tranId);
                } catch (e) {
                    log.error('Non-Serialized Inventory Found Error', e.message + ' | ' + e.stack);
                    createEntryForm(context, 'Inventory found adjustment failed: ' + e.message, 'error');
                    return;
                }
            }

            // Show success page for non-serialized (use labelItemDetails so adjustment actions print the target item label)
            createNonSerializedSuccessPage(context, adjustmentTranId, binTransferTranId, labelItemDetails, quantity, action, inventoryFoundTranId);
        }

        /**
         * Handle multi-row non-serialized processing.
         * Parses the JSON cart data and groups rows by action type,
         * creating one transaction per type (Adjustment, Bin Transfer, Inventory Found).
         */
        function handleProcessNonSerializedMulti(context) {
            const cartDataRaw = context.request.parameters.custpage_ns_cart_json;

            if (!cartDataRaw) {
                createEntryForm(context, 'Missing cart data. Please start over.', 'error');
                return;
            }

            let cartRows;
            try {
                cartRows = JSON.parse(cartDataRaw);
            } catch (e) {
                createEntryForm(context, 'Invalid cart data. Please start over.', 'error');
                return;
            }

            if (!cartRows || cartRows.length === 0) {
                createEntryForm(context, 'No items in the grid. Please add items first.', 'warning');
                return;
            }

            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const INVENTORY_FOUND_ACTIONS = ['inventory_found'];

            const locationId = '1';
            const errors = [];

            const adjustmentRows = [];
            const binTransferRows = [];
            const inventoryFoundRows = [];

            const itemCache = {};       // keyed by itemName
            const binCache = {};        // keyed by binNumber
            const targetItemCache = {}; // keyed by sourceItemId

            cartRows.forEach(function(row, idx) {
                const itemName = (row.itemName || '').trim();
                const binNumber = (row.binNumber || '').trim();
                const action = row.action;
                const quantity = parseInt(row.quantity) || 0;
                const rowLabel = 'Row ' + (idx + 1) + ' (' + (itemName || 'empty') + ')';

                if (!itemName || !action || quantity <= 0) {
                    errors.push(rowLabel + ': missing required fields');
                    return;
                }

                // Look up item by SKU/name
                if (!itemCache[itemName]) {
                    const item = findItemByName(itemName);
                    if (item) {
                        itemCache[itemName] = item;
                    } else {
                        errors.push(rowLabel + ': item not found "' + itemName + '"');
                        return;
                    }
                }
                const itemData = itemCache[itemName];
                const itemId = itemData.id;

                // Look up from-bin by bin number
                let fromBinId = null;
                if (binNumber) {
                    if (!binCache[binNumber]) {
                        const bin = findBinByNumber(binNumber, locationId);
                        if (bin) {
                            binCache[binNumber] = bin;
                        } else {
                            errors.push(rowLabel + ': bin not found "' + binNumber + '"');
                            return;
                        }
                    }
                    fromBinId = binCache[binNumber].id;
                }

                if (ADJUSTMENT_ACTIONS.indexOf(action) !== -1) {
                    // Find -LN target item
                    if (!targetItemCache[itemId]) {
                        const likeNewName = getLikeNewItemName(itemData.itemid);
                        const targetItem = findItemByName(likeNewName);
                        if (!targetItem) {
                            errors.push(rowLabel + ': Like New item not found "' + likeNewName + '"');
                            targetItemCache[itemId] = { found: false };
                        } else {
                            targetItemCache[itemId] = { found: true, targetItem: targetItem };
                        }
                    }

                    const cache = targetItemCache[itemId];
                    if (!cache.found) return;

                    let toBinId = null;
                    let toStatusId = null;
                    if (action === 'likenew_stock') {
                        toBinId = BACK_TO_STOCK_BIN_ID;
                        toStatusId = BACK_TO_STOCK_STATUS_ID;
                    }

                    adjustmentRows.push({
                        sourceItemId: itemId,
                        sourceItemName: itemData.itemid,
                        targetItemId: cache.targetItem.id,
                        targetItemName: cache.targetItem.itemid,
                        targetDisplayName: cache.targetItem.displayname,
                        targetDescription: cache.targetItem.description,
                        locationId: locationId,
                        quantity: quantity,
                        fromBinId: fromBinId,
                        toBinId: toBinId || fromBinId,
                        toStatusId: toStatusId,
                        action: action
                    });

                } else if (BIN_TRANSFER_ACTIONS.indexOf(action) !== -1) {
                    let toBinId, toStatusId;
                    if (action === 'move_testing') { toBinId = TESTING_BIN_ID; toStatusId = TESTING_STATUS_ID; }
                    else if (action === 'move_refurbishing') { toBinId = REFURBISHING_BIN_ID; toStatusId = REFURBISHING_STATUS_ID; }
                    else if (action === 'back_to_stock') { toBinId = BACK_TO_STOCK_BIN_ID; toStatusId = BACK_TO_STOCK_STATUS_ID; }
                    else if (action === 'defective') { toBinId = DEFECTIVE_BIN_ID; toStatusId = DEFECTIVE_STATUS_ID; }
                    else if (action === 'trash') { toBinId = TRASH_BIN_ID; toStatusId = TRASH_STATUS_ID; }
                    else if (action === 'return_to_vendor') { toBinId = RETURN_TO_VENDOR_BIN_ID; toStatusId = RETURN_TO_VENDOR_STATUS_ID; }

                    binTransferRows.push({
                        itemId: itemId,
                        itemText: itemData.displayname || itemData.itemid,
                        description: itemData.description || '',
                        locationId: locationId,
                        quantity: quantity,
                        fromBinId: fromBinId,
                        toBinId: toBinId,
                        toStatusId: toStatusId,
                        action: action
                    });

                } else if (INVENTORY_FOUND_ACTIONS.indexOf(action) !== -1) {
                    inventoryFoundRows.push({
                        itemId: itemId,
                        itemText: itemData.displayname || itemData.itemid,
                        description: itemData.description || '',
                        locationId: locationId,
                        quantity: quantity,
                        action: action
                    });
                }
            });

            if (adjustmentRows.length === 0 && binTransferRows.length === 0 && inventoryFoundRows.length === 0) {
                const errMsg = errors.length > 0 ? 'Errors: ' + errors.join('; ') : 'No valid items to process.';
                createEntryForm(context, errMsg, 'error');
                return;
            }

            let adjustmentTranId = null;
            let binTransferTranId = null;
            let inventoryFoundTranId = null;
            const processedItems = [];

            // -- Process all adjustment rows in ONE Inventory Adjustment record --
            if (adjustmentRows.length > 0) {
                try {
                    const adjResult = createNonSerializedAdjustmentMulti(adjustmentRows, 'Created through Warehouse Assistant Dashboard.');
                    adjustmentTranId = adjResult.tranId;
                    log.audit('Non-Serialized Multi Adjustment Created', 'TranID: ' + adjResult.tranId);

                    adjustmentRows.forEach(function(row) {
                        processedItems.push({
                            itemText: row.targetDisplayName || row.targetItemName,
                            description: row.targetDescription || '',
                            quantity: row.quantity,
                            action: row.action
                        });
                    });
                } catch (e) {
                    log.error('Non-Serialized Multi Adjustment Error', e.message + ' | ' + e.stack);
                    createEntryForm(context, 'Inventory adjustment failed: ' + e.message, 'error');
                    return;
                }
            }

            // -- Process all bin transfer rows in ONE Bin Transfer record --
            if (binTransferRows.length > 0) {
                try {
                    const transferResult = createNonSerializedBinTransferMulti(binTransferRows, 'Via Warehouse Assistant Dashboard');
                    binTransferTranId = transferResult.tranId;
                    log.audit('Non-Serialized Multi Bin Transfer Created', 'TranID: ' + transferResult.tranId);

                    binTransferRows.forEach(function(row) {
                        processedItems.push({
                            itemText: row.itemText,
                            description: row.description || '',
                            quantity: row.quantity,
                            action: row.action
                        });
                    });
                } catch (e) {
                    log.error('Non-Serialized Multi Bin Transfer Error', e.message + ' | ' + e.stack);
                    createEntryForm(context, 'Bin transfer failed: ' + e.message, 'error');
                    return;
                }
            }

            // -- Process all inventory found rows in ONE adjustment --
            if (inventoryFoundRows.length > 0) {
                try {
                    const foundResult = createNonSerializedInventoryFoundMulti(inventoryFoundRows, 'Inventory Found — via Warehouse Assistant Dashboard.');
                    inventoryFoundTranId = foundResult.tranId;
                    log.audit('Non-Serialized Multi Inventory Found Created', 'TranID: ' + foundResult.tranId);

                    inventoryFoundRows.forEach(function(row) {
                        processedItems.push({
                            itemText: row.itemText,
                            description: row.description || '',
                            quantity: row.quantity,
                            action: row.action
                        });
                    });
                } catch (e) {
                    log.error('Non-Serialized Multi Inventory Found Error', e.message + ' | ' + e.stack);
                    createEntryForm(context, 'Inventory found adjustment failed: ' + e.message, 'error');
                    return;
                }
            }

            createNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors);
        }

        /**
         * Success page for non-serialized items (no serial list to display).
         */
        function createNonSerializedSuccessPage(context, adjustmentTranId, binTransferTranId, itemDetails, quantity, action, inventoryFoundTranId) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true
            });

            // Build label data for printing
            const printData = [{
                itemText: itemDetails.displayname || itemDetails.itemid,
                description: itemDetails.description || '',
                quantity: quantity
            }];

            // Use whichever transaction ID is available for the print job
            const recordIdForPrint = adjustmentTranId || binTransferTranId || inventoryFoundTranId || '';

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl);

            // Hidden fields for print data (submitted via POST to avoid URL length limits)
            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printDataField.defaultValue = JSON.stringify(printData);

            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printRecordIdField.defaultValue = String(recordIdForPrint);

            // Build transaction info lines
            let transactionInfoHtml = '';
            if (adjustmentTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Inventory Adjustment:</strong> ${escapeXml(String(adjustmentTranId))}</p>`;
            }
            if (binTransferTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Bin Transfer:</strong> ${escapeXml(String(binTransferTranId))}</p>`;
            }
            if (inventoryFoundTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Inventory Found:</strong> ${escapeXml(String(inventoryFoundTranId))}</p>`;
            }

            const actionLabel = {
                'back_to_stock': 'Back to Stock',
                'defective': 'Defective',
                'likenew': 'Change to Like New',
                'likenew_stock': 'Change to Like New & Back to Stock',
                'move_refurbishing': 'Move to Refurbishing',
                'move_testing': 'Move to Testing',
                'return_to_vendor': 'Return to Vendor',
                'trash': 'Trash',
                'inventory_found': 'Inventory Found',
                'bin_putaway': 'Bin Putaway'
            }[action] || action;

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    <div class="main-card">
                        <div class="form-body">
                            <div class="success-card">
                                <div class="success-icon">&#10003;</div>
                                <h2>Transactions have been created!</h2>
                                ${transactionInfoHtml}

                                <div class="label-group" style="margin-top:24px;">
                                    <h3>${escapeXml(itemDetails.displayname || itemDetails.itemid)}</h3>
                                    <p style="color:#64748b; margin:0 0 12px; font-size:14px;">
                                        Quantity: ${quantity} &bull; ${actionLabel}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div class="btn-area" style="flex-direction:column;">
                            <button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (${quantity})</button>
                            <button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Process More</button>
                        </div>
                    </div>
                </div>
            `;

            context.response.writePage(form);
        }

        /**
         * Success page for multi-row non-serialized processing.
         * Displays all transaction IDs and a summary table of processed items.
         */
        function createNonSerializedMultiSuccessPage(context, adjustmentTranId, binTransferTranId, inventoryFoundTranId, processedItems, errors) {
            const form = serverWidget.createForm({ title: 'Transactions Created' });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true
            });

            // Build label data for printing
            const printData = processedItems.map(function(item) {
                return {
                    itemText: item.itemText || '',
                    description: item.description || '',
                    quantity: item.quantity
                };
            });

            const recordIdForPrint = adjustmentTranId || binTransferTranId || inventoryFoundTranId || '';

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl);

            const printDataField = form.addField({ id: 'custpage_print_data', type: serverWidget.FieldType.LONGTEXT, label: 'Print Data' });
            printDataField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printDataField.defaultValue = JSON.stringify(printData);

            const printRecordIdField = form.addField({ id: 'custpage_print_record_id', type: serverWidget.FieldType.TEXT, label: 'Print Record ID' });
            printRecordIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            printRecordIdField.defaultValue = String(recordIdForPrint);

            // Build transaction info
            let transactionInfoHtml = '';
            if (adjustmentTranId) {
                transactionInfoHtml += '<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Inventory Adjustment:</strong> ' + escapeXml(String(adjustmentTranId)) + '</p>';
            }
            if (binTransferTranId) {
                transactionInfoHtml += '<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Bin Transfer:</strong> ' + escapeXml(String(binTransferTranId)) + '</p>';
            }
            if (inventoryFoundTranId) {
                transactionInfoHtml += '<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Inventory Found:</strong> ' + escapeXml(String(inventoryFoundTranId)) + '</p>';
            }

            const ACTION_LABELS = {
                'back_to_stock': 'Back to Stock',
                'defective': 'Defective',
                'likenew': 'Change to Like New',
                'likenew_stock': 'Change to Like New & Back to Stock',
                'move_refurbishing': 'Move to Refurbishing',
                'move_testing': 'Move to Testing',
                'return_to_vendor': 'Return to Vendor',
                'trash': 'Trash',
                'inventory_found': 'Inventory Found',
                'bin_putaway': 'Bin Putaway'
            };

            let itemRows = '';
            let totalQty = 0;
            processedItems.forEach(function(item) {
                totalQty += item.quantity;
                itemRows += '<tr>';
                itemRows += '<td data-label="Item"><strong>' + escapeXml(item.itemText) + '</strong></td>';
                itemRows += '<td data-label="Qty">' + item.quantity + '</td>';
                itemRows += '<td data-label="Action">' + escapeXml(ACTION_LABELS[item.action] || item.action) + '</td>';
                itemRows += '</tr>';
            });

            let errorsHtml = '';
            if (errors && errors.length > 0) {
                errorsHtml = '<div class="alert alert-warning"><strong>Warnings:</strong> ' + escapeXml(errors.join('; ')) + '</div>';
            }

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    ${errorsHtml}
                    <div class="main-card">
                        <div class="form-body">
                            <div class="success-card">
                                <div class="success-icon">&#10003;</div>
                                <h2>Transactions Created!</h2>
                                ${transactionInfoHtml}
                                <p style="color:#64748b; margin-top:16px;">${processedItems.length} item${processedItems.length !== 1 ? 's' : ''} processed (${totalQty} total qty)</p>

                                <table class="results-table" style="margin-top:24px; text-align:left;">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Qty</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>${itemRows}</tbody>
                                </table>
                            </div>
                        </div>
                        <div class="btn-area" style="flex-direction:column;">
                            <button type="button" class="custom-btn btn-success" style="width:100%;" onclick="printLabels()">Print Labels (${totalQty})</button>
                            <button type="button" class="custom-btn btn-outline" style="width:100%;" onclick="createAnother()">Process More</button>
                        </div>
                    </div>
                </div>
            `;

            context.response.writePage(form);
        }

        // ====================================================================
        // BIN PUTAWAY HANDLER
        // ====================================================================

        /**
         * Handle Bin Putaway submissions (both serialized and non-serialized).
         * All items are transferred to the user-selected bin with status = 1 (Good).
         */
        function handleProcessBinPutaway(context) {
            const bpMode = (context.request.parameters.custpage_bp_mode || '').trim();

            if (bpMode === 'serialized') {
                // --- Serialized Bin Putaway ---
                const serialInput = context.request.parameters.custpage_bp_serials || '';
                const toBinNumber = (context.request.parameters.custpage_bp_to_bin || '').trim();

                // Build prefill object so the form restores state on error
                const bpPrefill = {
                    mode: 'binputaway',
                    bpMode: 'serialized',
                    bpSerials: serialInput,
                    bpToBin: toBinNumber
                };

                const serialTexts = cleanSerialInput(serialInput);
                if (serialTexts.length === 0) {
                    createEntryForm(context, 'Enter or scan at least one serial number.', 'warning', bpPrefill);
                    return;
                }
                if (!toBinNumber) {
                    createEntryForm(context, 'Please select a destination bin.', 'warning', bpPrefill);
                    return;
                }

                // Look up destination bin
                const locationId = '1';
                const toBin = findBinByNumber(toBinNumber, locationId);
                if (!toBin) {
                    createEntryForm(context, 'Destination bin not found: ' + toBinNumber, 'error', bpPrefill);
                    return;
                }

                // Look up serial details
                const serialData = lookupSerialDetails(serialTexts);

                // --- Block if any serials were not found / invalid ---
                if (serialData.invalid.length > 0) {
                    createEntryForm(context,
                        'The following serial numbers were not found in stock. '
                        + 'Please remove them and resubmit: '
                        + serialData.invalid.join(', '),
                        'error', bpPrefill);
                    return;
                }

                if (serialData.valid.length === 0) {
                    createEntryForm(context, 'No serial numbers to process.', 'warning', bpPrefill);
                    return;
                }

                // --- Silently skip serials already in the destination bin ---
                const skippedSameBin = [];
                const readySerials = [];

                serialData.valid.forEach(function(serial) {
                    if (String(serial.binId) === String(toBin.id)) {
                        skippedSameBin.push(serial.serialNumber);
                    } else {
                        readySerials.push(serial);
                    }
                });

                if (skippedSameBin.length > 0) {
                    log.audit('Bin Putaway — Skipped (already in bin)',
                        skippedSameBin.length + ' serial(s) already in ' + toBinNumber + ': ' + skippedSameBin.join(', '));
                }

                // If every serial was already in the destination bin, show success
                if (readySerials.length === 0) {
                    createEntryForm(context,
                        'All ' + skippedSameBin.length + ' serial(s) are already in bin ' + toBinNumber + '. Nothing to transfer.',
                        'success', bpPrefill);
                    return;
                }

                // --- Group remaining serials by item + location ---
                const groupMap = {};
                readySerials.forEach(function(serial) {
                    const key = serial.itemId + '_' + serial.locationId;
                    if (!groupMap[key]) {
                        const details = getItemDetails(serial.itemId);
                        groupMap[key] = {
                            itemId: serial.itemId,
                            itemText: details ? (details.displayname || details.itemid) : serial.itemText,
                            itemDescription: details ? details.description : '',
                            locationId: serial.locationId,
                            action: 'bin_putaway',
                            serials: []
                        };
                    }
                    groupMap[key].serials.push({
                        serialNumber: serial.serialNumber,
                        serialId: serial.serialId,
                        binId: serial.binId
                    });
                });

                const groups = Object.values(groupMap);

                // --- Helper: build and save a bin transfer for given groups ---
                function attemptBinTransfer(transferGroups) {
                    const transferRecord = record.create({
                        type: record.Type.BIN_TRANSFER,
                        isDynamic: true
                    });

                    transferRecord.setValue({ fieldId: 'subsidiary', value: '1' });
                    transferRecord.setValue({ fieldId: 'memo', value: 'Bin Putaway via WH Assistant' });
                    transferRecord.setValue({ fieldId: 'location', value: locationId });

                    transferGroups.forEach(function(group) {
                        transferRecord.selectNewLine({ sublistId: 'inventory' });
                        transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item', value: group.itemId });
                        transferRecord.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'quantity', value: group.serials.length });

                        const invDetail = transferRecord.getCurrentSublistSubrecord({
                            sublistId: 'inventory',
                            fieldId: 'inventorydetail'
                        });

                        group.serials.forEach(function(serial) {
                            invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
                            invDetail.setCurrentSublistText({
                                sublistId: 'inventoryassignment',
                                fieldId: 'issueinventorynumber',
                                text: serial.serialNumber
                            });
                            invDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'quantity',
                                value: 1
                            });
                            if (serial.binId) {
                                invDetail.setCurrentSublistValue({
                                    sublistId: 'inventoryassignment',
                                    fieldId: 'binnumber',
                                    value: serial.binId
                                });
                            }
                            invDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'tobinnumber',
                                value: toBin.id
                            });
                            invDetail.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'toinventorystatus',
                                value: 1
                            });
                            invDetail.commitLine({ sublistId: 'inventoryassignment' });
                        });

                        transferRecord.commitLine({ sublistId: 'inventory' });
                    });

                    return transferRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
                }

                // --- Helper: check if an error message indicates "already in bin" ---
                function isAlreadyInBinError(errorMsg) {
                    const msg = (errorMsg || '').toLowerCase();
                    return msg.indexOf('already in') > -1
                        || msg.indexOf('same bin') > -1
                        || msg.indexOf('already exists in bin') > -1
                        || msg.indexOf('to bin is the same') > -1
                        || msg.indexOf('transfer from and to the same bin') > -1;
                }

                // --- Helper: re-lookup bin details for serials to find any now in dest bin ---
                function findSerialsAlreadyInBin(serialItems, destBinId) {
                    const alreadyIn = [];
                    const remaining = [];

                    // Re-check each serial's current bin via a fresh search
                    const serialNames = serialItems.map(function(s) { return s.serialNumber; });
                    const freshData = lookupSerialDetails(serialNames);
                    const freshMap = {};
                    freshData.valid.forEach(function(s) { freshMap[s.serialNumber] = s; });

                    serialItems.forEach(function(serial) {
                        const fresh = freshMap[serial.serialNumber];
                        if (fresh && String(fresh.binId) === String(destBinId)) {
                            alreadyIn.push(serial.serialNumber);
                        } else {
                            remaining.push(serial);
                        }
                    });

                    return { alreadyIn: alreadyIn, remaining: remaining };
                }

                // --- Create bin transfer (status = 1 Good) ---
                try {
                    const transferId = attemptBinTransfer(groups);

                    let tranId = String(transferId);
                    try {
                        const lookup = search.lookupFields({
                            type: record.Type.BIN_TRANSFER,
                            id: transferId,
                            columns: ['tranid']
                        });
                        tranId = lookup.tranid || String(transferId);
                    } catch (e) {
                        log.debug('Could not look up bin putaway transfer tranid', e.message);
                    }

                    log.audit('Bin Putaway Transfer Created',
                        'TranID: ' + tranId + ', Transferred: ' + readySerials.length
                        + ', Skipped (same bin): ' + skippedSameBin.length + ', To Bin: ' + toBinNumber);

                    // Build label groups for success page
                    const labelGroups = [];
                    groups.forEach(function(group) {
                        labelGroups.push({
                            itemId: group.itemId,
                            itemText: group.itemText,
                            description: group.itemDescription,
                            action: 'bin_putaway',
                            serialNumbers: group.serials.map(function(s) { return s.serialNumber; })
                        });
                    });

                    createSuccessPage(context, null, tranId, labelGroups, null, null, null);

                } catch (e) {
                    // --- If the error is "already in bin", filter those serials out and retry ---
                    if (isAlreadyInBinError(e.message)) {
                        log.audit('Bin Putaway — already-in-bin error detected, attempting retry',
                            e.message);

                        // Flatten all serials from all groups
                        const allSerials = [];
                        groups.forEach(function(g) {
                            g.serials.forEach(function(s) { allSerials.push(s); });
                        });

                        // Re-lookup to separate truly-already-in-bin from transferable
                        const split = findSerialsAlreadyInBin(allSerials, toBin.id);

                        if (split.alreadyIn.length > 0) {
                            log.audit('Bin Putaway — serials already in destination bin',
                                split.alreadyIn.length + ' serial(s): ' + split.alreadyIn.join(', '));
                        }

                        // If nothing left to transfer, show success with a note
                        if (split.remaining.length === 0) {
                            const allSkipped = skippedSameBin.concat(split.alreadyIn);
                            createEntryForm(context,
                                'All ' + allSkipped.length + ' serial(s) are already in bin '
                                + toBinNumber + '. Nothing to transfer.',
                                'success', bpPrefill);
                            return;
                        }

                        // Re-group the remaining serials by item + location
                        const retryGroupMap = {};
                        split.remaining.forEach(function(serial) {
                            const key = serial.itemId + '_' + (serial.locationId || locationId);
                            if (!retryGroupMap[key]) {
                                // Find original group to reuse item details
                                var origGroup = null;
                                for (var gi = 0; gi < groups.length; gi++) {
                                    if (String(groups[gi].itemId) === String(serial.itemId)) {
                                        origGroup = groups[gi]; break;
                                    }
                                }
                                retryGroupMap[key] = {
                                    itemId: serial.itemId,
                                    itemText: origGroup ? origGroup.itemText : '',
                                    itemDescription: origGroup ? origGroup.itemDescription : '',
                                    locationId: serial.locationId || locationId,
                                    action: 'bin_putaway',
                                    serials: []
                                };
                            }
                            retryGroupMap[key].serials.push(serial);
                        });

                        const retryGroups = Object.values(retryGroupMap);

                        try {
                            const retryTransferId = attemptBinTransfer(retryGroups);

                            let retryTranId = String(retryTransferId);
                            try {
                                const lookup2 = search.lookupFields({
                                    type: record.Type.BIN_TRANSFER,
                                    id: retryTransferId,
                                    columns: ['tranid']
                                });
                                retryTranId = lookup2.tranid || String(retryTransferId);
                            } catch (e2) {
                                log.debug('Could not look up retry bin putaway transfer tranid', e2.message);
                            }

                            log.audit('Bin Putaway Transfer Created (retry)',
                                'TranID: ' + retryTranId + ', Transferred: ' + split.remaining.length
                                + ', Already in bin: ' + split.alreadyIn.length + ', To Bin: ' + toBinNumber);

                            // Build label groups for success page (only the transferred serials)
                            const retryLabelGroups = [];
                            retryGroups.forEach(function(group) {
                                retryLabelGroups.push({
                                    itemId: group.itemId,
                                    itemText: group.itemText,
                                    description: group.itemDescription,
                                    action: 'bin_putaway',
                                    serialNumbers: group.serials.map(function(s) { return s.serialNumber; })
                                });
                            });

                            createSuccessPage(context, null, retryTranId, retryLabelGroups, null, null, null);

                        } catch (retryErr) {
                            log.error('Bin Putaway Retry Transfer Error', retryErr.message + ' | ' + retryErr.stack);
                            const failedSerialList = split.remaining.map(function(s) { return s.serialNumber; }).join(', ');
                            createEntryForm(context,
                                'Bin putaway failed on retry: ' + retryErr.message
                                + ' — Serials with issues: ' + failedSerialList,
                                'error', bpPrefill);
                            return;
                        }

                    } else {
                        // Non "already in bin" error — fail as before
                        log.error('Bin Putaway Transfer Error', e.message + ' | ' + e.stack);

                        const failedSerialList = readySerials.map(function(s) { return s.serialNumber; }).join(', ');
                        createEntryForm(context,
                            'Bin putaway failed: ' + e.message
                            + ' — Serials with issues: ' + failedSerialList,
                            'error', bpPrefill);
                        return;
                    }
                }

            } else {
                // --- Non-Serialized Bin Putaway ---
                const cartDataRaw = context.request.parameters.custpage_bp_cart_json;
                if (!cartDataRaw) {
                    createEntryForm(context, 'Missing cart data. Please start over.', 'error');
                    return;
                }

                let cartRows;
                try {
                    cartRows = JSON.parse(cartDataRaw);
                } catch (e) {
                    createEntryForm(context, 'Invalid cart data. Please start over.', 'error');
                    return;
                }

                if (!cartRows || cartRows.length === 0) {
                    createEntryForm(context, 'No items in the grid. Please add items first.', 'warning');
                    return;
                }

                const locationId = '1';
                const errors = [];
                const binTransferRows = [];
                const itemCache = {};
                const binCache = {};

                cartRows.forEach(function(row, idx) {
                    const itemName = (row.itemName || '').trim();
                    const fromBinNumber = (row.fromBinNumber || '').trim();
                    const toBinNumber = (row.toBinNumber || '').trim();
                    const quantity = parseInt(row.quantity) || 0;
                    const rowLabel = 'Row ' + (idx + 1) + ' (' + (itemName || 'empty') + ')';

                    if (!itemName || !fromBinNumber || !toBinNumber || quantity <= 0) {
                        errors.push(rowLabel + ': missing required fields');
                        return;
                    }

                    // Look up item
                    if (!itemCache[itemName]) {
                        const item = findItemByName(itemName);
                        if (item) {
                            itemCache[itemName] = item;
                        } else {
                            errors.push(rowLabel + ': item not found "' + itemName + '"');
                            return;
                        }
                    }
                    const itemData = itemCache[itemName];

                    // Look up from bin
                    if (!binCache[fromBinNumber]) {
                        const bin = findBinByNumber(fromBinNumber, locationId);
                        if (bin) {
                            binCache[fromBinNumber] = bin;
                        } else {
                            errors.push(rowLabel + ': from bin not found "' + fromBinNumber + '"');
                            return;
                        }
                    }

                    // Look up to bin
                    if (!binCache[toBinNumber]) {
                        const bin = findBinByNumber(toBinNumber, locationId);
                        if (bin) {
                            binCache[toBinNumber] = bin;
                        } else {
                            errors.push(rowLabel + ': to bin not found "' + toBinNumber + '"');
                            return;
                        }
                    }

                    binTransferRows.push({
                        itemId: itemData.id,
                        itemText: itemData.displayname || itemData.itemid,
                        description: itemData.description || '',
                        locationId: locationId,
                        quantity: quantity,
                        fromBinId: binCache[fromBinNumber].id,
                        toBinId: binCache[toBinNumber].id,
                        toStatusId: 1  // Good status
                    });
                });

                if (binTransferRows.length === 0) {
                    const errMsg = errors.length > 0 ? 'Errors: ' + errors.join('; ') : 'No valid items to process.';
                    createEntryForm(context, errMsg, 'error');
                    return;
                }

                try {
                    const transferResult = createNonSerializedBinTransferMulti(binTransferRows, 'Bin Putaway via WH Assistant');
                    log.audit('Non-Serialized Bin Putaway Transfer Created', 'TranID: ' + transferResult.tranId);

                    const processedItems = binTransferRows.map(function(row) {
                        return {
                            itemText: row.itemText,
                            description: row.description,
                            quantity: row.quantity,
                            action: 'bin_putaway'
                        };
                    });

                    createNonSerializedMultiSuccessPage(context, null, transferResult.tranId, null, processedItems, errors);

                } catch (e) {
                    log.error('Non-Serialized Bin Putaway Error', e.message + ' | ' + e.stack);
                    createEntryForm(context, 'Bin putaway failed: ' + e.message, 'error');
                    return;
                }
            }
        }

        // ====================================================================
        // GET (AJAX) HANDLERS
        // ====================================================================

        function handlePrintPdf(context) {
            const recordId = context.request.parameters.record_id || '';
            const labelDataRaw = context.request.parameters.label_data || '';

            if (!labelDataRaw) {
                context.response.write('Error: No label data');
                return;
            }

            try {
                const labelGroups = JSON.parse(labelDataRaw);
                const pdfFile = generateLabelsPdf(labelGroups, recordId);

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
            const labelData = context.request.parameters.label_data || '';

            const pdfUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true,
                params: {
                    ajax_action: 'printpdf',
                    record_id: recordId,
                    label_data: labelData
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
document.getElementById('pdf').onload = function() { setTimeout(doPrint, 2500); };
setTimeout(doPrint, 4000);
</script>
</body></html>`;

            context.response.setHeader({ name: 'Content-Type', value: 'text/html' });
            context.response.write(html);
        }

        /**
         * Handle print PDF via POST (avoids URL length limits).
         * Generates the PDF and returns an auto-print HTML page with the PDF
         * embedded as a base64 data URL.
         */
        function handlePrintPdfPost(context) {
            const recordId = context.request.parameters.custpage_print_record_id || '';
            const labelDataRaw = context.request.parameters.custpage_print_data || '';

            if (!labelDataRaw) {
                context.response.write('Error: No label data');
                return;
            }

            try {
                const labelGroups = JSON.parse(labelDataRaw);
                const pdfFile = generateLabelsPdf(labelGroups, recordId);

                context.response.setHeader({ name: 'Content-Type', value: 'application/pdf' });
                context.response.setHeader({ name: 'Content-Disposition', value: 'inline; filename="Labels_' + recordId + '.pdf"' });
                context.response.write(pdfFile.getContents());
            } catch (e) {
                log.error('Print PDF POST Error', e.message);
                context.response.write('Error generating PDF: ' + e.message);
            }
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

                    if (action === 'process_nonserialized') {
                        handleProcessNonSerialized(context);
                        return;
                    }

                    if (action === 'process_nonserialized_multi') {
                        handleProcessNonSerializedMulti(context);
                        return;
                    }

                    if (action === 'process_inventory_found') {
                        handleProcessInventoryFound(context);
                        return;
                    }

                    if (action === 'process_bin_putaway') {
                        handleProcessBinPutaway(context);
                        return;
                    }

                    if (action === 'printpdf') {
                        handlePrintPdfPost(context);
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
