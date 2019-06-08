function ValidateField() {

    
  var itemId = nlapiGetFieldValue('id');
    

  //First Saved Search
  var itemSearch = nlapiSearchRecord("item",null,
[
   ["internalid","anyof",itemId], 
   "AND", 
   ["pricing.pricelevel","anyof",'17']
], 

   new nlobjSearchColumn("formulacurrency").setFormula("{pricing.unitprice}")


);

  //Second saved search
  var itemSearch2 = nlapiSearchRecord("item",null,
[
   ["internalid","anyof",itemId], 
   "AND", 
   ["pricing.pricelevel","anyof",'17']
], 

   new nlobjSearchColumn("averagecost")


);
    
  //Get WebPrice and AverageCost from saved searches  
  var webPrice = itemSearch[0].getValue('formulacurrency');
var averageCost = itemSearch2[0].getValue('averagecost');
   
      nlapiLogExecution('DEBUG', 'averagecost', averageCost);
      nlapiLogExecution('DEBUG', 'formulacurrency', webPrice);

      //Throw an error if the condition is satisfied 
     if (parseFloat(webPrice) < parseFloat(averageCost) ){
    throw nlapiCreateError('E010', 'Unable to upload. Webstore Logged In price is less than the average cost ', true);  
  }
    
}
