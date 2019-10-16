/* Suitescript 1.0 
 * Update Vendor Stock (custom field)
 * Vendor Stock field is set to quantityavailable + jenne_quantity (custom_field)
 * Created by Livio Beqiri
*/


function UpdateVendorStock(){
//var show_add_to_cart = nlapiGetFieldValue('custitem_show_add_to_cart'); 
//var hide_add_to_cart = nlapiGetFieldValue('custitem_hide_add_to_cart'); 	

var itemId = nlapiGetRecordId(); //Get item internal ID

if(itemId) {  
  
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
   new nlobjSearchColumn("quantityavailable").setSort(true), 
   new nlobjSearchColumn("custitem15"), 
   new nlobjSearchColumn("custitem24"),
   new nlobjSearchColumn("custitem_show_add_to_cart"),
   new nlobjSearchColumn("custitem_hide_add_to_cart"),

  
]
);
 if(itemSearch && itemId ) {
  var jenne_quantity = itemSearch[0].getValue('custitem15');
  var item = itemSearch[0].getValue('itemid');
  var quantity_available = itemSearch[0].getValue('quantityavailable');
   var show_add_to_cart = itemSearch[0].getValue('custitem_show_add_to_cart');
   var hide_add_to_cart = itemSearch[0].getValue('custitem_hide_add_to_cart');
  //var teledynamic_quantity = itemSearch[0].getValue('custitem24');

}


if(jenne_quantity == null || jenne_quantity =='')
  		jenne_quantity = parseInt(0)
//if(teledynamic_quantity == null || teledynamic_quantity =='') 
  	//	teledynamic_quantity = parseInt(0)
if(quantity_available == null || quantity_available ==''){
  quantity_available = parseInt(0) ; 
}

 var vendor_stock = parseInt(jenne_quantity) + parseInt(quantity_available);

  if(itemId) {
 nlapiLogExecution('Debug','Item name: ',  item)
  }
       		nlapiLogExecution('Debug','Jenne: ',  jenne_quantity)
          	//nlapiLogExecution('Debug','tele : ',  teledynamic_quantity)
            nlapiLogExecution('Debug','stock : ',  quantity_available)
            nlapiLogExecution('Debug','vendor stock : ',  vendor_stock)
  			
  
	    	nlapiSetFieldValue('custitem_vendor_stock', parseInt(vendor_stock) ) ;
		//	nlapiSetFieldValue('custitem_vendor_stock', parseInt(vendor_stock) ) ;

      if(show_add_to_cart === 'T' || vendor_stock> 0 ){
          nlapiSetFieldValue('custitem_item_availibility', 'in stock') ; 
        }
     
  		if(vendor_stock == 0 || vendor_stock == null || vendor_stock == undefined || hide_add_to_cart === 'T'){
        			nlapiSetFieldValue('custitem_item_availibility', 'out of stock') ; 

        }

}



}
