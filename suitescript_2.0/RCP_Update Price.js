/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */

/*General Comments */
/*Update Brokerbin Price when record is approved */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {

        function ApprovePriceChange(context) {

          try{
            var newRecord = context.newRecord;

            var marketplace = newRecord.getValue({
                fieldId: 'custrecord_marketplace'
            });
          
            var price = newRecord.getValue({
              fieldId: 'custrecord_price'
            });

            var condition = newRecord.getValue({
                fieldId: 'custrecord_condition'
            });

            //if marketplace is brokerbin
            if (marketplace == '1') {
                var item = newRecord.getValue({
                    fieldId: 'custrecord_part_number_text'
                });

                //get item internal id
                var itemSearchObj = search.create({
                    type: "item",
                    filters: [
                        ["isinactive", "is", "F"],
                        "AND",
                        ["name", "contains", item],
                        "AND",
                        ["custitem_awa_condition", "anyof", condition]
                    ],
                    columns: [
                        search.createColumn({
                            name: "internalid",
                            summary: "GROUP",
                            label: "Internal ID"
                        })
                    ]
                });
                var results = itemSearchObj.run();
                var results_range = results.getRange(0, 100);

                if (results_range.length > 0) {
                    var item_id = results_range[0].getValue({
                        name: "internalid",
                        summary: "GROUP"
                    });
                  
                

                    newRecord.setValue({
                        fieldId: 'custrecord_part_number',
                        value: item_id
                    })
                }
              
              
              //Update Brokerbin Listing Price
              var customrecord_bblSearchObj = search.create({
   type: "customrecord_bbl",
   filters:
   [
      ["custrecord_bbl_item.internalid","anyof",item_id]
   ],
   columns:
   [
      search.createColumn({
         name: "internalid",
         summary: "GROUP",
         label: "Internal ID"
      })
   ]
});
               var results1 = customrecord_bblSearchObj.run();
                var results_range1 = results1.getRange(0, 100);
              
              var brokerbin_listing_id = results_range1[0].getValue({
                 name: "internalid",
         		summary: "GROUP"
              });
              
               log.debug({
                 title: 'bb id', 
                 details: brokerbin_listing_id
               });
              
                 var bb_record = record.load({
    			type: 'customrecord_bbl',
      			 id: brokerbin_listing_id,
      			 isDynamic: true                       
  				 });

              	bb_record.setValue({
                  fieldId: 'custrecord_bbl_update_brokerbin_price', 
                  value: price
                }); 
              
               var recordId = bb_record.save({
    			enableSourcing: true,
   			   ignoreMandatoryFields: true
			   });
            }
          }
            catch(e){
              log.debug({
                title:'error', 
                details: 'Error!'
              })
            }
            




        }




        return {
            onAction: ApprovePriceChange,
        };

    });