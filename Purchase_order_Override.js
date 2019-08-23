function vendor_override_checkbox(){

  	var checkbox =  nlapiGetFieldValue('shipoverride'); 
  	 nlapiLogExecution('Debug','Override Checkbox',checkbox);

  	nlapiSetFieldValue('shipoverride', 'F') ;
  var new_checkbox =  nlapiGetFieldValue('shipoverride'); 
  nlapiLogExecution('Debug','Override Checkbox',new_checkbox);
  
  
  

/*
	var vendor = nlapiGetFieldValue('entity') ; //Get Vendor Name
	var vendor_internal_id = nlapiLookupField('vendor', vendor, 'internalid');
	var vendor_name = nlapiLookupField('vendor', vendor, 'companyname');
     var vendor_record = nlapiLoadRecord('vendor', vendor_internal_id)
	var shipoverride = nlapiGetFieldValue('shipoverride');
	 nlapiLogExecution('Debug','ShipOverride',shipoverride);

	 nlapiLogExecution('Debug','Vendor Name',vendor_name);



	var overidecheckbox = vendor_record.getLineItemValue('addressbook','override_initialvalue',1); 
		 nlapiLogExecution('Debug','Old Checkbox',overidecheckbox);
                    

    // vendor_record.selectLineItem('addressbook','override_initialvalue',1);
	//var new_checkbox = vendor_record.setLineItemValue('addressbook','override_initialvalue',1, 'T');
	//vendor_record.commitLineItem('addressbook','override_initialvalue',1);
	vendor_record.setLineItemValue('addressbook','override_initialvalue',1, 'T');

	overidecheckbox = vendor_record.getLineItemValue('addressbook','override_initialvalue',1); 
	nlapiLogExecution('Debug','new Checkbox',overidecheckbox);
    nlapiSubmitRecord(vendor_record);


  */                


}