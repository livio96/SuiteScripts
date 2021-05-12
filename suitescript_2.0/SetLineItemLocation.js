/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/search','N/error'],
    function(search, error)
	{
		function postSourcingSetCustomPrice(context)
		{
			try
			{
				
				var currentRecord = context.currentRecord;
				var sublistName = context.sublistId;
				var FieldName = context.fieldId;
				
				if (sublistName == 'item' && FieldName == 'item' && currentRecord.type == 'salesorder') 
				{
					alert('Hi');
					var Item = currentRecord.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'item'
					});
				  
				   var location = currentRecord.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'location'
					});
				//	if (Item != null && Item != '' && Item != undefined) {
					
					 //if (location == null || location == '' || location == undefined) {

						currentRecord.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'location',
							value: 1
						});
					//}
				 //   }
				}
				else if (sublistName == 'item' && FieldName == 'item') 
				{
					var Item = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item'});
					//alert(Item);
					if(Item)
					{
						var lookup = search.lookupFields({ type:'item', id: Item, columns: ["averagecost"] });
						if(lookup)
						{
							//alert(lookup.averagecost);
						
							if(lookup.averagecost)
							{
								var avgCost = Number(lookup.averagecost).toFixed(2);
								currentRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: avgCost });
							}
						}
					}
				}
			}
			catch(e)
			{
				alert(e.toString());
			}
			
		}
		return {
			postSourcing: postSourcingSetCustomPrice,
		};
	});