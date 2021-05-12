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

function schedulerFunction_CreateCommissionPay(type){
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
		//inv_filters.push(new nlobjSearchFilter('internalid', null, 'anyOf', 15663473));
		
		var comm_search = nlapiLoadSearch('transaction', 'customsearch_commission_bill_payment');
		
		if (comm_search != null && comm_search != '' && comm_search != undefined) {
			comm_search.addFilters(inv_filters);
			
			var resultset = comm_search.runSearch();
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
						var employee = '';
						
						for (var i = 0; i < columnLen; i++) {
							var column = columns[i];
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
								employee = value;
							}
						}
						try {
							var applyIdToApply = internalid;
							
							var o_PaymentObj = nlapiCreateRecord('vendorpayment', {
								recordmode: 'dynamic'
							});
							
							o_PaymentObj.setFieldValue('entity', employee);
							o_PaymentObj.setFieldValue('trandate', TranDate);
							o_PaymentObj.setFieldValue('account', 164);
							
							var lineCount = o_PaymentObj.getLineItemCount('apply');
							nlapiLogExecution('DEBUG', 'lines', lineCount);
							for (var i = 1; i <= lineCount; i++) {
								o_PaymentObj.selectLineItem('apply', i);
								var applyID = o_PaymentObj.getCurrentLineItemValue('apply', 'doc');
								var amountRemaining = o_PaymentObj.getCurrentLineItemValue('apply', 'due');
								
								if (applyID == applyIdToApply) {
									nlapiLogExecution('DEBUG', 'applyID : amountRemaining : applyIdToApply', applyID + ' : ' + amountRemaining + ' : ' + applyIdToApply);
									o_PaymentObj.setCurrentLineItemValue('apply', 'apply', 'T');
									o_PaymentObj.setCurrentLineItemValue('apply', 'amount', amountRemaining);
									o_PaymentObj.commitLineItem('apply');
								}
							}
							
							//o_NewrefundObj.setFieldValue('tranid','');
							var PaymentId = nlapiSubmitRecord(o_PaymentObj, true, false);
							nlapiLogExecution('DEBUG', 'SCH Create Commission Payment', 'PaymentID -->' + PaymentId);
						} 
						catch (ex) {
							nlapiLogExecution('DEBUG', 'SCH Create Commission Payment', 'Inner Execption -->' + ex);
						}
						
						var i_usage_end = i_context.getRemainingUsage();
						//nlapiLogExecution('DEBUG', 'scheduler_CopyItems', ' *********** Usage end **********-->' + i_usage_end);
						
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
		nlapiLogExecution('DEBUG', 'SCH Create Commission Payment', ' Execption -->' + Execption);
	}
}

// END SCHEDULED FUNCTION ===============================================
