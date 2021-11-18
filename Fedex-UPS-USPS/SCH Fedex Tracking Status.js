/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(["N/search", "N/record", "N/email", "N/runtime", "N/https", "N/format"],
    function(search, record, email, runtime, https, format) {
        function Fedex_Tracking_Status(context) {
            try {
              
              
                // Authorization
              
                    //API Authorization
                var Auth_Headers = {};
                Auth_Headers['Content-Type'] = 'application/x-www-form-urlencoded';

                var req_body = {
                    "grant_type": "client_credentials",
                    "client_id": "l7323984b6ecf04b81afa701d1f19358b4",
                    "client_secret": "3b36737c3b9942e89075d00cc29fb4e6"
                }


                var auth_response = https.request({
                    method: https.Method.POST,
                    url: 'https://apis.fedex.com/oauth/token',
                    body: req_body,
                    headers: Auth_Headers
                });

                var auth_token = JSON.parse(auth_response.body).access_token
                auth_token = 'Bearer ' + auth_token;

              
              
                //Run a search 

                var customrecord_pacejet_package_infoSearchObj = search.create({
                    type: "customrecord_pacejet_package_info",
                    filters: [
                      [["created", "on", "today"],
                        "AND",
                        ["custrecord_pacejet_transaction_link.shipmethod", "anyof", "7205", "186636", "76181", "186631", "139727", "241931", "241920", "137298", "89083", "240365", "7316", "137299", "168353", "139407", "240458", "137300", "139174", "7315", "170297", "240175", "168351", "7313", "168352"],
                        "AND",
                        ["custrecord_pacejet_transaction_link.type", "anyof", "ItemShip"]],
                        "OR", ["custrecord_tracking_status","is","Initiated"]
                    ],
                    columns: [
                      
                      search.createColumn({
                            name: "internalid",
                            label: "Internal ID"
                        }),
                        search.createColumn({
                            name: "name",
                            sort: search.Sort.ASC,
                            label: "Name"
                        }),
                        search.createColumn({
                            name: "scriptid",
                            label: "Script ID"
                        }),
                        search.createColumn({
                            name: "custrecord_pacejet_transaction_link",
                            label: "PJ Package Transaction Link"
                        }),
                        search.createColumn({
                            name: "custrecord_pacejet_package_id",
                            label: "Package ID"
                        }),
                        search.createColumn({
                            name: "custrecord_pacejet_package_contents",
                            label: "Contents"
                        }),
                        search.createColumn({
                            name: "custrecord_pacejet_package_tracking",
                            label: "Tracking Number"
                        }),
                        search.createColumn({
                            name: "custrecord_pacejet_package_tracking_link",
                            label: "Tracking Link"
                        }),
                        search.createColumn({
                            name: "custrecord_pacejet_package_weight",
                            label: "Weight"
                        }),
                        search.createColumn({
                            name: "custrecord_pacejet_package_sscc",
                            label: "SSCC"
                        })
                    ]
                });

               var results = customrecord_pacejet_package_infoSearchObj.run();
               var resultsRange = results.getRange(0, 1000);
              
               for(var i=0; i<resultsRange.length; i++){
                
                 var id = resultsRange[i].getValue({
                   name: "internalid",
                   label: "Internal ID"
                 });
                 
                  var tracking_number = resultsRange[i].getValue({
                   name: "custrecord_pacejet_package_tracking",
                  label: "Tracking Number"
                 });
                 
                   var curr_rec = record.load({
                         type: 'customrecord_pacejet_package_info',
                         id: id,
                         isDynamic: true
                  });
                 
                
                // Get Tracking Status
                Auth_Headers['Content-Type'] = 'application/json';
                Auth_Headers['Authorization'] = auth_token;
                Auth_Headers['Content-Length'] = '0';
                Auth_Headers['Host'] = '<calculated when request is sent>';
                Auth_Headers['User-Agent'] = 'PostmanRuntime/7.28.4';
                Auth_Headers['Accept'] = '*/*';
                Auth_Headers['Accept-Encoding'] = 'gzip, deflate, br';
                Auth_Headers['Connection'] = 'keep-alive';

                var track_status_body = {
                    "includeDetailedScans": true,
                    "trackingInfo": [{ // - 285909110949
                        "trackingNumberInfo": {
                            "trackingNumber": tracking_number,
                            "carrierCode": "FDXE"
                        }
                    }]
                }


                var track_status_response = https.request({
                    method: https.Method.POST,
                    url: 'https://apis.fedex.com/track/v1/trackingnumbers',
                    body: JSON.stringify(track_status_body),
                    headers: Auth_Headers
                });

                 var status = JSON.parse(track_status_response.body).output.completeTrackResults[0].trackResults[0].latestStatusDetail.statusByLocale

                curr_rec.setValue({
                  fieldId: 'custrecord_tracking_status',
                  value: status
                });

                 curr_rec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });
			
               }


            } catch (e) {
                log.error({
                    title: "Error",
                    details: e
                });

            }
        }
        return {
            execute: Fedex_Tracking_Status
        };
    });
