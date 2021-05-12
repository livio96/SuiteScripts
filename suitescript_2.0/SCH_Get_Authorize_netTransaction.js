/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(["N/search", "N/record","N/email","N/runtime", "N/https","N/format"],
    function(search, record, email, runtime, https, format){
		function executeExportAuthorizeTrans(context){
			try {
				var CurrentDate = new Date();
				//CurrentDate.setDate(CurrentDate.getDate() + 1);//comment for Previous day
				var TodayDt = CurrentDate.getDate();
				var TodayYear = CurrentDate.getFullYear();
				var TodayMonth = CurrentDate.getMonth();
				TodayMonth = parseInt((TodayMonth) + parseInt(1));
				
				log.debug('TodayDt.length', '--> ' + String(TodayDt).length);
				if (parseInt(String(TodayMonth).length) > parseInt(1)) {
				
				}
				else {
					TodayMonth = '0' + TodayMonth;
				}
				if (parseInt(String(TodayDt).length) > parseInt(1)) {
				
				}
				else {
					TodayDt = '0' + TodayDt;
				}
				
				var YesterdayDate = new Date();
				YesterdayDate.setDate(YesterdayDate.getDate() - 1);//comment for Previous day
				var YesterdayDt = YesterdayDate.getDate();
				var YesterdayYear = YesterdayDate.getFullYear();
				var YesterdayMonth = YesterdayDate.getMonth();
				YesterdayMonth = parseInt((YesterdayMonth) + parseInt(1));
				if (parseInt(String(YesterdayMonth).length) > 1) {
				
				}
				else {
					YesterdayMonth = '0' + YesterdayMonth;
				}
				if (parseInt(String(YesterdayDt).length) > parseInt(1)) {
				
				}
				else {
					YesterdayDt = '0' + YesterdayDt;
				}
				
				var FromDate = YesterdayYear + "-" + YesterdayMonth + "-" + YesterdayDt + "T00:00:00.000Z";
				var ToDate = TodayYear + "-" + TodayMonth + "-" + TodayDt + "T00:00:00.000Z";
				
				//12:00:00.000Z
				//var FromDate = "2020-10-27T00:00:00.000Z";
				//var ToDate = "2020-10-28T00:00:00.000Z";
				
				log.debug('FromDate', '--> ' + FromDate);
				log.debug('ToDate', '--> ' + ToDate);
				
				var ApiName = '9Cr3Zd3V';
				var ApiKey = '92uE73T6e4fEJ7JX'
				
				var Auth_Headers = {};
				Auth_Headers['Content-Type'] = 'application/json';
				
				var RequestJs = {
					"getSettledBatchListRequest": {
						"merchantAuthentication": {
							"name": ApiName,
							"transactionKey": ApiKey
						},
						"firstSettlementDate": FromDate,
						"lastSettlementDate": ToDate
					}
				}
				
				var Batch_Response = https.request({
					method: https.Method.POST,
					url: 'https://api.authorize.net/xml/v1/request.api',
					body: JSON.stringify(RequestJs),
					headers: Auth_Headers
				});
				
				log.debug({
					title: 'edit -Batch_Response.code',
					details: Batch_Response.code
				});
				log.debug({
					title: '-Batch_Response.body',
					details: Batch_Response.body
				});
				
				if (Batch_Response.code == 200) {
				
					var RespJson = JSON.stringify(Batch_Response);
					var BatchResult = JSON.parse(RespJson).body;
					var BatchResultValues = BatchResult.slice(1, BatchResult.length);
					
					if (JSON.parse(BatchResultValues).batchList.length > 0) {
						var HeaderAccountId = ''
						
						log.debug('Statement Date', '--> ' + YesterdayDate);
						var StatementDate = format.parse({
							value: YesterdayDate,
							type: format.Type.DATE
						});
						
						var STDate = format.format({
							value: YesterdayDate,
							type: format.Type.DATE
						});
						
						var HeaderSearchRes = search.create({
							type: 'customrecord_nbsabr_bankstatement',
							filters: [["custrecord_bs_reconaccount", "anyOf", 19], "AND", ["custrecord_bs_subsidiary", "anyOf", 1], "AND", ["custrecord_bs_statementdate", "on", STDate]],
							columns: [search.createColumn({
								name: 'internalid',
								label: 'Internal ID'
							})]
						}).run().getRange(0, 1000);
						
						if (HeaderSearchRes != null && HeaderSearchRes != '' && HeaderSearchRes != undefined) {
							var HeaderAccountId = HeaderSearchRes[0].getValue({
								name: 'internalid'
							});
							log.debug('HeaderAccountId', HeaderAccountId);
						}
						else {
							var HeaderbankObj = record.create({
								type: 'customrecord_nbsabr_bankstatement',
								isDynamic: true
							});
							
							
							HeaderbankObj.setValue({
								fieldId: 'custrecord_bs_statementdate',
								value: new Date(StatementDate)
							});
							
							HeaderbankObj.setValue({
								fieldId: 'custrecord_bs_subsidiary',
								value: 1
							});
							
							HeaderbankObj.setValue({
								fieldId: 'custrecord_bs_reconaccount',
								value: 19
							});
							
							HeaderAccountId = HeaderbankObj.save({
								enableSourcing: true,
								ignoreMandatoryFields: true
							});
							log.debug('HeaderAccountId', '--> ' + HeaderAccountId);
							
						}
						
						for (var i = 0; i < JSON.parse(BatchResultValues).batchList.length; i++) {
							var BatchID = JSON.parse(BatchResultValues).batchList[i].batchId;
							log.debug({
								title: '-BatchID',
								details: BatchID
							});
							if (BatchID != null && BatchID != '' && BatchID != undefined) {
							
								var TransRequestJS = {
									"getTransactionListRequest": {
										"merchantAuthentication": {
											"name": ApiName,
											"transactionKey": ApiKey
										},
										"batchId": BatchID,
										"sorting": {
											"orderBy": "submitTimeUTC",
											"orderDescending": "true"
										},
										"paging": {
											"limit": "100",
											"offset": "1"
										}
									}
								}
								
								var Trans_Response = https.request({
									method: https.Method.POST,
									url: 'https://api.authorize.net/xml/v1/request.api',
									body: JSON.stringify(TransRequestJS),
									headers: Auth_Headers
								});
								
								log.debug({
									title: 'edit -Trans_Response.code',
									details: Trans_Response.code
								});
								log.debug({
									title: '-Trans_Response.body',
									details: Trans_Response.body
								});
								
								if (Trans_Response.code == 200) {
								
									var TransResponsestring = JSON.stringify(Trans_Response);
									
									var TransRespJson = JSON.parse(TransResponsestring).body;
									
									var TransRespJsonValues = TransRespJson.slice(1, TransRespJson.length);
									
									for (var k = 0; k < JSON.parse(TransRespJsonValues).transactions.length; k++) {
									
										var Amount = JSON.parse(TransRespJsonValues).transactions[k].settleAmount;
										var TransactionID = JSON.parse(TransRespJsonValues).transactions[k].transId;
										var Status = JSON.parse(TransRespJsonValues).transactions[k].transactionStatus;
										var FirstName = JSON.parse(TransRespJsonValues).transactions[k].firstName;
										var LastName = JSON.parse(TransRespJsonValues).transactions[k].lastName;
										
										if (Status == "settledSuccessfully" || Status == "refundsettledSuccessfully") {
										
											if (Status == "refundsettledSuccessfully") {
											
												Amount = (parseFloat(Amount) * parseFloat(-1));
											}
											
											log.debug({
												title: '-TransactionID',
												details: TransactionID
											});
											
											var abrbankObj = record.create({
												type: 'customrecord_nbsabr_bankstatementline',
												isDynamic: true
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_reference',
												value: FirstName + " " + LastName
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_bankstatementid',
												value: HeaderAccountId
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_type',
												value: Status
											});
											
											var parsedDateStringAsRawDateObject = format.parse({
												value: STDate,
												type: format.Type.DATE
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_date',
												value: new Date(parsedDateStringAsRawDateObject)
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_autoimport',
												value: true
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_reconaccount',
												value: 19
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_amount',
												value: Amount
											});
											
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_checknumber',
												value: TransactionID
											});
											
											var recordId = abrbankObj.save({
												enableSourcing: true,
												ignoreMandatoryFields: true
											});
											log.debug('recordId', '--> ' + recordId);
										}
									}
								}
							}
						}
					}
				}
			} 
			catch (e) {
				log.error({
					title: "getAuthorize.NetTransactions",
					details: {
						message: e.message,
						error: e
					}
				});
				log.debug('error', '--> ' + e);
			/*
	 var DateObj = new Date();
	 
	 var subject = 'Error :- Auto Import Bank statement ' + DateObj;
	 
	 var s_emailBody = '<body style="background-color: #f0f0f0; font-family:Helvetica-Light; font-style:Helvetica-Light;">';
	 
	 s_emailBody += '<table width="100%" style=" font-family:Helvetica-Light;background-color: #FFFFFF;">';
	 s_emailBody += '<tr>';
	 s_emailBody += '<td width="100%" valign="top" align=\"left\" style="font-size:12px;color:#3d3d3d;">&nbsp;</td>';
	 s_emailBody += '</tr>';
	 s_emailBody += '<tr>';
	 s_emailBody += '<td width="100%" valign="top" align=\"left\" style="font-size:12px;color:#3d3d3d;">&nbsp;</td>';
	 s_emailBody += '</tr>';
	 s_emailBody += '<tr>';
	 s_emailBody += '<td width="100%" valign="top" align=\"left\" style="font-size:12px;color:#3d3d3d;">Error Message :-' + e.message + '</td>';
	 s_emailBody += '</tr>';
	 s_emailBody += '<tr>';
	 s_emailBody += '<td width="100%" valign="top" align=\"left\" style="font-size:12px;color:#3d3d3d;">Error :-' + e + '</td>';
	 s_emailBody += '</tr>';
	 s_emailBody += '<tr>';
	 s_emailBody += '<td width="100%" valign="top" align=\"left\" style="font-size:12px;color:#3d3d3d;"></td>';
	 s_emailBody += '</tr>';
	 s_emailBody += '</table>';
	 s_emailBody += '</br>';
	 s_emailBody += '</body>';
	 
	 email.send({
	 author: -5,
	 recipients: 'website@telquestintl.com',
	 subject: subject,
	 body: s_emailBody,
	 });
	 */
			}
		}
		return {
			execute: executeExportAuthorizeTrans
		};
	});