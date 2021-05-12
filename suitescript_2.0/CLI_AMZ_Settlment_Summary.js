function searchsettlementtransactions(){
	var settlementsummary = nlapiGetFieldValue('custpage_settlementsummary');
	var settlementtype = nlapiGetFieldValue('custpage_settlementtype');
	var i_SetType = nlapiGetFieldValue('custpage_settype');

	if (window.onbeforeunload) {
		window.onbeforeunload = function(){
			null;
		};
	}
	
	var URL = nlapiResolveURL('SUITELET', 'customscript_amz_settlement_report', '1');
	
	URL = URL + '&settlementsummary=' + settlementsummary + '&settlementtype=' + settlementtype + '&settype=' + i_SetType;
	
	window.location = URL;
}


function searchothersettlementtransactions() 
{
    var settlementsummary = nlapiGetFieldValue('custpage_othersettlementsummary');
    var settlementtype = nlapiGetFieldValue('custpage_settlementtype');
	var i_SetType = nlapiGetFieldValue('custpage_settype');

    if (window.onbeforeunload) {
        window.onbeforeunload = function () {
            null;
        };
    }

    var URL = nlapiResolveURL('SUITELET', 'customscript_amz_settlement_report', '1');

    URL = URL + '&othersettlementsummary=' + settlementsummary + '&settlementtype=' + settlementtype + '&settype=' + i_SetType;

    window.location = URL;
}

function markallsettlementtransactions()
{
    var TransLineCount = nlapiGetLineItemCount('custpage_amztranslist');
    nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);

    for (var r = 1; r <= TransLineCount; r++)
    {
        var PaymentReconciled = nlapiGetLineItemValue('custpage_amztranslist', 'custpage_paymentreconciled', r);

        if (PaymentReconciled != 'T') {
            var PaymentTrans = nlapiGetLineItemValue('custpage_amztranslist', 'paymenttransaction', r);

            if (PaymentTrans != null && PaymentTrans != '' && PaymentTrans != undefined)
            {
                nlapiSetLineItemValue('custpage_amztranslist', 'custpage_reconcilecheck', r, 'T');
            }
        }
    }
}

function unmarkallsettlementtransactions() {
    var TransLineCount = nlapiGetLineItemCount('custpage_amztranslist');
    nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);

    for (var r = 1; r <= TransLineCount; r++) {
        nlapiSetLineItemValue('custpage_amztranslist', 'custpage_reconcilecheck', r, 'F');

    }
}



function othermarkallsettlementtransactions() {
    var TransLineCount = nlapiGetLineItemCount('custpage_othertranslist');
    nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);

    for (var r = 1; r <= TransLineCount; r++) {
        var PaymentReconciled = nlapiGetLineItemValue('custpage_othertranslist', 'custpage_paymentreconciled', r);

        if (PaymentReconciled != 'T') {
            var PaymentTrans = nlapiGetLineItemValue('custpage_othertranslist', 'paymenttransaction', r);

            if (PaymentTrans != null && PaymentTrans != '' && PaymentTrans != undefined) {
                nlapiSetLineItemValue('custpage_othertranslist', 'custpage_reconcilecheck', r, 'T');
            }
        }
    }
}

function otherunmarkallsettlementtransactions() {
    var TransLineCount = nlapiGetLineItemCount('custpage_othertranslist');
    nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);

    for (var r = 1; r <= TransLineCount; r++) {
        nlapiSetLineItemValue('custpage_othertranslist', 'custpage_reconcilecheck', r, 'F');

    }
}


function PageInit_DisabledReconcileCheck() {
    var TotalProductCharges = 0;
    var TotalPaymentAmount = 0;
    var TotalDifference = 0;

    var TransLineCount = nlapiGetLineItemCount('custpage_amztranslist');
    nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);
    //alert(TransLineCount);
    for (var r = 1; r <= TransLineCount; r++) {
        var PaymentTrans = nlapiGetLineItemValue('custpage_amztranslist', 'paymenttransaction', r);

        var ProductCharges = nlapiGetLineItemValue('custpage_amztranslist', 'custrecord_celigo_amzio_set_total_prod_c', r);
        var PaymentAmt = nlapiGetLineItemValue('custpage_amztranslist', 'paymentamount', r);
        var Difference = nlapiGetLineItemValue('custpage_amztranslist', 'differenceamount', r);

        if (ProductCharges != null && ProductCharges != '' && ProductCharges != undefined) {
            TotalProductCharges = (parseFloat(TotalProductCharges) + parseFloat(ProductCharges))
        }
        if (PaymentAmt != null && PaymentAmt != '' && PaymentAmt != undefined) {
            TotalPaymentAmount = (parseFloat(TotalPaymentAmount) + parseFloat(PaymentAmt))
        }
        if (Difference != null && Difference != '' && Difference != undefined) {
            TotalDifference = (parseFloat(TotalDifference) + parseFloat(Difference))
        }

        if (PaymentTrans != null && PaymentTrans != '' && PaymentTrans != undefined) {
            var PaymentReconciled = nlapiGetLineItemValue('custpage_amztranslist', 'custpage_paymentreconciled', r);
            if (PaymentReconciled == 'T') {
                nlapiDisableLineItemField('custpage_amztranslist', 'custpage_reconcilecheck', true)
            }
        }
        else {
            nlapiDisableLineItemField('custpage_amztranslist', 'custpage_reconcilecheck', true)
        }
    }

    var OtherTransLineCount = nlapiGetLineItemCount('custpage_othertranslist');
    nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' OtherTransLineCount -->' + OtherTransLineCount);
    //alert(TransLineCount);
    for (var s = 1; s <= OtherTransLineCount; s++) {
        var PaymentTrans = nlapiGetLineItemValue('custpage_othertranslist', 'paymenttransaction', s);


        var ProductCharges = nlapiGetLineItemValue('custpage_othertranslist', 'custrecord_transaction_amount', s);
        var PaymentAmt = nlapiGetLineItemValue('custpage_othertranslist', 'paymentamount', s);
        var Difference = nlapiGetLineItemValue('custpage_othertranslist', 'differenceamount', s);

        if (ProductCharges != null && ProductCharges != '' && ProductCharges != undefined) {
            TotalProductCharges = (parseFloat(TotalProductCharges) + parseFloat(ProductCharges))
        }
        if (PaymentAmt != null && PaymentAmt != '' && PaymentAmt != undefined) {
            TotalPaymentAmount = (parseFloat(TotalPaymentAmount) + parseFloat(PaymentAmt))
        }
        if (Difference != null && Difference != '' && Difference != undefined) {
            TotalDifference = (parseFloat(TotalDifference) + parseFloat(Difference))
        }

        if (PaymentTrans != null && PaymentTrans != '' && PaymentTrans != undefined) {
            var PaymentReconciled = nlapiGetLineItemValue('custpage_othertranslist', 'custpage_paymentreconciled', s);
            if (PaymentReconciled == 'T') {
                nlapiDisableLineItemField('custpage_othertranslist', 'custpage_reconcilecheck', true)
            }
        }
        else {
            nlapiDisableLineItemField('custpage_othertranslist', 'custpage_reconcilecheck', true)
        }
    }
    nlapiSetFieldValue('custpage_total_pc', TotalProductCharges);
    nlapiSetFieldValue('custpage_total_payamt', TotalPaymentAmount);
    nlapiSetFieldValue('custpage_total_diff', TotalDifference);
}

