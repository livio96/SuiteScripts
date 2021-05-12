/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/task'],
    function(render, search, record, email, runtime, task){
		function executecreaterma(context){
			try {
				var script = runtime.getCurrentScript();
				//var number = Number(script.getParameter({name:'custscript_index_val'}));
				//log.debug({ title:'number', details: number });
				
				var GroupRMASearch = search.create({
					type: 'customrecord_webstore_rma',
					filters: [['custrecord_webstore_rma_pros_status', 'anyOf', '1']],
					columns: [search.createColumn({
						name: 'internalid',
						join: 'custrecord_webstore_rma_invoice',
						summary: 'GROUP',
						sort: search.Sort.ASC,
						label: 'Invoice'
					})]
				}).run().getRange(0, 1000);
				
				if (GroupRMASearch != null && GroupRMASearch != '' && GroupRMASearch != undefined) {
					for (var q = 0; q < GroupRMASearch.length; q++) {
						var remainingUsage = script.getRemainingUsage();
						log.debug({
							title: 'remainingUsage',
							details: remainingUsage
						});
						
						if (remainingUsage < 1000) {
							var mrTask = task.create({
								taskType: task.TaskType.SCHEDULED_SCRIPT,
								scriptId: 'customscript_sch_create_webstorerma',
								deploymentId: 'customdeploy1'
							});
							
							var taskObj = mrTask.submit();
							
							break;
						}
						
						var InvoiceID = GroupRMASearch[q].getValue({
							name: 'internalid',
							join: 'custrecord_webstore_rma_invoice',
							summary: 'GROUP',
							sort: search.Sort.ASC,
							label: 'Invoice'
						});
						
						log.debug('InvoiceID', '--> ' + InvoiceID);
						
						var InvWiseRMASearchRes = search.create({
							type: 'customrecord_webstore_rma',
							filters: [['custrecord_webstore_rma_pros_status', 'anyOf', '1'], "AND", ['custrecord_webstore_rma_invoice', 'anyOf', InvoiceID]],
							columns: [search.createColumn({
								name: 'internalid',
								label: 'Internal ID'
							}), search.createColumn({
								name: 'custrecord_webstore_rma',
								label: 'Quantity'
							}), search.createColumn({
								name: 'custrecord_webstore_rma_item',
								label: 'Item'
							})]
						}).run().getRange(0, 1000);
						
						if (InvWiseRMASearchRes != null && InvWiseRMASearchRes != '' && InvWiseRMASearchRes != undefined) {
							try {
								var CloseWebStoreRMA = new Array();
								
								//==============================Start:- Get Existing Authorization Serial Numbers===================//
								var a_venreturn_Vertical = {};
								var a_venreturn_Vertical_array = new Array();
								
								var RetunSerialSearch = search.load({
									id: 'customsearch_return_serial_validation'
								});
								
								var MyFilters = search.createFilter({
									name: 'createdfrom',
									operator: 'anyOf',
									values: InvoiceID
								})
								
								RetunSerialSearch.filters.push(MyFilters);
								
								var searchid = 0;
								
								var j = 0;
								
								do {
									var searchResults = RetunSerialSearch.run().getRange(searchid, searchid + 1000);
									
									if (searchResults != null && searchResults != '' && searchResults != undefined) {
										for (var Trans in searchResults) {
											var result = searchResults[Trans];
											var columnLen = result.columns.length;
											
											
											var SerialNumber = '';
											var Item = '';
											
											for (var t = 0; t < columnLen; t++) {
												var column = result.columns[t];
												var LabelName = column.label;
												var fieldName = column.name;
												var value = result.getValue(column);
												var text = result.getText(column);
												
												if (LabelName == 'SERIALID') {
													SerialNumber = text
												}
												if (LabelName == 'ITEM') {
													Item = value
												}
											}
											//log.debug('SerialNumber', '--> ' + SerialNumber);
											a_venreturn_Vertical[SerialNumber] = Item;
											a_venreturn_Vertical_array.push(a_venreturn_Vertical);
											
											searchid++;
										}
									}
								}
								while (searchResults.length >= 1000);
								
								//==============================End :- Get Existing Authorization Serial Numbers===================//
								
								var rtnauthobj = record.transform({
									fromType: record.Type.INVOICE,
									fromId: InvoiceID,
									toType: record.Type.RETURN_AUTHORIZATION,
									isDynamic: true,
								});
								
								rtnauthobj.setValue({
									fieldId: 'custbody_auto_createwebstore',
									value: true
								});
								
								rtnauthobj.setValue({
									fieldId: 'custbody_auto_receive_rma',
									value: true
								});
								
								rtnauthobj.setValue({
									fieldId: 'orderstatus',
									value: 'B'
								});
								
								//rtnauthobj.setValue('custbody_auto_createwebstore',true);
								
								var RtnAuthLines = rtnauthobj.getLineCount({
									sublistId: 'item'
								});
								
								var ItemCount = 0;
								var RemoveLineNum = new Array();
								var RemoveLine = false;
								
								for (var i = 0; i < RtnAuthLines; i++) {
									rtnauthobj.selectLine({
										sublistId: 'item',
										line: i
									});
									var ItemRecId = rtnauthobj.getCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'item'
									});
									
									var TotalQty = parseFloat(0);
									for (var l = 0; l < InvWiseRMASearchRes.length; l++) {
										var CustRMAID = InvWiseRMASearchRes[l].getValue({
											name: 'internalid'
										});
										var Quantity = InvWiseRMASearchRes[l].getValue({
											name: 'custrecord_webstore_rma'
										});
										var Item = InvWiseRMASearchRes[l].getValue({
											name: 'custrecord_webstore_rma_item'
										});
										
										if (ItemRecId == Item) {
											TotalQty = (parseFloat(TotalQty) + parseFloat(Quantity))
											CloseWebStoreRMA.push(CustRMAID);
										}
									}
									log.debug('TotalQty', '--> ' + TotalQty);
									if (parseFloat(TotalQty) > parseFloat(0)) {
										var InvQuantity = rtnauthobj.getCurrentSublistValue({
											sublistId: 'item',
											fieldId: 'quantity'
										});
										
										if (parseFloat(InvQuantity) > parseFloat(TotalQty)) {
											rtnauthobj.setCurrentSublistValue({
												sublistId: 'item',
												fieldId: 'quantity',
												value: TotalQty
											});
											
											var IsSerial = rtnauthobj.getCurrentSublistValue({
												sublistId: 'item',
												fieldId: 'isserial',
											});
											log.debug('IsSerial', '--> ' + IsSerial);
											
											if (IsSerial == 'T') {
												var subrec = rtnauthobj.getCurrentSublistSubrecord({
													sublistId: 'item',
													fieldId: 'inventorydetail'
												});
												
												var numLines = subrec.getLineCount({
													sublistId: 'inventoryassignment'
												});
												log.debug('numLines', '--> ' + numLines);
												
												var SerialArray = new Array();
												
												for (var p = 0; p < numLines; p++) {
													var SerialID = subrec.getSublistValue({
														sublistId: 'inventoryassignment',
														fieldId: 'receiptinventorynumber',
														line: p
													});
													log.debug('SerialID', '--> ' + SerialID);
													
													SerialArray.push(SerialID)
												}
												
												for (var z = numLines - 1; z >= 0; z--) {
													log.debug('IsSerial-z', '--> ' + z);
													subrec.removeLine({
														sublistId: 'inventoryassignment',
														line: z
													});
												}
												var InsertQty = 0;
												for (var n = 0; n < SerialArray.length; n++) {
													var SerialNumber = SerialArray[n];
													log.debug('SerialNumber', '--> ' + SerialNumber);
													if (SerialNumber in a_venreturn_Vertical) {
													
													}
													else {
														log.debug('Selected SerialNumber', '--> ' + SerialNumber);
														subrec.selectNewLine({
															sublistId: 'inventoryassignment',
														});
														subrec.setCurrentSublistValue({
															sublistId: 'inventoryassignment',
															fieldId: 'receiptinventorynumber',
															value: SerialNumber
														});
														subrec.commitLine({
															sublistId: 'inventoryassignment'
														});
														
														InsertQty++;
														
														if (parseInt(InsertQty) == (TotalQty)) {
															break;
														}
													}
												}
											}
											else {
												var subrec = rtnauthobj.getCurrentSublistSubrecord({
													sublistId: 'item',
													fieldId: 'inventorydetail'
												});
												
												var numLines = subrec.getLineCount({
													sublistId: 'inventoryassignment'
												});
												
												log.debug('numLines', '--> ' + numLines);
												
												subrec.selectLine({
													sublistId: 'inventoryassignment',
													line: 0
												});
												subrec.setCurrentSublistValue({
													sublistId: 'inventoryassignment',
													fieldId: 'quantity',
													value: TotalQty
												});
												subrec.commitLine({
													sublistId: 'inventoryassignment'
												});
											}
											rtnauthobj.commitLine({
												sublistId: 'item'
											});
										}
										else 
											if (InvQuantity = TotalQty) {
											
											}
											else {
												throw ('Error-Total Quantity cannot be greater than ordered qty');
											}
									}
									else {
										RemoveLineNum.push(i);
										RemoveLine = true;
									}
								}
								if (RemoveLine == true) {
									for (var rl = RemoveLineNum.length - 1; rl >= 0; rl--) {
										var linenum = RemoveLineNum[rl];
										log.debug('Remove linenum', linenum);
										rtnauthobj.removeLine({
											sublistId: 'item',
											line: linenum
										});
									}
								}
								
								var RTNAuhrecordId = rtnauthobj.save({
									enableSourcing: true,
									ignoreMandatoryFields: true
								});
								
								log.debug('RTNAuhrecordId', RTNAuhrecordId);
								
								for (var rma = 0; rma < CloseWebStoreRMA.length; rma++) {
									var RMAInternalID = CloseWebStoreRMA[rma];
									var id = record.submitFields({
										type: 'customrecord_webstore_rma',
										id: RMAInternalID,
										values: {
											custrecord_webstore_rma_link: RTNAuhrecordId,
											custrecord_webstore_rma_pros_status: 2,
										},
										options: {
											enableSourcing: false,
											ignoreMandatoryFields: true
										}
									});
								}
								
								var UpdatedInvoiceid = record.submitFields({
									type: record.Type.INVOICE,
									id: InvoiceID,
									values: {
										custbody_rma_type: 1,
									},
									options: {
										enableSourcing: false,
										ignoreMandatoryFields: true
									}
								});
							} 
							catch (ex) {
								log.debug('Inter RTN Authorization Error', '--> ' + ex);
							}
						}
					}
				}
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		return {
			execute: executecreaterma
		};
	});