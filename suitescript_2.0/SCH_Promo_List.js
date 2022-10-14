/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
 define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/task', 'N/log'],
 function(render, search, record, email, runtime, task, log){
     function promo_list(context){
         try {
            var customrecord_bblSearchObj = search.create({
                type: "customrecord_bbl",
                filters:
                [
                   ["custrecord_promotion_price","isnotempty",""]
                ],
                columns:
                [
                   search.createColumn({name: "internalid", label: "Internal ID"}),
                   search.createColumn({name: "custrecord_bbl_item", label: "Item"}),
                   search.createColumn({name: "custrecord_promotion_price", label: "Promotion Price"}),
                   search.createColumn({name: "custrecord_promotion_quantity", label: "Promotion Quantity"}),
                   search.createColumn({name: "custrecord_promotion_exp_date", label: "Promotion Expiration Date"})
                ]
             });

             var results = customrecord_bblSearchObj.run(); 
             var results_range = results.getRange(0,1000) ; 

             if(results_range.length>0){

                for (var i=0 ; i<results_range.length; i++){
                      var bb_listing_internal_id = results_range[i].getValue({
                        name: 'internalid'
                    });
                    var item_name = results_range[i].getValue({
                        name: 'custrecord_bbl_item'
                    });
                    var promo_price = results_range[i].getValue({
                        name: 'custrecord_promotion_price'
                    });

                    var promo_qty = results_range[i].getValue({
                        name: 'custrecord_promotion_quantity'
                    });
                  
                  
                    var salesorderSearchObj = search.create({
                        type: "salesorder",
                        filters:
                        [
                           ["type","anyof","SalesOrd"], 
                           "AND", 
                           ["item.internalid","anyof",item_name], 
                          "AND", 
                           ["rate","equalto",promo_price], 
                           "AND", 
                           ["datecreated","within","daysago7","daysfromnow7"], 
                        ],
                        columns:
                        [
                           search.createColumn({
                              name: "quantity",
                              summary: "SUM",
                              label: "Quantity"
                           })
                        ]
                     });

                     var results_so_search = salesorderSearchObj.run(); 
                     var results_range_so_search = results_so_search.getRange(0,1) ; 
                     if(results_so_search){
                     var sold_qty = results_range_so_search[0].getValue({
                        name: "quantity",
                        summary: "SUM"
                    });
                       
                        var bb_listing = record.load({
                       type: 'customrecord_bbl',
                         id: bb_listing_internal_id,
                         isDynamic: true
                     });
                       
                       if(sold_qty != '' && sold_qty != null)
                          bb_listing.setValue({
                          fieldId: 'custrecord_promo_qty_sold',
                          value: sold_qty
                        });
                       
                        if(sold_qty>= promo_qty){

                      bb_listing.setValue({
                        fieldId: 'custrecord_promotion_price',
                        value: ''
                      })
                      
                      bb_listing.setValue({
                        fieldId: 'custrecord_promotion_quantity',
                        value: ''
                      })
                      
                      bb_listing.setValue({
                        fieldId: 'custrecord_promotion_exp_date',
                        value: ''
                      });
                       
                        bb_listing.setValue({
                        fieldId: 'custrecord_promo_qty_sold',
                        value: ''
                      });

                      bb_listing.save({
                      enableSourcing: true,
                      ignoreMandatoryFields: true
                  });
                        }
                    }


             }

            }
            
         } 
         catch (err) {
             log.debug('error', '--> ' + err);
         }
     }
     return {
         execute: promo_list
     };
 });