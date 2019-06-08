function rmacustomRecord(type){

 		var recordType = nlapiGetRecordType();
		var recordId = nlapiGetRecordId();

  nlapiLoadRecord(recordType, recordId) ; 

  nlapiLogExecution('Debug','Entry','Entry')

 //Do a saved search and get name from custom rma record
var custrmaSearch = nlapiSearchRecord("customrecord_custrma_online_form",null,
[
], 
[
   new nlobjSearchColumn("name")
]
);


var description = custrmaSearch[0].getValue('name') ; 
nlapiLogExecution('Debug','Description from SS',description)

var new_record = nlapiCreateRecord('customrecord_winston'); 

nlapiLogExecution('Debug','New record',new_record)

new_record.setFieldValue('custrecord_winston', description);
new_record.setFieldValue('name', 'Test') ; 
var updated_winston =  new_record.getFieldValue('custrecord_winston') ; 
var updated_name =  new_record.getFieldValue('name') ; 


nlapiLogExecution('Debug','updated field',updated_winston) ; 
nlapiLogExecution('Debug','updated name',updated_name); 

nlapiSubmitRecord(new_record, true);

nlapiLogExecution('Debug','updated field',updated_winston) ; 
nlapiLogExecution('Debug','updated name',updated_name); 

}



