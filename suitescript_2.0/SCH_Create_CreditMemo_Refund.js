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

function schedulerFunction_CreateCreditRefund(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//==== CODE FOR DESGNING POP UP XL ======
	try {
		var i_context = nlapiGetContext();
		
		var inv_filters = new Array();
		//inv_filters.push(new nlobjSearchFilter('internalid', null, 'anyOf', 1645741));
		
		var invoice_search = nlapiLoadSearch('transaction', 'customsearch_create_open_creditrefund');
		
		if (invoice_search != null && invoice_search != '' && invoice_search != undefined) {
			invoice_search.addFilters(inv_filters);
			
			var resultset = invoice_search.runSearch();
			var searchid = 0;
			var j = 0;
			
			do {
				var mapping_search = resultset.getResults(searchid, searchid + 1000);
				
				if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
					for (var rs in mapping_search) {
						var result = mapping_search[rs];
						var columns = result.getAllColumns();
						var columnLen = columns.length;
						
						var internalid = '';
						var TranDate = '';
						var customer = '';
						
						for (var j = 0; j < columnLen; j++) {
							var column = columns[j];
							var LabelName = column.getLabel();
							var fieldName = column.getName();
							var value = result.getValue(column);
							//var text = result.getText(column);
							
							if (fieldName == 'internalid') {
								internalid = value
							}
							if (fieldName == 'trandate') {
								TranDate = value;
							}
							if (fieldName == 'entity') {
								customer = value;
							}
						}
						try {
							var applyIdToApply = internalid;
							var custID = customer;
							var acctID = 921;
							var paymethID = 12;
							var o_NewrefundObj = nlapiCreateRecord('customerrefund', {
								recordmode: 'dynamic'
							});
							o_NewrefundObj.setFieldValue('customform', 220);
							
							o_NewrefundObj.setFieldValue('trandate', TranDate);
							o_NewrefundObj.setFieldValue('customer', custID);
							o_NewrefundObj.setFieldValue('paymentmethod', paymethID);
							o_NewrefundObj.setFieldValue('account', acctID);
							o_NewrefundObj.setFieldValue('custbody_auto_create_trans', 'T');
							
							var lineCount = o_NewrefundObj.getLineItemCount('apply');
							nlapiLogExecution('DEBUG', 'lines', lineCount);
							for (var i = 1; i <= lineCount; i++) {
								o_NewrefundObj.selectLineItem('apply', i);
								var applyID = o_NewrefundObj.getCurrentLineItemValue('apply', 'doc');
								var amountRemaining = o_NewrefundObj.getCurrentLineItemValue('apply', 'due');
								
								if (applyID == applyIdToApply) {
									nlapiLogExecution('DEBUG', 'applyID : amountRemaining : applyIdToApply', applyID + ' : ' + amountRemaining + ' : ' + applyIdToApply);
									o_NewrefundObj.setCurrentLineItemValue('apply', 'apply', 'T');
									o_NewrefundObj.setCurrentLineItemValue('apply', 'amount', amountRemaining);
									o_NewrefundObj.commitLineItem('apply');
								}
							}
							
							o_NewrefundObj.setFieldValue('tranid','');
							var RefundId = nlapiSubmitRecord(o_NewrefundObj, true, false);
							nlapiLogExecution('DEBUG', 'SCH Create Credit Refund', 'RefundId -->' + RefundId);
						} 
						catch (ex) {
							nlapiLogExecution('DEBUG', 'SCH Create Credit Refund', 'Inner Execption -->' + ex);
						}
						
						var i_usage_end = i_context.getRemainingUsage();
						//nlapiLogExecution('DEBUG', 'SCH Create Credit Refund', ' *********** Usage end **********-->' + i_usage_end);
						
						if (i_usage_end <= 500) {
							var stateMain = nlapiYieldScript();
							
							if (stateMain.status == 'RESUME') {
								nlapiLogExecution('DEBUG', 'Resum Scripts', ' *********** Resume an scripts **********-->');
							}
						}
						searchid++;
						
					}
				}
			}
			while (mapping_search.length >= 1000);
		}
	} 
	catch (Execption) {
		nlapiLogExecution('DEBUG', 'SCH Create Invoice Payment', ' Execption -->' + Execption);
	}
}

// END SCHEDULED FUNCTION ===============================================
