/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define([
    'N/ui/serverWidget',
    'N/https',
    'N/encode',
    'N/file',
    'N/log'
], function(serverWidget, https, encode, file, log) {

    function onRequest(context) {
        log.debug('onRequest START', 'Method: ' + context.request.method);

        if (context.request.method === 'GET') {
            // Display form for the user to enter weight
            log.debug('GET request', 'Displaying form to user');

            var form = serverWidget.createForm({ title: 'Create FedEx Label' });
            var rmaId = context.request.parameters.rmaId || '';
            
            log.debug('RMA ID (GET)', rmaId);

            var hiddenRmaField = form.addField({
                id: 'custpage_rmaid',
                type: serverWidget.FieldType.TEXT,
                label: 'RMA ID'
            }).updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            hiddenRmaField.defaultValue = rmaId;

            form.addField({
                id: 'custpage_weight',
                type: serverWidget.FieldType.FLOAT,
                label: 'Total Shipment Weight (Lbs)'
            });

            form.addSubmitButton({ label: 'Create Label' });
            context.response.writePage(form);

            log.debug('GET request', 'Form displayed');
        } 
        else {
            // Handle POST request
            log.debug('POST request', 'Handling label creation');

            var request = context.request;
            var rmaId = request.parameters.custpage_rmaid || '';
            var totalWeight = parseFloat(request.parameters.custpage_weight) || 1;

            log.debug('POST data', 'RMA ID: ' + rmaId + ' | totalWeight: ' + totalWeight);

            try {
                // Obtain FedEx OAuth token
                log.debug('FedEx OAuth', 'Requesting token...');
                var token = getFedExOAuthToken(
                    '', 
                    '767cfc1e6cb84c6abe54b7ca61e4398f'
                );
                log.debug('FedEx OAuth token retrieved', token);

                // Create shipment and obtain Base64 PDF label
                log.debug('FedEx Shipment', 'Creating shipment...');
                var labelPdfBase64 = createFedExShipmentAndGetLabel({
                    token: token,
                    weight: totalWeight
                });

                var base64Length = labelPdfBase64 ? labelPdfBase64.length : 'null';
                log.debug('FedEx Shipment', 'Label received (base64 length: ' + base64Length + ')');

                // Return PDF inline if present
                if (labelPdfBase64) {
                    log.debug('Label base64 (snippet)', labelPdfBase64.substring(0, 200));

                    // ***IMPORTANT***: Do NOT decode base64. NetSuite expects
                    // base64 for a PDF file's `contents`.

                    var fileObj = file.create({
                        name: 'FedExLabel_' + rmaId + '.pdf',
                        fileType: file.Type.PDF,
                        contents: labelPdfBase64,  // keep it as base64
                        folder: -15 // temp folder (not in file cabinet)
                    });

                    log.debug('File object created', 
                        'File name: ' + fileObj.name + ' | size: ' + fileObj.size);

                    // Return inline to the user's browser
                    context.response.writeFile({
                        file: fileObj,
                        isInline: true
                    });

                    log.debug('Response', 'PDF returned inline to user');
                } else {
                    log.error('Label creation error', 'No label base64 returned');
                    context.response.write('Error creating FedEx label. Check logs for details.');
                }
            } catch (e) {
                log.error('FedEx Label Error', e);
                context.response.write('Error: ' + e);
            }
        }

        log.debug('onRequest END', 'Method: ' + context.request.method);
    }

    /**
     * Obtain FedEx OAuth token.
     */
    function getFedExOAuthToken(clientId, clientSecret) {
        var tokenUrl = 'https://apis-sandbox.fedex.com/oauth/token';
        var requestBodyObj = {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        };
        var headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        };

        log.debug('getFedExOAuthToken', 'Sending token request to ' + tokenUrl);

        var response = https.request({
            method: https.Method.POST,
            url: tokenUrl,
            body: requestBodyObj,
            headers: headers
        });

        log.debug('FedEx token response code', response.code);
        log.debug('FedEx token response body', response.body);

        if (response.code !== 200) {
            throw 'FedEx OAuth Error (code ' + response.code + '): ' + response.body;
        }

        var responseObj = JSON.parse(response.body);
        return responseObj.access_token;
    }

    /**
     * Create a shipment in FedEx and retrieve the Base64-encoded PDF label.
     */
    function createFedExShipmentAndGetLabel(params) {
        var token = params.token;
        var weight = params.weight;

        // Hard-coded date for demo
        var shipDatestamp = "2025-04-04";

        // Build FedEx ship payload
        var payload = {
            "labelResponseOptions": "LABEL",
            "requestedShipment": {
                "shipper": {
                    "contact": {
                        "personName": "Revelry",
                        "phoneNumber": "2106831933",
                        "companyName": ""
                    },
                    "address": {
                        "streetLines": [
                            "8136 Industry Way",
                            "Suite 500"
                        ],
                        "city": "Texas",
                        "stateOrProvinceCode": "TX",
                        "postalCode": "78744",
                        "countryCode": "US"
                    }
                },
                "origin": {
                    "contact": {
                        "personName": "Revelry",
                        "phoneNumber": "2106831933",
                        "companyName": ""
                    },
                    "address": {
                        "streetLines": [
                            "12 McKinley Ave S",
                            "Iselin"
                        ],
                        "city": "New York",
                        "stateOrProvinceCode": "NJ",
                        "postalCode": "08830",
                        "countryCode": "US"
                    }
                },
                "recipients": [
                    {
                        "contact": {
                            "personName": "Mariusz Stefaniak",
                            "phoneNumber": "4382200400",
                            "companyName": ""
                        },
                        "address": {
                            "streetLines": [
                                "111 E Cesar Chavez St",
                                ""
                            ],
                            "city": "Austin",
                            "stateOrProvinceCode": "TX",
                            "postalCode": "78701",
                            "countryCode": "US"
                        }
                    }
                ],
                "shipDatestamp": shipDatestamp,
                "serviceType": "FEDEX_GROUND",
                "packagingType": "YOUR_PACKAGING",
                "pickupType": "USE_SCHEDULED_PICKUP",
                "smartPostInfoDetail": {
                    "hubId": "5531",
                    "indicia": "PARCEL_SELECT"
                },
                "blockInsightVisibility": false,
                "shippingChargesPayment": {
                    "paymentType": "SENDER"
                },
                // Requesting PDF label
                "labelSpecification": {
                    "imageType": "PDF",
                    "labelStockType": "PAPER_4X6"
                },
                "requestedPackageLineItems": [
                    {
                        "weight": {
                            "units": "LB",
                            "value": weight
                        },
                        "dimensions": {
                            "length": 13,
                            "width": 10,
                            "height": 2,
                            "units": "IN"
                        }
                    }
                ]
            },
            "accountNumber": {
                "value": "740561073"
            }
        };

        var url = 'https://apis-sandbox.fedex.com/ship/v1/shipments';
        var headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + token
        };

        log.debug('createFedExShipmentAndGetLabel', 'Sending createShipment request to FedEx');

        var response = https.request({
            method: https.Method.POST,
            url: url,
            headers: headers,
            body: JSON.stringify(payload)
        });

        log.debug('createShipment response code', response.code);
        log.debug('createShipment response body', response.body);

        if (response.code === 200 || response.code === 201) {
            var respBody = JSON.parse(response.body);
            try {
                // Grab the Base64 PDF from "encodedLabel" (NOT "content")
                var labelBase64 = respBody.output
                    .transactionShipments[0]
                    .pieceResponses[0]
                    .packageDocuments[0]
                    .encodedLabel;
                
                log.debug('Label extraction successful', 'Base64 length: ' + labelBase64.length);
                return labelBase64;
            } catch (e) {
                log.error('Error extracting label PDF', e);
                return null;
            }
        } else {
            log.error('FedEx createShipment Error', response.body);
            return null;
        }
    }

    return {
        onRequest: onRequest
    };
});
