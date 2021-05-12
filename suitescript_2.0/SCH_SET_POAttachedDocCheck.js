// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
/*
   	Script Name:
	Author:
	Company:
	Date:
	Details: 


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

function schedulerFunction_SetPOAttached(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	//  SCHEDULED FUNCTION CODE BODY
	
	try {
	
		var i_context = nlapiGetContext();
		var Checktran_filter = new Array();
		var Checktran_column = new Array();
		
		//Checktran_filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', '17246970'));
		
		Checktran_column[0] = new nlobjSearchColumn('internalid');
		
		var CheckTransactionSearchRes = nlapiSearchRecord('purchaseorder', 'customsearch_check_poattacheddoccheck', Checktran_filter, Checktran_column);
		
		if (CheckTransactionSearchRes != null && CheckTransactionSearchRes != '' && CheckTransactionSearchRes != undefined) {
			for (var t = 0; t < CheckTransactionSearchRes.length; t++) {
				var i_recordId = CheckTransactionSearchRes[t].getValue('internalid');
				nlapiLogExecution('DEBUG', 'SCH Set Checked Transactions', 'i_recordId -->' + i_recordId);
				try {
				
					var o_recObj = nlapiLoadRecord('purchaseorder', i_recordId);
					
					o_recObj.setFieldValue('custbody_po_document_attached', 'T');//set 10 Number
					var UpdatedID = nlapiSubmitRecord(o_recObj, {
						disabletriggers: true,
						enablesourcing: false,
						ignoremandatoryfields: true
					});
					
					//
					nlapiLogExecution('DEBUG', 'SCH Set Transactions', 'check UpdatedID-->' + UpdatedID);
				} 
				catch (exception) {
					nlapiLogExecution('DEBUG', 'schedulerFunction_SetPOAttached', 'Inner exception-->' + exception);
				}
			}
		}
	} 
	catch (exception) {
		nlapiLogExecution('DEBUG', 'schedulerFunction_SetPOAttached', ' exception-->' + exception);
	}
	
	try {
	
		var i_context = nlapiGetContext();
		var UnChecktran_filter = new Array();
		var UnChecktran_column = new Array();
		
		//UnChecktran_filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', '17246970'));
		
		UnChecktran_column[0] = new nlobjSearchColumn('internalid');
		
		var UnCheckTransactionSearchRes = nlapiSearchRecord('purchaseorder', 'customsearch_uncheck_poattacheddoccheck', UnChecktran_filter, UnChecktran_column);
		
		if (UnCheckTransactionSearchRes != null && UnCheckTransactionSearchRes != '' && UnCheckTransactionSearchRes != undefined) {
			for (var n = 0; n < UnCheckTransactionSearchRes.length; n++) {
				var i_recordId = UnCheckTransactionSearchRes[n].getValue('internalid');
				nlapiLogExecution('DEBUG', 'SCH Set Checked Transactions', 'i_recordId -->' + i_recordId);
				try {
				
					var o_recObj = nlapiLoadRecord('purchaseorder', i_recordId);
					
					o_recObj.setFieldValue('custbody_po_document_attached', 'F');
					var UpdatedID = nlapiSubmitRecord(o_recObj, {
						disabletriggers: true,
						enablesourcing: false,
						ignoremandatoryfields: true
					});
					
					//
					nlapiLogExecution('DEBUG', 'SCH Set Transactions', 'Uncheck UpdatedID-->' + UpdatedID);
				} 
				catch (exception) {
					nlapiLogExecution('DEBUG', 'schedulerFunction_SetPOAttached', 'Inner exception-->' + exception);
				}
			}
		}
	} 
	catch (exception) {
		nlapiLogExecution('DEBUG', 'schedulerFunction_SetPOAttached', 'exception-->' + exception);
	}
	
}

// END SCHEDULED FUNCTION ===============================================


