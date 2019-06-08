function ValidateField() {
			var jenne_cost = nlapiGetFieldValue('custitem14') ; 
            var webstore_brand = nlapiGetFieldValue('custitem_awa_brand') ; 
            nlapiLogExecution('Debug','Category: ',webstore_brand)
            nlapiLogExecution('Debug','jenne cost: ',jenne_cost)

             //If jenne cost is not null 
  			if(jenne_cost !=0 && jenne_cost != null && jenne_cost != undefined) {
        
                   //if webstore brand is Valcom 
        		  if(webstore_brand == 13) {
        				 var logged_in_price = nlapiGetLineItemValue('price','price_1_',7);
                    	 var updated_logged_in_price = Math.round(parseFloat(jenne_cost) + parseFloat(0.15 * jenne_cost))
        			 	 nlapiLogExecution('Debug','Jenne Cost',jenne_cost)
       	 			 	 nlapiLogExecution('Debug','Logged_in_price',logged_in_price)
       	 			 	 nlapiLogExecution('Debug','Category: ',webstore_brand)

    	 				 nlapiSelectNewLineItem('price1');
     	 				 nlapiSetLineItemValue('price', 'price_1_', 7, updated_logged_in_price);
      					 nlapiCommitLineItem('price_1_');
         				 nlapiLogExecution('Debug','Logged_in_price',logged_in_price)

            			}
            }
}
