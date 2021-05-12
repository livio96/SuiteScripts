var IS_PROCESSING = false;
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

var warranty = {};
var upsell = {};

function pageInit() {
	nlapiLogExecution('Debug','entry','entry');
    var warrantyParam;
    var upsellParam;
    var context = nlapiGetContext();
    if(context.getExecutionContext() !== 'webstore') return true;
    for (warrantyParam in parameters.warranty) {
        warranty[warrantyParam] = context.getSetting('SCRIPT', parameters.warranty[warrantyParam]);
    }

    for (upsellParam in parameters.upsell) {
        upsell[upsellParam] = context.getSetting('SCRIPT', parameters.upsell[upsellParam]);
    }
	nlapiLogExecution('Debug','entry warranty',JSON.stringify(warranty));
}
//JSON.stringify

function customRecalc(type, action) {
    if(nlapiGetContext().getExecutionContext() !== 'webstore') return true;
    if (type === 'item' && (action == 'commit')) {
        if (IS_PROCESSING) {
            return true;
        }
        // We check if it is processing
        try {
            IS_PROCESSING = true;
            setUpsellWarrantyPrices();
        } catch(e) {
            nlapiLogExecution('ERROR', 'e', e);
        } finally {
            IS_PROCESSING = false;
        }
    }
}

function setUpsellWarrantyPrices() {
    var mapping = getUpsellWarrantyMapping();
    var key;
    var upsellInfo;
    var i;
    var addOn;
    var upsellKey;
    var upsellItem;
    var upsellFound;
    if (mapping.warranty) {
        for (key in mapping.warranty) {
            addOn = mapping.warranty[key];
            if (addOn && addOn.parent && addOn.warranty && addOn.parent.warrantySelected === addOn.warranty.warrantySelected) {
                setCurrentLineRate(addOn.warranty.line, addOn.parent.warrantyPrice);
            }
        }
    }
    if (mapping.upsell) {
        for (key in mapping.upsell) {
            addOn = mapping.upsell[key];
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
                    if (upsellFound) {
                        setPricelevel(upsellInfo.line, upsell.pricelevel);
                    }
                }

            }
        }
    }
}

function getUpsellWarrantyMapping() {
    var itemQty = nlapiGetLineItemCount('item');
    var line;
    var warrantyMapping = {};
    var upsellMapping = {};

    for (line = 1; line <= itemQty; line++) {
        setWarrantyMapping(line, warrantyMapping);
        setWarrantyUpsellMapping(line, upsellMapping);
    }

    return {
        warranty: warrantyMapping,
        upsell: upsellMapping
    };
}

function setWarrantyMapping(line, warrantyMapping) {
    var warrantyKey = nlapiGetLineItemValue('item', warranty.association, line);
    var warrantySelected = nlapiGetLineItemValue('item', warranty.selector, line);
    var warrantyType;
    var warrantyPrice;

    if (warrantyKey && warrantySelected) {
        warrantyType = warrantyKey.substr(0, 2);
        warrantyKey = warrantyKey.replace(warrantyType, '');
        warrantyMapping[warrantyKey] = warrantyMapping[warrantyKey] || {};

        if (warrantyType === 'P:') {
            warrantyPrice = nlapiGetLineItemValue('item', 'custcol_awa_warranty_' + warrantySelected, line);
            warrantyMapping[warrantyKey].parent = {
                line: line,
                warrantySelected: warrantySelected,
                warrantyPrice: warrantyPrice
            };
        } else if (warrantyType === 'G:') {
            warrantyMapping[warrantyKey].warranty = {
                line: line,
                warrantySelected: warrantySelected
            };
        }
    }
}

function setWarrantyUpsellMapping(line, upsellMapping) {
    var upsellKey = nlapiGetLineItemValue('item', upsell.association, line);
    var upsellSelected = nlapiGetLineItemValue('item', upsell.selector, line);
    var itemid = nlapiGetLineItemValue('item', 'item', line);
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
                itemid: itemid
            });
        }
    }
}

function setCurrentLineRate(line, rate) {
    var qty;
    var amount;
    nlapiSelectLineItem('item', line);
    nlapiSetCurrentLineItemValue('item', 'rate', rate, true, true);
    qty = parseInt(nlapiGetCurrentLineItemValue('item', 'quantity'));
    amount = qty * rate;
    nlapiSetCurrentLineItemValue('item', 'amount', amount, true, true);
    nlapiCommitLineItem('item');
}

function setPricelevel(line, pricelevel) {
    nlapiSelectLineItem('item', line);
    nlapiSetCurrentLineItemValue('item', 'price', pricelevel, true, true);
    nlapiCommitLineItem('item');
}
