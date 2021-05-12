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
            var upsellId = newRecord.id;
            var upsellItems;
            var type;
            var values;

            if (context.type !== context.UserEventType.DELETE) {
                return;
            }

            upsellItems = Utils.getUpsellItems(upsellId);

            nLog.error('upsellItems', JSON.stringify(upsellItems));

            _.each(upsellItems, function eachUpsellItem(upsellInfo, parentItemId) {
                if (upsellInfo.upsellItems[upsellId]) {
                    delete upsellInfo.upsellItems[upsellId];
                }

                type = upsellInfo.type;
                if (type) {
                    type = type.toLowerCase().replace(/ /g, '').replace(/-/g, '');
                }

                nLog.error('type', JSON.stringify(type));
                nLog.error('upsellInfo.upsellItems', JSON.stringify(upsellInfo.upsellItems));
                nLog.error('parentItemId', JSON.stringify(parentItemId));

                values = {};
                values[Utils.itemField] = JSON.stringify(upsellInfo.upsellItems);
                nRecord.submitFields({
                    type: type,
                    id: parentItemId,
                    values: values
                });
            });
        },

        afterSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var name = newRecord.getValue({ fieldId: Utils.upsellRecord.fields.name });
            var upsellId = newRecord.id;
            var isinactive = newRecord.getValue({ fieldId: Utils.upsellRecord.fields.isinactive });
            var emptyField = newRecord.getValue({ fieldId: Utils.upsellRecord.fields.emptyLabel });
            var upsellItems;
            var type;
            var values;

            if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
                return;
            }

            try {
                upsellItems = Utils.getUpsellItems(upsellId);

                nLog.error('upsellItems', JSON.stringify(upsellItems));

                _.each(upsellItems, function eachUpsellItem(upsellInfo, parentItemId) {
                    if (isinactive) {
                        if (upsellInfo.upsellItems[upsellId]) {
                            delete upsellInfo.upsellItems[upsellId];
                        }
                    } else {
                        upsellInfo.upsellItems[upsellId] = {
                            name: name,
                            emptyField: emptyField,
                            items: upsellInfo.items
                        };
                    }

                    type = upsellInfo.type;
                    if (type) {
                        type = type.toLowerCase().replace(/ /g, '').replace(/-/g, '');
                    }

                    nLog.error('type', JSON.stringify(type));
                    nLog.error('upsellInfo.upsellItems', JSON.stringify(upsellInfo.upsellItems));
                    nLog.error('parentItemId', JSON.stringify(parentItemId));
                    values = {};
                    values[Utils.itemField] = JSON.stringify(upsellInfo.upsellItems);
                    nRecord.submitFields({
                        type: type,
                        id: parentItemId,
                        values: values
                    });
                });
            } catch (e) {
                nLog.debug('error', e);
            }
        }
    };
});
