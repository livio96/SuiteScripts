function ValidateField() {

    
  var itemId = nlapiGetFieldValue('id');
    

  //Perform a saved search to get the average cost
  var itemSearch2 = nlapiSearchRecord("item",null,
[
   ["internalid","anyof",itemId], 
   "AND", 
   ["pricing.pricelevel","anyof",'17']
], 

   new nlobjSearchColumn("averagecost")


);
    

//Get the average cost from the saved search   
var averageCost = itemSearch2[0].getValue('averagecost');
 var price_checker = nlapiGetFieldValue('custitem_price_checker'); 
      nlapiLogExecution('DEBUG', 'averagecost', averageCost);
      nlapiLogExecution('DEBUG', 'custitem_price_checker', price_checker);

     if ( parseFloat(price_checker) < parseFloat(averageCost) ){
    throw nlapiCreateError('E010', 'Unable to upload. Webstore Logged In price is less than the average cost ', true);  
  }
    
}