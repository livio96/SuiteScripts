/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record'],
    function(record) {
        function beforeLoad(context) {
            if (context.type !== context.UserEventType.CREATE)
                return;
            var customerRecord = context.newRecord;
            customerRecord.setValue('phone', '555-555-5555');
            if (!customerRecord.getValue('salesrep'))
                customerRecord.setValue('salesrep', 46); 
        }
        function beforeSubmit(context) {
            if (context.type !== context.UserEventType.CREATE)
                return;
            var customerRecord = context.newRecord;
            customerRecord.setValue('comments', 'Please follow up with this customer!');
        }
        function afterSubmit(context) {
            
