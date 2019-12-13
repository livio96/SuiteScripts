function auto_close_rmas(){

   var status =  nlapiGetFieldValue('status'); 
   var context = nlapiGetContext().getExecutionContext()
   if(context === 'csvimport'){
  			nlapiLogExecution('Debug', 'Status', status)
  			var item_name = nlapiGetLineItemValue('item','item_display',1);

   			var i = 1 ;
			while(item_name != null ){
           	    nlapiSetLineItemValue('item', 'isclosed', i, 'T');
				 i= i+1; 
          		item_name = nlapiGetLineItemValue('item','item_display',i);
			}
     
   }
		
}

