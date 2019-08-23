function CheckQuoteValidity(){

		//var quote_id = nlapiGetRecordId();
		//var type = nlapiGetRecordType(); 
		var item_record = 0;
		var vendor_stock = 0;
		var flag = false;  

		var item_id = nlapiGetLineItemValue('item', 'item', '1');

		var i = 1 
		while(item_id != null ){
			item_id = nlapiGetLineItemValue('item', 'item', i);
			 i= i+1; 
			 if(item_id !=null) {
			 item_record = nlapiLoadRecord('inventoryitem', item_id);
			 vendor_stock = item_record.getFieldValue('custitem_vendor_stock') ; 

			 if(vendor_stock == 0 || vendor_stock == null || vendor_stock == 'undefined' ){
			 	flag = true ;
			 }

			}
		}


		if(flag = true){
			nlapiSetFieldValue('entitystatus', 10) ; 
			nlapiLogExecution('Debug' , 'Final-status' ,nlapiGetFieldValue('entitystatus')); 
		}
	





}