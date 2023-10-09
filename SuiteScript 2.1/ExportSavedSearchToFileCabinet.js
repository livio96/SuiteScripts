/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
define(['N/search', 'N/record', 'N/log', 'N/task'], (search, record, log, task) => {
    let execute = (c) => {

        //Saved search ID
        const savedSearchId = 379596;

        var myTask = task.create({
            taskType: task.TaskType.SEARCH
        });

        myTask.savedSearchId = savedSearchId;


        myTask.fileId = 17576240;


        var myTaskId = myTask.submit();

        var taskStatus = task.checkStatus({
            taskId: myTaskId
        });

        if (taskStatus.status === task.TaskStatus.COMPLETE) {
            log.debug('export completed', 'export completed');
        }

    }


    return {
        execute: execute
    };
});
