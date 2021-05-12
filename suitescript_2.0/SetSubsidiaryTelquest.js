function setSubsidiaryToTelquest_before_submit(){
	
	var created_from_request = nlapiGetFieldValue('custitem_created_from_nir');
   if(created_from_request != null && created_from_request != ''){
     	nlapiLogExecution('Debug', 'Created from: ', created_from_request);
     	nlapiSetFieldValue('subsidiary', 1 ) ;
        var sales_description = nlapiGetFieldValue('salesdescription')
        nlapiSetFieldValue('pagetitle', sales_description )
   }

}