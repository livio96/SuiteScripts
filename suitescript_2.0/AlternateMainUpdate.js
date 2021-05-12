/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/search','N/ui/serverWidget','N/https','N/runtime','N/record', 'N/log'],
    function(search, serverWidget, https, runtime, record, log) {
        function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var item = newRecord.getValue({
                fieldId: 'custrecord_bbl_item'
            })
            var listingType = newRecord.getValue({
                fieldId: 'custrecord_bbl_main_listing'
            });

            if (item != null && item != '' && item != undefined){
                if (listingType === '3') {
                    var bblSearch = search.create({
                        type: "item",
                        filters:
                            [
                                ["isinactive","is","F"],
                                "AND",
                                ["custrecord_bbl_item.custrecord_bbl_main_listing","anyof","1"],
                                "AND",
                                ["internalid","anyof", item]
                            ],
                        columns:
                            [
                                search.createColumn({name: "itemid", label: "Name"}),
                                search.createColumn({
                                    name: "custrecord_bbl_update_brokerbin_price",
                                    join: "CUSTRECORD_BBL_ITEM",
                                    label: "Update BrokerBin Price (15 min)"
                                }),
                                search.createColumn({
                                    name: "custrecord_bbl_brokerbin_description",
                                    join: "CUSTRECORD_BBL_ITEM",
                                    label: "BrokerBin Description (Max 64 Chars)"
                                }),
                              	search.createColumn({
         							name: "custrecord_bbl_current_brokerbin_price",
         							join: "CUSTRECORD_BBL_ITEM",
         							label: "Current BrokerBin Price"
      							})
                            ]
                    });

                    var lines = bblSearch.run();
                    var lines_range = lines.getRange(0, 1);

                    if(lines_range.length > 0) {
                        var price = lines_range[0].getValue({
                            name: "custrecord_bbl_update_brokerbin_price",
                            join: "CUSTRECORD_BBL_ITEM",
                            label: "Update BrokerBin Price (15 min)"
                        });

                        var desc = lines_range[0].getValue({
                            name: "custrecord_bbl_brokerbin_description",
                            join: "CUSTRECORD_BBL_ITEM",
                            label: "BrokerBin Description (Max 64 Chars)"
                        });
                      	
                      	var curPrice = lines_range[0].getValue({
                          	name: "custrecord_bbl_current_brokerbin_price",
         					join: "CUSTRECORD_BBL_ITEM",
         					label: "Current BrokerBin Price"
                        });

                        newRecord.setValue({
                            fieldId: 'custrecord_bbl_update_brokerbin_price',
                            value: price
                        })

                        newRecord.setValue({
                            fieldId: 'custrecord_bbl_brokerbin_description',
                            value: desc
                        })
						
                      	newRecord.setValue({
                          	fieldId: 'custrecord_bbl_current_brokerbin_price',
                          	value: curPrice
                        })
                    }

                }
            }
        }
        return {
            beforeSubmit: beforeSubmit
        };
    });