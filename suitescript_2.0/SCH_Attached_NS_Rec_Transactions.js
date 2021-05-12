function schedulerFunction_AttachReconcile(type){
	try 
	{
		try {
			var o_recordOBJ = nlapiLoadRecord('commissionschedule', 8);
			
			var planname = o_recordOBJ.getFieldValue('name');
			nlapiLogExecution('DEBUG', 'schedulerFunction_ContainerReport', "planname  ****  " + planname);
			
		} 
		catch (ex) {
			nlapiLogExecution("DEBUG", "ex*", ex);
		}
		
		
		nlapiLogExecution('DEBUG', 'schedulerFunction_ContainerReport', "******  SCHEDULE SCRIPT STARTED  ****  ");
		
		var i_context = nlapiGetContext();
		
		var filter = new Array();
		var column = new Array();
		
		//filter.push(new nlobjSearchFilter('custrecord_rectran_payment', null, 'anyOf', '@NONE@'));
		filter.push(new nlobjSearchFilter('custrecord_payment_attached', null, 'is', 'F'));
		
		column[0] = new nlobjSearchColumn('custrecord_transaction_type');
		column[1] = new nlobjSearchColumn('custrecord_payment');
		column[2] = new nlobjSearchColumn('internalid');
		
		var ar_results = nlapiSearchRecord('customrecord_rec_transaction', null, filter, column);
		if (ar_results != null && ar_results != '' && ar_results != undefined) 
		{
			for (var i_k = 0; i_k < ar_results.length; i_k++) 
			{
				try {
					var Payment = ar_results[i_k].getValue('custrecord_payment');
					var TransactionType = ar_results[i_k].getValue('custrecord_transaction_type');
					var InternalId = ar_results[i_k].getValue('internalid');
					
					if (TransactionType == '1') 
					{
						AttachFiles(Payment,'customerpayment',InternalId)
					}
					if (TransactionType == '2') 
					{
						AttachFiles(Payment,'customerrefund',InternalId)
					}
					if (TransactionType == '3') 
					{
						AttachFiles(Payment,'transaction',InternalId)
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
	catch (e) {
		nlapiLogExecution("DEBUG", "e*", e);
	}
}


function AttachFiles(payment, s_recordType, internalid){
	var tran_filter = new Array();
	var tran_column = new Array();
	
	tran_filter.push(new nlobjSearchFilter('tranid', null, 'is', payment));
	
	tran_column[0] = new nlobjSearchColumn('internalid');
	tran_column[1] = new nlobjSearchColumn('trandate');
	
	var TransactionSearchRes = nlapiSearchRecord(s_recordType, null, tran_filter, tran_column);
	
	if (TransactionSearchRes != null && TransactionSearchRes != '' && TransactionSearchRes != undefined) {
		var i_recordId = TransactionSearchRes[0].getValue('internalid');
		nlapiLogExecution('DEBUG', 'SCH Move Attach Files', 'i_recordId -->' + i_recordId);
		
		var o_recordOBJ = nlapiLoadRecord('customrecord_rec_transaction', internalid);
		
		o_recordOBJ.setFieldValue('custrecord_payment_attached', 'T');
		o_recordOBJ.setFieldValue('custrecord_rectran_payment', i_recordId);
		
		var UpdatedID = nlapiSubmitRecord(o_recordOBJ, {
			enablesourcing: true,
			ignoremandatoryfields: true
		});
		nlapiLogExecution('DEBUG', 'schedulerFunction_ReconcileStatment', 'UpdatedPaymentID-->' + UpdatedID);
	}
}