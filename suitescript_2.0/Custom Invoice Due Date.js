function Change_invoice_due_date()
{
  var rec_type = nlapiGetRecordType(); 
  var rec_id = nlapiGetRecordId(); 
  var rec = nlapiLoadRecord(rec_type, rec_id); 
  nlapiLogExecution('Debug', 'Update', 'update')
   var override_due_date = rec.getFieldValue('custbody_override_due_date'); 
   rec.setFieldValue('duedate', override_due_date); 
  nlapiSubmitRecord(rec); 
} 