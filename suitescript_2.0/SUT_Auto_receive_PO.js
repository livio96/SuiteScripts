/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget', 'N/record', 'N/search', 'N/redirect', 'N/log'], 
    (serverWidget, record, search, redirect, log) => {

    /**
     * Handles the GET and POST requests
     * @param {Object} context
     */
    const onRequest = (context) => {
        try {
            if (context.request.method === 'GET') {
                showForm(context);
            } else if (context.request.method === 'POST') {
                processReceiving(context);
            }
        } catch (e) {
            log.error('onRequest Error', e.toString());
            showErrorPage(context, e.toString());
        }
    };

    /**
     * Display the input form
     * @param {Object} context
     */
    const showForm = (context) => {
        const form = serverWidget.createForm({
            title: 'Receive Purchase Order with Serial Numbers'
        });

        // Add fields
        form.addField({
            id: 'custpage_po_number',
            type: serverWidget.FieldType.TEXT,
            label: 'Purchase Order Number'
        }).isMandatory = true;

        form.addField({
            id: 'custpage_item_name',
            type: serverWidget.FieldType.TEXT,
            label: 'Item Name/Number'
        }).isMandatory = true;

        const serialField = form.addField({
            id: 'custpage_serial_numbers',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Serial Numbers (one per line)'
        });
        serialField.isMandatory = true;
        serialField.setHelpText({
            help: 'Enter each serial number on a new line'
        });

        // Add submit button
        form.addSubmitButton({
            label: 'Receive Items'
        });

        context.response.writePage(form);
    };

    /**
     * Process the receiving transaction
     * @param {Object} context
     */
    const processReceiving = (context) => {
        const params = context.request.parameters;
        const poNumber = params.custpage_po_number;
        const itemName = params.custpage_item_name;
        const serialNumbersText = params.custpage_serial_numbers;
        
        // Parse serial numbers
        const serialNumbers = serialNumbersText
            .split('\n')
            .map(sn => sn.trim())
            .filter(sn => sn.length > 0);

        log.debug('Processing', {
            poNumber: poNumber,
            itemName: itemName,
            serialCount: serialNumbers.length
        });

        try {
            // Find the Purchase Order
            const poId = findPurchaseOrder(poNumber);
            if (!poId) {
                throw new Error(`Purchase Order ${poNumber} not found`);
            }

            // Get item internal ID
            const itemId = findItem(itemName);
            if (!itemId) {
                throw new Error(`Item ${itemName} not found`);
            }

            // Get preferred bin and location for the item
            const itemPreferences = getItemPreferences(itemId);
            
            // Create Item Receipt from Purchase Order
            const itemReceipt = record.transform({
                fromType: record.Type.PURCHASE_ORDER,
                fromId: poId,
                toType: record.Type.ITEM_RECEIPT,
                isDynamic: true
            });

            // Process lines
            const lineCount = itemReceipt.getLineCount({ sublistId: 'item' });
            let processedLines = 0;
            
            for (let i = 0; i < lineCount; i++) {
                itemReceipt.selectLine({
                    sublistId: 'item',
                    line: i
                });
                
                const lineItemId = itemReceipt.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'item'
                });
                
                // Check if this is the item we want to receive
                if (lineItemId == itemId) {
                    // Set receive to false initially
                    itemReceipt.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'itemreceive',
                        value: false
                    });
                    
                    // Get the quantity to receive (based on serial numbers count)
                    const qtyToReceive = serialNumbers.length;
                    
                    // Set receive to true for this line
                    itemReceipt.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'itemreceive',
                        value: true
                    });
                    
                    // Set quantity
                    itemReceipt.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: qtyToReceive
                    });
                    
                    // Set location if available
                    if (itemPreferences.location) {
                        itemReceipt.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'location',
                            value: itemPreferences.location
                        });
                    }
                    
                    // Handle inventory detail (serial numbers and bin)
                    const invDetailSubrecord = itemReceipt.getCurrentSublistSubrecord({
                        sublistId: 'item',
                        fieldId: 'inventorydetail'
                    });
                    
                    if (invDetailSubrecord) {
                        // Add serial numbers
                        for (let j = 0; j < serialNumbers.length; j++) {
                            if (j > 0) {
                                invDetailSubrecord.selectNewLine({
                                    sublistId: 'inventoryassignment'
                                });
                            } else {
                                invDetailSubrecord.selectLine({
                                    sublistId: 'inventoryassignment',
                                    line: 0
                                });
                            }
                            
                            // Set serial number
                            invDetailSubrecord.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'receiptinventorynumber',
                                value: serialNumbers[j]
                            });
                            
                            // Set quantity to 1 for each serial number
                            invDetailSubrecord.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'quantity',
                                value: 1
                            });
                            
                            // Set bin if available
                            if (itemPreferences.bin) {
                                invDetailSubrecord.setCurrentSublistValue({
                                    sublistId: 'inventoryassignment',
                                    fieldId: 'binnumber',
                                    value: itemPreferences.bin
                                });
                            }
                            
                            invDetailSubrecord.commitLine({
                                sublistId: 'inventoryassignment'
                            });
                        }
                    }
                    
                    itemReceipt.commitLine({
                        sublistId: 'item'
                    });
                    processedLines++;
                } else {
                    // Don't receive other items
                    itemReceipt.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'itemreceive',
                        value: false
                    });
                    itemReceipt.commitLine({
                        sublistId: 'item'
                    });
                }
            }
            
            if (processedLines === 0) {
                throw new Error(`Item ${itemName} not found on Purchase Order ${poNumber}`);
            }
            
            // Save the item receipt
            const receiptId = itemReceipt.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });
            
            // Show success page
            showSuccessPage(context, receiptId, serialNumbers.length);
            
        } catch (e) {
            log.error('Processing Error', e.toString());
            showErrorPage(context, e.toString());
        }
    };

    /**
     * Find Purchase Order by number
     * @param {string} poNumber
     * @returns {number|null} Internal ID of the PO
     */
    const findPurchaseOrder = (poNumber) => {
        const poSearch = search.create({
            type: search.Type.PURCHASE_ORDER,
            filters: [
                ['tranid', 'is', poNumber],
                'AND',
                ['mainline', 'is', 'T']
            ],
            columns: ['internalid']
        });
        
        let poId = null;
        poSearch.run().each((result) => {
            poId = result.getValue('internalid');
            return false;
        });
        
        return poId;
    };

    /**
     * Find Item by name or item number
     * @param {string} itemName
     * @returns {number|null} Internal ID of the item
     */
    const findItem = (itemName) => {
        const itemSearch = search.create({
            type: search.Type.ITEM,
            filters: [
                ['name', 'is', itemName],
                'OR',
                ['itemid', 'is', itemName]
            ],
            columns: ['internalid']
        });
        
        let itemId = null;
        itemSearch.run().each((result) => {
            itemId = result.getValue('internalid');
            return false;
        });
        
        return itemId;
    };

    /**
     * Get preferred bin and location for an item
     * @param {number} itemId
     * @returns {Object} Object with bin and location IDs
     */
    const getItemPreferences = (itemId) => {
        const preferences = {
            bin: null,
            location: null
        };
        
        try {
            // Load item record to get preferences
            const itemRec = record.load({
                type: record.Type.SERIALIZED_INVENTORY_ITEM,
                id: itemId,
                isDynamic: false
            });
            
            // Get preferred stock location
            preferences.location = itemRec.getValue('location');
            
            // Get preferred bin (if using bins)
            // This might be in a custom field or location-specific
            // Adjust field ID based on your NetSuite configuration
            preferences.bin = itemRec.getValue('custitem_preferred_bin') || null;
            
            // If no preferred location on item, you might want to get it from subsidiary defaults
            // or use a default location ID
            if (!preferences.location) {
                // Set a default location ID if needed
                // preferences.location = DEFAULT_LOCATION_ID;
            }
            
        } catch (e) {
            log.error('Error getting item preferences', e.toString());
        }
        
        return preferences;
    };

    /**
     * Show success page
     * @param {Object} context
     * @param {number} receiptId
     * @param {number} serialCount
     */
    const showSuccessPage = (context, receiptId, serialCount) => {
        const form = serverWidget.createForm({
            title: 'Items Successfully Received'
        });
        
        const messageField = form.addField({
            id: 'custpage_message',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        
        messageField.defaultValue = `
            <div style="padding: 20px; background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; color: #155724;">
                <h3 style="margin-top: 0;">Success!</h3>
                <p>Item Receipt #${receiptId} has been created successfully.</p>
                <p>${serialCount} serial number(s) have been received.</p>
                <p><a href="/app/accounting/transactions/itemrcpt.nl?id=${receiptId}" target="_blank">View Item Receipt</a></p>
            </div>
        `;
        
        form.addButton({
            id: 'custpage_back',
            label: 'Receive Another',
            functionName: 'window.location.reload()'
        });
        
        context.response.writePage(form);
    };

    /**
     * Show error page
     * @param {Object} context
     * @param {string} errorMessage
     */
    const showErrorPage = (context, errorMessage) => {
        const form = serverWidget.createForm({
            title: 'Error Processing Receipt'
        });
        
        const messageField = form.addField({
            id: 'custpage_message',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        
        messageField.defaultValue = `
            <div style="padding: 20px; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; color: #721c24;">
                <h3 style="margin-top: 0;">Error</h3>
                <p>${errorMessage}</p>
            </div>
        `;
        
        form.addButton({
            id: 'custpage_back',
            label: 'Go Back',
            functionName: 'window.history.back()'
        });
        
        context.response.writePage(form);
    };

    return {
        onRequest: onRequest
    };
});