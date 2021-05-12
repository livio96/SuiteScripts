/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define([
    'N/record',
    'N/log',
    'N/search'
], function RelatedItems(
    nRecord,
    nLog,
    nSearch
) {

    function updateRelatedField(parentID) {
        nLog.error('parentID', parentID);
        var relatedItems = nSearch.create({
            type: 'customrecord_awa_related_items',
            filters: [
                ['custrecord_awa_related_parent_item', 'is', parentID],
                'AND',
                ['isinactive', 'isnot', 'T']
            ],
            columns: ['custrecord_awa_related_child_item']
        });

        var relatedIds = [];
        var relatedField;

        relatedItems.run().each(function eachRelatedItem(relatedItem) {
            relatedIds.push(relatedItem.getValue({ name: 'custrecord_awa_related_child_item' }));
            return true;
        });

        relatedField = relatedIds.join(',') || '';
        nLog.error('relatedField', relatedField);
        nRecord.submitFields({
            type: nRecord.Type.NON_INVENTORY_ITEM,
            id: parentID,
            values: {
                'custitem_awa_related_items': relatedField
            }
        });
    }

    return {

        afterSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var parentRecord;
            var childRecord;
            var oldRecord;
            var oldParent;
            var oldChild;
            var isInactive;
            var oldInactive;

            if (context.type === context.UserEventType.EDIT || context.type === context.UserEventType.DELETE) {
                oldRecord = context.oldRecord;
                oldParent = oldRecord.getValue({ fieldId: 'custrecord_awa_related_parent_item' });
                oldChild = oldRecord.getValue({ fieldId: 'custrecord_awa_related_child_item' });
                oldInactive = oldRecord.getValue({ fieldId: 'isinactive' }) === true;
            }

            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                parentRecord = newRecord.getValue({ fieldId: 'custrecord_awa_related_parent_item' });
                childRecord = newRecord.getValue({ fieldId: 'custrecord_awa_related_child_item' });
                isInactive = newRecord.getValue({ fieldId: 'isinactive' }) === true;
            }

            nLog.error('oldParent', oldParent);
            nLog.error('oldChild', oldChild);
            nLog.error('oldInactive', oldInactive);
            nLog.error('parentRecord', parentRecord);
            nLog.error('childRecord', childRecord);
            nLog.error('isInactive', isInactive);

            if (oldParent !== parentRecord || oldChild !== childRecord || isInactive !== oldInactive) {
                if (oldParent && oldParent != parentRecord) {
                    updateRelatedField(oldParent);
                }

                if (parentRecord) {
                    updateRelatedField(parentRecord);
                }
            }
        }
    }

});
