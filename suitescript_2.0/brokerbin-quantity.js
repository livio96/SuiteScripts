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

            //for(var s = 0; s< resultsRange.length; s++){
            var qty_available_A = resultsRange[0].getValue({
                name: 'locationquantityavailable',
                summary: 'AVG'
            });
            var qty_available_24P = resultsRange[1].getValue({
                name: 'locationquantityavailable',
                summary: 'AVG'
            });

            //}

            if (qty_available_A === null || qty_available_A === '') {
                qty_available_A = 0;
                qty_available_A = format.parse({
                    value: qty_available_A,
                    type: format.Type.INTEGER
                })
            }
            if (qty_available_24P === null || qty_available_24P === '') {
                qty_available_24P = 0;
                qty_available_24P = format.parse({
                    value: qty_available_24P,
                    type: format.Type.INTEGER
                })
            }

           
            log.debug({
                title: 'Quantity Availabe A + 24 P',
                details: qty_available_A + qty_available_24P
            })

            var customrecord_awa_vendor_info_itemsSearchObj = search.create({
                type: "customrecord_awa_vendor_info_items",
                filters: [
                    ["isinactive", "is", "F"],
                    "AND",
                    ["custrecord_vifi_item", "anyof", "14766"]
                ],
                columns: [
                    search.createColumn({
                        name: "custrecord_vifi_quantity",
                        summary: "SUM",
                        label: "Quantity"
                    })
                ]
            });


            var smart_vendor_results = customrecord_awa_vendor_info_itemsSearchObj.run();
            var smart_vendor_results_range = smart_vendor_results.getRange(0, 1000);


            var smart_vendor_qty = smart_vendor_results_range[0].getValue({
                name: 'custrecord_vifi_quantity',
                summary: 'SUM'
            });
            
          
           if (smart_vendor_qty === null || smart_vendor_qty === '') {
                smart_vendor_qty = 0;
                smart_vendor_qty = format.parse({
                    value: smart_vendor_qty,
                    type: format.Type.INTEGER
                })
            }
          
          log.debug({
                title: 'Quantity Smart Vendor',
                details: smart_vendor_qty
            })

          newRecord.setValue({fieldId:'custitem_brokerbin_quantity', value: smart_vendor_qty + qty_available_A + qty_available_24P})

        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });