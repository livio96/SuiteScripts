/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function SendEmail(context) {

            var newRecord = context.newRecord;

            log.debug({
                title: 'Triggered',
                details: 'triggered'
            });



            newRecord.setValue({
                fieldId: 'tobeemailed',
                value: 'T'
            })

        }


        return {
            onAction: SendEmail,
        };

    });