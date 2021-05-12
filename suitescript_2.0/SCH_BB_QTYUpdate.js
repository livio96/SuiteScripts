/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/file','N/http','N/task'],
    function(render, search, record, email, runtime, file, http, task){
		function executeUpdateMainListingQty(context){
			UpdateBrokerBinMainListingQty();
			UpdateBrokerBinInboundQuantity();
		}
		function UpdateBrokerBinMainListingQty(){
			try {
			
				var script = runtime.getCurrentScript();
				//var number = Number(script.getParameter({name:'custscript_index_val'}));
				//log.debug({ title:'number', details: number });
				
				var BrokerBinSearch = search.load({
					id: 'customsearch_broker_bin_main_qty_update'
				});
				
				var searchid = 0;
				
				var j = 0;
				
				do {
					var searchResults = BrokerBinSearch.run().getRange(searchid, searchid + 1000);
					
					if (searchResults != null && searchResults != '' && searchResults != undefined) {
						try {
						
							j++;
							log.debug('search', '--> ' + searchResults.length);
							
							for (var Trans in searchResults) {
								var result = searchResults[Trans];
								var columnLen = result.columns.length;
								
								
								var BBQty = '';
								var INVQTY = '';
								var BBInternalID = '';
								
								for (var t = 0; t < columnLen; t++) {
									var column = result.columns[t];
									var LabelName = column.label;
									var fieldName = column.name;
									var value = result.getValue(column);
									var text = result.getText(column);
									if (fieldName == 'internalid') {
										BBInternalID = value
									}
									if (LabelName == 'BBQTY') {
										BBQty = value
									}
									if (LabelName == 'INVQTY') {
										INVQTY = value
									}
								}
								searchid++;
								
								var UpdateBBid = record.submitFields({
									type: 'customrecord_bbl',
									id: BBInternalID,
									values: {
										custrecord_bbl_listed_brokerbin_quantity: INVQTY,
										custrecord_bbl_update: true,
									},
									options: {
										enableSourcing: false,
										ignoreMandatoryFields: true
									}
								});
								
								log.debug('UpdateBBid', UpdateBBid);
								
								var remainingUsage = script.getRemainingUsage();
								log.debug({
									title: 'remainingUsage',
									details: remainingUsage
								});
								if (remainingUsage < 100) {
									var mrTask = task.create({
										taskType: task.TaskType.SCHEDULED_SCRIPT,
										scriptId: 'customscript_sch_bb_main_listing_qty_upd',
										deploymentId: 'customdeploy1'
									});
									
									var taskObj = mrTask.submit();
									
									break;
								}
							}
						} 
						catch (err) {
							log.debug('Internal error', '--> ' + err);
						}
					}
				}
				while (searchResults.length >= 100);
				
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		function UpdateBrokerBinInboundQuantity(){
			try {
			
				var script = runtime.getCurrentScript();
				//var number = Number(script.getParameter({name:'custscript_index_val'}));
				//log.debug({ title:'number', details: number });
				
				var BrokerBinSearch = search.load({
					id: 'customsearch_bb_inbound_updates'
				});
				
				var searchid = 0;
				
				var j = 0;
				
				do {
					var searchResults = BrokerBinSearch.run().getRange(searchid, searchid + 1000);
					
					if (searchResults != null && searchResults != '' && searchResults != undefined) {
						try {
							j++;
							log.debug('search', '--> ' + searchResults.length);
							
							for (var Trans in searchResults) {
								var result = searchResults[Trans];
								var columnLen = result.columns.length;
								
								
								var BBQty = '';
								var POQTY = '';
								var BBInternalID = '';
								
								for (var t = 0; t < columnLen; t++) {
									var column = result.columns[t];
									var LabelName = column.label;
									var fieldName = column.name;
									var value = result.getValue(column);
									var text = result.getText(column);
									if (fieldName == 'internalid') {
										BBInternalID = value
									}
									if (LabelName == 'BBQTY') {
										BBQty = value
									}
									if (LabelName == 'POQTY') {
										POQTY = value
									}
								}
								searchid++;
								
								var UpdateBBid = record.submitFields({
									type: 'customrecord_bbl',
									id: BBInternalID,
									values: {
										custrecord_bbl_listed_brokerbin_quantity: POQTY,
										custrecord_bbl_update: true,
									},
									options: {
										enableSourcing: false,
										ignoreMandatoryFields: true
									}
								});
								
								log.debug('UpdateBBid', UpdateBBid);
								
								var remainingUsage = script.getRemainingUsage();
								log.debug({
									title: 'remainingUsage',
									details: remainingUsage
								});
								if (remainingUsage < 100) {
									var mrTask = task.create({
										taskType: task.TaskType.SCHEDULED_SCRIPT,
										scriptId: 'customscript_sch_bb_qty_update',
										deploymentId: 'customdeploy1'
									});
									
									var taskObj = mrTask.submit();
									
									break;
								}
							}
						} 
						catch (err) {
							log.debug('Internal error', '--> ' + err);
						}
					}
				}
				while (searchResults.length >= 100);
				
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		return {
			execute: executeUpdateMainListingQty
		};
	});