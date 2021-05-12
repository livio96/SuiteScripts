/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error'],
    function(error){
		function fieldChanged_SetCard(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if ((sublistName == 'creditcards' && (FieldName == 'ccnumber'))) {
			
				var CardNumber = currentRecord.getCurrentSublistValue({
					sublistId: 'creditcards',
					fieldId: 'ccnumber'
				});
				
				if (CardNumber != null && CardNumber != '' && CardNumber != undefined) {
					if (String(CardNumber).startsWith("3")) //American
					{
						currentRecord.setCurrentSublistValue({
							sublistId: sublistName,
							fieldId: 'paymentmethod',
							value: 6,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
					}
					if (String(CardNumber).startsWith("4")) //Visa
					{
						currentRecord.setCurrentSublistValue({
							sublistId: sublistName,
							fieldId: 'paymentmethod',
							value: 5,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
					}
					if (String(CardNumber).startsWith("5")) //Master card
					{
						currentRecord.setCurrentSublistValue({
							sublistId: sublistName,
							fieldId: 'paymentmethod',
							value: 4,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
					}
					if (String(CardNumber).startsWith("6")) //Discover
					{
						currentRecord.setCurrentSublistValue({
							sublistId: sublistName,
							fieldId: 'paymentmethod',
							value: 3,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
					}
				}
			}
		}
		return {
		
			fieldChanged: fieldChanged_SetCard,
		};
	});