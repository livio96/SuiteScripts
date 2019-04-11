function ValidateField() {



	var jenne_quantity  = nlapiGetFieldValues('custitem15')
	var teledynamic_quantity = nlapiGetFieldValues("custitem24")
    var vendor_stock = parseInt(jennequantity) + parseInt(teledynamic_quantity);  
	nlapiSetFieldValues('vendorstock', vendor_stock )



}
