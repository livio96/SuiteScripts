/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */

define(['N/record', 'N/runtime', 'N/file', 'N/format', 'N/log', 'N/task'],
    function(record, runtime, file, format, log, task) {
        function approveImport(con) {
            //Load Record
            var recordType = con.newRecord.type;
            var recordID = con.newRecord.id;
            var ireqRec = record.load({
                type: recordType,
                id: recordID
            });
            //Try CSV Import
            try {
                //Get File and CSVImportID
                var attachedFile = ireqRec.getValue('custrecord_ireq_import_file');
                var csvImportID = ireqRec.getValue('custrecord_ireq_csv_id');
                var importFileObj = file.load(attachedFile);

                //Submit Task
                var importTask = task.create({taskType: task.TaskType.CSV_IMPORT});
                importTask.mappingId = csvImportID;
                importTask.importFile = importFileObj;
                var importTaskResponseObj = importTask.submit();

                log.debug('task', 'Submitted');
                log.debug('taskObj', importTaskResponseObj);
                
                //Change Status to Approved
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_status: 2
                    }
                });
            }
            catch(err){
                log.debug('Error', err);
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_status: 4
                    }
                });
            }
        };
        return {
            onAction: approveImport
        };

    });
