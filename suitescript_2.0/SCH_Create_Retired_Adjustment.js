// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
/*
   	Script Name:
	

	Script Modification Log:

	-- Date --			-- Modified By --				--Requested By--				-- Description --




Below is a summary of the process controls enforced by this script file.  The control logic is described
more fully, below, in the appropriate function headers and code blocks.


     SCHEDULED FUNCTION
		- scheduledFunction(type)


     SUB-FUNCTIONS
		- The following sub-functions are called by the above core functions in order to maintain code
            modularization:

               - NOT USED

*/
}
// END SCRIPT DESCRIPTION BLOCK  ====================================


// BEGIN SCHEDULED FUNCTION =============================================

function schedulerFunction_retiredadjustment(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//==== CODE FOR DESGNING POP UP XL ======
	try {
	
		Location = '32';
		
		var filter = new Array();
		var column = new Array();
		
		var filter = new Array();
		//filter.push(new nlobjSearchFilter('location', 'inventorynumber', 'anyOf', Location));
		
		column[0] = new nlobjSearchColumn('item', null, 'group');
		column[1] = new nlobjSearchColumn('onhand', null, 'sum');
		column[2] = new nlobjSearchColumn('location', null, 'group');
		//column[3] = new nlobjSearchColumn('binnumber', null, 'group');
		
		filter.push(new nlobjSearchFilter('item', null, 'anyOf',[4398,26938,11241,1230,4730,18734,1214,13927,7120,9638,1072,8414,1217,2839, 10797, 2835, 7667, 7157, 1253, 1211, 8197, 3834, 11908, 11811, 3569, 159367, 10914, 1232, 7502, 1216, 2871, 7198]));
		
		var ItemSearchRes = nlapiSearchRecord('inventorybalance', 'customsearch380476', filter, column);
		
		if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
			var invAdjustObj = nlapiCreateRecord('inventoryadjustment', {
				recordmode: 'dynamic',
			});
			
			invAdjustObj.setFieldValue('subsidiary', 1)
			invAdjustObj.setFieldValue('account', 154)
			invAdjustObj.setFieldValue('adjlocation', Location)
			invAdjustObj.setFieldValue('memo', 'Retired Adjustment')
			
			for (var Itemrec = 0; Itemrec < ItemSearchRes.length; Itemrec++) {
				try {
					var ItemId = ItemSearchRes[Itemrec].getValue('item', null, 'group');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'ItemId -->' + ItemId);
					
					var Quantity = ItemSearchRes[Itemrec].getValue('onhand', null, 'sum');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Quantity -->' + Quantity);
					
					invAdjustObj.selectNewLineItem('inventory');
					invAdjustObj.setCurrentLineItemValue('inventory', 'item', ItemId);
					invAdjustObj.setCurrentLineItemValue('inventory', 'location', Location);
					invAdjustObj.setCurrentLineItemValue('inventory', 'adjustqtyby', -(Quantity));
					
					var inventoryDetailObj = invAdjustObj.createCurrentLineItemSubrecord('inventory', 'inventorydetail');
					
					
					var item_filters = new Array();
					item_filters.push(new nlobjSearchFilter('item', null, 'anyOf', ItemId));
					//	item_filters.push(new nlobjSearchFilter('location', 'inventorynumber', 'anyOf', Location));
					
					var item_search = nlapiLoadSearch('inventorybalance', 'customsearch380476');
					
					if (item_search != null && item_search != '' && item_search != undefined) {
					
						item_search.addFilters(item_filters);
						
						var resultset = item_search.runSearch();
						var searchid = 0;
						var j = 0;
						
						do {
							var mapping_search = resultset.getResults(searchid, searchid + 1000);
							
							if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
								for (var rs in mapping_search) {
									var result = mapping_search[rs];
									var columns = result.getAllColumns();
									var columnLen = columns.length;
									
									var SerialNumber = '';
									//var Quantity = '';
									var bin = '';
									var status = '';
									
									for (var i = 0; i < columnLen; i++) {
										var column = columns[i];
										var LabelName = column.getLabel();
										var fieldName = column.getName();
										var value = result.getValue(column);
										//var text = result.getText(column);
										
										if (fieldName == 'inventorynumber') {
											SerialNumber = value
										}
										
										if (fieldName == 'binnumber') {
											bin = value
										}
										if (fieldName == 'status') {
											status = value
										}
									}
									//	nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Quantity -->' + Quantity);
									
									searchid++;
									inventoryDetailObj.selectNewLineItem('inventoryassignment')
									inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'issueinventorynumber', SerialNumber);
									inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'binnumber', bin);
									inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'inventorystatus', status);
									//inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'quantity', -(Quantity));
									inventoryDetailObj.commitLineItem('inventoryassignment');
								}
							}
						}
						while (mapping_search.length >= 1000);
						inventoryDetailObj.commit();
						invAdjustObj.commitLineItem('inventory');
					}
				} 
				catch (ex) {
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Inner Execption -->' + ex);
				}
			}
			var NegativeInventoryAdjsutID = nlapiSubmitRecord(invAdjustObj, true, true)
			nlapiLogExecution('DEBUG', 'after submit Sales Order', 'NegativeInventoryAdjsutID-->' + NegativeInventoryAdjsutID);
		}
	} 
	catch (Execption) {
		nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', ' Execption -->' + Execption);
	}
}

// END SCHEDULED FUNCTION ===============================================
