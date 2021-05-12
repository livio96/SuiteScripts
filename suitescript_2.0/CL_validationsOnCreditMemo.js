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
define(['N/currentRecord','N/record','N/error','N/search','N/currentRecord','N/runtime','N/url'],
function(currentRecord,record,error,search,currentRecord,runtime,urlMod) {
	function saveRecord(context)
	{
		try
		{
			var rec = context.currentRecord;
			var currentUser = runtime.getCurrentUser();
			var role = currentUser.role;
			var recType = rec.type;
			
			if(recType == 'creditmemo')
			{
				var customer = rec.getValue({ fieldId :'entity'});
				var script = runtime.getCurrentScript();
				
				var createdFrom = rec.getValue({ fieldId: 'createdfrom'});
				if(!createdFrom)
				{
					var custs = ''
					var marketPlaceCustomers = search.lookupFields({ type: 'customrecord_ag_configuration', id: 1, columns: ['custrecord_market_place_customers'] });
					
					if(marketPlaceCustomers)
					{
						if(marketPlaceCustomers.custrecord_market_place_customers)
							custs = marketPlaceCustomers.custrecord_market_place_customers.value;
					}
					var vals = [];
					if(custs)
					{
						custs = custs.split(',');
						for(var i=0;i<custs.length;i++)
							vals.push(Number(custs[i]));
					}
					
					if(role == 1076 || role == 3 || role == 1038) // If role is Admin or Admin No HR.
					{
						return true;
					}
					else if(vals.indexOf(customer) != -1 )//IF customer is one of market place customers, allow to save record
					{
						return true;
					}
					else
					{
						alert('Contact your administrator.');
						return false;
					}
				}
				else 
				{
					var crTotal = rec.getValue({ fieldId: 'total'});
					var rmaTotal = search.lookupFields({ type: 'returnauthorization', id: createdFrom, columns: [ 'total' ]});
					if(rmaTotal)
						rmaTotal = Number(rmaTotal.total) * -1;
					else
						rmaTotal = 0;
					
					var custs = ''
					var marketPlaceCustomers = search.lookupFields({ type: 'customrecord_ag_configuration', id: 1, columns: ['custrecord_market_place_customers'] });
					
					if(marketPlaceCustomers)
					{
						if(marketPlaceCustomers.custrecord_market_place_customers)
							custs = marketPlaceCustomers.custrecord_market_place_customers.value;
					}
					var vals = [];
					if(custs)
					{
						custs = custs.split(',');
						for(var i=0;i<custs.length;i++)
							vals.push(Number(custs[i]));
					}
					
					if(rmaTotal < crTotal && role != 3 && role != 1076 && vals.indexOf(customer) == -1)
					{
						alert('Contact your administrator.');
						return false;
					}
				}
				return true;
			}
			else if(recType == 'customerrefund')
			{
				
				
				var processCC = rec.getValue({ fieldId: 'chargeit' });
				var createdFrom = rec.getValue({ fieldId: 'custbody_created_from' });
				
				if(role != 1076 && role != 3) // If role is Admin or Admin No HR.
				{
					if( (!createdFrom || createdFrom == '' || createdFrom == 'undefined') && processCC)
					{
						alert('Please contact you administrator');
						return false;
					}
				}
					
				
				return true;
			}
			return true;
		}
		catch(e)
		{
			alert('Error: '+ JSON.stringify(e));
		}
	}
	return {
		saveRecord: saveRecord
	};
});