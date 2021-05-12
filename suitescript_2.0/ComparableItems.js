/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
/*General Comments */
/*Update Brokerbin Price when record is approved */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],
    function(search, record, runtime, file, format, log) {
        function beforeSubmit(context) {
            // try{
            var newRecord = context.newRecord;

            var comparable_item = newRecord.getValue({
                fieldId: 'custrecord_cmp_cmp_item'
            });
          
            var part_number = newRecord.getValue({
                fieldId: 'custrecord_cmp_item'
            });

            var item_rec = record.load({
                type: 'inventoryitem',
                id: part_number
            });

            var associated_items = item_rec.getValue({
                fieldId: 'custitem_associated_items'
            });
          
          
         
          
            if(context.type == 'delete'){
              var item_list = associated_items.split(',');
              var index = item_list.indexOf(comparable_item.toString());
              log.debug('index', index);
               log.debug('item_list', item_list);
               log.debug('comparable', comparable_item);
              if(index > -1){
                item_list.splice(index,1);
                log.debug('item_list', item_list);

                var final_value = item_list.join(',');
                log.debug('final', final_value);
             
                item_rec.setValue({
                  fieldId: 'custitem_associated_items',
                  value: final_value
                }); 
                
                item_rec.save(); 
              }
            }
          
           else {
            

             
            if (associated_items.indexOf(comparable_item) == -1 && associated_items != '' && associated_items != null && associated_items != undefined) {
                item_rec.setValue({
                    fieldId: 'custitem_associated_items',
                    value: associated_items + "," + comparable_item
                });
                log.debug({
                    title: 'not empty',
                    details: associated_items + "," + comparable_item
                });

            }
             //if associated items is empty
            if (associated_items == '' || associated_items == null || associated_items == undefined) {
                item_rec.setValue({
                    fieldId: 'custitem_associated_items',
                    value: comparable_item
                });
                log.debug({
                    title: 'Empty',
                    details: comparable_item
                });
            }
             
             
               //Get All webstore Field Values
           
           var title = item_rec.getValue({fieldId: 'pagetitle'});
           var web_display_name = item_rec.getValue({fieldId: 'storedisplayname'})
           var webstore_tab_1 = item_rec.getValue({fieldId: 'custitem_awa_tab1content'})
           var webstore_tab_2 = item_rec.getValue({fieldId: 'custitem_awa_tab2content'})
           var webstore_tab_3 = item_rec.getValue({fieldId: 'custitem_awa_tab3content'})
           item_rec.save();
           log.debug('web tab 1', webstore_tab_1); 
             
           var associated_item_rec = record.load({
                type: 'inventoryitem',
                id: comparable_item
                
            });
             
             associated_item_rec.setValue({
               fieldId:'custitem_awa_tab1content',
               value: webstore_tab_1
             }); 
             
             var new_value = associated_item_rec.getValue({
               fieldId: 'custitem_awa_tab1content'
             }); 
             
             log.debug('new value', new_value)
                associated_item_rec.setValue({
               fieldId:'pagetitle', 
               value: title
             });
                associated_item_rec.setValue({
               fieldId:'custitem_awa_tab2content', 
               value: webstore_tab_2
             });
                associated_item_rec.setValue({
               fieldId:'custitem_awa_tab3content', 
               value: webstore_tab_3
             });
                associated_item_rec.setValue({
               fieldId:'storedisplayname', 
               value: web_display_name
             });
             
             associated_item_rec.save();
                        
           }
        }
        return {
            afterSubmit: beforeSubmit,
        };
    });