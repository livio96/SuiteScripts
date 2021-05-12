function smart_task_subtaks_to_main_task(){
	
      nlapiLogExecution('Debug', 'Sucess Status:', 'Success')
	 var subtask_status = nlapiGetFieldValue('custrecord_stst_status'); 
            nlapiLogExecution('Debug', 'subtask Status:', subtask_status)

	 var task_id = nlapiGetFieldValue('custrecord_stst_task'); 
      nlapiLogExecution('Debug', 'task id:', task_id)


	 var task_record = nlapiLoadRecord('customrecord_st', task_id); 
        nlapiLogExecution('Debug', 'task record:', task_record)

     var task_status =  task_record.getFieldValue('custrecord_st_status');
        nlapiLogExecution('Debug', 'task Status:', task_status)


     //if subtask_status === "Pending Response" && task_status = "brand Assigned"
	 if(task_status  === '1' ){
	 	task_record.setFieldValue('custrecord_st_status', '2'); 
             nlapiLogExecution('Debug', 'Sucess Status:', 'Success2')

	 	nlapiSubmitRecord(task_record); 
	 }






}