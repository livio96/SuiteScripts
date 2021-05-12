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

function schedulerFunction_receiveorder(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//==== CODE FOR DESGNING POP UP XL ======
	try {
		
		var binnumber = 1028;//Amazon removal
		var Status = 8;// return from amazon not tested
		
		var filter = new Array();
		var column = new Array();
		
		column[0] = new nlobjSearchColumn('internalid');
		var TOSearchRes = nlapiSearchRecord('transferorder', 'customsearch_autoreceivetransaferorder', filter, column);
		
		if (TOSearchRes != null && TOSearchRes != '' && TOSearchRes != undefined) {
			for (var Itemrec = 0; Itemrec < TOSearchRes.length; Itemrec++) {
				try {
				
					var TORecId = TOSearchRes[Itemrec].getValue('internalid');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'TORecId -->' + TORecId);
					
					
					var IF_obj = nlapiTransformRecord('transferorder', TORecId, 'itemreceipt');
					
					//IF_obj.setFieldValue('shipstatus','C');
					IF_obj.setFieldValue('memo','Auto Receive');
					var i_LineCount = IF_obj.getLineItemCount('item');
					nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'i_LineCount -->' + i_LineCount);
					
					for (var i = 1; i <= i_LineCount; i++) 
					{
						var ItemID = IF_obj.getLineItemValue('item', 'item', i);
						nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'ItemID -->' + ItemID);
						
						var ItemType = IF_obj.getLineItemValue('item', 'itemtype', i);
						var IsSerial = IF_obj.getLineItemValue('item', 'isserial', i);
						//nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'IsSerial -->' + IsSerial);
						
						var Location = IF_obj.getLineItemValue('item', 'location', i);
						nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'Location -->' + Location);
						
						var quantity = IF_obj.getLineItemValue('item', 'quantity', i);
						nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'quantity -->' + quantity);
						
						IF_obj.selectLineItem('item', i)
						var inventoryDetailObj = IF_obj.createCurrentLineItemSubrecord('item','inventorydetail');
						
						var inva_LineCount = inventoryDetailObj.getLineItemCount('inventoryassignment');
						nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'inva_LineCount -->' + inva_LineCount);
						
						for (var a = 1; a <= inva_LineCount; a++) {
							inventoryDetailObj.selectLineItem('inventoryassignment', a)
							inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'binnumber', binnumber);
							inventoryDetailObj.setCurrentLineItemValue('inventoryassignment', 'inventorystatus', Status);
							inventoryDetailObj.commitLineItem('inventoryassignment');
						}
						
						inventoryDetailObj.commit();
						
							var quantity = IF_obj.getLineItemValue('item', 'quantity', i);
						nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'quantity -->' + quantity);
						
						IF_obj.commitLineItem('item');
						nlapiLogExecution('DEBUG', 'SCH Create Bin Putaway Sheet', 'test');
					}
					var ItemReceiptID = nlapiSubmitRecord(IF_obj, true, true)
					nlapiLogExecution('DEBUG', 'after submit Sales Order', 'ItemReceiptID-->' + ItemReceiptID);
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
