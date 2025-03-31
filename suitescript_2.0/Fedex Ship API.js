/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define([
    'N/ui/serverWidget',
    'N/https',
    'N/encode',
    'N/file',
    'N/log',
    'N/record'
], function(serverWidget, https, encode, file, log, record) {

    function onRequest(context) {
        log.debug('onRequest START', 'Method: ' + context.request.method);

        if (context.request.method === 'GET') {
            // Display form for the user to enter weight
            var form = serverWidget.createForm({ title: 'Create FedEx Label' });
            var rmaId = context.request.parameters.rmaId || '';
            
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
        } 
        else {
            // Handle POST request
            var request = context.request;
            var rmaId = request.parameters.custpage_rmaid || '';
            var totalWeight = parseFloat(request.parameters.custpage_weight) || 1;

            // Load the RMA record (Return Authorization) and extract the Bill-To address
            var rmaRecord = record.load({
    type: 'returnauthorization',
    id: rmaId
});

            
            // Assuming the billing address is stored as a subrecord with fieldId 'billingaddress'
            var billingAddress = rmaRecord.getSubrecord({ fieldId: 'billingaddress' });
            var billAddr1    = billingAddress.getValue({ fieldId: 'addr1' });
            var billAddr2    = billingAddress.getValue({ fieldId: 'addr2' });
            var billCity     = billingAddress.getValue({ fieldId: 'city' });
            var billState    = billingAddress.getValue({ fieldId: 'state' });
            var billZip      = billingAddress.getValue({ fieldId: 'zip' });
            var billCountry  = billingAddress.getValue({ fieldId: 'country' });

            try {
                // Obtain FedEx OAuth token
                var token = getFedExOAuthToken(
                    '', 
                    '767cfc1e6cb84c6abe54b7ca61e4398f'
                );

                // Create shipment and pass along the Bill-To address for the shipper block
                var labelPdfBase64 = createFedExShipmentAndGetLabel({
                    token: token,
                    weight: totalWeight,
                    billAddress: {
                        addr1: billAddr1,
                        addr2: billAddr2,
                        city: billCity,
                        state: billState,
                        zip: billZip,
                        country: billCountry
                    }
                });

                if (labelPdfBase64) {
                    var fileObj = file.create({
                        name: 'FedExLabel_' + rmaId + '.pdf',
                        fileType: file.Type.PDF,
                        contents: labelPdfBase64,  // keep it as base64
                        folder: -15
                    });

                    // Return inline PDF to the user
                    context.response.writeFile({
                        file: fileObj,
                        isInline: true
                    });
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

        var response = https.request({
            method: https.Method.POST,
            url: tokenUrl,
            body: requestBodyObj,
            headers: headers
        });

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
        var billAddress = params.billAddress;

        // Hard-coded ship date for demo
        var shipDatestamp = "2025-04-04";

        // Build FedEx shipment payload with dynamic Bill-To (From) address
        var payload = {
            "labelResponseOptions": "LABEL",
            "requestedShipment": {
                "shipper": {
                    "contact": {
                        "personName": "Bill To Contact",  // Adjust if you have a dynamic contact name
                        "phoneNumber": "2106831933",       // Could be dynamic if needed
                        "companyName": ""                  // Adjust if required
                    },
                    "address": {
                        "streetLines": [
                            billAddress.addr1,
                            billAddress.addr2
                        ],
                        "city": billAddress.city,
                        "stateOrProvinceCode": billAddress.state,
                        "postalCode": billAddress.zip,
                        "countryCode": billAddress.country
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
                            "personName": "Livio Beqiri",
                            "phoneNumber": "4382200400",
                            "companyName": ""
                        },
                        "address": {
                            "streetLines": [
                                "123 Main Ave",
                                ""
                            ],
                            "city": "Montclair",
                            "stateOrProvinceCode": "NJ",
                            "postalCode": "07042",
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

        var response = https.request({
            method: https.Method.POST,
            url: url,
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (response.code === 200 || response.code === 201) {
            var respBody = JSON.parse(response.body);
            try {
                var labelBase64 = respBody.output.transactionShipments[0].pieceResponses[0].packageDocuments[0].encodedLabel;
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
