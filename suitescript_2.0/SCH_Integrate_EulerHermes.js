/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(["N/search", "N/record","N/email","N/runtime", "N/https","N/format"],
    function(search, record, email, runtime, https, format){
		function executeIntegrateEHCustomer(context){
			try {
				//var ApiKey = 'bGJlcWlyaUB0ZWxxdWVzdGludGwuY29tOiUpfHtQSiI5RTZRQEZ4QyQwVDVgbTVSKy1eejF4dA=='Sandbox
				var ApiKey = 'bGJlcWlyaUB0ZWxxdWVzdGludGwuY29tOm1IImN2LnBrPFZKW3VQLmFKWyNGNy05a2tKPiJuNw=='
				
				var Auth_Headers = {};
				Auth_Headers['Content-Type'] = 'application/json';
				
				var RequestJs = {
					"apiKey": ApiKey
				}
				
				//https://api-services.uat.1placedessaisons.com/uatm/v1/idp/oauth2/authorize
				
				var EH_Auth_Response = https.request({
					method: https.Method.POST,
					url: 'https://api.eulerhermes.com/v1/idp/oauth2/authorize',
					body: JSON.stringify(RequestJs),
					headers: Auth_Headers
				});
				
				log.debug({
					title: 'edit -EH_Auth_Response.code',
					details: EH_Auth_Response.code
				});
				log.debug({
					title: '-EH_Auth_Response.body',
					details: EH_Auth_Response.body
				});
				
				if (EH_Auth_Response.code == 200) {
					//var AuthorizeRespJson = JSON.stringify(EH_Auth_Response);
					var AuthResult = JSON.parse(EH_Auth_Response.body);
					var AccessToken = AuthResult.access_token;
					
					log.debug({
						title: 'AccessToken',
						details: AccessToken
					});
					
					var CustEHObj = {};
					
					var EHCustSearchRes = search.create({
						type: record.Type.CUSTOMER,
						filters: [["custentity_eh_exception", "is", 'F'], "AND", ["custentity_eh_id", "isnotempty", null], "AND", ["stage", "anyOf", ["CUSTOMER", "LEAD"]]],
						columns: [search.createColumn({
							name: 'internalid'
						}), search.createColumn({
							name: 'custentity_eh_id'
						}), search.createColumn({
							name: 'creditlimit'
						}), search.createColumn({
							name: 'stage'
						}), search.createColumn({
							name: 'terms'
						})]
					}).run().getRange(0, 1000);
					
					if (EHCustSearchRes != null && EHCustSearchRes != '' && EHCustSearchRes != undefined) {
						log.debug('Total EHCustSearchRes ', '--> ' + EHCustSearchRes.length);
						for (var t = 0; t < EHCustSearchRes.length; t++) {
							var CustomerID = EHCustSearchRes[t].getValue({
								name: 'internalid'
							});
							var EHID = EHCustSearchRes[t].getValue({
								name: 'custentity_eh_id'
							});
							var CustCreditLimit = EHCustSearchRes[t].getValue({
								name: 'creditlimit'
							});
							var stage = EHCustSearchRes[t].getValue({
								name: 'stage'
							});
							var Terms = EHCustSearchRes[t].getValue({
								name: 'terms'
							});
							if (CustCreditLimit != null && CustCreditLimit != '' && CustCreditLimit != undefined) {
							
							}
							else {
								CustCreditLimit = 0;
							}
							
							EHID = Number(EHID)
							
							
							CustEHObj[EHID] = {
								CustomerID: CustomerID,
								CreditLimit: CustCreditLimit,
								stage: stage,
								Terms: Terms
							}
						}
					}
					
					var Page = 1;
					var PageResult = 0;
					var CoverRespJson = new Array();
					
					
					var Cover_Auth_Headers = {};
					Cover_Auth_Headers['authorization'] = 'Bearer ' + AccessToken;
					//https://api-services.uat.1placedessaisons.com/uatm/riskinfo/v2/covers?policyId=5121840&businessUnitCode=ACI&pageSize=100&page
					do {
						var Cover_Response = https.request({
							method: https.Method.GET,
							url: 'https://api.eulerhermes.com/riskinfo/v2/covers?policyId=5121840&businessUnitCode=ACI&pageSize=100&page=' + Page,
							headers: Cover_Auth_Headers
						});
						
						log.debug({
							title: 'edit -Cover_Response.code',
							details: Cover_Response.code
						});
						log.debug({
							title: '-Cover_Response.body',
							details: Cover_Response.body
						});
						
						Page = (parseInt(Page) + parseInt(1))
						
						if (Cover_Response.code == 206) {
							var CoverRespJson = JSON.parse(Cover_Response.body);
							
							for (var Cover in CoverRespJson) {
								PageResult = (parseInt(PageResult) + parseInt(1))
								
								log.debug({
									title: 'PageResult',
									details: PageResult
								});
								
								var CoverObj = CoverRespJson[Cover];
								
								log.debug({
									title: '-Cover ID',
									details: CoverObj.coverId
								});
								
								if (CoverObj.decision != null && CoverObj.decision != '' && CoverObj.decision != undefined) {
								
									try {
									
										var CompanyID = CoverObj.company.companyId
										log.debug({
											title: '-CompanyID',
											details: CompanyID
										});
										CompanyID = Number(CompanyID)
										if (CompanyID in CustEHObj) {
										
											var CustomerID = CustEHObj[CompanyID].CustomerID;
											var NSCreditLimit = CustEHObj[CompanyID].CustCreditLimit;
											var NSStage = CustEHObj[CompanyID].stage;
											var NSTerms = CustEHObj[CompanyID].Terms;
											
											log.debug({
												title: '-Credit Limit',
												details: "Cust InternalID" + CustomerID + "-EH ID-" + CoverObj.company.companyId + "-Credit LIMIT-" + CoverObj.decision.permanent.permanentAmount
											});
											
											var EHCreditLimit = CoverObj.decision.permanent.permanentAmount;
											
											if (EHCreditLimit != null && EHCreditLimit != '' && EHCreditLimit != undefined) {
												if (parseFloat(EHCreditLimit) <= parseFloat(0)) {
													EHCreditLimit = '';
												}
											}
											else {
												EHCreditLimit = '';
											}
											
											if (String(NSStage).toUpperCase() == 'LEAD') {
												if (EHCreditLimit != null && EHCreditLimit != '' && EHCreditLimit != undefined) {
													if (NSTerms != null && NSTerms != '' && NSTerms != undefined) {
													
														var UpdatedCustomerID = record.submitFields({
															type: 'lead',
															id: CustomerID,
															values: {
																custentity_eh_credit_limit: EHCreditLimit,
																creditlimit: EHCreditLimit
															},
															options: {
																enableSourcing: false,
																ignoreMandatoryFields: true
															}
														});
													}
													else {
														var UpdatedCustomerID = record.submitFields({
															type: 'lead',
															id: CustomerID,
															values: {
																custentity_eh_credit_limit: EHCreditLimit,
																creditlimit: EHCreditLimit,
																terms: 2
															},
															options: {
																enableSourcing: false,
																ignoreMandatoryFields: true
															}
														});
													}
												}
												else {
													var UpdatedCustomerID = record.submitFields({
														type: 'lead',
														id: CustomerID,
														values: {
															custentity_eh_credit_limit: EHCreditLimit,
															creditlimit: EHCreditLimit,
															terms: ''
														},
														options: {
															enableSourcing: false,
															ignoreMandatoryFields: true
														}
													});
												}
												
												log.debug({
													title: '-Updated Customer ID',
													details: UpdatedCustomerID
												});
											}
											else {
												if (EHCreditLimit != null && EHCreditLimit != '' && EHCreditLimit != undefined) {
												
													if (NSTerms != null && NSTerms != '' && NSTerms != undefined) {
													
														var UpdatedCustomerID = record.submitFields({
															type: 'customer',
															id: CustomerID,
															values: {
																custentity_eh_credit_limit: EHCreditLimit,
																creditlimit: EHCreditLimit
															},
															options: {
																enableSourcing: false,
																ignoreMandatoryFields: true
															}
														});
														
														log.debug({
															title: '-Updated Customer ID',
															details: UpdatedCustomerID
														});
													}
													else {
														var UpdatedCustomerID = record.submitFields({
															type: 'customer',
															id: CustomerID,
															values: {
																custentity_eh_credit_limit: EHCreditLimit,
																creditlimit: EHCreditLimit,
																terms: 2
															},
															options: {
																enableSourcing: false,
																ignoreMandatoryFields: true
															}
														});
														
														log.debug({
															title: '-Updated Customer ID',
															details: UpdatedCustomerID
														});
													}
												}
												else {
													var UpdatedCustomerID = record.submitFields({
														type: 'customer',
														id: CustomerID,
														values: {
															custentity_eh_credit_limit: EHCreditLimit,
															creditlimit: EHCreditLimit,
															terms: ''
														},
														options: {
															enableSourcing: false,
															ignoreMandatoryFields: true
														}
													});
													
													log.debug({
														title: '-Updated Customer ID',
														details: UpdatedCustomerID
													});
												}
											}
										}
									} 
									catch (ex) {
										log.debug('Internal error', '--> ' + ex);
									}
								}
							}
						}
					}
					while (CoverRespJson.length >= 100)
				}
			} 
			catch (e) {
				log.error({
					title: "Eh Customer",
					details: {
						message: e.message,
						error: e
					}
				});
				log.debug('error', '--> ' + e);
				
			}
		}
		return {
			execute: executeIntegrateEHCustomer
		};
	});