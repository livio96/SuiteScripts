function estimated_total_value(){
	
  	var tran_id = nlapiGetFieldValue('tranid'); 
  	nlapiLogExecution('Debug', 'Tranasction ID', tran_id); 
	var item_name = nlapiGetLineItemValue('inventory', 'item_display', '1');
	var adj_qty = nlapiGetLineItemValue('inventory', 'adjustqtyby', '1'); 
	var unit_cost = nlapiGetLineItemValue('inventory', 'avgunitcost', '1'); 


         //for each line item 
		var i = 1 ;
		var estimated_total_value = 0 ; 
		var temp_sum = 0 ; 
		while(item_name != null ){
            item_name = nlapiGetLineItemValue('inventory','item_display',i);
          	 // ignore non-inventory items
			 if(item_name !=null) {
			 	adj_qty = nlapiGetLineItemValue('inventory', 'adjustqtyby', i); 
			 	unit_cost = nlapiGetLineItemValue('inventory', 'unitcost', i); 
			 	temp_sum = adj_qty * unit_cost
				estimated_total_value += temp_sum; 
			}
				temp_sum = 0; 
          		i= i+1; 

		}
       nlapiSetFieldValue('custbody_estimated_total_value', estimated_total_value) ; 
}


