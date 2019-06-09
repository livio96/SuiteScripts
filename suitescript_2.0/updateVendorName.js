/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record'],

 function(record) {

 	
 function beforeSubmit(context) {

   var newRecord = context.newRecord;
  
   //SetFieldValue - VendorName
   newRecord.setValue({
     fieldId: 'vendorname',
     value: 'Jenne'
   });
//GetFieldValue - InternalId
var internalid =  newRecord.getValue({
 fieldId: 'internalid',
});

//Log internal id value
log.debug ({
 title: 'Success',
 details: internalid
 });

 }

 return {
 beforeSubmit: beforeSubmit,
 };

 });
