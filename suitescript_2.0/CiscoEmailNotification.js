/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function beforeSubmit(context) {

            var newRecord = context.newRecord;

            var line_item = newRecord.getSublistField({
                sublistId: 'item',
                fieldId: 'item',
                line: 1
            });

            var i = 1 ;
            while(i<4 && line_item != null ){
                 line_item = newRecord.getSublistField({
                sublistId: 'item',
                fieldId: 'item',
                line: i
                });

                
                 i= i+1; 
            }

        }
        return {
            beforeSubmit: beforeSubmit,
        };

    });