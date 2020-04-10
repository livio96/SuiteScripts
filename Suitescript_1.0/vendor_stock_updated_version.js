
/* Suitescript 1.0 
 * Update Vendor Stock (custom field)
 * Created by Livio Beqiri
 */

function stock_calculation() {

    var userId = nlapiGetUser();

    var item_id = nlapiGetFieldValue('itemid');
    nlapiLogExecution('Debug', 'item', item_id)


 if (item_id && userId === 1692630) {
    var inventoryitemSearch = nlapiSearchRecord("inventoryitem", null,
        [
            ["custitem_awa_is_custom_parent", "is", "F"],
            "AND",
            ["isinactive", "is", "F"],
            "AND",
            ["name", "doesnotcontain", "retired"],
            "AND",
            ["type", "anyof", "InvtPart"],
            "AND",
            ["inventorylocation", "anyof", "1", "27"],
            "AND",
            ["internalid", "is", item_id],
            "AND",
            ["custrecord_sw_item.custrecord_sw_quantity_available", "greaterthan", "0"]
        ],
        [
            new nlobjSearchColumn("itemid", null, "GROUP"),
            new nlobjSearchColumn("custrecord_sw_quantity_available", "CUSTRECORD_SW_ITEM", "SUM"),
            new nlobjSearchColumn("locationquantityavailable", null, "SUM"),
            new nlobjSearchColumn("custrecord_vifi_quantity", "CUSTRECORD_VIFI_ITEM", "SUM")
        ]
    );



        if (inventoryitemSearch && item_id) {
            var quantity_available = itemSearch[0].getValue("locationquantityavailable", null, "SUM");
            var amazon_quantity_available =  itemSearch[0].getValue("custrecord_sw_quantity_available", "CUSTRECORD_SW_ITEM", "SUM");
            var vendor_quantity_available =  itemSearch[0].getValue("custrecord_vifi_quantity", "CUSTRECORD_VIFI_ITEM", "SUM");
        }
    
          
          if(quantity_available === '' || quantity_available === null){
          	quantity_available = parseFloat(0);
          }

          if(amazon_quantity_available === '' || amazon_quantity_available === null){
          	amazon_quantity_available = parseFloat(0);
          }

          if(vendor_quantity_available === '' || vendor_quantity_available === null){
          	vendor_quantity_available = parseFloat(0);
          }


          nlapiSetFieldValue('custitem_vendor_stock',quantity_available+amazon_quantity_available+vendor_quantity_available);
          nlapiSetFieldValue('custitem_telquest_quantity',quantity_available + amazon_quantity_available ); 

      }

}
