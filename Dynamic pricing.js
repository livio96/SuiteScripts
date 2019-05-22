function ChangePrice() {

  		
  
	 	var jenne_cost = nlapiGetFieldValue('custitem14') ; 
	 	var logged_in_price = nlapiGetLineItemValue('price','price_1_',7);
	 	var on_hand = nlapiGetFieldValue('totalquantityonhand')

		nlapiLogExecution('Debug','Jenne Cost',jenne_cost) ; 
        nlapiLogExecution('Debug','Logged_in_price',logged_in_price) ; 
		nlapiLogExecution('Debug','On Hand',on_hand) ; 

        
  		if(on_hand==0 && jenne_cost !=0 ) {
               var updated_logged_in_price = Math.round(parseFloat(jenne_cost) + parseFloat(0.15 * jenne_cost))
               nlapiLogExecution('Debug','updated logged in price',updated_logged_in_price) ; 

         	   nlapiSelectNewLineItem('price');
     	 	   nlapiSetLineItemValue('price', 'price_1_', 7, updated_logged_in_price);
      		   nlapiCommitLineItem('price_1_');

        }


}