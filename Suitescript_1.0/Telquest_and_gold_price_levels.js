function update_price_levels(){

 		var logged_in_price = nlapiGetLineItemValue('price','price_1_',10);
 		var telquest_customer_level = nlapiGetLineItemValue('price', 'price_1_', 8) ; 
 		var gold_level = nlapiGetLineItemValue('price','price_1_', 5) ; 

 		var new_telquest_customer_level =  logged_in_price - 0.05*logged_in_price ; 
 		var new_gold_level =  logged_in_price - 0.10*logged_in_price ; 
  		
        nlapiLogExecution('Debug','Telquest Level',new_telquest_customer_level) ; 
        nlapiLogExecution('Debug','Gold Price Level',new_gold_level) ; 

        nlapiSelectNewLineItem('price');
     	nlapiSetLineItemValue('price', 'price_1_', 8, new_telquest_customer_level);
     	nlapiCommitLineItem('price_1_');

        nlapiSelectNewLineItem('price');
       	nlapiSetLineItemValue('price', 'price_1_', 5, new_gold_level);
		nlapiCommitLineItem('price_1_');



}
