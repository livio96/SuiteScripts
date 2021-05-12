/**
 * @NApiVersion 2.0
 * @NScriptType suitelet
 */

define(['N/task', 'N/ui/serverWidget'],
    function(task, serverWidget) {

        //Todo maybe change the logic to match on bank account instead of bank statement. This wil then load all transactions with a saved search in tHe MR script
        //Todo also posssible to just state match now and then load all open lines like in current matching, but this will limit the way of matching
        var parametersMapping = {
            "customscript_ff_mr_specific_matcher": {
                "custscript_ff_ew_bank_statement_param": "",
                "custscript_ff_mr_matching_field": "",
                setParameters: function (bankStatement,matchingField) {
                    this.custscript_ff_bank_statement_p = bankStatement;
                    this.custscript_ff_mr_matching_field = matchingField;
                }
            }

        };

        function onRequest(context) {

            var form = serverWidget.createForm({
                title: "Match transactions on bank statement"
            });

            if (context.request.method === "GET") {

                form.addField({
                    id: "custpage_bank_statements",
                    type: serverWidget.FieldType.SELECT,
                    label: "Bank Statement",
                    source: "customrecord_bank_statement"
                });

                form.addField({
                    id: "custpage_matching_field",
                    type: serverWidget.FieldType.TEXT,
                    label: "Matching Field"
                });

                var scriptSelection = form.addField({
                    id: "custpage_processing_option",
                    type: serverWidget.FieldType.SELECT,
                    label: "Matching option",
                });

                scriptSelection.addSelectOption({
                    value: "customscript_ff_mr_specific_matcher",
                    text: "Specific Matching"
                });

                form.addSubmitButton({
                    label: "Schedule Custom Matching"
                });

            } else {

                var selectedBankStatement = context.request.parameters["custpage_bank_statements"];
                var matchingField = context.request.parameters["custpage_matching_field"];
                var selectedOption = context.request.parameters["custpage_processing_option"];

                log.debug("bankstatementSelected", context.request.parameters["custpage_bank_statements"]);
                log.debug("matchingFieldSelected", context.request.parameters["custpage_matching_field"]);
                log.debug("selectedOption", context.request.parameters["custpage_processing_option"]);

                parametersMapping[selectedOption].setParameters(selectedBankStatement,matchingField,selectedOption);

                var mapReduceTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: selectedOption,
                    params: parametersMapping[selectedOption]
                });

                form.addField({
                    id: "custpage_label",
                    type: serverWidget.FieldType.INLINEHTML,
                    label: "Task Scheduled."
                }).defaultValue = "Map/Reduce Task scheduled.";

                mapReduceTask.submit();

            }

            context.response.writePage(form);

        }
        return {
            onRequest: onRequest
        };
    });
