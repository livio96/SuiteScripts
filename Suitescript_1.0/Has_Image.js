function has_image(){

	nlapiLogExecution('Debug', 'Item: ', nlapiGetFieldValue('itemid')) ; 
	
	var image_nkey = nlapiGetLineItemValue('itemimages', 'nkey', 1) ; 
	nlapiLogExecution('Debug', 'Nkey ', image_nkey) ; 

	if(image_nkey != null ) {
		nlapiSetFieldValue('custitem_has_image_attached' , 'T') 
	}
	else{
			nlapiSetFieldValue('custitem_has_image_attached' , 'T') 
	}

	nlapiLogExecution('Debug', 'Has Image: ', nlapiGetFieldValue('custitem_has_image_attached')) ; 

}