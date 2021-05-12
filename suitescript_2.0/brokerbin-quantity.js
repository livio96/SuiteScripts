/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function beforeSubmit(context) {

            var newRecord = context.newRecord;
            var name = newRecord.getValue({
                fieldId: 'itemid'
            });
            var internal_id = newRecord.getValue({
                fieldId: 'internalid'
            });
            var qty_available_A = format.parse({
                value: 0,
                type: format.Type.INTEGER
            });
            var qty_available_24P = format.parse({
                value: 0,
                type: format.Type.INTEGER
            });
            var smart_vendor_qty = format.parse({
                value: 0,
                type: format.Type.INTEGER
            });


            var inventoryitemSearchObj = search.create({
                type: "item",
                filters: [
                    ["isinactive", "is", "F"],
                    "AND",
                    ["name", "doesnotcontain", "-Parent"],
                    "AND",
                    ["name", "is", name],
                    "AND",
                    ["inventorylocation", "anyof", "27", "1"]
                ],
                columns: [
                    search.createColumn({
                        name: "itemid",
                        summary: "GROUP",
                        label: "Name"
                    }),
                    search.createColumn({
                        name: "locationquantityavailable",
                        summary: "AVG",
                        label: "Location Available"
                    }),
                    search.createColumn({
                        name: "inventorylocation",
                        summary: "GROUP",
                        label: "Inventory Location"
                    })
                ]
            });
            var results = inventoryitemSearchObj.run();
            var resultsRange = results.getRange(0, 1000);

            if (resultsRange.length > 0) {

                qty_available_A = resultsRange[0].getValue({
                    name: 'locationquantityavailable',
                    summary: 'AVG'
                });
                if (qty_available_A === null || qty_available_A === '') {
                    qty_available_A = 0;
                    qty_available_A = format.parse({
                        value: qty_available_A,
                        type: format.Type.INTEGER
                    })
                }
            }

            if (resultsRange.length > 1) {
                qty_available_24P = resultsRange[1].getValue({
                    name: 'locationquantityavailable',
                    summary: 'AVG'
                });

                if (qty_available_24P === null || qty_available_24P === '') {
                    qty_available_24P = 0;
                    qty_available_24P = format.parse({
                        value: qty_available_24P,
                        type: format.Type.INTEGER
                    })
                }

            }

            var customrecord_awa_vendor_info_itemsSearchObj = search.create({
                type: "customrecord_awa_vendor_info_items",
                filters: [
                    ["isinactive", "is", "F"],
                    "AND",
                    ["custrecord_vifi_item", "anyof", internal_id]
                ],
                columns: [
                    search.createColumn({
                        name: "custrecord_vifi_quantity",
                        summary: "SUM",
                        label: "Quantity"
                    }),
                          search.createColumn({
                 name: "custrecord_1_week_quantity",
                 summary: "MAX",
                 label: "1 Week Available Quantity"
              }),
              search.createColumn({
                 name: "custrecord4_weeks_quantity",
                 summary: "MAX",
                 label: "4 Weeks Available Quantity"
              })
                ]
            });


            var smart_vendor_results = customrecord_awa_vendor_info_itemsSearchObj.run();
            var smart_vendor_results_range = smart_vendor_results.getRange(0, 1000);


            if (smart_vendor_results_range.length > 0) {
                smart_vendor_qty = smart_vendor_results_range[0].getValue({
                    name: 'custrecord_vifi_quantity',
                    summary: 'SUM'
                });
              
               var smart_vendor_qty_1_week = smart_vendor_results_range[0].getValue({
                    name: 'custrecord_1_week_quantity',
                    summary: 'SUM'
                });
              
               var smart_vendor_qty_4_week = smart_vendor_results_range[0].getValue({
                    name: 'custrecord4_weeks_quantity',
                    summary: 'SUM'
                });
                


                if (smart_vendor_qty === null || smart_vendor_qty === '') {
                    smart_vendor_qty = 0;
                    smart_vendor_qty = format.parse({
                        value: smart_vendor_qty,
                        type: format.Type.INTEGER
                    })
                }
              
              if (smart_vendor_qty_1_week === null || smart_vendor_qty_1_week === '') {
                    smart_vendor_qty_1_week = 0;
                    smart_vendor_qty_1_week = format.parse({
                        value: smart_vendor_qty_1_week,
                        type: format.Type.INTEGER
                    })
                }
              
              if (smart_vendor_qty_4_week === null || smart_vendor_qty_4_week === '') {
                    smart_vendor_qty_4_week = 0;
                    smart_vendor_qty_4_week = format.parse({
                        value:   smart_vendor_qty_4_week,
                        type: format.Type.INTEGER
                    })
                }

            }
          
          
  
           
           

            var brokerbin_qty = format.parse({
                        value: smart_vendor_qty,
                        type: format.Type.INTEGER
                    }) + format.parse({
                        value: qty_available_A,
                        type: format.Type.INTEGER
                    })+ format.parse({
                        value: qty_available_24P,
                        type: format.Type.INTEGER
                    }) + format.parse({
                        value: smart_vendor_qty_1_week,
                        type: format.Type.INTEGER
                    })+ format.parse({
                        value: smart_vendor_qty_4_week,
                        type: format.Type.INTEGER
                    })
            
          
             newRecord.setValue({
               fieldId: 'custitem_brokerbin_quantity', 
               value: brokerbin_qty
             })
        
        }


        return {
            beforeSubmit: beforeSubmit,
        };

    });