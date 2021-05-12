/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define([
    'N/runtime',
    'N/log'
], function UpsellAccessories(
    nRuntime,
    nLog
) {
    'use strict';

    var upsellPricelevelField = 'custscript_athq_upsells_pricelevel';
    var onlinePriceField = 'custscript_athq_online_pricelevel';

    return {

        beforeSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var script = nRuntime.getCurrentScript();
            var upsellPriceLevel = script.getParameter({ na​m​e: upsellPricelevelField });
            var onlinePriceLevel = script.getParameter({ na​m​e: onlinePriceField });
            var upsell;
            var online;
            var upsellPrice;
            var onlinePrice;
            log.error('upsell', '1');
          	log.error('price', upsellPriceLevel)

            if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
                log.error('upsell', '2');
              log.error('price', upsellPriceLevel)
                return;
            }

            upsell = newRecord.findSublistLineWithValue({
                sublistId: 'price',
                fieldId: 'pricelevel',
                value: upsellPriceLevel
            });

            online = newRecord.findSublistLineWithValue({
                sublistId: 'price',
                fieldId: 'pricelevel',
                value: onlinePriceLevel
            });

            if (upsell >= 0) {
                upsellPrice = newRecord.getSublistValue({
                    sublistId: 'price',
                    fieldId: 'price_1_',
                    line: upsell
                });

                if (!upsellPrice && upsellPrice !== 0 && online) {

                    onlinePrice = newRecord.getSublistValue({
                        sublistId: 'price',
                        fieldId: 'price_1_',
                        line: online
                    });

                    if (onlinePrice || onlinePrice === 0) {
                        newRecord.setSublistValue({
                            sublistId: 'price',
                            fieldId: 'price_1_',
                            line: upsell,
                            value: onlinePrice
                        });
                    }
                }
            }

            log.error('upsell', '3');
            log.error('price', upsellPriceLevel)
        }
    };
});
