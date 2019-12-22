function sc_project_total(){
var time = nlapiGetFieldValue('custrecord_sc_bd_time'); 
  var additional_charge = nlapiGetFieldValue('custrecord_sc_bd_additional_charge');
  var approve = nlapiGetFieldValue('custrecord_sc_bd_approved');
  
  if(approve === 'T'){
 var sc_project_id = nlapiGetFieldValue('custrecord_sc_bd_project');
 var internal_id = nlapiLookupField('customrecord_smart_consultant', sc_project_id, 'internalid'); 
    
  var project_record = nlapiLoadRecord('customrecord_smart_consultant',internal_id);
    
    var current_time = nlapiLookupField('customrecord_smart_consultant', sc_project_id, 'custrecord_total_hours'); 
	var current_add_charges = nlapiLookupField('customrecord_smart_consultant', sc_project_id, 'custrecord_additional_charges');
    var final_time = 0 
    var final_add_charges = 0 
    
    		if(current_time === null || current_time === '')
              current_time = parseFloat(0);
            
    		if(current_add_charges === null || current_add_charges === '')
              current_add_charges = parseFloat(0)
    
    
   			if(time != null &&  time !='')
             final_time = parseFloat(current_time) + parseFloat(time);
    		else
              final_time = current_time
             if(additional_charge != null && additional_charge !='' )
             final_add_charges = parseFloat(additional_charge) + parseFloat(current_add_charges);
    		 else
               final_add_charges = current_add_charges
    
    
    
  nlapiLogExecution('Debug', ' id', internal_id);
      nlapiLogExecution('Debug', ' record', project_record);

      nlapiLogExecution('Debug', ' current time', current_time); 
      nlapiLogExecution('Debug', ' added time', time); 
      nlapiLogExecution('Debug', ' final_time', final_time); 
    
    
    
      nlapiLogExecution('Debug', ' current charge', current_add_charges); 
      nlapiLogExecution('Debug', ' added charge', additional_charge); 
      nlapiLogExecution('Debug', ' final charge', final_add_charges); 


     project_record.setFieldValue('custrecord_total_hours', final_time);
     project_record.setFieldValue('custrecord_additional_charges', final_add_charges); 
    
    nlapiSubmitRecord(project_record);
    
  }
}
