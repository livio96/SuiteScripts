/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */

define(['N/record', 'N/search', 'N/log', 'N/error'], function(record, search, log, error) {
    
    /**
     * Scheduled script entry point
     * @param {Object} context
     * @param {string} context.type - The context in which the script is executed
     */
    function execute(context) {
        try {
            log.audit('Script Started', 'Processing parsed PDF records to create sales orders');
            
            // Get all parsed PDF records that haven't been processed yet
            var parsedPdfRecords = getParsedPdfRecords();
            
            log.audit('Records Found', `Found ${parsedPdfRecords.length} parsed PDF records to process`);
            
            var successCount = 0;
            var errorCount = 0;
            var errorDetails = [];
            
            // Process each parsed PDF record
            parsedPdfRecords.forEach(function(pdfRecord) {
                try {
                    log.debug('Processing Record', `Starting to process parsed PDF ID: ${pdfRecord.id}`);
                    var salesOrderId = createSalesOrderFromParsedPdf(pdfRecord);
                    if (salesOrderId) {
                        // Mark the parsed PDF as processed
                        markAsProcessed(pdfRecord.id, salesOrderId);
                        successCount++;
                        log.audit('Sales Order Created', `Created SO ${salesOrderId} from parsed PDF ${pdfRecord.id}`);
                    }
                } catch (e) {
                    errorCount++;
                    var errorMsg = `Failed to process parsed PDF ${pdfRecord.id}: ${e.name} - ${e.message}`;
                    if (e.stack) {
                        errorMsg += `\nStack trace: ${e.stack}`;
                    }
                    errorDetails.push({
                        recordId: pdfRecord.id,
                        error: e.message,
                        type: e.name
                    });
                    log.error('Error Processing Record', errorMsg);
                }
            });
            
            log.audit('Script Completed', {
                message: 'Processing complete',
                successCount: successCount,
                errorCount: errorCount,
                errors: errorDetails
            });
            
        } catch (e) {
            log.error('Script Error', {
                name: e.name,
                message: e.message,
                stack: e.stack
            });
            throw e;
        }
    }
    
    /**
     * Get all parsed PDF records that need to be processed
     * @returns {Array} Array of parsed PDF record data
     */
    function getParsedPdfRecords() {
        try {
            log.debug('getParsedPdfRecords', 'Creating search for unprocessed parsed PDF records');
            
            // FIX: The filter was malformed. In NetSuite 2.1, boolean fields should use 'is' with T/F values
            var filters = [
                ['custrecord_parse_pdf_processed', 'is', 'F']
            ];
            
            // Add 'AND' if you need multiple filters
            // filters = [
            //     ['custrecord_parse_pdf_processed', 'is', 'F'],
            //     'AND',
            //     ['isinactive', 'is', 'F']
            // ];
            
            log.debug('Search Filters', JSON.stringify(filters));
            
            var parsedPdfSearch = search.create({
                type: 'customrecord_parsed_pdf',
                filters: filters,
                columns: [
                    'internalid',
                    'custrecord_purch_order_num',
                    'custrecord_purch_company_name',
                    'custrecord_special_instructions',
                    'custrecord_cust_name_list',
                    'custrecord_company_website'
                ]
            });
            
            var searchResults = parsedPdfSearch.run().getRange({
                start: 0,
                end: 1000 // Adjust based on your needs
            });
            
            log.debug('Search Results', `Found ${searchResults.length} unprocessed records`);
            
            return searchResults.map(function(result) {
                return {
                    id: result.getValue('internalid'),
                    poNumber: result.getValue('custrecord_purch_order_num'),
                    companyName: result.getValue('custrecord_purch_company_name'),
                    specialInstructions: result.getValue('custrecord_special_instructions'),
                    customerList: result.getValue('custrecord_cust_name_list'),
                    website: result.getValue('custrecord_company_website')
                };
            });
        } catch (e) {
            log.error('getParsedPdfRecords Error', {
                name: e.name,
                message: e.message,
                details: 'Error occurred while searching for parsed PDF records',
                stack: e.stack
            });
            throw e;
        }
    }
    
    /**
     * Get parsed PDF line items for a specific parent record
     * @param {string} parentId - Internal ID of the parent parsed PDF record
     * @returns {Array} Array of line item data
     */
    function getParsedPdfLines(parentId) {
        try {
            log.debug('getParsedPdfLines', `Searching for line items for parent ID: ${parentId}`);
            
            var lineSearch = search.create({
                type: 'customrecord_parsed_pdf_line',
                filters: [
                    ['custrecord_parent_po', 'anyof', parentId],
                    'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: [
                    'internalid',
                    'custrecord_parsed_pdf_line_item',
                    'custrecord_parsed_pdf_line_price',
                    'custrecord_parsed_pdf_line_quantity',
                    'custrecord_parsed_pdf_line_condition'
                ]
            });
            
            var lineResults = lineSearch.run().getRange({
                start: 0,
                end: 1000
            });
            
            log.debug('Line Items Found', `Found ${lineResults.length} line items for parent ${parentId}`);
            
            return lineResults.map(function(result) {
                return {
                    id: result.getValue('internalid'),
                    item: result.getValue('custrecord_parsed_pdf_line_item'),
                    price: parseFloat(result.getValue('custrecord_parsed_pdf_line_price')) || 0,
                    quantity: parseInt(result.getValue('custrecord_parsed_pdf_line_quantity')) || 1,
                    condition: result.getValue('custrecord_parsed_pdf_line_condition')
                };
            });
        } catch (e) {
            log.error('getParsedPdfLines Error', {
                name: e.name,
                message: e.message,
                parentId: parentId,
                stack: e.stack
            });
            throw e;
        }
    }
    
    /**
     * Create a sales order from parsed PDF data
     * @param {Object} pdfRecord - Parsed PDF record data
     * @returns {string} Internal ID of created sales order
     */
    function createSalesOrderFromParsedPdf(pdfRecord) {
        try {
            log.debug('createSalesOrderFromParsedPdf', `Starting SO creation for PDF record: ${JSON.stringify(pdfRecord)}`);
            
            // Get the line items for this parsed PDF
            var lineItems = getParsedPdfLines(pdfRecord.id);
            
            if (lineItems.length === 0) {
                log.debug('No Line Items', `No line items found for parsed PDF ${pdfRecord.id}`);
                return null;
            }
            
            log.debug('Line Items to Process', JSON.stringify(lineItems));
            
            // Create the sales order record
            var salesOrder = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });
            
            // Set header fields
            var customerId = getOrCreateCustomer(pdfRecord.companyName);
            salesOrder.setValue('entity', customerId);
            
            // Set sales rep field (1706846 = specific employee ID)
            try {
                salesOrder.setValue('salesrep', 1706846);
                log.debug('Sales Rep Set', 'Set salesrep to 1706846');
            } catch (e) {
                log.error('Sales Rep Error', `Failed to set salesrep: ${e.message}`);
            }


             // Set custom order origin field (28 = specific origin value)
            try {
                salesOrder.setValue('custbody_order_contact_email', 'website@telquestintl.com');
            } catch (e) {
                log.error('Order Origin Error', `Failed to set custbody_order_contact_email: ${e.message}`);
            }
            
            // Set custom order origin field (28 = specific origin value)
            try {
                salesOrder.setValue('custbodyorder_origin', 28);
                log.debug('Order Origin Set', 'Set custbody_order_origin to 28');
            } catch (e) {
                log.error('Order Origin Error', `Failed to set custbody_order_origin: ${e.message}`);
            }
            
            // Set class field (8 = specific class ID)
            try {
                salesOrder.setValue('class', 8);
                log.debug('Class Set', 'Set class to 8');
            } catch (e) {
                log.error('Class Error', `Failed to set class: ${e.message}`);
            }
            
            // Set other header fields
            if (pdfRecord.poNumber) {
                salesOrder.setValue('otherrefnum', pdfRecord.poNumber); // Customer PO#
            }
            
            if (pdfRecord.specialInstructions) {
                salesOrder.setValue('memo', pdfRecord.specialInstructions);
            }
            
            // Add line items
            var addedItems = 0;
            lineItems.forEach(function(lineItem, index) {
                try {
                    log.debug('Processing Line Item', `Line ${index + 1}: ${JSON.stringify(lineItem)}`);
                    
                    var modifiedItemName = getModifiedItemName(lineItem.item, lineItem.condition);
                    var itemId = getOrCreateItem(modifiedItemName, lineItem.item);
                    
                    if (itemId) {
                        // Add line to sales order
                        salesOrder.selectNewLine({ sublistId: 'item' });
                        salesOrder.setCurrentSublistValue({ 
                            sublistId: 'item', 
                            fieldId: 'item', 
                            value: itemId 
                        });
                        salesOrder.setCurrentSublistValue({ 
                            sublistId: 'item', 
                            fieldId: 'quantity', 
                            value: lineItem.quantity 
                        });
                        
                        // Set price level to custom (-1)
                        try {
                            salesOrder.setCurrentSublistValue({ 
                                sublistId: 'item', 
                                fieldId: 'price', 
                                value: -1  // -1 = Custom price level
                            });
                            log.debug('Price Level Set', 'Set price level to Custom (-1)');
                        } catch (e) {
                            log.error('Price Level Error', `Failed to set price level: ${e.message}`);
                        }
                        
                        // Set the rate after setting price level to custom
                        salesOrder.setCurrentSublistValue({ 
                            sublistId: 'item', 
                            fieldId: 'rate', 
                            value: lineItem.price 
                        });
                        
                        // Set class on line level if needed (8 = specific class ID)
                        try {
                            salesOrder.setCurrentSublistValue({ 
                                sublistId: 'item', 
                                fieldId: 'class', 
                                value: 8
                            });
                            log.debug('Line Class Set', `Set class to 8 for line ${index + 1}`);
                        } catch (e) {
                            log.error('Line Class Error', `Failed to set class on line ${index + 1}: ${e.message}`);
                        }
                        
                        salesOrder.commitLine({ sublistId: 'item' });
                        addedItems++;
                        log.debug('Line Item Added', `Successfully added item ${modifiedItemName} to SO`);
                    } else {
                        log.error('Item Not Found', `Could not find or create item: ${modifiedItemName}`);
                    }
                } catch (lineError) {
                    log.error('Line Item Error', {
                        message: `Error adding line item ${index + 1}`,
                        item: lineItem,
                        error: lineError.message,
                        stack: lineError.stack
                    });
                }
            });
            
            if (addedItems === 0) {
                throw error.create({
                    name: 'NO_ITEMS_ADDED',
                    message: 'No items could be added to the sales order'
                });
            }
            
            // Save the sales order
            log.debug('Saving Sales Order', `Attempting to save SO with ${addedItems} line items`);
            var salesOrderId = salesOrder.save();
            log.audit('Sales Order Saved', `Successfully saved SO ${salesOrderId}`);
            
            return salesOrderId;
            
        } catch (e) {
            log.error('Sales Order Creation Error', {
                message: `Error creating sales order for parsed PDF ${pdfRecord.id}`,
                pdfRecord: pdfRecord,
                errorName: e.name,
                errorMessage: e.message,
                stack: e.stack
            });
            throw e;
        }
    }
    
    /**
     * Modify item name based on condition
     * @param {string} itemName - Original item name
     * @param {string} condition - Item condition (New/Used)
     * @returns {string} Modified item name
     */
    function getModifiedItemName(itemName, condition) {
        if (!itemName) return itemName;
        
        var suffix = '';
        if (condition && condition.toLowerCase() === 'new') {
            suffix = '-N';
        } else if (condition && condition.toLowerCase() === 'used') {
            suffix = '-LN';
        }
        
        var modifiedName = itemName + suffix;
        log.debug('Item Name Modified', `Original: ${itemName}, Condition: ${condition}, Modified: ${modifiedName}`);
        
        return modifiedName;
    }
    
    /**
     * Get or create customer record
     * @param {string} companyName - Company name
     * @returns {string} Customer internal ID
     */
    function getOrCreateCustomer(companyName) {
        try {
            if (!companyName) {
                throw error.create({
                    name: 'MISSING_COMPANY_NAME',
                    message: 'Company name is required to create sales order'
                });
            }
            
            log.debug('getOrCreateCustomer', `Searching for customer: ${companyName}`);
            
            // Search for existing customer
            var customerSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['companyname', 'is', companyName]
                ],
                columns: ['internalid']
            });
            
            var customerResult = customerSearch.run().getRange({
                start: 0,
                end: 1
            });
            
            if (customerResult.length > 0) {
                var existingId = customerResult[0].getValue('internalid');
                log.debug('Customer Found', `Found existing customer ${companyName} with ID ${existingId}`);
                return existingId;
            }
            
            // Create new customer if not found
            log.debug('Creating Customer', `Customer ${companyName} not found, creating new record`);
            
            var customerRecord = record.create({
                type: record.Type.CUSTOMER
            });
            
            customerRecord.setValue('companyname', companyName);
            customerRecord.setValue('subsidiary', 1); // Adjust subsidiary as needed
            
            var customerId = customerRecord.save();
            log.audit('Customer Created', `Created new customer ${companyName} with ID ${customerId}`);
            
            return customerId;
        } catch (e) {
            log.error('getOrCreateCustomer Error', {
                companyName: companyName,
                error: e.message,
                stack: e.stack
            });
            throw e;
        }
    }
    
    /**
     * Get or create item record
     * @param {string} modifiedItemName - Item name with condition suffix
     * @param {string} originalItemName - Original item name without suffix
     * @returns {string} Item internal ID
     */
    function getOrCreateItem(modifiedItemName, originalItemName) {
        try {
            if (!modifiedItemName) {
                log.warn('getOrCreateItem', 'No item name provided');
                return null;
            }
            
            log.debug('getOrCreateItem', `Searching for item: ${modifiedItemName}`);
            
            // Search for existing item by name
            var itemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters: [
                    ['itemid', 'is', modifiedItemName]
                ],
                columns: ['internalid']
            });
            
            var itemResult = itemSearch.run().getRange({
                start: 0,
                end: 1
            });
            
            if (itemResult.length > 0) {
                var existingId = itemResult[0].getValue('internalid');
                log.debug('Item Found', `Found existing item ${modifiedItemName} with ID ${existingId}`);
                return existingId;
            }
            
            // If item with modified name doesn't exist, search for original item name
            log.debug('Searching Original', `Modified item not found, searching for original: ${originalItemName}`);
            
            var originalItemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters: [
                    ['itemid', 'is', originalItemName]
                ],
                columns: ['internalid']
            });
            
            var originalItemResult = originalItemSearch.run().getRange({
                start: 0,
                end: 1
            });
            
            if (originalItemResult.length > 0) {
                var originalId = originalItemResult[0].getValue('internalid');
                log.debug('Original Item Found', `Found original item ${originalItemName} with ID ${originalId}`);
                return originalId;
            }
            
            // Create new item if not found
            log.debug('Creating Item', `Item ${modifiedItemName} not found, creating new record`);
            
            try {
                var itemRecord = record.create({
                    type: record.Type.INVENTORY_ITEM
                });
                
                itemRecord.setValue('itemid', modifiedItemName);
                itemRecord.setValue('displayname', modifiedItemName);
                itemRecord.setValue('subsidiary', 1); // Adjust subsidiary as needed
                
                var itemId = itemRecord.save();
                log.audit('Item Created', `Created new item ${modifiedItemName} with ID ${itemId}`);
                
                return itemId;
            } catch (createError) {
                log.error('Item Creation Error', {
                    itemName: modifiedItemName,
                    error: createError.message,
                    stack: createError.stack
                });
                return null;
            }
        } catch (e) {
            log.error('getOrCreateItem Error', {
                modifiedItemName: modifiedItemName,
                originalItemName: originalItemName,
                error: e.message,
                stack: e.stack
            });
            return null;
        }
    }
    
    /**
     * Mark parsed PDF record as processed
     * @param {string} parsedPdfId - Internal ID of parsed PDF record
     * @param {string} salesOrderId - Internal ID of created sales order
     */
    function markAsProcessed(parsedPdfId, salesOrderId) {
        try {
            log.debug('markAsProcessed', `Marking parsed PDF ${parsedPdfId} as processed with SO ${salesOrderId}`);
            
            var updatedRecord = record.submitFields({
                type: 'customrecord_parsed_pdf',
                id: parsedPdfId,
                values: {
                    'custrecord_parse_pdf_processed': true,
                    'custrecord_parsed_pdf_sales_order': salesOrderId
                }
            });
            
            log.debug('Record Updated', `Successfully marked parsed PDF ${parsedPdfId} as processed`);
        } catch (e) {
            log.error('Update Error', {
                message: `Failed to mark parsed PDF ${parsedPdfId} as processed`,
                parsedPdfId: parsedPdfId,
                salesOrderId: salesOrderId,
                error: e.message,
                stack: e.stack
            });
        }
    }
    
    return {
        execute: execute
    };
});
