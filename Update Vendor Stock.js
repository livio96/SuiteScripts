function UpdateVendorStockField() {



var jenne_quantity  = nlapiGetFieldValue('custitem15')
var teledynamic_quantity = nlapiGetFieldValue("custitem24")
var in_stock = nlapiGetFieldValue('totalquantityonhand')




if(jenne_quantity == null || jenne_quantity== undefined || jenne_quantity =='')
  		jenne_quantity = parseInt(0)
if(teledynamic_quantity == null || teledynamic_quantity== undefined || teledynamic_quantity =='') 
  		teledynamic_quantity = parseInt(0)

 var vendor_stock = parseInt(jenne_quantity) + parseInt(teledynamic_quantity) + parseInt(in_stock);
  
        nlapiLogExecution('Debug','Jenne: ',  jenne_quantity)
          nlapiLogExecution('Debug','tele : ',  teledynamic_quantity)
            nlapiLogExecution('Debug','stock : ',  in_stock)
            nlapiLogExecution('Debug','vendor stock : ',  vendor_stock)
  
	    nlapiSetFieldValue('custitem_vendor_stock', parseInt(vendor_stock) )

}

