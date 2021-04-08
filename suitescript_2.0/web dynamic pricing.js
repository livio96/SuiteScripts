/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {

        function beforeSubmit(context) {

            try {
                var newRecord = context.newRecord;


                var item_id = newRecord.getValue({
                    fieldId: 'itemid'
                });
                var webstore_pricing_rule = newRecord.getValue({
                    fieldId: 'custitem_website_pricing_rules'
                });


  

                //if Match Amazon Price
                if (webstore_pricing_rule === '2') {
                    var itemSearchObj = search.create({
                        type: "item",
                        filters: [
                            ["isinactive", "is", "F"],
                            "AND",
                            ["name", "contains", item_id]
                        ],
                        columns: [
                            search.createColumn({
                                name: "itemid",
                                summary: "GROUP",
                                label: "Name"
                            }),
                            search.createColumn({
                                name: "custrecordamazon_price_30_days",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "Amazon Price (Average 30 Days)"
                            }),
                            search.createColumn({
                                name: "custrecord19",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "Amazon Price (Average 7 Days)"
                            }),
                            search.createColumn({
                                name: "custrecord_so_rate_30_days",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "SO Rate (30 Days)"
                            }),
                            search.createColumn({
                                name: "custrecordso_rate_7_days",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "SO Rate (7 Days)"
                            })
                        ]
                    });

                    var searchResults = itemSearchObj.run();
                    var searchResultsRange = searchResults.getRange(0, 1000);

                    var amazon_7_days = searchResultsRange[0].getValue({
                        name: "custrecord19",
                        join: "CUSTRECORD17",
                        summary: "GROUP"
                    });
                    var amazon_30_days = searchResultsRange[0].getValue({
                        name: "custrecordamazon_price_30_days",
                        join: "CUSTRECORD17",
                        summary: "GROUP"
                    });

                    amazon_7_days = format.parse({
                        value: amazon_7_days,
                        type: format.Type.INTEGER
                    });
                    amazon_30_days = format.parse({
                        value: amazon_30_days,
                        type: format.Type.INTEGER
                    });

                    var set_price = 'false';
                    if (amazon_7_days > 0) {
                        set_price = 'true';
                        newRecord.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 2,
                            value: amazon_7_days - 0.01
                        });
                    }
                    if (set_price === 'false' && amazon_30_days > 0) {

                        newRecord.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 2,
                            value: amazon_30_days - 0.01
                        });
                    }



                }
                // if match ebay price
                if (webstore_pricing_rule === '3') {
                    var itemSearchObj = search.create({
                        type: "item",
                        filters: [
                            ["isinactive", "is", "F"],
                            "AND",
                            ["name", "contains", item_id]
                        ],
                        columns: [
                            search.createColumn({
                                name: "itemid",
                                summary: "GROUP",
                                label: "Name"
                            }),
                            search.createColumn({
                                name: "custrecord_ebay_price_7_days",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "Ebay Price (Average 7 Days)"
                            }),
                            search.createColumn({
                                name: "custrecordebay_price_30_days",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "Ebay Price (Average 30 Days)"
                            })


                        ]
                    });

                    var searchResults3 = itemSearchObj.run();
                    var searchResultsRange3 = searchResults3.getRange(0, 1000);

                    var ebay_7_days = searchResultsRange3[0].getValue({
                        name: "custrecord_ebay_price_7_days",
                        join: "CUSTRECORD17",
                        summary: "GROUP"
                    });
                    var ebay_30_days = searchResultsRange3[0].getValue({
                        name: "custrecordebay_price_30_days",
                        join: "CUSTRECORD17",
                        summary: "GROUP"
                    });

                    ebay_7_days = format.parse({
                        value: ebay_7_days,
                        type: format.Type.INTEGER
                    });
                    ebay_30_days = format.parse({
                        value: ebay_30_days,
                        type: format.Type.INTEGER
                    });

                    var set_price = 'false';
                    if (ebay_7_days > 0) {
                        set_price = 'true';
                        newRecord.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 2,
                            value: ebay_7_days - 0.01
                        });
                    }
                    if (set_price === 'false' && ebay_30_days > 0) {

                        newRecord.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 2,
                            value: ebay_30_days - 0.01
                        });
                    }


                }
                //if Match TQ SO Rate 
                if (webstore_pricing_rule === '4') {
                    var itemSearchObj = search.create({
                        type: "item",
                        filters: [
                            ["isinactive", "is", "F"],
                            "AND",
                            ["name", "contains", item_id]
                        ],
                        columns: [
                            search.createColumn({
                                name: "itemid",
                                summary: "GROUP",
                                label: "Name"
                            }),
                            search.createColumn({
                                name: "custrecord_so_rate_30_days",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "SO Rate (30 Days)"
                            }),
                            search.createColumn({
                                name: "custrecordso_rate_7_days",
                                join: "CUSTRECORD17",
                                summary: "GROUP",
                                label: "SO Rate (7 Days)"
                            })
                        ]
                    });

                    var searchResults2 = itemSearchObj.run();
                    var searchResultsRange2 = searchResults2.getRange(0, 1000);

                    var so_rate_7_days = searchResultsRange2[0].getValue({
                        name: "custrecordso_rate_7_days",
                        join: "CUSTRECORD17",
                        summary: "GROUP"
                    });
                    var so_rate_30_days = searchResultsRange2[0].getValue({
                        name: "custrecord_so_rate_30_days",
                        join: "CUSTRECORD17",
                        summary: "GROUP"
                    });
                    var set_price = 'false';
                    if (so_rate_7_days > 0) {
                        set_price = 'true';
                        newRecord.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 2,
                            value: so_rate_7_days - 0.01
                        });
                    }
                    if (set_price === 'false' && so_rate_30_days > 0) {
                        newRecord.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 2,
                            value: so_rate_30_days - 0.01
                        });
                    }


                }



            } catch (e) {
                log.debug({
                    title: 'Error',
                    details: 'Error'
                });
            }

        }


        return {
            beforeSubmit: beforeSubmit,
        };

    });
