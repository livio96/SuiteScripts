/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record','N/search','N/runtime','N/format'],
    function(record, search, runtime, format)
	{
		function onRequestSTAdjustments(context){
			try {
				var STrecId = context.request.parameters.strequestid;
				var SNLineRecID = context.request.parameters.stlinerequestid;
				
				if (STrecId != null && STrecId != '' && STrecId != undefined) {
					var UserID = context.request.parameters.userid;
					log.debug('STrecId', STrecId)
					
					var SmtfieldLookUp = search.lookupFields({
						type: 'customrecord_smt',
						id: STrecId,
						columns: ['custrecord_smt_location']
					});
					
					var Location = SmtfieldLookUp.custrecord_smt_location[0].value;
					log.debug('Location', Location)
					
					CreateInventoryLocationTransfer(STrecId, Location, SNLineRecID)
					CreateInventoryAdjustment(STrecId, Location, SNLineRecID)
					CreateBinTransfer(STrecId, Location, SNLineRecID);
					CreateInventoryStatusChange(STrecId, Location, SNLineRecID);
					UpdateNonChangesApplyRecord(STrecId)
					
					var recObj = record.load({
						type: 'customrecord_smt',
						id: STrecId,
						isDynamic: true
					});
					
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
					
					
					var STStatusSearch = search.create({
						type: 'customrecord_smt_sn',
						filters: [['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId]],
						columns: [search.createColumn({
							name: 'internalid',
						})]
					}).run().getRange(0, 1000);
					if (STStatusSearch != null && STStatusSearch != '' && STStatusSearch != undefined) {
						recObj.setValue('custrecord_smt_status', 5);
					}
					else {
						recObj.setValue('custrecord_smt_status', 9);
					}
					
					//recObj.setValue('custrecord_smt_status', 9);
					recObj.setValue('custrecord_smt_complete_testing', parsedDateStringAsRawDateObject);
					
					
					var UpdatedSmartTestID = recObj.save({
						enableSourcing: true,
						ignoreMandatoryFields: true
					});
					log.debug('UpdatedSmartTestID', UpdatedSmartTestID);
					
				}
				context.response.write("Smart Testing Record Created Succesfully");
			} 
			catch (error) {
				log.debug('error', error);
				context.response.write("Error :- " + error.message);
			}
		}
		function CreateInventoryLocationTransfer(STrecId, Location, SNLineRecID){
			var CreatebinTransfer = false;
			log.debug('Inside Transfer');
			//=================================Begin : Create Bin Transfer Record ======================//	
			var InventoryLocFilterExp = [['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", ['custrecord_smt_sn_location', 'noneOf', Location]];
			
			if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
				var InventoryLocFilterExp = [['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", ['custrecord_smt_sn_location', 'noneOf', Location]];
			}
			
			var HeaderInvLocationSearch = search.create({
				type: 'customrecord_smt_sn',
				filters: InventoryLocFilterExp,
				columns: [search.createColumn({
					name: 'custrecord_smt_sn_location',
				}), search.createColumn({
					name: 'custrecord_smt_sn_item',
				}), search.createColumn({
					name: 'custrecord_smt_sn_sn',
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
					name: 'custrecord_smt_sn_inventory_status',
				}), search.createColumn({
					name: 'custrecord_smt_sn_bin',
				}), search.createColumn({
					name: 'custrecord_stu_invstatus',
					join: 'custrecord_smt_sn_testupdate'
				}), search.createColumn({
					name: 'custrecord_smart_testing_bin',
					join: 'custrecord_smt_sn_testupdate'
				}), search.createColumn({
					name: 'custrecordsmt_sn_qty',
				})]
			}).run().getRange(0, 1000);
			if (HeaderInvLocationSearch != null && HeaderInvLocationSearch != '' && HeaderInvLocationSearch != undefined) {
				CreatebinTransfer = true;
				var InvStatusArray = new Array();
				
				
				var o_InvTrans_OBJ = record.create({
					type: 'inventoryadjustment',
					isDynamic: true
				});
				
				o_InvTrans_OBJ.setValue('subsidiary', 1)
				o_InvTrans_OBJ.setValue('account', 154)
				o_InvTrans_OBJ.setValue('adjlocation', Location)
				o_InvTrans_OBJ.setValue('custbody_smart_testing', STrecId)
				
				for (var r = 0; r < HeaderInvLocationSearch.length; r++) {
				
					var internalid = HeaderInvLocationSearch[r].getValue({
						name: 'internalid',
					});
					
					InvStatusArray.push(internalid);
					
					var Item = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_item',
					});
					
					var SerialNo = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_sn',
					});
					
					log.debug('serial No' + SerialNo)
					
					
					var Isserial = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_serialized',
					});
					
					var Quantity = HeaderInvLocationSearch[r].getValue({
						name: 'custrecordsmt_sn_qty',
					});
					
					var status = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_inventory_status',
					});
					
					var bin = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_bin',
					});
					
					
					var TOItem = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_part_number_update',
					});
					
					var ToSerial = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_serial',
					});
					
					var tostatus = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_stu_invstatus',
						join: 'custrecord_smt_sn_testupdate'
					});
					
					var tobin = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smart_testing_bin',
						join: 'custrecord_smt_sn_testupdate'
					});
					
					var tolocation = HeaderInvLocationSearch[r].getValue({
						name: 'custrecord_smt_sn_location',
					});
					
					
					o_InvTrans_OBJ.selectNewLine({
						sublistId: 'inventory'
					});
					
					o_InvTrans_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'item',
						value: Item,
					});
					
					o_InvTrans_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'adjustqtyby',
						value: -(Quantity),
					});
					
					o_InvTrans_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'location',
						value: Location,
					});
					
					var UnitCost = o_InvTrans_OBJ.getCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'unitcost',
					});
					log.debug('UnitCost', UnitCost);
					
					var subrec = o_InvTrans_OBJ.getCurrentSublistSubrecord({
						sublistId: 'inventory',
						fieldId: 'inventorydetail'
					});
					
					if (Isserial == true) {
						subrec.selectNewLine({
							sublistId: 'inventoryassignment',
						});
						
						subrec.setCurrentSublistText({
							sublistId: 'inventoryassignment',
							fieldId: 'issueinventorynumber',
							text: SerialNo,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						/*
		 subrec.setCurrentSublistValue({
		 sublistId: 'inventoryassignment',
		 fieldId: 'binnumber',
		 value: bin,
		 ignoreFieldChange: false,
		 forceSyncSourcing: true
		 });
		 
		 	 */
		 subrec.setCurrentSublistValue({
		 sublistId: 'inventoryassignment',
		 fieldId: 'inventorystatus',
		 value: status,
		 ignoreFieldChange: false,
		 forceSyncSourcing: true
		 });
	
						subrec.commitLine({
							sublistId: 'inventoryassignment'
						});
					}
					else {
						subrec.selectNewLine({
							sublistId: 'inventoryassignment',
						});
						
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'binnumber',
							value: bin,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'quantity',
							value: Quantity,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						subrec.commitLine({
							sublistId: 'inventoryassignment'
						});
					}
					o_InvTrans_OBJ.commitLine({
						sublistId: 'inventory'
					});
					
					
					var INVALines = o_InvTrans_OBJ.getLineCount({
							sublistId: 'inventory'
						});
						
						for (var g = 0; g < INVALines; g++) 
						{
							var InvA_ItemId = o_InvTrans_OBJ.getSublistValue({
								sublistId: 'inventory',
								fieldId: 'item',
								line: g
							})
							
							var InvA_unitCost = o_InvTrans_OBJ.getSublistValue({
								sublistId: 'inventory',
								fieldId: 'unitcost',
								line: g
							})
							
							if (InvA_ItemId == Item) 
							{
								UnitCost = InvA_unitCost;
								break;
							}
						}
						log.debug('sUnitCost' + UnitCost)
					
					
					//======================Positive Adjsutment==================//
					o_InvTrans_OBJ.selectNewLine({
						sublistId: 'inventory'
					});
					
					o_InvTrans_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'item',
						value: TOItem,
					});
					
					o_InvTrans_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'location',
						value: tolocation,
					});
					
					o_InvTrans_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'adjustqtyby',
						value: Quantity,
					});
					
					o_InvTrans_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'unitcost',
						value: UnitCost,
					});
					
					
					var subrec = o_InvTrans_OBJ.getCurrentSublistSubrecord({
						sublistId: 'inventory',
						fieldId: 'inventorydetail'
					});
					
					if (Isserial == true) {
						subrec.selectNewLine({
							sublistId: 'inventoryassignment',
						});
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'receiptinventorynumber',
							value: ToSerial,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'binnumber',
							value: tobin,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'inventorystatus',
							value: tostatus,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						subrec.commitLine({
							sublistId: 'inventoryassignment'
						});
					}
					else {
						subrec.selectNewLine({
							sublistId: 'inventoryassignment',
						});
						
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'binnumber',
							value: tobin,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'inventorystatus',
							value: tostatus,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						subrec.setCurrentSublistValue({
							sublistId: 'inventoryassignment',
							fieldId: 'quantity',
							value: Quantity,
							ignoreFieldChange: false,
							forceSyncSourcing: true
						});
						
						subrec.commitLine({
							sublistId: 'inventoryassignment'
						});
					}
					o_InvTrans_OBJ.commitLine({
						sublistId: 'inventory'
					});
					
				}
				
				var InvTransfer = o_InvTrans_OBJ.save({
					enableSourcing: true,
					ignoreMandatoryFields: true
				});
				log.debug('InvTransfer', InvTransfer);
				
				UpdateSmartTestingRecord(InvTransfer, STrecId, InvStatusArray, SNLineRecID)
			}
		//=================================End : Create Adjsutment Location Transfer Record==============//
		}
		
		function CreateInventoryStatusChange(STrecId, Location, SNLineRecID){
		
			var CreatebinTransfer = false;
			
			var MainStatusChangeFilter = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} = {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_stu_invstatus} != {custrecord_smt_sn_inventory_status} then 1 else 0 end", "equalto", 1]]];
			
			if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
				MainStatusChangeFilter = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} = {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_stu_invstatus} != {custrecord_smt_sn_inventory_status} then 1 else 0 end", "equalto", 1]]];
			}
			
			//=================================Begin : Create Bin Transfer Record ======================//		
			var HeaderInvStatusSearch = search.create({
				type: 'customrecord_smt_sn',
				filters: MainStatusChangeFilter,
				columns: [search.createColumn({
					name: 'custrecord_stu_invstatus',
					join: 'custrecord_smt_sn_testupdate',
					summary: 'group'
				}), search.createColumn({
					name: 'custrecord_smt_sn_inventory_status',
					summary: 'group'
				})]
			}).run().getRange(0, 1000);
			if (HeaderInvStatusSearch != null && HeaderInvStatusSearch != '' && HeaderInvStatusSearch != undefined) {
				for (var r = 0; r < HeaderInvStatusSearch.length; r++) {
				
					var FromStatus = HeaderInvStatusSearch[r].getValue({
						name: 'custrecord_smt_sn_inventory_status',
						summary: 'group'
					});
					
					var ToStatus = HeaderInvStatusSearch[r].getValue({
						name: 'custrecord_stu_invstatus',
						join: 'custrecord_smt_sn_testupdate',
						summary: 'group'
					});
					
					var InvStatusArray = new Array();
					
					var o_InvStatusCh_OBJ = record.create({
						type: 'inventorystatuschange',
						isDynamic: true
					});
					
					o_InvStatusCh_OBJ.setValue('location', Location)
					o_InvStatusCh_OBJ.setValue('previousstatus', FromStatus)
					o_InvStatusCh_OBJ.setValue('revisedstatus', ToStatus)
					o_InvStatusCh_OBJ.setValue('custbody_smart_testing', STrecId)
					
					
					var InvStatusExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_testupdate.custrecord_stu_invstatus', 'anyOf', ToStatus], "AND", ['custrecord_smt_sn_inventory_status', 'anyOf', FromStatus], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} = {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_stu_invstatus} != {custrecord_smt_sn_inventory_status} then 1 else 0 end", "equalto", 1]]]
					
					if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
						InvStatusExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_testupdate.custrecord_stu_invstatus', 'anyOf', ToStatus], "AND", ['custrecord_smt_sn_inventory_status', 'anyOf', FromStatus], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} = {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_stu_invstatus} != {custrecord_smt_sn_inventory_status} then 1 else 0 end", "equalto", 1]]]
					}
					
					var InStatusSearch = search.create({
						type: 'customrecord_smt_sn',
						filters: InvStatusExp,
						columns: [search.createColumn({
							name: 'custrecord_smt_sn_item',
							summary: 'group'
						}), search.createColumn({
							name: 'custrecord_smt_sn_sn',
							summary: 'count'
						}), search.createColumn({
							name: 'custrecordsmt_sn_qty',
							summary: 'sum'
						}), search.createColumn({
							name: 'custrecord_smt_sn_serialized',
							summary: 'group'
						})]
					}).run().getRange(0, 1000);
					if (InStatusSearch != null && InStatusSearch != '' && InStatusSearch != undefined) {
						for (var q = 0; q < InStatusSearch.length; q++) {
							log.debug('Remove Item & Serial')
							CreatebinTransfer = true;
							
							var Item = InStatusSearch[q].getValue({
								name: 'custrecord_smt_sn_item',
								summary: 'group'
							});
							
							var Quantity = InStatusSearch[q].getValue({
								name: 'custrecord_smt_sn_sn',
								summary: 'count'
							});
							
							var Isserial = InStatusSearch[q].getValue({
								name: 'custrecord_smt_sn_serialized',
								summary: 'group'
							});
							
							var NonSerialQuantity = InStatusSearch[q].getValue({
								name: 'custrecordsmt_sn_qty',
								summary: 'sum'
							});
							
							o_InvStatusCh_OBJ.selectNewLine({
								sublistId: 'inventory'
							});
							
							o_InvStatusCh_OBJ.setCurrentSublistValue({
								sublistId: 'inventory',
								fieldId: 'item',
								value: Item,
							});
							
							if (Isserial == true) {
								o_InvStatusCh_OBJ.setCurrentSublistValue({
									sublistId: 'inventory',
									fieldId: 'quantity',
									value: Quantity,
								});
							}
							else {
								o_InvStatusCh_OBJ.setCurrentSublistValue({
									sublistId: 'inventory',
									fieldId: 'quantity',
									value: NonSerialQuantity,
								});
							}
							
							var subrec = o_InvStatusCh_OBJ.getCurrentSublistSubrecord({
								sublistId: 'inventory',
								fieldId: 'inventorydetail'
							});
							
							var LineStatusExpression = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_testupdate.custrecord_stu_invstatus', 'anyOf', ToStatus], "AND", ['custrecord_smt_sn_inventory_status', 'anyOf', FromStatus], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} = {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_stu_invstatus} != {custrecord_smt_sn_inventory_status} then 1 else 0 end", "equalto", 1]]]
							
							if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
								LineStatusExpression = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_testupdate.custrecord_stu_invstatus', 'anyOf', ToStatus], "AND", ['custrecord_smt_sn_inventory_status', 'anyOf', FromStatus], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} = {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_stu_invstatus} != {custrecord_smt_sn_inventory_status} then 1 else 0 end", "equalto", 1]]]
							}
							
							var Line_InStatusSearch = search.create({
								type: 'customrecord_smt_sn',
								filters: LineStatusExpression,
								columns: [search.createColumn({
									name: 'internalid',
								}), search.createColumn({
									name: 'custrecord_smt_sn_item',
								}), search.createColumn({
									name: 'custrecord_smt_sn_sn',
								}), search.createColumn({
									name: 'custrecord_smt_sn_inventory_status',
								}), search.createColumn({
									name: 'custrecord_smt_sn_bin',
								}), search.createColumn({
									name: 'custrecord_stu_invstatus',
									join: 'custrecord_smt_sn_testupdate'
								}), search.createColumn({
									name: 'custrecord_smart_testing_bin',
									join: 'custrecord_smt_sn_testupdate'
								}), search.createColumn({
									name: 'custrecordsmt_sn_qty',
								})]
							}).run().getRange(0, 1000);
							if (Line_InStatusSearch != null && Line_InStatusSearch != '' && Line_InStatusSearch != undefined) {
								for (var l = 0; l < Line_InStatusSearch.length; l++) {
								
									var internalid = Line_InStatusSearch[l].getValue({
										name: 'internalid',
									});
									
									InvStatusArray.push(internalid);
									
									var SerialNo = Line_InStatusSearch[l].getValue({
										name: 'custrecord_smt_sn_sn',
									});
									
									log.debug('serial No' + SerialNo)
									
									var status = Line_InStatusSearch[l].getValue({
										name: 'custrecord_smt_sn_inventory_status',
									});
									
									var bin = Line_InStatusSearch[l].getValue({
										name: 'custrecord_smt_sn_bin',
									});
									
									var tostatus = Line_InStatusSearch[l].getValue({
										name: 'custrecord_stu_invstatus',
										join: 'custrecord_smt_sn_testupdate'
									});
									
									var tobin = Line_InStatusSearch[l].getValue({
										name: 'custrecord_smart_testing_bin',
										join: 'custrecord_smt_sn_testupdate'
									});
									
									var NonSerialQty = Line_InStatusSearch[l].getValue({
										name: 'custrecordsmt_sn_qty',
									});
									
									
									if (Isserial == true) {
										subrec.selectNewLine({
											sublistId: 'inventoryassignment',
										});
										
										subrec.setCurrentSublistText({
											sublistId: 'inventoryassignment',
											fieldId: 'issueinventorynumber',
											text: SerialNo,
											ignoreFieldChange: false,
											forceSyncSourcing: true
										});
										
										subrec.setCurrentSublistValue({
											sublistId: 'inventoryassignment',
											fieldId: 'binnumber',
											value: bin,
											ignoreFieldChange: false,
											forceSyncSourcing: true
										});
										
										
										subrec.commitLine({
											sublistId: 'inventoryassignment'
										});
									}
									else {
										subrec.selectNewLine({
											sublistId: 'inventoryassignment',
										});
										
										
										subrec.setCurrentSublistValue({
											sublistId: 'inventoryassignment',
											fieldId: 'binnumber',
											value: bin,
											ignoreFieldChange: false,
											forceSyncSourcing: true
										});
										
										subrec.setCurrentSublistValue({
											sublistId: 'inventoryassignment',
											fieldId: 'quantity',
											value: NonSerialQty,
											ignoreFieldChange: false,
											forceSyncSourcing: true
										});
										
										subrec.commitLine({
											sublistId: 'inventoryassignment'
										});
									}
								}
							}
							o_InvStatusCh_OBJ.commitLine({
								sublistId: 'inventory'
							});
						}
					}
					var InvStatusChnage = o_InvStatusCh_OBJ.save({
						enableSourcing: true,
						ignoreMandatoryFields: true
					});
					log.debug('InvStatusChnage', InvStatusChnage);
					
					UpdateSmartTestingRecord(InvStatusChnage, STrecId, InvStatusArray, SNLineRecID)
				}
			//=================================End : Create Bin Transfer Record==============//
			}
		}
		function CreateBinTransfer(STrecId, Location, SNLineRecID){
			var BinTransferArray = new Array();
			var CreatebinTransfer = false;
			var o_binTransfer_OBJ = record.create({
				type: 'bintransfer',
				isDynamic: true
			});
			
			o_binTransfer_OBJ.setValue('location', Location)
			o_binTransfer_OBJ.setValue('custbody_smart_testing', STrecId)
			//=================================Begin : Create Bin Transfer Record ==============//
			
			var MainBinTransferExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} != {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]]
			
			if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
				MainBinTransferExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} != {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]]
			}
			
			var BinTransferSearch = search.create({
				type: 'customrecord_smt_sn',
				filters: MainBinTransferExp,
				columns: [search.createColumn({
					name: 'custrecord_smt_sn_item',
					summary: 'group'
				}), search.createColumn({
					name: 'custrecord_smt_sn_sn',
					summary: 'count'
				}), search.createColumn({
					name: 'custrecordsmt_sn_qty',
					summary: 'sum'
				}), search.createColumn({
					name: 'custrecord_smt_sn_serialized',
					summary: 'group'
				})]
			}).run().getRange(0, 1000);
			if (BinTransferSearch != null && BinTransferSearch != '' && BinTransferSearch != undefined) {
				for (var q = 0; q < BinTransferSearch.length; q++) {
					log.debug('Remove Item & Serial')
					CreatebinTransfer = true;
					
					var Item = BinTransferSearch[q].getValue({
						name: 'custrecord_smt_sn_item',
						summary: 'group'
					});
					
					var Quantity = BinTransferSearch[q].getValue({
						name: 'custrecordsmt_sn_qty',
						summary: 'sum'
					});
					
					var NonSerialQuantity = BinTransferSearch[q].getValue({
						name: 'custrecordsmt_sn_qty',
						summary: 'sum'
					});
					
					var Isserial = BinTransferSearch[q].getValue({
						name: 'custrecord_smt_sn_serialized',
						summary: 'group'
					});
					
					
					o_binTransfer_OBJ.selectNewLine({
						sublistId: 'inventory'
					});
					
					o_binTransfer_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'item',
						value: Item,
					});
					
					if (Isserial == true) {
						o_binTransfer_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'quantity',
							value: Quantity,
						});
					}
					else {
						o_binTransfer_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'quantity',
							value: NonSerialQuantity,
						});
					}
					
					var subrec = o_binTransfer_OBJ.getCurrentSublistSubrecord({
						sublistId: 'inventory',
						fieldId: 'inventorydetail'
					});
					
					var LineBinExpression = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} != {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
					
					if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
						LineBinExpression = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_testupdate.custrecord_smart_testing_bin} != {custrecord_smt_sn_bin} then 1 else 0 end", "equalto", 1], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} = {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
					}
					
					var Line_BinTransferSearch = search.create({
						type: 'customrecord_smt_sn',
						filters: LineBinExpression,
						columns: [search.createColumn({
							name: 'internalid',
						}), search.createColumn({
							name: 'custrecord_smt_sn_item',
						}), search.createColumn({
							name: 'custrecord_smt_sn_sn',
						}), search.createColumn({
							name: 'custrecord_smt_sn_inventory_status',
						}), search.createColumn({
							name: 'custrecord_smt_sn_bin',
						}), search.createColumn({
							name: 'custrecord_stu_invstatus',
							join: 'custrecord_smt_sn_testupdate'
						}), search.createColumn({
							name: 'custrecord_smart_testing_bin',
							join: 'custrecord_smt_sn_testupdate'
						}), search.createColumn({
							name: 'custrecordsmt_sn_qty',
						})]
					}).run().getRange(0, 1000);
					if (Line_BinTransferSearch != null && Line_BinTransferSearch != '' && Line_BinTransferSearch != undefined) {
						for (var l = 0; l < Line_BinTransferSearch.length; l++) {
						
							var BinLineId = Line_BinTransferSearch[l].getValue({
								name: 'internalid',
							});
							
							BinTransferArray.push(BinLineId);
							
							var SerialNo = Line_BinTransferSearch[l].getValue({
								name: 'custrecord_smt_sn_sn',
							});
							
							log.debug('serial No' + SerialNo)
							
							var status = Line_BinTransferSearch[l].getValue({
								name: 'custrecord_smt_sn_inventory_status',
							});
							
							var bin = Line_BinTransferSearch[l].getValue({
								name: 'custrecord_smt_sn_bin',
							});
							
							var tostatus = Line_BinTransferSearch[l].getValue({
								name: 'custrecord_stu_invstatus',
								join: 'custrecord_smt_sn_testupdate'
							});
							
							var tobin = Line_BinTransferSearch[l].getValue({
								name: 'custrecord_smart_testing_bin',
								join: 'custrecord_smt_sn_testupdate'
							});
							
							var NonSerialQty = Line_BinTransferSearch[l].getValue({
								name: 'custrecordsmt_sn_qty',
							});
							
							if (Isserial == true) {
							
								subrec.selectNewLine({
									sublistId: 'inventoryassignment',
								});
								
								subrec.setCurrentSublistText({
									sublistId: 'inventoryassignment',
									fieldId: 'issueinventorynumber',
									text: SerialNo,
									ignoreFieldChange: false,
									forceSyncSourcing: true
								});
								
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'binnumber',
									value: bin
								});
								
								
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'inventorystatus',
									value: status
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'tobinnumber',
									value: tobin
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'toinventorystatus',
									value: tostatus
								});
								
								
								subrec.commitLine({
									sublistId: 'inventoryassignment'
								});
							}
							else {
								subrec.selectNewLine({
									sublistId: 'inventoryassignment',
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'binnumber',
									value: bin
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'inventorystatus',
									value: status
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'tobinnumber',
									value: tobin
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'toinventorystatus',
									value: tostatus
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'quantity',
									value: NonSerialQty
								});
								
								subrec.commitLine({
									sublistId: 'inventoryassignment'
								});
							}
						}
					}
					o_binTransfer_OBJ.commitLine({
						sublistId: 'inventory'
					});
				}
			//=================================End : Create Bin Transfer Record==============//
			}
			if (CreatebinTransfer == true) {
				var BinTransferID = o_binTransfer_OBJ.save({
					enableSourcing: true,
					ignoreMandatoryFields: true
				});
				log.debug('BinTransferID', BinTransferID);
				
				UpdateSmartTestingRecord(BinTransferID, STrecId, BinTransferArray, SNLineRecID)
			}
		}
		
		function CreateInventoryAdjustment(STrecId, Location, SNLineRecID){
			var AdjustmentArray = new Array();
			var CreateAdjustment = false;
			
			var o_InvAdjust_OBJ = record.create({
				type: 'inventoryadjustment',
				isDynamic: true
			});
			
			o_InvAdjust_OBJ.setValue('subsidiary', 1)
			o_InvAdjust_OBJ.setValue('account', 154)
			o_InvAdjust_OBJ.setValue('adjlocation', Location)
			o_InvAdjust_OBJ.setValue('custbody_smart_testing', STrecId)
			// o_InvAdjust_OBJ.setValue('memo', Memo)
			// o_InvAdjust_OBJ.setValue('custbody_inv_adjust_approval', i_recordId)
			
			//=================================Begin : Remove Item With Different Part and Serial Number==============//
			var ItemSerialExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "OR", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
			
			if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
				ItemSerialExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "OR", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
			}
			
			var ItemandSerialSearch = search.create({
				type: 'customrecord_smt_sn',
				filters: ItemSerialExp,
				columns: [search.createColumn({
					name: 'custrecord_smt_sn_item',
					summary: 'group'
				}), search.createColumn({
					name: 'custrecord_smt_sn_sn',
					summary: 'count'
				}), search.createColumn({
					name: 'custrecordsmt_sn_qty',
					summary: 'sum'
				}), search.createColumn({
					name: 'custrecord_smt_sn_serialized',
					summary: 'group'
				})]
			}).run().getRange(0, 1000);
			if (ItemandSerialSearch != null && ItemandSerialSearch != '' && ItemandSerialSearch != undefined) {
				for (var q = 0; q < ItemandSerialSearch.length; q++) {
					log.debug('Remove Item & Serial')
					CreateAdjustment = true;
					
					var Item = ItemandSerialSearch[q].getValue({
						name: 'custrecord_smt_sn_item',
						summary: 'group'
					});
					
					var Quantity = ItemandSerialSearch[q].getValue({
						name: 'custrecord_smt_sn_sn',
						summary: 'count'
					});
					
					var NonSerialQuantity = ItemandSerialSearch[q].getValue({
						name: 'custrecordsmt_sn_qty',
						summary: 'sum'
					});
					
					var Isserial = ItemandSerialSearch[q].getValue({
						name: 'custrecord_smt_sn_serialized',
						summary: 'group'
					});
					
					o_InvAdjust_OBJ.selectNewLine({
						sublistId: 'inventory'
					});
					
					o_InvAdjust_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'item',
						value: Item,
					});
					
					o_InvAdjust_OBJ.setCurrentSublistValue({
						sublistId: 'inventory',
						fieldId: 'location',
						value: Location,
					});
					
					if (Isserial == true) {
						o_InvAdjust_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'adjustqtyby',
							value: -Quantity,
						});
					}
					else {
						o_InvAdjust_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'adjustqtyby',
							value: -NonSerialQuantity,
						});
					}
					
					var subrec = o_InvAdjust_OBJ.getCurrentSublistSubrecord({
						sublistId: 'inventory',
						fieldId: 'inventorydetail'
					});
					
					var LineItemserialExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "OR", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
					
					if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
						LineItemserialExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1], "OR", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
					}
					var Line_ItemandSerialSearch = search.create({
						type: 'customrecord_smt_sn',
						filters: LineItemserialExp,
						columns: [search.createColumn({
							name: 'internalid',
						}), search.createColumn({
							name: 'custrecord_smt_sn_item',
						}), search.createColumn({
							name: 'custrecord_smt_sn_sn',
						}), search.createColumn({
							name: 'custrecord_smt_sn_inventory_status',
						}), search.createColumn({
							name: 'custrecord_smt_sn_bin',
						}), search.createColumn({
							name: 'custrecordsmt_sn_qty',
						})]
					}).run().getRange(0, 1000);
					if (Line_ItemandSerialSearch != null && Line_ItemandSerialSearch != '' && Line_ItemandSerialSearch != undefined) {
						for (var l = 0; l < Line_ItemandSerialSearch.length; l++) {
						
							var AdjustedID = Line_ItemandSerialSearch[l].getValue({
								name: 'internalid',
							});
							
							AdjustmentArray.push(AdjustedID)
							
							var SerialNo = Line_ItemandSerialSearch[l].getValue({
								name: 'custrecord_smt_sn_sn',
							});
							log.debug('adjustment Isserial No' + Isserial)
							log.debug('adjustment serial No' + SerialNo)
							
							var status = Line_ItemandSerialSearch[l].getValue({
								name: 'custrecord_smt_sn_inventory_status',
							});
							
							var bin = Line_ItemandSerialSearch[l].getValue({
								name: 'custrecord_smt_sn_bin',
							});
							
							var NonSerialQuantity = Line_ItemandSerialSearch[l].getValue({
								name: 'custrecordsmt_sn_qty',
							});
							
							if (Isserial == true) {
							
								subrec.selectNewLine({
									sublistId: 'inventoryassignment',
								});
								
								subrec.setCurrentSublistText({
									sublistId: 'inventoryassignment',
									fieldId: 'issueinventorynumber',
									text: SerialNo,
									ignoreFieldChange: false,
									forceSyncSourcing: true
								});
								/*
						 subrec.setCurrentSublistValue({
						 sublistId: 'inventoryassignment',
						 fieldId: 'frombinnumber',
						 value: bin
						 });
						 */
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'inventorystatus',
									value: status
								});
								subrec.commitLine({
									sublistId: 'inventoryassignment'
								});
							}
							else {
								subrec.selectNewLine({
									sublistId: 'inventoryassignment',
								});
								
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'binnumber',
									value: bin
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'inventorystatus',
									value: status
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'quantity',
									value: NonSerialQuantity
								});
								
								subrec.commitLine({
									sublistId: 'inventoryassignment'
								});
							}
						}
					}
					o_InvAdjust_OBJ.commitLine({
						sublistId: 'inventory'
					});
				}
				
				//=================================End : Remove Item With Different Part and Serial Number==============//
				
				//=================================Begin : Add Item With Different Part and Serial Number==============//
				
				var AddItemSearchExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1]]]
				
				if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
					AddItemSearchExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1]]]
				}
				
				var AddItemSearch = search.create({
					type: 'customrecord_smt_sn',
					filters: AddItemSearchExp,
					columns: [search.createColumn({
						name: 'custrecord_smt_sn_item',
						summary: 'group'
					}), search.createColumn({
						name: 'custrecord_smt_sn_part_number_update',
						summary: 'group'
					}), search.createColumn({
						name: 'custrecord_smt_sn_sn',
						summary: 'count'
					}), search.createColumn({
						name: 'custrecordsmt_sn_qty',
						summary: 'sum'
					}), search.createColumn({
						name: 'custrecord_smt_sn_serialized',
						summary: 'group'
					})]
				}).run().getRange(0, 1000);
				if (AddItemSearch != null && AddItemSearch != '' && AddItemSearch != undefined) {
					for (var q = 0; q < AddItemSearch.length; q++) {
					
						log.debug('Add Item & Serial')
						
						var OldItem = AddItemSearch[q].getValue({
							name: 'custrecord_smt_sn_item',
							summary: 'group'
						});
						
						log.debug('Add OldItem & Serial',OldItem)
						
						var Item = AddItemSearch[q].getValue({
							name: 'custrecord_smt_sn_part_number_update',
							summary: 'group'
						});
						
						var Quantity = AddItemSearch[q].getValue({
							name: 'custrecord_smt_sn_sn',
							summary: 'count'
						});
						
						log.debug('Add Quantity & Serial',Quantity)
						
						
						var NonSerialQuantity = AddItemSearch[q].getValue({
							name: 'custrecordsmt_sn_qty',
							summary: 'sum'
						});
						
						var Isserial = AddItemSearch[q].getValue({
							name: 'custrecord_smt_sn_serialized',
							summary: 'group'
						});
						log.debug('Add Isserial & Serial',Isserial)
						
						var UnitCost = 0;
						
						var INVALines = o_InvAdjust_OBJ.getLineCount({
							sublistId: 'inventory'
						});
						
						for (var g = 0; g < INVALines; g++) 
						{
							var InvA_ItemId = o_InvAdjust_OBJ.getSublistValue({
								sublistId: 'inventory',
								fieldId: 'item',
								line: g
							})
							
							var InvA_unitCost = o_InvAdjust_OBJ.getSublistValue({
								sublistId: 'inventory',
								fieldId: 'unitcost',
								line: g
							})
							
							if (InvA_ItemId == OldItem) 
							{
								UnitCost = InvA_unitCost;
								break;
							}
						}
						
						o_InvAdjust_OBJ.selectNewLine({
							sublistId: 'inventory'
						});
						
						o_InvAdjust_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'item',
							value: Item,
						});
						
						o_InvAdjust_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'location',
							value: Location,
						});
						
						if (Isserial == true) {
							o_InvAdjust_OBJ.setCurrentSublistValue({
								sublistId: 'inventory',
								fieldId: 'adjustqtyby',
								value: Quantity,
							});
						}
						else {
							o_InvAdjust_OBJ.setCurrentSublistValue({
								sublistId: 'inventory',
								fieldId: 'adjustqtyby',
								value: NonSerialQuantity,
							});
						}
						
						o_InvAdjust_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'unitcost',
							value: UnitCost
						});
						
						
						var subrec = o_InvAdjust_OBJ.getCurrentSublistSubrecord({
							sublistId: 'inventory',
							fieldId: 'inventorydetail'
						});
						
						var Line_AddItemSearchExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', OldItem], "AND", ['custrecord_smt_sn_part_number_update', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1]]]
						
						if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
							Line_AddItemSearchExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', OldItem], "AND", ['custrecord_smt_sn_part_number_update', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 1]]]
							
							
						}
						
						var Line_AddItemSearch = search.create({
							type: 'customrecord_smt_sn',
							filters: Line_AddItemSearchExp,
							columns: [search.createColumn({
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
								name: 'custrecordsmt_sn_qty',
							})]
						}).run().getRange(0, 1000);
						if (Line_AddItemSearch != null && Line_AddItemSearch != '' && Line_AddItemSearch != undefined) {
							for (var l = 0; l < Line_AddItemSearch.length; l++) {
							
								log.debug('inside line add Item & Serial')
								
								var SerialNo = Line_AddItemSearch[l].getValue({
									name: 'custrecord_smt_sn_serial',
								});
								log.debug('inside line add Item & Serial SerialNo', SerialNo)
								
								var status = Line_AddItemSearch[l].getValue({
									name: 'custrecord_stu_invstatus',
									join: 'custrecord_smt_sn_testupdate'
								});
								
								log.debug('inside line add Item & Serial status', status)
								
								var bin = Line_AddItemSearch[l].getValue({
									name: 'custrecord_smart_testing_bin',
									join: 'custrecord_smt_sn_testupdate'
								});
								
								var NonSerialQuantity = Line_AddItemSearch[l].getValue({
									name: 'custrecordsmt_sn_qty',
								});
								
								if (Isserial == true) {
									log.debug('inside line add Item & Isserial Isserial', Isserial)
									
									
									subrec.selectNewLine({
										sublistId: 'inventoryassignment',
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'receiptinventorynumber',
										value: SerialNo
									});
									
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'binnumber',
										value: bin
									});
									
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'inventorystatus',
										value: status
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'quantity',
										value: 1
									});
									
									subrec.commitLine({
										sublistId: 'inventoryassignment'
									});
									
									log.debug('inside line add Item & Isserial commit line')
									
								}
								else {
									subrec.selectNewLine({
										sublistId: 'inventoryassignment',
									});
									
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'binnumber',
										value: bin
									});
									
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'inventorystatus',
										value: status
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'quantity',
										value: NonSerialQuantity
									});
									
									subrec.commitLine({
										sublistId: 'inventoryassignment'
									});
								}
							}
							
							o_InvAdjust_OBJ.commitLine({
								sublistId: 'inventory'
							});
							
							log.debug('inside line add main commit Item & Serial status')
								
						}
					}
				}
				//=================================End : Add Item With Different Part and Serial Number==============//
				
				//=================================Begin : Add Serial With Different Serial Number==============//
				
				var AddSerialExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 0], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
				
				if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
				
					AddSerialExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 0], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
				}
				
				var AddSerialSearch = search.create({
					type: 'customrecord_smt_sn',
					filters: AddSerialExp,
					columns: [search.createColumn({
						name: 'custrecord_smt_sn_item',
						summary: 'group'
					}), search.createColumn({
						name: 'custrecord_smt_sn_sn',
						summary: 'count'
					}), search.createColumn({
						name: 'custrecordsmt_sn_qty',
						summary: 'sum'
					}), search.createColumn({
						name: 'custrecord_smt_sn_serialized',
						summary: 'group'
					})]
				}).run().getRange(0, 1000);
				if (AddSerialSearch != null && AddSerialSearch != '' && AddSerialSearch != undefined) {
					for (var q = 0; q < AddSerialSearch.length; q++) {
					
						log.debug('Add Serial Only')
						var Item = AddSerialSearch[q].getValue({
							name: 'custrecord_smt_sn_item',
							summary: 'group'
						});
						
						var Quantity = AddSerialSearch[q].getValue({
							name: 'custrecord_smt_sn_sn',
							summary: 'count'
						});
						var NonSerialQuantity = AddSerialSearch[q].getValue({
							name: 'custrecordsmt_sn_qty',
							summary: 'sum'
						});
						var Isserial = AddSerialSearch[q].getValue({
							name: 'custrecord_smt_sn_serialized',
							summary: 'group'
						});
						
						o_InvAdjust_OBJ.selectNewLine({
							sublistId: 'inventory'
						});
						
						o_InvAdjust_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'item',
							value: Item,
						});
						
						o_InvAdjust_OBJ.setCurrentSublistValue({
							sublistId: 'inventory',
							fieldId: 'location',
							value: Location,
						});
						
						if (Isserial == true) {
							o_InvAdjust_OBJ.setCurrentSublistValue({
								sublistId: 'inventory',
								fieldId: 'adjustqtyby',
								value: Quantity,
							});
						}
						else {
							o_InvAdjust_OBJ.setCurrentSublistValue({
								sublistId: 'inventory',
								fieldId: 'adjustqtyby',
								value: NonSerialQuantity,
							});
						}
						
						var subrec = o_InvAdjust_OBJ.getCurrentSublistSubrecord({
							sublistId: 'inventory',
							fieldId: 'inventorydetail'
						});
						
						var Line_AddSerialSearchExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['custrecord_smt_sn_apply', 'is', 'T'], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 0], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
						
						if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
							Line_AddSerialSearchExp = [['custrecord_smt_sn_location', 'anyOf', Location], "AND", ['internalid', 'anyOf', SNLineRecID], "AND", ['custrecord_smt_sn_processed', 'is', 'F'], "AND", ['custrecord_smt_sn_testupdate', 'noneOf', '@NONE@'], "AND", ['custrecord_smt_sn_correcting_transaction', 'anyOf', '@NONE@'], "AND", ['custrecord_smt_sn_item', 'anyOf', Item], "AND", ['custrecord_smt_sn_smart_testing', 'anyOf', STrecId], "AND", [["formulanumeric: case when {custrecord_smt_sn_item} ! = {custrecord_smt_sn_part_number_update} then 1 else 0 end", "equalto", 0], "AND", ["formulanumeric: case when {custrecord_smt_sn_serial} != {custrecord_smt_sn_sn} then 1 else 0 end", "equalto", 1]]];
						}
						
						var Line_AddSerialSearch = search.create({
							type: 'customrecord_smt_sn',
							filters: Line_AddSerialSearchExp,
							columns: [search.createColumn({
								name: 'custrecord_smt_sn_item',
							}), search.createColumn({
								name: 'custrecord_smt_sn_serial',
							}), search.createColumn({
								name: 'custrecord_stu_invstatus',
								join: 'custrecord_smt_sn_testupdate'
							}), search.createColumn({
								name: 'custrecord_smart_testing_bin',
								join: 'custrecord_smt_sn_testupdate'
							}), search.createColumn({
								name: 'custrecordsmt_sn_qty',
							})]
						}).run().getRange(0, 1000);
						if (Line_AddSerialSearch != null && Line_AddSerialSearch != '' && Line_AddSerialSearch != undefined) {
							for (var l = 0; l < Line_AddSerialSearch.length; l++) {
							
								var SerialNo = Line_AddSerialSearch[l].getValue({
									name: 'custrecord_smt_sn_serial'
								});
								
								var status = Line_AddSerialSearch[l].getValue({
									name: 'custrecord_stu_invstatus',
									join: 'custrecord_smt_sn_testupdate'
								});
								
								var bin = Line_AddSerialSearch[l].getValue({
									name: 'custrecord_smart_testing_bin',
									join: 'custrecord_smt_sn_testupdate'
								});
								
								var NonSerialQuantity = Line_AddSerialSearch[l].getValue({
									name: 'custrecordsmt_sn_qty',
								});
								
								if (Isserial == true) {
									subrec.selectNewLine({
										sublistId: 'inventoryassignment',
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'receiptinventorynumber',
										value: SerialNo
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'binnumber',
										value: bin
									});
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'inventorystatus',
										value: status
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'quantity',
										value: 1
									});
									
									subrec.commitLine({
										sublistId: 'inventoryassignment'
									});
								}
								else {
									subrec.selectNewLine({
										sublistId: 'inventoryassignment',
									});
									
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'binnumber',
										value: bin
									});
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'inventorystatus',
										value: status
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'quantity',
										value: NonSerialQuantity
									});
									
									subrec.commitLine({
										sublistId: 'inventoryassignment'
									});
								}
								
								
							}
						}
						o_InvAdjust_OBJ.commitLine({
							sublistId: 'inventory'
						});
					}
				}
			//=================================End : Add Item With Different Part and Serial Number==============//
			}
			if (CreateAdjustment == true) {
				var InventoryAdjustID = o_InvAdjust_OBJ.save({
					enableSourcing: true,
					ignoreMandatoryFields: true
				});
				log.debug('InventoryAdjustID', InventoryAdjustID);
				
				
				UpdateSmartTestingRecord(InventoryAdjustID, STrecId, AdjustmentArray, SNLineRecID)
			}
		}
		function UpdateSmartTestingRecord(TransactionID, STrecId, UpdateLineDetail, SNLineRecID){
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
					
					if (SNLineRecID != null && SNLineRecID != '' && SNLineRecID != undefined) {
						recObj.setCurrentSublistValue({
							sublistId: 'recmachcustrecord_smt_sn_smart_testing',
							fieldId: 'custrecord_smt_sn_apply',
							value: true
						})
					}
					
					recObj.setCurrentSublistValue({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						fieldId: 'custrecord_smt_sn_correcting_transaction',
						value: TransactionID
					})
					
					recObj.setCurrentSublistValue({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						fieldId: 'custrecord_smt_sn_processed',
						value: true
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
		function UpdateNonChangesApplyRecord(STrecId)
		{
			var recObj = record.load({
				type: 'customrecord_smt',
				id: STrecId,
				isDynamic: true
			});
			
			var numLines = recObj.getLineCount({
				sublistId: 'recmachcustrecord_smt_sn_smart_testing'
			});
			
			for (var x = 0; x < numLines; x++) {
				recObj.selectLine({
					sublistId: 'recmachcustrecord_smt_sn_smart_testing',
					line: x,
				});
				
				var Apply = recObj.getCurrentSublistValue({
					sublistId: 'recmachcustrecord_smt_sn_smart_testing',
					fieldId: 'custrecord_smt_sn_apply'
				})
				
				if (Apply == true) {
					recObj.setCurrentSublistValue({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						fieldId: 'custrecord_smt_sn_processed',
						value: true
					})
				}
				
				recObj.commitLine({
					sublistId: 'recmachcustrecord_smt_sn_smart_testing'
				});
			}
			
			var UpdatedSmartTestID = recObj.save({
				enableSourcing: true,
				ignoreMandatoryFields: true
			});
			log.debug('UpdatedSmartTestID', UpdatedSmartTestID);
		}
		return {
			onRequest: onRequestSTAdjustments
		};
	});