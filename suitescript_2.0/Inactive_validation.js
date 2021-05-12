/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
/*Create by Livio Beqiri 05-06-2020*/
define(['N/error'],
    function(error) {

        function saveRecord(context) {
            var currentRecord = context.currentRecord;

            var inactive = currentRecord.getValue({
                fieldId: 'isinactive'
            });
            var on_hand = currentRecord.getValue({
                fieldId: 'totalquantityonhand'
            });
 
            if(inactive === true){
             
                if(on_hand>0){
              
                throw error.create({
                    name: 'Quantity on hand is greater than 0',
                    message: 'You cant inactivate an item that has quantity on hand'
                });
                }
              }
            return true;
              
        }

        return {
            saveRecord: saveRecord
        };
    });