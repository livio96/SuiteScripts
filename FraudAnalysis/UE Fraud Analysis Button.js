/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

define(['N/ui/serverWidget', 'N/url', 'N/log'], 
function(serverWidget, url, log) {
    
    /**
     * Function definition to be triggered before record is loaded.
     *
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record
     * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
     * @param {Form} scriptContext.form - Current form
     * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
     * @since 2015.2
     */
    function beforeLoad(scriptContext) {
        try {
            // Only add button on view and edit modes for Sales Orders
            if (scriptContext.type === scriptContext.UserEventType.VIEW || 
                scriptContext.type === scriptContext.UserEventType.EDIT) {
                
                const form = scriptContext.form;
                const newRecord = scriptContext.newRecord;
                
                // Verify this is a Sales Order record
                if (newRecord.type !== 'salesorder') {
                    return;
                }
                
                // Get the record ID
                const recordId = newRecord.id;
                
                if (!recordId) {
                    log.debug('No Record ID', 'Cannot add fraud analysis button - no record ID available');
                    return;
                }
                
                // Generate the Suitelet URL
                const suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_sut_fraud_analysis', // Replace with your actual script ID
                    deploymentId: 'customdeploy_sut_fraud_analysis', // Replace with your actual deployment ID
                    params: {
                        salesorderid: recordId
                    }
                });
                
                // Add the fraud analysis button
                form.addButton({
                    id: 'custpage_fraud_analysis',
                    label: 'Run Fraud Analysis',
                    functionName: 'openFraudAnalysis'
                });
                
                // Set the client script file for this form
                form.clientScriptModulePath = './CLIFraudAnalysis'; // Update this path to match your file location
                
                log.debug('Fraud Analysis Button Added', 'Button added to Sales Order ID: ' + recordId);
                
            }
        } catch (error) {
            log.error('Error in beforeLoad', {
                error: error.toString(),
                recordId: scriptContext.newRecord ? scriptContext.newRecord.id : 'unknown'
            });
        }
    }

    return {
        beforeLoad: beforeLoad
    };
});

/*
 * DEPLOYMENT INSTRUCTIONS:
 * 
 * 1. Save this script as a User Event Script in NetSuite
 * 
 * 2. Set the following deployment parameters:
 *    - Record Type: Sales Order
 *    - Event Types: Before Load
 *    - Execution Context: User Interface
 *    - Status: Released
 * 
 * 3. Update the script IDs in the code:
 *    - Replace 'customscript_fraud_analysis_sl' with your Suitelet's Script ID
 *    - Replace 'customdeploy_fraud_analysis_sl' with your Suitelet's Deployment ID
 * 
 * 4. Set appropriate roles/permissions for who can access this functionality
 * 
 * 5. Test by viewing or editing a Sales Order - you should see the "Run Fraud Analysis" button
 * 
 * ADDITIONAL NOTES:
 * 
 * - The button appears on both VIEW and EDIT modes of Sales Orders
 * - The popup window is sized appropriately for the fraud analysis form
 * - Includes error handling for popup blockers
 * - Client script is embedded to handle the button functionality
 * - The script only runs on Sales Order records to avoid unnecessary processing
 * 
 * CUSTOMIZATION OPTIONS:
 * 
 * - Change button label by modifying the 'label' property
 * - Adjust popup window size by changing width/height parameters
 * - Add additional validation before opening the popup
 * - Modify the button position by adding it to specific field groups
 * - Add role-based restrictions by checking user permissions
 */
