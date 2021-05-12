/**
 *@NApiVersion 2.x
 *@NScriptType MapReduceScript
 */
define([
    'N/search',
    'N/record',
    'N/log'
], function (
    nSearch,
    nRecord,
    nLog
) {
    return {
        config: {
            exitOnError: false //default
        },

        /*This function gets the customers created in the day.*/
        getInputData: function getInputData() {
            return nSearch.create({
                type: 'commercecategory',
                filters: [
                    [
                        'catalog', 'is', 1
                    ],
                    'AND',
                    ['externalid', 'anyof', '@NONE@']
                ],
                columns: [
                    'internalid',
                    'externalid'
                ]
            });
        },

        map: function map(context) {
            var value = JSON.parse(context.value).values;
            var externalid = value.externalid && value.externalid.value;
            var internalid = context.key;
            nLog.error('externalid', externalid);
            nLog.error('internalid', internalid);
            if (internalid) {
              nLog.error('internalid2', internalid);
                nRecord.submitFields({
                    type: 'commercecategory',
                    id: internalid,
                    values: {
                        externalid: internalid
                    }
                });
                /* var category = nRecord.load({
                    type: 'commercecategory',
                    id: internalid
                });

                category.setValue('externalid', internalid);

                category.save(); */
            }
        }
    };
});
