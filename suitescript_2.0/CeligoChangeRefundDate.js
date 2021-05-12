/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],
    function(search, record, runtime, file, format, log) {
      function changePostedDate(scriptContext) {
        var newRecord = scriptContext.newRecord;
        var type = newRecord.getValue('custrecord_celigo_amzio_set_tran_ty_txt');
        var settlementSum = newRecord.getValue('custrecord_celigo_amzio_set_summary');
        var orderID = newRecord.getValue('custrecord_celigo_amzio_set_order_id');
        var refundRec = newRecord.getValue('custrecord_celigo_amzio_set_recond_trans');
        if(type === "Refund"){
            if(settlementSum != null && settlementSum != '' && settlementSum != undefined){
                var setRecord = record.load({
                    type: 'customrecord_celigo_amzio_sett_summary', 
                    id: settlementSum
                });
                var depDate = setRecord.getValue('custrecord_celigo_amzio_set_sum_settl_dd');
                var shortDate = format.parse({
                    value: depDate,
                    type: 'DATE'
                });
                
                record.submitFields({
                    type: newRecord.type,
                    id: newRecord.id,
                    values: {
                    custrecord_celigo_amzio_set_posted_date: shortDate
                    }
                });
                
                if (refundRec != null && refundRec != '' && refundRec != undefined){
                    record.submitFields({
                        type: 'customerrefund',
                        id: refundRec,
                        values: {
                            trandate: shortDate,
                            memo: orderID
                        }
                    });
                }
            }
        }
      }
      return {
        afterSubmit: changePostedDate,
      };
    });