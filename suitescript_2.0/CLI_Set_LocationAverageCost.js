/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/search','N/record'],
    function(error, search, record){
	
		var SORecordMode = '';
		function pageInit_RecordMode(context){
			SORecordMode = context.mode;
			
		}
		
		function fieldChanged_SetAvgCostField(context){
			if (SORecordMode == 'edit') {
				try {
					var currentRecord = context.currentRecord;
					var sublistName = context.sublistId;
					var FieldName = context.fieldId;
					//alert(sublistName)
					//alert(FieldName)
					if ((sublistName == 'item' && (FieldName == 'location'))) {
						//alert('Line')
						var Location = currentRecord.getValue('location')
						
						var Item = currentRecord.getCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'item'
						});
						
						if (Item != null && Item != '' && Item != undefined) {
							var LineLocation = currentRecord.getCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'location'
							});
							
							if (LineLocation != null && LineLocation != '' && LineLocation != undefined) {
								Location = LineLocation
							}
							
							if (Location != null && Location != '' && Location != undefined) {
							
								var ItemType = currentRecord.getCurrentSublistValue({
									sublistId: 'item',
									fieldId: 'itemtype'
								});
								//alert(ItemType)
								if ((ItemType == 'Kit')) {
								
									var KitItemSearch = search.load({
										id: 'customsearch_kit_location_average_cost'
									});
									
									var MyFilters = search.createFilter({
										name: 'internalid',
										operator: 'anyOf',
										values: Item
									})
									
									var MyFilters2 = search.createFilter({
										name: 'inventorylocation',
										join: 'memberitem',
										operator: 'anyOf',
										values: Location
									})
									
									KitItemSearch.filters.push(MyFilters);
									KitItemSearch.filters.push(MyFilters2);
									
									var KitItemsearchResults = KitItemSearch.run().getRange(0, 1000);
									
									if (KitItemsearchResults != null && KitItemsearchResults != '' && KitItemsearchResults != undefined) {
									
										var TranSearch = KitItemsearchResults[0];
										//var SearchColumns = KitItemsearchResults.columns();
										
										var AverageCost = TranSearch.getValue(TranSearch.columns[2]);
										log.debug('AverageCost', AverageCost);
										
										currentRecord.setCurrentSublistValue({
											sublistId: 'item',
											fieldId: 'custcol_locavgcost',
											value: AverageCost
										});
									}
								}
								if ((ItemType == 'InvtPart')) {
									var ItemSearchRes = search.create({
										type: 'item',
										filters: [["internalid", "anyOf", Item], "AND", ["inventorylocation", "anyOf", Location]],
										columns: [search.createColumn({
											name: 'internalid',
											label: 'Internal ID'
										}), search.createColumn({
											name: 'inventorylocation',
											label: 'Inventory Location'
										}), search.createColumn({
											name: 'locationaveragecost',
											label: 'Average Cost'
										})]
									}).run().getRange(0, 1000);
									
									if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
									
									
										var AverageCost = ItemSearchRes[0].getValue({
											name: 'locationaveragecost'
										});
										
										currentRecord.setCurrentSublistValue({
											sublistId: 'item',
											fieldId: 'custcol_locavgcost',
											value: AverageCost
										});
									}
								}
							}
						}
					}
					else {
						if (FieldName == 'location') {
							try {
								//alert('Header')
								var recObj = context.currentRecord;
								var LocationArray = new Array();
								var ItemArray = new Array();
								var KitItemArray = new Array();
								var KitExist = false;
								
								var HeaderLocation = recObj.getValue('location');
								
								if (HeaderLocation != null && HeaderLocation != '' && HeaderLocation != undefined) {
									LocationArray.push(HeaderLocation);
									
									var SonumLines = recObj.getLineCount({
										sublistId: 'item'
									});
									
									for (var j = 0; j < SonumLines; j++) {
										var Item = recObj.getSublistValue({
											sublistId: 'item',
											fieldId: 'item',
											line: j
										});
										
										var ItemType = recObj.getSublistValue({
											sublistId: 'item',
											fieldId: 'itemtype',
											line: j
										});
										
										var Location = recObj.getSublistValue({
											sublistId: 'item',
											fieldId: 'location',
											line: j
										});
										
										if (Location != null && Location != '' && Location != undefined) {
											LocationArray.push(Location);
										}
										
										if ((ItemType == 'InvtPart' || ItemType == 'Kit')) {
											ItemArray.push(Item);
										}
									}
									
									var ItemSearchRes = search.create({
										type: 'item',
										filters: [["internalid", "anyOf", ItemArray], "AND", ["inventorylocation", "anyOf", LocationArray]],
										columns: [search.createColumn({
											name: 'internalid',
											label: 'Internal ID'
										}), search.createColumn({
											name: 'inventorylocation',
											label: 'Inventory Location'
										}), search.createColumn({
											name: 'locationaveragecost',
											label: 'Average Cost'
										})]
									}).run().getRange(0, 1000);
									
									var KitItemSearch = search.load({
										id: 'customsearch_kit_location_average_cost'
									});
									
									var MyFilters = search.createFilter({
										name: 'internalid',
										operator: 'anyOf',
										values: ItemArray
									})
									
									var MyFilters2 = search.createFilter({
										name: 'inventorylocation',
										join: 'memberitem',
										operator: 'anyOf',
										values: LocationArray
									})
									
									KitItemSearch.filters.push(MyFilters);
									KitItemSearch.filters.push(MyFilters2);
									
									var KitItemsearchResults = KitItemSearch.run().getRange(0, 1000);
									
									for (var j = 0; j < SonumLines; j++) {
										var Item = recObj.getSublistValue({
											sublistId: 'item',
											fieldId: 'item',
											line: j
										});
										
										var ItemType = recObj.getSublistValue({
											sublistId: 'item',
											fieldId: 'itemtype',
											line: j
										});
										
										var Location = recObj.getSublistValue({
											sublistId: 'item',
											fieldId: 'location',
											line: j
										});
										
										if (Location != null && Location != '' && Location != undefined) {
										
										}
										else {
											Location = HeaderLocation
										}
										
										if ((ItemType == 'InvtPart')) {
											if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
												for (var q = 0; q < ItemSearchRes.length; q++) {
													var ItemID = ItemSearchRes[q].getValue({
														name: 'internalid'
													});
													var ItemLocation = ItemSearchRes[q].getValue({
														name: 'inventorylocation'
													});
													var AverageCost = ItemSearchRes[q].getValue({
														name: 'locationaveragecost'
													});
													
													if (ItemID == Item && Location == ItemLocation) {
														recObj.selectLine({
															sublistId: 'item',
															line: j
														});
														
														recObj.setCurrentSublistValue({
															sublistId: 'item',
															fieldId: 'custcol_locavgcost',
															value: AverageCost
														});
														
														recObj.commitLine({
															sublistId: 'item'
														});
														break;
													}
												}
											}
										}
										if ((ItemType == 'Kit')) {
											if (KitItemsearchResults != null && KitItemsearchResults != '' && KitItemsearchResults != undefined) {
												for (var q = 0; q < KitItemsearchResults.length; q++) {
												
													var TranSearch = KitItemsearchResults[q];
													//var SearchColumns = KitItemsearchResults.columns();
													
													var ItemID = TranSearch.getValue(TranSearch.columns[0]);
													log.debug('ItemID', ItemID);
													
													var ItemLocation = TranSearch.getValue(TranSearch.columns[1]);
													log.debug('ItemLocation', ItemLocation);
													
													var AverageCost = TranSearch.getValue(TranSearch.columns[2]);
													log.debug('AverageCost', AverageCost);
													
													if (ItemID == Item && Location == ItemLocation) {
														recObj.selectLine({
															sublistId: 'item',
															line: j
														});
														
														recObj.setCurrentSublistValue({
															sublistId: 'item',
															fieldId: 'custcol_locavgcost',
															value: AverageCost
														});
														
														
														recObj.commitLine({
															sublistId: 'item'
														});
														break;
													}
												}
											}
										}
									}
									
								}
							} 
							catch (e) {
								log.debug('Average', e);
							}
						}
					}
				} 
				catch (e) {
					log.debug('Average', e);
				}
			}
		}
		function postSourcing_SetAvgCostField(context){
			if (SORecordMode == 'edit') {
				try {
					var currentRecord = context.currentRecord;
					var sublistName = context.sublistId;
					var FieldName = context.fieldId;
					//alert(sublistName)
					//alert(FieldName)
					if ((sublistName == 'item' && FieldName == 'item')) {
						//alert('Line')
						var Location = currentRecord.getValue('location')
						
						var Item = currentRecord.getCurrentSublistValue({
							sublistId: 'item',
							fieldId: 'item'
						});
						
						if (Item != null && Item != '' && Item != undefined) {
							var LineLocation = currentRecord.getCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'location'
							});
							
							if (LineLocation != null && LineLocation != '' && LineLocation != undefined) {
								Location = LineLocation
							}
							
							if (Location != null && Location != '' && Location != undefined) {
							
								var ItemType = currentRecord.getCurrentSublistValue({
									sublistId: 'item',
									fieldId: 'itemtype'
								});
								//	alert(ItemType)
								if ((ItemType == 'Kit')) {
								
									var KitItemSearch = search.load({
										id: 'customsearch_kit_location_average_cost'
									});
									
									var MyFilters = search.createFilter({
										name: 'internalid',
										operator: 'anyOf',
										values: Item
									})
									
									var MyFilters2 = search.createFilter({
										name: 'inventorylocation',
										join: 'memberitem',
										operator: 'anyOf',
										values: Location
									})
									
									KitItemSearch.filters.push(MyFilters);
									KitItemSearch.filters.push(MyFilters2);
									
									var KitItemsearchResults = KitItemSearch.run().getRange(0, 1000);
									
									if (KitItemsearchResults != null && KitItemsearchResults != '' && KitItemsearchResults != undefined) {
									
										var TranSearch = KitItemsearchResults[0];
										//var SearchColumns = KitItemsearchResults.columns();
										
										var AverageCost = TranSearch.getValue(TranSearch.columns[2]);
										log.debug('AverageCost', AverageCost);
										
										currentRecord.setCurrentSublistValue({
											sublistId: 'item',
											fieldId: 'custcol_locavgcost',
											value: AverageCost
										});
									}
								}
								if ((ItemType == 'InvtPart')) {
									var ItemSearchRes = search.create({
										type: 'item',
										filters: [["internalid", "anyOf", Item], "AND", ["inventorylocation", "anyOf", Location]],
										columns: [search.createColumn({
											name: 'internalid',
											label: 'Internal ID'
										}), search.createColumn({
											name: 'inventorylocation',
											label: 'Inventory Location'
										}), search.createColumn({
											name: 'locationaveragecost',
											label: 'Average Cost'
										})]
									}).run().getRange(0, 1000);
									
									if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
									
									
										var AverageCost = ItemSearchRes[0].getValue({
											name: 'locationaveragecost'
										});
										
										currentRecord.setCurrentSublistValue({
											sublistId: 'item',
											fieldId: 'custcol_locavgcost',
											value: AverageCost
										});
									}
								}
							}
						}
					}
				} 
				catch (e) {
					log.debug('Average', e);
				}
			}
		}
		return {
			pageInit: pageInit_RecordMode,
			fieldChanged: fieldChanged_SetAvgCostField,
			postSourcing: postSourcing_SetAvgCostField
		};
	});
	

	
