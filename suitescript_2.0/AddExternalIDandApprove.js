/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */
define(['N/record', 'N/file', 'N/log'],
    function (record, file, log) {
        function parseExternalID(con) {
            //get Type, id and load record
            var recordType = con.newRecord.type;
            var recordID = con.newRecord.id;
            var rec = record.load({
                type: recordType,
                id: recordID
            });
            //get value for importType
            var importType = rec.getValue('custrecord_ireq_type');
            var attachedFileID = rec.getValue('custrecord_ireq_import_file');
            //if import type = Smart Vendor Add/Update
            if (importType == 1) {
                //get text qualifier, file object, and file name
                var textQualifier = rec.getValue('custrecord_ireq_tex_qualifier');
                var attachedFileObj = file.load(attachedFileID);
                var attachedFileName = attachedFileObj.name.slice(0, -4);
                //log.debug('fileObj', attachedFileObj);
                //get contents and split to array
                var fileContents = attachedFileObj.getContents();
                //log.debug('fileContents', fileContents);
                var fileContentsArr = fileContents.split('\n');
                //append externalid column
                var fileHeaders = fileContentsArr[0];
                var splitHeaders = fileHeaders.split(',');
                var partIndex = splitHeaders.indexOf('Part');
                var lastColumn = splitHeaders.pop();
                splitHeaders.push(lastColumn.slice(0, -1) + ',ExternalID');
                fileHeaders = splitHeaders.toString();
                fileContentsArr.splice(0, 1, fileHeaders);
                //log.debug('Headers', fileContentsArr[0]);
                //iterate through array and add content to end of each line
                for (var i = 1; i < fileContentsArr.length - 1; i++) {
                    var line = fileContentsArr[i];
                    var lineFields = line.split(',');
                    var ExternalID = lineFields[partIndex] + textQualifier;
                    var lastColumn = lineFields.pop();
                    lineFields.push(lastColumn.slice(0, -1) + ',' + ExternalID)
                    line = lineFields.toString();
                    fileContentsArr.splice(i, 1, line);
                    //log.debug('line', fileContentsArr[i]);
                }
                //log.debug('main string', fileContentsArr.join('\n'));
                //join array to new file contents, create new file and save file 
                var newFileContents = fileContentsArr.join('\n');
                var updatedFile = file.create({
                    name: attachedFileName + '_updated.csv',
                    fileType: attachedFileObj.fileType,
                    contents: newFileContents,
                    folder: attachedFileObj.folder
                });
                var updatedFileID = updatedFile.save();
                //submitFields to add new file, approve and set CSV status
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_final_file: updatedFileID,
                        custrecord_ireq_csv_status: 'QUEUED',
                        custrecord_ireq_status: 2
                    }
                });
            }//if import type is Main BrokerBin Listing Update
            else if (importType == 2) {
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_final_file: attachedFileID,
                        custrecord_ireq_csv_status: 'QUEUED',
                        custrecord_ireq_status: 2
                    }
                });
            }
            else if (importType == 3) {
                //get text qualifier, file object, and file name
                var textQualifier = rec.getValue('custrecord_ireq_tex_qualifier');
                var attachedFileObj = file.load(attachedFileID);
                var attachedFileName = attachedFileObj.name.slice(0, -4);
                //log.debug('fileObj', attachedFileObj);
                //get contents and split to array
                var fileContents = attachedFileObj.getContents();
                //log.debug('fileContents', fileContents);
                var fileContentsArr = fileContents.split('\n');
                //append externalid column
                var fileHeaders = fileContentsArr[0];
                var splitHeaders = fileHeaders.split(',');
                var partIndex = splitHeaders.indexOf('Cisco RF PN');
                var lastColumn = splitHeaders.pop();
                splitHeaders.push(lastColumn.slice(0, -1) + ',ExternalID');
                fileHeaders = splitHeaders.toString();
                fileContentsArr.splice(0, 1, fileHeaders);
                //log.debug('Headers', fileContentsArr[0]);
                //iterate through array and add content to end of each line
                for (var i = 1; i < fileContentsArr.length - 1; i++) {
                    var line = fileContentsArr[i];
                    var lineFields = line.split(',');
                    var ExternalID = lineFields[partIndex] + textQualifier;
                    var lastColumn = lineFields.pop();
                    lineFields.push(lastColumn.slice(0, -1) + ',' + ExternalID)
                    line = lineFields.toString();
                    fileContentsArr.splice(i, 1, line);
                    //log.debug('line', fileContentsArr[i]);
                }
                //log.debug('main string', fileContentsArr.join('\n'));
                //join array to new file contents, create new file and save file 
                var newFileContents = fileContentsArr.join('\n');
                var updatedFile = file.create({
                    name: attachedFileName + '_updated.csv',
                    fileType: attachedFileObj.fileType,
                    contents: newFileContents,
                    folder: attachedFileObj.folder
                });
                var updatedFileID = updatedFile.save();
                //submitFields to add new file, approve and set CSV status
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_final_file: updatedFileID,
                        custrecord_ireq_csv_status: 'QUEUED',
                        custrecord_ireq_status: 2
                    }
                });
            }
            //else set to error status
            else {
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_status: 4
                    }
                });
            }
        }
        return {
            onAction: parseExternalID,
        };
    });
