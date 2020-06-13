/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/task'],
    function(render, search, record, email, runtime, task){
        function updateItemRecords(context){


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
                        search.createColumn({name: "itemid", label: "Name"})
                    ]
            }).run().getRange(0,1000);

            for (var i=0 ; i<inventoryitemSearchObj.length; i++){
                var internal_id = inventoryitemSearchObj[i].getValue({
                    name: 'internalid'
                });

                var item_rec = record.load({
                    type: 'inventoryitem',
                    id: internal_id,
                    isDynamic: true
                });

                item_rec.setValue({
                    fieldId: 'custitem_vendor_stock',
                    value: 23
                });

                item_rec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

            }






        }
        return {
            execute: updateItemRecords
        };
    });
