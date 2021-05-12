function retired_part_number() {

    var current_name =  nlapiGetFieldValue('custrecord_nir_item_name');

    var itemSearch = nlapiSearchRecord("item", null,
        [
            ["isinactive", "is", "T"],
            "AND",
            ["name", "contains", current_name]
        ],
        [
            new nlobjSearchColumn("itemid").setSort(false),
            new nlobjSearchColumn("costingmethod"),
         	new nlobjSearchColumn("isserialitem")

        ]
    );
  
    if(itemSearch){
    	var retired_part_number_name = itemSearch[0].getValue('itemid');
        var costing_method = itemSearch[0].getValue('costingmethod');
        var serialized_item = itemSearch[0].getValue('isserialitem');
        
    	nlapiSetFieldValue('custrecord_retired_item', retired_part_number_name ); 
        nlapiSetFieldValue('custrecord_nir_costing_method', costing_method ); 
      
      	if(serialized_item === 'T')
        nlapiSetFieldValue('custrecord_nir_serialized_r', '1' ); 
        else
        nlapiSetFieldValue('custrecord_nir_serialized_r', '2' ); 


      
    }





}