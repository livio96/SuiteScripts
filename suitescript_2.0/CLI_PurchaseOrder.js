/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/search','N/error'],
    function(search, error){
		function postSourcing_CheckSerial(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if (sublistName == 'item' && FieldName == 'item') {
				var Item = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'item',
				});
				if (Item != null && Item != '' && Item != undefined) {
					var Item_fieldLookUp = search.lookupFields({
						type: 'item',
						id: Item,
						columns: ['isserialitem']
					});
					
					var IsSerial = Item_fieldLookUp.isserialitem;
					
					if (IsSerial == true) {
						currentRecord.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'custcol_isserialized',
							value: true
						});
					}
					else {
						currentRecord.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'custcol_isserialized',
							value: false
						});
					}
				}
			}
		}
		function saveRecord_SetLinkedIR(context){
			var currentRecord = context.currentRecord;
			var LinkedIR = currentRecord.getValue({
				fieldId: 'custpage_linkeditemrec'
			});
			
			if (LinkedIR != null && LinkedIR != '' && LinkedIR != undefined) {
				currentRecord.setValue({
					fieldId: 'custbody_po_item_receipts',
					value: LinkedIR
				});
			}
			
			return true;
		}
		return {
			postSourcing: postSourcing_CheckSerial,
			saveRecord: saveRecord_SetLinkedIR,
		};
	});