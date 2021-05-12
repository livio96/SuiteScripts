/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record','N/search','N/runtime'],
    function(record, search, runtime){
		function onRequestShippingAction(context){
			try {
				var RequestrecId = context.request.parameters.shiprequestid;
				var RequestType = context.request.parameters.shiprequesttype;
				log.debug('RequestrecId', RequestrecId)
				log.debug('RequestType', RequestType)
				
				if (RequestType == 'replacement') {
					var ShipObj = record.load({
						type: 'customrecord_sp',
						id: RequestrecId,
					});
					//isDynamic: true
					var OriginalSo = ShipObj.getValue({
						fieldId: 'custrecord_sp_ot'
					});
					
					if (OriginalSo != null && OriginalSo != '' && OriginalSo != undefined) {
						var o_recordOBJ = record.copy({
							type: record.Type.SALES_ORDER,
							id: OriginalSo,
							isDynamic: true
						});
						
						var OtherRef = o_recordOBJ.getValue({
							fieldId: 'otherrefnum'
						});
						
						OtherRef = OtherRef + "/replacement";
						
						
						var Memo = ShipObj.getValue({
							fieldId: 'custrecord_sp_memo'
						});
						
						o_recordOBJ.setValue('otherrefnum', OtherRef);
						o_recordOBJ.setValue('memo', Memo);
						o_recordOBJ.setValue('custbodyshippinginstructions', "");
						o_recordOBJ.setValue('custbody25', false);
						o_recordOBJ.setValue('shipcarrier', 'nonups');
						o_recordOBJ.setValue('shipmethod', 5449);
                      	o_recordOBJ.setValue('custbody_celigo_amz_fulfillmentchannel', null)
						
						var numLines = o_recordOBJ.getLineCount({
							sublistId: 'item'
						});
						
						for (var z = numLines - 1; z >= 0; z--) {
							o_recordOBJ.removeLine({
								sublistId: 'item',
								line: z
							});
						}
						
						var ShipnumLines = ShipObj.getLineCount({
							sublistId: 'recmachcustrecord_sp_item_parent'
						});
						log.debug('ShipnumLines', ShipnumLines)
						
						for (var i = 0; i < ShipnumLines; i++) {
							var Item = ShipObj.getSublistValue({
								sublistId: 'recmachcustrecord_sp_item_parent',
								fieldId: 'custrecord_sp_item_name',
								line: i
							});
							
							var Price = ShipObj.getSublistValue({
								sublistId: 'recmachcustrecord_sp_item_parent',
								fieldId: 'custrecord_sp_item_price',
								line: i
							});
							
							var Quantity = ShipObj.getSublistValue({
								sublistId: 'recmachcustrecord_sp_item_parent',
								fieldId: 'custrecord_sp_item_quantity',
								line: i
							});
							log.debug('Quantity', Quantity)
							
							
							o_recordOBJ.selectNewLine({
								sublistId: 'item'
							});
							
							o_recordOBJ.setCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'item',
								value: Item,
							});
							o_recordOBJ.setCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'price',
								value: -1,
							});
							
							o_recordOBJ.setCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'rate',
								value: Price,
							});
							
							
							o_recordOBJ.setCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'quantity',
								value: Quantity,
							});
							
							o_recordOBJ.commitLine({
								sublistId: 'item'
							});
						}
						var CreatedSOID = o_recordOBJ.save({
							enableSourcing: true,
							ignoreMandatoryFields: true
						});
						log.debug('Debug', 'CreatedSOID' + CreatedSOID);
						
						
						var id = record.submitFields({
							type: 'customrecord_sp',
							id: RequestrecId,
							values: {
								custrecord_sp_applied_tran: CreatedSOID,
								custrecord_sp_action: 1
							},
							options: {
								enableSourcing: true,
								ignoreMandatoryFields: true
							}
						});
						context.response.write("Replacement Created Successfully");
					}
				}
				if (RequestType == 'refund') {
					var ShipObj = record.load({
						type: 'customrecord_sp',
						id: RequestrecId,
					});
					//isDynamic: true
					var OriginalSo = ShipObj.getValue({
						fieldId: 'custrecord_sp_ot'
					});
					
					var Amount = ShipObj.getValue({
						fieldId: 'custrecord_sp_reimbursement'
					});
					
					if (OriginalSo != null && OriginalSo != '' && OriginalSo != undefined) {
						var R = record.load({
							type: record.Type.SALES_ORDER,
							id: OriginalSo,
							isDynamic: true
						});
						
						var entity = R.getValue({
							fieldId: 'entity'
						});
						
						var subsidiary = R.getValue({
							fieldId: 'subsidiary'
						});
						
						var currency = R.getValue({
							fieldId: 'currency'
						});
						
						var department = R.getValue({
							fieldId: 'department'
						});
						
						var Checkclass = R.getValue({
							fieldId: 'class'
						});
						var OrderContactName = R.getValue({
							fieldId: 'custbody28'
						});
						
						var SalesConsultant = R.getValue({
							fieldId: 'salesrep'
						});
						var location = R.getValue({
							fieldId: 'location'
						});
						
						
						var o_recordOBJ = record.create({
							type: 'creditmemo',
							isDynamic: true
						});
						
						o_recordOBJ.setValue('entity', entity);
						o_recordOBJ.setValue('subsidiary', subsidiary);
						o_recordOBJ.setValue('currency', currency);
						o_recordOBJ.setValue('department', department);
						o_recordOBJ.setValue('class', Checkclass);
						o_recordOBJ.setValue('custbody28', OrderContactName);
						o_recordOBJ.setValue('salesrep', SalesConsultant);
						o_recordOBJ.setValue('location', location);
						o_recordOBJ.setValue('custbody_shipping_issue_case', RequestrecId);
						o_recordOBJ.setValue('custbody_creditmemo_status', 2);
						
						o_recordOBJ.selectNewLine({
							sublistId: 'item'
						});
						
						o_recordOBJ.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'item',
							value: 239347,
						});
						
						o_recordOBJ.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'price',
							value: -1,
						});
						
						o_recordOBJ.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'rate',
							value: Amount,
						});
						
						o_recordOBJ.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'amount',
							value: Amount,
						});
						
						o_recordOBJ.commitLine({
							sublistId: 'item'
						});
						
						var CreditID = o_recordOBJ.save({
							enableSourcing: true,
							ignoreMandatoryFields: true
						});
						log.debug('Debug', 'Credit Memo' + CreditID);
						
						
						var o_NewrefundObj = record.create({
							type: 'customerrefund',
							isDynamic: true
						});
						o_NewrefundObj.setValue('customform', 220);
						o_NewrefundObj.setValue('customer', entity);
						o_NewrefundObj.setValue('custbody_shipping_issue_case', RequestrecId);
						
						var RefundLines = o_NewrefundObj.getLineCount({
							sublistId: 'apply'
						});
						for (var i = 0; i < RefundLines; i++) {
							o_NewrefundObj.selectLine({
								sublistId: 'apply',
								line: i
							});
							var applyID = o_NewrefundObj.getCurrentSublistValue({
								sublistId: 'apply',
								fieldId: 'doc',
							});
							if (applyID == CreditID) {
								o_NewrefundObj.setCurrentSublistValue({
									sublistId: 'apply',
									fieldId: 'apply',
									value: true,
								});
								o_NewrefundObj.commitLine({
									sublistId: 'apply'
								});
							}
						}
						o_NewrefundObj.setValue('tranid', '');
						var RefundId = o_NewrefundObj.save({
							enableSourcing: true,
							ignoreMandatoryFields: true
						});
						log.debug('Debug', 'RefundId' + RefundId);
						
						var id = record.submitFields({
							type: 'customrecord_sp',
							id: RequestrecId,
							values: {
								custrecord_sp_refund_tran: RefundId,
								custrecord_sp_action: 2
							},
							options: {
								enableSourcing: true,
								ignoreMandatoryFields: true
							}
						});
						context.response.write("Refund(Credit Memo) Created Successfully");
					}
				}
			} 
			catch (error) {
				context.response.write("Error :- " + error.message);
			}
		}
		return {
			onRequest: onRequestShippingAction
		};
	});