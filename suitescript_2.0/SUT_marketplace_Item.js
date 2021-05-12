/**
* @NApiVersion 2.x
* @NScriptType Suitelet
* @NModuleScope Public
*/
var 
	file,	
	log,
	query,
	serverWidget,
	sqlFolderName = 'Suitelet Assets',
	sqlFolderID,
	sqlFiles,
	tableHelpEnabled = true,
    fileID,
    fileList = [];
define( [ 'N/file', 'N/log', 'N/query', 'N/ui/serverWidget' ], main );

function main( fileModule, logModule, queryModule, serverWidgetModule ) {

	// Set module references.
	file = fileModule;
	log = logModule;
	query = queryModule;
	serverWidget = serverWidgetModule;
	
	// Get the ID of the SuiteQL Scripts folder and files of folder.
	sqlFolderID = sqlFolderGet();
	sqlFiles = sqlFolderFilesGet();			
	
    return {
    	onRequest: function(context) {
			// Create a form.
			var form = serverWidget.createForm(
				{
					title: 'Marketplace Item Detail',
					hideNavBar: false
				}
			);		
			// Add a hidden "action" field.
			actionFieldAdd(form);																					
			// If the form has been submitted...
			if (context.request.method == 'POST') {	
				switch (context.request.parameters.custpage_field_action) {
					case 'export-results':
						exportQueryResults( context, form );
						break;			
					case 'run-query':
						queryRun( context, form );
						break;
                    	
					default:
						form.addSubmitButton({label: 'Submit' });										
				}					
			} else {
                //add default view here
                form.addSubmitButton('Search')
                displayTextInputs(context, form);
                displaySearchFilters(context, form);
			}
			// Add client-side Javascript to the form.
			javascriptAdd( context, form );				
			// Display the form.
			context.response.writePage(form);
        }   
    }
}

function actionFieldAdd( form ) {
	// Add the action field.
	// This is used to determine what action to take when the form is submitted.
	var actionField = form.addField(
		{
			id: 'custpage_field_action',
			type: serverWidget.FieldType.TEXT,
			label: 'Action'
		}								
	);	
	
	// Hide the action field.
	actionField.updateDisplayType(
		{
			displayType: serverWidget.FieldDisplayType.HIDDEN
		}
	);	
	
	// Set the default value for the action field.
	actionField.defaultValue = 'run-query';	
}

function exportResultsButtonAdd( form ) {
	// Client-side script that will be run when the Export button is clicked.
	var exportFunction =
		'document.getElementById(\'custpage_field_action\').value = (\'export-results\');'
		+ 'document.main_form.submit();';			
	
	// Add an "Export Results" button.	
	form.addButton( 
		{
			id: 'custpage_button_add',
			label: 'Export Results',
			functionName: exportFunction
		} 
	);	
}

