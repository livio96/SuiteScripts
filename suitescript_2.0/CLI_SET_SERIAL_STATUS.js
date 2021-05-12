/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/search','N/record'],
    function(error, search, record){
		function fieldChanged_SetItemStatus(context){
			try {
				var currentRecord = context.currentRecord;
				var sublistName = context.sublistId;
				var FieldName = context.fieldId;
				//alert(sublistName)
				//alert(FieldName)
				if ((sublistName == 'recmachcustrecord_pl_sn_print_label' && (FieldName == 'custrecord_pl_sn_serial_number'))) {
					var Item = currentRecord.getValue('custrecord_pl_item_number')
					
					var SerialNo = currentRecord.getCurrentSublistValue({
						sublistId: 'recmachcustrecord_pl_sn_print_label',
						fieldId: 'custrecord_pl_sn_serial_number'
					});
					
					if (SerialNo != null && SerialNo != '' && SerialNo != undefined) {
						var ItemSearchRes = search.create({
							type: search.Type.INVENTORY_BALANCE,
							filters: [["item", "anyOf", Item], "AND", ["inventorynumber.inventorynumber", "is", SerialNo], "AND", ["onhand", "greaterthan", 0]],
							columns: [search.createColumn({
								name: 'item'
							}), search.createColumn({
								name: 'status'
							}), search.createColumn({
								name: 'binnumber'
							})]
						}).run().getRange(0, 1000);
						
						if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
							var Item = ItemSearchRes[0].getValue({
								name: 'item'
							});
							//alert(Item)
							var Status = ItemSearchRes[0].getValue({
								name: 'status'
							});
							//alert(Status)
							
							currentRecord.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_pl_sn_print_label',
								fieldId: 'custrecord_pl_sn_status',
								value: Status
							});
							
							var BinNumber = ItemSearchRes[0].getValue({
								name: 'binnumber'
							});
							//alert(BinNumber)
							
							currentRecord.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_pl_sn_print_label',
								fieldId: 'custrecord_pl_sn_bin',
								value: BinNumber
							});
						}
					}
				}
			} 
			catch (e) {
				log.debug('Inventory Balance', e);
			}
		}
		return {
			fieldChanged: fieldChanged_SetItemStatus,
		
		};
	});
	

	
