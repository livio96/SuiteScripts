function last_sold() {
 	var context = nlapiGetContext().getExecutionContext()
   
   var userId = nlapiGetUser();
    var item_id = nlapiGetRecordId();

    if (item_id != null && item_id != '') {
        var salesorderSearch = nlapiSearchRecord("salesorder", null,
            [
                ["type", "anyof", "SalesOrd"],
                "AND",
                ["item.internalid", "anyof", item_id]
            ],
            [
                new nlobjSearchColumn("trandate").setSort(true),
                new nlobjSearchColumn("datecreated")

            ]
        );
	
        if (salesorderSearch) {
            var date = salesorderSearch[0].getValue("trandate");
          	if(date != null && date !=0 && date != '')
            nlapiSetFieldValue('custitem_last_sale', date)
        }
    }
    
}

function quantity_sold_last_30_days() {

    var context = nlapiGetContext().getExecutionContext()
    var userId = nlapiGetUser();
    if(userId === 1692630 || userId === 1708326) {
        var item_id = nlapiGetRecordId();

        if (item_id != null) {
          
   var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["type","anyof","SalesOrd"], 
   "AND", 
   ["trandate","after","thirtydaysago"], 
   "AND", 
  // ["customermain.entityid","doesnotcontain","ATHQ"], 
  // "AND", 
  // ["customermain.entityid","doesnotcontain","Newegg"], 
  // "AND", 
  // ["customermain.entityid","doesnotcontain","buy.com"], 
 //  "AND", 
 //  ["customermain.entityid","doesnotcontain","ebay"], 
 //  "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("quantity",null,"SUM"), 
   new nlobjSearchColumn("altname","customerMain","COUNT"), 
   new nlobjSearchColumn("tranid",null,"COUNT")
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_30days = salesorderSearch[0].getValue("quantity",null,"SUM");
            if(qty_sold_last_30days !='' && qty_sold_last_30days !=null)
          nlapiLogExecution('Debug', 'Item: ', nlapiGetRecordId())
          nlapiSetFieldValue('custitem_quantity_sold_last_30_days', qty_sold_last_30days)
         
          }
          
          
        }
    
      
   }

}

function quantity_sold_7days() {

    var context = nlapiGetContext().getExecutionContext()
    var userId = nlapiGetUser();
   if(userId === 1692630 || userId === 1708326) {
        var item_id = nlapiGetRecordId();

        if (item_id != null) {
          
   var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["type","anyof","SalesOrd"], 
    "AND", 
   ["trandate","after","lastweektodate"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("quantity",null,"SUM"), 
   new nlobjSearchColumn("altname","customerMain","COUNT"), 
   new nlobjSearchColumn("tranid",null,"COUNT")
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_7_days = salesorderSearch[0].getValue("quantity",null,"SUM");
          nlapiSetFieldValue('custitem_quantity_sold_last_7_days', qty_sold_last_7_days)
         
          }
          
          
        }
    
      
    }

}



function quantity_sold_yesterday() {

    var context = nlapiGetContext().getExecutionContext()
    var userId = nlapiGetUser();
   if(userId === 1692630 || userId === 1708326) {
        var item_id = nlapiGetRecordId();

        if (item_id != null) {
          
   var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["type","anyof","SalesOrd"], 
    "AND", 
   ["trandate","after","twodaysago"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("quantity",null,"SUM"), 
]
);
          if(salesorderSearch){
          
     
          var qty_sold_yesterday = salesorderSearch[0].getValue("quantity",null,"SUM");
          nlapiSetFieldValue('custitem_quantity_sold_yesterday', qty_sold_yesterday)
         
          }
          
          
        }
    
      
    }

}




function quantity_sold_last_60_days() {

    var context = nlapiGetContext().getExecutionContext()
    var userId = nlapiGetUser();
   // if(userId === 1692630 || userId === 1708326) {
        var item_id = nlapiGetRecordId();

        if (item_id != null) {
          
   var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["type","anyof","SalesOrd"], 
    "AND", 
   ["trandate","after","sixtydaysago"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("quantity",null,"SUM"), 
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_60_days = salesorderSearch[0].getValue("quantity",null,"SUM");
          nlapiSetFieldValue('custitem_quantity_sold_last_60_days', qty_sold_last_60_days)
         
          }
          
          
        }
    
      
  //  }

}

function quantity_sold_last_90_days() {

    var context = nlapiGetContext().getExecutionContext()
    var userId = nlapiGetUser();
   if(userId === 1692630 || userId === 1708326) {
        var item_id = nlapiGetRecordId();

        if (item_id != null) {
          
   var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["type","anyof","SalesOrd"], 
    "AND", 
   ["trandate","after","ninetydaysago"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("quantity",null,"SUM"), 
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_90days = salesorderSearch[0].getValue("quantity",null,"SUM");
          nlapiSetFieldValue('custitem_quantity_sold_last_90_days', qty_sold_last_90days)
         
          }
          
          
        }
    
      
   }

}


function quantity_sold_last_180_days() {

    var context = nlapiGetContext().getExecutionContext()
    var userId = nlapiGetUser();
   if(userId === 1692630 || userId === 1708326) {
        var item_id = nlapiGetRecordId();

        if (item_id != null) {
          
   var salesorderSearch = nlapiSearchRecord("salesorder",null,
[
   ["type","anyof","SalesOrd"], 
    "AND", 
   ["trandate","after","fiscalquarterbeforelasttodate"], 
   "AND", 
   ["item.internalid","anyof",item_id]
], 
[
   new nlobjSearchColumn("quantity",null,"SUM"), 
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_180days = salesorderSearch[0].getValue("quantity",null,"SUM");
          nlapiSetFieldValue('custitem_quantity_sold_last_180', qty_sold_last_180days)
         
          }
          
          
        }
    
      
    }

}


