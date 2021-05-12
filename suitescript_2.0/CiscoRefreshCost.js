/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {



        function beforeSubmit(context) {

            var newRecord = context.newRecord;

            var vendor = newRecord.getValue({
                fieldId: 'custrecord_vifi_vendor'
            });
            var list_price = newRecord.getValue({
                fieldId: 'custrecord_rf_list_price'
            })

            if(vendor === 'Cisco Refresh' && list_price !=null){
                var cost = list_price * .255;
				cost = cost.toFixed(2)
              
                newRecord.setValue({
                    fieldId: 'custrecord_vifi_cost',
                    value: (cost * 100)/100
                });
            }
        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });