function close_rmas(type, id){

   var status =  nlapiGetFieldValue('status'); 
   var context = nlapiGetContext().getExecutionContext()
  			nlapiLogExecution('Debug', 'Status', status)
     
     
           var rec = nlapiLoadRecord(type, id);
     
  			var item_name = rec.getLineItemValue('item','item_display',1);

   			var i = 1 ;
			while(item_name != null ){
           	    rec.setLineItemValue('item', 'isclosed', i, 'T');
				 i= i+1; 
          		item_name = rec.getLineItemValue('item','item_display',i);
			}
     
           nlapiSubmitRecord(rec, false, true)
     
   
		
}

