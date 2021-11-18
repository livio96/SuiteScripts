/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(["N/search", "N/record", "N/email", "N/runtime", "N/https", "N/format"],
    function(search, record, email, runtime, https, format) {
        function credit_limit_request(context) {
            try {
                //Get Field Values 
                var newRecord = context.newRecord;

                var EH_Final_Response = newRecord.getValue({
                    fieldId: 'custrecord_euler_hermes_response'
                });

                // If request hasnt been submitted yet
                if (EH_Final_Response == '' || EH_Final_Response == null) {

                    var company_id = newRecord.getValue({
                        fieldId: 'custrecord_company_id'
                    });
                    var netsuite_customer_id = newRecord.getValue({
                        fieldId: 'custrecord_netsuite_customer',
                    });

                    var request_id = newRecord.getValue({
                        fieldId: 'custrecord_credit_limit_request_link'
                    })

                    var amount = newRecord.getValue({
                        fieldId: 'custrecord_amount_requested'
                    });



                    var ApiKey = 'bGJlcWlyaUB0ZWxxdWVzdGludGwuY29tOjFfSDctPjB1Um5pQlZZRSc1NTVqZSZyZVxwb350Zw==' // Production
                    //var ApiKey = 'bGJlcWlyaUB0ZWxxdWVzdGludGwuY29tOi5XIXE/UD9rZ1EnLmpbNio0WHo+VFF1blVYNVxSeA=='  //Sandbox
                    var Auth_Headers = {};
                    Auth_Headers['Content-Type'] = 'application/json';
                    var RequestJs = {
                        "apiKey": ApiKey
                    }
                    // Authorize Connection        
                    var EH_Auth_Response = https.request({
                        method: https.Method.POST,
                        url: 'https://api.eulerhermes.com/v1/idp/oauth2/authorize', //Production
                        //url: "https://api-services.uat.1placedessaisons.com/uatm/v1/idp/oauth2/authorize", // Sandbox
                        body: JSON.stringify(RequestJs),
                        headers: Auth_Headers
                    });


                    if (EH_Auth_Response.code == 200) {
                        var AuthResult = JSON.parse(EH_Auth_Response.body);
                        var AccessToken = AuthResult.access_token;

                    }



                    //Request Credit limit 
                    //Headers
                    var search_Auth_Headers = {};
                    search_Auth_Headers['Content-Type'] = 'application/json';
                    search_Auth_Headers['Authorization'] = 'Bearer ' + AccessToken;
                    search_Auth_Headers['Content-Length'] = '0';
                    search_Auth_Headers['Host'] = '<calculated when request is sent>';
                    search_Auth_Headers['User-Agent'] = 'PostmanRuntime/7.28.4';
                    search_Auth_Headers['Accept'] = '*/*';
                    search_Auth_Headers['Accept-Encoding'] = 'gzip, deflate, br';
                    search_Auth_Headers['Connection'] = 'keep-alive';



                    var newRequestBody = {
                        "coverTypeCode": "CreditLimit",
                        "requestOrigin": "ExternalPlatform",

                        "requestData": {
                            "amount": amount,
                            "currencyCode": "USD",
                            "companyId": company_id,
                            "comment": "Auto Requested",
                            "isRequestUrgent": "true"
                        },

                        "policy": {
                            "policyId": "5121840",
                            "businessUnitCode": "ACI"
                        }
                    }


                    var credit_limit_request = https.request({
                        method: https.Method.POST,
                        url: 'https://api.eulerhermes.com/riskinfo/v2/covers', //Production
                        //url: "https://api-services.uat.1placedessaisons.com/uatm/riskinfo/v2/covers", // Sandbox
                        body: JSON.stringify(newRequestBody),
                        headers: search_Auth_Headers
                    });




                    var response_url = "https://api.eulerhermes.com/riskinfo/v2/covers?policyId=5121840&businessUnitCode=ACI&companyId=" + company_id; //Production
                    //   var response_url = "https://api-services.uat.1placedessaisons.com/uatm/riskinfo/v2/covers?policyId=5121840&businessUnitCode=ACI&companyId="+company_id; //Sandbox

                    var euler_hermes_response = https.request({
                        method: https.Method.GET,
                        url: response_url,
                        //body: JSON.stringify(newRequestBody),
                        headers: search_Auth_Headers
                    });




                    var response_body = JSON.parse(euler_hermes_response.body)

                    if (response_body != 'undefined')
                        var code = response_body[0].coverStatusCode

                    log.debug({
                        title: 'coverStatus Code',
                        details: code
                    })

                    newRecord.setValue({
                        fieldId: 'custrecord_euler_hermes_response',
                        value: response_body[0].coverStatusCode
                    });

                    //Add Euler Hermes id to customer record

                    var cust_rec = record.load({
                        type: record.Type.CUSTOMER,
                        id: netsuite_customer_id,
                        isDynamic: true,
                    });


                    cust_rec.setValue({
                        fieldId: 'custentity_eh_id',
                        value: company_id
                    });

                    cust_rec.setValue({
                        fieldId: 'custentity_eh_request_amount',
                        value: amount
                    });

                    if (response_body[0].coverStatusCode == "Agreement") {
                        cust_rec.setValue({
                            fieldId: 'custentity_eh_request_status',
                            value: 2
                        });
                    } else {
                        cust_rec.setValue({
                            fieldId: 'custentity_eh_request_status',
                            value: 1
                        });
                    }

                    cust_rec.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    });


                }
            } catch (e) {
                log.debug({
                    title: 'Error',
                    details: e
                })
            }



        }

        return {
            beforeSubmit: credit_limit_request,
        };
    });