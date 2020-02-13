function vendor_stock() {

  var item_id = nlapiGetFieldValue('internalid');

    var itemSearch = nlapiSearchRecord("item", null,
        [
            ["internalid", "anyof", item_id]
        ],
        [
            new nlobjSearchColumn("quantityavailable").setSort(true)



        ]
    );

    var quantity_available = itemSearch[0].getValue('quantityavailable');
    var customrecord_awa_vendor_info_itemsSearch = nlapiSearchRecord("customrecord_awa_vendor_info_items", null,
        [
            ["custrecord_vifi_item", "anyof", item_id]
        ],
        [
            new nlobjSearchColumn("custrecord_vifi_quantity")

        ]
    );


    if (customrecord_awa_vendor_info_itemsSearch) {
        var qty = 0;
        var vendor_stock = nlapiGetFieldValue('custitem_vendor_stock');

        for (i = 0; i < customrecord_awa_vendor_info_itemsSearch.length; i++) {
            qty += parseFloat(customrecord_awa_vendor_info_itemsSearch[i].getValue('custrecord_vifi_quantity'));

        }

        if (vendor_stock != null && vendor_stock != 0)
            vendor_stock = parseFloat(vendor_stock) + parseFloat(qty);
        else {
            vendor_stock = parseFloat(qty);
        }

        nlapiSetFieldValue('custitem_vendor_stock', vendor_stock);

    }

}
