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

function schedulerFunction_SetPOPayment(type) {
    /*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
    //==== CODE FOR DESGNING POP UP XL ======
    try {
        var i_context = nlapiGetContext();

        var i_recordId = i_context.getSetting('SCRIPT', 'custscript_pay_recordid');
        var s_recordtype = 'vendorpayment';

        var o_recordObj = nlapiLoadRecord(s_recordtype, i_recordId);

        var POArray = new Array();

        var filter = new Array();
        var column = new Array();

        filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', i_recordId));

        column[0] = new nlobjSearchColumn('internalid', null, 'group');
        column[1] = new nlobjSearchColumn('createdfrom', 'paidtransaction', 'group');
        column[2] = new nlobjSearchColumn('paidamount', null, 'sum');

        var SE_BillPaymentResult = nlapiSearchRecord('transaction', 'customsearch_billpayment_withpobill', filter, column);

        if (SE_BillPaymentResult != null && SE_BillPaymentResult != '' && SE_BillPaymentResult != undefined) {
            for (var i = 0; i < SE_BillPaymentResult.length; i++) {
                var InternalId = SE_BillPaymentResult[i].getValue('internalid', null, 'group');
                //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'InternalId -->' + InternalId);

                var POID = SE_BillPaymentResult[i].getValue('createdfrom', 'paidtransaction', 'group');
                //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'POID -->' + POID);

                POArray.push(POID);

                PO_Payment_and_billCredit_Amount(POID);

                var i_usage_end = i_context.getRemainingUsage();
                //nlapiLogExecution('DEBUG', 'SCH Update Vendor Payment', ' *********** Usage end **********-->' + i_usage_end);

                if (i_usage_end <= 500) {
                    var stateMain = nlapiYieldScript();

                    if (stateMain.status == 'RESUME') {
                        nlapiLogExecution('DEBUG', 'Resum Scripts', ' *********** Resume an scripts **********-->');
                    }
                }
            }

            var CheckNo = o_recordObj.getFieldValue('tranid');
            //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'CheckNo -->' + CheckNo);

            if (CheckNo != null && CheckNo != '' && CheckNo != undefined) {
                o_recordObj.setFieldValue('custbody_check_no_exists', 'T');
            }
            else {
                o_recordObj.setFieldValue('custbody_check_no_exists', 'F');
            }

            o_recordObj.setFieldValue('custbody_po_payment_link', POArray);

            var UpdatedPaymentID = nlapiSubmitRecord(o_recordObj, {
                disabletriggers: true,
                enablesourcing: false,
                ignoremandatoryfields: true
            });

            nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'UpdatedPaymentID -->' + UpdatedPaymentID);

        }
    }
    catch (ex) {
        nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'ex -->' + ex);

    }
}

// END SCHEDULED FUNCTION ===============================================



// BEGIN FUNCTION ===================================================
function PO_Payment_and_billCredit_Amount(POID) {
    try {
        var Paytext = '';
        var PaidAmount = 0;
        var BillCreditAmount = 0;
        var UpdatePO = false;

        var POfilter = new Array();
        var POcolumn = new Array();

        POfilter.push(new nlobjSearchFilter('createdfrom', 'paidtransaction', 'anyOf', POID));

        POcolumn[0] = new nlobjSearchColumn('createdfrom', 'paidtransaction', 'group');
        POcolumn[1] = new nlobjSearchColumn('internalid', null, 'group');
        POcolumn[2] = new nlobjSearchColumn('trandate', null, 'group');
        POcolumn[3] = new nlobjSearchColumn('tranid', null, 'group');
        POcolumn[4] = new nlobjSearchColumn('paidamount', null, 'sum');
        POcolumn[5] = new nlobjSearchColumn('custbody_credit_card_on_file_trans', null, 'group');
        POcolumn[6] = new nlobjSearchColumn('tranid', 'paidtransaction', 'group');

        var PO_BillPaymentResult = nlapiSearchRecord('transaction', 'customsearch_billpayment_withpobill', POfilter, POcolumn);

        if (PO_BillPaymentResult != null && PO_BillPaymentResult != '' && PO_BillPaymentResult != undefined) {
            for (var j = 0; j < PO_BillPaymentResult.length; j++) {
                var PaymentInternalId = PO_BillPaymentResult[j].getValue('internalid', null, 'group');
                //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'PaymentInternalId -->' + PaymentInternalId);

                var CheckNumber = PO_BillPaymentResult[j].getValue('tranid', null, 'group');
                //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'CheckNumber -->' + CheckNumber);

                var TransactionDate = PO_BillPaymentResult[j].getValue('trandate', null, 'group');
                // nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'TransactionDate -->' + TransactionDate);

                var FinalPOID = PO_BillPaymentResult[j].getValue('createdfrom', 'paidtransaction', 'group');
                // nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'FinalPOID -->' + FinalPOID);

                var BillNo = PO_BillPaymentResult[j].getValue('tranid', 'paidtransaction', 'group');
                //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'BillNo -->' + BillNo);

                PaidAmount = PO_BillPaymentResult[j].getValue('paidamount', null, 'sum');
                // nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'PaidAmount -->' + PaidAmount);

                var PaidBy = PO_BillPaymentResult[j].getText('custbody_credit_card_on_file_trans', null, 'group');
                // nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'PaidBy -->' + PaidBy);

                var PaymentText = 'Paid with ' + PaidBy + ' ' + CheckNumber + '\n' + 'inv. ' + BillNo + '\n' + PaidAmount + '\n' + TransactionDate;

                Paytext = Paytext + '\n' + PaymentText;

            }
            UpdatePO = true;

        }

        var BillCredit_filter = new Array();
        var BillCredit_Column = new Array();

        BillCredit_filter.push(new nlobjSearchFilter('custbody_billcredit_linked_po', null, 'anyOf', POID));
        BillCredit_filter.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));

        BillCredit_Column[0] = new nlobjSearchColumn('amount');
        BillCredit_Column[1] = new nlobjSearchColumn('internalid');
        BillCredit_Column[2] = new nlobjSearchColumn('memo');
        BillCredit_Column[3] = new nlobjSearchColumn('tranid');
        BillCredit_Column[4] = new nlobjSearchColumn('trandate');

        var PO_BillCreditResult = nlapiSearchRecord('vendorcredit', null, BillCredit_filter, BillCredit_Column);

        if (PO_BillCreditResult != null && PO_BillCreditResult != '' && PO_BillCreditResult != undefined) {
            for (var k = 0; k < PO_BillCreditResult.length; k++) {
                var BillCreditId = PO_BillCreditResult[k].getValue('internalid');
                // nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'BillCreditId -->' + BillCreditId);

                var TranID = PO_BillCreditResult[k].getValue('tranid');
                //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'TranID -->' + TranID);

                var trandate = PO_BillCreditResult[k].getValue('trandate');
                //nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'trandate -->' + trandate);

                var memo = PO_BillCreditResult[k].getValue('memo');
                // nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'memo -->' + memo);

                BillCreditAmount = PO_BillCreditResult[k].getValue('amount');
                // nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'BillCreditAmount -->' + BillCreditAmount);

                BillCreditAmount = (parseFloat(BillCreditAmount) * parseFloat((-1)))

                var PaymentText = 'Received ' + TranID + '-' + memo + '-' + BillCreditAmount + '-' + trandate;

                Paytext = Paytext + '\n' + PaymentText;
            }
            UpdatePO = true;
        }

        if (UpdatePO == true) {
            var UpdatedPOID = nlapiSubmitField('purchaseorder', POID, 'custbodycheck_number', Paytext);
            nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'UpdatedPOID -->' + UpdatedPOID);

        }
    }
    catch (ex) {
        nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'Inner ex -->' + ex);

    }
}


// END FUNCTION =====================================================

