/**
* @NApiVersion 2.x
* @NScriptType Suitelet
* @NModuleScope Public
*/

/* 

------------------------------------------------------------------------------------------
Script Information
------------------------------------------------------------------------------------------

Name:
Inventory Balance Utility

ID:
_inventory_history

Description
A utility for looking up the ending balance of an item for a specified day.


------------------------------------------------------------------------------------------
Developer(s)
------------------------------------------------------------------------------------------

Tim Dietrich
• timdietrich@me.com
• https://timdietrich.me


------------------------------------------------------------------------------------------
History
------------------------------------------------------------------------------------------

20201105 - Tim Dietrich
• Initial version.

*/


var 
	log,
	query,
	serverWidget,
	historyRows = 100;


define( [ 'N/log', 'N/query', 'N/ui/serverWidget' ], main );


function main( logModule, queryModule, serverWidgetModule ) {

	// Set module references.
	log = logModule;
	query= queryModule;
	serverWidget = serverWidgetModule;				
	
    return {
    
    	onRequest: function( context ) {
    	
			// Create a form.
			var form = serverWidget.createForm(
				{
					title: 'Inventory Balance History',
					hideNavBar: false
				}
			);		
			
			// Add a submit button.
			form.addSubmitButton( { label: 'Get History' } );
			
			// Add an "Item ID" field.
			var itemField = form.addField(
				{
					id: 'custpage_field_itemid',
					type: serverWidget.FieldType.TEXT,
					label: 'Item Name / Number'
				}								
			);			
			
			// Add a "Date" field.
			var dateField = form.addField(
				{
					id: 'custpage_field_date',
					type: serverWidget.FieldType.DATE,
					label: 'Show Ending Balance For Date'
				}								
			);			
			
			// Make both fields mandatory.
			itemField.isMandatory = true;	
			dateField.isMandatory = true;		
											
			// If the form has been submitted...
			if ( context.request.method == 'POST' ) {	
			
				// Set defaults for the item and date field values.
				itemField.defaultValue = context.request.parameters.custpage_field_itemid;
				dateField.defaultValue = context.request.parameters.custpage_field_date;			

				// Process the form.
				formProcess( context, form );
			
			}
			
			// Display the form.
			context.response.writePage( form );	
			
        }
        
    }

}