function exportQueryResults (context, form) {    
	fileList = []
    
    loadQueryContent(context, 16634451);
    loadQueryContent(context, 16622516);
    loadQueryContent(context, 16620449);
    
    var 
		regex = new RegExp(/_/g)
		newFieldGroupId = 'downloads',
		newFieldGroup = form.addFieldGroup({
			id: newFieldGroupId,
			label: 'Click Below to Download Results'
		});
		
		newFieldGroup.isSingleColumn = true;
		newFieldGroup.isBorderHidden = false;

	for (ccc = 0; ccc < fileList.length; ccc++){
		// Run the query.
		var queryResults = query.runSuiteQL(
			{
				query: fileList[ccc].contents
			}
		); 					
		// Get the mapped results.
		var records = queryResults.asMappedResults();
		if (records.length > 0){
                
            // Initialize the file contents.
            var csv = "";

            // Get the column names.
            var columnNames = Object.keys(records[0]);	
            var row = '"' + columnNames.join( '","' ) + '"';
            csv += row + "\r\n";
            
            // Add the records to the file...
            for (r = 0; r < records.length; r++ ) {
                // Get the record.
                var record = records[r];
                
                var values = [];

                // Loop over the columns...
                for ( c = 0; c < columnNames.length; c++ ) {

                    // Get the column name.
                    var column = columnNames[c];

                    // Get the column value.
                    var value = record[column];
                    if ( value != null ) {
                        value = value.toString();
                    } else {
                        value = '';
                    }

                    // Add the column value.
                    values.push( '"' + value + '"' );		     
                }
                
                var row = values.join( ',' );
                csv += row + "\r\n";		
            }
            
            var resultsFile = file.create({
                name: fileList[ccc].name.replace('.txt', '')+'.csv',
                fileType: file.Type.CSV,
                contents: csv,
                folder: 11225420
            });

            var resultsFileID = resultsFile.save();
            var resultsFileSaved = file.load(resultsFileID);
            var url = resultsFileSaved.url;

            var resultsField = form.addField({
                id: 'custpage_field_'+fileList[ccc].name.replace('.txt', '').toLowerCase(),
                type: serverWidget.FieldType.URL,
                label: fileList[ccc].name.replace('.txt', '').replace(regex, ' '),
                container: newFieldGroupId
            });
        
            resultsField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
            resultsField.defaultValue = 'https://586038.app.netsuite.com/'+url;
            resultsField.linkText = 'Download';
        }
	}

	/*/ Add an inline HTML field so that JavaScript can be injected.
	var jsField = form.addField(
		{
			id: 'custpage_field_js_export_csv',
			type: serverWidget.FieldType.INLINEHTML,
			label: 'Javascript'
		}								
	);
	
	// Create JavaScript to download the file.
	var js = '<script>\r\n';	
	js += 'var encodedUri = encodeURI( `' + csv + '` );\r\n';
	js += 'window.open( encodedUri );\r\n'
	js += '</script>\r\n';	
	
	// Add Javascript.
	jsField.defaultValue = js;*/

	// Add a "Run Query" submit button.
	//form.addSubmitButton( { label: 'Submit' } );				
	
	// Add a "Status" field.
	var 
		grID = 'status',
		gr = form.addFieldGroup({
			id: grID,
			label: 'Status',
		});

		gr.isBorderHidden = true;
		gr.isSingleColumn = true;
		
	var statusField = form.addField(
		{
			id: 'custpage_field_status',
			type: serverWidget.FieldType.TEXT,
			label: 'Status',
			container: grID
		}								
	);

	statusField.updateDisplayType({
		displayType: serverWidget.FieldDisplayType.INLINE
	});
	
	// Set the field's value.
	statusField.defaultValue = 'Exported';
}

