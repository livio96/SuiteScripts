define([
    'N/record',
    'N/log',
    'N/search'
], function UpsellAccessoriesUtils(
    nRecord,
    nLog,
    nSearch
) {
    'use strict';

    return {
        upsellItemsRecord: {
            type: 'customrecord_awa_upsell_items',
            fields: {
                upsell: 'custrecord_awa_upsell_item_upsell',
                isinactive: 'isinactive',
                parent: 'custrecord_awa_upsell_item_parent',
                child: 'custrecord_awa_upsell_item_child'
            },
            columns: {
                upsellItemsColumn: nSearch.createColumn({
                    name: 'custitem_awa_upsell_items',
                    join: 'custrecord_awa_upsell_item_parent'
                }),

                itemType: nSearch.createColumn({
                    name: 'type',
                    join: 'custrecord_awa_upsell_item_parent'
                })
            }
        },

        itemField: 'custitem_awa_upsell_items',
        upsellRecord: {
            type: 'customrecord_awa_upsell',
            fields: {
                isinactive: 'isinactive',
                emptyLabel: 'custrecord_awa_upsell_empty_label',
                name: 'name'
            }
        },

        getUpsellItems: function getUpsellItems(upsellId) {
            var parentItem;
            var childItem;
            var parentUpsells;
            var parentType;
            var upsellItems = {};
            var self = this;
            var itemSearch = nSearch.create({
                type: this.upsellItemsRecord.type,
                filters: [
                    [this.upsellItemsRecord.fields.upsell, 'is', upsellId],
                    'AND',
                    [this.upsellItemsRecord.fields.isinactive, 'is', 'F']
                ],
                columns: [
                    this.upsellItemsRecord.fields.parent,
                    this.upsellItemsRecord.fields.child,
                    this.upsellItemsRecord.fields.upsell,
                    this.upsellItemsRecord.columns.upsellItemsColumn,
                    this.upsellItemsRecord.columns.itemType
                ]
            });

            itemSearch.run().each(function eachUpsellItem(upsellItem) {
                nLog.error('upsellItem', JSON.stringify(upsellItem));
                parentItem = upsellItem.getValue({ name: self.upsellItemsRecord.fields.parent });
                childItem = upsellItem.getValue({ name: self.upsellItemsRecord.fields.child });
                parentUpsells = upsellItem.getValue(self.upsellItemsRecord.columns.upsellItemsColumn);
                parentType = upsellItem.getText(self.upsellItemsRecord.columns.itemType);

                upsellItems[parentItem] = upsellItem[parentItem] || {};
                upsellItems[parentItem].items = upsellItems[parentItem].items || [];

                upsellItems[parentItem].items.push(childItem);
                upsellItems[parentItem].type = parentType;
                upsellItems[parentItem].upsellItems = JSON.parse(parentUpsells);

                return true;
            });

            return upsellItems;
        }
    };
});
