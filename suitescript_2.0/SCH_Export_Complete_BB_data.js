/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/file','N/http','N/format'],
    function(render, search, record, email, runtime, file, http, format){
		function executeexpotInstdatatobb(context){
			try {
				var BrokerBinSearch = search.load({
					id: 'customsearch_update_bb_data_2'
				});
				
				var BB_Headers = {};
				BB_Headers.Authorization = 'Bearer Q6Ua6arUdm40sAOE';
				BB_Headers['Content-Type'] = 'application/json';
				
				var searchid = 0;
				
				var j = 0;
				
				do {
					var searchResults = BrokerBinSearch.run().getRange(searchid, searchid + 1000);
					
					if (searchResults != null && searchResults != '' && searchResults != undefined) {
						try {
							j++;
							log.debug('search', '--> ' + searchResults.length);
							
							for (var Trans in searchResults) {
							
								var endTime = new Date().getTime() + 1 * 1000;
								var now = null;
								do {
									now = new Date().getTime();
								}
								while (now < endTime);
								
								var result = searchResults[Trans];
								var columnLen = result.columns.length;
								
								var PartNumber = '';
								var Manufacturer = '';
								var Condition = '';
								var Quantity = '';
								var Description = '';
								var Price = '';
								var InternalID = '';
								var CurrentDate = '';
								var BBGUID = '';
								
								for (var t = 0; t < columnLen; t++) {
									var column = result.columns[t];
									var LabelName = column.label;
									var fieldName = column.name;
									var value = result.getValue(column);
									var text = result.getText(column);
									if (LabelName == 'Part Number') {
										PartNumber = value
									}
									if (LabelName == 'Manufacturer') {
										Manufacturer = value
									}
									if (LabelName == 'Condition') {
										Condition = value
									}
									if (LabelName == 'Price') {
										Price = value
									}
									if (LabelName == 'Quantity') {
										Quantity = value
									}
									if (LabelName == 'Description') {
										Description = value
									}
									if (fieldName == 'internalid') {
										InternalID = value
									}
									if (LabelName == 'Current Date') {
										CurrentDate = value
									}
									if (LabelName == 'BBGUID') {
										BBGUID = value
									}
								}
								
								var ParsedCurrentDate = format.parse({
									value: CurrentDate,
									type: format.Type.DATETIME,
									timezone: format.Timezone.AMERICA_NEW_YORK
								});
								
								
								var o_BB_Obj = record.load({
									type: "customrecord_bbl",
									id: InternalID,
									isDynamic: true,
								});
								
								var ListedonBB = o_BB_Obj.getValue('custrecord_bbl_list_on_brokerbin');
								var BBQty = o_BB_Obj.getValue('custrecord_bbl_listed_brokerbin_quantity');
								var BBApproval = o_BB_Obj.getValue('custrecord_bbl_approval');
								
								var BBExists = false;
								
								if (BBGUID != null && BBGUID != '' && BBGUID != undefined) {
									BBExists = true;
								}
								
								if (PartNumber != '' && PartNumber != null && PartNumber != undefined) {
								
								}
								else {
									PartNumber = '';
								}
								
								if (Manufacturer != '' && Manufacturer != null && Manufacturer != undefined) {
								
								}
								else {
									Manufacturer = '';
								}
								
								if (Description != '' && Description != null && Description != undefined) {
								
								}
								else {
									Description = '';
								}
								
								if (Price != null && Price != '' && Price != undefined && Price != '- None -') 
								{
								
									var UpperCaseReading = String(Price).toUpperCase();
									
									if (UpperCaseReading.indexOf('CALL') > -1) {
										Price = 0;
									}
								}
								else {
									Price = 0;
								}
								
								if (ListedonBB == true && parseFloat(BBQty) > parseFloat(0) && BBApproval == 1) {
									if (BBExists == true) {
										var productDetailsList = new Array();
										
										var productDetails = {};
										productDetails.guid = BBGUID;
										productDetails.partsno = PartNumber;
										productDetails.mfg = Manufacturer;
										productDetails.cond = Condition;
										productDetails.qty = Quantity;
										productDetails.price = Price;
										productDetails.description = Description;
										productDetails.status = "In-Stock";
										
										productDetailsList.push(productDetails);
										
										log.debug({
											title: j + ' edit -BB_Response.code',
											details: productDetailsList
										});
										
										var BB_Response = http.request({
											method: http.Method.POST,
											url: 'http://rti.brokerbin.com/api/v1/parts/batch',
											body: JSON.stringify(productDetailsList),
											headers: BB_Headers
										});
										
										log.debug({
											title: j + ' edit -BB_Response.code',
											details: BB_Response.code
										});
										log.debug({
											title: j + '-BB_Response.body',
											details: BB_Response.body
										});
										
										
										if (BB_Response.code == 200) {
											var Response = JSON.parse(BB_Response.body);
											
											var ResponseGUID = Response[0].request.guid;
											
											log.debug({
												title: j + '-ResponseGUID',
												details: ResponseGUID
											});
											
											var UpdateBBid = record.submitFields({
												type: 'customrecord_bbl',
												id: InternalID,
												values: {
												
													custrecord_bb_last_update: ParsedCurrentDate
												},
												options: {
													enableSourcing: false,
													ignoreMandatoryFields: true
												}
											});
											log.debug('UpdateBBid', UpdateBBid);
										}
									}
									else {
										var productDetailsList = new Array();
										
										var productDetails = {};
										productDetails.partsno = PartNumber;
										productDetails.mfg = Manufacturer;
										productDetails.cond = Condition;
										productDetails.qty = Quantity;
										productDetails.price = Price;
										productDetails.description = Description;
										productDetails.status = "In-Stock";
										
										productDetailsList.push(productDetails);
										
										log.debug({
											title: j + '-request',
											details: JSON.stringify(productDetailsList),
										});
										
										
										var BB_Response = http.request({
											method: http.Method.PUT,
											url: 'http://rti.brokerbin.com/api/v1/parts/batch',
											body: JSON.stringify(productDetailsList),
											headers: BB_Headers
										});
										
										log.debug({
											title: j + '-BB_Response.code',
											details: BB_Response.code
										});
										
										log.debug({
											title: j + '-BB_Response.body',
											details: BB_Response.body
										});
										
										if (BB_Response.code == 200) {
										
											var Response = JSON.parse(BB_Response.body);
											
											var ResponseGUID = Response[0].request.guid;
											
											
											log.debug({
												title: j + '-ResponseGUID',
												details: ResponseGUID
											});
											
											var UpdateBBid = record.submitFields({
												type: 'customrecord_bbl',
												id: InternalID,
												values: {
													custrecord_bb_guid: ResponseGUID,
													custrecord_bb_last_update: ParsedCurrentDate
												},
												options: {
													enableSourcing: false,
													ignoreMandatoryFields: true
												}
											});
											log.debug('UpdateBBid', UpdateBBid);
										}
									}
								}
								else {
								
									if (BBExists == true) {
									
										var BB_Del_Response = http.request({
											method: http.Method.DELETE,
											url: 'http://rti.brokerbin.com/api/v1/part/' + BBGUID,
											headers: BB_Headers
										});
										
										log.debug({
											title: 'BB_Del_Response',
											details: BB_Del_Response.code
										});
                                      	log.debug({
											title: 'BB_Del_Response',
											details: BB_Del_Response.body
										});
										
										if (BB_Del_Response.code == 200) {
											var UpdateBBid = record.submitFields({
												type: 'customrecord_bbl',
												id: InternalID,
												values: {
													custrecord_bb_guid: '',
													custrecord_bb_last_update: ParsedCurrentDate
												},
												options: {
													enableSourcing: false,
													ignoreMandatoryFields: true
												}
											});
											log.debug('UpdateBBid', UpdateBBid);
										}
									}
									else {
										var UpdateBBid = record.submitFields({
											type: 'customrecord_bbl',
											id: InternalID,
											values: {
												custrecord_bb_last_update: ParsedCurrentDate
											},
											options: {
												enableSourcing: false,
												ignoreMandatoryFields: true
											}
										});
										log.debug('UpdateBBid', UpdateBBid);
									}
									
								}
								searchid++;
							}
						} 
						catch (err) {
							log.debug('Internal error', '--> ' + err);
						}
						
					}
				}
				while (searchResults.length >= 1000);
				
				
				log.debug('Data Exported', 'Data Exported');
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		return {
			execute: executeexpotInstdatatobb
		};
	});