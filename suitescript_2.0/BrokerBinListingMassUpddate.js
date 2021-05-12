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
                fieldId:'custrecord_bbl_approval',
                value: 1
            })

            currentRecord.setValue({
                fieldId: 'custrecord_bbl_list_on_brokerbin',
                value: true
            })

            currentRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
        }

    return{
        each: each
    }

});