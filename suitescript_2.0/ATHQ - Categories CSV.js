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
    var mapping = {
        'name': 'name',
        'description': 'description',
        'page title': 'pagetitle',
        'heading': 'pageheading',
        'parent': 'primaryparent',
        'url': 'urlfragment',
        'page banner': 'pagebanner',
        'thumbnail image': 'thumbnail',
        'addition to head': 'addtohead',
        'meta keywords': 'metakeywords',
        'meta description': 'metadescription',
        'display in website': 'displayinsite',
        'internalid': 'internalid'
    };
    var isFirstColumn = true;
    var columns = {};

    function setUrl(name) {
        var url = name.replace(/[^0-9a-zA-Z\-\ ]/g, '');
        url = url.trim().replace(/ /g , '-');
        return url;
    }

    return {
        getInputData: function getInputData() {
            var script = nRuntime.getCurrentScript();
            var file = script.getParameter({
                name: 'custscript_file_id'
            });
            nLog.error('file', JSON.stringify(file));
            return nFile.load({
                id: file
            });
        },
        // creates commerce category
        map: function map(context) {
            var data = context.value || '';
            var index;
            var field;
            var categoryInfo = {};
            var site;

            if (data.indexOf('|') >= 0) {
                data = data.split('|');
            } else {
                data = data.split(',');
            }
            try {
                nLog.error('data', JSON.stringify(data));
                if (isFirstColumn) {
                    for (index = 0; index < data.length; index++) {
                        field = data[index];
                        if (mapping[field.toLowerCase()]) {
                            columns[index] = mapping[field.toLowerCase()];
                        } else if (field.toLowerCase() === 'website') {
                            columns[index] = 'website';
                        }
                    }
                    nLog.error('columns', JSON.stringify(columns));
                    isFirstColumn = false;
                } else {
                    for (index = 0; index < data.length; index++) {
                        if (columns[index] === 'website') {
                            site = data[index];
                        } else if (columns[index]) {
                            categoryInfo[columns[index]] = data[index];
                        }
                    }

                    if (categoryInfo.internalid) {
                        context.write('cat-' + categoryInfo.internalid, categoryInfo);
                    } else {
                        context.write(site, categoryInfo);
                    }

                }

            } catch(e) {
                nLog.error('e', e);
            }
        },

        reduce: function reduce(context) {
            var site = context.key;
            var categories = context.values;
            var cat;
            var category;
            var catalogSearch;
            var catalogId;
            var catalog;
            var siteName;
            var commerceCategory;
            var field;
            var catId;

            nLog.error('site', site);
            nLog.error('categories', categories);

            try {

                if (site.indexOf('cat-') < 0) {
                    catalogSearch = nSearch.create({
                        type: 'commercecatalog',
                        filters: [
                            ['site', 'anyof', site]
                        ],
                        columns: [
                            'internalid'
                        ]
                    });

                    catalogSearch.run().each(function eachCatalog(result){
                        catalogId = result.id;
                    });
                    nLog.error('catalogId', catalogId);
                    if (!catalogId) {
                        catalog = nRecord.create({
                            type: 'commercecatalog'
                        });

                        siteName = nSearch.lookupFields({
                            type: nSearch.Type.WEBSITE,
                            id: site,
                            columns: ['displayname']
                        });

                        nLog.error('siteName', siteName);
                        catalog.setValue({ fieldId: 'site', value: site });
                        catalog.setValue({ fieldId: 'name', value: siteName.displayname });

                        catalogId = catalog.save();
                    }
                    nLog.error('catalogId2', catalogId);
                }

                if (catalogId || site.indexOf('cat-') >= 0) {
                    for (cat = 0; cat < categories.length; cat++) {
                        try {
                            category = JSON.parse(categories[cat]);
                            nLog.error('category', JSON.stringify(category));
                            if (category.internalid) {
                                commerceCategory = nRecord.load({
                                    type: 'commercecategory',
                                    id: category.internalid
                                });
                            } else {
                                commerceCategory = nRecord.create({
                                    type: 'commercecategory'
                                });
                            }

                            if (catalogId) {
                                commerceCategory.setValue({
                                    fieldId: 'catalog',
                                    value: catalogId
                                });
                            }

                            if (!category.urlfragment && category.name) {
                                category.urlfragment = setUrl(category.name);
                            }

                            for (field in category) { // eslint-disable-line guard-for-in, no-restricted-syntax
                                nLog.error('field', JSON.stringify(field));
                                nLog.error('category', JSON.stringify(category));
                                commerceCategory.setValue({
                                    fieldId: field,
                                    value: category[field]
                                });
                            }

                            catId = commerceCategory.save();

                            nLog.error('catId', catId);
                        } catch(e) {
                            nLog.error('error on category creation', e);
                        }

                    }
                }
            } catch (e) {
                nLog.error('error on category creation', e);
            }

            // for each category, create the category with all the fields,
            // if there is no url, create the url based on the name and based on the logic for any url component

        },

        summarize: function summarize(summarizeContext) {
            var errorMessage = '';
            nLog.debug('dateCreated', summarizeContext.dateCreated);
            nLog.debug('seconds', summarizeContext.seconds);
            nLog.debug('usage', summarizeContext.usage);
            nLog.debug('concurrency', summarizeContext.concurrency);
            nLog.debug('yields', summarizeContext.yields);
            nLog.debug('inputSummary', summarizeContext.inputSummary);
            nLog.debug('mapSummary', summarizeContext.mapSummary);
            nLog.debug('reduceSummary', summarizeContext.reduceSummary);
            nLog.debug('output', summarizeContext.output);
            nLog.debug('isRestarted', summarizeContext.isRestarted);

            if (summarizeContext.inputSummary.error) {
                errorMessage += summarizeContext.inputSummary.error + '\n';
                log.error('Input Error', summarizeContext.inputSummary.error);
            }
            summarizeContext.mapSummary.errors.iterator().each(function eachMapSummary(key, error) {
                log.error('Map Error for key: ' + key, error);
                errorMessage += 'Map Error for key: ' + key + '\n' + error + '\n';
            });
            summarizeContext.reduceSummary.errors.iterator().each(function eachReduceSummary(key, error) {
                log.error('Reduce Error for key: ' + key, error);
                errorMessage += 'Reduce Error for key: ' + key + '\n' + error + '\n';
            });

        }
    }
});
