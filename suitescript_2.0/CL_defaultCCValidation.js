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
** @type: ClientScript(fieldChanged)
/******************************************************************************************/
define(['N/record','N/error','N/search','N/currentRecord','N/https','N/url'],
function(record,error,search,currentRecord,https,urlMod) 
{
	function saveRecord(context)
	{   alert('CC validate');
	
		var rec = context.currentRecord;
		var recType = rec.type;
		
		var customer = rec.getValue({ fieldId: 'entity' });
		var terms = rec.getValue({ fieldId: 'terms' });
		
		if(customer && terms == 4)
		{
			var res = [];
			var customerSearchObj = search.create({
					   type: "customer",
					   filters:
					   [
						  ["isinactive","is","F"], 
						  "AND", 
						  ["ccdefault","is","T"], 
						  "AND", 
						  ["internalid","anyof", customer]
					   ],
					   columns:
					   [
						  search.createColumn({name: "internalid", label: "Internal ID"}),
						  search.createColumn({name: "altname", label: "Name"}),
						  search.createColumn({name: "ccinternalid", label: "Credit Card Internal ID"}),
						  search.createColumn({name: "ccnumber", label: "Credit Card Number"}),
						  search.createColumn({name: "cctype", label: "Credit Card Type"})
					   ]}).run();

			res = customerSearchObj.getRange(0,100);
			if(res.length > 0)
			{
				
			}
			else
			{
				alert("No default credit card for the selected customer");
				return false;
			}
		}
		return false;
	}
	return {
		//validateLine: validateLine,
		saveRecord: saveRecord
	};
});