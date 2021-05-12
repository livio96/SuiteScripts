/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/record', 'N/runtime','N/search','N/redirect','N/file', "N/https", "N/log","N/encode","N/format"],
    function(ui, record, runtime, search, redirect,file,https, log, encode, format)
	{
		function onRequestCustomerPricing(context)
		{
			try 
			{
				if (context.request.method === 'GET') 
				{
					//creates commission suitelet form
					createInterface(ui, context, search, record,runtime,file,https, log, encode, format);
				}
				else 
				{
					//creates customer payment when submitted
					try 
					{
						ImportBankStatement(ui, context, search, record,runtime,redirect,https, log, encode, format);
					} 
					catch (e) 
					{
						log.error('onRequest', 'error Import Statement - ' + e.message);
						var errorMessage = e.message;
						createErrorForm(context, ui, errorMessage);
					}
				}	
			} 
			catch (e) {
				log.error('onRequest', e.message);
			}
		}
		return {
			onRequest: onRequestCustomerPricing
		};
	});
/******************************
    Creates Form displaying Error
  ******************************/
  function createErrorForm(context, ui, error){
  	var form = ui.createForm({
  		title: 'An Unexpected Error Occurred'
  	});
  	
  	var errorMessage = form.addField({
  		id: 'custpage_message',
  		label: ' ',
  		type: ui.FieldType.TEXT
  	});
  	
  	errorMessage.updateDisplayType({
  		displayType: ui.FieldDisplayType.INLINE
  	});
  	
  	errorMessage.defaultValue = 'Error Importing bank statement : ' + error;
  	
	 form.clientScriptModulePath = './CLI_Auto_Import_BankStatement.js';
	 form.addButton({
	 id: 'custpage_back_to_suitelet',
	 label:'Back to Import Page',
	 functionName: 'backToSuitelet'
	 });
	 
			context.response.writePage(form);
		}

  function logvalidation(value)
  {
  	if (value != null && value != '' && value != undefined) 
	{
  		return true;
  	}
  	else 
	{
  		return false;
  	}
  }
