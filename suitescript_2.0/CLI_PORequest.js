/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/currentRecord','N/https','N/url'],

    function(record, currentRecord, https, url){
        function validateLine_ApproveStatus(context){
            var currentRecord = context.currentRecord;
            var sublistName = context.sublistId;
            if (sublistName == 'recmachcustrecord_por_popro') {
                var ApproveStatus = currentRecord.getCurrentSublistValue({
                    sublistId: sublistName,
                    fieldId: 'custrecord_por_status'
                });

                if (ApproveStatus == 5) {
                    var Item = currentRecord.getCurrentSublistValue({
                        sublistId: sublistName,
                        fieldId: 'custrecord_por_item'
                    });

                    if (Item != null && Item != '' && Item != undefined) {

                    }
                    else {
                        alert('Please select an item.');
                        return false;
                    }
                }
            }
            return true;
        }
        function createpurchaseorder(scriptContext){
            try {
                var cur_record = currentRecord.get().id;

                var get_url = url.resolveScript({
                    scriptId: "customscript_sut_createpofromrequest",
                    deploymentId: "customdeploy1",
                    returnExternalUrl: true
                });

                get_url += ('&porequestid=' + cur_record);
                get_url += ('&porequesttype=create');
                //alert(get_url);

                var response = https.request({
                    method: https.Method.GET,
                    url: get_url
                });


                alert(response.body)
                window.location.reload();

            }
            catch (er) {
                console.log('err', er)
            }
        }
        function closepurchaseorder(scriptContext){
            try {
                var cur_record = currentRecord.get().id;

                var get_url = url.resolveScript({
                    scriptId: "customscript_sut_createpofromrequest",
                    deploymentId: "customdeploy1",
                    returnExternalUrl: true
                });

                get_url += ('&porequestid=' + cur_record);
                get_url += ('&porequesttype=close');
                //alert(get_url);

                var response = https.request({
                    method: https.Method.GET,
                    url: get_url
                });


                alert(response.body)
                window.location.reload();
            }
            catch (er) {
                console.log('err', er)
            }
        }
        return {
            validateLine: validateLine_ApproveStatus,
            createpurchaseorder:createpurchaseorder,
            closepurchaseorder:closepurchaseorder,

        };
    });