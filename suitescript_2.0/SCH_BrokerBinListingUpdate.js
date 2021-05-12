/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/task', 'N/log'],
    function(render, search, record, email, runtime, task, log){
        function updateBrokerbinListings(context){


           log.debug({
              title: 'Testing1', 
              details: 'triggered1'
            });

var customrecord_bblSearchObj = search.create({
   type: "customrecord_bbl",
   filters:
   [
      ["custrecord_bbl_list_on_brokerbin","is","T"], 
      "AND", 
      ["custrecord_bbl_approval","noneof","2"], 
      "AND", 
      ["custrecord_bbl_item","anyof","74307","21865","157052","234374"]
   ],
   columns:
   [
      search.createColumn({name: "internalid", label:"internalid"})
   ]
});

            var results = customrecord_bblSearchObj.run(); 
            var results_range = results.getRange(0,1000) ; 
          
           if(results_range.length>0){
            for (var i=0 ; i<results_range.length; i++){
                var internal_id = results_range[i].getValue({
                    name: 'internalid'
                });

            log.debug({
              title: 'Testing', 
              details: 'triggered'
            });
                var bb_listing_rec = record.load({
                    type: 'customrecord_bbl',
                    id: internal_id,
                    isDynamic: true
                });

               
              
              var update_bb_listing_price = bb_listing_rec.getValue({
                    fieldId: 'custrecord_bbl_update_brokerbin_price'
                });
              
               if(update_bb_listing_price === 'null' || update_bb_listing_price === ''){
                  bb_listing_rec.setValue({
                    fieldId: 'custrecord_bbl_current_brokerbin_price',
                    value: 'itworks'
                });
               }
               else{
                  bb_listing_rec.setValue({
                    fieldId: 'custrecord_bbl_current_brokerbin_price',
                    value: update_bb_listing_price
                });
                 
               }

                bb_listing_rec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

            }

           }



        }
        return {
            execute: updateBrokerbinListings
        };
    });