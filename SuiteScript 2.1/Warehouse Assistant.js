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
                    return bins.length < 100;
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
                    invDetail.setCurrentSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'issueinventorynumber',
                        value: serial.serialId
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

                .form-section {
                    display: none;
                }
                .form-section.active {
                    display: block;
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

                    var currentMode = 'serialized';

                    function switchMode(mode) {
                        currentMode = mode;
                        var serialSection = document.getElementById('serialized-section');
                        var nonSerialSection = document.getElementById('non-serialized-section');
                        var serialBtn = document.getElementById('mode-serialized');
                        var nonSerialBtn = document.getElementById('mode-nonserialized');

                        if (mode === 'serialized') {
                            serialSection.classList.add('active');
                            nonSerialSection.classList.remove('active');
                            serialBtn.classList.add('active');
                            nonSerialBtn.classList.remove('active');
                            var field = document.getElementById('custpage_serial_numbers');
                            if (field) field.focus();
                        } else {
                            serialSection.classList.remove('active');
                            nonSerialSection.classList.add('active');
                            serialBtn.classList.remove('active');
                            nonSerialBtn.classList.add('active');
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

                    function clearForm() {
                        if (currentMode === 'serialized') {
                            var field = document.getElementById('custpage_serial_numbers');
                            if (field) field.value = '';
                            updateCount();
                        } else {
                            var itemField = document.getElementById('custpage_ns_item');
                            var qtyField = document.getElementById('custpage_ns_quantity');
                            var actionField = document.getElementById('custpage_ns_action');
                            if (itemField) itemField.value = '';
                            if (qtyField) qtyField.value = '';
                            if (actionField) actionField.value = '';
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
                        var selects = document.querySelectorAll('table .action-select');
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
                        updateActionCount();
                    }

                    function updateActionCount() {
                        var selects = document.querySelectorAll('table .action-select');
                        var count = 0;
                        for (var i = 0; i < selects.length; i++) {
                            if (selects[i].value !== '') count++;
                        }
                        var display = document.getElementById('action_count');
                        if (display) display.textContent = count;
                    }

                    function submitActions() {
                        var selects = document.querySelectorAll('table .action-select');
                        var actions = [];
                        var hasAction = false;
                        var missingNewSerial = false;

                        for (var i = 0; i < selects.length; i++) {
                            var idx = selects[i].getAttribute('data-index');
                            var val = selects[i].value;
                            var newSerial = '';

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

                            actions.push({ index: parseInt(idx), action: val, newSerial: newSerial });
                            if (val !== '') hasAction = true;
                        }

                        if (!hasAction) { alert('Select an action for at least one serial number'); return; }
                        if (missingNewSerial) { alert('Please enter a new serial number for all Serial Number Change actions'); return; }

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
                        var selects = document.querySelectorAll('table .action-select');
                        for (var i = 0; i < selects.length; i++) {
                            selects[i].addEventListener('change', function() { handleActionChange(this); });
                        }
                        updateActionCount();
                    });
                </script>
            `;
        }

        function getSuccessPageScript(suiteletUrl, printUrl) {
            return `
                <script>
                    function printLabels() { window.open('${escapeForJs(printUrl)}', '_blank'); }
                    function createAnother() { window.location.href = '${escapeForJs(suiteletUrl)}'; }
                </script>
            `;
        }

        // ====================================================================
        // PAGE BUILDERS
        // ====================================================================

        function createEntryForm(context, message, messageType) {
            const form = serverWidget.createForm({ title: 'Warehouse Assistant Dashboard' });

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
                            <h1>Warehouse Assistant Dashboard</h1>
                            <p>I'm here to help.</p>
                        </div>
                        <div class="form-body">
                            <div class="mode-toggle">
                                <button type="button" id="mode-serialized" class="mode-btn active" onclick="switchMode('serialized')">Serialized Items</button>
                                <button type="button" id="mode-nonserialized" class="mode-btn" onclick="switchMode('nonserialized')">Non-Serialized Items</button>
                            </div>

                            <!-- Serialized Items Section -->
                            <div id="serialized-section" class="form-section active">
                                <div class="input-group">
                                    <label class="custom-label">Serial Numbers <span class="badge-count"><span id="serial_count">0</span> scanned</span></label>
                                    <div id="serial-field-wrap"></div>
                                </div>
                                <div class="btn-area">
                                    <button type="button" class="custom-btn btn-success" onclick="submitSerials()">Submit</button>
                                    <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                                </div>
                            </div>

                            <!-- Non-Serialized Items Section -->
                            <div id="non-serialized-section" class="form-section">
                                <div class="input-group">
                                    <label class="custom-label">Item</label>
                                    <div id="ns-item-wrap"></div>
                                </div>
                                <div class="input-group">
                                    <label class="custom-label">From Bin</label>
                                    <div id="ns-bin-wrap"></div>
                                </div>
                                <div class="input-group">
                                    <label class="custom-label">Quantity</label>
                                    <div id="ns-qty-wrap"></div>
                                </div>
                                <div class="input-group">
                                    <label class="custom-label">Action</label>
                                    <div id="ns-action-wrap"></div>
                                </div>
                                <div class="btn-area">
                                    <button type="button" class="custom-btn btn-success" onclick="submitNonSerialized()">Submit</button>
                                    <button type="button" class="custom-btn btn-outline" onclick="clearForm()">Clear</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="display:none;">
            `;

            // Serialized field
            const serialField = form.addField({ id: 'custpage_serial_numbers', type: serverWidget.FieldType.TEXTAREA, label: 'Serials' });
            serialField.updateDisplaySize({ height: 10, width: 60 });

            // Non-serialized fields
            const nsItemField = form.addField({ id: 'custpage_ns_item', type: serverWidget.FieldType.SELECT, label: 'Item', source: 'item' });
            nsItemField.updateDisplaySize({ height: 1, width: 60 });

            const nsBinField = form.addField({ id: 'custpage_ns_bin', type: serverWidget.FieldType.SELECT, label: 'From Bin', source: 'bin' });
            nsBinField.updateDisplaySize({ height: 1, width: 60 });

            const nsQtyField = form.addField({ id: 'custpage_ns_quantity', type: serverWidget.FieldType.INTEGER, label: 'Quantity' });

            const nsActionField = form.addField({ id: 'custpage_ns_action', type: serverWidget.FieldType.SELECT, label: 'Action' });
            nsActionField.addSelectOption({ value: '', text: '-- Select Action --' });
            nsActionField.addSelectOption({ value: 'back_to_stock', text: 'Back to Stock' });
            nsActionField.addSelectOption({ value: 'likenew', text: 'Change to Like New' });
            nsActionField.addSelectOption({ value: 'likenew_stock', text: 'Change to Like New & Back to Stock' });
            nsActionField.addSelectOption({ value: 'defective', text: 'Defective' });
            nsActionField.addSelectOption({ value: 'move_refurbishing', text: 'Move to Refurbishing' });
            nsActionField.addSelectOption({ value: 'move_testing', text: 'Move to Testing' });
            nsActionField.addSelectOption({ value: 'return_to_vendor', text: 'Return to Vendor' });
            nsActionField.addSelectOption({ value: 'trash', text: 'Trash' });

            const containerEnd = form.addField({ id: 'custpage_container_end', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            containerEnd.defaultValue = `</div>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    // Move serialized field to its wrapper
                    var serialWrap = document.getElementById('serial-field-wrap');
                    var serialLabel = document.getElementById('custpage_serial_numbers_fs_lbl_uir_label');
                    if (serialWrap && serialLabel) serialWrap.appendChild(serialLabel.parentNode);

                    // Move non-serialized fields to their wrappers
                    var nsItemWrap = document.getElementById('ns-item-wrap');
                    var nsItemLabel = document.getElementById('custpage_ns_item_fs_lbl_uir_label');
                    if (nsItemWrap && nsItemLabel) nsItemWrap.appendChild(nsItemLabel.parentNode);

                    var nsBinWrap = document.getElementById('ns-bin-wrap');
                    var nsBinLabel = document.getElementById('custpage_ns_bin_fs_lbl_uir_label');
                    if (nsBinWrap && nsBinLabel) nsBinWrap.appendChild(nsBinLabel.parentNode);

                    var nsQtyWrap = document.getElementById('ns-qty-wrap');
                    var nsQtyLabel = document.getElementById('custpage_ns_quantity_fs_lbl_uir_label');
                    if (nsQtyWrap && nsQtyLabel) nsQtyWrap.appendChild(nsQtyLabel.parentNode);

                    var nsActionWrap = document.getElementById('ns-action-wrap');
                    var nsActionLabel = document.getElementById('custpage_ns_action_fs_lbl_uir_label');
                    if (nsActionWrap && nsActionLabel) nsActionWrap.appendChild(nsActionLabel.parentNode);

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
                        <select class="action-select" data-index="${idx}" onchange="handleActionChange(this)">
                            <option value="">-- No Action --</option>
                            <option value="back_to_stock">Back to Stock</option>
                            <option value="likenew">Change to Like New</option>
                            <option value="likenew_stock">Change to Like New &amp; Back to Stock</option>
                            <option value="serial_change_stock">Change Serial &amp; Back to Stock</option>
                            <option value="defective">Defective</option>
                            <option value="move_refurbishing">Move to Refurbishing</option>
                            <option value="move_testing">Move to Testing</option>
                            <option value="return_to_vendor">Return to Vendor</option>
                            <option value="serial_change">Serial Number Change</option>
                            <option value="trash">Trash</option>
                        </select>
                        <input type="text" class="new-serial-input" data-index="${idx}" placeholder="Enter new serial" style="display:none; margin-top:8px; width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
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
                                    <option value="back_to_stock">Back to Stock</option>
                                    <option value="likenew">Change to Like New</option>
                                    <option value="likenew_stock">Change to Like New &amp; Back to Stock</option>
                                    <option value="defective">Defective</option>
                                    <option value="move_refurbishing">Move to Refurbishing</option>
                                    <option value="move_testing">Move to Testing</option>
                                    <option value="return_to_vendor">Return to Vendor</option>
                                    <option value="trash">Trash</option>
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

        function createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId) {
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
            const recordIdForPrint = adjustmentTranId || binTransferTranId || serialChangeTranId || '';

            const printUrl = suiteletUrl +
                '&ajax_action=printpage' +
                '&record_id=' + encodeURIComponent(recordIdForPrint) +
                '&label_data=' + encodeURIComponent(JSON.stringify(printData));

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + getSuccessPageScript(suiteletUrl, printUrl);

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
                    'trash': 'Trash'
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

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    <div class="main-card">
                        <div class="success-card">
                            <div class="success-icon">&#10003;</div>
                            <h2>Transactions have been created!</h2>
                            ${transactionInfoHtml}
                            <p style="color:#64748b; margin-top:16px;">${totalSerials} serial${totalSerials !== 1 ? 's' : ''} processed</p>

                            ${groupsHtml}

                            <button type="button" class="custom-btn btn-success" style="width:100%; margin-top:16px;" onclick="printLabels()">Print Labels (${totalSerials})</button>
                            <button type="button" class="custom-btn btn-outline" style="width:100%; margin-top:12px;" onclick="createAnother()">Process More</button>
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

            // Build map of index → action (including newSerial for serial_change)
            const actionMap = {};
            actions.forEach(a => {
                if (a.action && a.action !== '') {
                    actionMap[a.index] = { action: a.action, newSerial: a.newSerial || '' };
                }
            });

            if (Object.keys(actionMap).length === 0) {
                createResultsPage(context, serialData, 'Select an action for at least one serial number.', 'warning');
                return;
            }

            // Separate actions into adjustment vs bin transfer vs serial change
            const ADJUSTMENT_ACTIONS = ['likenew', 'likenew_stock'];
            const BIN_TRANSFER_ACTIONS = ['move_testing', 'move_refurbishing', 'back_to_stock', 'defective', 'trash', 'return_to_vendor'];
            const SERIAL_CHANGE_ACTIONS = ['serial_change', 'serial_change_stock'];

            const errors = [];
            const itemDetailsCache = {}; // itemId → { itemid, displayname, description }
            const targetItemCache = {}; // sourceItemId → { found, targetItem } (for adjustment actions)

            // Groups for inventory adjustment (condition change)
            const adjustmentGroupMap = {};
            // Groups for bin transfer (move to testing/refurbishing)
            const binTransferGroupMap = {};
            // List for serial number changes (each is processed individually)
            const serialChangeList = [];

            for (const [idxStr, actionData] of Object.entries(actionMap)) {
                const idx = parseInt(idxStr, 10);
                const serial = serialData.valid[idx];
                if (!serial) continue;

                const action = actionData.action;
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
                }
            }

            const adjustmentGroups = Object.values(adjustmentGroupMap);
            const binTransferGroups = Object.values(binTransferGroupMap);

            if (adjustmentGroups.length === 0 && binTransferGroups.length === 0 && serialChangeList.length === 0) {
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

            createSuccessPage(context, adjustmentTranId, binTransferTranId, labelGroups, serialChangeTranId);
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

            let adjustmentTranId = null;
            let binTransferTranId = null;

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
            }

            // Show success page for non-serialized
            createNonSerializedSuccessPage(context, adjustmentTranId, binTransferTranId, itemDetails, quantity, action);
        }

        /**
         * Success page for non-serialized items (no serial list to display).
         */
        function createNonSerializedSuccessPage(context, adjustmentTranId, binTransferTranId, itemDetails, quantity, action) {
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
            const recordIdForPrint = adjustmentTranId || binTransferTranId || '';

            const printUrl = suiteletUrl +
                '&ajax_action=printpage' +
                '&record_id=' + encodeURIComponent(recordIdForPrint) +
                '&label_data=' + encodeURIComponent(JSON.stringify(printData));

            const styleField = form.addField({ id: 'custpage_styles', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            styleField.defaultValue = getStyles() + `
                <script>
                    function printLabels() { window.open('${escapeForJs(printUrl)}', '_blank'); }
                    function createAnother() { window.location.href = '${escapeForJs(suiteletUrl)}'; }
                </script>
            `;

            // Build transaction info lines
            let transactionInfoHtml = '';
            if (adjustmentTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Inventory Adjustment:</strong> ${escapeXml(String(adjustmentTranId))}</p>`;
            }
            if (binTransferTranId) {
                transactionInfoHtml += `<p style="font-size:16px; margin:8px 0; color:#1e3c72;"><strong>Bin Transfer:</strong> ${escapeXml(String(binTransferTranId))}</p>`;
            }

            const actionLabel = {
                'back_to_stock': 'Back to Stock',
                'defective': 'Defective',
                'likenew': 'Change to Like New',
                'likenew_stock': 'Change to Like New & Back to Stock',
                'move_refurbishing': 'Move to Refurbishing',
                'move_testing': 'Move to Testing',
                'return_to_vendor': 'Return to Vendor',
                'trash': 'Trash'
            }[action] || action;

            const contentField = form.addField({ id: 'custpage_content', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
            contentField.defaultValue = `
                <div class="app-container">
                    <div class="main-card">
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

                            <button type="button" class="custom-btn btn-success" style="width:100%; margin-top:16px;" onclick="printLabels()">Print Labels (${quantity})</button>
                            <button type="button" class="custom-btn btn-outline" style="width:100%; margin-top:12px;" onclick="createAnother()">Process More</button>
                        </div>
                    </div>
                </div>
            `;

            context.response.writePage(form);
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

                    if (action === 'process_nonserialized') {
                        handleProcessNonSerialized(context);
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
