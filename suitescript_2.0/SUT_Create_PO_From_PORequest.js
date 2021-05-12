/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record','N/search','N/runtime'],
    function(record, search, runtime){
		function onRequestCreatePO(context){
			try {
				var RequestrecId = context.request.parameters.porequestid;
				var RequestType = context.request.parameters.porequesttype;
				log.debug('RequestrecId', RequestrecId)
				log.debug('RequestType', RequestType)
				
				if (RequestType == 'create') {
					var PORequest = record.load({
						type: 'customrecord_popro',
						id: RequestrecId,
					
					});
					//isDynamic: true
					var Vendor = PORequest.getValue({
						fieldId: 'custrecord_popro_vendor'
					});
					
					if (Vendor != null && Vendor != '' && Vendor != undefined) {
					
						var Comments = PORequest.getValue({
							fieldId: 'custrecord_popro_comments'
						});
						
						var o_recordOBJ = record.create({
							type: record.Type.PURCHASE_ORDER,
							isDynamic: true
						});
						
						o_recordOBJ.setValue('entity', Vendor);
						o_recordOBJ.setValue('custbody_telquest_vendorpayment_pomemo', Comments);
						//o_recordOBJ.setValue('orderstatus', 'A');
						o_recordOBJ.setValue('custbody_po_request', RequestrecId);
						
						var numLines = PORequest.getLineCount({
							sublistId: 'recmachcustrecord_por_popro'
						});
						log.debug('numLines', numLines)
						var ApprovedLine = false;
						for (var i = 0; i < numLines; i++) {
							var POLineStatus = PORequest.getSublistValue({
								sublistId: 'recmachcustrecord_por_popro',
								fieldId: 'custrecord_por_status',
								line: i
							});
							
							if (POLineStatus == 5) {
								ApprovedLine = true;
								var Item = PORequest.getSublistValue({
									sublistId: 'recmachcustrecord_por_popro',
									fieldId: 'custrecord_por_item',
									line: i
								});
								
								log.debug('Item', Item)
								
								var TargetQty = PORequest.getSublistValue({
									sublistId: 'recmachcustrecord_por_popro',
									fieldId: 'custrecord_por_target_qty',
									line: i
								});
								
								var TargetPrice = PORequest.getSublistValue({
									sublistId: 'recmachcustrecord_por_popro',
									fieldId: 'custrecord_por_target_price',
									line: i
								});
								
								var Quantity = PORequest.getSublistValue({
									sublistId: 'recmachcustrecord_por_popro',
									fieldId: 'custrecord_por_final_quantity',
									line: i
								});
								log.debug('Quantity', Quantity)
								
								var Price = PORequest.getSublistValue({
									sublistId: 'recmachcustrecord_por_popro',
									fieldId: 'custrecord_por_final_price',
									line: i
								});
								log.debug('Price', Price)
								
								
								o_recordOBJ.selectNewLine({
									sublistId: 'item'
								});
								
								o_recordOBJ.setCurrentSublistValue({
									sublistId: 'item',
									fieldId: 'item',
									value: Item,
								});
								
								if (Quantity != null && Quantity != '' && Quantity != undefined) {
									o_recordOBJ.setCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'quantity',
										value: Quantity,
									});
								}
								else {
									context.response.write("Please Enter the Final Quantity");
									return;
								}
								if (Price != null && Price != '' && Price != undefined) {
								
									o_recordOBJ.setCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'rate',
										value: Price,
									});
								}
								else {
									context.response.write("Please Enter the Final Price");
									return;
								}
								
								o_recordOBJ.setCurrentSublistValue({
									sublistId: 'item',
									fieldId: 'custcol_poreq_targetqty',
									value: TargetQty,
								});
								
								o_recordOBJ.setCurrentSublistValue({
									sublistId: 'item',
									fieldId: 'custcol_poreq_targetprice',
									value: TargetPrice,
								});
								
								o_recordOBJ.commitLine({
									sublistId: 'item'
								});
								
							//log.debug('Price', Price)
							}
						}
						if (ApprovedLine == true) {
							var CreatedPOID = o_recordOBJ.save({
								enableSourcing: true,
								ignoreMandatoryFields: true
							});
							log.debug('Debug', 'CreatedPOID' + CreatedPOID);
							
							var id = record.submitFields({
								type: 'customrecord_popro',
								id: RequestrecId,
								values: {
									custrecord_por_po: CreatedPOID,
									custrecord_popro_status: 3
								},
								options: {
									enableSourcing: true,
									ignoreMandatoryFields: true
								}
							});
							context.response.write("PO Created Successfully");
						}
						else {
							context.response.write("Please Approve atleast One Line to Create Purchase Order");
						}
					}
					else {
						context.response.write("Please Select the Vendor");
					}
				}
				if (RequestType == 'close') {
				
					var id = record.submitFields({
						type: 'customrecord_popro',
						id: RequestrecId,
						values: {
							custrecord_popro_status: 4
						},
						options: {
							enableSourcing: false,
							ignoreMandatoryFields: true
						}
					});
					
					context.response.write("PO Request Closed Successfully");
				}
			} 
			catch (error) {
				context.response.write("Error :- "+error.message);
			}
		}
		return {
			onRequest: onRequestCreatePO
		};
	});