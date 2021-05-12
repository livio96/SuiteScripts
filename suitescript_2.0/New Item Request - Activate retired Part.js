function new_item_request_workflow_action() {

    nlapiLogExecution('Debug', 'Activate Retired', 'Triggered');
    var item_name_to_search =  nlapiGetFieldValue('custrecord_retired_item');

    if(item_name_to_search != null) {
    var itemSearch = nlapiSearchRecord("item", null,
        [
            ["isinactive", "is", "T"],
            "AND",
            ["name", "contains", item_name_to_search]
        ],
        [
            new nlobjSearchColumn("itemid").setSort(false),
            new nlobjSearchColumn("internalid")

        ]
    );
    }

    if(itemSearch){
    	var internal_id = itemSearch[0].getValue('internalid');
        var item_record = nlapiLoadRecord('inventoryitem', internal_id);

        item_record.setFieldValue('isinactive', 'F');
        item_record.setFieldValue('custitem_inactive_reason', 'inactivated before workflow')
        nlapiSubmitRecord(item_record);
      
    }





}