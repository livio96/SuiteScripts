/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function beforeSubmit(context) {

            try{
            var newRecord = context.newRecord;

            var status = newRecord.getValue({
                fieldId: 'custrecord_nbsabr_rs_status'
            });
            var lock_ns_transaction = newRecord.getValue({
                fieldId: 'custrecord_lock_ns_transaction'
            });
			var transaction_type = newRecord.getValue({
                fieldId: 'custrecord_nbsabr_rs_trantype'
            });
            var payment_id = newRecord.getValue({
                fieldId: 'custrecord_nbsabr_rs_internalid'
            });
          
        

            //Payments
            if(status == '3' && lock_ns_transaction == false && transaction_type == '9' ) {
                var ns_transaction = record.load({
                    type: record.Type.CUSTOMER_PAYMENT,
                    id: payment_id,
                    isDynamic: true,
                });
              
             log.debug({
             title: ' Locked Payment', 
             details: 'Locked Payment'
           });

                if (ns_transaction) {
                    ns_transaction.setValue({
                        fieldId: 'custbody_payment_reconciled',
                        value: true
                    });

                    ns_transaction.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    });

                }
              
                newRecord.setValue({
                  fieldId: 'custrecord_lock_ns_transaction',
                  value: true
                });
              
         
          
            }
          
          
            //Customer Refund
           if(status == '3' && lock_ns_transaction == false && transaction_type == '30' ) {
                var ns_transaction = record.load({
                    type: record.Type.CUSTOMER_REFUND,
                    id: payment_id,
                    isDynamic: true,
                });
               log.debug({
             title: ' Locked Refund', 
             details: 'Locked Refund'
           });
          
                if (ns_transaction) {
                    ns_transaction.setValue({
                        fieldId: 'custbody_payment_reconciled',
                        value: true
                    });

                    ns_transaction.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    });

                }
              
                newRecord.setValue({
                  fieldId: 'custrecord_lock_ns_transaction',
                  value: true
                });
              
             
          
            }
            }
            catch(e){
              log.debug({
                title: 'Error!',
                details: 'Error!'
              })
            }
        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });