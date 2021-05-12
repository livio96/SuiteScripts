/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error', 'N/log'],
    function(error, log){
		function pageInit_DisablePrepay(context){
			var currentRecord = context.currentRecord;
			
			var Prepay = currentRecord.getValue('custbody_prepay');
			if (Prepay == true) {
				var PrepayObj = currentRecord.getField({
					fieldId: 'custbody_prepay'
				});
				
				var EntityObj = currentRecord.getField({
					fieldId: 'entity'
				});
				
				PrepayObj.isDisabled = true;
				EntityObj.isDisabled = true;
			}
		}
		
		function lineInit_SetPayee(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			var Payee = currentRecord.getValue('entity');
			var Prepay = currentRecord.getValue('custbody_prepay');
			if (Prepay == true) {
				if (sublistName == 'recmachcustrecord_lpo_check') {
					var LinePayee = currentRecord.getCurrentSublistValue({
						sublistId: 'recmachcustrecord_lpo_check',
						fieldId: 'custrecord_lpo_payee'
					});
					
					if (LinePayee != null && LinePayee != '' && LinePayee != undefined) {
						if (LinePayee != Payee) {
							currentRecord.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_lpo_check',
								fieldId: 'custrecord_lpo_payee',
								value: Payee
							});
						}
					}
					else {
						if (Payee != null && Payee != '' && Payee != undefined) {
							currentRecord.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_lpo_check',
								fieldId: 'custrecord_lpo_payee',
								value: Payee
							});
						}
					}
				}
			}
		}
		function validateField_ValidatePayee(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if (FieldName == 'entity') {
				var Prepay = currentRecord.getValue('custbody_prepay');
				if (Prepay == true) {
				
					var LPO_LineCount = currentRecord.getLineCount({
						sublistId: 'recmachcustrecord_lpo_check'
					})
					
					if (LPO_LineCount > 0) {
						alert("Please Remove Linked Purchase Order and then change Payee");
						return false;
					}
				}
			}
			return true;
		}
		function fieldChanged_SetPayee(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if (FieldName == 'entity' || FieldName == 'custbody_prepay') {
				var Payee = currentRecord.getValue('entity');
				
				var Prepay = currentRecord.getValue('custbody_prepay');
				
				if (Payee != null && Payee != '' && Payee != undefined && Prepay == true) {
					currentRecord.setCurrentSublistValue({
						sublistId: 'recmachcustrecord_lpo_check',
						fieldId: 'custrecord_lpo_payee',
						value: Payee
					});
				}
			}
		}
		function saveRecord_ValidateTotal(context){
		
			var currentRecord = context.currentRecord;
			var Prepay = currentRecord.getValue('custbody_prepay');
			var CheckAmount = currentRecord.getValue('usertotal');
			if (Prepay == true) {
				var PO_Total = 0;
				
				var i_LineCount = currentRecord.getLineCount({
					sublistId: 'recmachcustrecord_lpo_check'
				})
				
				for (var i = 0; i < i_LineCount; i++) {
					var Amount = currentRecord.getSublistValue({
						sublistId: 'recmachcustrecord_lpo_check',
						fieldId: 'custrecord_lpo_amount',
						line: i
					});
					PO_Total = (parseFloat(PO_Total) + parseFloat(Amount));
				}
				
				
				
				if (parseFloat(CheckAmount).toFixed(2) != parseFloat(PO_Total).toFixed(2)) {
				
					alert("Check Amount and PO prepay amount total must be the same");
					alert("po total is: " + PO_Total);
					alert("check total is: " + CheckAmount);
					return false;
				}
			}
			return true;
		}
		return {
			pageInit: pageInit_DisablePrepay,
			lineInit: lineInit_SetPayee,
			fieldChanged: fieldChanged_SetPayee,
			validateField: validateField_ValidatePayee,
			saveRecord: saveRecord_ValidateTotal,
		}
	});
	