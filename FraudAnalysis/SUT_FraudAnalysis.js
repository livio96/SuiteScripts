/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */

define(['N/ui/serverWidget', 'N/https', 'N/file', 'N/record', 'N/log', 'N/render', 'N/url'], 
function(serverWidget, https, file, record, log, render, url) {
    
    // Configuration - Replace with your actual OpenRouter API key
    const OPENROUTER_API_KEY = '';
    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
    const MODEL_NAME = 'deepseek/deepseek-chat-v3-0324:free';
    
    // Fraud analysis prompt template
    const FRAUD_PROMPT_TEMPLATE = `You are a fraud detection analyst. Analyze the following sales order information for potential fraud indicators. 
    Consider factors like:
    - Customer information and history
    - Order patterns and amounts
    - Shipping vs billing address discrepancies
    - Payment method risks
    - Geographic risk factors
    - Order timing and frequency
    
  Analysis Requirements:
 
Verify Address Consistency
 
Check for any mismatch or unusual distance between the billing address and shipping address.
 
Note if the shipping address is in a known high-risk region.
 
Email & Phone Verification
 
Assess whether the email address has any suspicious patterns (e.g., random strings, newly created domain, or a known disposable email service).
 
Consider if the phone number format matches the region of the billing or shipping address.
 
Credit Card Indicators
 
Provide a general analysis for common signs of a compromised or stolen credit card (while respecting privacy and compliance).
 
Identity Verification & Social/Behavioral Clues
 
Evaluate if the name, address, and other details align or if they appear arbitrarily mismatched.
 
Consider whether the customer’s profile data is plausible for the type of order and location.
 
Suspicious Order Patterns
 
Highlight if anything about the order quantity, order value, or item type raises fraud concerns.
 
Indicate if the order was rushed (e.g., expedited shipping with different addresses).
 
List of Potential Red Flags
 
Summarize any discrepancies or unusual details that may warrant a deeper manual review or verification calls.

Final Conclusion Required:
Based on comprehensive research and analysis, explicitly state your final determination as either Fraud or not Fraud
    
    Format your response as a structured analysis report.`;

  
    function onRequest(context) {
        try {
            if (context.request.method === 'GET') {
                return showFraudAnalysisForm(context);
            } else if (context.request.method === 'POST') {
                return performFraudAnalysis(context);
            }
        } catch (error) {
            log.error('Suitelet Error', error.toString());
            return createErrorResponse(context, error.toString());
        }
    }

       function showFraudAnalysisForm(context) {
        const form = serverWidget.createForm({
            title: 'Fraud Analysis Tool'
        });
        
        // Get sales order ID from parameters
        const salesOrderId = context.request.parameters.salesorderid;
        
        if (!salesOrderId) {
            form.addPageInitMessage({
                type: 'ERROR',
                title: 'Missing Sales Order',
                message: 'No sales order ID provided.'
            });
            context.response.writePage(form);
            return;
        }

        // Add hidden field for sales order ID
        const orderIdField = form.addField({
            id: 'custpage_order_id',
            type: serverWidget.FieldType.TEXT,
            label: 'Sales Order ID'
        });
        orderIdField.defaultValue = salesOrderId;
        orderIdField.updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        // Load and display sales order information
        try {
            const salesOrder = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId
            });

            // Display order summary
            const orderSummary = form.addFieldGroup({
                id: 'custpage_order_summary',
                label: 'Sales Order Summary'
            });

            const orderNumberField = form.addField({
                id: 'custpage_order_number',
                type: serverWidget.FieldType.TEXT,
                label: 'Order Number',
                container: 'custpage_order_summary'
            });
            orderNumberField.defaultValue = salesOrder.getValue('tranid') || '';
            orderNumberField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });

            const customerField = form.addField({
                id: 'custpage_customer',
                type: serverWidget.FieldType.TEXT,
                label: 'Customer',
                container: 'custpage_order_summary'
            });
            const customerId = salesOrder.getValue('entity');
            if (customerId) {
                const customerName = salesOrder.getText('entity');
                customerField.defaultValue = customerName || customerId;
            }
            customerField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });

            const totalField = form.addField({
                id: 'custpage_total',
                type: serverWidget.FieldType.CURRENCY,
                label: 'Total Amount',
                container: 'custpage_order_summary'
            });
            totalField.defaultValue = salesOrder.getValue('total') || 0;
            totalField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });

            const statusField = form.addField({
                id: 'custpage_status',
                type: serverWidget.FieldType.TEXT,
                label: 'Order Status',
                container: 'custpage_order_summary'
            });
            statusField.defaultValue = salesOrder.getText('orderstatus') || '';
            statusField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });

        } catch (error) {
            log.error('Error loading sales order', error.toString());
            form.addPageInitMessage({
                type: 'ERROR',
                title: 'Error Loading Sales Order',
                message: 'Unable to load sales order: ' + error.toString()
            });
        }

        // Add instructions
        const instructionField = form.addField({
            id: 'custpage_instructions',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Instructions'
        });
        instructionField.defaultValue = '<div style="background-color: #f0f8ff; padding: 10px; border: 1px solid #ccc; margin: 10px 0;">' +
            '<strong>Fraud Analysis Tool</strong><br/>' +
            'Click the button below to perform an AI-powered fraud risk analysis on this sales order. ' +
            'The system will analyze customer data, order patterns, and other risk factors to generate a comprehensive report.' +
            '</div>';

        // Add submit button
        form.addSubmitButton({
            label: 'Run Fraud Analysis'
        });

        // Add client script for better UX
        form.clientScriptModulePath = './CLIFraudAnalysis.js';

        context.response.writePage(form);
    }

    /**
     * Perform fraud analysis and generate PDF
     */
  /**
 * Perform fraud analysis and generate PDF - DEBUG VERSION
 */
