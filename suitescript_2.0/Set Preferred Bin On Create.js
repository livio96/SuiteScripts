/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {

        function beforeSubmit(context) {

            try {
                var newRecord = context.newRecord;

                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'location',line: 0,value: 1});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'binnumber',line: 0,value: 247});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'preferredbin',line: 0,value: true});
              
                                      newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'location',line: 1,value: 22});
                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'binnumber',line: 1,value: 1132});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'preferredbin',line: 1,value: true});
                      
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'location',line: 2, value: 23});
                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'binnumber',line: 2,value: 1133});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'preferredbin',line: 2,value: true});

                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'location',line: 3,value: 26});
                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'binnumber',line: 3,value: 316});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'preferredbin',line: 3,value: true});

                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'location',line: 4,value: 27});
                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'binnumber',line: 4,value: 419});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'preferredbin',line: 4,value: true});

                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'location',line: 5,value: 28});
                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'binnumber',line: 5,value: 1134});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'preferredbin',line: 5,value: true});
              
                         //not counted warehouse
                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'location',line: 6,value: 32});
                         newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'binnumber',line: 6,value: 2544});
                        newRecord.setSublistValue({sublistId: 'binnumber',fieldId: 'preferredbin',line: 6,value: true});

                       
                    
                         log.debug({
                           title: 'Debug', 
                           details: 'triggered'
                         })
             }
               


           catch (e) {
                log.debug({
                    title: 'Error',
                    details: e
                });
            }   

        }

        return {
            beforeSubmit: beforeSubmit,
        };

    });