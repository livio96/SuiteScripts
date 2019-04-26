function afterSubmit_rmacustomRecord(){

 //var recordType = nlapiGetRecordType();
 //var recordId = nlapiGetRecordId();



 //Do a saved search and get name from custom rma record
var custrmaSearch = nlapiSearchRecord("customrecord_custrma_online_form",null,
[
], 
[
   new nlobjSearchColumn("custrecord_custrma_description")
]
);


var description = custrmaSearch[0].getValue('custrecord_custrma_description') ; 


var new_record = nlapiCreateRecord('customrecord_winston');  // find RMA record id and replace salesorder


new_record.setFieldValue('custrecord_winston', description);//setting customer in new custom record
}



