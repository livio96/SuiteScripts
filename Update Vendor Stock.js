function UpdateVendorStockField() {

var itemInternalId = nlapiGetRecordId() ; 
var subsidiary = nlapiGetFieldValue('subsidiary');

  
if(subsidiary !=null && itemInternalId !=null) {
  

var itemSearch = nlapiSearchRecord("item",null,
			[
			["internalid","anyof",itemInternalId],
			//"AND",
			//["subsidiary","anyof",subsidiary]
			],
			[
		
			new nlobjSearchColumn("locationquantityonhand"),
			new nlobjSearchColumn("name","inventoryLocation").setSort('true')

			]
		)

}
  
//If number of results > 1 
if(itemSearch) {

  var defective = itemSearch[7].getValue('locationquantityonhand') ; 

var jenne_quantity  = nlapiGetFieldValue('custitem15')
var teledynamic_quantity = nlapiGetFieldValue("custitem24")
var in_stock = nlapiGetFieldValue('totalquantityonhand')
  var location = itemSearch[7].getValue("name","inventoryLocation"); 


if(in_stock == null || in_stock== undefined || in_stock == 0) {
  in_stock = parseInt(0)
}

if(jenne_quantity == null || jenne_quantity== undefined || jenne_quantity =='')
  		jenne_quantity = parseInt(0)
if(teledynamic_quantity == null || teledynamic_quantity== undefined || teledynamic_quantity =='') 
  		teledynamic_quantity = parseInt(0)

 var vendor_stock = parseInt(jenne_quantity) + parseInt(teledynamic_quantity) + parseInt(in_stock) - defective;
  
        nlapiLogExecution('Debug','Jenne: ',  jenne_quantity)
          nlapiLogExecution('Debug','tele : ',  teledynamic_quantity)
            nlapiLogExecution('Debug','stock : ',  in_stock)
            nlapiLogExecution('Debug','vendor stock : ',  vendor_stock)
    			nlapiLogExecution('Debug', 'defective ', defective) ; 

    			nlapiLogExecution('Debug', 'location ', location) ; 



	    nlapiSetFieldValue('custitem_vendor_stock', parseInt(vendor_stock) )
}
}

