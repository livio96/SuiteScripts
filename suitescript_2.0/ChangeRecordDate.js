/**
 *@NApiVersion 2.0
 *@NScriptType MassUpdateScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],
    function(search, record, runtime, file, format, log) {
        function changeBillDate(params) {
            var currentRecordType = params.type;
            var currentRecordID = params.id;
          	var date = '12/1/2020';
          	var recType = 'vendorpayment'
          
            var currentRecord = record.load({
                type: currentRecordType,
                id: currentRecordID
            });

            var bill = currentRecord.getValue('custrecord_nbsabr_rs_internalid');
            
            record.submitFields({
                type: recType,
                id: bill,
                values: {
                    trandate: date
                }
            });
        }
    return{
        each: changeBillDate
    }
});
