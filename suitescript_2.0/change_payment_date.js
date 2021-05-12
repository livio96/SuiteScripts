function change_payment_date(rec_type, rec_id)
{
  nlapiLogExecution('Debug', 'Success', 'Success');
  var transaction = nlapiLoadRecord(rec_type, rec_id);
  
 transaction.setFieldValue('trandate', '2/24/2021' )

  nlapiSubmitRecord(transaction, false, true);

} 