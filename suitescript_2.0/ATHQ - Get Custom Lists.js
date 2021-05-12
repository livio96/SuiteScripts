/**
 * @NApiVersion 2.0
 * @NScriptType Suitelet
 * @NScriptName ATHQ | Get Custom Lists
 * @NScriptId _athq_get_custom_lists
 */
define([
    'N/search',
    'N/error',
    'N/log'
], function ScGetCustomLists(
    nSearch,
    nError,
    nLog
) {
    'use strict';

    var fieldMapping = {
        name: 'label',
        internalid: 'internalid'
    };

    return {
        onRequest: function onRequest(context) {
            var response = {};
            var lists;

            if (!context.request.parameters || !context.request.parameters.lists) {
                throw nError.create({
                    name: 'SSS_MISSING_REQD_ARGUMENT',
                    message: 'Lists not specified'
                });
            }
			log.debug('context.request.parameters.lists',context.request.parameters.lists);
            lists = context.request.parameters.lists.split(',');

            for (var l = 0; l < lists.length; l++) {
                var list = lists[l];
                var listResult = [];

                if (!/^customlist_\w+$/.test(list)) {
                    throw nError.create({
                        name: 'SSS_MISSING_REQD_ARGUMENT',
                        message: 'Invalid lists'
                    });
                }

                nSearch.create({
                    type: list,
                    columns: [
                        'internalid',
                        'name'
                    ],
                    filters: [
                        nSearch.createFilter({name: 'isinactive', operator: nSearch.Operator.IS, values: 'F'})
                    ]
                }).run().each(function eachResult(entry) {
                    var columns = entry.columns;
                    var data = {};
                    for (var c = 0; c < columns.length; c++) {
                        var column = columns[c];
                        data[fieldMapping[column.name] || column.name] = entry.getValue(column);
                    }
                    listResult.push(data);
                    return true;
                });

                response[list] = listResult;
            }

            context.response.write({ output: JSON.stringify(response) });
        }
    };
});
