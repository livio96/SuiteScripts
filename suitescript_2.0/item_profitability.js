/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record', 'N/runtime'],

    function(record, runtime) {


        function beforeSubmit(context) {

            var newRecord = context.newRecord;

            var user = runtime.getCurrentUser();
            var user_id = user.id
            //if user is Livio
            if (user_id == '1692630') {

                var average_cost = newRecord.getValue({
                    fieldId: 'averagecost',
                });

          
                var so_rate = newRecord.getValue({
                    fieldId: 'custitem_so_rate',
                });

                var quantity_sold = newRecord.getValue({
                    fieldId: 'custitem_qty_sold',
                });



               if (so_rate != null && average_cost != null) {

               newRecord.setValue({
                  fieldId: 'custitem_estimated_margin',
                  value: (((so_rate-average_cost)/so_rate)*100)+"%"
               });

               newRecord.setValue({
                  fieldId: 'custitem_estimated_profit_u',
                  value: so_rate-average_cost
               });

               }

               if(quantity_sold != null && so_rate != null && average_cost != null){

                newRecord.setValue({
                  fieldId: 'custitem_estimated_profit_u',
                  value: (so_rate-average_cost)*quantity_sold
               });

               }
            
            
               


                

            }

        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });