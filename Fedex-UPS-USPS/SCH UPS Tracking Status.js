/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
 define(["N/search", "N/record", "N/email", "N/runtime", "N/https", "N/format"],
 function(search, record, email, runtime, https, format) {
     function UPS_Tracking_Status(context) {
         try {
           
             var api_key = '4DAA2104CBB8D475'; 
            
             //Run a search 

             var customrecord_pacejet_package_infoSearchObj = search.create({
                 type: "customrecord_pacejet_package_info",
                 filters: [
                   [["created", "on", "today"],
                     "AND",
                     ["custrecord_pacejet_transaction_link.shipmethod","anyof","89082","242573","186628","137303","137302","137301","137304"],"AND",["custrecord_pacejet_transaction_link.type","anyof","ItemShip"]],
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

               

              
               var endpoint = 'https://onlinetools.ups.com/track/v1/details/'+ tracking_number + '?locale=en_US';
             var Auth_Headers = [];
             // Get Tracking Status
             Auth_Headers['Content-Type'] = 'application/json';
             Auth_Headers['Content-Length'] = '0';
             Auth_Headers['Host'] = '<calculated when request is sent>';
             Auth_Headers['User-Agent'] = 'PostmanRuntime/7.28.4';
             Auth_Headers['Accept'] = '*/*';
             Auth_Headers['Accept-Encoding'] = 'gzip, deflate, br';
             Auth_Headers['Connection'] = 'keep-alive';
             Auth_Headers['Accept'] = 'application/json'
             Auth_Headers['transId'] = '123456'
             Auth_Headers['transactionSrc'] = 'ProductionSrc'
             Auth_Headers['AccessLicenseNumber'] = api_key;

             var track_status_response = https.request({
                 method: https.Method.GET,
                 url: endpoint,
                 headers: Auth_Headers
             });

             // var status = track_status_response.trackResponse.shipment[0].package[0].activity[2].status.description;
            
              
              var status = JSON.parse(track_status_response.body).trackResponse.shipment[0].package[0].activity[0].status.description;
              log.debug({
               title: 'track_status_response',
               details: status
             })
              
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
         execute: UPS_Tracking_Status
     };
 });
