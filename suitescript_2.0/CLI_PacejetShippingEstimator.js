/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error'],
    function(error){
		function saveRecord_CalculateShipping(context){
			var currentRecord = context.currentRecord;
			
			var CalculateCost = currentRecord.getValue({
				fieldId: 'custitem_item_calculate_ship_cost'
			});
			
			if (CalculateCost == true) {
				var ShipMethod = currentRecord.getValue({
					fieldId: 'custpage_shipmethod'
				});
				if (ShipMethod != null && ShipMethod != '' && ShipMethod != undefined) {
					currentRecord.setValue({
						fieldId: 'custitem_item_shipping_method',
						value: ShipMethod
					});
				}
				else {
					alert('Please Select The Ship Method');
					return false;
				}
				var postcode = currentRecord.getValue({
					fieldId: 'custitem_shippostcode'
				});
				if (postcode != null && postcode != '' && postcode != undefined) {
				
				}
				else {
					alert('Please Enter The Post Code');
					return false;
				}
				var country = currentRecord.getValue({
					fieldId: 'custitem_itemshipcountry'
				});
				if (country != null && country != '' && country != undefined) {
				
				}
				else {
					alert('Please Enter The Country Code');
					return false;
				}
			}
			return true;
		}
		return {
			saveRecord: saveRecord_CalculateShipping,
		};
	});