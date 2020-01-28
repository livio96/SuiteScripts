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

                var vendor_stock = newRecord.getValue({
                    fieldId: 'custitem_vendor_stock',
                });

          
                var jenne_cost = newRecord.getValue({
                    fieldId: 'custitem14',
                });

                var jenne_qty = newRecord.getValue({
                    fieldId: 'custitem15',
                });


                var sublistFieldValue = newRecord.getSublistValue({
                    sublistId: 'price1',
                    fieldId: 'price_1_',
                    line: 10
                });


            
                if (vendor_stock == jenne_qty) {

                    newRecord.setSublistValue({
                        sublistId: 'price1',
                        fieldId: 'price_1_',
                        line: 10,
                        value: parseFloat(jenne_cost) + parseFloat(jenne_cost * 0.15)
                    });


                }

            }

        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });
