/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/search', 'N/https', 'N/runtime', 'N/log', 'N/record', 'N/file', 'N/email'], 
    function(search, https, runtime, log, record, file, email) {
    
    /**
     * Scheduled Script Entry Point
     */
    function execute(context) {
        try {
            // Hardcoded Keepa API credentials
            var keepaApiKey = '';
            var amazonDomain = '1'; // 1 = US
            
            // Run the saved search to get ASINs
            var asinSearchObj = search.create({
                type: "customrecord_celigo_etail_item_alias",
                filters: [
                    ["isinactive", "is", "F"], 
                    "AND", 
                    ["custrecord_celigo_etail_alias_par_item.custitem_awa_brand", "anyof", "3"], 
                    "AND", 
                    ["custrecord_celigo_etail_alias_par_item.quantityavailable", "greaterthan", "0"]
                    
                ],
                columns: [
                    search.createColumn({name: "custrecord_celigo_etail_alias_par_item", label: "Parent Item"}),
                    search.createColumn({name: "custrecord_celigo_etail_alias_amz_asin", label: "Amazon Product ASIN"}),
                    search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });
            
            var searchResultCount = asinSearchObj.runPaged().count;
            log.audit('ASIN Search', 'Total ASINs to process: ' + searchResultCount);
            
            var processedCount = 0;
            var errorCount = 0;
            var script = runtime.getCurrentScript();
            
            // Array to store CSV data
            var csvData = [];
            csvData.push(['Parent Item', 'ASIN', 'Seller ID', 'Seller Name', 'Business Name', 'Price (USD)', 'Prime Eligible']);
            
            // Process each ASIN
            asinSearchObj.run().each(function(result) {
                try {
                    // Check remaining governance
                    var remainingUsage = script.getRemainingUsage();
                    if (remainingUsage < 100) {
                        log.audit('Governance Limit', 'Stopping due to governance limits. Processed: ' + processedCount);
                        return false; // Stop processing
                    }
                    
                    var asin = result.getValue({name: 'custrecord_celigo_etail_alias_amz_asin'});
                    var parentItem = result.getText({name: 'custrecord_celigo_etail_alias_par_item'});
                    var recordId = result.getValue({name: 'internalid'});
                    
                    if (asin) {
                        log.debug('Processing ASIN', 'ASIN: ' + asin + ', Parent Item: ' + parentItem + ', Record ID: ' + recordId);
                        
                        // Call Keepa API to get product data
                        var productData = getBuyBoxData(asin, keepaApiKey, amazonDomain);
                        
                        if (productData && productData.sellerId) {
                        
                            
                            // Get seller name
                            var sellerInfo = getSellerName(productData.sellerId, keepaApiKey, amazonDomain);
                            
                            var sellerName = 'Unknown';
                            var businessName = 'Unknown';
                            
                            if (sellerInfo) {
                                sellerName = sellerInfo.sellerName;
                                businessName = sellerInfo.businessName;
                                
                             
                            }
                            
                            // Add to CSV data
                            csvData.push([
                                parentItem || '',
                                asin || '',
                                productData.sellerId || '',
                                sellerName,
                                businessName,
                                productData.priceUSD.toFixed(2),
                                productData.isPrime ? 'Yes' : 'No'
                            ]);
                            
                        } else {                            
                            // Add to CSV with no seller info
                            csvData.push([
                                parentItem || '',
                                asin || '',
                                'No Buy Box',
                                '',
                                '',
                                '',
                                ''
                            ]);
                        }
                        
                        processedCount++;
                    }
                    
                } catch (e) {
                    log.error('Error Processing ASIN', 'Error: ' + e.toString());
                    errorCount++;
                }
                
                return true; // Continue to next result
            });
            
            log.audit('Processing Complete', 'Processed: ' + processedCount + ', Errors: ' + errorCount);
            
            // Create and send CSV file
            if (csvData.length > 1) { // More than just headers
                createAndSendCSV(csvData);
            } else {
                log.audit('No Data', 'No data to send in email');
            }
            
        } catch (e) {
            log.error('Script Error', e.toString());
        }
    }
    
    /**
     * Get Buy Box Data from Keepa API
     */
    function getBuyBoxData(asin, apiKey, domain) {
        try {
            // Build Keepa API URL
            var url = 'https://api.keepa.com/product';
            var params = {
                'key': apiKey,
                'domain': domain,
                'asin': asin,
                'stats': '1', // Get stats including buyBoxSellerId
                'offers': '20' // Get current offer data
            };
            
            // Convert params to query string
            var queryString = Object.keys(params).map(function(key) {
                return key + '=' + encodeURIComponent(params[key]);
            }).join('&');
            
            var fullUrl = url + '?' + queryString;
        
            
            // Make the API call
            var response = https.get({
                url: fullUrl
            });
            
            if (response.code !== 200) {
                log.error('Keepa API Error', 'Status: ' + response.code + ', Body: ' + response.body);
                return null;
            }
            
            // Parse response
            var data = JSON.parse(response.body);
            
            if (!data.products || data.products.length === 0) {
                log.debug('No Product Data', 'ASIN: ' + asin);
                return null;
            }
            
            var product = data.products[0];
            var stats = product.stats || {};
            
            // Extract buy box data from stats
            var sellerId = stats.buyBoxSellerId;
            var priceUSD = (stats.buyBoxPrice || 0) / 100;
            var isPrime = stats.buyBoxIsPrimeEligible || false;
            
            if (!sellerId) {
                log.debug('No Seller ID', 'ASIN: ' + asin + ' - No buy box seller found in stats');
                return null;
            }
            
            return {
                sellerId: sellerId,
                priceUSD: priceUSD,
                isPrime: isPrime
            };
            
        } catch (e) {
            log.error('getBuyBoxData Error', 'ASIN: ' + asin + ', Error: ' + e.toString());
            return null;
        }
    }
    
    /**
     * Get Seller Name from Keepa API
     */
    function getSellerName(sellerId, apiKey, domain) {
        try {
            // Build Keepa Seller API URL
            var url = 'https://api.keepa.com/seller';
            var params = {
                'key': apiKey,
                'domain': domain,
                'seller': sellerId
            };
            
            // Convert params to query string
            var queryString = Object.keys(params).map(function(key) {
                return key + '=' + encodeURIComponent(params[key]);
            }).join('&');
            
            var fullUrl = url + '?' + queryString;
            
            log.debug('Keepa Seller API Call', 'URL: ' + fullUrl);
            
            // Make the API call
            var response = https.get({
                url: fullUrl
            });
            
            if (response.code !== 200) {
                log.error('Keepa Seller API Error', 'Status: ' + response.code + ', Body: ' + response.body);
                return null;
            }
            
            // Parse response
            var data = JSON.parse(response.body);
            
            // The sellers object is structured as: { "SELLER_ID": { sellerName: "...", ... } }
            if (!data.sellers || !data.sellers[sellerId]) {
                log.debug('No Seller Data', 'Seller ID: ' + sellerId);
                return null;
            }
            
            var seller = data.sellers[sellerId];
            
            return {
                sellerName: seller.sellerName || 'Unknown',
                businessName: seller.businessName || 'Unknown',
                address: seller.address ? seller.address.join(', ') : 'Unknown'
            };
            
        } catch (e) {
            log.error('getSellerName Error', 'Seller ID: ' + sellerId + ', Error: ' + e.toString());
            return null;
        }
    }
    
    /**
     * Create CSV file and send email
     */
    function createAndSendCSV(csvData) {
        try {
            // Convert array to CSV string
            var csvContent = '';
            for (var i = 0; i < csvData.length; i++) {
                var row = csvData[i];
                // Escape values that contain commas or quotes
                var processedRow = row.map(function(value) {
                    var stringValue = String(value);
                    if (stringValue.indexOf(',') !== -1 || stringValue.indexOf('"') !== -1 || stringValue.indexOf('\n') !== -1) {
                        return '"' + stringValue.replace(/"/g, '""') + '"';
                    }
                    return stringValue;
                });
                csvContent += processedRow.join(',') + '\n';
            }
            
            // Create file
            var csvFile = file.create({
                name: 'cisco_inventory_buybox_' + new Date().getTime() + '.csv',
                fileType: file.Type.CSV,
                contents: csvContent
            });
            
            log.audit('CSV Created', 'File size: ' + csvContent.length + ' characters, Rows: ' + csvData.length);
            
            // Send email with attachment
            email.send({
                author: 1692630,
                recipients: 1734846,
                cc: [1692630],
                subject: 'Cisco inventory on amazon and buybox winners',
                body: 'Please find attached the Cisco inventory report with Amazon buy box winners and price points.\n\n' +
                      'Total products processed: ' + (csvData.length - 1) + '\n\n' +
                      'This report was automatically generated by the NetSuite-Keepa integration and its part of the #2026Vision Program.',
                attachments: [csvFile]
            });
            
            log.audit('Email Sent', 'Email sent successfully to user 16754567');
            
        } catch (e) {
            log.error('Create/Send CSV Error', 'Error: ' + e.toString());
        }
    }
    
    return {
        execute: execute
    };
});
