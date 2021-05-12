function disableLineItemInvoice() {
var createdFrom=nlapiGetFieldValue('createdfrom');
  if(createdFrom!=null || createdFrom !=''){
       nlapiDisableLineItemField('item', 'quantity', 'T'); 
      nlapiDisableLineItemField('item', 'rate', 'T'); 
  }
}