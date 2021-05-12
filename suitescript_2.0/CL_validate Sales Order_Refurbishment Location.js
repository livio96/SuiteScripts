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
** @type: ClientScript(validateLine)
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
				var location = rec.getValue({ fieldId: 'location'});
				if(location == 26)
				{
					alert('Location should not Refurbishment');
					return false;
				}
				var lineCount = rec.getLineCount({ sublistId: 'item'});
				for(var i=0;i<lineCount; i++)
				{
					rec.selectLine({ sublistId: 'item', line: i });
					var loc = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'location'});
					
					if(loc == 26)
					{
						alert('Location should not Refurbishment');
						return false;
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