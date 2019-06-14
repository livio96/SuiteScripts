function recent_so_info() {
	

var item_id = nlapiGetRecordId(); 

  if(item_id !=null) {
  
var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["trandate","after","1/1/2017"], 
   "AND", 
   ["type","anyof","SalesOrd"],
   "AND", 
   ["subsidiary","anyof","1"], 
   "AND", 
   ["item","noneof","@NONE@"], 
   "AND", 
   ["item.custitem_awa_is_custom_child","is","T"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("trandate").setSort(true), 
   //new nlobjSearchColumn("amount"), 
   //new nlobjSearchColumn("quantity")
   new nlobjSearchColumn("rate")

]
);

/*if(salesorderSearch) {
//var date = salesorderSearch[0].getValue('trandate') ; 
//var amount = salesorderSearch[0].getValue('amount') ; 
//var quantity = salesorderSearch[0].getValue('quantity') ; 
  
 var rate = parseFloat(amount/quantity) ; 
  
nlapiLogExecution('Debug', 'rate', rate); 

	  
     nlapiSetFieldValue('custitem_so_rate', rate) ; 

}
*/

var search_length = 0;

    if (salesorderSearch) {
      if (salesorderSearch.length < 5) {
        search_length = salesorderSearch.length;
      } 
      else
          search_length = 5;

      nlapiLogExecution("Debug", "length", search_length);

      var sum = 0;
      for (var i = 0; i < search_length; i++) {
        nlapiLogExecution("Debug", "Value ", salesorderSearch[i].getValue("rate")
        );
        sum += parseFloat(salesorderSearch[i].getValue("rate"));
      }
    }

    if (search_length > 0) {
      var rate = parseFloat(sum / search_length);

      nlapiLogExecution("Debug", "rate", rate);

      nlapiSetFieldValue("custitem_so_rate", rate);
    }

  }

}
