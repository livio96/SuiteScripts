function webstore_hide_matrix_options(rec_type, rec_id) {

  var record = nlapiLoadRecord(rec_type, rec_id); 
  var item_name = record.getFieldValue('itemid');    
    
		var hide_matrix_options = 'true';
  		 var related_item_id = 1;
   		var i = 1; 

   	while(related_item_id != null){
     	 var related_item_id = record.getLineItemValue('presentationitem','presentationitem',i);
        		//nlapiLogExecution('Debug', 'Related_item_id', related_item_id)
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
  
     				
          			// if no webstore logged in price 
    				if(hide_matrix_options === 'true'){
                      	//nlapiLogExecution('Debug', 'Changing Value to False', 'Changing value to False');
          				record.setFieldValue('custitem_awa_is_custom_parent', 'F');
                        //var web_matrix_parent = record.getFieldValue('custitem_awa_is_custom_parent');
                       // nlapiLogExecution('Debug', 'Web is matrix parent' , web_matrix_parent)
                        nlapiLogExecution('Debug','Item Name: ', item_name)
  						nlapiLogExecution('Debug', 'Hide Matrix Options: ', hide_matrix_options)
                        nlapiSubmitRecord(record);
        			}
        			else{
                     	 nlapiLogExecution('Debug','Item Name: ', item_name)
  						nlapiLogExecution('Debug', 'Hide Matrix Options: ', hide_matrix_options)
        			   record.setFieldValue('custitem_awa_is_custom_parent', 'T');
                      	nlapiSubmitRecord(record);
      				}
  
          
        }

  	
  

