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

    var parameters = {
        warranty: {
            association: 'custscript_athq_warranty_assoc_field',
            selector: 'custscript_athq_warranty_selected_field'
        },
        upsell: {
            association: 'custscript_athq_upsell_association_field',
            pricelevel: 'custscript_athq_upsells_pricelevel',
            selector: 'custscript_athq_selected_upsells_field'
        }

    };

    var warranty = {
        errors: {
            noparent: 'Warranty cannot exist on it\'s own',
            incorrectWarranty: 'Warranty is not the selected one',
            wrongQuantity: 'Warranty quantity should be the same as the parent item quantity',
            incorrectPrice: 'Warranty price is not correct'
        }
    };
    var upsell = {
        errors: {
            incorrectUpsell: 'Upsell item is not correct',
            incorrectPrice: 'Upsell price is not correct'
        }
    };

    function setInitialFields() {
        var script = nRuntime.getCurrentScript();
        var warrantyParam;
        var upsellParam;
        for (warrantyParam in parameters.warranty) {
            warranty[warrantyParam] = script.getParameter({
                na​m​e: parameters.warranty[warrantyParam]
            });
        }

        for (upsellParam in parameters.upsell) {
            upsell[upsellParam] = script.getParameter({
                na​m​e: parameters.upsell[upsellParam]
            });
        }
    }

    function setWarrantyMapping(record, line, warrantyMapping) {
        var warrantyKey = record.getSublistValue({
            sublistId: 'item',
            fieldId: warranty.association,
            line: line
        });

        var warrantySelected = record.getSublistValue({
            sublistId: 'item',
            fieldId: warranty.selector,
            line: line
        });

        var warrantyType;
        var warrantyPrice;

        if (warrantyKey && warrantySelected) {
            warrantyType = warrantyKey.substr(0, 2);
            warrantyKey = warrantyKey.replace(warrantyType, '');
            warrantyMapping[warrantyKey] = warrantyMapping[warrantyKey] || {};

            if (warrantyType === 'P:') {
                warrantyPrice = record.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_awa_warranty_' + warrantySelected,
                    line: line
                });
                warrantyMapping[warrantyKey].parent = {
                    line: line,
                    warrantySelected: warrantySelected,
                    warrantyPrice: warrantyPrice,
                    quantity: record.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        line: line
                    })
                };
            } else if (warrantyType === 'G:') {
                warrantyMapping[warrantyKey].warranty = {
                    line: line,
                    warrantySelected: warrantySelected,
                    rate: record.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'rate',
                        line: line
                    }),
                    quantity: record.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        line: line
                    })
                };
            }
        }
    }

    function setWarrantyUpsellMapping(record, line, upsellMapping) {
        var upsellKey = record.getSublistValue({
            sublistId: 'item',
            fieldId: upsell.association,
            line: line
        });
        var upsellSelected = record.getSublistValue({
            sublistId: 'item',
            fieldId: upsell.selector,
            line: line
        });
        var itemid = record.getSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            line: line
        });
        var upsellType;

        if (upsellKey) {
            upsellType = upsellKey.substr(0, 2);
            upsellKey = upsellKey.replace(upsellType, '');
            upsellMapping[upsellKey] = upsellMapping[upsellKey] || {};
            if (upsellType === 'P:') {
                upsellMapping[upsellKey].parent = {
                    line: line,
                    upsellSelected: JSON.parse(upsellSelected || '{}')
                };
            } else if (upsellType === 'G:') {
                upsellMapping[upsellKey].upsells = upsellMapping[upsellKey].upsells || [];
                upsellMapping[upsellKey].upsells.push({
                    line: line,
                    itemid: itemid,
                    pricelevel: record.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'price',
                        line: line
                    })
                });
            }
        }
    }

    return {

        beforeSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var items = newRecord.getLineCount({
                sublistId: 'item'
            });
            var line;
            var warrantyMapping = {};
            var upsellMapping = {};
            var key;
            var upsellInfo;
            var i;
            var addOn;
            var upsellKey;
            var upsellItem;
            var upsellFound;

            setInitialFields();

            if (nRuntime.executionContext !== nRuntime.ContextType.WEBSTORE) {
                return;
            }

            for (line = 0; line < items; line++) {
                setWarrantyMapping(newRecord, line, warrantyMapping);
                setWarrantyUpsellMapping(newRecord, line, upsellMapping);
            }

            if (warrantyMapping) {
                for (key in warrantyMapping) {
                    addOn = warrantyMapping[key];
                    if (addOn && !addOn.parent) {
                        throw warranty.errors.noparent;
                    }

                    if (addOn && addOn.warranty && addOn.parent.warrantySelected !== addOn.warranty.warrantySelected) {
                        throw warranty.errors.incorrectWarranty;
                    }

                    if (addOn && addOn.parent.quantity !== addOn.warranty.quantity) {
                        throw warranty.errors.wrongQuantity;
                    }

                    if (addOn && addOn.warranty.rate !== addOn.parent.warrantyPrice) {
                        throw warranty.errors.incorrectPrice;
                    }
                }
            }
            if (upsellMapping) {
                for (key in upsellMapping) {
                    addOn = upsellMapping[key];
                    if (addOn && addOn.parent && addOn.upsells && addOn.upsells.length && addOn.parent.upsellSelected) {
                        for (i = 0; i < addOn.upsells.length; i++) {
                            upsellInfo = addOn.upsells[i];
                            upsellFound = false;
                            for (upsellKey in addOn.parent.upsellSelected) {
                                upsellItem = addOn.parent.upsellSelected[upsellKey];
                                if (upsellItem === upsellInfo.itemid) {
                                    upsellFound = true;
                                    delete addOn.parent.upsellSelected[upsellKey];
                                    break;
                                }
                            }
                            if (!upsellFound) {
                                throw upsell.errors.incorrectUpsell;
                            }

                         /*   if (upsellInfo.pricelevel !== upsell.pricelevel) {
                                throw upsell.errors.incorrectPrice;
                            }
                         */
                        }
                    }
                }
            }
        }
    };
});
