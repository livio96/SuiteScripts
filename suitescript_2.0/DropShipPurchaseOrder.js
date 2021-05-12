/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function DropShipPO(context) {

            var newRecord = context.newRecord;

            log.debug({
                title: 'Triggered',
                details: 'triggered'
            });

            var created_from = newRecord.getValue({
                fieldId: 'createdfrom'
            });
            var ship_date = newRecord.getValue({
                fieldId: 'shipdate'
            });


            newRecord.setValue({
                fieldId: 'custbodycomments_for_warehouse',
                value: 'ds'
            });
            newRecord.setValue({
                fieldId: 'custbody_expected_receiving_date',
                value: ship_date
            });

            newRecord.setValue({
                fieldId: 'custbody_expected_receiving_date',
                value: ship_date
            });

            newRecord.setValue({
                fieldId: 'custbodydescriptionofequipment',
                value: '1'
            });



            var sales_order = record.load({
                type: record.Type.SALES_ORDER,
                id: created_from,
                isDynamic: true,
            });

            var sales_rep_id = sales_order.getValue({
                fieldId: 'salesrep'
            });

            var sales_order_terms = sales_order.getValue({
                fieldId: 'terms'
            });

            var sales_rep_email = sales_order.getValue({
                fieldId: 'custbodysalesconsultantemail'
            });



            var drop_ship = sales_order.getValue({
                fieldId: 'custbody18'
            });
            var special_order = sales_order.getValue({
                fieldId: 'custbody26'
            });

            newRecord.setValue({
                fieldId: 'employee',
                value: sales_rep_id
            });

            if(sales_order_terms != '4'){
                newRecord.setValue({
                    fieldId: 'tobeemailed',
                    value: 'T'
                });
            }

            if(drop_ship == true)
                newRecord.setValue({
                    fieldId: 'custbody_drop_ship',
                    value: drop_ship
                });

            if(special_order == true)
                newRecord.setValue({
                    fieldId: 'custbody_drop_ship',
                    value: 'T'
                });

            newRecord.setValue({
                fieldId: 'custbody_drop_ship',
                value: 'T'
            });

            newRecord.setValue({
                fieldId: 'email',
                value: sales_rep_email
            });

        }


        return {
            onAction: DropShipPO,
        };

    });