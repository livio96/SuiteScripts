/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */

/*General Comments */
/*Update Brokerbin Quantity on inbound inventory listings */

define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {

        function CreateTOs(context) {
            var newRecord = context.newRecord;

            var internal_id = newRecord.getValue({
              fieldId: 'id'
            });

            var transferOrderSearch = search.create({
              type: "customrecord_ask",
                filters:
                [
                   ["custrecord_asl_amazon_shipment.idtext","is","9"],
                   "AND",
                   ["custrecord_asl_fba_shipment_id","isnotempty",""],
                   "AND",
                   ["custrecord_asl_amazon_warehouse","noneof","@NONE@"],
                   "AND",
                   ["custrecord_ass_transfer_order","anyof","@NONE@"]
                ],
                columns:
                [
                   search.createColumn({name: "custrecord_asl_sku", label: "SKU"}),
                   search.createColumn({name: "custrecord_asl_quanity", label: "Quantity"}),
                   search.createColumn({name: "custrecord_asl_from_location", label: "From Location"}),
                   search.createColumn({name: "custrecord_to_location", label: "To Location"}),
                   search.createColumn({
                      name: "custrecord_as_employee",
                      join: "CUSTRECORD_ASL_AMAZON_SHIPMENT",
                      label: "Employee"
                   }),
                   search.createColumn({name: "custrecord_asl_celigo_etail", label: "eTail"}),
                   search.createColumn({name: "custrecord_asl_fba_shipment_id", label: "Shipment ID"}),
                   search.createColumn({name: "custrecord_asl_amazon_warehouse", label: "Amazon Warehouse"}),
                   search.createColumn({
                      name: "custrecord_asw_adressee",
                      join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                      label: "Adressee"
                   }),
                   search.createColumn({
                      name: "custrecord_asw_address_1",
                      join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                      label: "Address 1"
                   }),
                   search.createColumn({
                      name: "custrecord_asw_city",
                      join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                      label: "City"
                   }),
                   search.createColumn({
                      name: "custrecord_asw_state",
                      join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                      label: "State"
                   }),
                   search.createColumn({
                      name: "custrecord_asw_zipcode",
                      join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                      label: "Zipcode"
                   })
                 ]
              });

              var results = transferOrderSearch.run();
              var results_range = results.getRange(0,100);

              if (results_range.length > 0){
                for(i = 0; i < results_range.length; i++){
                  var shipmentLineID = results_range[i].getValue('internalid');
                  var fromLoc = results_range[i].getText('custrecord_asl_from_location');
                  var toLoc = results_range[i].getText('custrecord_to_location');
                  var item = results_range[i].getValue('custrecord_asl_sku');
                  var quantity = results_range[i].getValue('custrecord_asl_quanity');
                  var eTail = results_range[i].getValue('custrecord_asl_celigo_etail');
                  var shipmentID = results_range[i].getValue('custrecord_asl_fba_shipment_id');
                  var fbaCenterID = results_range[i].getText('custrecord_asl_amazon_warehouse')
                  var fbaCenterName = results_range[i].getValue({
                    name: "custrecord_asw_adressee",
                    join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                    label: "Adressee"
                  });
                  var fbaCenterAddress1 = results_range[i].getValue({
                    name: "custrecord_asw_address_1",
                    join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                    label: "Address 1"
                  });
                  var fbaCenterCity = results_range[i].getValue({
                    name: "custrecord_asw_city",
                    join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                    label: "City"
                  });
                  var fbaCenterState = results_range[i].getValue({
                    name: "custrecord_asw_state",
                    join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                    label: "State"
                  });
                  var fbaCenterZip = results_range[i].getValue({
                    name: "custrecord_asw_zipcode",
                    join: "CUSTRECORD_ASL_AMAZON_WAREHOUSE",
                    label: "Zipcode"
                  });
                  var owner = results_range[i].getValue({
                    name: "custrecord_as_employee",
                    join: "CUSTRECORD_ASL_AMAZON_SHIPMENT",
                    label: "Employee"
                  });

                  var transferOrder = record.create({
                    type: record.Type.TRANSFER_ORDER,
                    isDynamic: true
                  });

                  transferOrder.setValue({
                    fieldId: 'subsidiary',
                    value: '1'
                  });

                  log.debug('fromLoc', fromLoc);
                  log.debug('toLoc', toLoc);

                  //Logic for from Location
                  if (fromLoc === 'A' || fromLoc === '24C'){
                    transferOrder.setValue({
                      fieldId: 'location',
                      value: 1
                    });
                  }else if (fromLoc === '24P'){
                    transferOrder.setValue({
                      fieldId: 'location',
                      value: 27
                    });
                  }
                  //Logic for To location
                  if (toLoc === 'ATHQ'){
                    transferOrder.setValue({
                      fieldId: 'transferlocation',
                      value: 22
                    });
                    transferOrder.setValue('memo', toLoc);
                  }else if (toLoc === 'Certified Refurbished'){
                    transferOrder.setValue({
                      fieldId: 'transferlocation',
                      value: 28
                    });
                    transferOrder.setvalue('memo', toLoc);
                  }else if (toLoc === 'Discover Savings'){
                    transferOrder.setValue({
                      fieldId: 'transferlocation',
                      value: 23
                    });
                    transferOrder.setValue('memo', toLoc);
                  }

                  transferOrder.setValue({
                    fieldId: 'employee',
                    value: owner
                  });

                  transferOrder.setValue({
                    fieldId: 'custbody_cps_fba_shipment_id',
                    value: shipmentID
                  });

                  transferOrder.setValue({
                    fieldId: 'custbody_cps_fba_center_id',
                    value: fbaCenterID
                  });

                  transferOrder.setValue('custbody_cps_received_shipment_plan', true);
                  transferOrder.setValue('custbody_cps_shipment_created', true);

                  transferOrder.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: 0,
                    value: item
                  });

                  var transferOrderID = transferOrder.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                  });

                  var amazonLine = record.load({
                    id: shipmentLineID,
                    type: 'customrecord_ask',
                    isDynamic: true
                  });

                  var amazonLine.setValue({
                    fieldId: 'custrecord_ass_transfer_order',
                    value: transferOrderID
                  });

                  amazonLine.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                  });

                }
              }
            }
        return {
            onAction: CreateTOs,
        };

    });
