/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/runtime', 'N/format'],
    function (record, search, runtime, format) {
        function afterSubmitUpdateBBPrice(context) {
            try {
                var i_recordId = context.newRecord.id;
                var s_recordType = context.newRecord.type;
                var o_BB_Obj = record.load({
                    type: s_recordType,
                    id: i_recordId,
                    isDynamic: true,
                });

                var Item = o_BB_Obj.getValue('custrecord_bbl_item');
                var ListingType = o_BB_Obj.getValue('custrecord_bbl_main_listing');
                var brokerBinPrice = o_BB_Obj.getValue({
                    fieldId: 'custrecord_bbl_update_brokerbin_price'
                });
                var reseller_price = o_BB_Obj.getValue({
                      fieldId: 'custrecord_reseller_price'
                  });
                var enduser_price = o_BB_Obj.getValue({
                      fieldId: 'custrecord_enduser_price'
                  });
              
                var ebay_price =  o_BB_Obj.getValue({
                      fieldId: 'custrecord_bb_set_ebay_price'
                  });
                var brokerBinDesc = o_BB_Obj.getValue('custrecord_bbl_brokerbin_description');

                if (Item != null && Item != '' && Item != undefined && ListingType == '1') {
                    var OldRecordObj = context.oldRecord;

                    var OldPrice = OldRecordObj.getValue({
                        fieldId: 'custrecord_bbl_update_brokerbin_price'
                    });

                    if (brokerBinPrice != null && brokerBinPrice != '' && brokerBinPrice != undefined) {

                    }
                    else {
                        brokerBinPrice = 0;
                    }

                    if (OldPrice != null && OldPrice != '' && OldPrice != undefined) {

                    }
                    else {
                        OldPrice = 0;
                    }
                    if (parseFloat(brokerBinPrice) != parseFloat(OldPrice)) {
                        var priceChangeby = runtime.getCurrentUser().id;
                        //var priceChangeby = o_BB_Obj.getValue('custrecord32');
                        var PriceChangeDate = new Date();
                        var FmtChangeDate = format.format({
                            value: PriceChangeDate,
                            type: format.Type.DATE
                        });
                      
                       var  last_price_review = format.parse({
                            value: PriceChangeDate,
                            type: format.Type.DATE
                        });

                        var item_rec = record.load({
                            type: 'inventoryitem',
                            id: Item
                        });

                        var ebayPrice = item_rec.getValue('custitem_set_ebay_price')
                        var neweggPrice = item_rec.getValue('custitem_set_newegg_price')
                        var NEBPrice = item_rec.getValue('custitem_set_newegg_bus_price')
                        var marketArray = [ebayPrice, neweggPrice, NEBPrice]
                        var minMarketPrice = brokerBinPrice * 1.13
                        var channel;
                        var requestsCreated = [];

                        for (i = 0; i < marketArray.length; i++) {
                            if (marketArray[i] != null && marketArray[i] != undefined && marketArray[i] != '') {
                                if (marketArray[i] - minMarketPrice < 0) {
                                    
                                    switch (i) {//select channel
                                        case 0:
                                            channel = 3
                                            break
                                        case 1:
                                            channel = 4
                                            break
                                        case 2:
                                            channel = 8
                                            break
                                    }

                                    var pcrRec = record.create({
                                        type: 'customrecord_price_change_request',
                                        isDynamic: true
                                    });
                                    pcrRec.setValue({
                                        fieldId: 'custrecord_part_number',
                                        value: Item
                                    });
                                    pcrRec.setValue({
                                        fieldId: 'custrecord_comments',
                                        value: 'SYSTEM: BrokerBin Price raised above Marketplace.\r\nRecommended Price set to BrokerBin Price + 13%.'
                                    });
                                    pcrRec.setValue({
                                        fieldId: 'custrecord_requested_by',
                                        value: priceChangeby
                                    });
                                    pcrRec.setValue({
                                        fieldId: 'custrecord_marketplace',
                                        value: channel
                                    });
                                    pcrRec.setValue({
                                        fieldId: 'custrecord_price',
                                        value: minMarketPrice.toFixed(2)
                                    });
                                    var pcrRecID = pcrRec.save({
                                        enableSourcing: true,
                                        ignoreMandatoryFields: true
                                    });
                                    requestsCreated.push(pcrRecID);
                                }
                            }
                        }

                        if (requestsCreated.length > 0){
                            var pcrGroupRec = record.create({
                                type: 'customrecord1838',
                                isDynamic: true
                            });
                            pcrGroupRec.setValue({
                                fieldId: 'custrecord_pcrg_request_by',
                                value: priceChangeby
                            });
                            pcrGroupRec.setValue({
                                fieldId: 'custrecord_pcrg_item',
                                value: Item
                            });
                            pcrGroupRec.setValue({
                                fieldId: 'custrecord_pcrg_comments',
                                value: 'SYSTEM: BrokerBin Price raised above Marketplace.\r\nRecommended Price set to BrokerBin Price + 13%.'
                            });
                            var pcrGroupRecID = pcrGroupRec.save({
                                enableSourcing: true,
                                ignoreMandatoryFields: true
                            });
                            for (pcrID = 0; pcrID < requestsCreated.length; pcrID++){
                                record.submitFields({
                                    type: 'customrecord_price_change_request',
                                    id: requestsCreated[pcrID],
                                    values: {
                                        custrecord_pcrg: pcrGroupRecID
                                    }
                                });
                            }
                        }

                        if (parseFloat(brokerBinPrice) > parseFloat(0)) {
                           //set brokerbin first choice price level
                            item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 1,
                                value: brokerBinPrice.toFixed(2)
                            });
                         

                            //set brokerbin price level
                            item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 2,
                                value: (brokerBinPrice / .99).toFixed(2)
                            });

                          //set enuser price level
                          if(enduser_price != null && enduser_price != '')
                          item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 3,
                                value: enduser_price
                          });
                            //set reseller price level
                           if(reseller_price != null && reseller_price != '')
                          item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 6,
                                value: reseller_price
                            });
                      
                    

                            item_rec.setValue({
                                fieldId: 'custitem_brokerbin_price',
                                value: (brokerBinPrice / .99).toFixed(2)
                            });
                          
                          //set enduser price
                           if(enduser_price != null && enduser_price != '')
                            item_rec.setValue({
                                fieldId: 'custitem_end_user_price',
                                value: enduser_price
                            });
                          
                           //set reseller price
                             if(reseller_price != null && reseller_price != '')
                            item_rec.setValue({
                                fieldId: 'custitem_reseller_price',
                                value: reseller_price
                            });
                          
                          //set ebay price
                          if(ebay_price != null && ebay_price != '') {
                           item_rec.setValue({
                                fieldId: 'custitem_set_ebay_price',
                                value: ebay_price
                           });
                            
                             item_rec.setValue({
                                fieldId: 'custitem_ebay_price_change_by',
                                value: priceChangeby
                            });
                            
                            item_rec.setValue({
                                fieldId: 'custitem_ebay_price_change',
                                value: FmtChangeDate
                            });
                            
                          }

                            //set brokerbin price
                            item_rec.setValue({
                                fieldId: 'custitem_bb_first_choice',
                                value: brokerBinPrice.toFixed(2)
                            });
                          
                                 

                            item_rec.setValue({
                                fieldId: 'custitem_bbl_listing_price_change',
                                value: FmtChangeDate
                            });
                          
                          item_rec.setValue({
                                fieldId: 'custitem_last_price_review',
                                value: last_price_review
                            });
                            
                            

                            item_rec.setValue({
                                fieldId: 'custitem44',
                                value: priceChangeby
                            });

                            item_rec.save({
                                ignoreMandatoryFields: true,
                                enableSourcing: true
                            });
                        }
                        else {
                            item_rec.setValue({
                                fieldId: 'custitem_brokerbin_price',
                                value: null
                            });

                            item_rec.setValue({
                                fieldId: 'custitem_bbl_listing_price_change',
                                value: null
                            });

                            item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 1,
                                value: null
                            });

                            item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 2,
                                value: null
                            });
                           item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 3,
                                value: null
                            });
                           item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 6,
                                value: null
                            });
                           item_rec.setSublistValue({
                                sublistId: 'price1',
                                fieldId: 'price_1_',
                                line: 8,
                                value: null
                            });

                            item_rec.save({
                                ignoreMandatoryFields: true,
                                enableSourcing: true
                            })
                        }

                        var BBAlternateListingSearchRes = search.create({
                            type: "customrecord_bbl",
                            filters: [["isinactive", "is", "F"], "AND", ["custrecord_bbl_item", "anyOf", Item], "AND", ["custrecord_bbl_main_listing", "is", [1, 3]]],
                            columns: [search.createColumn({
                                name: 'internalid',
                                label: 'Internal ID'
                            })]
                        }).run().getRange(0, 1000);

                        if (BBAlternateListingSearchRes != null && BBAlternateListingSearchRes != '' && BBAlternateListingSearchRes != undefined) {
                            for (j = 0; j < BBAlternateListingSearchRes.length; j++) {
                                try {
                                    var BBInternalID = BBAlternateListingSearchRes[j].getValue({
                                        name: "internalid",
                                        label: "Internal ID"
                                    });

                                    var UpdateBBid = record.submitFields({
                                        type: 'customrecord_bbl',
                                        id: BBInternalID,
                                        values: {
                                            custrecord_bbl_update_brokerbin_price: brokerBinPrice,
                                            custrecord_bbl_brokerbin_description: brokerBinDesc
                                            //custitem_bbl_listing_price_change: PriceChangeDate
                                        },
                                        options: {
                                            enableSourcing: false,
                                            ignoreMandatoryFields: true
                                        }
                                    });
                                    log.debug('UpdateBBid', UpdateBBid);
                                }
                                catch (e) {
                                    log.debug('Internal Update error', e.message);
                                }
                            }
                        }
                    }
                }
                try {
                    if (runtime.executionContext == "USERINTERFACE") {
                        var UpdateBBid = record.submitFields({
                            type: 'customrecord_bbl',
                            id: i_recordId,
                            values: {
                                custrecord_bbl_update: true,

                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });
                    }
                }
                catch (e) {
                    log.debug('Internal Update error', e.message);
                }
            }
            catch (e) {
                log.debug('e', e.message);
            }
        }
        return {
            afterSubmit: afterSubmitUpdateBBPrice
        };
    }
);
