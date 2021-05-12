/**
*@NApiVersion 2.x
*@NScriptType ScheduledScript
*/

/*
** Description: 
** @libraries used:
** @client: 
** @author: 
** @dated:  
** @version: 2.0
** @type: ScheduledScript
** SS Name : Customer - Auto Email Statement
** Script Name: AS | Import ABR Bank Statement
/******************************************************************************************/
define(['N/search', 'N/record', 'N/runtime', 'N/https', 'N/render', 'N/task'],
function(search, record, runtime, https, render, task){
    return{ 
        execute:function(context)
        {
            try
            {  
				var today = new Date();
				log.debug({ title:'today', details: new Date(today) });
				var yesterd = new Date((today.setDate(today.getDate()-1)));
				log.debug({ title:'yesterd', details: yesterd });
				
				var header=[];
					header['Content-Type']= 'application/json';
				
					 var req = https.post({
								url: "https://api.authorize.net/xml/v1/request.api",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
													"getSettledBatchListRequest": {
														"merchantAuthentication": {
															"name": "9Cr3Zd3V",
															"transactionKey": "92uE73T6e4fEJ7JX"
														},
														"firstSettlementDate": yesterd,
														"lastSettlementDate": today
													}
												})
							 }); 
				
				
				var myJSON = JSON.stringify(req);
				var vals = JSON.parse(myJSON).body;
				var valsL = vals.slice(1, vals.length);
				
				log.debug({ title: 'JSON.parse(valsL);', details: JSON.parse(valsL) });
				
			
				if(JSON.parse(valsL).batchList[0])
				{
					if(JSON.parse(valsL).batchList[0].batchId)
					{
						 var req = https.post({
								url: "https://api.authorize.net/xml/v1/request.api",
								body: JSON.stringify({
														  "getTransactionListRequest": {
															"merchantAuthentication": {
															  "name": "9Cr3Zd3V",
															  "transactionKey": "92uE73T6e4fEJ7JX"
															},
															"batchId" : JSON.parse(valsL).batchList[0].batchId,
															"sorting": {
															  "orderBy": "submitTimeUTC",
															  "orderDescending": "true"
															},
															"paging": {
															  "limit": "100",
															  "offset": "1"
															}
														  }
														}),
										headers: header
										}); 
									
						var myJSON = JSON.stringify(req);
						var vals = JSON.parse(myJSON).body;
						var valsL = vals.slice(1, vals.length);
						
						
						log.debug({ title: 'JSON.parse(valsL);', details: JSON.parse(valsL) });
						
						if(JSON.parse(valsL).transactions)
						{
							if(JSON.parse(valsL).transactions.length > 0)
							{
								for(var abcd=0;abcd<JSON.parse(valsL).transactions.length; abcd++)
								{
									
									var transactionStatus = JSON.parse(valsL).transactions[abcd].transactionStatus;
									
									if(transactionStatus == "settledSuccessfully" || transactionStatus == "refundsettledSuccessfully")
									{
										var transId = JSON.parse(valsL).transactions[abcd].transId;
										var firstName = JSON.parse(valsL).transactions[abcd].firstName;
										var lastName = JSON.parse(valsL).transactions[abcd].lastName;
										var marketType = JSON.parse(valsL).transactions[abcd].marketType;
										var settleAmount = JSON.parse(valsL).transactions[abcd].settleAmount;
										var invoiceNumber = JSON.parse(valsL).transactions[abcd].invoiceNumber;
										var product = JSON.parse(valsL).transactions[abcd].product;
										var accountType = JSON.parse(valsL).transactions[abcd].accountType;
										var accountNumber = JSON.parse(valsL).transactions[abcd].accountNumber;
										
										var rec = record.create({ type: 'customrecord_nbsabr_bankstatementline'});
										
										if(firstName || lastName)
											rec.setValue({ fieldId: 'custrecord_bsl_reference', value: firstName+' '+lastName});
										if(settleAmount)
											rec.setValue({ fieldId: 'custrecord_bsl_amount', value: settleAmount });
										if(transId)
											rec.setValue({ fieldId: 'custrecord_bsl_checknumber', value: transId });
										if(transactionStatus)
											rec.setValue({ fieldId: 'custrecord_bsl_type', value: transactionStatus });
						
											rec.setValue({ fieldId: 'custrecord_bsl_date', value: yesterd });
											rec.setValue({ fieldId: 'custrecord_bsl_bankstatementid', value: 262 });
									
											
										var saveId = rec.save(true, true);
										log.debug({ title:'saveId', details: saveId });
										
									}
								}
							}
						}
					}
				}
			}
            catch(e)
            {
                log.debug({ title:'Error', details: e.toString() });
				
				/* var mrTask = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT,
												scriptId: 'customscript_auto_emails_customer_statem',
												deploymentId: 'customdeploy_not_scheduled',
												params: { 'custscript_index_val': w+1 }});
												
				var taskObj = mrTask.submit();  */
            }
        }
    };
});