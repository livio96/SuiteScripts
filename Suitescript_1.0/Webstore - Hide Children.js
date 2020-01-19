//Suitescript 1.0
//If a parent item is hidden from the site (display in sca = F), hide all inventory items associated with it
//Created by Livio Beqiri on 1.18.2020

function webstore_hide_children() {

    //Get first related item
    var child_item_id = nlapiGetLineItemValue('presentationitem', 'presentationitem', 1);
    //Check if at least one related item exists
    if (child_item_id != null && child_item_id != '') {
        var parent_display_website = nlapiGetFieldValue('isonline');
        var parent_display_sca = nlapiGetFieldValue('custitem_display_sca');
        var i = 1;
    //When display in sca is F - set Display in website to F
        if (parent_display_sca === 'F') {
            nlapiSetFieldValue('isonline', 'F');
            //Iterate through all related items and set Display in sca and website to F
            while (child_item_id != null) {
                child_item_id = nlapiGetLineItemValue('presentationitem', 'presentationitem', i);
                if(child_item_id != null){
                nlapiLogExecution('Debug', 'Triggered', 'Triggered');
                child_item_id = child_item_id.toString();
                child_item_id = child_item_id.substring(0, child_item_id.length - 9);
                i = i + 1;
                var child_record = nlapiLoadRecord('inventoryitem', child_item_id);
                child_record.setFieldValue('isonline', 'F');
                child_record.setFieldValue('custitem_display_sca', 'F');
                nlapiSubmitRecord(child_record);
            }
            }
        }
    }

}