function javascriptAdd( context, form ) {

	// Add an inline HTML field so that JavaScript can be injected.
	var jsField = form.addField(
		{
			id: 'custpage_field_js',
			type: serverWidget.FieldType.INLINEHTML,
			label: 'Javascript'
		}								
	);
	
	// Add Javascript...
	jsField.defaultValue = '<script>\r\n';
	
	// Adjust the size of the textareas.
	jsField.defaultValue += 'document.getElementById("custpage_field_item_receipt").rows=25;\r\n';
	if ( context.request.parameters.custpage_field_action == 'run-query' ) {	
		jsField.defaultValue += 'document.getElementById("custpage_field_results").rows=20;\r\n';
	}	
			
	jsField.defaultValue += 'if ( ' + tableHelpEnabled + ' ) {\r\n';
	
		jsField.defaultValue += 'var rcEndpoint = \'/app/recordscatalog/rcendpoint.nl\';\r\n';
		jsField.defaultValue += 'var data = encodeURI( JSON.stringify( { structureType: \'FLAT\' } ) );\r\n';
		jsField.defaultValue += 'var url = rcEndpoint + \'?action=\getRecordTypes&data=\' + data;\r\n';
		jsField.defaultValue += 'var xhr = new XMLHttpRequest();\r\n';
		jsField.defaultValue += 'xhr.open( \'get\', url, false );\r\n';
		jsField.defaultValue += 'xhr.send();\r\n';
		jsField.defaultValue += 'var recordTypes = JSON.parse( xhr.response );	\r\n';
			
		jsField.defaultValue += 'var recordDetailCache = [];\r\n';
	
	jsField.defaultValue += '}\r\n';
	
	jsField.defaultValue += '\r\n';		
		
	jsField.defaultValue += 'window.jQuery = window.$ = jQuery;\r\n';			
	jsField.defaultValue += '$(\'textarea\').keydown(function(e) {\r\n';
		
		
		jsField.defaultValue += 'if ( e.keyCode === 9 ) {\r\n';		
			jsField.defaultValue += 'var start = this.selectionStart;\r\n';
			jsField.defaultValue += 'var end = this.selectionEnd;\r\n';
			jsField.defaultValue += 'var $this = $(this);\r\n';
			jsField.defaultValue += 'var value = $this.val();\r\n';
			jsField.defaultValue += '$this.val(value.substring(0, start)';
			jsField.defaultValue += '+ "\t"';
			jsField.defaultValue += '+ value.substring(end));\r\n';
			jsField.defaultValue += 'this.selectionStart = this.selectionEnd = start + 1;\r\n';
			jsField.defaultValue += 'e.preventDefault();\r\n';			
		jsField.defaultValue += '}\r\n';
	
		jsField.defaultValue += 'if (  ( ' + tableHelpEnabled + ' ) && ( e.keyCode === 190 ) ) {\r\n';		
		
			jsField.defaultValue += 'var receiptField = document.getElementById("custpage_field_item_receipt");\r\n';		
			jsField.defaultValue += 'var pos = receiptField.selectionStart;\r\n';			
			jsField.defaultValue += 'if ( pos > 1 ) {\r\n';		
			
				jsField.defaultValue += 'if ( receiptField.value.charAt( pos - 1 ) == \'.\' ) {\r\n';
								
					jsField.defaultValue += 'var tableStart = -2;\r\n';				
					jsField.defaultValue += 'for ( i = pos - 2; i > 0; i--) {\r\n';
						jsField.defaultValue += 'var c = receiptField.value.charAt(i);\r\n';					
						jsField.defaultValue += 'if ( ( c == \'\\t\' )  || ( c == \' \' )  || ( c == \'\\n\' )  || ( c == \'\\r\' ) ) {\r\n';
							jsField.defaultValue += 'i = i + 1;\r\n';
							jsField.defaultValue += 'break;\r\n';
						jsField.defaultValue += '}\r\n';					
					jsField.defaultValue += '}\r\n';				
					
					jsField.defaultValue += 'var tableName = receiptField.value.substring( i, pos - 1 );\r\n';

					jsField.defaultValue += 'if ( tableName in recordDetailCache ) {\r\n';
						jsField.defaultValue += 'recordDetail = recordDetailCache[ tableName ];\r\n';
					jsField.defaultValue += '} else {\r\n';										
						jsField.defaultValue += 'data = encodeURI( JSON.stringify( { scriptId: tableName, detailType: \'SS_ANAL\' } ) );\r\n';
						jsField.defaultValue += 'var url = rcEndpoint + \'?action=getRecordTypeDetail&data=\' + data;\r\n';
						jsField.defaultValue += 'var xhr = new XMLHttpRequest();\r\n';
						jsField.defaultValue += 'xhr.open( \'GET\', url, false );\r\n';
						jsField.defaultValue += 'xhr.send();\r\n';						
						jsField.defaultValue += 'if ( xhr.status == 200 ) {\r\n';					
							jsField.defaultValue += 'recordDetail = JSON.parse( xhr.response ).data;\r\n';
							jsField.defaultValue += 'recordDetailCache[ tableName ] = recordDetail;\r\n';
						jsField.defaultValue += '} else {\r\n';	
							jsField.defaultValue += 'recordDetail = null;\r\n';
						jsField.defaultValue += '}\r\n';
					jsField.defaultValue += '}\r\n';
					
					jsField.defaultValue += 'if ( recordDetail == null ) {\r\n';
						jsField.defaultValue += 'alert( \'Table "\' + tableName + \'" was not found in the Records Catalog.\' );\r\n';
					jsField.defaultValue += '} else {\r\n';					
													
						jsField.defaultValue += 'var help = \'<html>\';\r\n';
						
						jsField.defaultValue += 'help += \'<head>\';\r\n';
						jsField.defaultValue += 'help += \'<style type = "text/css">\'\r\n';
						jsField.defaultValue += 'help += \'body {\'\r\n';
						jsField.defaultValue += 'help += \'font-family: Open Sans, Helvetica, sans-serif;\'\r\n';
						jsField.defaultValue += 'help += \'}\'\r\n';
						
						jsField.defaultValue += 'help += \'table {\'\r\n';
						jsField.defaultValue += 'help += \'font-family: Open Sans, Helvetica, sans-serif;\'\r\n';
						jsField.defaultValue += 'help += \'font-size:12px;\'\r\n';
						jsField.defaultValue += 'help += \'color:#333333;\'\r\n';
						jsField.defaultValue += 'help += \'border-width: 1px;\'\r\n';
						jsField.defaultValue += 'help += \'border-color: #3A3A3A;\'\r\n';
						jsField.defaultValue += 'help += \'border-collapse: collapse;\'\r\n';
						jsField.defaultValue += 'help += \'}\'\r\n';
						jsField.defaultValue += 'help += \'table th {\'\r\n';
						jsField.defaultValue += 'help += \'border-width: 1px;\'\r\n';
						jsField.defaultValue += 'help += \'padding: 8px;\'\r\n';
						jsField.defaultValue += 'help += \'border-style: solid;\'\r\n';
						jsField.defaultValue += 'help += \'border-color: #3A3A3A;\'\r\n';
						jsField.defaultValue += 'help += \'background-color: #B3B3B3;\'\r\n';
						jsField.defaultValue += 'help += \'}\'\r\n';
						jsField.defaultValue += 'help += \'table td {\'\r\n';
						jsField.defaultValue += 'help += \'border-width: 1px;\'\r\n';
						jsField.defaultValue += 'help += \'padding: 8px;\'\r\n';
						jsField.defaultValue += 'help += \'border-style: solid;\'\r\n';
						jsField.defaultValue += 'help += \'border-color: #3A3A3A;\'\r\n';
						jsField.defaultValue += 'help += \'background-color: #ffffff;\'\r\n';
						jsField.defaultValue += 'help += \'}\'\r\n';						
						jsField.defaultValue += 'help += \'</style>\'\r\n';
						jsField.defaultValue += 'help += \'</head>\';\r\n';
						
						jsField.defaultValue += 'help += \'<body class="body_2010">\';\r\n';
						
						jsField.defaultValue += 'help += \'<h2 style="color: #4d5f79;">\' + recordDetail.label + \'</h2>\';\r\n';
						
						jsField.defaultValue += 'help += \'<h3 style="margin-bottom: 3px; color: #333333;">Columns</h3>\';\r\n';	
						jsField.defaultValue += 'help += \'<table style="width:100%">\';\r\n';	
						jsField.defaultValue += 'help += \'<tr>\';\r\n';	
						jsField.defaultValue += 'help += \'<th>Label</th>\';\r\n';	
						jsField.defaultValue += 'help += \'<th>Name</th>\';\r\n';	
						jsField.defaultValue += 'help += \'<th>Type</th>\';\r\n';	
						jsField.defaultValue += 'help += \'</tr>\';\r\n';						
						jsField.defaultValue += 'for ( i = 0; i < recordDetail.fields.length; i++ ) {\r\n';												
							jsField.defaultValue += 'var field = recordDetail.fields[i];\r\n';									
							jsField.defaultValue += 'if ( field.isColumn ) {;\r\n';										
								jsField.defaultValue += 'help += \'<tr>\';\r\n';	
								jsField.defaultValue += 'help += \'<td>\' + field.label + \'</td>\';\r\n';	
								jsField.defaultValue += 'help += \'<td>\' + field.id + \'</td>\';\r\n';
								jsField.defaultValue += 'help += \'<td>\' + field.dataType + \'</td>\';\r\n';
								jsField.defaultValue += 'help += \'</tr>\';\r\n';									
							jsField.defaultValue += '};\r\n';												
						jsField.defaultValue += '}\r\n';						
						jsField.defaultValue += 'help += \'</table>\';\r\n';

						jsField.defaultValue += 'help += \'<h3 style="margin-bottom: 3px; color: #333333;">Joins</h3>\';\r\n';	
						jsField.defaultValue += 'help += \'<table style="width:100%">\';\r\n';	
						jsField.defaultValue += 'help += \'<tr>\';\r\n';	
						jsField.defaultValue += 'help += \'<th>Label</th>\';\r\n';	
						jsField.defaultValue += 'help += \'<th>Table Name</th>\';\r\n';	
						jsField.defaultValue += 'help += \'<th>Cardinality</th>\';\r\n';
						jsField.defaultValue += 'help += \'<th>Join Pairs</th>\';\r\n';	
						jsField.defaultValue += 'help += \'</tr>\';\r\n';						
						jsField.defaultValue += 'for ( i = 0; i < recordDetail.joins.length; i++ ) {\r\n';												
							jsField.defaultValue += 'var join = recordDetail.joins[i];\r\n';									
							jsField.defaultValue += 'help += \'<tr>\';\r\n';	
							jsField.defaultValue += 'help += \'<td>\' + join.label + \'</td>\';\r\n';	
							jsField.defaultValue += 'help += \'<td>\' + join.sourceTargetType.id + \'</td>\';\r\n';
							jsField.defaultValue += 'help += \'<td>\' + join.cardinality + \'</td>\';\r\n';
							jsField.defaultValue += 'var joinInfo = "";\r\n';
							jsField.defaultValue += 'for ( j = 0; j < join.sourceTargetType.joinPairs.length; j++ ) {\r\n';	
							jsField.defaultValue += 'var joinPair = join.sourceTargetType.joinPairs[j];\r\n';
							jsField.defaultValue += 'joinInfo += joinPair.label + \'<br>\';\r\n';
							jsField.defaultValue += '}\r\n';
							jsField.defaultValue += 'help += \'<td>\' + joinInfo + \'</td>\';\r\n';
							jsField.defaultValue += 'help += \'</tr>\';\r\n';									
						jsField.defaultValue += '}\r\n';						
						jsField.defaultValue += 'help += \'</table>\';\r\n';						
															
						jsField.defaultValue += 'help += \'</body>\';\r\n';
						jsField.defaultValue += 'help += \'</html>\';\r\n';
															
						jsField.defaultValue += 'var helpWindow = window.open("", tableName, "width=1200,height=800");\r\n';
						jsField.defaultValue += 'helpWindow.document.body.innerHTML=help;\r\n';
						
					jsField.defaultValue += '}\r\n';	
					
					// Ignore the second period.
					jsField.defaultValue += 'return false;\r\n';			
														
				jsField.defaultValue += '}\r\n';																						
			jsField.defaultValue += '}\r\n';			
		jsField.defaultValue += '}\r\n';	
		
	jsField.defaultValue += '});\r\n';	
	
	jsField.defaultValue += '\r\n';

	jsField.defaultValue += '</script>';

}

