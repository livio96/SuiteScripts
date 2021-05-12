/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(["N/search", "N/record","N/email","N/runtime", "N/https", "N/log","N/encode","N/format"],
    function(search, record, email, runtime, https, log, encode, format){
		function executeExportBankTrans(context){
			try {
				var CurrentDate = new Date();
				//CurrentDate.setDate(CurrentDate.getDate() + 1);//comment for Previous day
				var TodayDay = CurrentDate.getDay();
				
				if (TodayDay != 0 && TodayDay != 6) {
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
					if (TodayDay == 1) {
						YesterdayDate.setDate(YesterdayDate.getDate() - 3);//comment for Previous day
					}
					else {
						YesterdayDate.setDate(YesterdayDate.getDate() - 1);//comment for Previous day
					}
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
					
					
					var bankAccountId = '4f7e9d2d-b15f-495c-b0d7-3844e796d3b7'
					
					var R = record.load({
						type: "customrecord_bofa_conf",
						id: 1,
						isDynamic: true
					});
					
					var Host = R.getValue({
						fieldId: 'custrecord_bofa_host'
					});
					log.debug('Host', '--> ' + Host);
					
					var ClientID = R.getValue({
						fieldId: 'custrecord_bofa_client_id'
					});
					log.debug('ClientID', '--> ' + ClientID);
					var clientSecret = R.getValue({
						fieldId: 'custrecord_bofa_client_secret'
					});
					log.debug('clientSecret', '--> ' + clientSecret);
					
					
					var force = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
					/*
var session = runtime.getCurrentSession();
					var accessToken = session.get({
						name: "".concat("bofa_api_access_token")
					});
					var expiresAt = session.get({
						name: "".concat("bofa_api_expires_at")
					});
					
					if (!force && accessToken && Date.now() < expiresAt - 1000 * 60) {
						return "Bearer ".concat(accessToken);
					}
					
*/
					var path = "accounts/oauth/token?grant_type=client_credentials";
					
					
					//var basicBase64 = base64Util.encode("".concat(ClientID, ":").concat(clientSecret));
					
					var basicBase64 = "".concat(ClientID, ":").concat(clientSecret);
					
					var base64EncodedString = encode.convert({
						string: basicBase64,
						inputEncoding: encode.Encoding.UTF_8,
						outputEncoding: encode.Encoding.BASE_64
					});
					
					var accessTokenResponse = https.post({
						url: Host + path,
						headers: {
							"Accept": "*/*",
							"Authorization": "Basic " + base64EncodedString,
							"Bank-Plugin-Version": "netsuite.".concat("2020.6.0")
						},
						body: " "
					});
					log.debug('accessTokenResponse.code', '--> ' + accessTokenResponse.code);
					if (accessTokenResponse.code !== 200 && accessTokenResponse.code !== 201) {
						throw new Error("Authentication Failed");
					}
					
					var _JSON$parse = JSON.parse(accessTokenResponse.body), access_token = _JSON$parse.access_token, expires_in = _JSON$parse.expires_in;
					
					var accessToken = access_token;
					
					log.debug('accessToken', '--> ' + accessToken);
					var expiresAt = Date.now() + 1000 * expires_in;
					/*
session.set({
						name: "".concat("bofa", "_api_access_token"),
						value: accessToken
					});
					session.set({
						name: "".concat("bofa", "_api_expires_at"),
						value: expiresAt
					});
					
*/
					var auth = "Bearer ".concat(accessToken);
					
					//	var credentials = configUtil.loadApiCredentials();
					//	var auth = configUtil.createAuthorizationHeader(credentials);
					
					/*
				 var fromDate = "2020-14-7", toDate = "2020-14-7";
				 
				 var sort = {
				 column: "settleDate",
				 direction: "DESC"
				 };
				 
				 var queryParams = {
				 sort: "".concat(sort.column, ",").concat(sort.direction.toLowerCase()),
				 fromDate: '2020-07-14T00:00:00.000Z',
				 toDate: '2020-07-15T00:00:00.000Z'
				 };
				 var queryString = Object.keys(queryParams).filter(function(key){
				 return !!queryParams[key];
				 }).map(function(key){
				 return "".concat(key, "=").concat(queryParams[key]);
				 }).join("&");
				 
				 var result = https.get({
				 url: "".concat(Host, "api/accounts-info/bank-accounts/").concat(bankAccountId, "/transactions?").concat(queryString),
				 headers:
				 {
				 "Accept": "application/json",
				 "Authorization": auth,
				 "Bank-Plugin-Version": "netsuite.".concat("2020.6.0")
				 }
				 });
				 */
					var payload = {
						fileType: "NETSUITE_TRANSACTIONS_CSV",
						details: {
							fromDate: FromDate,
							toDate: ToDate
						}
					};
					var result = https.post({
						url: "".concat(Host, "api/accounts-info/bank-accounts/").concat(bankAccountId, "/transactions/export"),
						headers: {
							"Accept": "application/json",
							"Content-Type": "application/json",
							"Authorization": auth,
							"Bank-Plugin-Version": "netsuite.".concat("2020.6.0")
						},
						body: JSON.stringify(payload)
					});
					
					if (result.code == 202) {
						var body = JSON.parse(result.body);
						
						var JSBody = JSON.stringify(result.body);
						log.debug('JSBody ', '--> ' + JSBody);
						
						log.debug('result.code ', '--> ' + result.code);
						log.debug('body', '--> ' + body);
						log.debug('body id', '--> ' + body.id);
						
						var fileId = body.id;
						
						var resultFile = https.get({
							url: "".concat(Host, "api/file-service/files/").concat(fileId),
							headers: {
								"Accept": "application/json",
								"Authorization": auth,
								"Bank-Plugin-Version": "netsuite.".concat("2020.6.0")
							}
						});
						
						log.debug('resultFile', '--> ' + resultFile.code);
						log.debug('resultFile', '--> ' + resultFile.status);
						if (resultFile.code == 200) {
							var get_url = "".concat(Host, "api/file-service/files/").concat(fileId, "/content");
							
							var response = https.request({
								method: https.Method.GET,
								url: get_url
							});
							
							log.debug('data', '--> ' + response.body);
							
							var arrLines = response.body.split(/\n|\n\r/);
							
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
							
							if (parseInt(arrLines.length) > parseInt(2)) {
							
								var HeaderSearchRes = search.create({
									type: 'customrecord_nbsabr_bankstatement',
									filters: [["custrecord_bs_reconaccount", "anyOf", 11], "AND", ["custrecord_bs_subsidiary", "anyOf", 1], "AND", ["custrecord_bs_statementdate", "on", STDate]],
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
										value: 11
									});
									
									HeaderAccountId = HeaderbankObj.save({
										enableSourcing: true,
										ignoreMandatoryFields: true
									});
									log.debug('HeaderAccountId', '--> ' + HeaderAccountId);
									
								}
								for (var i = 1; i < arrLines.length - 1; i++) {
								
									var content = arrLines[i].split(',');
									// add the columns of the CSV file here
									var TranDate = content[0];
									var Reference = content[1];
									var TransactionID = content[2];
									var Transaction_Type = content[3];
									var Amount = content[4];
									var Memo = content[5];
									
									log.debug('Transactions', '--> ' + TranDate + '-->' + Reference + '-->' + Transaction_Type + '-->' + Amount);
									
									//create ABR Bank Statement Line Record	
									/*
								 var LineSearchRes = search.create({
								 type: 'customrecord_nbsabr_bankstatementline',
								 filters: [["custrecord_bsl_transaction_id", "is", TransactionID]],
								 columns: [search.createColumn({
								 name: 'internalid',
								 label: 'Internal ID'
								 })]
								 }).run().getRange(0, 1000);
								 
								 if (LineSearchRes != null && LineSearchRes != '' && LineSearchRes != undefined)
								 {
								 
								 }
								 else
								 */
									{
										var abrbankObj = record.create({
											type: 'customrecord_nbsabr_bankstatementline',
											isDynamic: true
										});
										
										if (Reference != null && Reference != '' && Reference != undefined) {
											abrbankObj.setValue({
												fieldId: 'custrecord_bsl_reference',
												value: Reference
											});
										}
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_bankstatementid',
											value: HeaderAccountId
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_memo',
											value: Memo
										});
										
										var parsedDateStringAsRawDateObject = format.parse({
											value: TranDate,
											type: format.Type.DATE
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_date',
											value: new Date(parsedDateStringAsRawDateObject)
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_type',
											value: Transaction_Type
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_autoimport',
											value: true
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_reconaccount',
											value: 11
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_amount',
											value: Amount
										});
										
										abrbankObj.setValue({
											fieldId: 'custrecord_bsl_transaction_id',
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
			catch (e) {
				log.error({
					title: "getBankAccountTransactions",
					details: {
						message: e.message,
						error: e
					}
				});
				log.debug('error', '--> ' + e);
				
				
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
			}
		}
		return {
			execute: executeExportBankTrans
		};
	});