/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record','N/search','N/runtime'],
    function(record, search, runtime){
		function onRequestDPFulfillAction(context){
			try {
				var RequestrecId = context.request.parameters.shiprequestid;
				log.debug('RequestrecId', RequestrecId)
				
				var SO_LocObj = record.load({
					type: 'salesorder',
					id: RequestrecId,
					isDynamic: true
				});
				
				var UpdateLocation = false;
				
				var SO_P_numLines = SO_LocObj.getLineCount({
					sublistId: 'item'
				});
				
				for (var p = 0; p < SO_P_numLines; p++) {
					var item = SO_LocObj.getSublistValue({
						sublistId: 'item',
						fieldId: 'item',
						line: p
					});
					
					var isspecialorderline = SO_LocObj.getSublistValue({
						sublistId: 'item',
						fieldId: 'isspecialorderline',
						line: p
					});
					
					var IsdropShip = SO_LocObj.getSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_so_is_drop_ship',
						line: p
					});
					
					var Location = SO_LocObj.getSublistValue({
						sublistId: 'item',
						fieldId: 'location',
						line: p
					});
					
					if (Location != 1) {
						if ((isspecialorderline == 'T' && IsdropShip == true) || (item == 7211)) {
							UpdateLocation = true;
							
							SO_LocObj.selectLine({
								sublistId: 'item',
								line: p
							});
							
							SO_LocObj.setCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'location',
								value: 1
							})
							
							SO_LocObj.commitLine({
								sublistId: 'item'
							});
						}
					}
				}
				if (UpdateLocation == true) {
					var UpdatedLocRec = SO_LocObj.save({
						enableSourcing: true,
						ignoreMandatoryFields: true
					});
					log.debug('UpdatedLocRec', UpdatedLocRec);
				}
				
				
				var SOObj = record.load({
					type: 'salesorder',
					id: RequestrecId,
					isDynamic: true
				});
				
				var LinksLine = SOObj.getLineCount({
					sublistId: 'links'
				});
				log.debug('LinksLine', LinksLine)
				
				for (var ll = 0; ll < LinksLine; ll++) {
					var links = SOObj.getSublistValue({
						sublistId: 'links',
						fieldId: 'linktype',
						line: ll
					});
					
					var status = SOObj.getSublistValue({
						sublistId: 'links',
						fieldId: 'status',
						line: ll
					});
					
					var POID = SOObj.getSublistValue({
						sublistId: 'links',
						fieldId: 'id',
						line: ll
					});
					log.debug('POID', POID);
					
					if (links == 'Special Order' && status == 'Pending Receipt') {
						try {
							var POObj = record.load({
								type: 'purchaseorder',
								id: POID,
								isDynamic: true
							});
							
							var SCCount = 0;
							
							var POTranID = POObj.getValue('tranid');
							
							var POLocation = POObj.getValue('location');
							
							if (POLocation != 1) {
								POObj.setValue('location', 1);
								var UpdatePOrecordId = POObj.save({
									enableSourcing: true,
									ignoreMandatoryFields: true
								});
								log.debug('UpdatePOrecordId', UpdatePOrecordId);
							}
							
							log.debug('Inside POID', POID);
							
							var ItemReceiptobj = record.transform({
								fromType: "purchaseorder",
								fromId: POID,
								toType: "itemreceipt",
								isDynamic: true,
							});
							
							var IRLines = ItemReceiptobj.getLineCount({
								sublistId: 'item'
							});
							log.debug('IRLines', IRLines);
							
							var IsAnyItemExist = false;
							
							for (var k = 0; k < IRLines; k++) {
								ItemReceiptobj.selectLine({
									sublistId: 'item',
									line: k
								});
								
								var orderline = ItemReceiptobj.getCurrentSublistValue({
									sublistId: 'item',
									fieldId: 'orderline'
								})
								
								var ItemFound = false;
								
								var POnumLines = POObj.getLineCount({
									sublistId: 'item'
								});
								
								for (var i = 0; i < POnumLines; i++) {
									var Line = POObj.getSublistValue({
										sublistId: 'item',
										fieldId: 'line',
										line: i
									});
									
									var IsdropShip = POObj.getSublistValue({
										sublistId: 'item',
										fieldId: 'custcol_so_is_drop_ship',
										line: i
									});
									
									if (orderline == Line && IsdropShip == true) {
										ItemFound = true;
										break;
									}
								}
								if (ItemFound == true) {
									IsAnyItemExist = true;
									
									/*
								 var IRLocation = ItemReceiptobj.getCurrentSublistValue({
								 sublistId: 'item',
								 fieldId: 'location',
								 })
								 
								 if (IRLocation != null && IRLocation != '' && IRLocation != undefined)
								 {
								 
								 
								 }
								 else {
								 */
									//}
									
									ItemReceiptobj.setCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'itemreceive',
										value: true,
										ignoreFieldChange: false,
										forceSyncSourcing: true
									})
									
									var Quantity = ItemReceiptobj.getCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'quantity',
									})
									
									var ItemQuantity = ItemReceiptobj.getCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'itemquantity',
									})
									
									if (Quantity != null && Quantity != '' && Quantity != undefined) {
									
									}
									else {
										log.debug('Inside Quantity', Quantity)
										log.debug('Inside ItemQuantity', ItemQuantity)
										Quantity = ItemQuantity;
									}
									
									
									log.debug('Quantity', Quantity)
									
									ItemReceiptobj.setCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'location',
										value: 1
									})
									
									var Iserial = ItemReceiptobj.getCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'isserial',
									})
									
									log.debug('Iserial', Iserial)
									
									if (Iserial == 'T') {
									
									
										var subrec = ItemReceiptobj.getCurrentSublistSubrecord({
											sublistId: 'item',
											fieldId: 'inventorydetail'
										});
										
										log.debug('subrec', subrec)
										
										var SublistnumLines = subrec.getLineCount({
											sublistId: 'inventoryassignment'
										});
										
										for (var z = SublistnumLines - 1; z >= 0; z--) {
											log.debug('IsSerial-z', '--> ' + z);
											subrec.removeLine({
												sublistId: 'inventoryassignment',
												line: z
											});
										}
										
										
										for (var q = 0; q < Quantity; q++) {
											SCCount++;
											var SerialNumber = 'ds_' + POTranID + "_" + SCCount;
											log.debug('SerialNumber', SerialNumber);
											
											subrec.selectNewLine({
												sublistId: 'inventoryassignment',
											});
											
											subrec.setCurrentSublistValue({
												sublistId: 'inventoryassignment',
												fieldId: 'receiptinventorynumber',
												value: SerialNumber
											});
											
											subrec.setCurrentSublistValue({
												sublistId: 'inventoryassignment',
												fieldId: 'binnumber',
												value: 247
											});
											
											subrec.setCurrentSublistValue({
												sublistId: 'inventoryassignment',
												fieldId: 'inventorystatus',
												value: 1
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
									}
									else {
										var subrec = ItemReceiptobj.getCurrentSublistSubrecord({
											sublistId: 'item',
											fieldId: 'inventorydetail'
										});
										
										var SublistnumLines = subrec.getLineCount({
											sublistId: 'inventoryassignment'
										});
										
										for (var z = SublistnumLines - 1; z >= 0; z--) {
											log.debug('IsSerial-z', '--> ' + z);
											subrec.removeLine({
												sublistId: 'inventoryassignment',
												line: z
											});
										}
										
										subrec.selectNewLine({
											sublistId: 'inventoryassignment',
										});
										
										subrec.setCurrentSublistValue({
											sublistId: 'inventoryassignment',
											fieldId: 'binnumber',
											value: 247
										});
										
										subrec.setCurrentSublistValue({
											sublistId: 'inventoryassignment',
											fieldId: 'inventorystatus',
											value: 1
										});
										
										subrec.setCurrentSublistValue({
											sublistId: 'inventoryassignment',
											fieldId: 'quantity',
											value: Quantity
										});
										
										subrec.commitLine({
											sublistId: 'inventoryassignment'
										});
									}
								}
								else {
									ItemReceiptobj.setCurrentSublistValue({
										sublistId: 'item',
										fieldId: 'itemreceive',
										value: false
									})
								}
								
								ItemReceiptobj.commitLine({
									sublistId: 'item'
								});
							}
							if (IsAnyItemExist == true) {
								var recordId = ItemReceiptobj.save({
									enableSourcing: true,
									ignoreMandatoryFields: true
								});
								log.debug('recordId', recordId);
							}
						} 
						catch (ex) {
							log.debug('inner ex', ex);
						}
					}
				}
				
				var DropShipFulfill = false;
				
				var soObj = record.load({
					type: record.Type.SALES_ORDER,
					id: RequestrecId,
					isDynamic: true
				});
				
				var ItemFulfillobj = record.transform({
					fromType: "salesorder",
					fromId: RequestrecId,
					toType: "itemfulfillment",
					isDynamic: true,
				});
				
				ItemFulfillobj.setValue('shipstatus', 'C')
				
				var IFLines = ItemFulfillobj.getLineCount({
					sublistId: 'item'
				});
				log.debug('IFLines', IFLines);
				
				for (var j = 0; j < IFLines; j++) {
					ItemFulfillobj.selectLine({
						sublistId: 'item',
						line: j
					});
					
					var orderline = ItemFulfillobj.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'orderline'
					})
					
					var ItemFound = false;
					
					var numLines = soObj.getLineCount({
						sublistId: 'item'
					});
					
					for (var i = 0; i < numLines; i++) {
						var Line = soObj.getSublistValue({
							sublistId: 'item',
							fieldId: 'line',
							line: i
						});
						
						var isspecialorderline = soObj.getSublistValue({
							sublistId: 'item',
							fieldId: 'isspecialorderline',
							line: i
						});
						
						var IsdropShip = soObj.getSublistValue({
							sublistId: 'item',
							fieldId: 'custcol_so_is_drop_ship',
							line: i
						});
						
						if (orderline == Line && isspecialorderline == 'T' && IsdropShip == true) {
							ItemFound = true;
							break;
						}
					}
					if (ItemFound == true) {
						ItemFulfillobj.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'itemreceive',
							value: true
						})
						
						DropShipFulfill = true;
					/*
					 ItemFulfillobj.setCurrentSublistValue({
					 sublistId: 'item',
					 fieldId: 'location',
					 value: 8
					 })
					 */
					}
					else {
						ItemFulfillobj.setCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'itemreceive',
							value: false
						})
					}
					ItemFulfillobj.commitLine({
						sublistId: 'item'
					});
				}
				if (DropShipFulfill == true) {
					for (var l = 0; l < IFLines; l++) {
						ItemFulfillobj.selectLine({
							sublistId: 'item',
							line: l
						});
						
						var Item = ItemFulfillobj.getCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'item'
						})
						
						var Quantity = ItemFulfillobj.getCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'quantityremaining'
						})
						
						var Location = ItemFulfillobj.getCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'location'
						})
						
						log.debug('Location', Location);
						
						log.debug('Quantity', Quantity);
						
						if (Item == 7211) {
							ItemFulfillobj.setCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'itemreceive',
								value: true
							})
							
							var Quantity = ItemFulfillobj.getCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'quantity',
								value: Quantity
							})
							
							
							var subrec = ItemFulfillobj.getCurrentSublistSubrecord({
								sublistId: 'item',
								fieldId: 'inventorydetail'
							});
							
							var SublistnumLines = subrec.getLineCount({
								sublistId: 'inventoryassignment'
							});
							
							for (var z = SublistnumLines - 1; z >= 0; z--) {
								log.debug('IsSerial-z', '--> ' + z);
								subrec.removeLine({
									sublistId: 'inventoryassignment',
									line: z
								});
							}
							
							log.debug('subrec', subrec);
							subrec.selectNewLine({
								sublistId: 'inventoryassignment',
							});
							
							if (Location == 1) {
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'binnumber',
									value: 5
								});
								
								subrec.setCurrentSublistValue({
									sublistId: 'inventoryassignment',
									fieldId: 'quantity',
									value: Quantity
								});
								subrec.commitLine({
									sublistId: 'inventoryassignment'
								});
								
								ItemFulfillobj.commitLine({
									sublistId: 'item'
								});
								
								break;
							}
							else {
								if (Location == 27) {
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'binnumber',
										value: 2
									});
									
									subrec.setCurrentSublistValue({
										sublistId: 'inventoryassignment',
										fieldId: 'quantity',
										value: Quantity
									});
									
									subrec.commitLine({
										sublistId: 'inventoryassignment'
									});
									
									ItemFulfillobj.commitLine({
										sublistId: 'item'
									});
									break;
								}
							}
						}
					}
				}
				
				var FulfillrecordId = ItemFulfillobj.save({
					enableSourcing: true,
					ignoreMandatoryFields: true
				});
				log.debug('FulfillrecordId', FulfillrecordId);
				context.response.write("Fulfillment Completed Successfully");
			} 
			catch (error) {
				log.debug('error', error);
				context.response.write("Error :- " + error.message);
			}
		}
		return {
			onRequest: onRequestDPFulfillAction
		};
	});