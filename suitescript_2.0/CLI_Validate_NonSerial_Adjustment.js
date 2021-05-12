/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/runtime'],
    function(error, runtime){
		function validateLineAllowSerialAdjust(context){
		
			var userObj = runtime.getCurrentUser();
			var Role = userObj.role;
			//alert(Role)
			if (Role == '1030' || Role == '1024' || Role == '19') 
			{
			
				var currentRecord = context.currentRecord;
				var sublistName = context.sublistId;
				if (sublistName == 'inventory') {
					var Item = currentRecord.getCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'item'
					});
					
					if (Item != null && Item != '' && Item != undefined) {
						var IsSerial = currentRecord.getCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'isserial'
						});
						
						
						if (IsSerial == 'T') {
							alert('Serialized Inventory Item Adjustment are not allowed');
							return false;
						}
					}
				}
			}
			return true;
		}
		return {
			validateLine: validateLineAllowSerialAdjust,
		
		};
	});