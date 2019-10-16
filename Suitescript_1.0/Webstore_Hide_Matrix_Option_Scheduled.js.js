function webstore_hide_matrix_options() {

    var hide_matrix_options = 'true' ; 

  var noninventoryitemSearch = nlapiSearchRecord("noninventoryitem",null,
[
  ["isinactive","is","F"], 
   "AND", 
   ["name","doesnotcontain","-Retired"], 
   "AND", 
   ["type","anyof","NonInvtPart"]
], 
[
   new nlobjSearchColumn("itemid").setSort(false), 
   new nlobjSearchColumn("internalid"),
   new nlobjSearchColumn("name")

    
]
);
  
  nlapiLogExecution('Debug', 'Entry', 'Entry') ; 
  nlapiLogExecution('Debug', 'saved serch length', noninventoryitemSearch.length)
  if(noninventoryitemSearch){
   var count = 0 ;
    
    	while(count<noninventoryitemSearch.length ){
    
 		 var item_id = noninventoryitemSearch[count].getValue('internalid'); 
  		 var item_name = noninventoryitemSearch[count].getValue('name'); 

  		 var record = nlapiLoadRecord('noninventoryitem', item_id)  
  		 var related_item_id = 1;
   		 var i = 1; 
  
   	while(related_item_id != null){
     	 var related_item_id = record.getLineItemValue('presentationitem','presentationitem',i);
        		
     			if(related_item_id != '' &&  related_item_id != null ) {
       				 related_item_id = related_item_id.toString();
       				 related_item_id = related_item_id.substring(0, related_item_id.length - 9);
       				 var child_record  = nlapiLoadRecord('inventoryitem', related_item_id) ; 
       				 var logged_in_price = child_record.getLineItemValue('price1', 'price_1_', 10);
          
         			 if(logged_in_price !=null ){
          				hide_matrix_options = 'false';
        			}
         			i = i+1
         
        		}
       }
  
  					nlapiLogExecution('Debug', 'Item Name : ', item_name);
  					nlapiLogExecution('Debug', 'Hide Matrix Options', hide_matrix_options); 
     				
          			// if no webstore logged in price 
    				if(hide_matrix_options === 'true'){
                      	nlapiLogExecution('Debug', 'Changing Value to False', 'Changing value to False');
          				record.setFieldValue('custitem_awa_is_custom_parent', 'F');
                        var web_matrix_parent = record.getFieldValue('custitem_awa_is_custom_parent');
                        nlapiLogExecution('Debug', 'Web is matrix parent' , web_matrix_parent)
                      	nlapiSubmitRecord(record);
        			}
        			else{
        			   record.setFieldValue('custitem_awa_is_custom_parent', 'T');
      				}
          
          count = count + 1;
          
        }

  	}
  
}
