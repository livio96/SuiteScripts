function pageInit() {



	var itemId = nlapiGetFieldValue('itemId') ; //Get the internal item ID

	//Do a saved search 

	var Search_quantity_on_hand = nlapiSearchRecord("item", null,

			[

				["internalid", "anyof", "itemId"]

			],

			new nlobjSearchColumn("quantityonhand") 


	);

     
    var jenne_cost = nlapiGetFieldValue('custitem14')
    var price_checker = nlapiGetFieldValue('custitem_price_checker')
    //var quantityOnHand = nlapiGetFieldValue('totalquantityonhand')
	var quantityOnHand = nlapiGetFieldValue('custitem32')
  		 //Get Price level values 
        var logged_in_price = nlapiGetLineItemValue('price', 'price_1_', '8') 
 		if(quantityOnHand<=0) {
         nlapiSetLineItemValue('price', 'price_1_', '8', jenne_cost)
        }
  		else{
          nlapiSetLineItemValue('price', 'price_1_', '8', price_checker)
        }




}