/**
 *@NApiVersion 2.0
 *@NScriptType MapReduceScript
 */

define(['N/format','N/record','N/search','N/render'],
	function (format, record, search, render ) {
		function getInputData() 
		{
			//Search Name : Lockbox Checks (Grouped by Check #)
			var feedSearch = search.load({
				id: 'customsearch_lockbox_check'
			});


			//Handy dandy method for getting all results instead of that stupid arbitrary 4000 limit...  Equivalent of searchGetAllResults library
			feedSearch = feedSearch.runPaged();
			var resultSet = [];
			feedSearch.pageRanges.forEach(function (pageRange) {
				var myPage = feedSearch.fetch({ index: pageRange.index });
				myPage.data.forEach(function (result) {
						resultSet.push(result);
					return true;
				});
			});
			//log.debug({ title: 'result set', details: resultSet.length + " results" });

			return resultSet;
		}
		function reduce(context) 
		{
			try
			{
				var mapResults = JSON.parse(context.values[0]);
					//log.debug({ title: 'mapResults.values', details: mapResults });
				
				var vals = JSON.parse(JSON.stringify(mapResults.values));
					
				for(x in vals)
				{
					if(x == "GROUP(custrecord_lb_check_check_num)")
						var checkNum = vals[x];
					//if(x == "GROUP(custrecord_lb_check_amount)")
						//var checkAmount = Number(vals[x]);
				}
				
				
				if(checkNum)
				{
					var res = [];
					var customrecord_lb_checkSearchObj = search.create({
					   type: "customrecord_lb_check",
					   filters:
					   [
						  ["created","on","today"], 
						  "AND", 
						  ["custrecord_lb_check_check_num","is",checkNum], 
						  "AND", 
						  ["custrecord_lb_check_error","isempty",""]
					   ],
					   columns:
					   [
						  search.createColumn({name: "internalid",label: "internalid"}),
						  search.createColumn({name: "custrecord_lb_check_date", label: "Deposit Date"}),
						  search.createColumn({name: "custrecord_lb_check_check_num", label: "Check Number"}),
						  search.createColumn({name: "custrecord_lb_check_customer", label: "Customer (Text)"}),
						  search.createColumn({name: "custrecord_lb_check_cust_list", label: "Customer (List)"}),
						  search.createColumn({name: "custrecord_lb_check_inv_num", label: "Invoice #"}),
						  search.createColumn({name: "custrecord_lb_check_inv_amount", label: "Invoice Amount"}),
						  search.createColumn({name: "custrecord_lb_check_amount", label: "Check Amount"}),
						  search.createColumn({name: "custrecord_lb_check_payment", label: "Generated Payment (List)"})
					   ]}).run();
					
					if(customrecord_lb_checkSearchObj)
						res = customrecord_lb_checkSearchObj.getRange(0,1000);
						
					if(res.length > 0)
					{
						var customer = res[0].getValue({ name: 'custrecord_lb_check_cust_list' });
						var checkAmount = res[0].getValue({ name: 'custrecord_lb_check_amount' });
                     // var tran_date = res[0].getValue({ name: 'custrecord_lb_check_date' });
						var customerName = res[0].getValue({ name: 'custrecord_lb_check_customer'});
						var invoiceAmount = res[0].getValue({ name: 'custrecord_lb_check_inv_amount'});
						var invoiceId = res[0].getValue({ name: 'custrecord_lb_check_inv_num' });
					
						log.debug({ title: 'checkNum ----------- checkAmount', details: checkNum+"------------"+checkAmount });
						
						if(customer)
						{
							var paymentRec = record.create({ type: 'customerpayment', isDynamic: true});
							
							paymentRec.setValue({ fieldId: 'customer', value: customer });
						
							paymentRec.setValue({ fieldId: 'paymentmethod', value: 41 });
                             //tran_date = format.format({type: format.Type.DATE, value: new Date(tran_date)})
                            //paymentRec.setValue({ fieldId: 'trandate', value: tran_date });
							paymentRec.setValue({ fieldId: 'checknum', value: checkNum });
							paymentRec.setValue({ fieldId: 'payment', value: checkAmount });
							//paymentRec.setValue({ fieldId: 'autoapply', value: false });
							
							for(var abcd = 0; abcd<res.length; abcd++)
							{
								var invoiceId = res[abcd].getValue({ name: 'custrecord_lb_check_inv_num' });
								var invoiceAmount = res[abcd].getValue({ name: 'custrecord_lb_check_inv_amount' });
								
								/* if(res[abcd+1])
								{
									if(invoiceAmount > checkAmount)
										checkAmountOnly = 10;
									else
										checkAmountOnly = 20;
								}
								else
								{
									if(invoiceAmount > checkAmount)
										checkAmountOnly = 10, lastInv = 10;
									else
										checkAmountOnly = 20, lastInv = 10;
								} */
								
								if(invoiceId)
								{
									var lineNum = paymentRec.findSublistLineWithValue({ sublistId: 'apply', fieldId: 'internalid', value: invoiceId });
									log.debug({ title: 'invoiceId --- lineNum', details: invoiceId+" ----- "+lineNum });

									if(lineNum != -1)
									{
										paymentRec.selectLine({ sublistId: 'apply', line: lineNum });
										paymentRec.setCurrentSublistValue({ sublistId:'apply', fieldId:'apply', value: true });
										paymentRec.commitLine({ sublistId: 'apply' });
									}
								}
							}
							
							try
							{
								var paymentId = paymentRec.save(true, true);
								log.debug({ title: 'paymentId', details: paymentId });
								
								for(var e=0;e<res.length;e++)
								{
									var invoiceId = res[e].getValue({ name: 'custrecord_lb_check_inv_num' });
									var custId = res[e].getValue({ name: 'internalid' });
									if(invoiceId)
									{
										record.submitFields({ type: 'customrecord_lb_check', id: custId, values: { custrecord_lb_check_payment : paymentId } });
									}
									else
									{
										record.submitFields({ type: 'customrecord_lb_check', id: custId, values: { custrecord_lb_check_error : 'No Invoice# found' } });
									}
								}
							}
							catch(Error)
							{
								for(var e=0;e<res.length;e++)
								{
									var invoiceId = res[e].getValue({ name: 'custrecord_lb_check_inv_num' });
									var custId = res[e].getValue({ name: 'internalid' });
									
									record.submitFields({ type: 'customrecord_lb_check', id: custId, values: { custrecord_lb_check_error : Error.toString() } });
									log.debug({ title: 'Error.toString()', details: Error.toString() });
								}
							}
						}
						else if(invoiceAmount == checkAmount && !invoiceId)
						{
							if(customerName)
							{
								var custName = customerName.split(' ')[0];
								log.debug({ title: 'custName', details: custName });
								
								if(custName)
								{
									var invoiceSearchObj = search.create({
												   type: "invoice",
												   filters:
												   [
													  ["type","anyof","CustInvc"], 
													  "AND", 
													  ["amount","equalto", invoiceAmount], 
													  "AND", 
													  ["mainline","is","T"], 
													  "AND", 
													  ["customer.entityid","startswith",custName],
													  "AND", 
													  ["status","anyof","CustInvc:A"],
													  "AND", 
													["trandate","notbefore","lastyeartodate"]
												   ],
												   columns: [ search.createColumn({name: "internalid", label: "internalid"}), 
													search.createColumn({name: "entity", label: "Name"}) ] }).run();
												   
									var resultSet = [];
									
									if(invoiceSearchObj)
										resultSet = invoiceSearchObj.getRange(0,1000);
										
									if(resultSet.length > 0)
									{
										var invId = resultSet[0].getValue({ name: 'internalid'});
										log.debug({ title: 'invId', details: invId });
										var customerId = resultSet[0].getValue({ name: 'entity'});
										
										if(invId)
										{
											var paymentRec = record.transform({ fromType: 'invoice', fromId: invId, toType: 'customerpayment', isDynamic: true });
											
											paymentRec.setValue({ fieldId: 'paymentmethod', value: 41 });
											paymentRec.setValue({ fieldId: 'checknum', value: checkNum });
											paymentRec.setValue({ fieldId: 'payment', value: checkAmount });
											
											var lineNum = paymentRec.findSublistLineWithValue({ sublistId: 'apply', fieldId: 'internalid', value: invId });
											log.debug({ title: 'invId --- lineNum', details: invId+" ----- "+lineNum });

											if(lineNum != -1)
											{
												paymentRec.selectLine({ sublistId: 'apply', line: lineNum });
												paymentRec.setCurrentSublistValue({ sublistId:'apply', fieldId:'apply', value: true });
												paymentRec.commitLine({ sublistId: 'apply' });
												
												
												try
												{
													var paymentId = paymentRec.save(true, true);
													log.debug({ title: 'paymentId', details: paymentId });

													var custId = res[0].getValue({ name: 'internalid' });
													
													record.submitFields({ type: 'customrecord_lb_check', id: custId, values: { custrecord_lb_check_payment : paymentId, custrecord_lb_check_inv_num : invId, custrecord_lb_check_cust_list : customerId } });
													
												}
												catch(error)
												{
													var custId = res[0].getValue({ name: 'internalid' });
													
													record.submitFields({ type: 'customrecord_lb_check', id: custId, values: { custrecord_lb_check_error : error.toString() } });
												}
											}
											else 
											{
												var custId = res[0].getValue({ name: 'internalid' });
												record.submitFields({ type: 'customrecord_lb_check', id: custId, values: { custrecord_lb_check_error : 'No Invoice# found' } });
											}
										}
									}
								}
							}
						}
					}
				}
			}
			catch(e)
			{
				log.debug({ title: 'Error', details: e.toString() });
			}
			context.write({key: intID, value: rows})
		}
		function summarize(summary) 
		{
			
		}

		return {
			getInputData: getInputData,
			//map: map,
			reduce: reduce
			//summarize: summarize
		};
});