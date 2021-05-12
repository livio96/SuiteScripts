/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/record'],
    function (record) {
        function beforeSubmit(con) {
            if (con.type == 'edit' || con.type == 'xedit') {
                var rec = con.newRecord;
                var status = rec.getValue('custrecord_asl_status');
                var unitsPerBox = rec.getValue('custrecord_asl_units_per_box');
                var numUnits = rec.getValue('custrecord_asl_boxes')
                var checkUnitsPer = false;
                var checkNumUnits = false;
                if (unitsPerBox != null && unitsPerBox != '' && unitsPerBox != undefined) {checkUnitsPer = true}
                if (numUnits != null && numUnits != '' && numUnits != undefined) {checkNumUnits = true}

                if (status == 1 && checkUnitsPer && checkNumUnits) {
                    rec.setValue({
                        fieldId: 'custrecord_asl_status',
                        value: 3
                    });
                }
            }
        }
        return {
            beforeSubmit: beforeSubmit
        };
    });