/**
 *@NApiVersion 2.0
 *@NScriptType MassUpdateScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {
        function each(params) {
            var currentRecordType = params.type;
            var currentRecordID = params.id;
            var currentRecord = record.load({
                type: currentRecordType,
                id: currentRecordID
            })

            currentRecord.setValue({
                fieldId:'entitystatus',
                value: 14
            });

            currentRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
        }
    return{
        each: each
    }

});