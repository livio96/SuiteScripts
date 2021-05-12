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

function schedulerFunction_invstatuschange(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//==== CODE FOR DESGNING POP UP XL ======
	try {
	
		var filter = new Array();
		var column = new Array();
		var IsSerial = true;
		
		//filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', 93649));
		//column[0] = new nlobjSearchColumn('internalid', null, 'group');
		//column[1] = new nlobjSearchColumn('quantityonhand', 'inventorynumberbinonhand', 'sum');
		
		column[0] = new nlobjSearchColumn('internalid', null, 'group');
		//column[1] = new nlobjSearchColumn('location', 'inventorynumber', 'group');
		column[1] = new nlobjSearchColumn('quantityonhand', 'binonhand', 'sum');
		
		var ItemSearchRes = nlapiSearchRecord('item', 'customsearch_bin_on_hand_status_change', filter, column);
		
		if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
			var invStatusObj = nlapiCreateRecord('inventorystatuschange', {
				recordmode: 'dynamic',
			});
			
			invStatusObj.setFieldValue('location', 32)
			invStatusObj.setFieldValue('previousstatus', 14)
			invStatusObj.setFieldValue('revisedstatus', 1)
			
			for (var Itemrec = 0; Itemrec < ItemSearchRes.length; Itemrec++) {
				try {
					var ItemId = ItemSearchRes[Itemrec].getValue('internalid', null, 'group');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'ItemId -->' + ItemId);
					
					//var Quantity = ItemSearchRes[Itemrec].getValue('internalid', 'inventorynumber', 'count');
					var Quantity = ItemSearchRes[Itemrec].getValue('quantityonhand', 'binonhand', 'sum');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Quantity -->' + Quantity);
					
					invStatusObj.selectNewLineItem('inventory');
					invStatusObj.setCurrentLineItemValue('inventory', 'item', ItemId);
					invStatusObj.setCurrentLineItemValue('inventory', 'quantity', Quantity);
					var inventoryDetailObj = invStatusObj.createCurrentLineItemSubrecord('inventory', 'inventorydetail');
					
					if (IsSerial == false) {
						var item_filters = new Array();
						item_filters.push(new nlobjSearchFilter('internalid', null, 'anyOf', ItemId));
						
						var item_search = nlapiLoadSearch('item', 'customsearch_bin_on_hand_status_change_2');
						
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
										var Quantity = '';
										
										for (var i = 0; i < columnLen; i++) {
											var column = columns[i];
											var LabelName = column.getLabel();
											var fieldName = column.getName();
											var value = result.getValue(column);
											//var text = result.getText(column);
											
											if (LabelName == 'SERIALNO') {
												SerialNumber = value
											}
										}
										
										searchid++;
										inventoryDetailObj.selectNewLineItem('inventoryassignment')
										inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'issueinventorynumber', SerialNumber);
										inventoryDetailObj.commitLineItem('inventoryassignment');
									}
								}
							}
							while (mapping_search.length >= 1000);
							inventoryDetailObj.commit();
							invStatusObj.commitLineItem('inventory');
						}
					}
					else {
						inventoryDetailObj.selectNewLineItem('inventoryassignment')
						inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'binnumber', 2544);
						inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'quantity', Quantity);
						inventoryDetailObj.commitLineItem('inventoryassignment');
						inventoryDetailObj.commit();
						invStatusObj.commitLineItem('inventory');
					}
				} 
				catch (ex) {
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Inner Execption -->' + ex);
				}
			}
			var StatusChnageIDObj = nlapiSubmitRecord(invStatusObj, true, true)
			nlapiLogExecution('DEBUG', 'after submit Sales Order', 'StatusChnageIDObj-->' + StatusChnageIDObj);
		}
	} 
	catch (Execption) {
		nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', ' Execption -->' + Execption);
	}
}

// END SCHEDULED FUNCTION ===============================================
