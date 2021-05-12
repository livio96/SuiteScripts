/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */

/*General Comments */
/*Update Brokerbin Quantity on inbound inventory listings */

define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function CreateBBListings(context) {

            var newRecord = context.newRecord;

            var po_internal_id = newRecord.getValue({
                fieldId: 'id'
            });
          
            newRecord.setValue({
              fieldId: 'custbody_brokerbin_listings_created',
              value: true
            })

            log.debug({
                title: 'Triggered',
                details: 'Triggered'
            });

            var purchaseorderSearchObj = search.create({
                type: "purchaseorder",
                filters:
                    [
                        ["type","anyof","PurchOrd"],
                        "AND",
                        ["internalid","anyof",po_internal_id],
                        "AND",
                        ["status","noneof","PurchOrd:H","PurchOrd:C"],
                        "AND",
                        ["shipping","is","F"],
                        "AND",
                        ["taxline","is","F"],
                        "AND",
                        ["item","noneof","@NONE@"]
                    ],
                columns:
                    [
                        search.createColumn({name: "internalid", label: "Internal ID"}),
                        search.createColumn({
                            name: "itemid",
                            join: "item",
                            label: "Name"
                        }),
                        search.createColumn({name: "item", label: "Item"}),
                        search.createColumn({name: "rate", label: "Item Rate"}),
                        search.createColumn({name: "custcol_list_on_brokerbin", label: "List on Brokerbin"}),
                        search.createColumn({name: "custcol_main_bbl_price", label: "Brokerbin Price"}),
                        search.createColumn({name: "custcolcustcol_brokerbin_descriptions", label: "Brokerbin Descriptions"}),
                        search.createColumn({name: "quantity", label: "Quantity"}),
                        search.createColumn({name: "quantityshiprecv", label: "Quantity Fulfilled/Received"}),
                        search.createColumn({name: "custcol_brokerbin_listing_link", label: "Brokerbin Listing Link"})
                    ]
            });

            var results = purchaseorderSearchObj.run();
            var results_range = results.getRange(0,100);

            if(results_range.length>0){

                for( var i=0; i<results_range.length ; i++){

                    var list_on_brokerbin = results_range[i].getValue('custcol_list_on_brokerbin');
                    var brokerbin_listing_link = results_range[i].getValue('custcol_brokerbin_listing_link');

					if(brokerbin_listing_link === null || brokerbin_listing_link === ''){
                        var bb_listing_record = record.create({
                            type: 'customrecord_bbl',
                            isDynamic: true
                        });

                        var internalid = results_range[i].getValue('internalid');
                        var item_internal_id = results_range[i].getValue('item');
                        var bb_price = results_range[i].getValue('custcol_main_bbl_price');
                        var bb_description = results_range[i].getValue('custcolcustcol_brokerbin_descriptions');
                        var qty = results_range[i].getValue('quantity');
                        var qty_received = results_range[i].getValue('quantityshiprecv');
                        var item_name = results_range[i].getValue({
                          name: "itemid",
                            join: "item",
                            label: "Name"
                        });


                        

                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_brokerbin_part_number',
                            value: item_name
                        });
                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_listed_brokerbin_quantity',
                            value: qty-qty_received
                        });
                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_brokerbin_description',
                            value: bb_description
                        });

                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_item',
                            value: item_internal_id
                        });
                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_update_brokerbin_price',
                            value: bb_price
                        });

                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_linked_po',
                            value: internalid
                        });
                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_approval',
                            value: '2'
                        });

                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_main_listing',
                            value: '4'
                        });

                        bb_listing_record.setValue({
                            fieldId:'custrecord_bbl_list_on_brokerbin',
                            value: list_on_brokerbin
                        });

                        var bb_listing_id = bb_listing_record.save({
                            enableSourcing: true,
                            ignoreMandatoryFields: true
                        });


                        newRecord.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_brokerbin_listing_link',
                            line: i,
                            value: bb_listing_id
                        });

                    }
                }
                
            }



        }
        return {
            onAction: CreateBBListings,
        };

    });