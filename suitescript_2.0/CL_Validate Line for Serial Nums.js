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
define(['N/record','N/error','N/search','N/currentRecord','N/https','N/url'],
function(record,error,search,currentRecord,https,urlMod) {
	function validateLine(context)
	{
		try
		{
			var rec = context.currentRecord;
			var sub = context.sublistId;
			var sublistFieldName = context.fieldId;
			var recType = rec.type;
			var reason = rec.getValue({ fieldId: 'custbody_reason'});
			if(sub == 'item' && reason == 1)
			{
				var item = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item'});
				var itemName = rec.getCurrentSublistText({ sublistId: 'item', fieldId: 'item'});
				var qty = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity'});
				
				var itemType = search.lookupFields({ type: 'item', id: item, columns: ['isserialitem', 'islotitem']});
				
				if(itemType.isserialitem)
				{
					var invDetails = rec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
					if(invDetails)
					{
						var lineCount = invDetails.getLineCount({ sublistId: 'inventoryassignment'});
						if(lineCount == 0 || lineCount != qty)
						{
							alert('Please configure the inventory detail for '+ itemName);
							return false;
						}
					}
					else
					{
						alert('Please configure the inventory detail for '+ itemName);
						return false;
					}
				}
				else if(itemType.islotitem)
				{
					var invDetails = rec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
					if(invDetails)
					{
						var lineCount = invDetails.getLineCount({ sublistId: 'inventoryassignment'});
						var invQty = 0;
						for(var w=0;w<lineCount; w++)
						{
							var quantity = Number(invDetails.getLineItemValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', line: w}));
							invQty += quantity;
						}
						if(invQty != qty)
						{
							alert('Please configure the inventory detail for '+ itemName);
							return false;
						}
					}
					else
					{
						alert('Please configure the inventory detail for '+ itemName);
						return false;
					}
				}
			}
			return true;
		}
		catch(e)
		{
			alert(e.toString());
		}
	}
	function saveRecord(context)
	{
		try
		{
			var rec = context.currentRecord;
			var sub = context.sublistId;
			var sublistFieldName = context.fieldId;
			var recType = rec.type;
			var reason = rec.getValue({ fieldId: 'custbody_reason'});
			if(reason == 1)
			{
				var lineCount = rec.getLineCount({ sublistId: 'item'});
				
				for(var abcd = 0;abcd<lineCount; abcd++)
				{
					rec.selectLine({ sublistId: 'item', line: abcd });
					var item = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item'});
					var itemName = rec.getCurrentSublistText({ sublistId: 'item', fieldId: 'item'});
					var qty = rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity'});
					
					var itemType = search.lookupFields({ type: 'item', id: item, columns: ['isserialitem', 'islotitem']});
					
					if(itemType.isserialitem)
					{
						var invDetails = rec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
						if(invDetails)
						{
							var lineCountInv = invDetails.getLineCount({ sublistId: 'inventoryassignment'});
							if(lineCountInv == 0 || lineCountInv != qty)
							{
								alert('Please configure the inventory detail for '+ itemName);
								return false;
							}
						}
						else
						{
							alert('Please configure the inventory detail for '+ itemName);
							return false;
						}
					}
					else if(itemType.islotitem)
					{
						var invDetails = rec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
						if(invDetails)
						{
							var lineCountInv = invDetails.getLineCount({ sublistId: 'inventoryassignment'});
							var invQty = 0;
							for(var w=0;w<lineCountInv; w++)
							{
								var quantity = Number(invDetails.getLineItemValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', line: w}));
								invQty += quantity;
							}
							if(invQty != qty)
							{
								alert('Please configure the inventory detail for '+ itemName);
								return false;
							}
						}
						else
						{
							alert('Please configure the inventory detail for '+ itemName);
							return false;
						}
					}
				}
			}
			return true;
		}
		catch(e)
		{
			alert(e.toString());
		}
	}
	return {
		validateLine: validateLine,
		saveRecord: saveRecord
	};
});