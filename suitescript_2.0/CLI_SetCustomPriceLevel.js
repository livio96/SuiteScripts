/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/search','N/error'],
    function(search, error){
		function postSourcingSetCustomPrice(context)
		{
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			var internalId = currentRecord.id;
			
			if (sublistName == 'item' && FieldName == 'item' && (currentRecord.type == 'salesorder' || currentRecord.type == 'estimate')) 
			{
				//alert(internalId);
				var Item = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'item',
				});
				if (Item != null && Item != '' && Item != undefined) 
				{
					
					currentRecord.setCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'price',
						value: -1
					});
				}
				
				if(internalId && currentRecord.type == 'salesorder')
				{
					currentRecord.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'location',
							value: 1
						});
				}
			}
		}
		return {
			postSourcing: postSourcingSetCustomPrice,
		};
	});