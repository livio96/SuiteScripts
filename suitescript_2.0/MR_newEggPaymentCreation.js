/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/email','N/render', 'N/search', 'N/record', 'N/runtime', 'N/format'],

function (email, render, search, record, runtime, format) {

    function getInputData() 
	{	
		//Search Name : Newegg Payment Creation 
		var wexOrders = search.load({
			  id: 'customsearch380249'
			});
			
			//Handy dandy method for getting all results instead of that stupid arbitrary 4000 limit...  Equivalent of searchGetAllResults library
			wexOrders = wexOrders.runPaged();
			var resultSet = [];
			wexOrders.pageRanges.forEach(function(pageRange) {
				  var myPage = wexOrders.fetch({index: pageRange.index});
				  myPage.data.forEach(function(result) {
					resultSet.push(result);
				  return true;
				  });
				});

        return resultSet;
    }

    function reduce(context) 
	{
		
		try 
		{
			var mapResults = JSON.parse(context.values[0]);
			log.debug('mapResults', mapResults);
			
			var vals = JSON.parse(JSON.stringify(mapResults.values));
			
			var invoice = '';
			var amount = '';
			var accType = '', settlementDate = '';
			
			
			var id = mapResults.id;
			log.debug('id', id);
			for(var x in vals)
			{
				if(x == 'GROUP(CUSTRECORD55.internalid)')
				{
					if(vals[x])
					{
						var invoiceInfo = JSON.parse(JSON.stringify(vals[x]));
						invoice = invoiceInfo[0].value;
					}
				}
				if(x == 'SUM(formulacurrency)')
					amount = vals[x];
					
				if(x == "MAX(CUSTRECORD53.custrecord56)")
					accType = vals[x];
				
				if(x == "MAX(custrecord51)")
					settlementDate = vals[x]
				
			}
			log.debug('mapResults', invoice+" : "+amount+" : "+accType);
			
			if(invoice)
			{
				if(amount > 0.00)
				{
					var customerPayment = record.transform({ fromType: 'invoice', fromId: invoice, toType: 'customerpayment'});
					
					if(accType == 'Newegg')
						customerPayment.setValue({ fieldId: 'paymentmethod', value: 23 });
					else if(accType == 'Newegg Business')
						customerPayment.setValue({ fieldId: 'paymentmethod', value: 25 });
					
					if(settlementDate)
					{
						settlementDate = new Date(settlementDate);
						
						customerPayment.setValue({ fieldId: 'trandate', value: settlementDate });
					}
					
					var paymentId = customerPayment.save(true, true);
					
					
					var res = [];
					var customrecord_newegg_sett_tranSearchObj = search.create({
								   type: "customrecord_newegg_sett_tran",
								   filters:
								   [
									  ["custrecord58","is","F"], 
									  "AND", 
									  ["custrecord45","startswith","Order"], 
									  "AND", 
									  ["custrecord55.internalid","anyof", invoice], 
								   ],
								   columns:
								   [
									  search.createColumn({ name: "internalid", label: "internalid" }),
										search.createColumn({ name: "custrecord46", label: "newegg order ID" }) ] }).run();
					if(customrecord_newegg_sett_tranSearchObj)
						res = customrecord_newegg_sett_tranSearchObj.getRange(0,100);
					
					
					if(res.length > 0)
					{
						var checkNum = res[0].getValue({ name: 'custrecord46' });
						for(var x=0;x<res.length;res++)
						{
							var id = res[x].getValue({ name:'internalid'});
							if(id)
							{
								record.submitFields({ type: 'customrecord_newegg_sett_tran', id: id, values: { 'custrecord57' : paymentId,
																					'custrecord58': true }});
							}
						}
						
						if(checkNum)
							record.submitFields({ type: 'customerpayment', id: paymentId, values: { 'checknum' : checkNum } });
					}
				}
				else
				{
					var creditMemoRec = record.transform({ fromType: 'invoice', fromId: invoice, toType: 'creditmemo'});
					
					var creditMemoId = creditMemoRec.save(true, true);
					
					
					var res = [];
					var customrecord_newegg_sett_tranSearchObj = search.create({
								   type: "customrecord_newegg_sett_tran",
								   filters:
								   [
									  ["custrecord58","is","F"], 
									  "AND", 
									  ["custrecord45","startswith","Order"], 
									  "AND", 
									  ["custrecord55.internalid","anyof", invoice], 
								   ],
								   columns:
								   [
									  search.createColumn({ name: "internalid", label: "internalid" }) ] }).run();
					if(customrecord_newegg_sett_tranSearchObj)
						res = customrecord_newegg_sett_tranSearchObj.getRange(0,100);
					
					if(res.length > 0)
					{
						for(var x=0;x<res.length;res++)
						{
							var id = res[x].getValue({ name:'internalid'});
							if(id)
							{
								record.submitFields({ type: 'customrecord_newegg_sett_tran', id: id, values: { 'custrecord57' : creditMemoId,
																					'custrecord58': true }});
							}
						}
					}
				}
			}
		}
		catch(e) 
		{
			log.debug( 'Error In Auto Invoice Generation', 'Error In auto Invoice Generation '+id+' Error: ' + e);
		}
    }

    return {
        getInputData: getInputData,
        //map: map,
        reduce: reduce,
		//summarize: summarize
    };
});