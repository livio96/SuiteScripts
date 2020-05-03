/*function amazon_pricing() {

    var item_id = nlapiGetRecordId();
  
   var context = nlapiGetContext().getExecutionContext()
   
   var userId = nlapiGetUser();
      if(userId === 1692630) {
      
    if (item_id != null && item_id != '') {
        var salesorderSearch = nlapiSearchRecord("salesorder", null,
            [
                ["type", "anyof", "SalesOrd"],
                "AND",
                ["name", "anyof", "1555367","1184845","1555369","1362730"],
                "AND",
                ["trandate", "after", "threemonthsago"],
                "AND",
                ["item.internalid", "anyof", item_id]
            ],
            [
                new nlobjSearchColumn("trandate").setSort(true),
                new nlobjSearchColumn("rate")

            ]
        );

        if (salesorderSearch) {
            var rate = salesorderSearch[0].getValue('rate');
          	if(rate != null && rate !=0 && rate != '')
            nlapiSetFieldValue('custitem_amazon_price', rate)
        }
    }
     
   }
}

function ebay_pricing() {

    var item_id = nlapiGetRecordId();
 	
  var context = nlapiGetContext().getExecutionContext()
   
  var userId = nlapiGetUser();
      if(userId === 1692630) {
     
    if (item_id != null && item_id != '') {
        var salesorderSearch = nlapiSearchRecord("salesorder", null,
            [
                ["type", "anyof", "SalesOrd"],
                "AND",
                ["name", "anyof", "1256943"],
                "AND",
                ["trandate", "after", "threemonthsago"],
                "AND",
                ["item.internalid", "anyof", item_id]
            ],
            [
                new nlobjSearchColumn("trandate").setSort(true),
                new nlobjSearchColumn("rate")

            ]
        );

        if (salesorderSearch) {
            var rate = salesorderSearch[0].getValue('rate');
          	if(rate != null && rate !=0 && rate != '')
            nlapiSetFieldValue('custitem_ebay_price', rate)
        }
    }
   }
}


function newegg_pricing() {

    var item_id = nlapiGetRecordId();
 	var context = nlapiGetContext().getExecutionContext()
   
   	var userId = nlapiGetUser();
      if(userId === 1692630) {
    if (item_id != null && item_id != '') {
        var salesorderSearch = nlapiSearchRecord("salesorder", null,
            [
                ["type", "anyof", "SalesOrd"],
                "AND",
                ["name", "anyof", "742058", "651816", "733703"],
                "AND",
                ["trandate", "after", "threemonthsago"],
                "AND",
                ["item.internalid", "anyof", item_id]
            ],
            [
                new nlobjSearchColumn("trandate").setSort(true),
                new nlobjSearchColumn("rate")

            ]
        );

        if (salesorderSearch) {
            var rate = salesorderSearch[0].getValue('rate');
           
          	if(rate != null && rate !=0 && rate != '')
            nlapiSetFieldValue('custitem_newegg_price', rate)
        }
    }
    }
}
*/
function last_sold() {
 	var context = nlapiGetContext().getExecutionContext()
   
   var userId = nlapiGetUser();
      if(userId === 1692630 || userId === 1708326) {
    var item_id = nlapiGetRecordId();

    if (item_id != null && item_id != '') {
        var salesorderSearch = nlapiSearchRecord("salesorder", null,
            [
                ["type", "anyof", "SalesOrd"],
                //"AND",
                //["trandate", "after", "threemonthsago"],
                "AND",
                ["item.internalid", "anyof", item_id]
            ],
            [
                new nlobjSearchColumn("trandate").setSort(true),
                new nlobjSearchColumn("datecreated")

            ]
        );
	
        if (salesorderSearch) {
            var date = salesorderSearch[0].getValue('datecreated');
          	if(date != null && date !=0 && date != '')
            nlapiSetFieldValue('custitem_last_sale', date)
        }
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
          //var number_of_customers = salesorderSearch[0].getValue("altname","customerMain","COUNT");
          //var number_of_records = salesorderSearch[0].getValue("tranid",null,"COUNT");
            if(qty_sold_last_30days !='' && qty_sold_last_30days !=null)
          nlapiLogExecution('Debug', 'Item: ', nlapiGetRecordId())
          nlapiSetFieldValue('custitem_quantity_sold_last_30_days', qty_sold_last_30days)
          //nlapiSetFieldValue( 'custitem_number_of_cust_last_30', number_of_customers)
          //nlapiSetFieldValue('custitem_number_of_sales_orders_30', number_of_records)
         
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
         // var number_of_customers = salesorderSearch[0].getValue("altname","customerMain","COUNT");
         // var number_of_records = salesorderSearch[0].getValue("tranid",null,"COUNT");
          nlapiSetFieldValue('custitem_quantity_sold_last_7_days', qty_sold_last_7_days)
         // nlapiSetFieldValue( 'custitem_number_of_cust_last_7', number_of_customers)
          //nlapiSetFieldValue('custitem_number_of_sales_orders_7', number_of_records)
         
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
   new nlobjSearchColumn("altname","customerMain","COUNT"), 
   new nlobjSearchColumn("tranid",null,"COUNT")
]
);
          if(salesorderSearch){
          
     
          var qty_sold_yesterday = salesorderSearch[0].getValue("quantity",null,"SUM");
         // var number_of_customers = salesorderSearch[0].getValue("altname","customerMain","COUNT");
          //var number_of_records = salesorderSearch[0].getValue("tranid",null,"COUNT");
          nlapiSetFieldValue('custitem_quantity_sold_yesterday', qty_sold_yesterday)
          //nlapiSetFieldValue( 'custitem_number_of_customers_yesterday', number_of_customers)
          //nlapiSetFieldValue('custitem_number_of_sales_orders_yester', number_of_records)
         
          }
          
          
        }
    
      
    }

}




