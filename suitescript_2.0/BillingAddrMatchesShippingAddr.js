/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record'],

 function(record) {

 	
 function beforeSubmit(context) {

   var newRecord = context.newRecord;
  
  var source =  newRecord.getValue({
 fieldId: 'source',
});



if(source === 'Web (Telquest)'){
var street_address_confirmed =  newRecord.getValue({
 fieldId: 'ccavsstreetmatch',
});


var zip_code_confirmed =  newRecord.getValue({
 fieldId: 'ccavszipmatch',
});



if(street_address_confirmed ==='N' && zip_code_confirmed === 'N') {

   newRecord.setValue({
     fieldId: 'custbodyspecialinstructions',
     value: 'Billing Address does not match Shipping Address - Please contact the customer!'
   });
 
   log.debug({
     title: 'Success',
     details: 'Success'
     
   });


}

}
 }

 return {
 beforeSubmit: beforeSubmit,
 };

 });