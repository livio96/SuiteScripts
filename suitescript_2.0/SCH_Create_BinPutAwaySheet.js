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

function schedulerFunction_binputawaysheet(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//==== CODE FOR DESGNING POP UP XL ======
	try {
		var Location = '32';
		var Bin = '2544';
		var SubmitBinPutaway = false;
		
		var filter = new Array();
		var column = new Array();
		
		//filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', 239995));
		column[0] = new nlobjSearchColumn('internalid');
		column[1] = new nlobjSearchColumn('locationquantityonhand');
		column[2] = new nlobjSearchColumn('isserialitem');
		
		var ItemSearchRes = nlapiSearchRecord('item', 'customsearch_binputawaysheet', filter, column);
		
		if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
			var binPutAway = nlapiCreateRecord('binworksheet', {
				recordmode: 'dynamic',
				location: Location
			});
			
			for (var Itemrec = 0; Itemrec < ItemSearchRes.length; Itemrec++) {
				try {
					var ItemId = ItemSearchRes[Itemrec].getValue('internalid');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'ItemId -->' + ItemId);
					
					var IsSerial = ItemSearchRes[Itemrec].getValue('isserialitem');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'IsSerial -->' + IsSerial);
					
					var itemLine = binPutAway.findLineItemValue('item', 'item', ItemId);
					
					if (itemLine >= 1) {
						SubmitBinPutaway = true;
						
						if (IsSerial == 'T') {
							var item_filters = new Array();
							item_filters.push(new nlobjSearchFilter('internalid', null, 'anyOf', ItemId));
							
							var item_search = nlapiLoadSearch('item', 'customsearch_put_awayserialnumber');
							
							if (item_search != null && item_search != '' && item_search != undefined) {
							
								var TotalQuantity = ItemSearchRes[Itemrec].getValue('locationquantityonhand');
								nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'TotalQuantity -->' + TotalQuantity);
								
								binPutAway.selectLineItem('item', itemLine);
								
								binPutAway.setCurrentLineItemValue('item', 'quantity', TotalQuantity);
								
								var inventoryDetails = binPutAway.createCurrentLineItemSubrecord('item', 'inventorydetail');
								
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
												
												if (LabelName == 'inventorynumber') {
													SerialNumber = value
												}
												if (fieldName == 'quantityavailable') {
													Quantity = value;
												}
											}
											var NewSerialNumber = SerialNumber.trim();
											
											searchid++;
											
											if (searchid <= TotalQuantity) {
											
												inventoryDetails.selectNewLineItem('inventoryassignment');
												inventoryDetails.setCurrentLineItemValue('inventoryassignment', 'issueinventorynumber', NewSerialNumber);
												inventoryDetails.setCurrentLineItemValue('inventoryassignment', 'binnumber', Bin);
												//inventoryDetails.setCurrentLineItemValue('inventoryassignment', 'quantity', Quantity);
												inventoryDetails.commitLineItem('inventoryassignment');
											}
										}
									}
								}
								while (mapping_search.length >= 1000);
							}
						}
						else {
							var TotalQuantity = ItemSearchRes[Itemrec].getValue('locationquantityonhand');
							nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'TotalQuantity -->' + TotalQuantity);
							
							binPutAway.selectLineItem('item', itemLine);
							
							binPutAway.setCurrentLineItemValue('item', 'quantity', TotalQuantity);
							
							var inventoryDetails = binPutAway.createCurrentLineItemSubrecord('item', 'inventorydetail');
							inventoryDetails.selectNewLineItem('inventoryassignment');
							inventoryDetails.setCurrentLineItemValue('inventoryassignment','binnumber', Bin);
							inventoryDetails.setCurrentLineItemValue('inventoryassignment','inventorystatus', 14);
							inventoryDetails.setCurrentLineItemValue('inventoryassignment','quantity', TotalQuantity);
							
							inventoryDetails.commitLineItem('inventoryassignment');
						}
						inventoryDetails.commit();
						binPutAway.commitLineItem('item');
					}
					else {
						nlapiLogExecution('DEBUG', 'No worksheet created', 'No Item found at Location');
					}
				} 
				catch (ex) {
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Inner Execption -->' + ex);
					
				}
			}
			if (SubmitBinPutaway == true) {
				var BinPutAwayid = nlapiSubmitRecord(binPutAway);
				nlapiLogExecution('DEBUG', 'BinPutAwayid', BinPutAwayid);
			}
			
		}
	} 
	catch (Execption) {
		nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', ' Execption -->' + Execption);
	}
}

// END SCHEDULED FUNCTION ===============================================
