/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/file','N/task'],
    function(render, search, record, email, runtime, file, task){
		function executeremovecustomeraddress(context){
			try {
			
				var script = runtime.getCurrentScript();
				
				var RemoveCustomerAddressSearch = search.load({
					id: 'customsearch_remove_customer_address'
				});
				
				var searchid = 0;
				
				do {
					var searchResults = RemoveCustomerAddressSearch.run().getRange(searchid, searchid + 1000);
					
					if (searchResults != null && searchResults != '' && searchResults != undefined) {
						for (var Trans in searchResults) {
							var result = searchResults[Trans];
							var columnLen = result.columns.length;
							
							var InternalID = '';
							var Stage = '';
							
							for (var t = 0; t < columnLen; t++) {
								var column = result.columns[t];
								var LabelName = column.label;
								var fieldName = column.name;
								var value = result.getValue(column);
								var text = result.getText(column);
								if (fieldName == 'internalid') {
									InternalID = value
								}
								if (fieldName == 'stage') {
									Stage = value
								}
							}
							try {
								log.debug('InternalID', InternalID);
								log.debug('Stage', Stage);
								
								var CustomerObj = '';
								
								if (Stage == "CUSTOMER") {
									CustomerObj = record.load({
										type: 'customer',
										id: InternalID,
										isDynamic: true,
									});
								}
								if (Stage == "LEAD") {
									CustomerObj = record.load({
										type: 'lead',
										id: InternalID,
										isDynamic: true,
									});
								}
								if (Stage == "PROSPECT") {
									CustomerObj = record.load({
										type: 'prospect',
										id: InternalID,
										isDynamic: true,
									});
								}
								
								var numLines = CustomerObj.getLineCount({
									sublistId: 'addressbook'
								});
								log.debug('numLines', numLines);
								
								for (var z = numLines - 1; z >= 0; z--) {
								
									CustomerObj.removeLine({
										sublistId: 'addressbook',
										line: z
									});
								}
								
								CustomerObj.setValue('custentity_merged', false);
								
								var recordId = CustomerObj.save({
									enableSourcing: true,
									ignoreMandatoryFields: true
								});
								log.debug('recordId', recordId);
								
								var remainingUsage = script.getRemainingUsage();
								log.debug({
									title: 'remainingUsage',
									details: remainingUsage
								});
								
								if (remainingUsage < 500) 
								{
									var mrTask = task.create({
										taskType: task.TaskType.SCHEDULED_SCRIPT,
										scriptId: 'customscript_sch_remove_customer_address',
										deploymentId: 'customdeploy1'
									});
									
									var taskObj = mrTask.submit();
									
									break;
								}
							} 
							catch (err) 
							{
								log.debug('error', '--> ' + err);
							}
							searchid++;
						}
					}
				}
				while (searchResults.length >= 1000);
				
				
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		return {
			execute: executeremovecustomeraddress
		};
	});