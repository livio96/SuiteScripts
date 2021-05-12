/* Suitescript 1.0 
 * Do not allow Website Logged In price level to be less than interconnect minimum selling price
 * Created by Livio Beqiri
*/


function CheckAverageCost() {

 
      var interconnect_min_selling_price = nlapiGetFieldValue('custitemminimumsellingprice'); 
      //var jenne_cost= nlapiGetFieldValue('custitem14'); 
      //var price_checker = nlapiGetFieldValue('custitem_price_checker'); 
     var logged_in_price = nlapiGetLineItemValue('price','price_1_',10);
     nlapiLogExecution('Debug','Logged in price: ', logged_in_price) ; 
       nlapiLogExecution('Debug','averega cost: ', interconnect_min_selling_price) ; 

     if (  parseFloat(logged_in_price) < parseFloat(interconnect_min_selling_price)   ){
    throw nlapiCreateError('E010', 'Unable to upload. WEBSTORE LOGGED IN PRICE ('+logged_in_price+') is less than the INTERCONNECT MINIMUM SELLING PRICE ('+interconnect_min_selling_price+')', true);  
  }
    
}