/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */
define([], function() {
    function onAction(scriptContext){
        
         var comp_item = newRecord.getValue({
                    fieldId: 'custrecord_cmp_cmp_item',
                });

                var item = newRecord.getValue({
                    fieldId: 'custrecord_cmp_item',
                });

            var jenne_cost = newRecord.setValue({
                    fieldId: 'externalid',
                    value: comp_item + item
                });

              


        log.debug({
            title: 'End Script'
        });
        return 1;
    }
    return {
        onAction: onAction
    }
}); 