
function ValidateField() {

	// load an item record
//var record = nlapiLoadRecord('inventoryitem', 536);

// get the value of the currency field on line 2
//var currency = record.getLineItemValue('price1', 'currency', '2');


	var itemId = nlapiGetFieldValue('itemId') ; //Get the internal item ID

	//Do a saved search 

	var itemSearch = nlapiSearchRecord("item", null,

			[

				["internalid", "anyof", "itemId"]

			],

			new nlobjSearchColumn("quantityonhand") 


	);
  
  
  var itemSearch2 = nlapiSearchRecord("item", null,

			[

				["internalid", "anyof", "itemId"]

			],

			new nlobjSearchColumn("baseprice") 


	);

      var search = nlapiSearchRecord('price', 'price' , null , 1);
		for(var i in search)
		{
			var internalId = search[i].getId();
			var recType = search[i].getRecordType();
			var price = nlapiLookupField(recType,internalId,'name');
            alert(price)
}  

//Get Discounts
// returns the discount from line item 2
var discount2 = nlapiGetLineItemValue('price1', 'discount', '2');
var discount3 = nlapiGetLineItemValue('price1', 'discount', '3');
var discount4 = nlapiGetLineItemValue('price1', 'discount', '4');


  //Get Price level names
var pricelevelname1 = nlapiGetLineItemValue('price1', 'pricelevelname', '1')
var pricelevelname2 = nlapiGetLineItemValue('price1', 'pricelevelname', '2')
var pricelevelname3 = nlapiGetLineItemValue('price1', 'pricelevelname', '3')
  
   //Get Price level values 
   var price1 = nlapiGetLineItemValue('price1', 'price_1_', '1')
   var price2 = nlapiGetLineItemValue('price1', 'price_1_', '2') 
   var price3 = nlapiGetLineItemValue('price1', 'price_1_', '3')
		alert( pricelevelname1 + ' : ' + price1 );
 		alert( pricelevelname2 + ' : ' + price2 );
  		alert( pricelevelname3  + ' : ' + price3);



}