function queryRun(context, form) {
	// Add the form elements field.
	exportResultsButtonAdd(form);
    displayTextInputs(context, form);
	displaySearchFilters(context, form);
    //load query content 
    loadQueryContent(context, 16634451);
    loadQueryContent(context, 16622516);
    loadQueryContent(context, 16620449);
	// Add a "Run Query" submit button.
	form.addSubmitButton({label: 'Submit'});
	// Add the Results field.
	var resultsField = form.addField(
		{
			id: 'custpage_field_results',
			type: serverWidget.FieldType.LONGTEXT,
			label: 'Results'
		}								
	);
    
    resultsField.updateDisplayType(
		{
			displayType: serverWidget.FieldDisplayType.HIDDEN
		}
	);

	try {
			
		
		for (cc = 0; cc < fileList.length; cc++){
			//Run the query.
			var queryResults = query.runSuiteQL(
				{
					query: fileList[cc].contents
				}
			); 	
			// Get the mapped results.		
			var records = queryResults.asMappedResults();
		
			// Adjust the label so that it includes the number of results.
			//resultsField.label = queryResults.results.length + ' Results (JSON)';					
		
			// If records were returned...
			if ( records.length > 0 ) {	
				writeQuerytoSublist(fileList[cc], queryResults, records, form);
			}
		}
		
		// JSON encode the recordset.
		var recordsJSON = JSON.stringify( records, null, 2 );
		
		// If the value can be displayed in a field...
		if (recordsJSON.length <= 100000) {				
			// Display the entire recordset.
			resultsField.defaultValue = recordsJSON;	
		} else {	
			// Display only the first record.
			recordsJSON = 'Example Result:\r\n' + JSON.stringify( records[0], null, 2 );
			resultsField.defaultValue = recordsJSON;
		}							

	} catch(e){
		log.error('Error', e.message);				
	}
}

