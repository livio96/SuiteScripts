function vendor_info_for_item_update() {


    var customrecord_viSearch = nlapiSearchRecord("customrecordcustomrecord_vi", null,
        [
            ["custrecord_vi_vendor", "anyof", "20364"]
        ],
        [
            new nlobjSearchColumn("custrecordvi_suffix"),
            new nlobjSearchColumn("custrecord_vi_file_id"),
            new nlobjSearchColumn("custrecord_vi_vendor_sku"),
            new nlobjSearchColumn("custrecord_vi_vendor_cost"),
            new nlobjSearchColumn("custrecord_vi_vendor_quantity")
        ]
    );

    if (customrecord_viSearch) {
        var suffix = customrecord_viSearch[0].getValue('custrecordvi_suffix');
        var file_id = customrecord_viSearch[0].getValue('custrecord_vi_file_id');
        var vendor_sku = customrecord_viSearch[0].getValue('custrecord_vi_vendor_sku');
        var cost = customrecord_viSearch[0].getValue('custrecord_vi_vendor_cost');
        var quantity = customrecord_viSearch[0].getValue('custrecord_vi_vendor_quantity');




        var external_id = nlapiGetFieldValue('externalid');
        //nlapiLogExecution('Debug', 'Ext ID', external_id);
        // load csv file from file cabinet
        var arrLines = nlapiLoadFile(file_id).getValue().split(/\n|\n\r/);
  
        // loop to get all lines
        for (var i = 1; i < arrLines.length - 1; i++) {
            var content = arrLines[i].split(',');
			
            // add the columns of the CSV file here
            var imported_sku = content[vendor_sku]; //first column
   
            if (imported_sku + suffix === external_id) {
                var imported_cost = content[cost]; //2nd column
                var imported_qty = content[quantity]; //3rd column

                var customrecord_awa_vendor_info_itemsSearch = nlapiSearchRecord("customrecord_awa_vendor_info_items", null,
                    [
                        ["externalid", "anyof", external_id]
                    ],
                    [
                        new nlobjSearchColumn("internalid")


                    ]
                );


                nlapiSetFieldValue('custrecord_vifi_cost', imported_cost);
                nlapiSetFieldValue('custrecord_vifi_quantity', imported_qty);


            }
        }

    }

    
}