/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function beforeSubmit(context) {

            var newRecord = context.newRecord;
            var tran_id = newRecord.getValue({
                fieldId: 'tranid'
            })
            var purchaseorderSearchObj = search.create({
                type: "purchaseorder",
                filters:
                [
                   ["type","anyof","PurchOrd"], 
                   "AND", 
                   ["number","equalto",tran_id], 
                   "AND", 
                   ["taxline","is","F"], 
                   "AND", 
                   ["shipping","is","F"], 
                   "AND", 
                   ["item","noneof","@NONE@"]
                ],
                columns:
                [
                   search.createColumn({
                      name: "formulanumeric",
                      summary: "SUM",
                      formula: "({custcol_brokerbin_first_price}-{rate})*{quantity}",
                      label: "Formula (Numeric)"
                   })
                ]
             });
       
            var results = purchaseorderSearchObj.run();
            var resultsRange = results.getRange(0, 1);

            if (resultsRange.length > 0) {

                var approx_gross_profit = resultsRange[0].getValue({
                    name: "formulanumeric",
                     summary: "SUM",
                     formula: "({custcol_brokerbin_first_price}-{rate})*{quantity}"
                });
            }
        

            newRecord.setValue({
                fieldId: 'custbody_approx_gross_profit',
                value: approx_gross_profit
            });
        
        }
        return {
            beforeSubmit: beforeSubmit,
        };

    });
