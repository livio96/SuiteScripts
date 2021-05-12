//BEGIN SCHEDULED ==================================================

function sch_update_customer_sales(type){

	var resultSet = nlapiLoadSearch(null, 'customsearch_update_customer_sales');
	nlapiLogExecution('DEBUG', 'schedulerFunction_transfer record', "resultSet =>" + resultSet);
	
	var results_part = resultSet.runSearch();
	
	var start = 0;
	var end = 1000;
	
	var resultSetCount = 1000;
	do {
	
		var context = nlapiGetContext();
		var usageRemaining = context.getRemainingUsage();
		
		if (usageRemaining <= 500) {
			nlapiLogExecution('DEBUG', 'schedulerFunction', ' do loop usageRemaining<= 200 =>' + usageRemaining);
			nlapiYieldScript(); // Rescheduling script if script limit exceeds
		}
		
		var results_item = results_part.getResults(start, end);
		nlapiLogExecution('DEBUG', 'schedulerFunction_transfer record', "results_item.length =>" + results_item.length);
		
		for (var b = 0; b < results_item.length; b++) //for (var b=0;b<1;b++)
		{
			try {
				var context = nlapiGetContext();
				var usageRemaining = context.getRemainingUsage();
				
				if (usageRemaining <= 500) {
					nlapiLogExecution('DEBUG', 'schedulerFunction', ' do loop usageRemaining<= 200 =>' + usageRemaining);
					nlapiYieldScript(); // Rescheduling script if script limit exceeds
				}
				
				var result = results_item[b];
				var columns = result.getAllColumns();
				
				var customer_id = result.getValue(columns[0]);
				nlapiLogExecution('DEBUG', 'schedulerFunction_transfer record', "customer =>" + customer_id + " b=>" + b);
				var Current_yr_salesAmt = 0;
			var Current_yr_Profit = 0;
			
				var NewYear = 2021
				
				var FilterExpression = [["type", "anyof", "CustInvc", "CashRfnd", "CashSale", "CustCred"], "AND", ["shipping", "is", "F"], "AND", ["taxline", "is", "F"], "AND", ["mainline", "is", "F"], "AND", ["cogs", "is", "F"], "AND", ["name", "anyof", customer_id], "AND", [String("formulanumeric: case when TO_CHAR({trandate},'YYYY') = '" + NewYear + "' then 1 else 0 end"), "equalto", "1"]];
				
				nlapiLogExecution('Debug', 'AfterSubmitRecord_SetSalesAmt', 'FilterExpression=>' + FilterExpression);
				
				// -------------------Calculate sales Amount------------------------//	
				var Current_year_sale = nlapiSearchRecord("transaction", null, FilterExpression, [new nlobjSearchColumn("amount", null, "SUM")]);
				nlapiLogExecution('Debug', 'after_submit_update_total', 'Current_year_sale=>' + Current_year_sale);
				if (Current_year_sale) {
					var TranSearch = Current_year_sale[0];
					
					var SearchColumns = TranSearch.getAllColumns();
					
					Current_yr_salesAmt = Current_year_sale[0].getValue(SearchColumns[0]);
					nlapiLogExecution('Debug', 'AfterSubmitRecord_SetSalesAmt', 'Current_yr_salesAmt=>' + Current_yr_salesAmt);
				}
				
				var Current_year_Profit = nlapiSearchRecord("transaction", null, FilterExpression, [new nlobjSearchColumn("estgrossprofit", null, "SUM")]);
				nlapiLogExecution('Debug', 'after_submit_update_total', 'Current_year_Profit=>' + Current_year_Profit);
				if (Current_year_Profit) {
					var ProfitTranSearch = Current_year_Profit[0];
					
					var ProfitSearchColumns = ProfitTranSearch.getAllColumns();
					
					Current_yr_Profit = Current_year_Profit[0].getValue(ProfitSearchColumns[0]);
					nlapiLogExecution('Debug', 'AfterSubmitRecord_SetSalesAmt', 'Current_yr_Profit=>' + Current_yr_Profit);
				}
				var O_CustObj = nlapiLoadRecord('customer', customer_id);
				
				O_CustObj.setFieldValue('custentity_sales_2021', Current_yr_salesAmt);
				O_CustObj.setFieldValue('custentity_profit_2021', Current_yr_Profit);
				
				var UpdatedcustID = nlapiSubmitRecord(O_CustObj, {
					disabletriggers: true,
					enablesourcing: false,
					ignoremandatoryfields: true
				});
				//nlapiLogExecution('DEBUG', 'SUT_LSP_Bill_Invoice', 'updatefields = ' + updatefields);
			} 
			catch (ex) {
				nlapiLogExecution('DEBUG', 'SUT_LSP_Bill_Invoice', 'ex = ' + ex);
			}
		}
		resultSetCount = results_item.length;
		start = end;
		end = end + 1000;
		//resultSetCount=0;
	
	}
	while (resultSetCount == 1000);
}

// END SCHEDULED ====================================================




