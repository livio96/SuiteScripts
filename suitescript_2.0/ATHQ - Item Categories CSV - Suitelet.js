/**
 *@NApiVersion 2.x
 *@NScriptType Suitelet
 */
define([
    'N/ui/serverWidget',
    'N/task',
    'N/log',
    'N/runtime'
], function categoriesSuitelet(
    nUi,
    nTask,
    nLog,
    nRuntime
) {
    return {
        onRequest: function onRequest(context) {
            var form;
            var file;
            var request;
            var files;
            var script = nRuntime.getCurrentScript();
            var fileId;
            var mapReduceTask;
            var submitResult;
            var folder = script.getParameter({
                name: 'custscript_site_folder_id'
            });
            var taskStatus;

            if (context.request.method === 'GET') {
                form = nUi.createForm({
                    title: 'Item Category CSV Import'
                });
                file = form.addField({
                    id: 'file',
                    type: nUi.FieldType.FILE,
                    label: 'CSV File'
                });
                file.isMandatory = true;

                form.addSubmitButton({
                    label: 'Import CSV'
                });

                var field = form.addField({
                    id : 'description',
                    type : nUi.FieldType.INLINEHTML,
                    label : 'Description'
                });

                field.defaultValue = '<p>Please upload a CSV file with the fields.</p><p>PrimaryCategory should be T or F, true or false, or Yes and No</p><p>Here is an example of the heading, naming should be the same, order does not matter.</p><p>ItemId is the internalid of the item and ItemName is the name of the item, only one of this columns should exist. Category should be the internalid of the category.</p><table style="width:100%"><tr><th>Category</th><th>ItemName</th> <th>ItemId</th><th>PrimaryCategory</th></tr></table>';
                field.updateLayoutType({
                    la​y​o​u​t​T​y​p​e: nUi.FieldLayoutType.OUTSIDE
                });

                context.response.writePage(form);
            } else {
                request = context.request;
                nLog.error('parameters', request.parameters);
                files = request.files;
                nLog.error('files', files);
                if (files && files.file) {
                    file = files.file;
                    if (folder) {
                        file.folder = folder;
                    }
                    fileId = file.save();
                    if (fileId) {
                        mapReduceTask = nTask.create({
                            taskType: nTask.TaskType.MAP_REDUCE,
                            scriptId: 'customscript_athq_item_category_csv',
                            params: {
                                custscript_file_item_id: fileId
                            }
                        });
                        submitResult = mapReduceTask.submit();
                        taskStatus = nTask.checkStatus({
                            taskId: submitResult
                        });
                        nLog.error('submitResult', submitResult);
                        nLog.error('taskStatus', taskStatus);
                        if (taskStatus.status === nTask.TaskStatus.FAILED) {
                            context.response.writeLine({ ou​t​p​u​t: 'Error on map reduce' });
                        } else {
                            context.response.writeLine({ ou​t​p​u​t: 'Successfully executed map reduce' });
                        }

                    } else {
                        context.response.writeLine({ ou​t​p​u​t: 'Error saving the file' });
                    }
                } else {
                    context.response.writeLine({ ou​t​p​u​t: 'Error saving the file' });
                }
            }
        }
    }

});
