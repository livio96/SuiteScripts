function retired_part_number() {

    var current_name =  nlapiGetFieldValue('custrecord_nir_item_name');

    nlapiLogExecution('Debug', 'Test', 'test');
    var itemSearch = nlapiSearchRecord("item", null,
        [
            ["isinactive", "is", "T"],
            "AND",
            ["name", "contains", current_name]
        ],
        [
            new nlobjSearchColumn("itemid").setSort(false),
            new nlobjSearchColumn("costingmethod")

        ]
    );
  
    if(itemSearch){
    	var retired_part_number_name = itemSearch[0].getValue('itemid');
        var costing_method = itemSearch[0].getValue('costingmethod');
          nlapiLogExecution('Debug', 'Test', costing_method);
    	nlapiSetFieldValue('custrecord_retired_item', retired_part_number_name ); 
        nlapiSetFieldValue('custrecord_nir_costing_method', costing_method ); 

      
    }





}
