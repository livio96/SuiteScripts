/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record','N/search','N/runtime','N/format'],
    function(record, search, runtime, format){
		function onRequestSmartTesting(context){
			try {
				var RequestrecId = context.request.parameters.shiprequestid;
				var UserID = context.request.parameters.userid;
				log.debug('RequestrecId', RequestrecId)
				
				var ItemRec_Obj = record.load({
					type: 'itemreceipt',
					id: RequestrecId,
					isDynamic: true
				});
				
				var TransferOrder = ItemRec_Obj.getValue('createdfrom');
				
				var TransType = '';
				var Location = '';
				var TransTypeSearch = search.create({
					type: 'transaction',
					filters: [['internalid', 'anyOf', TransferOrder], "AND", ['mainline', 'is', 'T']],
					columns: [search.createColumn({
						name: 'type'
					})]
				}).run().getRange(0, 1);
				if (TransTypeSearch != null && TransTypeSearch != '' && TransTypeSearch != undefined) {
				
					TransType = TransTypeSearch[0].getValue({
						name: 'type',
					});
				}
				log.debug('TransType', TransType)
				if (TransType == 'RtnAuth') {
					var TO_Obj = record.load({
						type: 'returnauthorization',
						id: TransferOrder,
						isDynamic: true
					});
					
					Location = TO_Obj.getValue('location');
					
				}
				else {
					var TO_Obj = record.load({
						type: 'transferorder',
						id: TransferOrder,
						isDynamic: true
					});
					
					Location = TO_Obj.getValue('transferlocation');
					
				}
				
				
				
				var UpdateLocation = false;
				
				var IR_numLines = ItemRec_Obj.getLineCount({
					sublistId: 'item'
				});
				
				var o_SMT_OBJ = record.create({
					type: 'customrecord_smt',
					isDynamic: true
				});
				
				o_SMT_OBJ.setValue('custrecord_smt_status', 5);
				o_SMT_OBJ.setValue('custrecord_smt_tester', UserID);
				o_SMT_OBJ.setValue('custrecord_smt_receipt', RequestrecId);
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
				
				//o_SMT_OBJ.setValue('custrecord_smt_start_testing', new Date());
				
				for (var p = 0; p < IR_numLines; p++) {
					var item = ItemRec_Obj.getSublistValue({
						sublistId: 'item',
						fieldId: 'item',
						line: p
					});
					
					var Iserial = ItemRec_Obj.getSublistValue({
						sublistId: 'item',
						fieldId: 'isserial',
						line: p
					});
					log.debug('Iserial', Iserial)
					
					ItemRec_Obj.selectLine({
						sublistId: 'item',
						line: p
					});
					
					if (Iserial == 'T') {
					
						var subrec = ItemRec_Obj.getCurrentSublistSubrecord({
							sublistId: 'item',
							fieldId: 'inventorydetail'
						});
						
						log.debug('subrec', subrec)
						
						var SublistnumLines = subrec.getLineCount({
							sublistId: 'inventoryassignment'
						});
						
						for (var sl = 0; sl < SublistnumLines; sl++) {
							var SerialNo = subrec.getSublistValue({
								sublistId: 'inventoryassignment',
								fieldId: 'receiptinventorynumber',
								line: sl
							});
							
							var BinNumber = subrec.getSublistValue({
								sublistId: 'inventoryassignment',
								fieldId: 'binnumber',
								line: sl
							});
							
							var InvStatus = subrec.getSublistValue({
								sublistId: 'inventoryassignment',
								fieldId: 'inventorystatus',
								line: sl
							});
							
							o_SMT_OBJ.selectNewLine({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing'
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_item',
								value: item,
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_sn',
								value: SerialNo,
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_serial',
								value: SerialNo,
							});
							
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_part_number_update',
								value: item,
							});
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_inventory_status',
								value: InvStatus,
							});
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_bin',
								value: BinNumber,
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
								fieldId: 'custrecord_smt_sn_original_transaction',
								value: RequestrecId,
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_original_cf',
								value: TransferOrder,
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_location',
								value: Location,
							});
							
							o_SMT_OBJ.commitLine({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing'
							});
						}
					}
					else {
						var subrec = ItemRec_Obj.getCurrentSublistSubrecord({
							sublistId: 'item',
							fieldId: 'inventorydetail'
						});
						
						log.debug('subrec', subrec)
						
						var SublistnumLines = subrec.getLineCount({
							sublistId: 'inventoryassignment'
						});
						
						for (var sl = 0; sl < SublistnumLines; sl++) {
						
							var BinNumber = subrec.getSublistValue({
								sublistId: 'inventoryassignment',
								fieldId: 'binnumber',
								line: sl
							});
							
							var InvStatus = subrec.getSublistValue({
								sublistId: 'inventoryassignment',
								fieldId: 'inventorystatus',
								line: sl
							});
							
							var Quantity = subrec.getSublistValue({
								sublistId: 'inventoryassignment',
								fieldId: 'quantity',
								line: sl
							});
							
							
							o_SMT_OBJ.selectNewLine({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing'
							});
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_item',
								value: item,
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_part_number_update',
								value: item,
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
								value: InvStatus,
							});
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_bin',
								value: BinNumber,
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
								fieldId: 'custrecord_smt_sn_original_transaction',
								value: RequestrecId,
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_original_cf',
								value: TransferOrder,
							});
							
							o_SMT_OBJ.setCurrentSublistValue({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing',
								fieldId: 'custrecord_smt_sn_location',
								value: Location,
							});
							o_SMT_OBJ.commitLine({
								sublistId: 'recmachcustrecord_smt_sn_smart_testing'
							});
						}
					}
				}
				var SmartTestRec = o_SMT_OBJ.save({
					enableSourcing: true,
					ignoreMandatoryFields: true
				});
				log.debug('SmartTestRec', SmartTestRec);
				
				var id = record.submitFields({
					type: 'itemreceipt',
					id: RequestrecId,
					values: {
						custbody_smart_testing: SmartTestRec,
					
					},
					options: {
						enableSourcing: true,
						ignoreMandatoryFields: true
					}
				});
				
				context.response.write("SUCCESS:" + SmartTestRec);
			} 
			catch (error) {
				log.debug('error', error);
				context.response.write("Error :- " + error.message);
			}
		}
		return {
			onRequest: onRequestSmartTesting
		};
	});