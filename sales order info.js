function recent_so_info() {
	

var item_id = nlapiGetRecordId(); 

var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["trandate","after","1/1/2018"], 
   "AND", 
   ["type","anyof","SalesOrd"], 
   "AND", 
   ["item","noneof","@NONE@"], 
   "AND", 
   ["item.custitem_awa_is_custom_child","is","T"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("trandate").setSort(true), 
   new nlobjSearchColumn("type"), 
   new nlobjSearchColumn("quantity"), 
   new nlobjSearchColumn("rate"), 
   new nlobjSearchColumn("amount")
]
);


var date = salesorderSearch[0].getValue('trandate') ; 
var quantity = salesorderSearch[0].getValue('quantity') ; 
var rate = salesorderSearch[0].getValue('rate') ; 


nlapiLogExecution('Debug', 'date' date); 
nlapiLogExecution('Debug', 'quantity' quantity); 
nlapiLogExecution('Debug', 'rate' rate); 

	




}