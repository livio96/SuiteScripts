/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define([
    'N/runtime',
    'N/search',
    'N/record',
    'N/log',
    './underscore-custom',
    './ATHQ - Upsell Accessories - Utils'
], function UpsellAccessories(
    nRuntime,
    nSearch,
    nRecord,
    nLog,
    _,
    Utils
) {
    'use strict';

    return {

        beforeSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var upsellId = newRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.upsell });
            var parent = newRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.parent });
            var child = newRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.child });
            var type;
            var parentUpsellInfo;
            var upsellSearch;
            var items;
            var values;

            if (context.type !== context.UserEventType.DELETE) {
                return;
            }

            upsellSearch = nSearch.create({
                type: nSearch.Type.ITEM,
                filters: [
                    ['internalid', 'is', parent]
                ],
                columns: [
                    Utils.itemField
                ]
            });

            upsellSearch.run().each(function eachUpsellParent(upsellParent) {
                type = upsellParent.recordType;
                parentUpsellInfo = JSON.parse(upsellParent.getValue({ name: Utils.itemField }) || '{}');
                items = parentUpsellInfo[upsellId] && parentUpsellInfo[upsellId].items;
                if (items) {
                    if (items.indexOf(child) >= 0) {
                        items = _.without(items, child);
                        parentUpsellInfo[upsellId].items = items;
                        if (!items.length) {
                            delete parentUpsellInfo[upsellId];
                        }
                        values = {};
                        values[Utils.itemField] = JSON.stringify(parentUpsellInfo);
                        nRecord.submitFields({
                            type: type,
                            id: parent,
                            values: values
                        });
                    }
                }
            });
        },

        afterSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var upsellId = newRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.upsell });
            var parent = newRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.parent });
            var child = newRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.child });
            var isinactive = newRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.isinactive });
            var type;
            var oldRecord = context.oldRecord;
            var oldChild;
            var oldUpsellId;
            var itemId;
            var oldParent;
            var filters = [['internalid', 'is', parent]];
            var parentUpsellInfo;
            var upsellSearch;
            var items;
            var values;
            var oldItems;
            var oldInactive;
            var upsellInfo;

            if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
                return;
            }

            try {
                if (context.type === context.UserEventType.EDIT) {
                    oldChild = oldRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.child });
                    oldParent = oldRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.parent });
                    oldUpsellId = oldRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.upsell });
                    oldInactive = oldRecord.getValue({ fieldId: Utils.upsellItemsRecord.fields.isinactive });
                }

                if (oldParent && oldParent !== parent) {
                    filters.push('OR');
                    filters.push(['internalid', 'is', oldParent]);
                }

                upsellSearch = nSearch.create({
                    type: nSearch.Type.ITEM,
                    filters: filters,
                    columns: [
                        Utils.itemField
                    ]
                });

                upsellSearch.run().each(function eachUpsellParent(upsellParent) {
                    type = upsellParent.recordType;
                    itemId = upsellParent.id;
                    parentUpsellInfo = JSON.parse(upsellParent.getValue({ name: Utils.itemField }) || '{}');
                    if (oldUpsellId && oldUpsellId !== upsellId && itemId === oldParent) {
                        oldItems = (parentUpsellInfo[oldUpsellId] && parentUpsellInfo[oldUpsellId].items) || [];
                        if (oldItems) {
                            if (oldItems.indexOf(oldChild) >= 0) {
                                oldItems = _.without(oldItems, oldChild);
                                parentUpsellInfo[oldUpsellId].items = oldItems;
                            }
                        }
                    }

                    items = (parentUpsellInfo[upsellId] && parentUpsellInfo[upsellId].items) || [];
                    if (itemId === oldParent && itemId !== parent) {
                        if (items && items.indexOf(oldChild) >= 0) {
                            items = _.without(items, oldChild);
                            parentUpsellInfo[upsellId].items = items;
                        }
                    } else if (oldChild !== child && items) {
                        if (oldChild && items.indexOf(oldChild) >= 0) {
                            items = _.without(items, oldChild);
                        }
                        if (!isinactive && items.indexOf(child) < 0) {
                            items.push(child);
                        } else if (isinactive && items.indexOf(child) >= 0) {
                            items = _.without(items, child);
                        }
                    } else if (itemId !== oldParent && itemId === parent && oldChild === child) {
                        if (!isinactive && items.indexOf(child) < 0) {
                            items.push(child);
                        } else if (isinactive && items.indexOf(child) >= 0) {
                            items = _.without(items, child);
                        }
                    } else if (oldInactive !== isinactive) {
                        if (!isinactive && items.indexOf(child) < 0) {
                            items.push(child);
                        } else if (isinactive && items.indexOf(child) >= 0) {
                            items = _.without(items, child);
                        }
                    }

                    if ((!items || !items.length) && parentUpsellInfo[upsellId]) {
                        delete parentUpsellInfo[upsellId];
                    } else if (items && items.length && !parentUpsellInfo[upsellId]) {
                        upsellInfo = nSearch.lookupFields({
                            type: Utils.upsellRecord.type,
                            id: upsellId,
                            columns: _.values(Utils.upsellRecord.fields)
                        });
                        if (!upsellInfo[Utils.upsellRecord.fields.isinactive]) {
                            parentUpsellInfo[upsellId] = {
                                name: upsellInfo[Utils.upsellRecord.fields.name],
                                emptyField: upsellInfo[Utils.upsellRecord.fields.emptyLabel],
                                items: items
                            };
                        }
                    } else {
                        parentUpsellInfo[upsellId].items = items;
                    }
                    values = {};
                    values[Utils.itemField] = JSON.stringify(parentUpsellInfo);
                    nRecord.submitFields({
                        type: type,
                        id: parent,
                        values: values
                    });

                    return true;
                });

            } catch (e) {
                nLog.error('error', e);
            }
        }
    };
});
