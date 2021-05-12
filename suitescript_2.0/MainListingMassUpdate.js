/**
 *@NApiVersion 2.0
 *@NScriptType MassUpdateScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {

        function each(params) {

            var newRecord = record.load({
                type: params.type,
                id: params.id
            });

            var part_number = newRecord.getValue({
                fieldId: 'custrecord_bbl_brokerbin_part_number'
            });

            var main_listing = newRecord.getValue({
                fieldId: 'custrecord_bbl_main_listing'
            });

            var item = newRecord.getValue({
                fieldId: 'custrecord_bbl_item'
            });
            log.debug({
                title: 'test',
                details: main_listing
            })
            log.debug({
                title: 'test',
                details: item
            })
            if (main_listing === '1' && item != '') {

                var customrecord_bblSearchObj = search.create({
                    type: "customrecord_bbl",
                    filters: [
                        ["custrecord_bbl_item", "anyof", item],
                        "AND",
                        ["custrecord_bbl_item.inventorylocation", "anyof", "1", "27"]
                    ],
                    columns: [
                        search.createColumn({
                            name: "custrecord_bbl_item",
                            summary: "GROUP",
                            label: "Item"
                        }),
                        search.createColumn({
                            name: "locationquantityavailable",
                            join: "CUSTRECORD_BBL_ITEM",
                            summary: "SUM",
                            label: "Location Available"
                        })
                    ]
                });

                var results2 = customrecord_bblSearchObj.run();
                var results_range2 = results2.getRange(0, 1000);

                if (results_range2.length > 0) {
                    var available = results_range2[0].getValue({
                        name: "locationquantityavailable",
                        join: "CUSTRECORD_BBL_ITEM",
                        summary: "SUM"
                    });
                }

                if (available == null || available == '') {
                    available = 0;
                    available = format.parse({
                        value: available,
                        type: format.Type.INTEGER
                    })
                }


                log.debug({
                    title: 'available',
                    details: available
                });

                var customrecord_awa_vendor_info_itemsSearchObj = search.create({
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


                var results = customrecord_awa_vendor_info_itemsSearchObj.run();
                var results_range = results.getRange(0, 1000);

                if (results_range.length > 0) {

                    var quantity = results_range[0].getValue({
                        name: "custrecord_vifi_quantity",
                        summary: "SUM",
                    });

                    var quantity_1_week = results_range[0].getValue({
                        name: "custrecord_1_week_quantity",
                        summary: "MAX",
                    });

                    var quantity_4_weeks = results_range[0].getValue({
                        name: "custrecord4_weeks_quantity",
                        summary: "MAX"
                    });


                    if (quantity === null || quantity === '') {
                        quantity = 0;
                        quantity = format.parse({
                            value: quantity,
                            type: format.Type.INTEGER
                        })
                    }

                    if (quantity_1_week === null || quantity_1_week === '') {
                        quantity_1_week = 0;
                        quantity_1_week = format.parse({
                            value: quantity_1_week,
                            type: format.Type.INTEGER
                        })
                    }

                    if (quantity_4_weeks === null || quantity_4_weeks === '') {
                        quantity_4_weeks = 0;
                        quantity_4_weeks = format.parse({
                            value: quantity_4_weeks,
                            type: format.Type.INTEGER
                        })
                    }

                    log.debug({
                        title: '4',
                        details: quantity_4_weeks
                    })

                    log.debug({
                        title: '1',
                        details: quantity_4_weeks
                    })

                    log.debug({
                        title: 'ava',
                        details: available
                    })

                    log.debug({
                        title: 'qty',
                        details: quantity
                    })

                    var brokerbin_qty = format.parse({
                        value: quantity_4_weeks,
                        type: format.Type.INTEGER
                    }) + format.parse({
                        value: quantity_1_week,
                        type: format.Type.INTEGER
                    }) + format.parse({
                        value: quantity,
                        type: format.Type.INTEGER
                    }) + format.parse({
                        value: available,
                        type: format.Type.INTEGER
                    })

                    log.debug({
                        title: 'Log',
                        details: brokerbin_qty
                    })

                    newRecord.setValue('custrecord_bbl_listed_brokerbin_quantity', 33)
                  
                 	newRecord.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    })
                }

            }
        }

        return {
            each: each
        };

    });