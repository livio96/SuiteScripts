/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/record', 'N/log', 'N/task'],
    function (record, log, task) {
        function submitScheduledScriptTask(con) {
            var rec = con.newRecord;
            var ueContext = con.type;
            //if context is not create or delete
            if (ueContext != 'create' && ueContext != 'delete') {
                var csvTaskID = rec.getValue('custrecord_ireq_task_id');
                var status = rec.getValue('custrecord_ireq_status');
                //if CSV Task has not been submitted and record status is approved
                if ((csvTaskID == null || csvTaskID == undefined || csvTaskID == '') && status == 2){
                    try {
                        var scriptTask = task.create({taskType: task.TaskType.SCHEDULED_SCRIPT});
                        scriptTask.scriptId = 2499;
                        scriptTask.deploymentId = 'customdeploy2';
                        scriptTask.submit();

                        //log.debug('Script Task', 'Submitted');
                    }
                    catch (err){
                        log.error('Error @ Script Task Submit', err);
                    }
                }
            }
        };
        return {
            beforeSubmit: submitScheduledScriptTask
        };

    });