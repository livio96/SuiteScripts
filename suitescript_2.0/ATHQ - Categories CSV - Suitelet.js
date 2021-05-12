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
                name: 'custscript_folder_id'
            });
            var taskStatus;

            if (context.request.method === 'GET') {
                form = nUi.createForm({
                    title: 'Category CSV Import'
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

                field.defaultValue = '<p>Please upload a CSV file with the fields.</p><p>Internalid is only to edit existent categories.</p><p>WebSite is the internal id of the website where the category should appear.</p><p>Display In Website should be T or F</p><p>Here is an example of the heading, naming should be the same, order does not matter.</p><p>Valid column separators are comma (,) and pipe (|), if any of the values contain a comma (,) you must use a pipe (|).</p><table style="width:100%;border:1px"><tr><th style="border: 1px solid black;">Name</th><th style="border: 1px solid black;">Description</th> <th style="border: 1px solid black;">Page Title</th><th style="border: 1px solid black;">Heading</th><th style="border: 1px solid black;">Parent</th> <th style="border: 1px solid black;">Url</th><th style="border: 1px solid black;">Page Banner</th><th style="border: 1px solid black;">Thumbnail Image</th> <th style="border: 1px solid black;">Addition to Head</th><th style="border: 1px solid black;">Meta Keywords</th><th style="border: 1px solid black;">Meta Description</th> <th style="border: 1px solid black;">Display In Website</th><th style="border: 1px solid black;">WebSite</th><th style="border: 1px solid black;">Internalid</th></tr></table>';
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
                            scriptId: 'customscript_athq_categories_csv',
                            params: {
                                custscript_file_id: fileId
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
