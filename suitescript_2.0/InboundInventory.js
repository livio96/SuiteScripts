/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */

/*General Comments */
/*Update Brokerbin Quantity on inbound inventory listings */

define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function beforeSubmit(context) {

            var newRecord = context.newRecord;

			 try{

            //get listing type
            var listing_type = newRecord.getValue({
                fieldId: 'custrecord_bbl_main_listing'
            });

            //if record is approved and listing type is inbound inventory
            if(listing_type === '4'){

                var po_internal_id = newRecord.getValue({
                    fieldId: 'custrecord_bbl_linked_po'
                });
                var item = newRecord.getValue({
                    fieldId: 'custrecord_bbl_item'
                });
                var purchaseorderSearchObj = search.create({
                    type: "purchaseorder",
                    filters:
                        [
                            ["type","anyof","PurchOrd"],
                            "AND",
                            ["internalid","anyof",po_internal_id],
                            "AND",
                            ["item","anyof",item],
                            "AND",
                            ["status","noneof","PurchOrd:H","PurchOrd:C"]
                        ],
                    columns:
                        [
                            search.createColumn({name: "item", label: "Item"}),
                            search.createColumn({name: "rate", label: "Item Rate"}),
                            search.createColumn({name: "custcol_list_on_brokerbin", label: "List on Brokerbin"}),
                            search.createColumn({name: "custcol_main_bbl_price", label: "Brokerbin Price"}),
                            search.createColumn({name: "custcolcustcol_brokerbin_descriptions", label: "Brokerbin Descriptions"}),
                            search.createColumn({name: "quantity", label: "Quantity"}),
                            search.createColumn({name: "quantityshiprecv", label: "Quantity Fulfilled/Received"}),
                            search.createColumn({name: "custbody_expected_receiving_date", label: "Expected Receiving Date"})

                        ]
                });


                var results = purchaseorderSearchObj.run();
                var results_range = results.getRange(0,1);


                if(results_range.length > 0) {
                    var display_on_brokerbin = results_range[0].getValue('custcol_list_on_brokerbin');
                    var brokerbin_price = results_range[0].getValue('custcol_main_bbl_price');
                    var brokerbin_desc = results_range[0].getValue('custcolcustcol_brokerbin_descriptions');
                    var qty =  results_range[0].getValue('quantity');
                    var qty_received =  results_range[0].getValue('quantityshiprecv');
                    var exp_receiving_date = results_range[0].getValue('custbody_expected_receiving_date');



                    newRecord.setValue({
                        fieldId: 'custrecord_bbl_listed_brokerbin_quantity',
                        value: qty - qty_received
                    });


                    var current_bb_desc = newRecord.getValue({
                        fieldId: 'custrecord_bbl_brokerbin_description',
                    });



                    var contains_ETA = current_bb_desc.indexOf("ETA");

                    if(current_bb_desc != null && current_bb_desc != '' && contains_ETA > 0 ){

                        var current_bb_desc_no_eta = current_bb_desc.slice(0,-14);
                        log.debug({
                            details: 'sliced',
                            value: current_bb_desc_no_eta
                        })
                        newRecord.setValue({
                            fieldId: 'custrecord_bbl_brokerbin_description',
                            value: current_bb_desc_no_eta + " ETA: " + exp_receiving_date
                        });
                    }
                    if(current_bb_desc != null && current_bb_desc != '' && contains_ETA < 0){
                        newRecord.setValue({
                            fieldId: 'custrecord_bbl_brokerbin_description',
                            value: current_bb_desc + " ETA: " + exp_receiving_date
                        });
                    }

                    if(current_bb_desc == null || current_bb_desc == ''){
                        newRecord.setValue({
                            fieldId: 'custrecord_bbl_brokerbin_description',
                            value: "Inbound Inventory ETA: " + exp_receiving_date
                        });
                    }


                    newRecord.setValue({
                        fieldId: 'custrecord_bbl_list_on_brokerbin',
                        value: true
                    })

                }



            }
        }
          catch(e){
            log.debug({
              title: 'Error!', 
              details: 'Error Occurred...'
            })
          }
        }
        return {
            beforeSubmit: beforeSubmit,
        };

    });