/**
 *@NApiVersion 2.0
 *@NScriptType MapReduceScript
 */
define(["N/record", "N/runtime", "N/search"],
    /**
     *
     * @param {record} record
     * @param {runtime} runtime
     * @param {search} search
     * @returns {{getInputData: getInputData, map: map, reduce: reduce, summarize: summarize}}
     */
    function(record, runtime, search) {

        var matchingReasonMapping = {
            "CustPymt": "6",
            "CustInvc": "1"
        };

        function getInputData() {

            //Retreive data from script parameters submitted in the suitelet
            var bankStatementId = runtime.getCurrentScript().getParameter("custscript_ff_bank_statement_p");
            var matchingField = runtime.getCurrentScript().getParameter("custscript_ff_mr_matching_field");

            log.debug("Start", "Start getting input data");
            log.debug("bankStatementId", JSON.stringify(bankStatementId));
            log.debug("matchingField", JSON.stringify(matchingField));

            //Create search
            var bsTransactionLines = search.load({
                id: 'customsearch_ff_unmatched_bs_tr_lines'
            });

            var filters = bsTransactionLines.filters; //reference Search.filters object to a new variable
            var filterOne = search.createFilter({ //create new filter
                name: 'custrecord_bst_bank_statement',
                operator: search.Operator.ANYOF,
                values: bankStatementId
            });

            filters.push(filterOne); //add the filter using .push() method
            var results = bsTransactionLines.run().getRange(0,400);

            log.debug("Bank statement transaction lines results", JSON.stringify(results));
            return results;

        }

        function map(context) {

            log.debug("Start", "Start mapping data");

            var bankStatementTransaction = JSON.parse(context.value)["values"];

            log.debug("bankStatementTransaction", JSON.stringify(bankStatementTransaction));

            //TODO Here we could provide the suitelet a logic
            var paymentOtherReference = bankStatementTransaction["custrecord_bst_desc"]
            var bankAccount = bankStatementTransaction["CUSTRECORD_BST_FILEMAPPING.custrecord_cfg_bank_acct"][0].value;
            //var transitAccount = bankStatementTransaction["CUSTRECORD_BST_FILEMAPPING.custrecord_cfg_paymentintransit"][0].value;

            log.debug("paymentOtherReference", paymentOtherReference);
            log.debug("bankAccount", JSON.stringify(bankAccount));
            //log.debug("transitAccount", JSON.stringify(transitAccount));

            if(paymentOtherReference) {

                //Build search and add the custom filters that depend on user input
                // var transactionSearch = search.load({
                //     id: 'customsearch_ff_bs_tr_match_search',
                //     type: 'transaction'
                // });
                //
                // //Todo filter with the account and transit account
                // //Todo only base currency is matched now I think
                var transactionSearch = search.load({
                    id: 'customsearch_ff_bs_tr_match_search',
                    type: 'transaction'
                });

                var filtersTR = transactionSearch.filters; //reference Search.filters object to a new variable
                var filterOne = search.createFilter({ //create new filter
                    name: 'amount',
                    operator: search.Operator.EQUALTO,
                    values: bankStatementTransaction["custrecord_bst_amount"]
                });
                filtersTR.push(filterOne); //add the filter using .push() method
                var filtertwo = search.createFilter({ //create new filter
                    name: 'custbody_celigo_etail_order_id',
                    operator: search.Operator.IS,
                    values: JSON.stringify(paymentOtherReference)
                });
                filtersTR.push(filtertwo); //add the filter using .push() method

                //Todo this should be if/else depending on data in the transit account
                var filterthree = search.createFilter({ //create new filter
                    name: 'account',
                    operator: search.Operator.IS,
                    values: bankAccount
                });
                filtersTR.push(filterthree); //add the filter using .push() method

                log.debug("transactionSearch", JSON.stringify(transactionSearch));

                var paymentTransactionIds = [];

                //Todo check if there is more then one match if so skip this in total, this should be one-on-one
                transactionSearch.run().each(function (transaction) {

                    var getNextResult = true;
                    log.debug("transactionSearch", JSON.stringify(transaction));

                    var transactionIdObject = {
                        "processingInformation": {
                            "id": transaction.id,
                            "type": 'CustPymt',
                            "amt": parseFloat(parseFloat(transaction.getValue("amount")).toFixed(2)),
                            "acc": transaction.getValue("account")
                        },
                        "transactionInformation": {
                            "entity": transaction.getValue("entity"),
                            "tranId": transaction.getValue("internalid"),//Todo can be removed I think
                            "transactionnumber": transaction.getValue("transactionnumber")
                        }
                    };

                    if(transaction.recordType === "customerpayment" ) {
                        log.debug("pushTransactionObject", JSON.stringify(transactionIdObject));
                        transactionIdObject["processingInformation"]["sc"] = "t";
                        getNextResult = false;
                        paymentTransactionIds.push(transactionIdObject);

                        log.debug("Payments Found for ref: "+paymentOtherReference, JSON.stringify(paymentTransactionIds));

                        /**
                         * We know that it's only 1-1 on matching.
                         */
                        if(paymentTransactionIds.length > 0) {

                            var processingInformation = paymentTransactionIds[0]["processingInformation"];
                            var transactionInformation = paymentTransactionIds[0]["transactionInformation"];

                            record.submitFields({
                                type: "customrecord_ba_transactions",
                                id: JSON.parse(context.value).id,
                                values: {
                                    custrecord_bst_transaction_ids: JSON.stringify([processingInformation]),
                                    custrecord_ff_bst_matching_reason: matchingReasonMapping[processingInformation.type],
                                    custrecord_bst_transaction_m: processingInformation.type+" "+transactionInformation.transactionnumber,
                                    custrecord_bst_customer_vendor: transactionInformation.entity,
                                    custrecord_bst_select: true
                                }
                            });

                            log.debug("submitData", "Submitting data to bank statement transaction line");
                        }
                    } else {

                        log.debug("submitData", "No match found for this bank statement transaction line");
                    }

                    return getNextResult;
                });

            }

        }

        function summarize(summary) {

            log.debug("Start", "Start summarize data");

            if(summary.mapSummary.errors) {
                summary.mapSummary.errors.iterator().each(function (key, value) {
                    log.error("Error - Map Summary", value);
                    return true;
                });
            }

            log.debug("Done", "Map/Reduce is ready");
        }

        return {
            getInputData: getInputData,
            map: map,
            summarize: summarize
        };
    });