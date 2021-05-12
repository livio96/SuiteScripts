/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/https','N/url'],
    function(error, https, url){
		function fieldChanged_SetDropShip(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if ((sublistName == 'item') && (FieldName == 'custcol_so_is_drop_ship' || FieldName == 'povendor')) {
			
				var IsDropShip = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'custcol_so_is_drop_ship'
				});
				
				var POType = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'createpo'
				});
				
				var POvendor = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'povendor'
				});
				
				
				if (POvendor != null && POvendor != '' && POvendor != undefined) {
				
					if (POType != 'SpecOrd' && IsDropShip == true) {
						currentRecord.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'createpo',
							value: 'SpecOrd'
						});
						
					}
				}
			}
			
			if ((sublistName == 'item') && (FieldName == 'createpo')) {
			
				var POType = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'createpo'
				});
				
				if (POType == 'DropShip') {
					currentRecord.setCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'createpo',
						value: 'SpecOrd'
					});
					
					currentRecord.setCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_so_is_drop_ship',
						value: true
					});
				}
				//alert(POType);
			}
		}
		return {
			fieldChanged: fieldChanged_SetDropShip
		}
	});