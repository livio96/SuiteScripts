function create_externalid(){
	
	var comparable_item = nlapiGetFieldValue('custrecord_cmp_cmp_item'); 
	var item = nlapiGetFieldValue('custrecord_cmp_item'); 

	nlapiSetFieldValue('externalid', comparable_item+item);



}

function create_externalid_compatability(){
	
	var compatible_item = nlapiGetFieldValue('custrecord_compatible_item'); 
	var item = nlapiGetFieldValue('custrecord_c_item'); 
    
	nlapiSetFieldValue('externalid', compatible_item+item);



}