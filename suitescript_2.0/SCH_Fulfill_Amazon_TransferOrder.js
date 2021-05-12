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

function schedulerFunction_fulfillto(type){
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
		
		column[0] = new nlobjSearchColumn('internalid');
		var TOSearchRes = nlapiSearchRecord('transferorder', 'customsearch_autoreceivetransaferorder', filter, column);
		
		if (TOSearchRes != null && TOSearchRes != '' && TOSearchRes != undefined) {
			for (var Itemrec = 0; Itemrec < TOSearchRes.length; Itemrec++) {
				try {
				
					var TORecId = TOSearchRes[Itemrec].getValue('internalid');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'TORecId -->' + TORecId);
					
					
					var IF_obj = nlapiTransformRecord('transferorder', TORecId, 'itemfulfillment', {
						recordmode: 'dynamic',
					});
					
					IF_obj.setFieldValue('shipstatus', 'C');
					IF_obj.setFieldValue('memo', 'Auto Fulfill');
					
					var i_LineCount = IF_obj.getLineItemCount('item');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'i_LineCount -->' + i_LineCount);
					
					for (var i = 1; i <= i_LineCount; i++) 
					{
						var ItemID = IF_obj.getLineItemValue('item', 'item', i);
						nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'ItemID -->' + ItemID);
						
						var LineExists = false;
						var N = i;
						for (var c = N + 1; c <= i_LineCount; c++) 
						{
							var NextItemID = IF_obj.getLineItemValue('item', 'item', c);
							nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'ItemID -->' + ItemID);
							
							if (ItemID == NextItemID) 
							{
								LineExists = true;
							}
						}
						
						if (LineExists == false) 
						{
							var ItemType = IF_obj.getLineItemValue('item', 'itemtype', i);
							
							var IsSerial = IF_obj.getLineItemValue('item', 'isserial', i);
							nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'IsSerial -->' + IsSerial);
							
							var Location = IF_obj.getLineItemValue('item', 'location', i);
							nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Location -->' + Location);
							
							var quantity = IF_obj.getLineItemValue('item', 'quantity', i);
							nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'quantity -->' + quantity);
							
							IF_obj.selectLineItem('item', i)
							
							if (IsSerial == "T") {
								var inventoryDetailObj = IF_obj.createCurrentLineItemSubrecord('item', 'inventorydetail');
								
								nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'IsSerial -->' + IsSerial);
								
								var item_filters = new Array();
								item_filters.push(new nlobjSearchFilter('item', null, 'anyOf', ItemID));
								item_filters.push(new nlobjSearchFilter('location', null, 'anyOf', Location));
								
								var item_search = nlapiLoadSearch(null, 'customsearch_invadjust_itemnumber_2');
								
								if (item_search != null && item_search != '' && item_search != undefined) {
									item_search.addFilters(item_filters);
									var resultset = item_search.runSearch();
									var searchid = 0;
									var j = 0;
									do {
										nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'IsSerial -->' + IsSerial);
										
										var mapping_search = resultset.getResults(searchid, searchid + 1000);
										
										if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
											for (var rs in mapping_search) {
												var result = mapping_search[rs];
												var columns = result.getAllColumns();
												var columnLen = columns.length;
												
												var SerialNumber = '';
												
												for (var k = 0; k < columnLen; k++) {
													var column = columns[k];
													var LabelName = column.getLabel();
													var fieldName = column.getName();
													var value = result.getValue(column);
													//var text = result.getText(column);
													
													if (fieldName == 'internalid') {
														SerialNumber = value
													}
												}
												//nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'SerialNumber -->' + SerialNumber);
												
												j++;
												searchid++;
												if (parseFloat(j) <= parseFloat(quantity)) {
													inventoryDetailObj.selectNewLineItem('inventoryassignment')
													inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'issueinventorynumber', SerialNumber);
													inventoryDetailObj.commitLineItem('inventoryassignment');
												}
												
												
											}
										}
									}
									while (mapping_search.length >= 1000);
								}
								inventoryDetailObj.commit();
							}
							else {
							
								/*
								
								 
								
								 
								
								 
								
								 inventoryDetailObj.selectNewLineItem('inventoryassignment')
								
								 
								
								 
								
								 
								
								 //inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'binnumber', BinNumber);
								
								 
								
								 
								
								 
								
								 inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'quantity', quantity);
								
								 
								
								 
								
								 
								
								 inventoryDetailObj.commitLineItem('inventoryassignment');
								
								 
								
								 
								
								 
								
								 */
								
								/*
								
								 
								
								 
								
								 
								
								 var Binfilter = new Array();
								
								 
								
								 
								
								 
								
								 var Bincolumn = new Array();
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 Binfilter.push(new nlobjSearchFilter('internalid', null, 'anyOf', ItemID));
								
								 
								
								 
								
								 
								
								 Binfilter.push(new nlobjSearchFilter('location', 'binonhand', 'anyOf', Location));
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 Bincolumn[0] = new nlobjSearchColumn('binnumber', 'binonhand');
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 var BinSearchRes = nlapiSearchRecord('item', 'customsearch_binputawaysheet', filter, column);
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 if (BinSearchRes != null && BinSearchRes != '' && BinSearchRes != undefined) {
								
								 
								
								 
								
								 
								
								 var BinNumber = BinSearchRes[0].getValue('binnumber', 'binonhand');
								
								 
								
								 
								
								 
								
								 nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'BinNumber -->' + BinNumber);
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 
								
								 }
								
								 
								
								 
								
								 
								
								 */
								
							}
							
							IF_obj.commitLineItem('item');
							nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'test');
						}
						else 
						{
							IF_obj.setLineItemValue('item','itemreceive', i,'F');
						}
					}
					
					var ItemFulfillmentID = nlapiSubmitRecord(IF_obj, true, true)
					nlapiLogExecution('DEBUG', 'after submit Sales Order', 'ItemFulfillmentID-->' + ItemFulfillmentID);
				} 
				catch (ex) {
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Inner Execption -->' + ex);
				}
			}
		}
	} 
	catch (Execption) {
		nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', ' Execption -->' + Execption);
	}
}

// END SCHEDULED FUNCTION ===============================================
