function webstore_hide_matrix_options() {

      var hide_matrix_options = 'true' ; 
  		
      var related_item_id = 1;
      var i = 1; 
  	  var item_name = nlapiGetFieldValue('itemid') ; 
      while(related_item_id != null){
      var related_item_id = nlapiGetLineItemValue('presentationitem','presentationitem',i);
        // nlapiLogExecution('Debug', 'Related Item Id', related_item_id);
        if(related_item_id != '' &&  related_item_id != null ) {
          // nlapiLogExecution('Debug', 'Related Item Id', i);
         // nlapiLogExecution('Debug', 'Related Item Id', related_item_id);
        related_item_id = related_item_id.toString();
        related_item_id = related_item_id.substring(0, related_item_id.length - 9);
        var child_record  = nlapiLoadRecord('inventoryitem', related_item_id) ; 
        var logged_in_price = child_record.getLineItemValue('price1', 'price_1_', 10);
        //nlapiLogExecution('Debug','Logged in price', logged_in_price); 
    if(logged_in_price !=null ){
          hide_matrix_options = 'false';
        }
         i = i+1
          
        }
        }
  
  		nlapiLogExecution('Debug', 'Item name : ', item_name);
  		nlapiLogExecution('Debug', 'Hide Matrix Options', hide_matrix_options); 
      if(hide_matrix_options === 'true'){
          nlapiSetFieldValue('custitem_awa_is_custom_parent', 'F');
        }
  	  else{
          nlapiSetFieldValue('custitem_awa_is_custom_parent', 'T');
      }
  
  
  
}
