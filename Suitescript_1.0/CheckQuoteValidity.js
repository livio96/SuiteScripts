function CheckQuoteValidity(){

		var quote_id = nlapiGetRecordId();
  		//make sure quote record exists
  		if(quote_id) {
		var item_record = 0;
		var vendor_stock = 0;
		var flag = 'F';  

        //get the first line item
		var item_id = nlapiGetLineItemValue('item', 'item', '1');
        var item_name = nlapiGetLineItemValue('item', 'item_display', 1 );


         //for each line item 
		var i = 1 ;
		while(item_id != null ){
			item_id = nlapiGetLineItemValue('item', 'item', i);
            item_name = nlapiGetLineItemValue('item','item_display',i);
          	nlapiLogExecution('Debug','Item name', item_name);
			 i= i+1; 
          	 // ignore non-inventory items
			 if(item_id !=null && item_name != "Non-inventory Item") {
			 item_record = nlapiLoadRecord('inventoryitem', item_id);
             //Check vendor stock
			 vendor_stock = item_record.getFieldValue('custitem_vendor_stock') ; 

			 if( vendor_stock == 0 || vendor_stock == null || vendor_stock == 'undefined'){
			 	flag = 'T' ;
			 }

			}
		}

          	nlapiLogExecution('debug', 'flag', flag); 

         //if at least one item is out of stock - send status back to proposal - and uncheck submit for approval
			if(flag === 'T'){
			nlapiSetFieldValue('entitystatus', 10) ; 
          	 nlapiSetFieldValue('custbody_submit_for_approval', 'F');
			nlapiLogExecution('Debug' , 'Final-status' ,nlapiGetFieldValue('entitystatus')); 
		}
	

        }



}
