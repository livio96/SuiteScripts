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

function schedulerFunction_amzbinadjust(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//==== CODE FOR DESGNING POP UP XL ======
	try {
	
		
		
		 Location = '1';
		
		 
		
		/* 
		
		 var filter = new Array();
		
		 var column = new Array();
		
		 
		
		 var filter = new Array();
		
		 //filter.push(new nlobjSearchFilter('location', 'inventorynumber', 'anyOf', Location));
		
		 
		
		 column[0] = new nlobjSearchColumn('internalid', null, 'group');
		
		 //column[1] = new nlobjSearchColumn('item', 'inventorynumber', 'group');
		
		 column[1] = new nlobjSearchColumn('location', 'inventorynumberbinonhand', 'group');
		
		 column[2] = new nlobjSearchColumn('quantityonhand', 'inventorynumberbinonhand', 'sum');
		
		 
		
		 var ItemSearchRes = nlapiSearchRecord('item', 'customsearch_concat_amz_serialnumber_3', filter, column);
		
		 
		
		 if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
		
		 var invAdjustObj = nlapiCreateRecord('inventoryadjustment', {
		
		 recordmode: 'dynamic',
		
		 });
		
		 
		
		 invAdjustObj.setFieldValue('subsidiary', 1)
		
		 invAdjustObj.setFieldValue('account', 154)
		
		 invAdjustObj.setFieldValue('adjlocation', Location)
		
		 invAdjustObj.setFieldValue('memo', 'Conact Amz Negative')
		
		 
		
		 for (var Itemrec = 0; Itemrec < ItemSearchRes.length; Itemrec++) {
		
		 try {
		
		 var ItemId = ItemSearchRes[Itemrec].getValue('internalid', null, 'group');
		
		 nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'ItemId -->' + ItemId);
		
		 
		
		 var Quantity = ItemSearchRes[Itemrec].getValue('quantityonhand', 'inventorynumberbinonhand', 'sum');
		
		 nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Quantity -->' + Quantity);
		
		 
		
		 invAdjustObj.selectNewLineItem('inventory');
		
		 invAdjustObj.setCurrentLineItemValue('inventory', 'item', ItemId);
		
		 invAdjustObj.setCurrentLineItemValue('inventory', 'location', Location);
		
		 invAdjustObj.setCurrentLineItemValue('inventory', 'adjustqtyby', -(Quantity));
		
		 
		
		 var inventoryDetailObj = invAdjustObj.createCurrentLineItemSubrecord('inventory', 'inventorydetail');
		
		 
		
		 
		
		 var item_filters = new Array();
		
		 item_filters.push(new nlobjSearchFilter('internalid', null, 'anyOf', ItemId));
		
		 //item_filters.push(new nlobjSearchFilter('location', 'inventorynumber', 'anyOf', Location));
		
		 
		
		 var item_search = nlapiLoadSearch('item', 'customsearch_concat_amz_serialnumber_3_2');
		
		 
		
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
		
		 var BIN = '';
		
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
		
		 if (LabelName == 'BIN') {
		
		 BIN = value
		
		 }
		
		 }
		
		 
		
		 searchid++;
		
		 inventoryDetailObj.selectNewLineItem('inventoryassignment')
		
		 
		
		 inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'issueinventorynumber', SerialNumber);
		
		 inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'binnumber', BIN);
		
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
		
		 
		
		 */
		
		{
		
			var NegativeInvObj = nlapiLoadRecord('inventoryadjustment', 17924386)
			
			var PositiveAdjustObj = nlapiCreateRecord('inventoryadjustment', {
				recordmode: 'dynamic',
			});
			
			PositiveAdjustObj.setFieldValue('subsidiary', 1)
			PositiveAdjustObj.setFieldValue('account', 154)
			PositiveAdjustObj.setFieldValue('adjlocation', Location)
			PositiveAdjustObj.setFieldValue('memo', 'Conact Amz Positive')
			
			var i_linecount = NegativeInvObj.getLineItemCount('inventory')
			nlapiLogExecution('DEBUG', 'after submit Sales Order', 'i_linecount-->' + i_linecount);
			
			for (var k = 1; k <= i_linecount; k++) {
				NegativeInvObj.selectLineItem('inventory', k);
				var ItemId = NegativeInvObj.getCurrentLineItemValue('inventory', 'item');
				var Loaction = NegativeInvObj.getCurrentLineItemValue('inventory', 'location');
				var Quantity = NegativeInvObj.getCurrentLineItemValue('inventory', 'adjustqtyby');
				var unitcost = NegativeInvObj.getCurrentLineItemValue('inventory', 'unitcost');
				
				var PostiveQty = (parseFloat(Quantity) * parseFloat(-1));
				
				PositiveAdjustObj.selectNewLineItem('inventory');
				PositiveAdjustObj.setCurrentLineItemValue('inventory', 'item', ItemId);
				PositiveAdjustObj.setCurrentLineItemValue('inventory', 'location', Location);
				PositiveAdjustObj.setCurrentLineItemValue('inventory', 'adjustqtyby', PostiveQty);
				PositiveAdjustObj.setCurrentLineItemValue('inventory', 'unitcost', unitcost);
				
				var PositiveinventoryDetailObj = PositiveAdjustObj.createCurrentLineItemSubrecord('inventory', 'inventorydetail');
				var NegativeinventoryDetailObj = NegativeInvObj.editCurrentLineItemSubrecord('inventory', 'inventorydetail');
				
				var inva_linecount = NegativeinventoryDetailObj.getLineItemCount('inventoryassignment')
				nlapiLogExecution('DEBUG', 'after submit Sales Order', 'inva_linecount-->' + inva_linecount);
				
				for (var l = 1; l <= inva_linecount; l++) {
					NegativeinventoryDetailObj.selectLineItem('inventoryassignment', l)
					var SerialNumber = NegativeinventoryDetailObj.getCurrentLineItemText('inventoryassignment', 'issueinventorynumber');
					var Status = NegativeinventoryDetailObj.getCurrentLineItemValue('inventoryassignment', 'inventorystatus');
					var bin = NegativeinventoryDetailObj.getCurrentLineItemValue('inventoryassignment', 'binnumber');
					
					PositiveinventoryDetailObj.selectNewLineItem('inventoryassignment')
					PositiveinventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'receiptinventorynumber', 'amz-' + SerialNumber);
					PositiveinventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'binnumber', bin);
					PositiveinventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'inventorystatus', Status);
					
					PositiveinventoryDetailObj.commitLineItem('inventoryassignment');
				}
				PositiveinventoryDetailObj.commit();
				PositiveAdjustObj.commitLineItem('inventory');
			}
			
			
			var PostiveInventoryAdjsutID = nlapiSubmitRecord(PositiveAdjustObj, true, true)
			nlapiLogExecution('DEBUG', 'after submit Sales Order', 'PostiveInventoryAdjsutID-->' + PostiveInventoryAdjsutID);
			
		}
	} 
	catch (Execption) {
		nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', ' Execption -->' + Execption);
	}
}

// END SCHEDULED FUNCTION ===============================================
