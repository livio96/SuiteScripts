function UpdateVendorStock(){
	

	var itemId = nlapiGetRecordId(); //Get item internal ID

var itemSearch = nlapiSearchRecord("item",null,
[
   ["custitem_display_sca","is","T"], 
   "AND", 
   ["custitem_awa_is_custom_parent","is","F"], 
   "AND", 
   ["internalid","anyof",itemId]
], 
[
   new nlobjSearchColumn("itemid"), 
   new nlobjSearchColumn("quantityonhand").setSort(true), 
   new nlobjSearchColumn("custitem15"), 
   new nlobjSearchColumn("custitem24")
]
);
 if(itemSearch) {
  var jenne_quantity = itemSearch[0].getValue('custitem15');
  var item = itemSearch[0].getValue('itemid');
  var onhand = itemSearch[0].getValue('quantityonhand');
  var teledynamic_quantity = itemSearch[0].getValue('custitem24');

}


	
if(onhand == null) {
  onhand = parseInt(0)
}

if(jenne_quantity == null || jenne_quantity =='')
  		jenne_quantity = parseInt(0)
if(teledynamic_quantity == null || teledynamic_quantity =='') 
  		teledynamic_quantity = parseInt(0)
if(onhand == null || onhand ==''){
  onhand = parseInt(0) ; 
}

 var vendor_stock = parseInt(jenne_quantity) + parseInt(teledynamic_quantity) + parseInt(onhand);

 nlapiLogExecution('Debug','Item name: ',  item)
        nlapiLogExecution('Debug','Jenne: ',  jenne_quantity)
          nlapiLogExecution('Debug','tele : ',  teledynamic_quantity)
            nlapiLogExecution('Debug','stock : ',  onhand)
            nlapiLogExecution('Debug','vendor stock : ',  vendor_stock)
  			
  
	    nlapiSetFieldValue('custitem_vendor_stock', parseInt(vendor_stock) ) ;






}
