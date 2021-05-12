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

function schedulerFunction_CloseReturnAuth(type)
{
    /*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
    //==== CODE FOR DESGNING POP UP XL ======
    try {
        var i_context = nlapiGetContext();

        var filter = new Array();
        var column = new Array();

        //filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', 970489));
        column[0] = new nlobjSearchColumn('internalid');

        var RertunAuth_SearchRes = nlapiSearchRecord('returnauthorization', 'customsearch_pending_return_auth', filter, column);

        if (RertunAuth_SearchRes != null && RertunAuth_SearchRes != '' && RertunAuth_SearchRes != undefined)
        {
            for (var Itemrec = 0; Itemrec < RertunAuth_SearchRes.length; Itemrec++)
            {
                try
                {
                    var ReturnAuthID = RertunAuth_SearchRes[Itemrec].getValue('internalid');
                    nlapiLogExecution('DEBUG', 'SCH Close Return Authorization', 'ReturnAuthID -->' + ReturnAuthID);

                    var o_recordOBJ = nlapiLoadRecord('returnauthorization', ReturnAuthID);
                  
                  	o_recordOBJ.setFieldValue('custbody_ra_auto_close','T');

                    var lineCount = o_recordOBJ.getLineItemCount('item');
                    nlapiLogExecution('DEBUG', 'SCH Close Return Authorization', 'lines->' + lineCount);

                    for (var i = 1; i <= lineCount; i++) {
                        var Item = o_recordOBJ.setLineItemValue('item', 'isclosed', i, 'T');
                    }

                    var UpdatedID = nlapiSubmitRecord(o_recordOBJ, {
                        enablesourcing: true,
                        ignoremandatoryfields: true
                    });
                    nlapiLogExecution('DEBUG', 'SCH Close Return Authorization', 'UpdatedPOID-->' + UpdatedID);

                    var i_usage_end = i_context.getRemainingUsage();
                    //nlapiLogExecution('DEBUG', 'SCH Create Credit Refund', ' *********** Usage end **********-->' + i_usage_end);

                    if (i_usage_end <= 500) {
                        var stateMain = nlapiYieldScript();

                        if (stateMain.status == 'RESUME') {
                            nlapiLogExecution('DEBUG', 'Resum Scripts', ' *********** Resume an scripts **********-->');
                        }
                    }
                }
                catch (ex) {
                    nlapiLogExecution('DEBUG', 'SCH Close Return Authorization', 'Inner Execption -->' + ex);
                }
            }
        }
    }
    catch (Execption) {
        nlapiLogExecution('DEBUG', 'SCH Close Return Authorization', ' Execption -->' + Execption);
    }
}

// END SCHEDULED FUNCTION ===============================================
