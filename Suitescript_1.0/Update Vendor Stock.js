/* Suitescript 1.0 
 * Update Vendor Stock (custom field)
 * Vendor Stock field is set to quantityavailable + jenne_quantity (custom_field)
 * Created by Livio Beqiri
 */

function stock_calculation() {

    var item_id = nlapiGetRecordId();
    var context = nlapiGetContext().getExecutionContext();
	var web_default_availability = nlapiGetFieldValue('custitem_webstore_default_availibility');
	var userId = nlapiGetUser();
 
   if (item_id && userId === 1692630) {
        var itemSearch = nlapiSearchRecord("item", null,
            [
                ["internalid", "anyof", item_id]
            ],
            [
                new nlobjSearchColumn("quantityavailable").setSort(true)



            ]
        );
        if (itemSearch && item_id) {
            var quantity_available = itemSearch[0].getValue('quantityavailable');
        }



        var jenne_quantity = nlapiGetFieldValue('custitem15');

        if (jenne_quantity == null || jenne_quantity == '')
            jenne_quantity = parseInt(0)

        if (quantity_available == null || quantity_available == '') {
            quantity_available = parseInt(0);
        }

        var vendor_stock = parseInt(jenne_quantity) + parseInt(quantity_available);

        nlapiLogExecution('Debug', 'vendor stock : ', vendor_stock)
        nlapiSetFieldValue('custitem_vendor_stock', parseInt(vendor_stock));

      
        if(vendor_stock > 0 && (web_default_availability === '' || web_default_availability === null)){
              nlapiSetFieldValue('custitem_item_availibility', '1'); 
        }
  		else if(web_default_availability === '1'){
          nlapiSetFieldValue('custitem_item_availibility', '1'); 
          
        }
     	else if(web_default_availability === '3'){
          nlapiSetFieldValue('custitem_item_availibility', '3');
        }
  		else if(web_default_availability === '2'){
           nlapiSetFieldValue('custitem_item_availibility', '2'); 
        }
  		else{
            nlapiSetFieldValue('custitem_item_availibility', '2'); 
        }


    }



}
