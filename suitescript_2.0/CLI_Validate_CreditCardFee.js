/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error'],
    function(error)
	{
		function lineInit_DisableItem(context)
		{
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			var CreditCardFee = currentRecord.getValue('custbody_creditcardfee');
			
			if (CreditCardFee == true) 
			{
				var Item = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'item'
				});
				
				if (Item != null && Item != '' && Item != undefined) {
					if (Item == 209792 || Item == -2) 
					{
						eval("nlapiDisableLineItemField('item','item', true)");
					}
					else {
						eval("nlapiDisableLineItemField('item','item', false)");
					}
				}
				else {
					eval("nlapiDisableLineItemField('item','item', false)");
				}
			}
		}
		function validateDelete_CreditItem(context)
		{
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			var CreditCardFee = currentRecord.getValue('custbody_creditcardfee');
			
			if (CreditCardFee == true) {
			
				var Item = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'item'
				});
				
				if (Item != null && Item != '' && Item != undefined) 
				{
					if (Item == 209792) 
					{
						alert('You cannot Remove Credit Card Fee Item');
						return false;
					}
					if (Item == -2) 
					{
						alert('You cannot Remove Sub Total Item');
						return false;
					}
				}
			}
			return true;
		}
		return {
			lineInit: lineInit_DisableItem,
			validateDelete: validateDelete_CreditItem,
		
		}
	});
	