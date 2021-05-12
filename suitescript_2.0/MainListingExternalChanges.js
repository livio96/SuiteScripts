/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/search','N/ui/serverWidget','N/https','N/runtime','N/record', 'N/log'],
    function(search, serverWidget, https, runtime, record, log)
    {
        function afterSubmit(context) {
            try {
                var newRecord = context.newRecord;
                var item = newRecord.getValue({fieldId: 'custrecord_bbl_item'})

                if(item != '' && item != null && item != undefined){
                    var brokerBinPrice = newRecord.getValue({
                        fieldId: 'custrecord_bbl_update_brokerbin_price'
                    });

                    var listingType = newRecord.getValue({
                        fieldId: 'custrecord_bbl_main_listing'
                    });

                    var item_rec = record.load({
                        type: 'inventoryitem',
                        id: item
                    });

                    if(brokerBinPrice != null && brokerBinPrice != '' && brokerBinPrice != undefined && brokerBinPrice > 0 && listingType === '1'){
                        brokerBinPrice = brokerBinPrice-.01

                        var customrecord_bblSearchObj = search.create({
                            type: "customrecord_bbl",
                            filters:
                                [
                                    ["custrecord_bbl_list_on_brokerbin","is","T"],
                                    "AND",
                                    ["custrecord_bbl_approval","anyof","1"],
                                    "AND",
                                    ["isinactive","is","F"],
                                    "AND",
                                    ["custrecord_bbl_item.internalid","anyof",item]
                                ],
                            columns:
                                [
                                    search.createColumn({
                                        name: "custrecord_bbl_item",
                                        summary: "GROUP",
                                        label: "Item"
                                    }),
                                    search.createColumn({
                                        name: "formuladate",
                                        summary: "MAX",
                                        formula: "case when {systemnotes.field} = 'Update BrokerBin Price (15 min)' and {custrecord_bbl_main_listing} = 'Main' then {systemnotes.date} else null end",
                                        label: "Last Price Update"
                                    })
                                ]
                        });

                        var lines = customrecord_bblSearchObj.run();
                        var lines_range = lines.getRange(0, 1);

                        if (lines_range.length > 0){
                            var date = lines_range[0].getValue({
                                name: "formuladate",
                                summary: "MAX",
                                formula: "case when {systemnotes.field} = 'Update BrokerBin Price (15 min)' and {custrecord_bbl_main_listing} = 'Main' then {systemnotes.date} else null end",
                                label: "Last Price Update"
                            })

                            log.debug({
                                title: 'value',
                                details: date
                            })

                            item_rec.setValue({
                                fieldId: 'custitem_bbl_listing_price_change',
                                value: date
                            })

                        }

                        item_rec.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 1,
                            value: brokerBinPrice
                        });

                        item_rec.setValue({
                            fieldId: 'custitem_brokerbin_price',
                            value: brokerBinPrice
                        })

                        item_rec.save({
                            ignoreMandatoryFields: true,
                            enableSourcing: true
                        });
                    }

                    else if ((brokerBinPrice === null || brokerBinPrice === '' || brokerBinPrice === undefined || brokerBinPrice === 0) && listingType === '1') {
                        item_rec.setValue({
                            fieldId: 'custitem_brokerbin_price',
                            value: null
                        })

                        item_rec.setValue({
                            fieldId: 'custitem_bbl_listing_price_change',
                            value: null
                        })

                        item_rec.setSublistValue({
                            sublistId: 'price1',
                            fieldId: 'price_1_',
                            line: 1,
                            value: null
                        });

                        item_rec.save({
                            ignoreMandatoryFields: true,
                            enableSourcing: true
                        })
                    }
                }
            }
            catch(err){
                log.debug('Err @ afterSubmit', err)
            }

        };
        return {
            afterSubmit: afterSubmit
        };

    });