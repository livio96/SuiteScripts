/**
 *@NApiVersion 2.0
 *@NScriptType MassUpdateScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],
    function(search, record, runtime, file, format, log) {
        function changeBillDate(params) {
            var currentRecordType = params.type;
            var currentRecordID = params.id;
            
            record.submitFields({
                type: params.type,
                id: params.id,
                values: {
                    orderstatus: 'H'
                }
            });
        }
    return{
        each: changeBillDate
    }
});
