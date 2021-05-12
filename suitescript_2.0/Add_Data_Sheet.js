/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
/*General Comments */
/*Update Brokerbin Price when record is approved */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],
    function(search, record, runtime, file, format, log) {
        function beforeSubmit(context) {
      
            var newRecord = context.newRecord;

            var label = newRecord.getValue({
                fieldId: 'custrecord_ds_display_name'
            });
          
            var link = newRecord.getValue({
                fieldId: 'custrecord_ds_external_url'
            });
          
            var part_number = newRecord.getValue({
              fieldId: 'custrecord_ds_item'
            });
   
            var item_rec = record.load({
                type: 'inventoryitem',
                id: part_number
            });
          
           var webstore_tab3 = item_rec.getValue({
             fieldId: 'custitem_awa_tab3content'
           });
          
          
          link = '<a href="'+link+'">'+label+"</a>"

            if(context.type == 'delete'){
              var item_list = webstore_tab3.split('<br>');
              var index = item_list.indexOf(link.toString());
              log.debug('index',index);
              log.debug('item list', item_list);
              log.debug('link', link);
              if(index > -1){
                item_list.splice(index,1);
             
                var final_value = item_list.join('<br>');
               log.debug('final_value',final_value);

                item_rec.setValue({
                  fieldId: 'custitem_awa_tab3content',
                  value: final_value
                }); 
                
                item_rec.save(); 
              }
            }

           else {
            
              var link = '<a href="'+link+'">'+label+'</a>';   
              log.debug('link', link)
            if (webstore_tab3.indexOf(link) == -1 && webstore_tab3 != '' && webstore_tab3 != null && webstore_tab3 != undefined) {
                item_rec.setValue({
                    fieldId: 'custitem_awa_tab3content',
                    value: webstore_tab3 + '<br>' + link
                });
                 log.debug('not empty', webstore_tab3)
            }
             //if associated items is empty
            if (webstore_tab3 == '' || webstore_tab3 == null || webstore_tab3 == undefined) {
                item_rec.setValue({
                    fieldId: 'custitem_awa_tab3content',
                    value: link
                });
                 log.debug(' empty', link)

            }

            item_rec.save();
           }
        }
        return {
            beforeSubmit: beforeSubmit,
        };
    });