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
            var skippedCount = 0;
            var errorDetails = [];
            var skippedDetails = [];
            
            // Process each parsed PDF record
            parsedPdfRecords.forEach(function(pdfRecord) {
                try {
                    log.debug('Processing Record', `Starting to process parsed PDF ID: ${pdfRecord.id}`);
                    var result = createSalesOrderFromParsedPdf(pdfRecord);
                    
                    if (result && result.salesOrderId) {
                        // Mark the parsed PDF as processed
                        markAsProcessed(pdfRecord.id, result.salesOrderId);
                        successCount++;
                        log.audit('Sales Order Created', `Created SO ${result.salesOrderId} from parsed PDF ${pdfRecord.id}`);
                    } else if (result && result.skipped) {
                        // Customer not found - mark as skipped
                        skippedCount++;
                        skippedDetails.push({
                            recordId: pdfRecord.id,
                            companyName: pdfRecord.companyName,
                            reason: result.reason
                        });
                        markAsSkipped(pdfRecord.id, result.reason);
                        log.audit('Record Skipped', `Skipped parsed PDF ${pdfRecord.id}: ${result.reason}`);
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
                skippedCount: skippedCount,
                errors: errorDetails,
                skipped: skippedDetails
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
            
            var filters = [
                ['custrecord_parse_pdf_processed', 'is', 'F']
            ];
            
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
     * Get the sales rep for a customer
     * @param {string} customerId - Internal ID of the customer
     * @returns {Object} Object containing salesRepId and source
     */
    function getCustomerSalesRep(customerId) {
        try {
            log.debug('getCustomerSalesRep', `Looking up sales rep for customer ID: ${customerId}`);
            
            // Look up the customer record to check for sales rep
            var customerFields = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: customerId,
                columns: ['salesrep', 'custentity_unassigned_from']
            });
            
            // First check if custentity_unassigned_from has a value
            var unassignedFrom = customerFields.custentity_unassigned_from;
            if (unassignedFrom && unassignedFrom.length > 0) {
                var unassignedFromId = unassignedFrom[0].value;
                log.debug('Sales Rep from Unassigned Field', `Found sales rep in custentity_unassigned_from: ${unassignedFromId}`);
                return {
                    salesRepId: unassignedFromId,
                    source: 'custentity_unassigned_from'
                };
            }
            
            // If no unassigned_from value, check the regular sales rep field
            var salesRep = customerFields.salesrep;
            if (salesRep && salesRep.length > 0) {
                var salesRepId = salesRep[0].value;
                log.debug('Sales Rep from Customer', `Found sales rep on customer record: ${salesRepId}`);
                return {
                    salesRepId: salesRepId,
                    source: 'customer_salesrep'
                };
            }
            
            // No sales rep found on customer, return default
            log.debug('No Sales Rep on Customer', `No sales rep found for customer ${customerId}, will use default`);
            return {
                salesRepId: 1706846, // Default hardcoded sales rep
                source: 'default'
            };
            
        } catch (e) {
            log.error('getCustomerSalesRep Error', {
                customerId: customerId,
                error: e.message,
                stack: e.stack
            });
            // Return default on error
            return {
                salesRepId: 1706846,
                source: 'default_error'
            };
        }
    }
    
    /**
     * Create a sales order from parsed PDF data
     * @param {Object} pdfRecord - Parsed PDF record data
     * @returns {Object} Result object with salesOrderId or skipped status
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
            
            // Try to find existing customer - DO NOT CREATE if not found
            var customerId = findExistingCustomer(pdfRecord.companyName, pdfRecord.website);
            
            if (!customerId) {
                // Customer not found - skip this record
                log.audit('Customer Not Found', `No matching customer found for "${pdfRecord.companyName}" - skipping record ${pdfRecord.id}`);
                return {
                    skipped: true,
                    reason: `No matching customer found for "${pdfRecord.companyName}"`
                };
            }
            
            // Get the sales rep for this customer
            var salesRepInfo = getCustomerSalesRep(customerId);
            
            // Create the sales order record
            var salesOrder = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });
            
            // Set header fields
            salesOrder.setValue('entity', customerId);
            
            // Set sales rep field based on customer lookup
            try {
                salesOrder.setValue('salesrep', salesRepInfo.salesRepId);
                log.audit('Sales Rep Set', `Set salesrep to ${salesRepInfo.salesRepId} (source: ${salesRepInfo.source})`);
            } catch (e) {
                log.error('Sales Rep Error', `Failed to set salesrep: ${e.message}`);
            }

            // Set custom order contact email
            try {
                salesOrder.setValue('custbody_order_contact_email', 'website@telquestintl.com');
            } catch (e) {
                log.error('Order Contact Email Error', `Failed to set custbody_order_contact_email: ${e.message}`);
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
            log.audit('Sales Order Saved', `Successfully saved SO ${salesOrderId} with sales rep ${salesRepInfo.salesRepId} (${salesRepInfo.source})`);
            
            return { salesOrderId: salesOrderId };
            
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
     * Find existing customer record with fuzzy matching - DO NOT CREATE NEW
     * @param {string} companyName - Company name from parsed PDF
     * @param {string} website - Website from parsed PDF (optional)
     * @returns {string|null} Customer internal ID or null if not found
     */
    function findExistingCustomer(companyName, website) {
        try {
            if (!companyName) {
                log.warn('findExistingCustomer', 'No company name provided');
                return null;
            }
            
            log.debug('findExistingCustomer', `Searching for customer: ${companyName}, Website: ${website}`);
            
            // Strategy 1: Try domain-based search first if website is provided
            if (website) {
                var customerId = searchCustomerByDomain(website);
                if (customerId) {
                    log.audit('Customer Found by Domain', `Found customer by domain ${website} with ID ${customerId}`);
                    return customerId;
                }
            }
            
            // Strategy 2: Exact match search
            var exactMatchId = searchCustomerExactMatch(companyName);
            if (exactMatchId) {
                log.debug('Customer Found - Exact Match', `Found customer ${companyName} with ID ${exactMatchId}`);
                return exactMatchId;
            }
            
            // Strategy 3: Fuzzy match search
            var fuzzyMatchId = searchCustomerFuzzyMatch(companyName);
            if (fuzzyMatchId) {
                log.audit('Customer Found - Fuzzy Match', `Found customer using fuzzy match for ${companyName} with ID ${fuzzyMatchId}`);
                return fuzzyMatchId;
            }
            
            // Strategy 4: Search by normalized name patterns
            var patternMatchId = searchCustomerByPatterns(companyName);
            if (patternMatchId) {
                log.audit('Customer Found - Pattern Match', `Found customer using pattern match for ${companyName} with ID ${patternMatchId}`);
                return patternMatchId;
            }
            
            // No customer found - return null (DO NOT CREATE)
            log.debug('Customer Not Found', `No matching customer found for "${companyName}" - will skip this record`);
            return null;
            
        } catch (e) {
            log.error('findExistingCustomer Error', {
                companyName: companyName,
                website: website,
                error: e.message,
                stack: e.stack
            });
            return null;
        }
    }
    
    /**
     * Search customer by domain name
     * @param {string} website - Website URL
     * @returns {string|null} Customer internal ID or null
     */
    function searchCustomerByDomain(website) {
        try {
            if (!website) return null;
            
            // Extract domain from website
            var domain = extractDomain(website);
            if (!domain) return null;
            
            log.debug('Domain Search', `Searching for customer with domain: ${domain}`);
            
            // Search in the web address field - adjust field ID as needed
            var customerSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['url', 'contains', domain]
                    // If you have a custom field for website, add it here:
                    // 'OR',
                    // ['custentity_web_address', 'contains', domain]
                ],
                columns: ['internalid', 'companyname']
            });
            
            var results = customerSearch.run().getRange({
                start: 0,
                end: 1
            });
            
            if (results.length > 0) {
                var customerId = results[0].getValue('internalid');
                var customerName = results[0].getValue('companyname');
                log.debug('Domain Match Found', `Found customer "${customerName}" (ID: ${customerId}) by domain ${domain}`);
                return customerId;
            }
            
            return null;
        } catch (e) {
            log.error('Domain Search Error', e.message);
            return null;
        }
    }
    
    /**
     * Extract domain from URL
     * @param {string} url - Full URL or domain
     * @returns {string} Clean domain name
     */
    function extractDomain(url) {
        try {
            if (!url) return null;
            
            // Remove protocol if present
            var domain = url.replace(/^https?:\/\//, '');
            // Remove www. if present
            domain = domain.replace(/^www\./, '');
            // Remove path if present
            domain = domain.split('/')[0];
            // Remove port if present
            domain = domain.split(':')[0];
            
            log.debug('Domain Extraction', `Extracted domain "${domain}" from "${url}"`);
            return domain.toLowerCase();
        } catch (e) {
            log.error('Domain Extraction Error', e.message);
            return null;
        }
    }
    
    /**
     * Search for exact customer name match
     * @param {string} companyName - Company name
     * @returns {string|null} Customer internal ID or null
     */
    function searchCustomerExactMatch(companyName) {
        try {
            var customerSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['companyname', 'is', companyName]
                ],
                columns: ['internalid']
            });
            
            var results = customerSearch.run().getRange({
                start: 0,
                end: 1
            });
            
            return results.length > 0 ? results[0].getValue('internalid') : null;
        } catch (e) {
            log.error('Exact Match Search Error', e.message);
            return null;
        }
    }
    
    /**
     * Search for customer using fuzzy matching
     * @param {string} companyName - Company name
     * @returns {string|null} Customer internal ID or null
     */
    function searchCustomerFuzzyMatch(companyName) {
        try {
            // Normalize the search term
            var normalizedName = normalizeCompanyName(companyName);
            
            log.debug('Fuzzy Search', `Searching with normalized name: ${normalizedName}`);
            
            // Try contains search
            var customerSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['companyname', 'contains', normalizedName]
                ],
                columns: ['internalid', 'companyname']
            });
            
            var results = customerSearch.run().getRange({
                start: 0,
                end: 10 // Get more results for fuzzy matching
            });
            
            if (results.length === 1) {
                // If only one result, return it
                return results[0].getValue('internalid');
            } else if (results.length > 1) {
                // If multiple results, try to find best match
                var bestMatch = findBestMatch(companyName, results);
                if (bestMatch) {
                    return bestMatch;
                }
            }
            
            // Try starts with search
            var startsWithSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['companyname', 'startswith', normalizedName.substring(0, Math.min(normalizedName.length, 10))]
                ],
                columns: ['internalid', 'companyname']
            });
            
            results = startsWithSearch.run().getRange({
                start: 0,
                end: 5
            });
            
            if (results.length > 0) {
                return findBestMatch(companyName, results);
            }
            
            return null;
        } catch (e) {
            log.error('Fuzzy Match Search Error', e.message);
            return null;
        }
    }
    
    /**
     * Search customer by various name patterns
     * @param {string} companyName - Company name
     * @returns {string|null} Customer internal ID or null
     */
    function searchCustomerByPatterns(companyName) {
        try {
            var patterns = generateSearchPatterns(companyName);
            
            for (var i = 0; i < patterns.length; i++) {
                var pattern = patterns[i];
                log.debug('Pattern Search', `Trying pattern: ${pattern}`);
                
                var customerSearch = search.create({
                    type: search.Type.CUSTOMER,
                    filters: [
                        ['companyname', 'contains', pattern]
                    ],
                    columns: ['internalid', 'companyname']
                });
                
                var results = customerSearch.run().getRange({
                    start: 0,
                    end: 5
                });
                
                if (results.length === 1) {
                    log.debug('Pattern Match Found', `Found customer with pattern "${pattern}": ${results[0].getValue('companyname')}`);
                    return results[0].getValue('internalid');
                } else if (results.length > 1) {
                    var bestMatch = findBestMatch(companyName, results);
                    if (bestMatch) {
                        return bestMatch;
                    }
                }
            }
            
            return null;
        } catch (e) {
            log.error('Pattern Search Error', e.message);
            return null;
        }
    }
    
    /**
     * Generate search patterns from company name
     * @param {string} companyName - Company name
     * @returns {Array} Array of search patterns
     */
    function generateSearchPatterns(companyName) {
        var patterns = [];
        
        // Remove common suffixes and normalize
        var baseName = companyName
            .replace(/\s*(inc|llc|ltd|corp|corporation|company|co|group|&\s*co)\.?\s*$/i, '')
            .trim();
        
        patterns.push(baseName);
        
        // Try without spaces
        patterns.push(baseName.replace(/\s+/g, ''));
        
        // Try with spaces replaced by different characters
        patterns.push(baseName.replace(/\s+/g, '-'));
        
        // Try first significant word (if multi-word)
        var words = baseName.split(/\s+/);
        if (words.length > 1 && words[0].length > 3) {
            patterns.push(words[0]);
        }
        
        // Try acronym for multi-word names
        if (words.length > 1) {
            var acronym = words.map(function(w) { return w.charAt(0); }).join('');
            if (acronym.length > 1) {
                patterns.push(acronym);
            }
        }
        
        return patterns;
    }
    
    /**
     * Normalize company name for searching
     * @param {string} name - Company name
     * @returns {string} Normalized name
     */
    function normalizeCompanyName(name) {
        return name
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
    }
    
    /**
     * Find best match from multiple results
     * @param {string} searchTerm - Original search term
     * @param {Array} results - Search results
     * @returns {string|null} Best matching customer ID or null
     */
    function findBestMatch(searchTerm, results) {
        try {
            var normalizedSearch = normalizeCompanyName(searchTerm);
            var bestMatch = null;
            var bestScore = 0;
            
            results.forEach(function(result) {
                var resultName = result.getValue('companyname');
                var normalizedResult = normalizeCompanyName(resultName);
                var score = calculateSimilarity(normalizedSearch, normalizedResult);
                
                log.debug('Match Score', `"${resultName}" score: ${score}`);
                
                if (score > bestScore && score > 0.7) { // 70% similarity threshold
                    bestScore = score;
                    bestMatch = result.getValue('internalid');
                }
            });
            
            if (bestMatch) {
                log.debug('Best Match Selected', `Best match ID: ${bestMatch} with score: ${bestScore}`);
            }
            
            return bestMatch;
        } catch (e) {
            log.error('Find Best Match Error', e.message);
            return null;
        }
    }
    
    /**
     * Calculate similarity between two strings (simple implementation)
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity score between 0 and 1
     */
    function calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1;
        if (!str1 || !str2) return 0;
        
        // Check if one contains the other
        if (str1.indexOf(str2) !== -1 || str2.indexOf(str1) !== -1) {
            return 0.9;
        }
        
        // Simple character overlap calculation
        var longer = str1.length > str2.length ? str1 : str2;
        var shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        var editDistance = getEditDistance(longer, shorter);
        return (longer.length - editDistance) / parseFloat(longer.length);
    }
    
    /**
     * Calculate edit distance between two strings (Levenshtein distance)
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Edit distance
     */
    function getEditDistance(str1, str2) {
        var matrix = [];
        
        if (str1.length === 0) return str2.length;
        if (str2.length === 0) return str1.length;
        
        for (var i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (var j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (i = 1; i <= str2.length; i++) {
            for (j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    /**
     * Modify item name based on condition
     * @param {string} itemName - Original item name
     * @param {string} condition - Item condition (New/Used/empty)
     * @returns {string} Modified item name
     */
    function getModifiedItemName(itemName, condition) {
        if (!itemName) return itemName;
        
        var suffix = '-N'; // Default to New
        
        if (condition) {
            if (condition.toLowerCase() === 'used') {
                suffix = '-LN';
            } else {
                // Any other value including 'new' gets -N suffix
                suffix = '-N';
            }
        }
        // If no condition specified, defaults to -N (New)
        
        var modifiedName = itemName + suffix;
        log.debug('Item Name Modified', `Original: ${itemName}, Condition: ${condition || 'Not specified (defaulting to New)'}, Modified: ${modifiedName}`);
        
        return modifiedName;
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
    
    /**
     * Mark parsed PDF record as skipped
     * @param {string} parsedPdfId - Internal ID of parsed PDF record
     * @param {string} reason - Reason for skipping
     */
    function markAsSkipped(parsedPdfId, reason) {
        try {
            log.debug('markAsSkipped', `Marking parsed PDF ${parsedPdfId} as skipped: ${reason}`);
            
            // You may want to add a custom field to track skipped records and reasons
            // For now, we'll add a note to the memo field
            var updatedRecord = record.submitFields({
                type: 'customrecord_parsed_pdf',
                id: parsedPdfId,
                values: {
                    'custrecord_parse_pdf_processed': true, // Mark as processed to avoid reprocessing
                    'custrecord_special_instructions': `SKIPPED: ${reason}` // Or use a dedicated field
                }
            });
            
            log.debug('Record Skipped', `Successfully marked parsed PDF ${parsedPdfId} as skipped`);
        } catch (e) {
            log.error('Skip Update Error', {
                message: `Failed to mark parsed PDF ${parsedPdfId} as skipped`,
                parsedPdfId: parsedPdfId,
                reason: reason,
                error: e.message,
                stack: e.stack
            });
        }
    }
    
    return {
        execute: execute
    };
});