function performFraudAnalysis(context) {
    const salesOrderId = context.request.parameters.custpage_order_id;
    
    if (!salesOrderId) {
        return createErrorResponse(context, 'Missing sales order ID');
    }

    try {
        log.debug('Starting fraud analysis', 'Sales Order ID: ' + salesOrderId);
        
        // Load sales order data
        const orderData = getSalesOrderData(salesOrderId);
        log.debug('Order data loaded', {
            orderNumber: orderData.orderNumber,
            customerName: orderData.customerName,
            total: orderData.total
        });
        
        // Perform AI analysis
        log.debug('Calling AI API', 'About to call OpenRouter API');
        const analysisResult = callOpenRouterAPI(orderData);
        
        // Log the analysis result to see what we got
        log.debug('AI Analysis Result', {
            resultLength: analysisResult ? analysisResult.length : 0,
            resultPreview: analysisResult ? analysisResult.substring(0, 200) + '...' : 'NULL/EMPTY'
        });
        
        // Check if analysis result is empty or null
        if (!analysisResult || analysisResult.trim() === '') {
            log.error('Empty Analysis Result', 'AI analysis returned empty result');
            // Provide a fallback analysis
            const fallbackAnalysis = `AUTOMATED FRAUD ANALYSIS UNAVAILABLE

The AI fraud analysis service did not return results. Manual review required.

Order Summary:
- Order Number: ${orderData.orderNumber || 'N/A'}
- Customer: ${orderData.customerName || 'N/A'}
- Amount: ${orderData.currency || '$'}${orderData.total || '0.00'}
- Status: ${orderData.status || 'N/A'}

Please perform manual fraud review considering:
1. Customer verification
2. Address consistency
3. Payment method validation
4. Order pattern analysis
5. Geographic risk factors

RECOMMENDATION: Manual review required due to system unavailability.`;
            
            // Generate PDF report with fallback
            const pdfFile = generateFraudAnalysisPDF(orderData, fallbackAnalysis);
            
            context.response.writeFile({
                file: pdfFile,
                isInline: false
            });
            return;
        }
        
        // Generate PDF report with actual analysis
        log.debug('Generating PDF', 'Creating PDF with analysis result');
        const pdfFile = generateFraudAnalysisPDF(orderData, analysisResult);
        
        // Create download response
        context.response.writeFile({
            file: pdfFile,
            isInline: false
        });
        
        log.debug('Analysis Complete', 'PDF generated and sent to user');
        
    } catch (error) {
        log.error('Fraud Analysis Error', {
            error: error.toString(),
            stack: error.stack,
            salesOrderId: salesOrderId
        });
        return createErrorResponse(context, 'Analysis failed: ' + error.toString());
    }
}

    /**
     * Extract comprehensive sales order data for analysis
     */
/**
 * Extract comprehensive sales order data for analysis - FIXED VERSION
 */
