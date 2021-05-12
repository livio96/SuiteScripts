/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function beforeSubmit(context) {

            var newRecord = context.newRecord;

            var source = newRecord.getValue({
                fieldId: 'source'
            });
          
           log.debug({
             title: 'Triggered', 
             details: source
           }); 

            if(source === 'Customer Center'){

          
           log.debug({
             title: 'Triggered', 
             details: 'Triggered'
           }); 

           var created_from = newRecord.getValue({
                fieldId: 'createdfrom'
            });
        
            var proposal = record.load({
                            type: record.Type.ESTIMATE,
                            id: created_from,
                            isDynamic: true,
                        });
            

            var shipping_cost = proposal.getValue({
                fieldId: 'shippingcost'
            });
              
              log.debug({
             title: 'Triggered', 
             details: shipping_cost
           }); 

            var Po_num = proposal.getValue({
                fieldId: 'custbody_purchase_order_num'
            });
              
              log.debug({
             title: 'Triggered', 
             details: Po_num
           }); 



             newRecord.setValue({
                fieldId: 'shippingcost',
                value:shipping_cost
            });
          
          newRecord.setValue({
                fieldId: 'otherrefnum',
                value:Po_num
            });
           

}

        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });