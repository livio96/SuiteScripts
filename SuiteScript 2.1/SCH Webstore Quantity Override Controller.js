/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleName Manual_Quantity_Override_Monitor
 */

define(['N/search', 'N/record', 'N/email', 'N/runtime', 'N/format'], 
function(search, record, email, runtime, format) {

    /**
     * Scheduled script to monitor items with manual quantity override
     * Checks orders created in last 30 minutes and takes action based on quantity
     */
    function execute(context) {
        
        try {
            log.audit('Script Start', 'Starting Manual Quantity Override Monitor');
            
            // Calculate timestamp for 30 minutes ago
            var thirtyMinutesAgo = new Date();
            thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);
            
            log.debug('Time Filter', 'Looking for orders after: ' + thirtyMinutesAgo);
            
            // Create search for items with manual override
            var itemSearch = search.create({
                type: "inventoryitem",
                filters: [
                    ["type", "anyof", "InvtPart"], 
                    "AND", 
                    ["isinactive", "is", "F"], 
                    "AND", 
                    ["custitem_web_manual_override", "anyof", "1", "2", "3", "4", "5", "6"]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "Internal ID" }),
                    search.createColumn({ name: "itemid", label: "Name" }),
                    search.createColumn({ name: "salesdescription", label: "Description" }),
                    search.createColumn({ name: "quantityavailable", label: "Available" }),
                    search.createColumn({ name: "custitem_web_manual_override", label: "Webstore Quantity Manual Override" }),
                    search.createColumn({ name: "custitem_awa_brand", label: "WebStore Brand" })
                ]
            });
            
            var itemResults = [];
            var searchResultCount = itemSearch.runPaged().count;
            log.audit('Items Found', searchResultCount + ' items with manual override');
            
            // Get all items from the search
            itemSearch.run().each(function(result) {
                var itemId = result.getValue({ name: 'internalid' }) || result.id;
                var itemName = result.getValue({ name: 'itemid' });
                var description = result.getValue({ name: 'salesdescription' });
                var brandValue = result.getValue({ name: 'custitem_awa_brand' });
                var brandText = result.getText({ name: 'custitem_awa_brand' });
                
                itemResults.push({
                    id: itemId,
                    name: itemName,
                    displayName: description || itemName,
                    brandValue: brandValue,
                    brandText: brandText
                });
                return true;
            });
            
            // Process each item
            var itemsToEmail = [];
            var itemsToUpdate = [];
            
            for (var i = 0; i < itemResults.length; i++) {
                var item = itemResults[i];
                
                log.debug('Processing Item', 'Item: ' + item.name + ' (ID: ' + item.id + ')');
                
                // Validate item ID before processing
                if (!item.id) {
                    log.error('Skipping Item - No ID', 'Item: ' + item.name);
                    continue;
                }
                
                // Search for sales orders with this item created in last 30 minutes
                var orderQuantitySum = getRecentOrderQuantity(item.id, thirtyMinutesAgo);
                
                log.debug('Order Quantity Sum', 'Item: ' + item.name + ', Total Qty: ' + orderQuantitySum);
                
                if (orderQuantitySum > 0) {
                    if (orderQuantitySum === 1) {
                        // Add to email notification list
                        itemsToEmail.push({
                            id: item.id,
                            name: item.name,
                            displayName: item.displayName,
                            quantity: orderQuantitySum,
                            brandValue: item.brandValue,
                            brandText: item.brandText
                        });
                    } else if (orderQuantitySum > 1) {
                        // Add to update list (clear manual override)
                        itemsToUpdate.push({
                            id: item.id,
                            name: item.name,
                            displayName: item.displayName,
                            quantity: orderQuantitySum
                        });
                    }
                }
            }
            
            // Send email notification for items with quantity = 1
            if (itemsToEmail.length > 0) {
                sendEmailNotification(itemsToEmail);
            }
            
            // Clear manual override for items with quantity > 1
            if (itemsToUpdate.length > 0) {
                clearManualOverride(itemsToUpdate);
            }
            
            log.audit('Script Complete', {
                totalItemsProcessed: itemResults.length,
                itemsEmailed: itemsToEmail.length,
                itemsUpdated: itemsToUpdate.length
            });
            
        } catch (e) {
            log.error('Script Error', e.toString() + '\n' + e.stack);
        }
    }
    
    /**
     * Get the sum of quantities for an item from orders created in last 30 minutes
     */
    function getRecentOrderQuantity(itemId, sinceDate) {
        
        var totalQuantity = 0;
        
        // Validate itemId
        if (!itemId) {
            log.error('Invalid Item ID', 'Item ID is null or undefined');
            return 0;
        }
        
        try {
            // Create search for sales order lines
            var orderSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['type', 'anyof', 'SalesOrd'],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['item', 'anyof', itemId],
                    'AND',
                    ['location', 'anyof', '1'],
                    'AND',
                    ['datecreated', 'onorafter', formatDateForSearch(sinceDate)]
                ],
                columns: [
                    search.createColumn({ name: 'tranid' }),
                    search.createColumn({ name: 'datecreated' }),
                    search.createColumn({ name: 'item' }),
                    search.createColumn({ name: 'quantity' })
                ]
            });
            
            orderSearch.run().each(function(result) {
                var qty = parseFloat(result.getValue({ name: 'quantity' })) || 0;
                totalQuantity += qty;
                
                log.debug('Order Found', {
                    order: result.getValue({ name: 'tranid' }),
                    dateCreated: result.getValue({ name: 'datecreated' }),
                    quantity: qty
                });
                
                return true;
            });
            
        } catch (e) {
            log.error('Error Getting Order Quantity', 'Item ID: ' + itemId + ', Error: ' + JSON.stringify(e));
        }
        
        return totalQuantity;
    }
    
    /**
     * Format date for NetSuite search filter
     */
    function formatDateForSearch(dateObj) {
        // Format: MM/DD/YYYY HH:MM AM/PM
        var month = dateObj.getMonth() + 1;
        var day = dateObj.getDate();
        var year = dateObj.getFullYear();
        var hours = dateObj.getHours();
        var minutes = dateObj.getMinutes();
        var ampm = hours >= 12 ? 'PM' : 'AM';
        
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        minutes = minutes < 10 ? '0' + minutes : minutes;
        
        return month + '/' + day + '/' + year + ' ' + hours + ':' + minutes + ' ' + ampm;
    }
    
    /**
     * Send email notification for items with quantity = 1
     */
    function sendEmailNotification(items) {
        
        try {
            var emailBody = 'The following items have been ordered (quantity = 1) and are currently on quantity override:\n\n';
            
            // Check if any items are Cisco brand
            var hasCiscoItems = false;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                // Check both the value (ID) and text for Cisco
                if (item.brandValue === '3' || item.brandValue === 3 || 
                    (item.brandText && item.brandText.toLowerCase() === 'cisco')) {
                    hasCiscoItems = true;
                }
            }
            
            // Build email body
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                emailBody += (i + 1) + '. ' + item.name + ' - ' + item.displayName + '\n';
                emailBody += '   Item ID: ' + item.id + '\n';
                emailBody += '   Quantity Ordered: ' + item.quantity + '\n';
                if (item.brandText) {
                    emailBody += '   Brand: ' + item.brandText + '\n';
                }
                emailBody += '\n';
            }
            
            emailBody += '\nThese items remain on manual quantity override as only 1 unit was ordered.\n';
            emailBody += 'Please review and take appropriate action.\n';
            
            var currentUser = runtime.getCurrentUser();
            
            // Prepare email parameters
            var emailParams = {
                author: 1692630,
                recipients: 'website@telquestintl.com',
                subject: 'Manual Quantity Override Alert - QTY Sold (Qty=1)',
                body: emailBody
            };
            
            // Add CC if there are Cisco items
            if (hasCiscoItems) {
                emailParams.cc = ['fvelasquez@telquestintl.com', 'lbeqiri@telquestintl.com'];
                log.audit('Email CC Added', 'Cisco items detected - CCing fvelasquez@telquestintl.com');
            }
            
            email.send(emailParams);
            
            log.audit('Email Sent', 'Notification sent for ' + items.length + ' items' + 
                     (hasCiscoItems ? ' (Cisco items included - CC sent)' : ''));
            
        } catch (e) {
            log.error('Email Error', e.toString());
        }
    }
    
    /**
     * Clear manual override field for items with quantity > 1
     */
    function clearManualOverride(items) {
        
        var successCount = 0;
        var errorCount = 0;
        
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            
            try {
                // Load and update the inventory item
                var itemRecord = record.load({
                    type: record.Type.INVENTORY_ITEM,
                    id: item.id
                });
                
                // Clear the manual override field
                itemRecord.setValue({
                    fieldId: 'custitem_web_manual_override',
                    value: ''
                });
                
                itemRecord.save();
                
                successCount++;
                
                log.audit('Manual Override Cleared', {
                    item: item.name,
                    id: item.id,
                    quantityOrdered: item.quantity
                });
                
            } catch (e) {
                errorCount++;
                log.error('Update Error', 'Item: ' + item.name + ' (ID: ' + item.id + '), Error: ' + e.toString());
            }
        }
        
        log.audit('Update Complete', {
            successful: successCount,
            failed: errorCount,
            total: items.length
        });
    }
    
    return {
        execute: execute
    };
});
