/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {


        function beforeSubmit(context) {

            var newRecord = context.newRecord;

            var euler_hermes_id = newRecord.getValue({
                fieldId: 'custrecord_euler_hermes_id'
            });

            var cust_reference = newRecord.getValue({
                fieldId: 'custrecord_reference'
            });

            var credit_limit = newRecord.getValue({
                fieldId: 'custrecord_credit_limit'
            });


            // If euler hermes ID is not empty, search for a customer record
            if (euler_hermes_id != null && euler_hermes_id != '') {


                var customerSearchObj = search.create({
                    type: "customer",
                    filters: [
                        ["isinactive", "is", "F"],
                        "AND",
                        ["custentity_eh_id", "is", euler_hermes_id]
                    ],
                    columns: [
                        search.createColumn({
                            name: "internalid",
                            label: "Internal ID"
                        })
                    ]
                });


                if (customerSearchObj) {
                    var results = customerSearchObj.run();
                    var results_range = results.getRange(0, 1);

                    if (results_range.length > 0) {

                        var cust_id = results_range[0].getValue({
                            name: 'internalid'
                        });

                        log.debug({
                            title: 'Processed',
                            details: 'Using EH ID'
                        });


                        newRecord.setValue({
                            fieldId: 'custrecord_ns_customer',
                            value: cust_id
                        });

                        var customer_rec = record.load({
                            type: record.Type.CUSTOMER,
                            id: cust_id,
                            isDynamic: true,
                        });

                        var customer_old_credit_limit = customer_rec.getValue({
                            fieldId: 'creditlimit'
                        });
                        var current_customer_terms = customer_rec.getValue({
                            fieldId: 'terms'
                        })



                        var euler_hermes_exception = customer_rec.getValue({
                            fieldId: 'custentity_eh_exception'
                        });

                        //update cust record only if it is not a euler hermes exception
                        if (euler_hermes_exception != true) {
                            newRecord.setValue({
                                fieldId: 'custrecord_customer_old_credit_limit',
                                value: customer_old_credit_limit
                            });

                            if (credit_limit > 0) {
                                customer_rec.setValue({
                                    fieldId: 'creditlimit',
                                    value: credit_limit
                                });
                                //if current customer terms are blank, set customer terms to net 30 - otherwise skip
                                if (current_customer_terms == '' || current_customer_terms == null) {
                                    customer_rec.setValue({
                                        fieldId: 'terms',
                                        value: 2
                                    });
                                }
                            }
                            if (credit_limit == 0 || credit_limit == '') {
                                customer_rec.setValue({
                                    fieldId: 'creditlimit',
                                    value: ''
                                });
                                customer_rec.setValue({
                                    fieldId: 'terms',
                                    value: ''
                                });
                            }

                            customer_rec.setValue({
                                fieldId: 'custentity_eh_credit_limit',
                                value: credit_limit
                            });

                            customer_rec.save({
                                enableSourcing: true,
                                ignoreMandatoryFields: true
                            });

                            if (customer_old_credit_limit != credit_limit)
                                newRecord.setValue({
                                    fieldId: 'custrecord_cust_rec_update',
                                    value: true
                                });
                        }
                    }
                    // if no search results
                    else {
                        log.debug({
                            title: 'Proceesed',
                            details: 'No match for EH ID,Trying Cust Reference'
                        })
                        if (cust_reference != null && cust_reference != '') {

                            var customerSearchObj = search.create({
                                type: "customer",
                                filters: [
                                    ["entityid", "contains", cust_reference]
                                ],
                                columns: [
                                    search.createColumn({
                                        name: "internalid",
                                        label: "Internal ID"
                                    })
                                ]
                            });


                            var results = customerSearchObj.run();
                            var results_range = results.getRange(0, 1);

                            if (results_range) {

                                var cust_id = results_range[0].getValue('internalid');
                                var customer_rec = record.load({
                                    type: record.Type.CUSTOMER,
                                    id: cust_id,
                                    isDynamic: true,
                                });

                                var current_cust_eh_id = customer_rec.getValue({
                                    fieldId: 'custentity_eh_id'
                                });

                                var exception = customer_rec.getValue({
                                    fieldId: 'custentity_eh_exception'
                                });


                                if (current_cust_eh_id == '' || current_cust_eh_id == null) {

                                    customer_rec.setValue({
                                        fieldId: 'custentity_eh_credit_limit',
                                        value: format.parse({
                                            value: credit_limit,
                                            type: format.Type.INTEGER
                                        })
                                    });

                                    var customer_old_credit_limit = customer_rec.getValue({
                                        fieldId: 'creditlimit'
                                    });
                                    var current_customer_terms = customer_rec.getValue({
                                        fieldId: 'terms'
                                    });

                                    newRecord.setValue({
                                        fieldId: 'custrecord_customer_old_credit_limit',
                                        value: customer_old_credit_limit
                                    });

                                    //update customer record only if its not an exception
                                    if (exception != true) {

                                        if (current_cust_eh_id == null || current_cust_eh_id == '')
                                            customer_rec.setValue({
                                                fieldId: 'custentity_eh_id',
                                                value: euler_hermes_id
                                            });

                                        if (credit_limit > 0) {
                                            customer_rec.setValue({
                                                fieldId: 'creditlimit',
                                                value: credit_limit
                                            });
                                            //only if customer terms are blank, set customer terms to net 30
                                            if (current_customer_terms == '' || current_customer_terms == null) {
                                                customer_rec.setValue({
                                                    fieldId: 'terms',
                                                    value: 2
                                                });

                                            }
                                        }

                                        if (credit_limit == 0 || credit_limit == '') {
                                            customer_rec.setValue({
                                                fieldId: 'creditlimit',
                                                value: ''
                                            });
                                            customer_rec.setValue({
                                                fieldId: 'terms',
                                                value: ''
                                            });
                                        }


                                        customer_rec.save({
                                            enableSourcing: true,
                                            ignoreMandatoryFields: true
                                        });

                                        if (customer_old_credit_limit != credit_limit)
                                            newRecord.setValue({
                                                fieldId: 'custrecord_cust_rec_update',
                                                value: true
                                            });

                                        newRecord.setValue({
                                            fieldId: 'custrecord_ns_customer',
                                            value: cust_id
                                        });

                                    }
                                }
                            }
                        }
                    }
                }


            }


        }
        return {
            beforeSubmit: beforeSubmit,
        };

    });