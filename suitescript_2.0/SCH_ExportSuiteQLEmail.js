/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/record', 'N/file', 'N/format'],
    function(record, file, format){
		function createSuiteQLEmailExport(con){
			var
				fileID = 16586181, //Stocklist query
				folder = 11231759, //SuiteQL Email Export files
				fileName = new Date(), //get date for string
				fileObj = file.load(fileID);
			
			filename = format.parse({
				type: format.Type.DATETIME,
				value: fileName,
				timezone: 14
			});	
			var rec = record.create({
				type: 'customrecord1823', //SuiteQL email export record type
				isDynamic: true
			});

			rec.setValue({
				fieldId: 'name',
				value: fileObj.name+' '+fileName 
			});

			rec.setValue({
				fieldId: 'custrecord100',
				value: fileID
			});

			var newRecID = rec.save();
		}
		return {
			execute: createSuiteQLEmailExport
		};
	});