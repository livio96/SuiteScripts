/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       May 08 2019     Ravi
 *
 */

/**
 * @param {String} type Context Types: scheduled, ondemand, userinterface, aborted, skipped
 * @returns {Void}
 */
function closePurchaseOrders(type) 
{
	var poId = "";
	try
	{
		var filters = [];
		var columns = [];
		var context = nlapiGetContext();
		
		filters[0] = new nlobjSearchFilter("status", null, "noneof", "PurchOrd:H");
      //filters[0] = new nlobjSearchFilter("status", null, "is", "PurchOrd:F");
		filters[1] = new nlobjSearchFilter("trandate",null,"onorbefore","12/31/2018");//You can change dates here
		filters[2] = new nlobjSearchFilter("mainline", null, "is", "T");
		
		columns[0] = new nlobjSearchColumn("internalid");
		columns[1] = new nlobjSearchColumn("status");
		columns[2] = new nlobjSearchColumn("tranid");
		
		var poSearch = nlapiSearchRecord("purchaseorder", null, filters, columns);
		if(poSearch)
		{
          nlapiLogExecution("DEBUG", "poSearch",poSearch.length);
			for(var i = 0 ; i < poSearch.length ; i++)
			{
				poId = poSearch[i].getValue(columns[0]);
				nlapiLogExecution("DEBUG", "Purchase Order Id", "Purchase Order Id : "+poId);
				var rec = nlapiLoadRecord("purchaseorder", poId);
				for(var j = 1; j<= rec.getLineItemCount('item'); j++) 
				{  
				   rec.setLineItemValue('item', 'isclosed', j, 'T'); 
				}
				for(var k = 1; k<= rec.getLineItemCount('expense'); k++) 
				{  
				   rec.setLineItemValue('expense', 'isclosed', k, 'T'); 
				}
				var recordId = nlapiSubmitRecord(rec);
				nlapiLogExecution("DEBUG", "Closed Purchase Order Internal Id", "Internal Id : "+recordId);
				  
				if(context.getRemainingUsage() <= 0 && (i+1) < poSearch.length)
			    {
					var status = nlapiScheduleScript(context.getScriptId(), context.getDeploymentId());
					if(status == 'QUEUED')
					{
						break;
					}     
			    }
				 
			}
		}
	}
	catch(ex)
	{
		nlapiLogExecution("DEBUG", "Exception", ex + " : Exception Occurred in Purchase Order "+poId);
	}
}
