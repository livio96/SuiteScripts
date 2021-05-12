/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/record','N/log'],

    function(record,log) {

        function beforeSubmit(context) {
            String.prototype.includes = function (str) {
                var returnValue = false;
              
                if (this.indexOf(str) !== -1) {
                  returnValue = true;
                }
              
                return returnValue;
              };

            var record = context.newRecord;

            var subtotal = record.getValue({fieldId: 'subtotal'});
            var etailChannel = record.getValue({fieldId: 'custbody_celigo_etail_channel'});
            var prime = record.getValue({fieldId: 'custbody25'});
            var fulfillmentChannel = record.getValue({fieldId: 'custbody_celigo_etail_channel'})
            var terms = record.getValue({fieldId: 'terms'})
            var shippingnote = record.getValue({fieldId: 'custbodyshippinginstructions'})
            var shippingcost = record.getValue('shippingcost');
            //var shipvia = record.getValue({fieldId: 'shipmethod'})

            if(etailChannel != null && etailChannel != '' && etailChannel != undefined){
                if(fulfillmentChannel != 'FBA' && subtotal <= 50 && prime == false && terms != 16 && shippingcost == 0){
                    if(shippingnote == null || shippingnote == '' || shippingnote == undefined){
                        record.setValue({
                            fieldId: 'custbodyshippinginstructions',
                            value: 'Ship via Cheapest Method'
                        });
                    }
                    else if(shippingnote.includes("Ship via Cheapest Method")){

                    }
                    else{
                        record.setValue({
                            fieldId: 'custbodyshippinginstructions',
                            value: shippingnote+"\nShip via Cheapest Method"
                        })
                    }
                }
            }
        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });