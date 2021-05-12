function schedulerFunction_ReconcileStatment(type){
	try {
		nlapiLogExecution('DEBUG', 'schedulerFunction_ContainerReport', "******  SCHEDULE SCRIPT STARTED  ****  ");
		
		var i_context = nlapiGetContext();
		
		var SettleType = i_context.getSetting('SCRIPT', 'custscript_settletype');
		nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' SettleType -->' + SettleType);
		
		var AmazonTrans = i_context.getSetting('SCRIPT', 'custscript_amzsettletrans');
		nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' AmazonTrans -->' + AmazonTrans);
		
		if (AmazonTrans != null && AmazonTrans != '' && AmazonTrans != undefined) {
			var ArrayAMZTrans = new Array();
			
			ArrayAMZTrans = AmazonTrans.split('#');
			
			for (var i = 0; i <= ArrayAMZTrans.length; i++) {
				var AmazonTransID = ArrayAMZTrans[i];
				
				if (AmazonTransID != null && AmazonTransID != '' && AmazonTransID != undefined) {
					try {
					
						if (SettleType == 5) {
							var AmazTransField = ['custrecord_celigo_amzio_set_recond_trans', 'custrecord_celigo_amzio_set_summary', 'custrecord_celigo_amzio_set_settlemnt_id'];
							
							var AmazonTransObj = nlapiLookupField('customrecord_celigo_amzio_settle_trans', AmazonTransID, AmazTransField);
							
							var PaymentID = AmazonTransObj.custrecord_celigo_amzio_set_recond_trans;
							var SettlementSummaryID = AmazonTransObj.custrecord_celigo_amzio_set_summary;
							var SettlementID = AmazonTransObj.custrecord_celigo_amzio_set_settlemnt_id;
							
							if (PaymentID != null && PaymentID != '' && PaymentID != undefined) {
								var PaymentField = ['recordtype', 'custbody_payment_reconciled'];
								
								var PaymentObj = nlapiLookupField('transaction', PaymentID, PaymentField);
								//nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' PaymentType -->' + PaymentType);
								
								var Reconciled = PaymentObj.custbody_payment_reconciled;
								var PaymentType = PaymentObj.recordtype;
								
								if (Reconciled != 'T') {
									var o_recordOBJ = nlapiLoadRecord(PaymentType, PaymentID);
									
									o_recordOBJ.setFieldValue('custbody_payment_reconciled', 'T');
									o_recordOBJ.setFieldValue('custbody_settlement_id', SettlementID);
									
									var UpdatedID = nlapiSubmitRecord(o_recordOBJ, {
										enablesourcing: true,
										ignoremandatoryfields: true
									});
									nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', 'UpdatedPaymentID-->' + UpdatedID);
								}
							}
						}
						else {
							var AmazTransField = ['custrecord_settlement_id', 'custrecord_rectran_payment'];
							
							var AmazonTransObj = nlapiLookupField('customrecord_rec_transaction', AmazonTransID, AmazTransField);
							
							var PaymentID = AmazonTransObj.custrecord_rectran_payment;
							var SettlementID = AmazonTransObj.custrecord_settlement_id;
							
							if (PaymentID != null && PaymentID != '' && PaymentID != undefined) {
								var PaymentField = ['recordtype', 'custbody_payment_reconciled'];
								
								var PaymentObj = nlapiLookupField('transaction', PaymentID, PaymentField);
								//nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', ' PaymentType -->' + PaymentType);
								
								var Reconciled = PaymentObj.custbody_payment_reconciled;
								var PaymentType = PaymentObj.recordtype;
								
								if (Reconciled != 'T') {
									var o_recordOBJ = nlapiLoadRecord(PaymentType, PaymentID);
									
									o_recordOBJ.setFieldValue('custbody_payment_reconciled', 'T');
									o_recordOBJ.setFieldValue('custbody_settlement_id', SettlementID);
									
									var UpdatedID = nlapiSubmitRecord(o_recordOBJ, {
										enablesourcing: true,
										ignoremandatoryfields: true
									});
									nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', 'UpdatedPaymentID-->' + UpdatedID);
								}
							}
						}
					} 
					catch (ex) {
						nlapiLogExecution('DEBUG', 'schedulerFunction_CustomerStatement', 'Inner Execption -->' + ex);
					}
					
					var i_usage_end = i_context.getRemainingUsage();
					//nlapiLogExecution('DEBUG', 'schedulerFunction_CustomerStatement', ' *********** Usage end **********-->' + i_usage_end);
					
					if (i_usage_end <= 500) {
						var stateMain = nlapiYieldScript();
						
						if (stateMain.status == 'RESUME') {
							nlapiLogExecution('DEBUG', 'Resum Scripts', ' *********** Resume an scripts **********-->');
						}
					}
				}
			}
		}
	} 
	catch (e) {
		nlapiLogExecution("DEBUG", "e*", e);
	}
}