function itemReceiptFieldAdd(context, form, container) {

	// Add the query field.
	var receiptField = form.addField(
		{
			id: 'custpage_field_item_receipt',
			type: serverWidget.FieldType.TEXT,
			label: 'Item Receipt #',
			container: container
		}
	);	
	
	// If the form has been submitted...
	if ( context.request.method == 'POST' ) {		
		// Set the field's default value.
		receiptField.defaultValue = context.request.parameters.custpage_field_item_receipt;
	}		
}

function itemFieldAdd(context, form, container){
    // Add the query field.
	var itemField = form.addField(
		{
			id: 'custpage_field_item_id',
			type: serverWidget.FieldType.TEXT,
			label: 'Item',
			container: container
		}
	);
    
    //if the form has been submitted...
    if ( context.request.method == 'POST' ) {		
		// Set the field's default value.
		itemField.defaultValue = context.request.parameters.custpage_field_item_id;
	}	
}

function serialFieldAdd(context, form, container){
	// Add the query field.
	var serialField = form.addField(
		{
			id: 'custpage_field_serial',
			type: serverWidget.FieldType.TEXT,
			label: 'Serial #',
			container: container
		}
	);

	// If the form has been submitted...
	if ( context.request.method == 'POST' ) {		
		// Set the field's default value.
		serialField.defaultValue = context.request.parameters.custpage_field_serial;
	}		
}

