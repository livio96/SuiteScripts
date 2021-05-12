function change_journal_status(rec_type, rec_id)
{
  nlapiLogExecution('Debug', 'Success', 'Success');
  var transaction = nlapiLoadRecord(rec_type, rec_id);
  transaction.setFieldValue('approvalstatus', '2');
  nlapiSubmitRecord(transaction, false, true);
} 

function close_bills(rec_type, rec_id)
{
  nlapiLogExecution('Debug', 'Success', 'Success');
  var transaction = nlapiLoadRecord(rec_type, rec_id);
  transaction.setFieldValue('status', 'Closed');
  nlapiSubmitRecord(transaction, false, true);
} 