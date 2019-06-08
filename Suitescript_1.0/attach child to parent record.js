function afterSubmit(){
 var id = nlapiGetRecordId();
 var type = nlapiGetRecordType();  

 if(type = 'inventoryitem') {  //only if it is child record 

 var rec = nlapiLoadRecord('inventoryitem', id); //loads the child record
 
 var child_jenne_quantity = rec.getFieldValue('custitem15'); //Gets jenne quantity on child record
 
 var par_id = rec.getFieldValue('custitem_awa_custom_parent'); //gets the value of the parent id on child
 
 var parent_store_display_name = nlapiLookupField('noninventoryitem', par_id, 'storedisplayname'); //gets the value of the store display name on the parent record
  
 }

   nlapiLogExecution('Debug', 'parent store display name : ', parent_store_display_name) ; 

   nlapiLogExecution('Debug', 'child jenne Qty : ', child_jenne_quantity) ; 

}