function warehouseFilterAdd(context, form, container){
	var field = form.addField({
		id: 'custpage_warehouse_filter',
		type: serverWidget.FieldType.MULTISELECT,
		label: 'Location',
		container: container,
		source: 'location'
	});

	if (context.request.method == 'POST'){		
		// Set the field's default value.
		field.defaultValue = context.request.parameters.custpage_warehouse_filter;
	} else {
        field.defaultValue = [1, 27];
    }
}

function statusFilterAdd(context, form, container){
    var field = form.addField({
		id: 'custpage_status_filter',
		type: serverWidget.FieldType.MULTISELECT,
		label: 'Status',
		container: container,
        source: 'customlist1825'
	});

	if (context.request.method == 'POST'){		
		// Set the field's default value.
		field.defaultValue = context.request.parameters.custpage_status_filter;
	} else {
        field.defaultValue = [1];
    }
}

function sqlFolderFilesGet() {

	// If there is no SQL folder, then abort.
	if ( sqlFolderID === null ) { return; }

	// Create the query.
	var sql = 'SELECT ID, Name ';
	sql += 'FROM File ';
	sql += 'WHERE ( Folder = ' + sqlFolderID + ' ) ';
	sql += 'ORDER BY Name';
	
	// Execute the query.
	var queryResults = query.runSuiteQL( { query: sql } ); 	
	
	// Get the results.
	var records = queryResults.asMappedResults();

	// If files were found...
	if ( records.length > 0 ) {
		return records;
	} else {
		return null;
	}	

}

function sqlFolderGet() {

	// Create the query.
	var sql = 'SELECT ID ';
	sql += 'FROM MediaItemFolder ';
	sql += 'WHERE ( IsTopLevel = \'T\' ) ';
	sql += 'AND ( Name = \'' + sqlFolderName + '\' )';
	
	// Execute the query.
	var queryResults = query.runSuiteQL( { query: sql } ); 	
	
	// Get the results.
	var records = queryResults.asMappedResults();

	// If the folder was found...
	if ( records.length == 1 ) {
		return records[0]['id'];
	} else {
		return null;
	}	

}

