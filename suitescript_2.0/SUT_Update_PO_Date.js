// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
/*
   	Script Name:SUT_GetCustomerID
	Author:		Nikhil
	

	Script Modification Log:

	-- Date --			-- Modified By --				--Requested By--				-- Description --



Below is a summary of the process controls enforced by this script file.  The control logic is described
more fully, below, in the appropriate function headers and code blocks.


     SUITELET
		- suiteletFunction(request, response)


     SUB-FUNCTIONS
		- The following sub-functions are called by the above core functions in order to maintain code
            modularization:

               - NOT USED

*/
}
// END SCRIPT DESCRIPTION BLOCK  ====================================



// BEGIN GLOBAL VARIABLE BLOCK  =====================================
{
	//  Initialize any Global Variables, in particular, debugging variables...




}
// END GLOBAL VARIABLE BLOCK  =======================================





// BEGIN SUITELET ==================================================

function suiteletFunction_UpdatePODate(request, response) {

    /*  Suitelet:
	 - EXPLAIN THE PURPOSE OF THIS FUNCTION
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
    //  LOCAL VARIABLES


    //  SUITELET CODE BODY

    try {
        if (request.getMethod() == 'GET') {
            var i_recordID = request.getParameter('recordID');

            var PO_Obj = nlapiLoadRecord('purchaseorder', i_recordID);
            nlapiLogExecution('DEBUG', 'suiteletFunction_UpdatePODate', ' PO_Obj' + PO_Obj);

            var ReceiptDate = PO_Obj.getFieldValue('custbody_expected_receiving_date');
            var Comments = PO_Obj.getFieldValue('custbodycomments_for_warehouse');

            var form = nlapiCreateForm("", false)

            var ReceiptDateObj = form.addField('custpage_expectedreceiptdate', 'date', 'EXPECTED RECEIVING DATE')
            ReceiptDateObj.setLayoutType('outside', 'startrow');
            ReceiptDateObj.setDefaultValue(ReceiptDate);
            ReceiptDateObj.setMandatory(true);

            var commentsObj = form.addField('custpage_comment', 'textarea', 'Comments For WareHouse')
            commentsObj.setLayoutType('outside', 'startrow');
            commentsObj.setDefaultValue(Comments);

            var RecordIDFieldObj = form.addField('custpage_recordid', 'text', 'Record ID')
            RecordIDFieldObj.setDisplayType('hidden')
            RecordIDFieldObj.setDefaultValue(i_recordID);

            form.addSubmitButton('Submit')

            response.writePage(form);
        }
        else {
            if (request.getMethod() == 'POST') {
                var ReceiptDate = request.getParameter('custpage_expectedreceiptdate');
                nlapiLogExecution('DEBUG', 'Before Load', 'ReceiptDate --> ' + ReceiptDate);

                var comments = request.getParameter('custpage_comment');
                nlapiLogExecution('DEBUG', 'Before Load', 'comments --> ' + comments);

                var i_recordID = request.getParameter('custpage_recordid');
                nlapiLogExecution('DEBUG', 'Before Load', 'i_recordID --> ' + i_recordID);

                var PO_Obj = nlapiLoadRecord('purchaseorder', i_recordID);
                nlapiLogExecution('DEBUG', 'suiteletFunction_UpdatePODate', ' PO_Obj' + PO_Obj);

                PO_Obj.setFieldValue('custbody_expected_receiving_date', ReceiptDate);
                PO_Obj.setFieldValue('custbodycomments_for_warehouse', comments);

                var UpdatePOID = nlapiSubmitRecord(PO_Obj, true, true);

                response.write('<html><head><script>window.opener.UpdatePurchaseOrder();self.close();</script></head><body></body></html>');
                //response.write('<html><head><script>window.location.reload();</script></head><body></body></html>');
            }
        }
    }
    catch (ex) {
        nlapiLogExecution('DEBUG', 'suiteletFunction_UpdatePODate', 'Sub record' + ex);
        response.write(ex)
    }
}


// END SUITELET ====================================================



// BEGIN OBJECT CALLED/INVOKING FUNCTION ===================================================