function getSalesOrderData(salesOrderId) {
    try {
        const salesOrder = record.load({
            type: record.Type.SALES_ORDER,
            id: salesOrderId
        });

        // Initialize order data
        const orderData = {
            orderNumber: salesOrder.getValue('tranid'),
            orderDate: salesOrder.getValue('trandate'),
            customerId: salesOrder.getValue('entity'),
            customerName: salesOrder.getText('entity'),
            total: salesOrder.getValue('total'),
            currency: salesOrder.getText('currency') || salesOrder.getValue('currency'),
            status: salesOrder.getText('orderstatus') || salesOrder.getValue('orderstatus'),
            
            // Initialize address objects
            billingAddress: {},
            shippingAddress: {},
            
            // Payment and shipping info
            paymentTerms: salesOrder.getText('terms') || salesOrder.getValue('terms') || '',
            shippingMethod: salesOrder.getText('shipmethod') || salesOrder.getValue('shipmethod') || '',
            
            // Line items
            lineItems: []
        };

        // Get payment method from the sales order
        try {
            // Try to get payment method
            orderData.paymentMethod = salesOrder.getText('paymentmethod') || salesOrder.getValue('paymentmethod') || '';
            
            // Try to get credit card info (last 4 digits only for security)
            const ccNumber = salesOrder.getValue('ccnumber') || '';
            if (ccNumber) {
                orderData.paymentMethod += ' (****' + ccNumber.slice(-4) + ')';
            }
        } catch (e) {
            log.debug('Payment method not available', e.toString());
            orderData.paymentMethod = 'N/A';
        }

        // Get billing address - Method 1: Try subrecord approach
        try {
            const billingAddressSubrecord = salesOrder.getSubrecord({
                fieldId: 'billingaddress'
            });
            
            if (billingAddressSubrecord) {
                orderData.billingAddress = {
                    attention: billingAddressSubrecord.getValue('attention') || '',
                    addressee: billingAddressSubrecord.getValue('addressee') || '',
                    address1: billingAddressSubrecord.getValue('addr1') || '',
                    address2: billingAddressSubrecord.getValue('addr2') || '',
                    city: billingAddressSubrecord.getValue('city') || '',
                    state: billingAddressSubrecord.getValue('state') || '',
                    zip: billingAddressSubrecord.getValue('zip') || '',
                    country: billingAddressSubrecord.getValue('country') || ''
                };
            }
        } catch (e) {
            log.debug('Billing subrecord method failed', e.toString());
            
            // Method 2: Try field-based approach
            try {
                orderData.billingAddress = {
                    attention: salesOrder.getValue('billattention') || '',
                    addressee: salesOrder.getValue('billaddressee') || '',
                    address1: salesOrder.getValue('billaddr1') || '',
                    address2: salesOrder.getValue('billaddr2') || '',
                    city: salesOrder.getValue('billcity') || '',
                    state: salesOrder.getValue('billstate') || '',
                    zip: salesOrder.getValue('billzip') || '',
                    country: salesOrder.getValue('billcountry') || ''
                };
                
                // If no addr1, try to get the full address text
                if (!orderData.billingAddress.address1) {
                    const billAddressText = salesOrder.getValue('billaddress');
                    if (billAddressText) {
                        // Parse the address text (it's usually multiline)
                        const addressLines = billAddressText.split('\n').filter(line => line.trim());
                        if (addressLines.length > 0) {
                            orderData.billingAddress.addressee = addressLines[0] || '';
                            orderData.billingAddress.address1 = addressLines[1] || '';
                            orderData.billingAddress.address2 = addressLines[2] || '';
                            // Last line often contains city, state, zip
                            if (addressLines.length > 3) {
                                const lastLine = addressLines[addressLines.length - 1];
                                const cityStateZip = lastLine.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
                                if (cityStateZip) {
                                    orderData.billingAddress.city = cityStateZip[1];
                                    orderData.billingAddress.state = cityStateZip[2];
                                    orderData.billingAddress.zip = cityStateZip[3];
                                }
                            }
                        }
                    }
                }
            } catch (e2) {
                log.debug('Billing field method failed', e2.toString());
                orderData.billingAddress = {
                    address1: 'Unable to retrieve billing address',
                    city: '',
                    state: '',
                    zip: '',
                    country: ''
                };
            }
        }

        // Get shipping address - Method 1: Try subrecord approach
        try {
            const shippingAddressSubrecord = salesOrder.getSubrecord({
                fieldId: 'shippingaddress'
            });
            
            if (shippingAddressSubrecord) {
                orderData.shippingAddress = {
                    attention: shippingAddressSubrecord.getValue('attention') || '',
                    addressee: shippingAddressSubrecord.getValue('addressee') || '',
                    address1: shippingAddressSubrecord.getValue('addr1') || '',
                    address2: shippingAddressSubrecord.getValue('addr2') || '',
                    city: shippingAddressSubrecord.getValue('city') || '',
                    state: shippingAddressSubrecord.getValue('state') || '',
                    zip: shippingAddressSubrecord.getValue('zip') || '',
                    country: shippingAddressSubrecord.getValue('country') || ''
                };
            }
        } catch (e) {
            log.debug('Shipping subrecord method failed', e.toString());
            
            // Method 2: Try field-based approach
            try {
                orderData.shippingAddress = {
                    attention: salesOrder.getValue('shipattention') || '',
                    addressee: salesOrder.getValue('shipaddressee') || '',
                    address1: salesOrder.getValue('shipaddr1') || '',
                    address2: salesOrder.getValue('shipaddr2') || '',
                    city: salesOrder.getValue('shipcity') || '',
                    state: salesOrder.getValue('shipstate') || '',
                    zip: salesOrder.getValue('shipzip') || '',
                    country: salesOrder.getValue('shipcountry') || ''
                };
                
                // If no addr1, try to get the full address text
                if (!orderData.shippingAddress.address1) {
                    const shipAddressText = salesOrder.getValue('shipaddress');
                    if (shipAddressText) {
                        // Parse the address text
                        const addressLines = shipAddressText.split('\n').filter(line => line.trim());
                        if (addressLines.length > 0) {
                            orderData.shippingAddress.addressee = addressLines[0] || '';
                            orderData.shippingAddress.address1 = addressLines[1] || '';
                            orderData.shippingAddress.address2 = addressLines[2] || '';
                            // Last line often contains city, state, zip
                            if (addressLines.length > 3) {
                                const lastLine = addressLines[addressLines.length - 1];
                                const cityStateZip = lastLine.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
                                if (cityStateZip) {
                                    orderData.shippingAddress.city = cityStateZip[1];
                                    orderData.shippingAddress.state = cityStateZip[2];
                                    orderData.shippingAddress.zip = cityStateZip[3];
                                }
                            }
                        }
                    }
                }
            } catch (e2) {
                log.debug('Shipping field method failed', e2.toString());
                orderData.shippingAddress = {
                    address1: 'Unable to retrieve shipping address',
                    city: '',
                    state: '',
                    zip: '',
                    country: ''
                };
            }
        }

        // Get line items
        const lineCount = salesOrder.getLineCount('item');
        for (let i = 0; i < lineCount; i++) {
            orderData.lineItems.push({
                item: salesOrder.getSublistText('item', 'item', i),
                quantity: salesOrder.getSublistValue('item', 'quantity', i),
                rate: salesOrder.getSublistValue('item', 'rate', i),
                amount: salesOrder.getSublistValue('item', 'amount', i)
            });
        }

        // Get customer additional info with better error handling
        orderData.customerInfo = {};
        if (orderData.customerId) {
            try {
                const customer = record.load({
                    type: record.Type.CUSTOMER,
                    id: orderData.customerId
                });
                
                // Get all possible customer fields with fallbacks
                orderData.customerInfo = {
                    dateCreated: customer.getValue('datecreated'),
                    email: customer.getValue('email') || '',
                    phone: customer.getValue('phone') || customer.getValue('phoneticname') || '',
                    altPhone: customer.getValue('altphone') || '',
                    fax: customer.getValue('fax') || '',
                    creditLimit: customer.getValue('creditlimit') || 0,
                    balance: customer.getValue('balance') || 0,
                    terms: customer.getText('terms') || customer.getValue('terms') || '',
                    isPerson: customer.getValue('isperson'),
                    firstName: customer.getValue('firstname') || '',
                    lastName: customer.getValue('lastname') || '',
                    companyName: customer.getValue('companyname') || '',
                    category: customer.getText('category') || '',
                    salesRep: customer.getText('salesrep') || ''
                };
                
                // If email is still empty, try alternate email field
                if (!orderData.customerInfo.email) {
                    orderData.customerInfo.email = customer.getValue('altemail') || '';
                }
                
                // Get primary contact if available
                try {
                    const contactId = customer.getValue('primarycontact');
                    if (contactId) {
                        const contact = record.load({
                            type: record.Type.CONTACT,
                            id: contactId
                        });
                        
                        orderData.customerInfo.contactName = contact.getValue('entityid') || '';
                        orderData.customerInfo.contactEmail = contact.getValue('email') || orderData.customerInfo.email;
                        orderData.customerInfo.contactPhone = contact.getValue('phone') || orderData.customerInfo.phone;
                    }
                } catch (contactError) {
                    log.debug('Could not load primary contact', contactError.toString());
                }
                
            } catch (error) {
                log.error('Could not load customer details', {
                    customerId: orderData.customerId,
                    error: error.toString()
                });
            }
        }

        // Get order-level email and phone if not found in customer
        if (!orderData.customerInfo.email) {
            orderData.customerInfo.email = salesOrder.getValue('email') || 'N/A';
        }
        if (!orderData.customerInfo.phone) {
            orderData.customerInfo.phone = salesOrder.getValue('phone') || 'N/A';
        }

        // Log what we found for debugging
        log.debug('Extracted Order Data', {
            orderNumber: orderData.orderNumber,
            hasEmail: !!orderData.customerInfo.email,
            hasPhone: !!orderData.customerInfo.phone,
            hasBillingAddress: !!orderData.billingAddress.address1,
            hasShippingAddress: !!orderData.shippingAddress.address1,
            paymentMethod: orderData.paymentMethod
        });

        return orderData;
        
    } catch (error) {
        log.error('Error in getSalesOrderData', {
            error: error.toString(),
            salesOrderId: salesOrderId
        });
        throw error;
    }
}
    /**
     * Call OpenRouter API for fraud analysis
     */
    /**
 * Call OpenRouter API for fraud analysis - FIXED VERSION
 */
