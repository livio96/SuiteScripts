/**
 *@NApiVersion 2.x
 *@NModuleScope Public
 *@NScriptType Suitelet
 */
define(['N/log', 'N/ui/serverWidget', 'N/record', 'N/search'],
    function(log, serverWidget, record, search) {

        function onRequest(context) {

            var objClass = {};

            if (context.request.method === 'GET') {

                var list = serverWidget.createList({
                    title : 'Item List'
                });
                list.addColumn({
                    id : 'internalid',
                    type : serverWidget.FieldType.TEXT,
                    label : 'ID',
                    align : serverWidget.LayoutJustification.RIGHT
                });

                list.addColumn({
                    id : 'itemid',
                    type : serverWidget.FieldType.TEXT,
                    label : 'Item Name',
                    align : serverWidget.LayoutJustification.RIGHT
                });
                list.addColumn({
                    id : 'custitem_so_rate',
                    type : serverWidget.FieldType.TEXT,
                    label : 'SO Rate',
                    align : serverWidget.LayoutJustification.RIGHT
                });

                list.addColumn({
                    id : 'custitem_vendor_stock',
                    type : serverWidget.FieldType.TEXT,
                    label : 'Vendor Stock',
                    align : serverWidget.LayoutJustification.RIGHT
                });

                var results  = [];

                //Create Search
                var inventoryitemSearchObj = search.create({
                    type: "inventoryitem",
                    filters:
                        [
                            ["custitem_awa_is_custom_parent","is","F"],
                            "AND",
                            ["isinactive","is","F"],
                            "AND",
                            ["name","doesnotcontain","retired"],
                            "AND",
                            ["type","anyof","InvtPart"],
                            "AND",
                            ["name","contains","SPA1"]
                        ],
                    columns:
                        [
                            search.createColumn({name: "internalid", label: "Internal ID"}),
                            search.createColumn({name: "itemid", label: "Name"}),
                            search.createColumn({name: "custitem_so_rate", label: "SO Rate"}),
                            search.createColumn({name: "custitem_vendor_stock", label: "Vendor Stock"})
                        ]
                });



                inventoryitemSearchObj.run().each(function(result) {
                    var res = {};
                    res['internalid'] = result.getValue({
                        name: 'internalid'
                    });

                    res['itemid'] = result.getValue({
                        name: 'itemid'
                    });
                    res['custitem_so_rate'] = result.getValue({
                        name: 'custitem_so_rate'
                    });

                    res['custitem_vendor_stock'] = result.getText({
                        name: 'custitem_vendor_stock'
                    });

                    results.push(res);
                    return true;
                });

                log.debug('results',results);
                list.addRows({
                    rows : results
                });

                context.response.writePage(list);

            }
        }

        return {
            onRequest: onRequest
        };
    });
