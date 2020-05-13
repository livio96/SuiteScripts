/*Calculate Vendor Stock (custom field) 
 * Created by Livio Beqiri
 * 05/19/2019
*/

function stock_calculation(){

    nlapiLogExecution('Debug', 'Success', 'Success')
    var item_id = nlapiGetFieldValue('internalid');
    var item_name = nlapiGetFieldValue('itemid');
    var smart_webstore_qty = parseFloat(0);
    var vendor_quantity = 0 ;
    var telquest_quantity_24P = 0;
    var telquest_quantity_A = 0;

    //Get Smart Vendor Quantity
    var customrecord_swSearch = nlapiSearchRecord("customrecord_sw",null,
        [
            ["custrecord_sw_item","anyof",item_id],
            "AND",
            ["custrecord_sw_webstore","anyof","1"]
        ],
        [
            new nlobjSearchColumn("custrecord_sw_quantity_available",null,"SUM"),
       		new nlobjSearchColumn("custrecord_sw_item",null,"GROUP")
        ]
    );

    if (customrecord_swSearch) {
        smart_webstore_qty = parseFloat(customrecord_swSearch[0].getValue("custrecord_sw_quantity_available",null,"SUM"));
        if(smart_webstore_qty === null || smart_webstore_qty === ''){
          smart_webstore_qty  = parseFloat(0);
        } 
    }


    //Get Vendor Quantity
    var customrecord_awa_vendor_info_itemsSearch = nlapiSearchRecord("customrecord_awa_vendor_info_items",null,
        [
            ["isinactive","is","F"],
            "AND",
            ["custrecord_vifi_item","anyof",item_id]
        ],
        [
            new nlobjSearchColumn("custrecord_vifi_quantity",null,"SUM")
        ]
    );

     if(customrecord_awa_vendor_info_itemsSearch){
         vendor_quantity = customrecord_awa_vendor_info_itemsSearch[0].getValue("custrecord_vifi_quantity",null,"SUM");
         if(vendor_quantity === null || vendor_quantity === '')
          vendor_quantity  = parseFloat(0);
     }

     //Get Telquest Quantity
    var inventoryitemSearch = nlapiSearchRecord("inventoryitem",null,
        [
            ["isinactive","is","F"],
            "AND",
            ["name","doesnotcontain","retired"],
            "AND",
            ["type","anyof","InvtPart"],
            "AND",
            ["inventorylocation","anyof","27"],
            "AND",
            ["name","contains",item_name]
            
        ],
        [
            new nlobjSearchColumn("locationquantityavailable",null,"GROUP")
        ]
    );
     
     if(inventoryitemSearch){
         telquest_quantity_24P = inventoryitemSearch[0].getValue("locationquantityavailable",null,"GROUP");
          if(telquest_quantity_24P === null || telquest_quantity_24P === '')
          telquest_quantity_24P  = parseFloat(0);
     }
     
  
    var inventoryitemSearch = nlapiSearchRecord("inventoryitem",null,
        [
            ["isinactive","is","F"],
            "AND",
            ["name","doesnotcontain","retired"],
            "AND",
            ["type","anyof","InvtPart"],
            "AND",
            ["inventorylocation","anyof","1"],
            "AND",
            ["name","contains",item_name]
        ],
        [
            new nlobjSearchColumn("locationquantityavailable",null,"GROUP")
        ]
    );
     
     if(inventoryitemSearch){
         telquest_quantity_A = inventoryitemSearch[0].getValue("locationquantityavailable",null,"GROUP");
        if(telquest_quantity_A === null || telquest_quantity_A === '')
          telquest_quantity_A  = parseFloat(0);
     }
     
      
         nlapiLogExecution('Debug', 'vendor_qty', vendor_quantity)
    nlapiLogExecution('Debug', 'smart web', smart_webstore_qty)
    nlapiLogExecution('Debug', 'A',telquest_quantity_A )
    nlapiLogExecution('Debug', '24p', telquest_quantity_24P)

     nlapiSetFieldValue('custitem_vendor_stock', parseFloat(telquest_quantity_24P) +parseFloat(smart_webstore_qty)+parseFloat(vendor_quantity) + parseFloat(telquest_quantity_A));
    
}


