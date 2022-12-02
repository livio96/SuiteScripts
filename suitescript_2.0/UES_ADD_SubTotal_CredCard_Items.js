/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
 define(['N/record', 'N/search', 'N/runtime'],

 function(record, search, runtime){
     function beforeSubmitAddCreditCard(context){
         log.debug("After Submit scriptContext.type", context.type);
         try {
             if (context.type == context.UserEventType.CREATE || context.type == context.UserEventType.COPY) {
                 var s_recordType = context.newRecord.type;
                 
                 var currRec = context.newRecord;
                  var customer_id = currRec.getValue('entity'); 
                   var objRecord = record.load({
                        type: record.Type.CUSTOMER,
                        id: customer_id,
                        isDynamic: true,
                   });
                 var customer_group = objRecord.getValue('custentity_customer_group');
                 var Terms = currRec.getValue('terms');
                 log.debug('Terms', Terms);
                 var Category = currRec.getValue('custbody_category');
                 var CreditCardFee = currRec.getValue('custbody_creditcardfee');
                 log.debug('CreditCardFee', CreditCardFee);
                 
                 // please add category INTERNATIONAL BROKER
                 if (Terms == 4 && CreditCardFee == false && (customer_group[0]== ["1"] || customer_group[1]== ["1"] || customer_group[2]== ["1"] )) {
                     var numLines = currRec.getLineCount({
                         sublistId: 'item'
                     });
                     
                     currRec.setSublistValue({
                         sublistId: 'item',
                         fieldId: 'item',
                         value: -2,
                         line: Number(numLines),
                         ignoreFieldChange: false,
                         forceSyncSourcing: true,
                     })
                     
                     var NextNumber = (parseInt(numLines) + parseInt(1));
                     
                     currRec.setSublistValue({
                         sublistId: 'item',
                         fieldId: 'item',
                         value: 209792,
                         line: Number(NextNumber),
                         ignoreFieldChange: false,
                         forceSyncSourcing: true,
                     })
                     currRec.setValue('custbody_creditcardfee', true);
                     
                     
                     var lineCount = currRec.getLineCount({
                         sublistId: 'item'
                     });
                     
                     var lineNumber = -1;
                     var newSubtotal = currRec.getValue('subtotal');
                     
                     for (var q = 0; q < lineCount; q++) {
                         var item = currRec.getSublistValue({
                             sublistId: 'item',
                             fieldId: 'item',
                             line: q
                         });
                         
                         if (item == 7211) {
                             lineNumber = q;
                             
                             break;
                         }
                     }
                     if (lineNumber == -1) {
                         var quantity = newSubtotal;
                         
                         var qtyStr = '' + quantity;
                         var decimalNum = qtyStr.split('.');
                         if (decimalNum[1]) {
                             if (decimalNum[1].length >= 5) 
                                 quantity = quantity.toFixed(5);
                         }
                         
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'item',
                             value: 7211,
                             line: Number(lineCount),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'quantity',
                             value: quantity,
                             line: Number(lineCount),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'location',
                             value: 1,
                             line: Number(lineCount),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'rate',
                             value: 0,
                             line: Number(lineCount),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'amount',
                             value: 0,
                             line: Number(lineCount),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         
                         //currRec.setValue('custbody_co_item_added', 'T');
                     }
                     else {
                         var quantity = newSubtotal;
                         
                         var qtyStr = '' + quantity;
                         var decimalNum = qtyStr.split('.');
                         if (decimalNum[1]) {
                             if (decimalNum[1].length >= 5) 
                                 quantity = quantity.toFixed(5);
                         }
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'quantity',
                             value: quantity,
                             line: Number(lineNumber),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'rate',
                             value: 0,
                             line: Number(lineNumber),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         
                         currRec.setSublistValue({
                             sublistId: 'item',
                             fieldId: 'amount',
                             value: 0,
                             line: Number(lineNumber),
                             ignoreFieldChange: false,
                             forceSyncSourcing: true,
                         })
                         //currRec.setValue('custbody_co_item_added', 'T');
                     }
                 }
             }//if (context.type == context.UserEventType.CREATE || context.type == context.UserEventType.EDIT)
             //}//if(runtime.executionContext !== runtime.ContextType.SCHEDULED)
         } 
         catch (e) {
             log.debug('error', e.message);
         }
     }
     return {
         beforeSubmit: beforeSubmitAddCreditCard,
     }
 });
 