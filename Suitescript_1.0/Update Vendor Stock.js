/* Suitescript 1.0 
 * Update Vendor Stock (custom field)
 * Created by Livio Beqiri
 */
function stock_calculation() {

    var userId = nlapiGetUser();

    var item_id = nlapiGetFieldValue('itemid');
    var internal_id = nlapiGetFieldValue('internalid');
    nlapiLogExecution('Debug', 'item', item_id)
 	
 
  
  //  if (item_id && userId === 1692630) {


        var itemSearch = nlapiSearchRecord("item", null,
            [
                ["name", "is", item_id],
                "AND",
                ["inventorylocation", "anyof", "1", "27"],
                "AND",
                ["isinactive", "is", "F"]
            ],
            [
                new nlobjSearchColumn("inventorylocation"),
                new nlobjSearchColumn("locationquantityavailable")
            ]
        );
        if (itemSearch) {
            var quantity_available_wh_A = itemSearch[0].getValue('locationquantityavailable');
            //nlapiLogExecution('Debug', 'wh_a', quantity_available_wh_A )

            if (quantity_available_wh_A == null || quantity_available_wh_A == '') {
                quantity_available_wh_A = parseFloat(0);
            }


            var quantity_available_wh_24P = itemSearch[1].getValue('locationquantityavailable');
            //nlapiLogExecution('Debug', '24p',quantity_available_wh_24P )
            if (quantity_available_wh_24P == null || quantity_available_wh_24P == '') {
                quantity_available_wh_24P = parseFloat(0);
            }
            var quantity_available = parseFloat(quantity_available_wh_A) + parseFloat(quantity_available_wh_24P)
            if (quantity_available == null || quantity_available == '') {
                quantity_available = parseFloat(0);
            }

            var customrecord_awa_vendor_info_itemsSearch = nlapiSearchRecord("customrecord_awa_vendor_info_items", null,
                [
                    ["custrecord_vifi_item", "anyof", internal_id]
                ],
                [
                    new nlobjSearchColumn("custrecord_vifi_quantity")

                ]
            );


            var qty = 0;
            var vendor_stock = 0


            if (customrecord_awa_vendor_info_itemsSearch) {
                for (i = 0; i < customrecord_awa_vendor_info_itemsSearch.length; i++) {
                    if (customrecord_awa_vendor_info_itemsSearch[i].getValue('custrecord_vifi_quantity') != null && customrecord_awa_vendor_info_itemsSearch[i].getValue('custrecord_vifi_quantity') != '')
                        qty += parseFloat(customrecord_awa_vendor_info_itemsSearch[i].getValue('custrecord_vifi_quantity'));

                }
            }
            if (quantity_available == null || quantity_available == '')
                quantity_available = parseFloat(0);
            if (qty == null || qty == '')
                qty = parseFloat(0)



            vendor_stock = parseFloat(qty) + parseFloat(quantity_available);
  			vendor_stock = Math.round(vendor_stock);
            nlapiLogExecution('Debug', 'final ', vendor_stock);

            nlapiSetFieldValue('custitem_vendor_stock', vendor_stock);

        //}
    }
}
