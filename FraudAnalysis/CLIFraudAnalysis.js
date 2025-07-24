/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */

define(['N/url', 'N/currentRecord'], 
function(url, currentRecord) {
    
    /**
     * Function to open fraud analysis popup
     * This function will be called by the button
     */
    function openFraudAnalysis() {
        try {
            // Get the current record
            var record = currentRecord.get();
            var recordId = record.id;
            
            if (!recordId) {
                alert('Error: No Sales Order ID found.');
                return;
            }
            
            // Generate the Suitelet URL
            var suiteletUrl = url.resolveScript({
                scriptId: 'customscript_sut_fraud_analysis', // Replace with your actual script ID
                deploymentId: 'customdeploy_sut_fraud_analysis', // Replace with your actual deployment ID
                params: {
                    salesorderid: recordId
                }
            });
            
            console.log('Opening fraud analysis for Sales Order ID:', recordId);
            console.log('Suitelet URL:', suiteletUrl);
            
            // Open fraud analysis in a popup window
            var popup = window.open(
                suiteletUrl,
                'fraudAnalysis',
                'width=1000,height=800,scrollbars=yes,resizable=yes,status=yes,toolbar=no,menubar=no,location=no'
            );
            
            // Focus on the popup window
            if (popup) {
                popup.focus();
            } else {
                alert('Popup blocked! Please allow popups for this site and try again.');
            }
            
        } catch (error) {
            console.error('Error opening fraud analysis:', error);
            alert('Error opening fraud analysis: ' + error.message);
        }
    }
    
    /**
     * Page initialization function
     */
    function pageInit(scriptContext) {
        // Any initialization code can go here
        console.log('Fraud Analysis Client Script loaded');
    }
    
    return {
        pageInit: pageInit,
        openFraudAnalysis: openFraudAnalysis
    };
});
