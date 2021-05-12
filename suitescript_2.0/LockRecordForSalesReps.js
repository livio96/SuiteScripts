/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */

/*General Comments */

define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function LockRecordForSalesReps(context) {



            if (context.type != context.UserEventType.CREATE) {

                var newRecord = context.newRecord;

                var item_fulfillment = newRecord.getSublistValue({
                    sublistId: 'links',
                    fieldId: 'id',
                    line: 1
                });

                if(item_fulfillment != null && item_fulfillment != ''){
                    newRecord.setValue({
                        fieldId: 'custbody_lock_record_for_sales_rep',
                        value: 'T'
                    });
                }

            }

        }
        return {
            onAction: LockRecordForSalesReps,
        };

    });