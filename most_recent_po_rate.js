function recent_po_rate() {


var item_id = nlapiGetRecordId();  


var purchaseorderSearch = nlapiSearchRecord("purchaseorder",null,
[
   ["trandate","after","1/1/2019"], 
   "AND", 
   ["type","anyof","PurchOrd"], 
   "AND", 
   ["subsidiary","anyof","1"], 
   "AND", 
   ["item","noneof","@NONE@"], 
   "AND", 
   ["item.custitem_awa_is_custom_child","is","T"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
  
   new nlobjSearchColumn("trandate").setSort(true), 
   new nlobjSearchColumn("amount"), 
   new nlobjSearchColumn("quantity"), 
   new nlobjSearchColumn("item")
]
);
  
   if(purchaseorderSearch) {
  var amount = purchaseorderSearch[0].getValue('amount');
  var quantity = purchaseorderSearch[0].getValue('quantity');
  var item = purchaseorderSearch[0].getValue('item');
  var date = purchaseorderSearch[0].getValue('trandate');



  nlapiLogExecution('Debug', 'amount', amount); 
  nlapiLogExecution('Debug', 'quantity', quantity); 
  nlapiLogExecution('Debug', 'item', item); 
  nlapiLogExecution('Debug', 'date', date); 

  
  var rate = parseFloat(amount/quantity) ; 
  nlapiLogExecution('Debug', 'rate', rate);
     
     nlapiSetFieldValue('custitem_imp_avg_cost', rate) ; 

   }
}



