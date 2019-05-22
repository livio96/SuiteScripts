function ChangePrice() {

  		
  
	 	var jenne_cost = nlapiGetFieldValue('custitem14') ;
  	 	var jenne_quantity = nlapiGetFieldValue('custitem15') ; 
	 	var logged_in_price = nlapiGetLineItemValue('price','price_1_',7);
	 	var on_hand = nlapiGetFieldValue('totalquantityonhand')
       	var logged_out_price = nlapiGetLineItemValue('price','price_1_',8);
		var price_checker = nlapiGetFieldValue('custitem_price_checker') ; 

		nlapiLogExecution('Debug','Jenne Cost',jenne_cost) ; 
        nlapiLogExecution('Debug','Logged_in_price',logged_in_price) ; 
		nlapiLogExecution('Debug','On Hand',on_hand) ; 
		nlapiLogExecution('Debug','Logged Out price',logged_out_price) ; 
		nlapiLogExecution('Debug','Price Checker',price_checker) ; 


  		if(on_hand==0 && jenne_cost !=0 && jenne_quantity != 0 ) {
         	  // nlapiSetFieldValue('custitem_price_checker',logged_in_price) ; 
               var updated_logged_in_price = Math.round(parseFloat(jenne_cost) + parseFloat(0.15 * jenne_cost))
               nlapiLogExecution('Debug','updated logged in price',updated_logged_in_price) ; 
         	   nlapiSelectNewLineItem('price');
     	 	   nlapiSetLineItemValue('price', 'price_1_', 7, updated_logged_in_price);
      		   nlapiCommitLineItem('price_1_');

        }
  
  		if(on_hand>0){
               nlapiSelectNewLineItem('price');
     	 	   nlapiSetLineItemValue('price', 'price_1_', 7, price_checker);
      		   nlapiCommitLineItem('price_1_');
        }

  		//if quantity on hand is 0 and jenne quantity is 0, set logged in price equal to logged out price
  		if(on_hand==0 && (jenne_quantity == null || jenne_quantity ==0 || jenne_quantity==undefined) ) {
      
          	nlapiLogExecution('Debug','Logged Out price',logged_out_price) ; 
           	   nlapiSelectNewLineItem('price');
     	 	   nlapiSetLineItemValue('price', 'price_1_', 7, logged_out_price);
      		   nlapiCommitLineItem('price_1_');
        }

}