function ONSave_CheckPaymentLines(){
	var TransLineCount = nlapiGetLineItemCount('custpage_amztranslist');
	//nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);
	
	var PaymentCheck = false;
	
	for (var r = 1; r <= TransLineCount; r++) {
		var Reconcile = nlapiGetLineItemValue('custpage_amztranslist', 'custpage_reconcilecheck', r);
		if (Reconcile == 'T') {
			PaymentCheck = true;
			break;
		}
		
	}
	
	var OtherLineCount = nlapiGetLineItemCount('custpage_othertranslist');
	//nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);
	
	for (var r = 1; r <= OtherLineCount; r++) {
		var Reconcile = nlapiGetLineItemValue('custpage_othertranslist', 'custpage_reconcilecheck', r);
		if (Reconcile == 'T') {
			PaymentCheck = true;
			break;
		}
	}
	if (PaymentCheck == false) {
		alert('Pleaase select atleast one payment to Reconcile');
		return false;
	}
	
	return true;
}



function FieldChange_CheckPaymentLines(type, name)
{
	if (type == 'custpage_amztranslist' && name == 'custpage_reconcilecheck') 
	{
		var reconcilecheck = nlapiGetCurrentLineItemValue('custpage_amztranslist', 'custpage_reconcilecheck');
		
		if (reconcilecheck == 'T') {
			var PaymentTrans = nlapiGetCurrentLineItemValue('custpage_amztranslist', 'paymenttransaction');
			// alert(PaymentTrans)
			if (PaymentTrans != null && PaymentTrans != '' && PaymentTrans != undefined) {
				var PaymentReconciled = nlapiGetCurrentLineItemValue('custpage_amztranslist', 'custpage_paymentreconciled');
				if (PaymentReconciled == 'T') {
					alert('Reconcile check cannot be checked where payment is already reconciled')
					nlapiSetCurrentLineItemValue('custpage_amztranslist', 'custpage_reconcilecheck', 'F', false, false);
				}
			}
			else {
				alert('Reconcile check cannot be checked for where no payment exists')
				nlapiSetCurrentLineItemValue('custpage_amztranslist', 'custpage_reconcilecheck', 'F', false, false);
			}
		}
	}
	
	if (type == 'custpage_othertranslist' && name == 'custpage_reconcilecheck') 
	{
		var reconcilecheck = nlapiGetCurrentLineItemValue('custpage_othertranslist', 'custpage_reconcilecheck');
		
		if (reconcilecheck == 'T') {
			var PaymentTrans = nlapiGetCurrentLineItemValue('custpage_othertranslist', 'paymenttransaction');
			// alert(PaymentTrans)
			if (PaymentTrans != null && PaymentTrans != '' && PaymentTrans != undefined) {
				var PaymentReconciled = nlapiGetCurrentLineItemValue('custpage_othertranslist', 'custpage_paymentreconciled');
				if (PaymentReconciled == 'T') {
					alert('Reconcile check cannot be checked where payment is already reconciled')
					nlapiSetCurrentLineItemValue('custpage_othertranslist', 'custpage_reconcilecheck', 'F', false, false);
				}
			}
			else {
				alert('Reconcile check cannot be checked for where no payment exists')
				nlapiSetCurrentLineItemValue('custpage_othertranslist', 'custpage_reconcilecheck', 'F', false, false);
			}
		}
	}
	
	
	if (name == 'custpage_settype') {
		var i_SetType = nlapiGetFieldValue('custpage_settype');
		
		if (i_SetType != null && i_SetType != '' && i_SetType != undefined) {
			var URL = nlapiResolveURL('SUITELET', 'customscript_amz_settlement_report', '1');
			
			URL = URL + '&settype=' + i_SetType;
			
			if (window.onbeforeunload) {
				window.onbeforeunload = function(){
					null;
				};
			}
			
			window.location = URL;
		}
	}
}
