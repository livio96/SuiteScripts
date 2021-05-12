/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {

        function beforeSubmit(context) {

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
            if ((main_listing === '5') && item != '') {
                var vendorStockSearch = search.create({
                    type: "customrecord_awa_vendor_info_items",
                    filters: [
                        ["isinactive", "is", "F"],
                        "AND",
                        ["custrecord_vifi_item", "anyof", item]
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

                var results2 = vendorStockSearch.run();
                var results_range2 = results2.getRange(0, 1000);

                if (results_range2.length > 0) {
                    var quantity = results_range2[0].getValue({
                      name: "custrecord_vifi_quantity",
                      summary: "SUM",
                      label: "Quantity"
                    });

                    var quantity_1_week = results_range2[0].getValue({
                      name: "custrecord_1_week_quantity",
                      summary: "MAX",
                      label: "1 Week Available Quantity"
                    })

                    var quantity_4_weeks = results_range2[0].getValue({
                      name: "custrecord4_weeks_quantity",
                      summary: "MAX",
                      label: "4 Weeks Available Quantity"
                    })
                }

                if (quantity == null || quantity == ''){
                    quantity = 0;
                }
              	if (quantity_1_week == null || quantity_1_week == ''){
                    quantity_1_week = 0;
                }
              	if (quantity_4_weeks == null || quantity_4_weeks == ''){
                    quantity_4_weeks = 0;
                }

                var total = format.parse({
                        value: quantity_4_weeks,
                        type: format.Type.INTEGER
                    }) + format.parse({
                        value: quantity_1_week,
                        type: format.Type.INTEGER
                    }) + format.parse({
                        value: quantity,
                        type: format.Type.INTEGER
                    });

                newRecord.setValue({
                    fieldId: 'custrecord_bbl_listed_brokerbin_quantity',
                    value: total
                })

                log.debug({
                  title: 'test',
                  details: total
                })
              }
            }
        return {
            beforeSubmit: beforeSubmit,
        };
      });
