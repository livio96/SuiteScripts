/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
/*
** Description: This script is used to validate the line item for serial numbers.
** @libraries used:
** @client: 
** @author: 
** @dated:  
** @version: 2.0
** @type: ClientScript(saveRecord)
/******************************************************************************************/
define(['N/runtime','N/record','N/error','N/search','N/currentRecord','N/https','N/url'],
function(runtime,record,error,search,currentRecord,https,urlMod) {
	function saveRecord(context)
	{
		try
		{
			//alert(runtime.executionContext);
			if(runtime.executionContext == 'USERINTERFACE')
			{
				var rec = context.currentRecord;
				var sub = context.sublistId;
				var sublistFieldName = context.fieldId;
				var recType = rec.type;
				
				var lineCount = rec.getLineCount({ sublistId: 'item'});
				for(var w=0;w<lineCount; w++)
				{
					rec.selectLine({ sublistId:'item', line: w });
					
					var check = rec.getCurrentSublistValue({ sublistId:'item', fieldId: 'itemreceive'});
					
					if(check)
					{
						//var item = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'itemkey'});
						//alert(item);
						var itemName = rec.getSublistValue({ sublistId: 'item', fieldId: 'itemname', line: w });
						//alert(itemName);
						var qty = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity'});
						var location = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'location'});
                      	if(location != '22' && location !='23' && location !='28'){
						var invDetails = rec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail'});
						//alert(invDetails);
						if(invDetails)
						{
							var count = invDetails.getLineCount({ sublistId: 'inventoryassignment'});
							//alert(count);
							for(e=0;e<count;e++)
							{
								invDetails.selectLine({ sublistId: 'inventoryassignment', line: e });
								var binNum = invDetails.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber' });
								//alert(binNum);
								if(!binNum)
								{
									var serialNum = invDetails.getSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', line: e });
									alert('Please enter the bin number for '+itemName);
									return false;
								}
							}
						}
					}
                    }
				}
				return true;
			}
			
		}
		catch(e)
		{
			alert(e.toString());
		}
	}
	return {
		saveRecord: saveRecord
	};
});