function createInterface(ui, context, search, record, runtime, file, https, log, encode, format){

	var form = ui.createForm({
		title: 'Import Bank Statement'
	});
	
	form.clientScriptModulePath = './CLI_Auto_Import_BankStatement.js';
	
	var FromDateObj = form.addField({
		id: 'custpage_importfromdate',
		label: 'From Date',
		type: ui.FieldType.DATE
	});
	var ReqFromDate = context.request.parameters.custpage_importfromdate;
	if (ReqFromDate != null && ReqFromDate != '' && ReqFromDate != undefined) {
	
	
		var STDate = format.format({
			value: ReqFromDate,
			type: format.Type.DATE
		});
		
		FromDateObj.defaultValue = STDate;
	}
	FromDateObj.setMandatory = true;
	
	var ToDateObj = form.addField({
		id: 'custpage_importtodate',
		label: 'To Date',
		type: ui.FieldType.DATE
	});
	
	var ReqToDate = context.request.parameters.custpage_importtodate;
	
	if (ReqToDate != null && ReqToDate != '' && ReqToDate != undefined) {
	
		var ToDate = format.format({
			value: ReqToDate,
			type: format.Type.DATE
		});
		ToDateObj.defaultValue = ToDate;
	}
	ToDateObj.setMandatory = true;
	
	form.addButton({
		id: 'custpage_serachbankdata',
		label: 'Search',
		functionName: 'searchbankstatementdata'
	});
	
	form.addSubmitButton({
		label: 'Import'
	});
	
	BankDataSublist(form, ui, context, search, record, runtime, file, https, log, encode, format)
	
	context.response.writePage(form);
}
function BankDataSublist(form,ui, context, search, record, runtime, file,https, log, encode, format)
{
	
	var ReqFromDate = context.request.parameters.custpage_importfromdate;
	var ReqToDate = context.request.parameters.custpage_importtodate;
	
	if (ReqFromDate != null && ReqFromDate != '' && ReqFromDate != undefined) 
	{
		var items_tab = form.addTab({
			id: 'custpage_bankstatment_tab',
			label: 'Bank Statment'
		});
		
		var items_list = form.addSublist({
			id: 'custpage_sublist',
			label: 'Statment',
			tab: 'custpage_bankstatment_tab',
			type: ui.SublistType.LIST
		});
		
		
		var DateObj = items_list.addField({
			id: 'custpage_trandate',
			type: ui.FieldType.DATE,
			label: 'DATE'
		});
		
	/*
	var RefObj = items_list.addField({
			id: 'custpage_reference',
			type: ui.FieldType.TEXT,
			label: 'Reference',
		});
		
		var entityObj = items_list.addField({
			id: 'custpage_tranid',
			type: ui.FieldType.TEXT,
			label: 'Transcation ID',
		
		});
		
*/
		var salesrepObj = items_list.addField({
			id: 'custpage_trantype',
			type: ui.FieldType.TEXT,
			label: 'Transaction Type',
		});
		
		var ItemObj = items_list.addField({
			id: 'custpage_amount',
			type: ui.FieldType.TEXT,
			label: 'Amount',
		});
		
		var QuantityObj = items_list.addField({
			id: 'custpage_memo',
			type: ui.FieldType.TEXTAREA,
			label: 'MEMO'
		});
		
		
		var CurrentDate = new Date(ReqToDate);
		var TodayDay = CurrentDate.getDay();
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
		
		var YesterdayDate = new Date(ReqFromDate);
		
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
		
		//var FromDate = '2021' + "-" + '04' + "-" + '01' + "T00:00:00.000Z";
		//var ToDate = '2021' + "-" + '04' + "-" + '26' + "T00:00:00.000Z";
		
		var FromDate = YesterdayYear + "-" + YesterdayMonth + "-" + YesterdayDt + "T00:00:00.000Z";
		var ToDate = TodayYear + "-" + TodayMonth + "-" + TodayDt + "T00:00:00.000Z";
		
		
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
		
		log.debug('base64EncodedString', '--> ' + base64EncodedString);
		
		
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
		
	/*
	log.debug('accessToken', '--> ' + accessToken);
		var expiresAt = Date.now() + 1000 * expires_in;
		
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
				
				/*
log.debug('Statement Date', '--> ' + CurrentDate);
				var StatementDate = format.parse({
					value: CurrentDate,
					type: format.Type.DATE
				});
				
				var STDate = format.format({
					value: CurrentDate,
					type: format.Type.DATE
				});
				
*/
				var j=0;
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
					
					items_list.setSublistValue({
						id: 'custpage_trandate',
						line: j,
						value: TranDate
					});
					
					/*
items_list.setSublistValue({
						id: 'custpage_reference',
						line: j,
						value: Reference
					});
					
					items_list.setSublistValue({
						id: 'custpage_tranid',
						line: j,
						value: TransactionID
					});
*/

					items_list.setSublistValue({
						id: 'custpage_trantype',
						line: j,
						value: Transaction_Type
					});
					items_list.setSublistValue({
						id: 'custpage_amount',
						line: j,
						value: Amount
					});
					items_list.setSublistValue({
						id: 'custpage_memo',
						line: j,
						value: Memo
					});
					
					j = j+1;
				}
			}
		}
	}
}
function ImportBankStatement(ui, context, search, record, runtime, redirect,https, log, encode, format){

	var ReqFromDate = context.request.parameters.custpage_importfromdate;
	var ReqToDate = context.request.parameters.custpage_importtodate;
	log.debug('ReqFromDate', '--> ' + ReqFromDate);
	log.debug('ReqToDate', '--> ' + ReqToDate);
	
	var CurrentDate = new Date(ReqToDate);
	var TodayDay = CurrentDate.getDay();
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
	
	var YesterdayDate = new Date(ReqFromDate);
	
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
	
	/*
log.debug('accessToken', '--> ' + accessToken);
	var expiresAt = Date.now() + 1000 * expires_in;
	
*/
	var auth = "Bearer ".concat(accessToken);
	
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
			
			log.debug('Statement Date', '--> ' + CurrentDate);
			var StatementDate = format.parse({
				value: CurrentDate,
				type: format.Type.DATE
			});
			
			var STDate = format.format({
				value: CurrentDate,
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
	redirect.toSuitelet({
		scriptId: 'customscript_sut_auto_import_bank_stat',
		deploymentId: '1',
	});
}