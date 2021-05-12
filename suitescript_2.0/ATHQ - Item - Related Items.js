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

    function setParentAsRelated(newRecord, parentItemId) {
        var child = nRecord.load({
            id: newRecord.id,
            type: newRecord.type,
            isDynamic: true
        });

        var relatedItems = child.getLineCount({
            sublistId: 'presentationitem'
        });

        if (relatedItems > 0) {
            for (var line = relatedItems; line > 0; line--) {
                child.removeLine({
                    sublistId: 'presentationitem',
                    line: line - 1
                });
            }
        }


        child.selectNewLine({
            sublistId: 'presentationitem'
        });
        child.setCurrentSublistValue({
            sublistId: 'presentationitem',
            fieldId: 'item',
            value: parentItemId
        });
        child.setCurrentSublistValue({
            sublistId: 'presentationitem',
            fieldId: 'itemtype',
            value: 'INVTITEM'
        });

        child.setCurrentSublistValue({
            sublistId: 'presentationitem',
            fieldId: 'presentationitem',
            value: parentItemId + String.fromCharCode(3) + 'INVTITEM'
        });
        child.commitLine({
            sublistId: 'presentationitem'
        });
        child.save({ ignoreMandatoryFields: true });
    }

    function setChildUrlComponent(context) {
        var itemId;
        var urlComponent;
        var childItems;
        var isMatrixParent;
        var newRecord = context.newRecord;
        var oldRecord = context.oldRecord;
        var oldUrlComponent;

        if (oldRecord && context.type === context.UserEventType.DELETE || context.type === context.UserEventType.EDIT) {
            isMatrixParent = oldRecord.getValue({ fieldId: 'custitem_awa_is_custom_parent' });
            oldUrlComponent = oldRecord.getValue({ fieldId: 'urlcomponent' });
            itemId = oldRecord.id;
        }

        if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
            isMatrixParent = newRecord.getValue({ fieldId: 'custitem_awa_is_custom_parent' });
            itemId = newRecord.id;
            urlComponent = newRecord.getValue({ fieldId: 'urlcomponent' });
        }

        if (isMatrixParent && oldUrlComponent !== urlComponent) {
            childItems = nSearch.create({
                type: nSearch.Type.ITEM,
                filters: [
                    ['custitem_awa_is_custom_child', 'is', 'T'],
                    'AND',
                    ['custitem_awa_custom_parent', 'is', itemId]
                ],
                columns: [
                    'urlcomponent'
                ]
            });
            childItems.run().each(function eachChildItem(result) {
                nRecord.submitFields({
                    type: result.recordType,
                    id: result.id,
                    values: {
                        'custitem_awa_custom_parent_url': urlComponent
                    }
                });
                return true;
            });
        }

    }

    return {

        beforeSubmit: function beforeSubmit(context) {
            var newRecord = context.newRecord;
            var isMatrixChild;
            var parentItemId;
            var parentFields;
            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                isMatrixChild = newRecord.getValue({ fieldId: 'custitem_awa_is_custom_child' });
                parentItemId = newRecord.getValue({ fieldId: 'custitem_awa_custom_parent' });
                if (isMatrixChild && parentItemId) {
                    parentFields = nSearch.lookupFields({
                        type: nSearch.Type.NON_INVENTORY_ITEM,
                        id: parentItemId,
                        columns: ['urlcomponent']
                    });
                    if (parentFields && parentFields.urlcomponent) {
                        newRecord.setValue({
                            fieldId: 'custitem_awa_custom_parent_url',
                            value: parentFields.urlcomponent
                        });
                    }
                }

            } else if (context.type === context.UserEventType.DELETE) {
                setChildUrlComponent(context);
            }
        },

        afterSubmit: function afterSubmit(context) {
            var parentItemId;
            var oldParentItemId;
            var isMatrixChild;
            var oldIsMatrixChild;
            var childId;
            var parentItem;
            var line;
            var oldRecord = context.oldRecord;
            var newRecord = context.newRecord;

            setChildUrlComponent(context);
            if (context.type === context.UserEventType.EDIT || context.type === context.UserEventType.DELETE) {
                oldParentItemId = oldRecord.getValue({ fieldId: 'custitem_awa_custom_parent' });
                oldIsMatrixChild = oldRecord.getValue({ fieldId: 'custitem_awa_is_custom_child' });
                childId = oldRecord.id;
            }

            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                parentItemId = newRecord.getValue({ fieldId: 'custitem_awa_custom_parent' });
                isMatrixChild = newRecord.getValue({ fieldId: 'custitem_awa_is_custom_child' });
                childId = newRecord.id;
            }

            if (childId && (isMatrixChild !== oldIsMatrixChild || parentItemId !== oldParentItemId)) {
                if (oldParentItemId && childId) {
                    parentItem = nRecord.load({
                        type: nRecord.Type.NON_INVENTORY_ITEM,
                        id: oldParentItemId,
                        isDynamic: true
                    });
                    line = parentItem.findSublistLineWithValue({
                        sublistId: 'presentationitem',
                        fieldId: 'item',
                        value: childId
                    });

                    if (line >= 0) {
                        parentItem.removeLine({
                            sublistId: 'presentationitem',
                            line: line
                        });
                        parentItem.save({ ignoreMandatoryFields: true });
                    }

                }

                if (parentItemId && childId) {
                    parentItem = nRecord.load({
                        type: nRecord.Type.NON_INVENTORY_ITEM,
                        id: parentItemId,
                        isDynamic: true
                    });

                    line = parentItem.findSublistLineWithValue({
                        sublistId: 'presentationitem',
                        fieldId: 'item',
                        value: childId
                    });
                    if (line >= 0 && !isMatrixChild) {
                        parentItem.removeLine({
                            sublistId: 'presentationitem',
                            line: line
                        });
                        parentItem.save();
                    } else if (line < 0 && isMatrixChild) {
                        parentItem.selectNewLine({
                            sublistId: 'presentationitem'
                        });
                        parentItem.setCurrentSublistValue({
                            sublistId: 'presentationitem',
                            fieldId: 'item',
                            value: childId
                        });

                        parentItem.setCurrentSublistValue({
                            sublistId: 'presentationitem',
                            fieldId: 'itemtype',
                            value: 'INVTITEM'
                        });

                        parentItem.setCurrentSublistValue({
                            sublistId: 'presentationitem',
                            fieldId: 'presentationitem',
                            value: childId + String.fromCharCode(3) + 'INVTITEM'
                        });

                        parentItem.commitLine({
                            sublistId: 'presentationitem'
                        });

                        parentItem.save({ ignoreMandatoryFields: true });
                    }

                    setParentAsRelated(newRecord, parentItemId);
                }
            }


        }
    }

});
