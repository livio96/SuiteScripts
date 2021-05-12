/**
 *@NApiVersion 2.x
 *@NScriptType MapReduceScript
 */
define([
    'N/search',
    'N/record',
    'N/runtime',
    'N/file',
    'N/log'
], function CategoriesCSV(
    nSearch,
    nRecord,
    nRuntime,
    nFile,
    nLog
) {
    var columnsFields = ['category', 'itemname', 'itemid', 'primarycategory'];
    var columns = {};
    var isFirstColumn = true;
    return {
        getInputData: function getInputData() {
            var script = nRuntime.getCurrentScript();
            var file = script.getParameter({
                name: 'custscript_file_item_id'
            });
            return nFile.load({
                id: file
            });
        },
        // maps items to a category, category, item
        map: function map(context) {
            var data = (context.value || '').split(',');
            var category;
            var item;
            var index;
            var field;
            try {
                if (isFirstColumn) {
                    isFirstColumn = false;
                    for (index = 0; index < data.length; index++) {
                        field = data[index];
                        if (columnsFields.indexOf(field.toLowerCase()) >= 0) {
                            columns[index] = field.toLowerCase();
                        }
                    }
                } else {
                    item = {};
                    for (index = 0; index < data.length; index++) {
                        switch (columns[index]) {
                        case 'category':
                            category = data[index];
                            break;
                        case 'itemname':
                            item.name = data[index];
                            break;
                        case 'itemid':
                            item.id = data[index];
                            break;
                        case 'primarycategory':
                            item.primarycategory = data[index];
                            break;
                        default:
                            break;
                        }
                    }

                    if (category && (item.id || item.name)) {
                        context.write(category, item);
                    }
                }
            } catch(e) {
                nLog.error('e', e);
            }
        },

        reduce: function reduce(context) {
            var categoryId = context.key;
            var items = context.values;
            var index;
            var item;
            var category;
            if (categoryId) {
                try {
                    category = nRecord.load({
                        type: 'commercecategory',
                        id: categoryId,
                        isDynamic: true
                    });
                    nLog.debug('categoryId', categoryId);
                    nLog.debug('items', items);

                    for (index = 0; index < items.length; index++) {
                        item = JSON.parse(items[index]);
                        nLog.debug('item', item);
                        category.selectNewLine({
                            sublistId: 'items'
                        });

                        if (item.id) {
                            category.setCurrentSublistValue({
                                sublistId: 'items',
                                fieldId: 'item',
                                value: item.id
                            });
                        }

                        if (item.name) {
                            category.setCurrentSublistText({
                                sublistId: 'items',
                                fieldId: 'item',
                                text: item.name
                            });
                        }

                        if (item.primarycategory) {
                            category.setCurrentSublistValue({
                                sublistId: 'items',
                                fieldId: 'primarycategory',
                                value: item.primarycategory === 'T' || item.primarycategory === 'true' || item.primarycategory === 'YES' ||
                                    item.primarycategory === 'TRUE' || item.primarycategory === true
                            });
                        }
                        category.commitLine({
                            sublistId: 'items'
                        });
                    }

                    category.save();
                } catch (e) {
                    nLog.error('CSV for Category Item mapping error', e);
                }
            }

        },

        summarize: function summarize(summarizeContext) {
            var errorMessage = "";
            log.debug('dateCreated', summarizeContext.dateCreated);
            log.debug('seconds', summarizeContext.seconds);
            log.debug('usage', summarizeContext.usage);
            log.debug('concurrency', summarizeContext.concurrency);
            log.debug('yields', summarizeContext.yields);
            log.debug('inputSummary', summarizeContext.inputSummary);
            log.debug('mapSummary', summarizeContext.mapSummary);
            log.debug('reduceSummary', summarizeContext.reduceSummary);
            log.debug('output', summarizeContext.output);
            log.debug('isRestarted', summarizeContext.isRestarted);

            if (summarizeContext.inputSummary.error) {
                errorMessage += summary.inputSummary.error + '\n';
                log.error('Input Error', summary.inputSummary.error);
            }
            summarizeContext.mapSummary.errors.iterator().each(function (key, error) {
                log.error('Map Error for key: ' + key, error);
                errorMessage += 'Map Error for key: ' + key + '\n' + error + '\n';
            });
            summarizeContext.reduceSummary.errors.iterator().each(function (key, error) {
                log.error('Reduce Error for key: ' + key, error);
                errorMessage += 'Reduce Error for key: ' + key + '\n' + error + '\n';
            });

        }
    }
});
