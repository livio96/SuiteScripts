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
        const MODEL_NAME = 'deepseek/deepseek-r1:free';
        //const MODEL_NAME = 'anthropic/claude-sonnet-4'
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

            context.response.writePage(form);
        }

        /**
         * Perform fraud analysis and generate PDF
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
                    const fallbackAnalysis = createFallbackAnalysis(orderData);
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
         * Create fallback analysis when API fails
         */
        function createFallbackAnalysis(orderData) {
            return `AUTOMATED FRAUD ANALYSIS UNAVAILABLE

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
        }

        /**
         * Extract comprehensive sales order data for analysis
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
                    billingAddress: {},
                    shippingAddress: {},
                    paymentTerms: salesOrder.getText('terms') || salesOrder.getValue('terms') || '',
                    shippingMethod: salesOrder.getText('shipmethod') || salesOrder.getValue('shipmethod') || '',
                    lineItems: []
                };

                // Get payment method
                try {
                    orderData.paymentMethod = salesOrder.getText('paymentmethod') || salesOrder.getValue('paymentmethod') || '';
                    const ccNumber = salesOrder.getValue('ccnumber') || '';
                    if (ccNumber) {
                        orderData.paymentMethod += ' (****' + ccNumber.slice(-4) + ')';
                    }
                } catch (e) {
                    log.debug('Payment method not available', e.toString());
                    orderData.paymentMethod = 'N/A';
                }

                // Get addresses with better error handling
                orderData.billingAddress = getAddress(salesOrder, 'billing');
                orderData.shippingAddress = getAddress(salesOrder, 'shipping');

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

                // Get customer additional info
                orderData.customerInfo = getCustomerInfo(orderData.customerId, salesOrder);

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
         * Get address information with fallback methods
         */
        function getAddress(salesOrder, type) {
            const prefix = type === 'billing' ? 'bill' : 'ship';
            let address = {};

            try {
                // Method 1: Try subrecord approach
                const addressSubrecord = salesOrder.getSubrecord({
                    fieldId: type + 'address'
                });

                if (addressSubrecord) {
                    address = {
                        attention: addressSubrecord.getValue('attention') || '',
                        addressee: addressSubrecord.getValue('addressee') || '',
                        address1: addressSubrecord.getValue('addr1') || '',
                        address2: addressSubrecord.getValue('addr2') || '',
                        city: addressSubrecord.getValue('city') || '',
                        state: addressSubrecord.getValue('state') || '',
                        zip: addressSubrecord.getValue('zip') || '',
                        country: addressSubrecord.getValue('country') || ''
                    };
                }
            } catch (e) {
                log.debug(`${type} subrecord method failed`, e.toString());

                // Method 2: Try field-based approach
                try {
                    address = {
                        attention: salesOrder.getValue(prefix + 'attention') || '',
                        addressee: salesOrder.getValue(prefix + 'addressee') || '',
                        address1: salesOrder.getValue(prefix + 'addr1') || '',
                        address2: salesOrder.getValue(prefix + 'addr2') || '',
                        city: salesOrder.getValue(prefix + 'city') || '',
                        state: salesOrder.getValue(prefix + 'state') || '',
                        zip: salesOrder.getValue(prefix + 'zip') || '',
                        country: salesOrder.getValue(prefix + 'country') || ''
                    };

                    // If no addr1, try to parse the full address text
                    if (!address.address1) {
                        const addressText = salesOrder.getValue(prefix + 'address');
                        if (addressText) {
                            address = parseAddressText(addressText);
                        }
                    }
                } catch (e2) {
                    log.debug(`${type} field method failed`, e2.toString());
                    address = {
                        address1: `Unable to retrieve ${type} address`,
                        city: '',
                        state: '',
                        zip: '',
                        country: ''
                    };
                }
            }

            return address;
        }

        /**
         * Parse address text into components
         */
        function parseAddressText(addressText) {
            const addressLines = addressText.split('\n').filter(line => line.trim());
            const address = {
                addressee: '',
                address1: '',
                address2: '',
                city: '',
                state: '',
                zip: '',
                country: ''
            };

            if (addressLines.length > 0) {
                address.addressee = addressLines[0] || '';
                address.address1 = addressLines[1] || '';
                address.address2 = addressLines[2] || '';

                // Parse city, state, zip from last line
                if (addressLines.length > 3) {
                    const lastLine = addressLines[addressLines.length - 1];
                    const cityStateZip = lastLine.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
                    if (cityStateZip) {
                        address.city = cityStateZip[1];
                        address.state = cityStateZip[2];
                        address.zip = cityStateZip[3];
                    }
                }
            }

            return address;
        }

        /**
         * Get customer information
         */
        function getCustomerInfo(customerId, salesOrder) {
            const customerInfo = {};

            if (customerId) {
                try {
                    const customer = record.load({
                        type: record.Type.CUSTOMER,
                        id: customerId
                    });

                    customerInfo.dateCreated = customer.getValue('datecreated');
                    customerInfo.email = customer.getValue('email') || '';
                    customerInfo.phone = customer.getValue('phone') || '';
                    customerInfo.altPhone = customer.getValue('altphone') || '';
                    customerInfo.creditLimit = customer.getValue('creditlimit') || 0;
                    customerInfo.balance = customer.getValue('balance') || 0;
                    customerInfo.terms = customer.getText('terms') || '';
                    customerInfo.isPerson = customer.getValue('isperson');
                    customerInfo.firstName = customer.getValue('firstname') || '';
                    customerInfo.lastName = customer.getValue('lastname') || '';
                    customerInfo.companyName = customer.getValue('companyname') || '';
                    customerInfo.category = customer.getText('category') || '';
                    customerInfo.salesRep = customer.getText('salesrep') || '';

                } catch (error) {
                    log.error('Could not load customer details', {
                        customerId: customerId,
                        error: error.toString()
                    });
                }
            }

            // Get order-level email and phone if not found in customer
            if (!customerInfo.email) {
                customerInfo.email = salesOrder.getValue('email') || 'N/A';
            }
            if (!customerInfo.phone) {
                customerInfo.phone = salesOrder.getValue('phone') || 'N/A';
            }

            return customerInfo;
        }

        /**
         * Call OpenRouter API for fraud analysis
         */
        function callOpenRouterAPI(orderData) {
            try {
                const prompt = createFraudAnalysisPrompt(orderData);

                const payload = {
                    model: MODEL_NAME,
                    messages: [{
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
                    bodyLength: response.body ? response.body.length : 0
                });

                if (response.code !== 200) {
                    log.error('API Error', {
                        code: response.code,
                        body: response.body
                    });
                    throw new Error('API call failed with status: ' + response.code);
                }

                const responseData = JSON.parse(response.body);

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
                return createFallbackAnalysis(orderData);
            }
        }

        /**
         * Create fraud analysis prompt
         */
        function createFraudAnalysisPrompt(orderData) {
            return `You are an experienced e-commerce fraud detection analyst. Analyze the following sales order for potential fraud. Provide a comprehensive, structured report in the following format:

Order Overview: Summarize the order, including customer name, company (if applicable), product(s), cost, shipping method, and whether this is a first-time customer.

Address Consistency: Compare billing vs. shipping addresses, checking for mismatches, unusual suite numbers such as freight forwarders, P.O. boxes, or addresses in high-risk regions. Verify if the shipping and billing address belong to a legitimate business or residential location.

Email & Phone Verification: Analyze the email address to determine if it uses a corporate domain, free provider, or disposable service. Review the domain reputation and whether it is personalized. Examine the phone number to see if the area code matches the location and confirm whether it is valid.

Payment & Credit Card Indicators: Determine if the card type and BIN align with the customer's location. Consider whether the payment appears to be from a personal, corporate, or prepaid card and note any patterns suggesting card testing.

Identity & Profile Plausibility: Evaluate whether the customer's name, company, email, phone, and address logically align. Determine if the order context makes sense and check for verifiable business footprint.

Order Patterns & Behavioral Clues: Analyze quantity, product type, and total value for fraud indicators. Note if there are high-value items, first-time purchases, or suspicious order timing.

List of Potential Red Flags: Explicitly list any suspicious findings.

Final Conclusion: Clearly state Fraud or Not Fraud and briefly justify your determination.

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
${orderData.lineItems.map(item => `- ${item.item}: Qty ${item.quantity} @ $${item.rate} = $${item.amount}`).join('\n')}`;
        }

        /**
         * Generate PDF report with fraud analysis results
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
                    if (!text) return '<p>No analysis available</p>';

                    let cleaned = text
                        .replace(/\r\n/g, '\n')
                        .replace(/\r/g, '\n')
                        .replace(/#{1,6}\s*/g, '')
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.+?)\*/g, '<em>$1</em>')
                        .replace(/[""]/g, '"')
                        .replace(/['']/g, "'")
                        .replace(/[–—]/g, '-')
                        .replace(/[\u00A0]/g, ' ');

                    const sections = cleaned.split(/\n\s*\n/).filter(s => s.trim());
                    let formattedHtml = '';

                    sections.forEach(section => {
                        const trimmed = section.trim();
                        if (!trimmed) return;

                        // Check for section headers
                        if (trimmed.match(/^[A-Z\s]{3,}:?\s*$/) || trimmed.match(/^\d+\.\s*[A-Z\s]{3,}:?\s*$/)) {
                            let headerText = trimmed.replace(/^\d+\.\s*/, '').replace(/:$/, '');
                            formattedHtml += `<h3 class="analysis-header">${escapeXml(headerText)}</h3>\n`;
                        }
                        // Check for bullet points
                        else if (trimmed.includes('•') || trimmed.match(/^[-*]\s/m)) {
                            const items = trimmed.split('\n').filter(item => item.trim());
                            let listHtml = '<ul class="analysis-list">\n';
                            items.forEach(item => {
                                const cleanItem = item.replace(/^[•\-*]\s*/, '').trim();
                                if (cleanItem) {
                                    listHtml += `  <li>${escapeXml(cleanItem)}</li>\n`;
                                }
                            });
                            listHtml += '</ul>\n';
                            formattedHtml += listHtml;
                        }
                        // Regular paragraph
                        else {
                            formattedHtml += `<p class="analysis-paragraph">${escapeXml(trimmed)}</p>\n`;
                        }
                    });

                    return formattedHtml || '<p>Analysis content could not be formatted</p>';
                }

                // Function to format address properly
                function formatAddress(addressObj) {
                    if (!addressObj) return 'N/A';

                    const parts = [];
                    if (addressObj.addressee) parts.push(addressObj.addressee);
                    if (addressObj.attention) parts.push(addressObj.attention);
                    if (addressObj.address1) parts.push(addressObj.address1);
                    if (addressObj.address2) parts.push(addressObj.address2);

                    const cityStateZip = [];
                    if (addressObj.city) cityStateZip.push(addressObj.city);
                    if (addressObj.state) cityStateZip.push(addressObj.state);
                    if (addressObj.zip) cityStateZip.push(addressObj.zip);

                    if (cityStateZip.length > 0) {
                        if (addressObj.city && addressObj.state) {
                            parts.push(`${addressObj.city}, ${addressObj.state} ${addressObj.zip || ''}`.trim());
                        } else {
                            parts.push(cityStateZip.join(' '));
                        }
                    }

                    if (addressObj.country) parts.push(addressObj.country);

                    return parts.length > 0 ? parts.join('<br/>') : 'N/A';
                }

                // Prepare template data
                const templateData = {
                    generatedDate: escapeXml(new Date().toLocaleString()),
                    orderNumber: escapeXml(orderData.orderNumber || 'N/A'),
                    customerName: escapeXml(orderData.customerName || 'N/A'),
                    orderDate: escapeXml(orderData.orderDate ? new Date(orderData.orderDate).toLocaleDateString() : 'N/A'),
                    total: escapeXml(orderData.total ? orderData.total.toFixed(2) : '0.00'),
                    currency: escapeXml(orderData.currency || '$'),
                    status: escapeXml(orderData.status || 'N/A'),
                    email: escapeXml(orderData.customerInfo?.email || 'N/A'),
                    phone: escapeXml(orderData.customerInfo?.phone || 'N/A'),
                    customerSince: escapeXml(orderData.customerInfo?.dateCreated ? new Date(orderData.customerInfo.dateCreated).toLocaleDateString() : 'N/A'),
                    paymentTerms: escapeXml(orderData.paymentTerms || 'N/A'),
                    paymentMethod: escapeXml(orderData.paymentMethod || 'N/A'),
                    shippingMethod: escapeXml(orderData.shippingMethod || 'N/A'),
                    formattedBillingAddress: formatAddress(orderData.billingAddress),
                    formattedShippingAddress: formatAddress(orderData.shippingAddress),
                    formattedAnalysis: formatAnalysisForPdf(analysisResult)
                };

                // Build line items table
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
                    lineItemsHtml = '<tr><td colspan="4" style="text-align: center; font-style: italic;">No line items found</td></tr>';
                }

                const template = createPDFTemplate(templateData, lineItemsHtml);

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
                const errorTemplate = createErrorPDFTemplate(error, orderData);
                const renderer = render.create();
                renderer.templateContent = errorTemplate;
                const errorPdf = renderer.renderAsPdf();
                errorPdf.name = `Fraud_Analysis_Error_${new Date().getTime()}.pdf`;
                return errorPdf;
            }
        }

        /**
         * Create PDF template
         */
        function createPDFTemplate(templateData, lineItemsHtml) {
            return `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
    <head>
        <style type="text/css">
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                font-size: 10pt; 
                color: #2c3e50;
                line-height: 1.5;
                margin: 0;
                background-color: #ffffff;
            }
            
            .header { 
                background: linear-gradient(135deg, #1a237e 0%, #3949ab 100%);
                color: white;
                padding: 30px; 
                margin: -20px -20px 30px -20px;
                text-align: center;
                position: relative;
            }
            
            .header h1 {
                margin: 0;
                font-size: 28pt;
                font-weight: 300;
                letter-spacing: 1px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            
            .header .subtitle {
                margin: 15px 0 0 0;
                font-size: 11pt;
                opacity: 0.9;
                font-weight: 300;
            }
            
            .section { 
                margin-bottom: 30px; 
                page-break-inside: avoid;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                overflow: hidden;
                border: 1px solid #e8eaf6;
            }
            
            .section h2 {
                color: white;
                background: linear-gradient(135deg, #3949ab 0%, #5c6bc0 100%);
                padding: 15px 20px;
                margin: 0 0 0 0;
                font-size: 14pt;
                font-weight: 500;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            
            .section-content {
                padding: 20px;
            }
            
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 0;
                border-radius: 6px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            th { 
                background: linear-gradient(135deg, #7986cb 0%, #9fa8da 100%);
                color: white;
                font-weight: 600;
                padding: 15px 12px;
                text-align: left;
                border: none;
                font-size: 9pt;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            td { 
                padding: 12px;
                border: none;
                border-bottom: 1px solid #e8eaf6;
                vertical-align: top;
                font-size: 9pt;
                background-color: white;
            }
            
            tr:nth-child(even) td {
                background-color: #fafafa;
            }
            
            .info-table td:first-child {
                font-weight: 600;
                width: 160px;
                background: linear-gradient(135deg, #e8eaf6 0%, #f3e5f5 100%);
                color: #3949ab;
                border-right: 3px solid #3949ab;
            }
            
            .amount {
                font-size: 11pt;
                font-weight: 700;
                color: #1b5e20;
            }
            
            .address-table {
                margin-bottom: 0;
                border-radius: 8px;
                overflow: hidden;
            }
            
            .address-table th {
                background: linear-gradient(135deg, #4527a0 0%, #7b1fa2 100%);
                color: white;
                text-align: center;
                font-size: 11pt;
                padding: 18px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .address-table td {
                padding: 20px;
                line-height: 1.8;
                vertical-align: top;
                font-size: 9pt;
                background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
                border-right: 1px solid #e0e0e0;
            }
            
            .address-table td:last-child {
                border-right: none;
            }
            
            .analysis-section {
                background: linear-gradient(135deg, #f8f9ff 0%, #f3e5f5 100%);
                padding: 25px;
                border-radius: 8px;
                margin-top: 0;
                border: 2px solid #e8eaf6;
                position: relative;
            }
            
            .analysis-header {
                color: #3949ab;
                font-size: 12pt;
                font-weight: 700;
                margin: 25px 0 15px 0;
                padding: 10px 15px;
                background: linear-gradient(135deg, #e8eaf6 0%, #f3e5f5 100%);
                border-left: 4px solid #3949ab;
                border-radius: 0 4px 4px 0;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .analysis-header:first-child {
                margin-top: 0;
            }
            
            .analysis-paragraph {
                margin: 15px 0;
                text-align: left;
                line-height: 1.7;
                font-size: 9pt;
                color: #37474f;
                padding: 8px 0;
            }
            
            .analysis-list {
                margin: 15px 0 15px 25px;
                padding: 0;
            }
            
            .analysis-list li {
                margin: 10px 0;
                line-height: 1.7;
                font-size: 9pt;
                padding: 5px 0 5px 10px;
                color: #37474f;
                position: relative;
            }
            
            .analysis-list li::before {
                content: '●';
                color: #3949ab;
                font-weight: bold;
                position: absolute;
                left: -15px;
            }
            
            .risk-assessment {
                background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
                border: 2px solid #ff9800;
                padding: 20px;
                border-radius: 8px;
                font-weight: 600;
                margin: 25px 0 0 0;
                position: relative;
                box-shadow: 0 4px 12px rgba(255,152,0,0.2);
            }
            
            .risk-assessment h4 {
                margin: 0 0 10px 0;
                color: #e65100;
                font-size: 11pt;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .footer {
                margin-top: 40px;
                padding: 25px 0;
                border-top: 3px solid #e8eaf6;
                background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
                text-align: center;
                line-height: 1.6;
                border-radius: 8px 8px 0 0;
            }
            
            .footer-content {
                color: #666;
                font-size: 8pt;
            }
            
            .footer-title {
                font-weight: 700;
                color: #3949ab;
                font-size: 9pt;
                margin-bottom: 8px;
            }
            
            .status-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 8pt;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .status-pending {
                background-color: #fff3e0;
                color: #e65100;
                border: 1px solid #ffcc02;
            }
            
            .status-approved {
                background-color: #e8f5e8;
                color: #2e7d32;
                border: 1px solid #4caf50;
            }
            
            .page-break-before {
                page-break-before: always;
            }
            
            .no-break {
                page-break-inside: avoid;
            }
            
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            .text-primary { color: #3949ab; }
            .text-success { color: #2e7d32; }
            .text-warning { color: #f57c00; }
            .text-danger { color: #d32f2f; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛡️ Fraud Risk Analysis Report</h1>
            <p class="subtitle">Comprehensive AI-Powered Security Assessment</p>
            <p class="subtitle">Generated on: ${templateData.generatedDate}</p>
        </div>
        
        <div class="section no-break">
            <h2>📋 Order Summary</h2>
            <div class="section-content">
                <table class="info-table">
                    <tr>
                        <td>Order Number</td>
                        <td class="font-bold text-primary">${templateData.orderNumber}</td>
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
                        <td class="amount">${templateData.currency}${templateData.total}</td>
                    </tr>
                    <tr>
                        <td>Status</td>
                        <td><span class="status-badge status-pending">${templateData.status}</span></td>
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
        </div>
        
        <div class="section no-break">
            <h2>👤 Customer Information</h2>
            <div class="section-content">
                <table class="info-table">
                    <tr>
                        <td>📧 Email Address</td>
                        <td>${templateData.email}</td>
                    </tr>
                    <tr>
                        <td>📱 Phone Number</td>
                        <td>${templateData.phone}</td>
                    </tr>
                    <tr>
                        <td>📅 Customer Since</td>
                        <td>${templateData.customerSince}</td>
                    </tr>
                </table>
            </div>
        </div>
        
        <div class="section">
            <h2>🏠 Address Verification</h2>
            <div class="section-content">
                <table class="address-table">
                    <tr>
                        <th>💳 Billing Address</th>
                        <th>📦 Shipping Address</th>
                    </tr>
                    <tr>
                        <td>${templateData.formattedBillingAddress}</td>
                        <td>${templateData.formattedShippingAddress}</td>
                    </tr>
                </table>
            </div>
        </div>
        
        <div class="section">
            <h2>🛒 Order Line Items</h2>
            <div class="section-content">
                <table>
                    <tr>
                        <th>📦 Item Description</th>
                        <th width="80" class="text-center">#️⃣ Quantity</th>
                        <th width="90" class="text-right">💰 Unit Price</th>
                        <th width="90" class="text-right">💵 Line Total</th>
                    </tr>
                    ${lineItemsHtml}
                </table>
            </div>
        </div>
        
        <div class="section page-break-before">
            <h2>🤖 AI Fraud Risk Analysis</h2>
            <div class="section-content">
                <div class="analysis-section">
                    ${templateData.formattedAnalysis}
                </div>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-content">
                <div class="footer-title">🛡️ NetSuite Fraud Analysis System</div>
                <p>This report was generated using advanced AI-powered fraud detection algorithms.<br/>
                The analysis combines multiple risk factors including customer behavior, order patterns,<br/>
                geographic data, and payment verification to provide comprehensive fraud assessment.</p>
                <p><strong>For questions or concerns regarding this analysis, please contact the security team.</strong></p>
            </div>
        </div>
    </body>
</pdf>`;
        }

        /**
         * Create error PDF template
         */
        function createErrorPDFTemplate(error, orderData) {
            function escapeXml(unsafe) {
                if (!unsafe) return '';
                return unsafe.toString()
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            }

            return `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
    <head>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .error { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; }
            .header { background-color: #dc3545; color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>PDF Generation Error</h1>
        </div>
        <div class="error">
            <p><strong>An error occurred while generating the fraud analysis report.</strong></p>
            <p><strong>Error:</strong> ${escapeXml(error.toString())}</p>
            <p><strong>Order Number:</strong> ${escapeXml(orderData.orderNumber || 'N/A')}</p>
            <p><strong>Time:</strong> ${escapeXml(new Date().toLocaleString())}</p>
            <p>Please contact your system administrator for assistance.</p>
        </div>
    </body>
</pdf>`;
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

            const errorField = form.addField({
                id: 'custpage_error_details',
                type: serverWidget.FieldType.LONGTEXT,
                label: 'Error Details'
            });
            errorField.defaultValue = errorMessage;
            errorField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
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