/**
 * Call OpenRouter API for fraud analysis - FIXED VERSION
 */
function callOpenRouterAPI(orderData) {
    try {
        // Create the fraud analysis prompt
        const prompt = `Analyze this sales order for fraud risk:

Order: ${orderData.orderNumber || 'N/A'}
Customer: ${orderData.customerName || 'N/A'}
Amount: ${orderData.currency || '$'}${orderData.total || '0.00'}
Date: ${orderData.orderDate || 'N/A'}

Billing Address: ${orderData.billingAddress.address1 || 'N/A'}, ${orderData.billingAddress.city || 'N/A'}, ${orderData.billingAddress.state || 'N/A'}
Shipping Address: ${orderData.shippingAddress.address1 || 'N/A'}, ${orderData.shippingAddress.city || 'N/A'}, ${orderData.shippingAddress.state || 'N/A'}

Email: ${orderData.customerInfo?.email || 'N/A'}
Phone: ${orderData.customerInfo?.phone || 'N/A'}
Payment Terms: ${orderData.paymentTerms || 'N/A'}
Shipping Method: ${orderData.shippingMethod || 'N/A'}

Customer Account Created: ${orderData.customerInfo?.dateCreated || 'N/A'}
Credit Limit: ${orderData.customerInfo?.creditLimit || 'N/A'}

Items Ordered:
${orderData.lineItems.map(item => `- ${item.item}: Qty ${item.quantity} @ $${item.rate} = $${item.amount}`).join('\n')}

Provide a detailed fraud risk analysis covering:

1. ADDRESS VERIFICATION
- Check for billing/shipping address consistency
- Identify any high-risk geographic locations
- Note any PO Box or freight forwarding services

2. CUSTOMER PROFILE ASSESSMENT
- Evaluate customer history and account age
- Check email domain legitimacy
- Verify phone number format matches location

3. ORDER PATTERN ANALYSIS
- Assess order value relative to customer history
- Check for rush shipping to different addresses
- Identify bulk orders of high-value items

4. PAYMENT METHOD RISKS
- Evaluate payment terms and method
- Check credit limit vs order value

5. RED FLAGS SUMMARY
- List all identified risk factors
- Provide specific concerns

FINAL RISK ASSESSMENT: Provide a clear conclusion with risk level (LOW/MEDIUM/HIGH) and recommended actions.`;
        
        const payload = {
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: "You are a fraud detection specialist. Provide detailed, structured analysis in PLAIN TEXT only. Do not use any markdown formatting, asterisks, hashtags, or special formatting. Use simple dashes for bullet points."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 2000
        };
        
        log.debug('API Request', {
            url: OPENROUTER_URL,
            model: MODEL_NAME,
            promptLength: prompt.length
        });
        
        const response = https.post({
            url: OPENROUTER_URL,
            headers: {
                'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://system.netsuite.com/',
                'X-Title': 'NetSuite Fraud Analysis'
            },
            body: JSON.stringify(payload)
        });
        
        log.debug('Raw API Response', {
            statusCode: response.code,
            bodyLength: response.body ? response.body.length : 0,
            bodyFirst500: response.body ? response.body.substring(0, 500) : 'No body'
        });
        
        if (response.code !== 200) {
            log.error('API Error', {
                code: response.code,
                body: response.body
            });
            throw new Error('API call failed with status: ' + response.code);
        }
        
        // Parse the response - handle potential issues
        let responseData;
        try {
            responseData = JSON.parse(response.body);
        } catch (parseError) {
            log.error('JSON Parse Error', {
                error: parseError.toString(),
                responseBody: response.body
            });
            throw new Error('Failed to parse API response');
        }
        
        // Log the parsed data structure
        log.debug('Parsed Response Structure', {
            hasChoices: !!responseData.choices,
            choicesLength: responseData.choices ? responseData.choices.length : 0,
            hasFirstChoice: responseData.choices && responseData.choices[0],
            hasMessage: responseData.choices && responseData.choices[0] && responseData.choices[0].message,
            messageContent: responseData.choices && responseData.choices[0] && responseData.choices[0].message 
                ? responseData.choices[0].message.content.substring(0, 200) + '...' 
                : 'No content'
        });
        
        if (responseData.error) {
            log.error('OpenRouter API Error', responseData.error);
            throw new Error('OpenRouter Error: ' + (responseData.error.message || JSON.stringify(responseData.error)));
        }
        
        if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message || !responseData.choices[0].message.content) {
            log.error('Invalid Response Structure', {
                response: JSON.stringify(responseData)
            });
            throw new Error('Invalid API response structure');
        }
        
        const analysisContent = responseData.choices[0].message.content;
        
        log.debug('Extracted Analysis', {
            contentLength: analysisContent.length,
            contentPreview: analysisContent.substring(0, 300)
        });
        
        return analysisContent;
        
    } catch (error) {
        log.error('API Call Failed', {
            error: error.toString(),
            stack: error.stack
        });
        
        // Return a fallback analysis instead of throwing
        return `FRAUD ANALYSIS ERROR

An error occurred while performing the automated fraud analysis:
${error.toString()}

MANUAL REVIEW REQUIRED

Order Details:
- Order Number: ${orderData.orderNumber || 'N/A'}
- Customer: ${orderData.customerName || 'N/A'}
- Amount: ${orderData.currency || '$'}${orderData.total || '0.00'}

Please perform manual fraud review for this order.`;
    }
}
    /**
     * Generate PDF report with fraud analysis results
     */


  function escapeXmlAdvanced(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/–/g, "-")  // Replace em dash
        .replace(/—/g, "-")  // Replace en dash
        .replace(/'/g, "'")  // Replace smart quote
        .replace(/'/g, "'")  // Replace smart quote
        .replace(/"/g, '"')  // Replace smart quote
        .replace(/"/g, '"')  // Replace smart quote
        .replace(/\u00A0/g, " "); // Replace non-breaking space
}

/**
 * Convert markdown-style formatting to HTML for better PDF rendering
 */
function convertMarkdownToHtml(text) {
    if (!text) return '';
    
    return text
        // Convert headers
        .replace(/### (.*?)(\n|$)/g, '<h3>$1</h3>')
        .replace(/#### (.*?)(\n|$)/g, '<h4>$1</h4>')
        .replace(/##### (.*?)(\n|$)/g, '<h5>$1</h5>')
        
        // Convert bold text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        
        // Convert line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>')
        
        // Wrap in paragraph tags
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        
        // Clean up empty paragraphs
        .replace(/<p><\/p>/g, '')
        .replace(/<p><br\/><\/p>/g, '');
}

  function escapeXmlSimple(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Clean text for PDF - remove markdown and special characters
 */
function cleanTextForPdf(text) {
    if (!text) return '';
    
    return text
        // Remove markdown headers
        .replace(/#{1,6}\s*/g, '')
        
        // Remove markdown bold
        .replace(/\*\*(.*?)\*\*/g, '$1')
        
        // Replace smart quotes and dashes
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/[–—]/g, '-')
        
        // Clean up extra whitespace
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
}

/**
 * Generate PDF report with fraud analysis results - IMPROVED VERSION
 */
/**
 * Generate PDF report with fraud analysis results - IMPROVED VERSION
 */
function generateFraudAnalysisPDF(orderData, analysisResult) {
    try {
        log.debug('PDF Generation Start', {
            hasAnalysis: !!analysisResult,
            analysisLength: analysisResult ? analysisResult.length : 0
        });
        
        // Function to escape XML special characters
        function escapeXml(unsafe) {
            if (!unsafe) return '';
            return unsafe.toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }
        
        // Function to format analysis text for PDF
        function formatAnalysisForPdf(text) {
            if (!text) return 'No analysis available';
            
            // First, normalize line endings and remove carriage returns
            let cleaned = text
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n');
            
            // Remove markdown formatting more aggressively
            cleaned = cleaned
                .replace(/#{1,6}\s*/g, '') // Remove headers
                .replace(/\*\*\*(.+?)\*\*\*/g, '$1') // Remove bold+italic
                .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
                .replace(/\*(.+?)\*/g, '$1') // Remove italic
                .replace(/__(.+?)__/g, '$1') // Remove bold (underscore)
                .replace(/_(.+?)_/g, '$1') // Remove italic (underscore)
                .replace(/`{3}[\s\S]*?`{3}/g, '') // Remove code blocks
                .replace(/`(.+?)`/g, '$1') // Remove inline code
                .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
                .replace(/^[-*+]\s+/gm, '• ') // Convert lists to bullets
                .replace(/^\d+\.\s+/gm, '') // Remove numbered lists
                .replace(/^>\s+/gm, '') // Remove blockquotes
                .replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines
            
            // Clean up special characters that might cause issues
            cleaned = cleaned
                .replace(/[""]/g, '"') // Smart quotes to regular
                .replace(/['']/g, "'") // Smart apostrophes to regular
                .replace(/[–—]/g, '-') // Em/en dashes to regular
                .replace(/…/g, '...') // Ellipsis
                .replace(/[\u2018\u2019]/g, "'") // More smart quotes
                .replace(/[\u201C\u201D]/g, '"') // More smart quotes
                .replace(/[\u00A0]/g, ' ') // Non-breaking spaces
                .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width spaces
            
            // Split into sections by double newlines
            const sections = cleaned.split(/\n\n+/).filter(s => s.trim());
            
            // Process each section
            const formattedSections = sections.map(section => {
                // Trim and escape
                const trimmed = section.trim();
                if (!trimmed) return '';
                
                // Check if this looks like a list item
                if (trimmed.includes('•') || trimmed.match(/^\d+[\.\)]/)) {
                    // Handle as list
                    const items = trimmed.split('\n').filter(item => item.trim());
                    const listItems = items.map(item => {
                        const cleaned = item.replace(/^[•\-*]\s*/, '').trim();
                        return `<li>${escapeXml(cleaned)}</li>`;
                    }).join('\n');
                    return `<ul>${listItems}</ul>`;
                } else {
                    // Handle as paragraph
                    return `<p>${escapeXml(trimmed)}</p>`;
                }
            });
            
            return formattedSections.join('\n');
        }
        
        // Prepare data for template
        const templateData = {
            generatedDate: escapeXml(new Date().toLocaleString()),
            orderNumber: escapeXml(orderData.orderNumber || 'N/A'),
            customerName: escapeXml(orderData.customerName || 'N/A'),
            orderDate: escapeXml(orderData.orderDate ? new Date(orderData.orderDate).toLocaleDateString() : 'N/A'),
            total: escapeXml(orderData.total ? orderData.total.toFixed(2) : '0.00'),
            currency: escapeXml(orderData.currency || '$'),
            status: escapeXml(orderData.status || 'N/A'),
            
            // Billing address
            billAddress1: escapeXml(orderData.billingAddress?.address1 || 'N/A'),
            billCity: escapeXml(orderData.billingAddress?.city || ''),
            billState: escapeXml(orderData.billingAddress?.state || ''),
            billZip: escapeXml(orderData.billingAddress?.zip || ''),
            billCountry: escapeXml(orderData.billingAddress?.country || ''),
            
            // Shipping address
            shipAddress1: escapeXml(orderData.shippingAddress?.address1 || 'N/A'),
            shipCity: escapeXml(orderData.shippingAddress?.city || ''),
            shipState: escapeXml(orderData.shippingAddress?.state || ''),
            shipZip: escapeXml(orderData.shippingAddress?.zip || ''),
            shipCountry: escapeXml(orderData.shippingAddress?.country || ''),
            
            // Customer info
            email: escapeXml(orderData.customerInfo?.email || 'N/A'),
            phone: escapeXml(orderData.customerInfo?.phone || 'N/A'),
            customerSince: escapeXml(orderData.customerInfo?.dateCreated ? new Date(orderData.customerInfo.dateCreated).toLocaleDateString() : 'N/A'),
            
            // Payment and shipping
            paymentTerms: escapeXml(orderData.paymentTerms || 'N/A'),
            paymentMethod: escapeXml(orderData.paymentMethod || 'N/A'),
            shippingMethod: escapeXml(orderData.shippingMethod || 'N/A'),
            
            // Format the analysis
            formattedAnalysis: formatAnalysisForPdf(analysisResult)
        };
        
        // Build line items table rows
        let lineItemsHtml = '';
        if (orderData.lineItems && orderData.lineItems.length > 0) {
            orderData.lineItems.forEach(item => {
                lineItemsHtml += `
                    <tr>
                        <td>${escapeXml(item.item || 'N/A')}</td>
                        <td align="center">${escapeXml(item.quantity || '0')}</td>
                        <td align="right">${templateData.currency}${escapeXml(item.rate ? item.rate.toFixed(2) : '0.00')}</td>
                        <td align="right">${templateData.currency}${escapeXml(item.amount ? item.amount.toFixed(2) : '0.00')}</td>
                    </tr>`;
            });
        } else {
            lineItemsHtml = '<tr><td colspan="4">No line items found</td></tr>';
        }
        
        const template = `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
    <head>
        <style type="text/css">
            body { 
                font-family: Arial, sans-serif; 
                font-size: 10pt; 
                color: #333;
                line-height: 1.4;
            }
            .header { 
                background-color: #dc3545; 
                color: white;
                padding: 20px; 
                margin: -20px -20px 20px -20px;
            }
            .header h1 {
                margin: 0;
                font-size: 24pt;
            }
            .header p {
                margin: 5px 0 0 0;
                font-size: 9pt;
            }
            .section { 
                margin-bottom: 20px; 
                page-break-inside: avoid;
            }
            .section h2 {
                color: #dc3545;
                border-bottom: 2px solid #dc3545;
                padding-bottom: 5px;
                margin-bottom: 10px;
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 15px; 
            }
            th { 
                background-color: #f8f9fa; 
                font-weight: bold;
                padding: 8px;
                text-align: left;
                border: 1px solid #dee2e6;
            }
            td { 
                padding: 8px; 
                border: 1px solid #dee2e6;
            }
            .info-table td:first-child {
                font-weight: bold;
                width: 150px;
                background-color: #f8f9fa;
            }
            .analysis-section {
                background-color: #f8f9fa;
                padding: 15px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
            }
            .analysis-section p {
                margin: 10px 0;
                text-align: left;
                line-height: 1.6;
            }
            .analysis-section ul {
                margin: 10px 0 10px 20px;
                padding: 0;
            }
            .analysis-section li {
                margin: 5px 0;
                line-height: 1.6;
            }
            .analysis-section p:first-child {
                margin-top: 0;
            }
            .analysis-section p:last-child {
                margin-bottom: 0;
            }
            .footer {
                margin-top: 30px;
                padding-top: 10px;
                border-top: 1px solid #dee2e6;
                font-size: 8pt;
                color: #666;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Fraud Risk Analysis Report</h1>
            <p>Generated: ${templateData.generatedDate}</p>
        </div>
        
        <div class="section">
            <h2>Order Summary</h2>
            <table class="info-table">
                <tr>
                    <td>Order Number</td>
                    <td>${templateData.orderNumber}</td>
                </tr>
                <tr>
                    <td>Customer</td>
                    <td>${templateData.customerName}</td>
                </tr>
                <tr>
                    <td>Order Date</td>
                    <td>${templateData.orderDate}</td>
                </tr>
                <tr>
                    <td>Total Amount</td>
                    <td>${templateData.currency}${templateData.total}</td>
                </tr>
                <tr>
                    <td>Status</td>
                    <td>${templateData.status}</td>
                </tr>
                <tr>
                    <td>Payment Terms</td>
                    <td>${templateData.paymentTerms}</td>
                </tr>
                <tr>
                    <td>Payment Method</td>
                    <td>${templateData.paymentMethod}</td>
                </tr>
                <tr>
                    <td>Shipping Method</td>
                    <td>${templateData.shippingMethod}</td>
                </tr>
            </table>
        </div>
        
        <div class="section">
            <h2>Customer Information</h2>
            <table class="info-table">
                <tr>
                    <td>Email</td>
                    <td>${templateData.email}</td>
                </tr>
                <tr>
                    <td>Phone</td>
                    <td>${templateData.phone}</td>
                </tr>
                <tr>
                    <td>Customer Since</td>
                    <td>${templateData.customerSince}</td>
                </tr>
            </table>
        </div>
        
        <div class="section">
            <h2>Addresses</h2>
            <table>
                <tr>
                    <th width="50%">Billing Address</th>
                    <th width="50%">Shipping Address</th>
                </tr>
                <tr>
                    <td>
                        ${templateData.billAddress1}<br/>
                        ${templateData.billCity}${templateData.billState ? ', ' + templateData.billState : ''} ${templateData.billZip}<br/>
                        ${templateData.billCountry}
                    </td>
                    <td>
                        ${templateData.shipAddress1}<br/>
                        ${templateData.shipCity}${templateData.shipState ? ', ' + templateData.shipState : ''} ${templateData.shipZip}<br/>
                        ${templateData.shipCountry}
                    </td>
                </tr>
            </table>
        </div>
        
        <div class="section">
            <h2>Order Line Items</h2>
            <table>
                <tr>
                    <th>Item</th>
                    <th width="80">Quantity</th>
                    <th width="80">Rate</th>
                    <th width="80">Amount</th>
                </tr>
                ${lineItemsHtml}
            </table>
        </div>
        
        <div class="section">
            <h2>AI Fraud Risk Analysis</h2>
            <div class="analysis-section">
                ${templateData.formattedAnalysis}
            </div>
        </div>
        
        <div class="footer">
            <p>This report was generated automatically by the NetSuite Fraud Analysis System.<br/>
            For questions or concerns, please contact your system administrator.</p>
        </div>
    </body>
</pdf>`;
        
        log.debug('Template created', {
            templateLength: template.length,
            analysisLength: templateData.formattedAnalysis.length
        });
        
        // Create the PDF
        const renderer = render.create();
        renderer.templateContent = template;
        
        const pdfFile = renderer.renderAsPdf();
        pdfFile.name = `Fraud_Analysis_${orderData.orderNumber}_${new Date().getTime()}.pdf`;
        
        log.debug('PDF created successfully', {
            fileName: pdfFile.name
        });
        
        return pdfFile;
        
    } catch (error) {
        log.error('PDF Generation Error', {
            error: error.toString(),
            stack: error.stack
        });
        
        // Create error PDF
        const errorTemplate = `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
    <body>
        <h1>PDF Generation Error</h1>
        <p>An error occurred while generating the fraud analysis report.</p>
        <p><strong>Error:</strong> ${escapeXml(error.toString())}</p>
        <p><strong>Order Number:</strong> ${escapeXml(orderData.orderNumber || 'N/A')}</p>
        <p>Please contact your system administrator.</p>
    </body>
</pdf>`;
        
        const renderer = render.create();
        renderer.templateContent = errorTemplate;
        const errorPdf = renderer.renderAsPdf();
        errorPdf.name = `Fraud_Analysis_Error_${new Date().getTime()}.pdf`;
        return errorPdf;
    }
}
    /**
     * Create error response page
     */
    function createErrorResponse(context, errorMessage) {
        const form = serverWidget.createForm({
            title: 'Fraud Analysis Error'
        });
        
        form.addPageInitMessage({
            type: 'ERROR',
            title: 'Analysis Failed',
            message: errorMessage
        });
        
        const backButton = form.addButton({
            id: 'custpage_back',
            label: 'Go Back',
            functionName: 'history.back()'
        });
        
        context.response.writePage(form);
    }

    return {
        onRequest: onRequest
    };
});

