/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define(['N/search','N/ui/serverWidget','N/https','N/runtime','N/record', 'N/log'],
    function(search, serverWidget, https, runtime, record, log) {
        function beforeLoad(scriptContext) {
            try {
                var currentForm = scriptContext.form;

                if (scriptContext.type == 'view') {
                    currentForm.clientScriptFileId = 15078176;//BrokerBinListingAction.js

                    currentForm.addButton({
                        id: 'custpage_Approve',
                        label: 'Approve',
                        functionName: 'approve'
                    })

                    currentForm.addButton({
                        id: 'custpage_Reject',
                        label: 'Reject',
                        functionName: 'reject'
                    })
                  
                  	currentForm.addButton({
                        id: 'custpage_Default',
                        label: 'Restore Defaults',
                        functionName: 'resetToDefaults'
                    })
                }
            } catch (err) {
                log.debug({
                    title: 'Error @ BeforeLoad',
                    details: err
                });
            }
        };

        return {
            beforeLoad: beforeLoad,
        };

});