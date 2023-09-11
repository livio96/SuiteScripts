/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function afterSubmit(context) {

            try {
                var newRecord = context.newRecord;
                var tracking_number = newRecord.getValue({
                    fieldId: 'custrecord_aro_fulfilment'
                });

                var transfer_order_created = newRecord.getValue({
                  fieldId: 'custrecord_transfer_order_created'
                });

                var removal_order_id = newRecord.getValue({
                    fieldId: 'custrecord_aro_id'
                });
                if(transfer_order_created == false){
                var customrecord_aroSearchObj = search.create({
                    type: "customrecord_aro",
                    filters: [
                        ["custrecord_aro_fulfilment", "anyof", tracking_number],
                        "AND",
                        ["custrecord_aro_transfer_order", "anyof", "@NONE@"]
                    ],
                    columns: [
                        search.createColumn({
                            name: "internalid",
                            label: "Internal ID"
                        }),
                        search.createColumn({
                            name: "custrecord_aro_item_fnsku",
                            join: "CUSTRECORD_ARO_ITEM_REMOVAL_ORDER",
                            label: "FNSKU"
                        }),
                        search.createColumn({
                            name: "custrecord_aro_item_quantity",
                            join: "CUSTRECORD_ARO_ITEM_REMOVAL_ORDER",
                            label: "Quantity"
                        }),
                        search.createColumn({
                            name: "internalid",
                            label: "Internal ID"
                        })
                    ]
                });

                var results = customrecord_aroSearchObj.run();
                var results_range = results.getRange(0, 100);

                var transferOrder = record.create({
                    type: record.Type.TRANSFER_ORDER,
                    isDynamic: true
                });


                transferOrder.setValue({
                    fieldId: 'subsidiary',
                    value: '1'
                });



                transferOrder.setValue({
                    fieldId: 'custbody_cps_fba_shipment_id',
                    value: removal_order_id
                });

                transferOrder.setValue({
                    fieldId: 'custbody_cps_fba_removal_order_id',
                    value: removal_order_id
                });



                transferOrder.setValue({
                    fieldId: 'transferlocation',
                    value: '1'
                });



                transferOrder.setValue({
                    fieldId: 'memo',
                    value: removal_order_id
                });

                transferOrder.setValue({
                    fieldId: 'custbody_aro_fulfilment',
                    value: tracking_number
                });

                for (var i = 0; i < results_range.length; i++) {

                    var item_fnsku = results_range[i].getValue({
                        name: "custrecord_aro_item_fnsku",
                        join: "CUSTRECORD_ARO_ITEM_REMOVAL_ORDER",
                        label: "FNSKU"
                    });
                    var record_internal_id = results_range[i].getValue({
                        name: "internalid",
                        label: "Internal ID"
                    });

                    log.debug('item_fnsku', item_fnsku);

                    var customrecord_celigo_etail_item_aliasSearchObj = search.create({
                        type: "customrecord_celigo_etail_item_alias",
                        filters: [
                            ["isinactive", "is", "F"],
                            "AND",
                            ["custrecord_fnsku", "contains", item_fnsku]
                        ],
                        columns: [
                            search.createColumn({
                                name: "custrecord_celigo_etail_alias_par_item",
                                label: "Parent Item"
                            }),
                            search.createColumn({
                                name: "internalid",
                                join: "CUSTRECORD_CELIGO_ETAIL_ALIAS_PAR_ITEM",
                                label: "Internal ID"
                            }),
                            search.createColumn({
                                name: "custrecord_celigo_etail_alias_amz_acc",
                                label: "Amazon Accounts"
                            })
                        ]
                    });

                    var results2 = customrecord_celigo_etail_item_aliasSearchObj.run();
                    var results_range2 = results2.getRange(0, 1);

                    var item = results_range2[0].getValue({
                        name: "internalid",
                        join: "CUSTRECORD_CELIGO_ETAIL_ALIAS_PAR_ITEM",
                        label: "Internal ID"
                    });

                    var amazon_account = results_range2[0].getValue({
                        name: "custrecord_celigo_etail_alias_amz_acc",
                        label: "Amazon Accounts"
                    });

                    if (amazon_account == 1) {
                        transferOrder.setValue({
                            fieldId: 'location',
                            value: '22'
                        });
                    }
                    if (amazon_account == 101) {
                        transferOrder.setValue({
                            fieldId: 'location',
                            value: '23'
                        });
                    }
                    if (amazon_account == 201) {
                        transferOrder.setValue({
                            fieldId: 'location',
                            value: '28'
                        });
                    }

                    log.debug('amazon_account', amazon_account);
                    log.debug('item', item);

                    var quantity = results_range[i].getValue({
                        name: "custrecord_aro_item_quantity",
                        join: "CUSTRECORD_ARO_ITEM_REMOVAL_ORDER",
                        label: "Quantity"
                    });


                    transferOrder.selectNewLine({
                        sublistId: 'item'
                    });

                    transferOrder.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        value: item
                    });

                    transferOrder.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: quantity
                    });

                    transferOrder.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'location',
                        value: '2'
                    });

                    transferOrder.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'custcol_fnsku',
                        value: item_fnsku
                    });

                    transferOrder.commitLine({
                        sublistId: 'item'
                    });



                }

                transferOrder.setValue({
                    fieldId: 'orderstatus',
                    value: 'B'
                });

                var transferOrderId = transferOrder.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

                var objRecord = record.load({
                    type: record.Type.TRANSFER_ORDER,
                    id: transferOrderId,
                    isDynamic: true,
                });
                objRecord.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

                var amazon_removal_order_rec = record.load({
                    type: 'customrecord_aro',
                    id: record_internal_id,
                    isDynamic: true
                });

                var amazon_removal_order_rec = record.load({
                    type: 'customrecord_aro',
                    id: record_internal_id,
                    isDynamic: true
                });

                amazon_removal_order_rec.setValue({
                    fieldId: 'custrecord_aro_transfer_order',
                    value: transferOrderId
                });

               amazon_removal_order_rec.setValue({
                 fieldId: 'custrecord_transfer_order_created',
                 value: true
               });

                amazon_removal_order_rec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

                log.debug('transferOrderId', transferOrderId);
                }
            } catch (e) {
                log.debug('error', e);
            }


        }
        return {
            afterSubmit: afterSubmit,
        };

    });