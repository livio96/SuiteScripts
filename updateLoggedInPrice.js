function updatePriceField() {

      var recordType = nlapiGetRecordType(); 
  		var recordId = nlapiGetRecordId(); 
  		var item_rec = nlapiLoadRecord(recordType, recordId  ) ; 
      
      var min_qty = nlapiGetFieldValue('minimumquantity')
      item_rec.selectNewLineItem('price1');
      item_rec.setLineItemValue('price1', 'price_1_', 1, min_qty);
      item_rec.commitLineItem('price_1_');
      nlapiSubmitRecord(item_rec) ; 

 

function updatePriceField() {

      var recordType = nlapiGetRecordType(); 
  		var recordId = nlapiGetRecordId(); 
  		var item_rec = nlapiLoadRecord(recordType, recordId  ) ; 

      var min_qty = nlapiGetFieldValue('minimumquantity')
      item_rec.selectNewLineItem('price1');
      item_rec.setLineItemValue('price1', 'price_1_', 1, min_qty);
      item_rec.commitLineItem('price_1_');
      nlapiSubmitRecord(item_rec) ;

}