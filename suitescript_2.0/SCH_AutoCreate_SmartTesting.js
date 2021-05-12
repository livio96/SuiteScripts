/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/task','N/format'],
    function(render, search, record, email, runtime, task,format){
		function executecreatenextstagesmarttesting(context){
			try {
				var script = runtime.getCurrentScript();
				
				var GroupSMTTestingRecSearch = search.create({
					type: 'customrecord_smt_sn',
					filters: [['custrecord_smt_sn_processed', 'is', 'T'], "AND", ['custrecord_smt_sn_correcting_transaction', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_nextstagesmtrec', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_testupdate.custrecord_stu_nextstage', 'is', 'T']],
					columns: [search.createColumn({
						name: 'custrecord_smt_sn_smart_testing',
						summary: 'GROUP',
						sort: search.Sort.ASC
					}), search.createColumn({
						name: 'custrecord_smt_sn_location',
						summary: 'GROUP',
						sort: search.Sort.ASC
					})]
				}).run().getRange(0, 1000);
				
				if (GroupSMTTestingRecSearch != null && GroupSMTTestingRecSearch != '' && GroupSMTTestingRecSearch != undefined) {
					for (var q = 0; q < GroupSMTTestingRecSearch.length; q++) {
						var remainingUsage = script.getRemainingUsage();
						log.debug({
							title: 'remainingUsage',
							details: remainingUsage
						});
						
						var SmartTestingID = GroupSMTTestingRecSearch[q].getValue({
							name: 'custrecord_smt_sn_smart_testing',
							summary: 'GROUP',
							sort: search.Sort.ASC,
						});
						
						var Location = GroupSMTTestingRecSearch[q].getValue({
							name: 'custrecord_smt_sn_location',
							summary: 'GROUP',
							sort: search.Sort.ASC,
						});
						
						log.debug('SmartTestingID', '--> ' + SmartTestingID);
						
						var STLineSearch = search.create({
							type: 'customrecord_smt_sn',
							filters: [['custrecord_smt_sn_smart_testing', 'anyOf', SmartTestingID], "AND", ['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_processed', 'is', 'T'], "AND", ['custrecord_smt_sn_correcting_transaction', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_nextstagesmtrec', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_testupdate.custrecord_stu_nextstage', 'is', 'T']],
							columns: [search.createColumn({
								name: 'custrecord_smt_sn_location',
							}), search.createColumn({
								name: 'custrecordsmt_sn_qty',
							}), search.createColumn({
								name: 'custrecord_smt_sn_serialized',
							}), search.createColumn({
								name: 'internalid',
							}), search.createColumn({
								name: 'custrecord_smt_sn_part_number_update',
							}), search.createColumn({
								name: 'custrecord_smt_sn_serial',
							}), search.createColumn({
								name: 'custrecord_stu_invstatus',
								join: 'custrecord_smt_sn_testupdate'
							}), search.createColumn({
								name: 'custrecord_smart_testing_bin',
								join: 'custrecord_smt_sn_testupdate'
							}), search.createColumn({
								name: 'custrecord_smt_receipt',
								join: 'custrecord_smt_sn_smart_testing'
							}), search.createColumn({
								name: 'custrecord_smt_tester',
								join: 'custrecord_smt_sn_smart_testing'
							}), search.createColumn({
								name: 'custrecord_smt_sn_original_transaction',
							}), search.createColumn({
								name: 'custrecord_smt_sn_original_cf',
							})]
						}).run().getRange(0, 1000);
						if (STLineSearch != null && STLineSearch != '' && STLineSearch != undefined) {
							try {
							
								var STLineArray = new Array();
								
								
								var o_SMT_OBJ = record.create({
									type: 'customrecord_smt',
									isDynamic: true
								});
								
								o_SMT_OBJ.setValue('custrecord_smt_status', 5);
								o_SMT_OBJ.setValue('custrecord_smt_linkedsmt', SmartTestingID);
								//o_SMT_OBJ.setValue('custrecord_smt_receipt', RequestrecId);
								o_SMT_OBJ.setValue('custrecord_smt_location', Location);
								
								var DatetimeSearch = search.load({
									id: 'customsearch_serarch_current_dt'
								});
								
								var resultSet = DatetimeSearch.run();
								var firstResult = resultSet.getRange({
									start: 0,
									end: 1
								})[0];
								
								// get the value of the second column (zero-based index)
								var CurDateTime = firstResult.getValue(resultSet.columns[0]);
								
								log.debug({
									title: 'CurDateTime:',
									details: CurDateTime
								});
								
								var parsedDateStringAsRawDateObject = format.parse({
									value: CurDateTime,
									type: format.Type.DATETIME,
									timezone: format.Timezone.AMERICA_NEW_YORK
								});
								log.debug('parsedDateStringAsRawDateObject Fileid', parsedDateStringAsRawDateObject.toDateString());
								
								o_SMT_OBJ.setValue('custrecord_smt_start_testing', parsedDateStringAsRawDateObject);
								
								
								
								for (var r = 0; r < STLineSearch.length; r++) {
								
									var internalid = STLineSearch[r].getValue({
										name: 'internalid',
									});
									
									STLineArray.push(internalid);
									
									var Isserial = STLineSearch[r].getValue({
										name: 'custrecord_smt_sn_serialized',
									});
									log.debug('Isserial', Isserial);
									
									var Quantity = STLineSearch[r].getValue({
										name: 'custrecordsmt_sn_qty',
									});
									
									
									var TOItem = STLineSearch[r].getValue({
										name: 'custrecord_smt_sn_part_number_update',
									});
									
									var ToSerial = STLineSearch[r].getValue({
										name: 'custrecord_smt_sn_serial',
									});
									
									var tostatus = STLineSearch[r].getValue({
										name: 'custrecord_stu_invstatus',
										join: 'custrecord_smt_sn_testupdate'
									});
									
									var tobin = STLineSearch[r].getValue({
										name: 'custrecord_smart_testing_bin',
										join: 'custrecord_smt_sn_testupdate'
									});
									
									var tolocation = STLineSearch[r].getValue({
										name: 'custrecord_smt_sn_location',
									});
									
									var OriginalTran = STLineSearch[r].getValue({
										name: 'custrecord_smt_sn_original_transaction',
									});
									var OriginalCreatedFrom = STLineSearch[r].getValue({
										name: 'custrecord_smt_sn_original_cf',
									});
									
									if (Isserial == true) {
										o_SMT_OBJ.selectNewLine({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing'
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_item',
											value: TOItem,
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_sn',
											value: ToSerial,
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_serial',
											value: ToSerial,
										});
										
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_part_number_update',
											value: TOItem,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_inventory_status',
											value: tostatus,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_bin',
											value: tobin,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecordsmt_sn_qty',
											value: 1,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_serialized',
											value: true,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_location',
											value: Location,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_createdfromsmt',
											value: internalid,
										});
										
										if (OriginalTran != null && OriginalTran != '' && OriginalTran != undefined) {
											o_SMT_OBJ.setCurrentSublistValue({
												sublistId: 'recmachcustrecord_smt_sn_smart_testing',
												fieldId: 'custrecord_smt_sn_original_transaction',
												value: OriginalTran,
											});
										}
										if (OriginalCreatedFrom != null && OriginalCreatedFrom != '' && OriginalCreatedFrom != undefined) {
											o_SMT_OBJ.setCurrentSublistValue({
												sublistId: 'recmachcustrecord_smt_sn_smart_testing',
												fieldId: 'custrecord_smt_sn_original_cf',
												value: OriginalCreatedFrom,
											});
										}
										
										o_SMT_OBJ.commitLine({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing'
										});
									}
									else {
										o_SMT_OBJ.selectNewLine({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing'
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_item',
											value: TOItem,
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_part_number_update',
											value: TOItem,
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_sn',
											value: 'NON-SERIALIZED',
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_serial',
											value: 'NON-SERIALIZED',
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_inventory_status',
											value: tostatus,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_bin',
											value: tobin,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecordsmt_sn_qty',
											value: Quantity,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_serialized',
											value: false,
										});
										
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_location',
											value: Location,
										});
										o_SMT_OBJ.setCurrentSublistValue({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing',
											fieldId: 'custrecord_smt_sn_createdfromsmt',
											value: internalid,
										});
										
										if (OriginalTran != null && OriginalTran != '' && OriginalTran != undefined) {
											o_SMT_OBJ.setCurrentSublistValue({
												sublistId: 'recmachcustrecord_smt_sn_smart_testing',
												fieldId: 'custrecord_smt_sn_original_transaction',
												value: OriginalTran,
											});
										}
										if (OriginalCreatedFrom != null && OriginalCreatedFrom != '' && OriginalCreatedFrom != undefined) {
											o_SMT_OBJ.setCurrentSublistValue({
												sublistId: 'recmachcustrecord_smt_sn_smart_testing',
												fieldId: 'custrecord_smt_sn_original_cf',
												value: OriginalCreatedFrom,
											});
										}
										
										o_SMT_OBJ.commitLine({
											sublistId: 'recmachcustrecord_smt_sn_smart_testing'
										});
									}
								}
								var SmartTestRec = o_SMT_OBJ.save({
									enableSourcing: true,
									ignoreMandatoryFields: true
								});
								log.debug('SmartTestRec', SmartTestRec);
								
								UpdateSmartTestingRecord(SmartTestRec, SmartTestingID, STLineArray)
								
								
							} 
							catch (ex) {
								log.debug('Inter SMT Create Error', '--> ' + ex);
							}
						}
					}
				}
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		function UpdateSmartTestingRecord(TransactionID, STrecId, UpdateLineDetail){
			var recObj = record.load({
				type: 'customrecord_smt',
				id: STrecId,
				isDynamic: true
			});
			
			var numLines = recObj.getLineCount({
				sublistId: 'recmachcustrecord_smt_sn_smart_testing'
			});
			
			for (var i = 0; i < numLines; i++) {
				var LineId = recObj.getSublistValue({
					sublistId: 'recmachcustrecord_smt_sn_smart_testing',
					fieldId: 'id',
					line: i
				})
				
				if (UpdateLineDetail.indexOf(LineId) >= 0) {
					recObj.selectLine({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						line: i,
					});
					
					
					recObj.setCurrentSublistValue({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						fieldId: 'custrecord_smt_sn_nextstagesmtrec',
						value: TransactionID
					})
					
					recObj.commitLine({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing'
					});
				}
			}
			var UpdatedSmartTestID = recObj.save({
				enableSourcing: true,
				ignoreMandatoryFields: true
			});
			log.debug('UpdatedSmartTestID', UpdatedSmartTestID);
		}
		return {
			execute: executecreatenextstagesmarttesting
		};
	});