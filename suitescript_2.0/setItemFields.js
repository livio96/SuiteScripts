/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define([
    'N/record',
    'N/log'
     
], function associatedItems(
    nRecord,
    nLog
) {

    return {
        beforeSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
            var selections = newRecord.getValue({ fieldId: 'custitem_associated_item_list' });
			log.debug(selections);			
                if (selections) {
                        newRecord.setValue({
                            fieldId: 'custitem_associated_items',
                            value: selections.toString()
                        });
                }

            } 
        } 
    }

});