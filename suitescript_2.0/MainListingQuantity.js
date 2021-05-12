/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {

        function beforeSubmit(context) {
//custrecord_bbl_manual_override
            var newRecord = context.newRecord;
            var part_number = newRecord.getValue({
                fieldId: 'custrecord_bbl_brokerbin_part_number'
            });
            var main_listing = newRecord.getValue({
                fieldId: 'custrecord_bbl_main_listing'
            });
            var item = newRecord.getValue({
                fieldId: 'custrecord_bbl_item'
            });
            var override = newRecord.getValue('custrecord_bbl_manual_override');
            
            if ((main_listing === '1' || main_listing === '3') && item != '') {
              if (override == false) {
               var itemSearchObj = search.create({
                 type: "item",
                 filters:
                 [
                    ["inventorylocation","anyof","1","27"], 
                    "AND", 
                    ["internalid","anyof",item]
                 ],
                 columns:
                 [
                    search.createColumn({
                       name: "itemid",
                       summary: "GROUP",
                       label: "Name"
                    }),
                    search.createColumn({
                       name: "locationquantityavailable",
                       summary: "SUM",
                       label: "Location Available"
                    })
                 ]
              });

                var results2 = itemSearchObj.run();
                var results_range2 = results2.getRange(0, 1000);

                if (results_range2.length > 0) {
                    var available = results_range2[0].getValue({
                         name: "locationquantityavailable",
         			           summary: "SUM",
         				         label: "Location Available"
                    });
                }

                if (available == null || available == '') {
                    available = 0;
                    available = format.parse({
                        value: available,
                        type: format.Type.INTEGER
                    })
                }

                  
                    newRecord.setValue({
                      fieldId: 'custrecord_bbl_listed_brokerbin_quantity',
                      value: available
                    })
                  
                  log.debug({
                    title: 'test',
                    details: available
                  })
                
                }
              }
            }
        return {
            beforeSubmit: beforeSubmit,
        };
});