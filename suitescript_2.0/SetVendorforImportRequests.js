/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/search', 'N/record', 'N/log', 'N/file'],
    function (search, record, log, file) {
        function afterSubmit(con) {
            //load recird
            var recordType = con.newRecord.type;
            var recordID = con.newRecord.id;
            var rec = record.load({
                type: recordType,
                id: recordID
            });

            //get values for import type
            var importType = rec.getValue('custrecord_ireq_type');
            //run rest of code if import type = Smart Vendor Add/Update
            if (importType == 1) {
                //load file contents and parse to array for lines
                var attachedFileID = rec.getValue('custrecord_ireq_import_file');
                var attachedFileObj = file.load(attachedFileID);
                var fileContents = attachedFileObj.getContents();
                var fileContentArr = fileContents.split('\n');

                //load headers and lookup index of 'Vendor'
                var fileHeaders = fileContentArr[0].split(',');
                var lastColumn = fileHeaders.pop();
                fileHeaders.push(lastColumn.slice(0, -1));
                var vendorIndex = fileHeaders.indexOf('Vendor');

                //load first line and lookup value at index of 'Vendor' column
                var line1 = fileContentArr[1].split(',');
                lastColumn = line1.pop();
                line1.push(lastColumn.slice(0, -1));
                var vendorText = line1[vendorIndex];

                //use value of vendor name to filter search of existing vendors for import requests
                var lookupSearch = search.load('customsearch_import_req_ven_lookup');
                var nameFilter = { "name": "name", "operator": "is", "values": [vendorText], "isor": false, "isnot": false, "leftparens": 0, "rightparens": 0 };
                var filters = lookupSearch.filters;
                filters.push(nameFilter);
                lookupSearch.filters = filters;
                var lookupSearchResults = lookupSearch.run().getRange(0, 1000);

                //if there is an existing vendor, set Vendor Text fields and Import Vendor field on record, source text qualifier 
                if (lookupSearchResults.length > 0) {
                    var vendorID = lookupSearchResults[0].getValue('internalid');
                    record.submitFields({
                        type: recordType,
                        id: recordID,
                        values: {
                            custrecord_ireq_vendor_text: vendorText,
                            custrecord_ireq_vendor: vendorID
                        },
                        options: {
                            enableSourcing: true,
                            ignoreMandatoryFields: true
                        }
                    });
                }
                //if there if no matching vendor, set vendor text field value
                else {
                    record.submitFields({
                        type: recordType,
                        id: recordID,
                        values: {
                            custrecord_ireq_vendor_text: vendorText
                        }
                    });
                }
            }
            else if (importType == 2) {
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_tex_qualifier: 'none'
                    }
                });
            }
            else if (importType == 3){
                record.submitFields({
                    type: recordType,
                    id: recordID,
                    values: {
                        custrecord_ireq_vendor_text: 'Cisco Refresh',
                        custrecord_ireq_vendor: 1
                    },
                    options: {
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    }
                });
            }
        }
        return {
            afterSubmit: afterSubmit
        };
    });