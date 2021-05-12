// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
/*
   	Script Name:
	Author:		
	Company:.
	Date:		

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

function suiteletFunction_AmazonSettlementTrans(request, response){
	/*  Suitelet:
	 - EXPLAIN THE PURPOSE OF THIS FUNCTION
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  SUITELET CODE BODY
	
	if (request.getMethod() == 'GET') {
		var form = nlapiCreateForm('Settlement Transactions');
		
		form.setScript('customscript_cli_amz_settlementrpt');
		
		var settype = request.getParameter('settype');
		
		var o_type_Obj = form.addField('custpage_settype', 'Select', 'Settlement Type', 'customlist_settlement_type');
		o_type_Obj.setDefaultValue(settype)
		
		var o_settlementtype_Obj = form.addField('custpage_settlementtype', 'Select', 'Type');
		o_settlementtype_Obj.addSelectOption("1", "ALL");
		o_settlementtype_Obj.addSelectOption("2", "Matched");
		o_settlementtype_Obj.addSelectOption("3", "UnMatched");
		
		var settlementtype = request.getParameter('settlementtype');
		
		if (settlementtype != null && settlementtype != '' && settlementtype != undefined) {
			o_settlementtype_Obj.setDefaultValue(settlementtype);
		}
		else {
			settlementtype = 1;
			o_settlementtype_Obj.setDefaultValue(1);
		}
		
		
		if (settype != null && settype != '' && settype != undefined)
		{
		    if (settype == 5)
		    {
				var o_settlement_Obj = form.addField('custpage_settlementsummary', 'Select', 'Settlement Summary', 'customrecord_celigo_amzio_sett_summary');
				
				
				var settlementsummary = request.getParameter('settlementsummary');
				
				if (settlementsummary != null && settlementsummary != '' && settlementsummary != undefined)
				{
					o_settlement_Obj.setDefaultValue(settlementsummary);
				}
				
				form.addButton('custpage_settlement_trans', 'Search', 'searchsettlementtransactions()')
				
				var o_TotalPC_Obj = form.addField('custpage_total_pc', 'currency', 'Total Product Charges');
				o_TotalPC_Obj.setDisplayType('Disabled');

				var o_TotalPay_Obj = form.addField('custpage_total_payamt', 'currency', 'Total Payment Amount');
				o_TotalPay_Obj.setDisplayType('Disabled');

				var o_TotalDiff_Obj = form.addField('custpage_total_diff', 'currency', 'Total Difference');
				o_TotalDiff_Obj.setDisplayType('Disabled');

				var sublist1 = form.addSubList('custpage_amztranslist', 'list', 'Settlement Transactions');
				
				sublist1.addButton('custpage_transmarkall', 'Mark All', 'markallsettlementtransactions()')
				sublist1.addButton('custpage_transunmarkall', 'Un Mark All', 'unmarkallsettlementtransactions()')
				//sublist1.addMarkAllButtons()
				
				setSubList(sublist1, form, request, response, settlementsummary, settlementtype)
			}
			else {
				var sublist1 = form.addSubList('custpage_othertranslist', 'list', 'Settlement Transactions');
				
				sublist1.addButton('custpage_othertransmarkall', 'Mark All', 'othermarkallsettlementtransactions()')
				sublist1.addButton('custpage_othertransunmarkall', 'Un Mark All', 'otherunmarkallsettlementtransactions()')

				var o_settlement_Obj = form.addField('custpage_othersettlementsummary', 'Select', 'Settlement Summary');
				o_settlement_Obj.addSelectOption('', '');
				SearchSettlementID(o_settlement_Obj, settype)
				var settlementsummary = request.getParameter('othersettlementsummary');
				
				if (settlementsummary != null && settlementsummary != '' && settlementsummary != undefined)
				{
					o_settlement_Obj.setDefaultValue(settlementsummary);
				}

				var o_TotalPC_Obj = form.addField('custpage_total_pc', 'currency', 'Total Product Charges');
				o_TotalPC_Obj.setDisplayType('Disabled');

				var o_TotalPay_Obj = form.addField('custpage_total_payamt', 'currency', 'Total Payment Amount');
				o_TotalPay_Obj.setDisplayType('Disabled');

				var o_TotalDiff_Obj = form.addField('custpage_total_diff', 'currency', 'Total Difference');
				o_TotalDiff_Obj.setDisplayType('Disabled');
				
				setOtherSubList(settype, sublist1, form, request, response, settlementsummary, settlementtype)
				
				form.addButton('custpage_settlement_trans', 'Search', 'searchothersettlementtransactions()')
				
			}
			form.addSubmitButton('Submit');
		}
		response.writePage(form);
	}
	else {
		//----- Send the Email -----
		
		//var StatementDate = request.getParameter('custpage_statementdate');
		
		var SettleType = request.getParameter('custpage_settype');
		
		if (SettleType == 5) {
			var TransLineCount = request.getLineItemCount('custpage_amztranslist');
			nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);
			
			var data = '';
			
			for (var r = 1; r <= TransLineCount; r++) {
				var check = request.getLineItemValue('custpage_amztranslist', 'custpage_reconcilecheck', r);
				//nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' check -->' + check);
				
				if (check == 'T') {
					var SettleTrans = request.getLineItemValue('custpage_amztranslist', 'customrecord_celigo_amzio_settle_trans', r);
					// nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' SettleTrans -->' + SettleTrans);
					
					if (data != null && data != '' && data != undefined) {
						data = data + '#' + SettleTrans;
					}
					else {
						data = SettleTrans;
					}
				}
			}
		}
		else {
			var TransLineCount = request.getLineItemCount('custpage_othertranslist');
			nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' TransLineCount -->' + TransLineCount);
			
			var data = '';
			
			for (var r = 1; r <= TransLineCount; r++) {
				var check = request.getLineItemValue('custpage_othertranslist', 'custpage_reconcilecheck', r);
				//nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' check -->' + check);
				
				if (check == 'T') {
					var SettleTrans = request.getLineItemValue('custpage_othertranslist', 'customrecord_internalid', r);
					// nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' SettleTrans -->' + SettleTrans);
					
					if (data != null && data != '' && data != undefined) {
						data = data + '#' + SettleTrans;
					}
					else {
						data = SettleTrans;
					}
				}
			}
		}
		
		var Params = new Array();
		Params['custscript_settletype'] = SettleType;
		Params['custscript_amzsettletrans'] = data;
		
		var status = nlapiScheduleScript('customscript_sch_reconcile_amzsettletran', '1', Params)
		if (status == 'QUEUED') {
		
		}
		nlapiSetRedirectURL('SUITELET', 'customscript_amz_settlement_report', '1');
	}
}
// END SUITELET ====================================================




// BEGIN OBJECT CALLED/INVOKING FUNCTION ===================================================


function setSubList(sublist1, form, request, response, settlementsummary, settlementtype) {

    if (settlementsummary != null && settlementsummary != '' && settlementsummary != undefined) {
        var searchid = 0;
        var j = 0;
        var SerialCost = 0;
        var TotalSerialCost = 0;
        var TotalOnHandQty = 0;
        var TotalSalesQty = 0;
        var TotalSalesAmount = 0;

        var email = sublist1.addField('custpage_reconcilecheck', 'checkbox', "Reconcile");

        var ReconciledObj = sublist1.addField('custpage_paymentreconciled', 'checkbox', "Payment Reconciled");
        ReconciledObj.setDisplayType('Disabled')
        //sublist1.addField('name', 'text', 'Name');

        var PaymentTransOBJ = sublist1.addField('customrecord_celigo_amzio_settle_trans', 'select', 'Name', 'customrecord_celigo_amzio_settle_trans');
        PaymentTransOBJ.setDisplayType('inline')

        var PaymentOBJ = sublist1.addField('custrecord_celigo_amzio_set_summary', 'select', 'SETTLEMENT SUMMARY PARENT', 'customrecord_celigo_amzio_sett_summary');
        PaymentOBJ.setDisplayType('inline')

        var InvoiceOBJ = sublist1.addField('invoicetransaction', 'select', 'NETSUITE TRANSACTION (TO APPLY)', 'transaction');
        InvoiceOBJ.setDisplayType('inline')

        var PaymentDispObj = sublist1.addField('paymenttransaction_display', 'select', 'NETSUITE TRANSACTION (APPLIED)', 'transaction');
        PaymentDispObj.setDisplayType('inline')

        var PaymentOBJ = sublist1.addField('paymenttransaction', 'select', 'NETSUITE TRANSACTION (APPLIED)', 'transaction');
        PaymentOBJ.setDisplayType('hidden')

        sublist1.addField('custrecord_celigo_amzio_set_total_prod_c', 'currency', 'Total Product Charges');

        sublist1.addField('paymentamount', 'currency', ' Amount');

        sublist1.addField('differenceamount', 'currency', 'Difference');

        var itemrec_search = nlapiLoadSearch('customrecord_celigo_amzio_settle_trans', 'customsearch_amz_settlement_trans');

        if (itemrec_search != null && itemrec_search != '' && itemrec_search != undefined) {
            var filterExpression = "";
            if (settlementtype == 1) {
                filterExpression = [['custrecord_celigo_amzio_set_summary', 'anyOf', [settlementsummary]], 'AND',
                  [['custrecord_celigo_amzio_set_recond_trans', 'anyOf', '@NONE@'], 'or', [['custrecord_celigo_amzio_set_recond_trans', 'noneOf', '@NONE@'], 'AND', ['custrecord_celigo_amzio_set_recond_trans.mainline', 'is', 'T']]]];
            }
            if (settlementtype == 2) {
                filterExpression = [['custrecord_celigo_amzio_set_summary', 'anyOf', [settlementsummary]], 'AND',
                  [[['custrecord_celigo_amzio_set_recond_trans', 'noneOf', '@NONE@'], 'AND', ['custrecord_celigo_amzio_set_recond_trans.mainline', 'is', 'T'], 'AND', ['formulanumeric: case when {custrecord_celigo_amzio_set_total_prod_c} = {custrecord_celigo_amzio_set_recond_trans.amount} then 1 else 0 end', 'equalto', '1']]]];
            }
            if (settlementtype == 3) {
                filterExpression = [['custrecord_celigo_amzio_set_summary', 'anyOf', [settlementsummary]], 'AND',
                  [['custrecord_celigo_amzio_set_recond_trans', 'anyOf', '@NONE@'], 'or', [['custrecord_celigo_amzio_set_recond_trans', 'noneOf', '@NONE@'], 'AND', ['custrecord_celigo_amzio_set_recond_trans.mainline', 'is', 'T']]]];
            }
            itemrec_search.setFilterExpression(filterExpression);

            var POSerialArray = new Array();
            var resultset = itemrec_search.runSearch();


            do {
                var mapping_search = resultset.getResults(searchid, searchid + 1000);

                if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {

                    for (var rs in mapping_search) {
                        var result = mapping_search[rs];
                        var columns = result.getAllColumns();
                        var columnLen = columns.length;

                        var customrecord_celigo_amzio_settle_trans = '';
                        var custrecord_celigo_amzio_set_summary = '';
                        var invoicetransaction = '';
                        var paymenttransaction = '';
                        var custrecord_celigo_amzio_set_total_prod_c = 0;
                        var paymentamount = 0;
                        var paymentreconciled = '';

                        for (var i = 0; i < columnLen; i++) {
                            var column = columns[i];
                            var LabelName = column.getLabel();
                            var fieldName = column.getName();
                            var value = result.getValue(column);
                            //var text = result.getText(column);

                            if (fieldName == 'internalid') {
                                customrecord_celigo_amzio_settle_trans = value
                            }
                            if (fieldName == 'custrecord_celigo_amzio_set_summary') {
                                custrecord_celigo_amzio_set_summary = value;
                            }
                            if (fieldName == 'custrecord_celigo_amzio_set_trans_to_rec') {
                                invoicetransaction = value;
                            }
                            if (fieldName == 'custrecord_celigo_amzio_set_recond_trans') {
                                paymenttransaction = value;
                            }
                            if (fieldName == 'custrecord_celigo_amzio_set_total_prod_c') {
                                custrecord_celigo_amzio_set_total_prod_c = value;
                            }
                            if (fieldName == 'amount') {
                                paymentamount = value;
                            }
                            if (fieldName == 'custbody_payment_reconciled') {
                                paymentreconciled = value;
                            }
                        }

                        searchid++;

                        var Difference = 0;

                        if (paymenttransaction != null && paymenttransaction != '' && paymenttransaction != undefined) {
                            Difference = (parseFloat(custrecord_celigo_amzio_set_total_prod_c) - parseFloat(paymentamount));
                        }
                        else {
                            Difference = custrecord_celigo_amzio_set_total_prod_c;
                        }

                        if (settlementtype == 3) {
                            if (parseFloat(Difference) != parseFloat(0)) {
                                j++;
                                sublist1.setLineItemValue('custpage_paymentreconciled', j, paymentreconciled);
                                sublist1.setLineItemValue('customrecord_celigo_amzio_settle_trans', j, customrecord_celigo_amzio_settle_trans);
                                sublist1.setLineItemValue('custrecord_celigo_amzio_set_summary', j, custrecord_celigo_amzio_set_summary);
                                sublist1.setLineItemValue('invoicetransaction', j, invoicetransaction);
                                sublist1.setLineItemValue('paymenttransaction_display', j, paymenttransaction);
                                sublist1.setLineItemValue('paymenttransaction', j, paymenttransaction);
                                sublist1.setLineItemValue('custrecord_celigo_amzio_set_total_prod_c', j, custrecord_celigo_amzio_set_total_prod_c);
                                sublist1.setLineItemValue('paymentamount', j, paymentamount);
                                sublist1.setLineItemValue('differenceamount', j, Difference);
                            }
                        }
                        else {
                            j++;
                            sublist1.setLineItemValue('custpage_paymentreconciled', j, paymentreconciled);
                            sublist1.setLineItemValue('customrecord_celigo_amzio_settle_trans', j, customrecord_celigo_amzio_settle_trans);
                            sublist1.setLineItemValue('custrecord_celigo_amzio_set_summary', j, custrecord_celigo_amzio_set_summary);
                            sublist1.setLineItemValue('invoicetransaction', j, invoicetransaction);
                            sublist1.setLineItemValue('paymenttransaction_display', j, paymenttransaction);
                            sublist1.setLineItemValue('paymenttransaction', j, paymenttransaction);
                            sublist1.setLineItemValue('custrecord_celigo_amzio_set_total_prod_c', j, custrecord_celigo_amzio_set_total_prod_c);
                            sublist1.setLineItemValue('paymentamount', j, paymentamount);
                            sublist1.setLineItemValue('differenceamount', j, Difference);
                        }
                    }
                }
            }
            while (mapping_search.length >= 1000);

            nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'searchid -->' + searchid)
        }
    }
}


function setOtherSubList(settype, sublist1, form, request, response, settlementsummary, settlementtype){
	if (settlementsummary != null && settlementsummary != '' && settlementsummary != undefined) {
		var searchid = 0;
		var j = 0;
		var SerialCost = 0;
		var TotalSerialCost = 0;
		var TotalOnHandQty = 0;
		var TotalSalesQty = 0;
		var TotalSalesAmount = 0;
		
		var email = sublist1.addField('custpage_reconcilecheck', 'checkbox', "Reconcile");
		
		var ReconciledObj = sublist1.addField('custpage_paymentreconciled', 'checkbox', "Payment Reconciled");
		ReconciledObj.setDisplayType('Disabled')
		//sublist1.addField('name', 'text', 'Name');
		
		var PaymentTransOBJ = sublist1.addField('customrecord_internalid', 'select', 'Name', 'customrecord_rec_transaction');
		PaymentTransOBJ.setDisplayType('inline')
		
		var PaymentOBJ = sublist1.addField('custrecord_settlement_id', 'text', 'SETTLEMENT ID');
		PaymentOBJ.setDisplayType('inline')
		
		var PaymentTextOBJ = sublist1.addField('custrecord_payment', 'text', 'Payment');
		PaymentTextOBJ.setDisplayType('inline')
		
		var PaymentDispObj = sublist1.addField('paymenttransaction_display', 'select', 'NETSUITE TRANSACTION (APPLIED)', 'transaction');
		PaymentDispObj.setDisplayType('inline')
		
		var PaymentOBJ = sublist1.addField('paymenttransaction', 'select', 'NETSUITE TRANSACTION (APPLIED)', 'transaction');
		PaymentOBJ.setDisplayType('hidden')
		
		sublist1.addField('custrecord_transaction_amount', 'currency', 'Total Product Charges');
		
		sublist1.addField('paymentamount', 'currency', ' Amount');
		
		sublist1.addField('differenceamount', 'currency', 'Difference');
		
		var itemrec_search = nlapiLoadSearch('customrecord_rec_transaction', 'customsearch_rec_settlement_trans');
		
		if (itemrec_search != null && itemrec_search != '' && itemrec_search != undefined) {
			var filterExpression = "";
			if (settlementtype == 1) {
				filterExpression = [['custrecord_settlement_type', 'anyOf', [settype]], 'AND', ['custrecord_settlement_id', 'is', [settlementsummary]], 'AND', [['custrecord_rectran_payment', 'anyOf', '@NONE@'], 'or', [['custrecord_rectran_payment', 'noneOf', '@NONE@'], 'AND', ['custrecord_rectran_payment.mainline', 'is', 'T']]]];
			}
			if (settlementtype == 2) {
				filterExpression = [['custrecord_settlement_type', 'anyOf', [settype]], 'AND', ['custrecord_settlement_id', 'is', [settlementsummary]], 'AND', [[['custrecord_rectran_payment', 'noneOf', '@NONE@'], 'AND', ['custrecord_rectran_payment.mainline', 'is', 'T'], 'AND', ['formulanumeric: case when {custrecord_transaction_amount} = {custrecord_rectran_payment.amount} then 1 else 0 end', 'equalto', '1']]]];
			}
			if (settlementtype == 3) {
				filterExpression = [['custrecord_settlement_type', 'anyOf', [settype]], 'AND', ['custrecord_settlement_id', 'is', [settlementsummary]], 'AND', [['custrecord_rectran_payment', 'anyOf', '@NONE@'], 'or', [['custrecord_rectran_payment', 'noneOf', '@NONE@'], 'AND', ['custrecord_rectran_payment.mainline', 'is', 'T']]]];
			}
			itemrec_search.setFilterExpression(filterExpression);
			
			var POSerialArray = new Array();
			var resultset = itemrec_search.runSearch();
			
			
			do {
				var mapping_search = resultset.getResults(searchid, searchid + 1000);
				
				if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
				
					for (var rs in mapping_search) {
						var result = mapping_search[rs];
						var columns = result.getAllColumns();
						var columnLen = columns.length;
						
						var internalid = '';
						var custrecord_settlement_id = '';
						var paymenttransaction = '';
						var custrecord_transaction_amount = 0;
						var paymentamount = 0;
						var paymentreconciled = '';
						var custrecord_payment = '';
						
						for (var i = 0; i < columnLen; i++) {
							var column = columns[i];
							var LabelName = column.getLabel();
							var fieldName = column.getName();
							var value = result.getValue(column);
							//var text = result.getText(column);
							
							if (fieldName == 'internalid') {
								internalid = value
							}
							if (fieldName == 'custrecord_payment') {
								custrecord_payment = value
							}
							
							if (fieldName == 'custrecord_settlement_id') {
								custrecord_settlement_id = value;
							}
							if (fieldName == 'custrecord_rectran_payment') {
								paymenttransaction = value;
							}
							if (fieldName == 'custrecord_transaction_amount') {
								custrecord_transaction_amount = value;
							}
							if (fieldName == 'amount') {
								paymentamount = value;
							}
							if (fieldName == 'custbody_payment_reconciled') {
								paymentreconciled = value;
							}
						}
						
						searchid++;
						
						var Difference = 0;
						
						if (paymenttransaction != null && paymenttransaction != '' && paymenttransaction != undefined) {
							Difference = (parseFloat(custrecord_transaction_amount) - parseFloat(paymentamount));
						}
						else {
							Difference = custrecord_transaction_amount;
						}
						
						if (settlementtype == 3) {
							if (parseFloat(Difference) != parseFloat(0)) {
								j++;
								sublist1.setLineItemValue('custrecord_payment', j, custrecord_payment);
								sublist1.setLineItemValue('customrecord_internalid', j, internalid);
								sublist1.setLineItemValue('custpage_paymentreconciled', j, paymentreconciled);
								sublist1.setLineItemValue('custrecord_settlement_id', j, custrecord_settlement_id);
								sublist1.setLineItemValue('paymenttransaction_display', j, paymenttransaction);
								sublist1.setLineItemValue('paymenttransaction', j, paymenttransaction);
								sublist1.setLineItemValue('custrecord_transaction_amount', j, custrecord_transaction_amount);
								sublist1.setLineItemValue('paymentamount', j, paymentamount);
								sublist1.setLineItemValue('differenceamount', j, Difference);
							}
						}
						else {
							j++;
							sublist1.setLineItemValue('custrecord_payment', j, custrecord_payment);
							sublist1.setLineItemValue('customrecord_internalid', j, internalid);
							sublist1.setLineItemValue('custpage_paymentreconciled', j, paymentreconciled);
							sublist1.setLineItemValue('custrecord_settlement_id', j, custrecord_settlement_id);
							sublist1.setLineItemValue('paymenttransaction_display', j, paymenttransaction);
							sublist1.setLineItemValue('paymenttransaction', j, paymenttransaction);
							sublist1.setLineItemValue('custrecord_transaction_amount', j, custrecord_transaction_amount);
							sublist1.setLineItemValue('paymentamount', j, paymentamount);
							sublist1.setLineItemValue('differenceamount', j, Difference);
						}
					}
				}
			}
			while (mapping_search.length >= 1000);
			
			nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'searchid -->' + searchid)
		}
	}
}


function SearchSettlementID(o_select, settype)
{
	var i_cnt = 0;
	var filter = new Array();
	var column = new Array();
	filter.push(new nlobjSearchFilter('custrecord_settlement_type', null, 'anyOf', settype));
	
	column[0] = new nlobjSearchColumn('custrecord_settlement_id', null, 'group');
	
	var ar_results = nlapiSearchRecord('customrecord_rec_transaction', '', filter, column);
	if (ar_results != null && ar_results != '' && ar_results != undefined) {
		for (var i_k = 0; i_k < ar_results.length; i_k++) {
		
			o_select.addSelectOption(ar_results[i_k].getValue('custrecord_settlement_id', null, 'group'), ar_results[i_k].getValue('custrecord_settlement_id', null, 'group'))
		}
	}
}