function formProcess( context, form ) {	

	var theQuery = '';
	theQuery += 'SELECT ';
	theQuery += 'TranDate AS Date, ';
	theQuery += 'Type, ';
	theQuery += '\'<a href="/app/accounting/transactions/transaction.nl?id=\' || TransactionID || \'" target="_new">\' || TranID || \'</a>\' AS TransID, ';	
	theQuery += 'AltName, ';
	theQuery += '( Qty_Balance - Quantity ) AS Beginning_Balance, ';
	theQuery += 'Quantity, ';
	theQuery += 'Qty_Balance AS Ending_Balance ';
	theQuery += 'FROM ( ';
	theQuery += 'SELECT * FROM ( ';
	theQuery += 'SELECT ';
	theQuery += 'TransactionLine.Transaction AS TransactionID, ';
	theQuery += 'Transaction.TranDate, ';
	theQuery += 'Transaction.Type, ';
	theQuery += 'Transaction.TranID, ';
	theQuery += 'TransactionLine.ID AS TransLineID, ';
	theQuery += 'TransactionLine.Rate, ';
	theQuery += 'TransactionLine.NetAmount, ';
	theQuery += 'TransactionLine.Quantity, ';
	theQuery += 'Entity.AltName, ';
	theQuery += 'SUM( TransactionLine.Quantity ) ';
	theQuery += 'OVER ( ';
	theQuery += 'ORDER BY ';
	theQuery += 'Transaction.TranDate, ';
	theQuery += 'Transaction.ID, ';
	theQuery += 'TransactionLine.ID ';
	theQuery += 'RANGE UNBOUNDED PRECEDING ';
	theQuery += ') Qty_Balance ';
	theQuery += 'FROM ';
	theQuery += 'Item ';	
	theQuery += 'INNER JOIN TransactionLine ON ';
	theQuery += '( TransactionLine.Item = Item.ID ) ';
	theQuery += 'INNER JOIN Transaction ON ';
	theQuery += '( Transaction.ID = TransactionLine.Transaction ) ';
	theQuery += 'LEFT OUTER JOIN Entity ON ';
	theQuery += '( Entity.ID = Transaction.Entity ) ';
	theQuery += 'WHERE ';
	theQuery += '( Item.ItemID = \'' + context.request.parameters.custpage_field_itemid + '\' ) ';
	theQuery += 'AND ( TransactionLine.IsInventoryAffecting = \'T\' ) ';
	theQuery += 'AND ( Transaction.Voided = \'F\' ) ';
	theQuery += 'ORDER BY ';
	theQuery += 'Transaction.TranDate, ';
	theQuery += 'Transaction.ID, ';
	theQuery += 'TransactionLine.ID ';
	theQuery += ') ';
	theQuery += 'WHERE ';	
	theQuery += '( TranDate <= TO_DATE( \'' + context.request.parameters.custpage_field_date + '\', \'MM/DD/YYYY\' ) ) ';		
	theQuery += 'ORDER BY ';
	theQuery += 'TranDate DESC, TransactionID DESC, TransLineID DESC ';
	theQuery += ') ';
	theQuery += 'WHERE ( ROWNUM <= ' + historyRows + ' ) ';	
	
	try {

		// Run the query.
		var queryResults = query.runSuiteQL(
			{
				query: theQuery
			}
		); 				
	
		// Get the mapped results.		
		var records = queryResults.asMappedResults();				
	
		// If records were returned...
		if ( records.length > 0 ) {	

			// Create a sublist for the results.
			var resultsSublist = form.addSublist(
				{ 
					id : 'results_sublist', 
					label : 'Balance History', 
					type : serverWidget.SublistType.LIST 
				}
			);

			// Get the column names.
			var columnNames = Object.keys( records[0] );

			// Loop over the column names...
			for ( i = 0; i < columnNames.length; i++ ) {

				// Add the column to the sublist as a field.
				resultsSublist.addField(
					{ 
						id: 'custpage_results_sublist_col_' + i,
						type: serverWidget.FieldType.TEXT,
						label: columnNames[i]
					}
				);

			}

			// Add the records to the sublist...
			for ( r = 0; r < records.length; r++ ) {

				// Get the record.
				var record = records[r];

				// Loop over the columns...
				for ( c = 0; c < columnNames.length; c++ ) {

					// Get the column name.
					var column = columnNames[c];

					// Get the column value.
					var value = record[column];
					
					// If the column has a value...
					if ( value != null ) {
					
						// Get the value as a string.
						value = value.toString();
						
						// If the value is too long to be displayed in the sublist...
						if ( value.length > 300 ) {
						
							// Truncate the value.
							value = value.substring( 0, 297 ) + '...';			
							
						}

						// Add the column value.		
						resultsSublist.setSublistValue(
							{
								id : 'custpage_results_sublist_col_' + c,
								line : r,
								value : value
							}
						);        

					}	
					
				}

			}
			
			// Add an inline HTML field so that JavaScript can be injected.
			var jsField = form.addField(
				{
					id: 'custpage_field_js',
					type: serverWidget.FieldType.INLINEHTML,
					label: 'Javascript'
				}								
			);		
			
			// Add Javascript to make the first row bold, and add a tooltip.
			jsField.defaultValue = '<script>\r\n';
			jsField.defaultValue += 'document.addEventListener(\'DOMContentLoaded\', function() {';
			jsField.defaultValue += 'document.getElementById("results_sublistrow0").style["font-weight"]="bold";\r\n';
			jsField.defaultValue += 'document.getElementById("results_sublistrow0").title="This is the balance as of ' + context.request.parameters.custpage_field_date + '.";\r\n';
			jsField.defaultValue += '}, false);';
			jsField.defaultValue += '</script>';				

		} else {
		
			// Add an "Error" field.
			var errorField = form.addField(
				{
					id: 'custpage_field_error',
					type: serverWidget.FieldType.TEXT,
					label: 'Error'
				}								
			);		
			
			errorField.defaultValue = 'No history found for: ' + context.request.parameters.custpage_field_itemid;	
			
			// Add an inline HTML field so that JavaScript can be injected.
			var jsField = form.addField(
				{
					id: 'custpage_field_js',
					type: serverWidget.FieldType.INLINEHTML,
					label: 'Javascript'
				}								
			);		
			
			// Add Javascript to make the error field red.
			jsField.defaultValue = '<script>\r\n';
			jsField.defaultValue += 'document.addEventListener(\'DOMContentLoaded\', function() {';
			jsField.defaultValue += 'document.getElementById("custpage_field_error").style.background="red";\r\n';
			jsField.defaultValue += 'document.getElementById("custpage_field_error").style.color="white";\r\n';
			jsField.defaultValue += '}, false);';
			jsField.defaultValue += '</script>';					
		
		}

	} catch( e ) {	
	
		var errorField = form.addField(
			{
				id: 'custpage_field_error',
				type: serverWidget.FieldType.LONGTEXT,
				label: 'Error'
			}								
		);		
	
		errorField.defaultValue = e.message;			
		
	}

}