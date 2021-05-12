function qty_sold() {

    var item_id = nlapiGetRecordId();

   	var context = nlapiGetContext().getExecutionContext()
   
   	if(context === 'csvimport'){
    if (item_id != null && item_id != '') {
        var salesorderSearch = nlapiSearchRecord("salesorder", null,
            [
                ["type", "anyof", "SalesOrd"],
                "AND",
                //["name", "anyof", "1555367", "1555369", "915421"],
                //"AND",
                //["trandate", "after", "threemonthsago"],
                //"AND",
                ["item.internalid", "anyof", item_id]
            ],
            [
                new nlobjSearchColumn("trandate").setSort(true),
                new nlobjSearchColumn("entity"),
                new nlobjSearchColumn("account"),
                new nlobjSearchColumn("amount"),
                new nlobjSearchColumn("quantity"),
                new nlobjSearchColumn("rate")

            ]
        );


        
        if (salesorderSearch) {
          var length = salesorderSearch.length;
            var i = 0;
            var qty_sum = parseInt(salesorderSearch[0].getValue('quantity'));
            for (i = 0; i < length; i++) {
                qty_sum += parseInt(salesorderSearch[i].getValue('quantity'));
            }
            nlapiSetFieldValue('custitem_qty_sold', qty_sum)

        }
    }
    }
}