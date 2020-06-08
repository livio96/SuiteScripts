/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/task'],
    function(render, search, record, email, runtime, task){
		function executeMergeDuplicateCustomer(context){
			try {
              var DuplicateCustomer = new Array();
				var script = runtime.getCurrentScript();
				
				var DuplicateCustSearchRes = search.create({
					type: record.Type.CUSTOMER,
					filters: [["custentity_merged", "is", "T"]],
					columns: [search.createColumn({
						name: 'internalid',
						label: 'Internal ID'
					})]
				}).run().getRange(0, 1000);
				
				if (DuplicateCustSearchRes != null && DuplicateCustSearchRes != '' && DuplicateCustSearchRes != undefined) {
				
					log.debug('Total Duplicate Customer ', '--> ' + DuplicateCustSearchRes.length);
					for (var t = 0; t < DuplicateCustSearchRes.length; t++) {
						var CustomerID = DuplicateCustSearchRes[t].getValue({
							name: 'internalid'
						});
						
						DuplicateCustomer.push(CustomerID);
					}
					var dedupeTask = task.create({
						taskType: task.TaskType.ENTITY_DEDUPLICATION
					});
					dedupeTask.entityType = task.DedupeEntityType.CUSTOMER;
					dedupeTask.dedupeMode = task.DedupeMode.MERGE;
					dedupeTask.masterSelectionMode = task.MasterSelectionMode.SELECT_BY_ID;
					dedupeTask.masterRecordId = 29065;
					dedupeTask.recordIds = DuplicateCustomer;
					var dedupeTaskId = dedupeTask.submit();
					log.debug('dedupeTaskId', '--> ' + dedupeTaskId);
                  
                  var dedupeTaskStatus = task.checkStatus({
    taskId: dedupeTaskId
    });
                  log.debug('dedupeTaskStatus', '--> ' + dedupeTaskStatus.status);
				
				}
			
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		return {
			execute: executeMergeDuplicateCustomer
		};
	});