function loadQueryContent(context, queryID){
	var loadFile = file.load(queryID); 
	var fileContents = loadFile.getContents();
	//var receiptNumber = context.request.parameters.custpage_field_item_receipt;
	var itemNumber = context.request.parameters.custpage_field_item_id;
	var serialNumber = context.request.parameters.custpage_field_serial;
	var whFilter = context.request.parameters.custpage_warehouse_filter;
    var statusFilter = context.request.parameters.custpage_status_filter;
    
    if (whFilter){
        whFilter = whFilter.split('');
	    whFilter = whFilter.toString().replace(' ', '');
    }

    if(statusFilter){
        //log.debug('status', statusFilter);
        statusFilter = statusFilter.split('');
	    statusFilter = statusFilter.toString().replace(' ', '');
    } else {
        statusFilter = '1,2,3'
    }
	
    if (queryID == 16620449){
        var counts = 0;
		if (whFilter != null && whFilter != undefined && whFilter != ''){
            fileContents += "\r\nand a.location in ("+whFilter+")"
		}
        if (itemNumber != null && itemNumber != undefined && itemNumber != ''){
			fileContents += "\r\nand upper(it.itemid) = '"+itemNumber.toUpperCase()+"'"
            counts++;
		}

        if (serialNumber != null && itemNumber != undefined && serialNumber != ''){
            fileContents += "\r\nand upper(s.inventorynumber) = '"+serialNumber.toUpperCase()+"'"
            counts++;
        }

        if(counts > 0){
            fileContents += "\r\norder by s.inventorynumber asc"
            fileList.push({name: loadFile.name, contents: fileContents});
        }
	}
	else if (queryID == 16622516){
		if (itemNumber != null && itemNumber != undefined && itemNumber != ''){
			fileContents += "\r\and upper(it.itemid) = '"+itemNumber.toUpperCase()+"'"
			
			if (whFilter != null && whFilter != undefined && whFilter != ''){
				fileContents += "\r\nand a.location in ("+whFilter+")"
			}
            fileContents += "\r\norder by loc.id asc"
			fileList.push({name: loadFile.name, contents: fileContents});
		}
	}
    else if (queryID == 16634451) {        
        fileContents += "\r\nwhere status in ("+statusFilter+")"
        
        if (itemNumber != null && itemNumber != undefined && itemNumber != ''){
            fileContents += "\r\and upper(item) = '"+itemNumber.toUpperCase()+"'"
        }
        
        fileContents += "\r\norder by available desc"
        fileList.push({name: loadFile.name, contents: fileContents});
    }
}

function writeQuerytoSublist(queryFile, queryResults, records, form){
	var regex = new RegExp('_', 'g')
	// Create a sublist for the results.
	var resultsSublist = form.addSublist(
		{
			id: 'results_sublist_'+queryFile.name.replace('.txt', '').toLowerCase(),
			label: queryFile.name.replace(regex, ' ').replace('.txt', '') + ': ' + queryResults.results.length + ' Result(s)',
			type: serverWidget.SublistType.LIST
		}
	);

	// Get the column names.
	var columnNames = Object.keys(records[0]);

	// Loop over the column names...
	for (i = 0; i < columnNames.length; i++) {
		// Add the column to the sublist as a field.
		resultsSublist.addField(
			{
				id: 'custpage_'+queryFile.name.replace('.txt', '').toLowerCase()+'_col_' + i,
				type: serverWidget.FieldType.TEXT,
				label: columnNames[i].replace(regex, ' ')
			}
		);
	}

	// Add the records to the sublist...
	for (r = 0; r < records.length; r++) {

		// Get the record.
		var record = records[r];

		// Loop over the columns...
		for (c = 0; c < columnNames.length; c++) {

			// Get the column name.
			var column = columnNames[c];

			// Get the column value.
			var value = record[column];

			// If the column has a value...
			if (value != null) {

				// Get the value as a string.
				value = value.toString();

				// If the value is too long to be displayed in the sublist...
				if (value.length > 300) {

					// Truncate the value.
					value = value.substring(0, 297) + '...';

				}

				// Add the column value.		
				resultsSublist.setSublistValue(
					{
						id: 'custpage_'+queryFile.name.replace('.txt', '').toLowerCase()+'_col_' + c,
						line: r,
						value: value
					}
				);

			}

		}

	}
}

function displayTextInputs(context, form){
	var fieldGroupID = 'textinputs';
	
	var group = form.addFieldGroup({
		id: fieldGroupID,
		label: 'Search Fields'
	});

	group.isBorderHidden = false;
	group.isSingleColumn = true;

	itemFieldAdd(context, form, fieldGroupID);
	serialFieldAdd(context, form, fieldGroupID);
}

function displaySearchFilters(context, form){
	var fieldGroupID = 'searchfilters'
	
	var group = form.addFieldGroup({
		id: fieldGroupID,
		label: 'Additional Filters'
	});

	group.isBorderHidden = false;
	group.isSingleColumn = true;

	warehouseFilterAdd(context, form, fieldGroupID);
    statusFilterAdd(context, form, fieldGroupID);
}