function quantity_sold_last_60_days() {

    var context = nlapiGetContext().getExecutionContext()
    var userId = nlapiGetUser();
    if(userId === 1692630 || userId === 1708326) {
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
   new nlobjSearchColumn("altname","customerMain","COUNT"), 
   new nlobjSearchColumn("tranid",null,"COUNT")
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_60_days = salesorderSearch[0].getValue("quantity",null,"SUM");
          //var number_of_customers = salesorderSearch[0].getValue("altname","customerMain","COUNT");
          //var number_of_records = salesorderSearch[0].getValue("tranid",null,"COUNT");
          nlapiSetFieldValue('custitem_quantity_sold_last_60_days', qty_sold_last_60_days)
          //nlapiSetFieldValue( 'custitem_number_of_customers_yesterday', number_of_customers)
          //nlapiSetFieldValue('custitem_number_of_sales_orders_yester', number_of_records)
         
          }
          
          
        }
    
      
    }

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
   new nlobjSearchColumn("altname","customerMain","COUNT"), 
   new nlobjSearchColumn("tranid",null,"COUNT")
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_90days = salesorderSearch[0].getValue("quantity",null,"SUM");
          //var number_of_customers = salesorderSearch[0].getValue("altname","customerMain","COUNT");
          //var number_of_records = salesorderSearch[0].getValue("tranid",null,"COUNT");
          nlapiSetFieldValue('custitem_quantity_sold_last_90_days', qty_sold_last_90days)
           nlapiLogExecution('Debug', "Success", "Success")
          //nlapiSetFieldValue( 'custitem_number_of_customers_yesterday', number_of_customers)
          //nlapiSetFieldValue('custitem_number_of_sales_orders_yester', number_of_records)
         
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
   new nlobjSearchColumn("altname","customerMain","COUNT"), 
   new nlobjSearchColumn("tranid",null,"COUNT")
]
);
          if(salesorderSearch){
          
     
          var qty_sold_last_180days = salesorderSearch[0].getValue("quantity",null,"SUM");
          //var number_of_customers = salesorderSearch[0].getValue("altname","customerMain","COUNT");
          //var number_of_records = salesorderSearch[0].getValue("tranid",null,"COUNT");
          nlapiSetFieldValue('custitem_quantity_sold_last_180', qty_sold_last_180days)
          //nlapiSetFieldValue( 'custitem_number_of_customers_yesterday', number_of_customers)
          //nlapiSetFieldValue('custitem_number_of_sales_orders_yester', number_of_records)
         
          }
          
          
        }
    
      
    }

}


