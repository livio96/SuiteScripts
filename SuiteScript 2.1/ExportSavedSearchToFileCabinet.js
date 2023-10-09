/**
*@NApiVersion 2.1
*@NScriptType ScheduledScript
 */
define(['N/search', 'N/record', 'N/log', 'N/task'], (search, record, log, task) => {
    let execute = (c) => {

    //________Brokerbin Inventory List
    //Brokerbin Inventory with First Choice Price [Do not Delete]
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

    //____________Business Price Inventory List_____________________
   //Brokerbin Inventory with Business Price [Do not Delete]
     savedSearchId = 381057;
        var myTask = task.create({
            taskType: task.TaskType.SEARCH
        });
        myTask.savedSearchId = savedSearchId;
        myTask.fileId = 19703332;
         myTaskId = myTask.submit();
         taskStatus = task.checkStatus({
            taskId: myTaskId
        });

    // Optionally, add logic that executes when the task is complete
    if (taskStatus.status === task.TaskStatus.COMPLETE) {
        log.debug('export completed', 'export completed'); 
    }
      
    }


    return {
        execute: execute
    };
}
);
