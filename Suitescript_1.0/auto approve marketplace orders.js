function auto_approve_fbm(type) {

var etail_channel = nlapiGetFieldValue('custbody_celigo_etail_channel');
    var fulfillment_channel = nlapiGetFieldValue('custbody_celigo_amz_fulfillmentchannel');
    var etail_order_id = nlapiGetFieldValue('custbody_celigo_etail_order_id');

    if (etail_channel != null && fulfillment_channel != 'FBA' && etail_order_id != null) {
        var approve = 'true';

        var item_name = nlapiGetLineItemValue('item', 'item_display', '1');
        var i = 1
        while (item_name != null && item_name != 'CO') {
            item_name = nlapiGetLineItemValue('item', 'item_display', i);
            nlapiLogExecution('Debug', 'item name', item_name)
            if (item_name != null) {
                item_name = item_name.toString()
                i = i + 1

                // Saved search starts here

                var itemSearch = nlapiSearchRecord("item", null,
                    [
                        ["name", "is", item_name],
                        "AND",
                        ["isinactive", "is", "F"],
                        "AND",
                        ["inventorylocation", "anyof", "1", "27"],
                        "AND",
                        ["locationquantityavailable", "greaterthan", "0"]
                    ],
                    [
                        new nlobjSearchColumn("itemid", null, "GROUP"),
                        new nlobjSearchColumn("locationquantityavailable", null, "SUM"),
                        new nlobjSearchColumn("internalid", null, "GROUP")
                    ]
                );
            }

            if (itemSearch) {
                approve = 'true';
            } else {
                approve = 'false';
                return;
            }



        }

        if (approve === 'true')
            nlapiSetFieldValue('orderstatus', 'B');
            nlapiSetFieldValue('custbody_auto_approved', 'T');

    }

}
