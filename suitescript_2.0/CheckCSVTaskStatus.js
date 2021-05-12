/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

 define(['N/record', 'N/log', 'N/task'],
 function(record, log, task) {
     function beforeLoadCheckStatus(con){
         try {
           var recordType = con.newRecord.type;
           var recordID = con.newRecord.id;
           var recordObj = record.load({
               type: recordType,
               id: recordID
           });
           var checkTaskID = recordObj.getValue('custrecord_ireq_task_id');
           var CSVImportStatus = recordObj.getValue('custrecord_ireq_csv_status');
		   //log.debug('title', 'Executed Status Check');
           if (checkTaskID != null && checkTaskID != '' && checkTaskID != undefined){
                if (CSVImportStatus != 'COMPLETE'){
                    var csvStatusObj = task.checkStatus({
                        taskId: checkTaskID
                    });

                    //log.debug('csvObj', csvStatusObj);

                    record.submitFields({
                        type: recordType,
                        id: recordID,
                        values: {
                            custrecord_ireq_csv_status: csvStatusObj.status
                        }
                    });
                }
           }
         }
           catch (err){
           log.debug('err', err);
         }
     };
     return {
         beforeLoad: beforeLoadCheckStatus
     };

 });