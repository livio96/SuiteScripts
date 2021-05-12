/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 */
define(['N/record', 'N/currentRecord','N/https','N/url','N/log'],
function(record, currentRecord, https, url, log)
{
    function pageInit(context) {
        var newRecord = context.currentRecord;
        var status = newRecord.getField({fieldId: 'custrecord_bbl_approval'});
        var statusValue = newRecord.getValue({
            fieldId: 'custrecord_bbl_approval'
        })
        var listValue = newRecord.getValue({
            fieldId: 'custrecord_bbl_list_on_brokerbin'
        })
        var form = newRecord.getValue({
            fieldId: 'customform'
        })    

        if(context.mode == 'create'){
            
            if (form != 282){newRecord.setValue('customform', 282)}

            if(listValue == false){
                newRecord.setValue({
                    fieldId: 'custrecord_bbl_list_on_brokerbin',
                    value: true
                })
            }

            if(statusValue == null || statusValue == '' || statusValue == undefined) {
                newRecord.setValue({
                    fieldId: 'custrecord_bbl_approval',
                    value: 2
                })
            }
        }

        if(context.mode == 'create' || context.mode == 'edit'){
            status.isDisabled = true;
        }
    }
    function approve(context) {
        try {
            var currentRecordId = currentRecord.get().id;
            var currentRecordType = currentRecord.get().type;

            var newRecord = record.load({
                id: currentRecordId,
                type: currentRecordType
            })

            var status = newRecord.getValue({fieldId: 'custrecord_bbl_approval'})

            if(status==1){
                log.debug({
                    title:'Status Check',
                    details: 'Already approved'
                })
            }else{
                newRecord.setValue({
                    fieldId: 'custrecord_bbl_approval',
                    value: 1
                })
                newRecord.save({
                    ignoreMandatoryFields: true,
                    enableSourcing: true
                })
                window.location.reload();
            }
        }catch (err) {
            log.debug({
                title: 'Error @ Approve',
                details: err
            })
        }
    }
    function reject(context) {
        try {
            var currentRecordId = currentRecord.get().id;
            var currentRecordType = currentRecord.get().type;

            var newRecord = record.load({
                id: currentRecordId,
                type: currentRecordType
            })

            var status = newRecord.getValue({fieldId: 'custrecord_bbl_approval'})

            if(status==3){
                log.debug({
                    title:'Status Check',
                    details: 'Already rejected'
                })
            }else {
                newRecord.setValue({
                    fieldId: 'custrecord_bbl_approval',
                    value: 3
                })
                newRecord.setValue({
                    fieldId: 'custrecord_bbl_list_on_brokerbin',
                    value: false
                })
                newRecord.save({
                    ignoreMandatoryFields: true,
                    enableSourcing: true
                })
                window.location.reload();
            }
        }catch (err) {
            log.debug({
                title: 'Error @ Approve',
                details: err
            })
        }
    }
    function resetToDefaults(context){
        try {
            //standard descriptions for all brands
            var defaultReman = 'Same Day Shipping | As Good As New | Individually Boxed | Gold Shield, 5 Star Rated, Reliable and Trusted Vendor | Call for Orders of 250+'
            var defaultLikeNew = 'Same Day Shipping | Trusted, Reliable, Third Party Certified Refurbished | Gold Shield, 5 Star Rated, Reliable and Trusted Vendor | Call for Orders of 250+'
            var defaultNew = 'Same Day Shipping | New Product in Original Manufacturer Box | Gold Shield, 5 Star Rated, Reliable and Trusted Vendor | Call for Orders of 250+' 
            //Cisco Specific Descriptions
            var defaultCiscoRefreshInStock = 'Same Day Shipping | 100% Authentic Original Cisco Refresh in Original Cisco Packaging | Eligible for SmartNet'
            var defaultCiscoWholesaleInStock = 'Same Day Shipping | 100% Authentic Original Cisco Excess in Original Cisco Packaging | Eligible for SmartNet'
            var defaultCiscoNew = 'Same Day Shipping | New Cisco Product in Original Cisco Pkg | Gold Shield, 5 Star Rated, Reliable and Trusted Vendor | Call for Orders of 250+'
            var defaultCiscoReman = 'Same Day Shipping | As Good As New | Individually Boxed | Gold Shield, 5 Star Rated, Reliable and Trusted Vendor | Call for Orders of 250+'
            var defaultCiscoLikeNew = 'Same Day Shipping | Trusted, Reliable, Third Party Certified Refurbished | Gold Shield, 5 Star Rated, Reliable and Trusted Vendor | Call for Orders of 250+'

            var currentRecordId = currentRecord.get().id;
            var currentRecordType = currentRecord.get().type;

            var newRecord = record.load({
                id: currentRecordId,
                type: currentRecordType
            });

            var itemID = newRecord.getValue('custrecord_bbl_item');

            var itemRec = record.load({
                id: itemID,
                type: record.Type.INVENTORY_ITEM
            }) 

            var itemBrand = itemRec.getValue('custitem_awa_brand');
            var itemCondition = itemRec.getValue('custitem_awa_condition');
            var itemName = itemRec.getValue('itemid');

            //if item is Cisco
            if (itemBrand == 3){
                //check condition and setValue for respective condition with default description
                if (itemCondition == 1){
                    newRecord.setValue({ //Cisco New
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultCiscoNew
                    });
                }
                if (itemCondition == 7){ //Cisco Like New
                    newRecord.setValue({ 
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultCiscoLikeNew
                    });
                }
                if (itemCondition == 2){ //Cisco Reman
                    newRecord.setValue({ 
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultCiscoReman
                    });
                }
                if (itemCondition == 4){ //Cisco Refresh
                    newRecord.setValue({ 
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultCiscoRefreshInStock
                    });
                }
                if (itemCondition == 9){ //Cisco Wholesale
                    newRecord.setValue({ 
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultCiscoWholesaleInStock
                    });
                }
            }
            //if brand is not cisco
            else if (itemBrand != 3){
                //setValue for respective condition with default desc
                if (itemCondition == 1){ //New
                    newRecord.setValue({ 
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultNew
                    });
                }
                if (itemCondition == 7){ //Like New
                    newRecord.setValue({ 
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultLikeNew
                    });
                }
                if (itemCondition == 2){ //Reman
                    newRecord.setValue({ 
                        fieldId: 'custrecord_bbl_brokerbin_description',
                        value: defaultReman
                    });
                }
            }
            //set other default values
            newRecord.setValue('custrecord_bbl_manual_override', false); //quantitiy override checkbox
            newRecord.setValue('custrecord_bbl_manufac_override_box', false); //manufacturer override checkbox
            newRecord.setValue('custrecord_bbl_override_desc_box', false); //description override checkbox
            newRecord.setValue('custrecord_bbl_manual_qty', null); //manual quantity field
            newRecord.setValue('custrecord_bbl_manual_desc', null); //manual description field
            newRecord.setValue('custrecord_bbl_manufacturer', null); //manual manufacturer field
            newRecord.setValue('custrecord_max_inventory', 250); //max quantity 
            newRecord.setValue('custrecord_bbl_brokerbin_part_number', itemName); //brokerbin part #
            newRecord.setValue('custrecord_bbl_update', true); //Update Listing Checkbox

            newRecord.save({
                ignoreMandatoryFields: true,
                enableSourcing: true
            });
            window.location.reload();
        }
        catch (err) {
            log.debug('Error @ Defaults', err)
        }
    }
    return {
        pageInit: pageInit,
        approve: approve,
        reject: reject,
        resetToDefaults: resetToDefaults
    };
});