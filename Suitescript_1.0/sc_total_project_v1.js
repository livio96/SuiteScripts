function sc_project_total(){

  var approved = nlapiGetFieldValue('custrecord_sc_bd_approved');
  var sc_project_id = nlapiGetFieldValue('custrecord_sc_bd_project');
  var internal_id = nlapiLookupField('customrecord_smart_consultant', sc_project_id, 'internalid'); 
  
  
  var project_record = nlapiLoadRecord('customrecord_smart_consultant',internal_id);
  
  	var customrecord_sc_breakdownSearch = nlapiSearchRecord("customrecord_sc_breakdown",null,
[
   ["custrecord_sc_bd_project.internalidnumber","equalto",internal_id]
], 
[
   new nlobjSearchColumn("custrecord_sc_bd_additional_charge"), 
   new nlobjSearchColumn("custrecord_sc_bd_approved"), 
   new nlobjSearchColumn("custrecord_sc_bd_time")
]
);
  
  	var additional_charge = 0; 
  		var approved = 'F'; 
  		var time = 0; 
        var total_charges = 0 ; 
        var total_time = 0;
  		var i = 0 ; 
  	 if (customrecord_sc_breakdownSearch){
        
  		for( i=0 ; i< customrecord_sc_breakdownSearch.length; i++ ){
           approved = customrecord_sc_breakdownSearch[i].getValue('custrecord_sc_bd_approved');
           additional_charge = customrecord_sc_breakdownSearch[i].getValue('custrecord_sc_bd_additional_charge');
           time = customrecord_sc_breakdownSearch[i].getValue('custrecord_sc_bd_time');
         	 //nlapiLogExecution('Debug', 'approve', approved ) ; 
              //nlapiLogExecution('Debug', 'additional_charge', additional_charge)
              //nlapiLogExecution('Debug', 'time' , time)
           if(approved === 'T') {

             if(time != null &&  time !='')
             total_time += parseFloat(time);
             if(additional_charge != null && additional_charge !='' )
             total_charges += parseFloat(additional_charge)
           }
          
          
        }
       
            //nlapiLogExecution('Debug', 'total_time', total_time);
           // nlapiLogExecution('Debug', 'total charges', total_charges);
			project_record.setFieldValue('custrecord_total_hours', total_time);
    	    project_record.setFieldValue('custrecord_additional_charges', total_charges); 
    
    nlapiSubmitRecord(project_record);
  		
     } 

 
}
