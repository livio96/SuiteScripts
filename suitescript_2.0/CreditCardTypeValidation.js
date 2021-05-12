/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error'],
    function(error) {
        function pageInit(context) {
            if (context.mode !== 'create')
                return;
            var currentRecord = context.currentRecord;
            currentRecord.setValue({
                fieldId: 'entity',
                value: 107
            });
        }
        function validateField(context) {
          
          var currentRecord = context.currentRecord;
            var sublistName = context.sublistId;
            var sublistFieldName = context.fieldId;
            var line = context.line;
            log.debug({
              title: 'Triggered', 
              details: 'Triggered'
            });
            
              log.debug({
              title: 'Triggered3', 
              details: 'Triggered3'
            });
                  log.debug({
              title: 'Triggered3', 
              details: 'Triggered3'
            });
                    var cc_num = currentRecord.getCurrentSublistValue({
                        sublistId: sublistName,
                        fieldId: sublistFieldName
                    });

                    currentRecord.setCurrentSublistValue({
                        sublistId: sublistName,
                        fieldId: 'paymentmethod',
                        value: 4
                    });

  
        
            return true;
        }
       
      
       
 
        function ValidateLine(context) {
            var currentRecord = context.currentRecord;
            var sublistName = context.sublistId;
            var op = context.operation;
            if (sublistName === 'item')
                currentRecord.setValue({
                    fieldId: 'memo',
                    value: 'Total has changed to ' + currentRecord.getValue({
                        fieldId: 'total'
                    }) + ' with operation: ' + op
                });
        }
        return {

            //validateLine: validateLine
            // pageInit: pageInit,
            // fieldChanged: fieldChanged,
            // postSourcing: postSourcing,
            //sublistChanged: sublistChanged
            //  lineInit: lineInit,
             validateField: validateField

             //validateInsert: validateInsert
            // validateDelete: validateDelete,
            //saveRecord: saveRecord
        };
    });