/**
* @NApiVersion 2.1
* @NScriptType Portlet
* @NModuleScope SameAccount
*/

/* 

------------------------------------------------------------------------------------------
Script Information
------------------------------------------------------------------------------------------

Name:
SuiteQL Query Results Portlet

ID:
_sql_query_results

Description:
A portlet that can be used to display the results of a SuiteQL query.

Portlet Type:
Simple List

Parameters:
• _sql: The SQL statement to use. (Free-Form Text / Optional)
• _title: The title of the portlet. (Long Text / Optional)


------------------------------------------------------------------------------------------
Developer(s)
------------------------------------------------------------------------------------------

TD:
• Tim Dietrich
• timdietrich@me.com


------------------------------------------------------------------------------------------
History
------------------------------------------------------------------------------------------

20210209 - TD
Initial version.	


*/


	
// The default portlet title.
const default_title = 'Employee Directory';

	
// The default SQL query.
const default_sql = `
SELECT
	'<a href="/app/common/entity/employee.nl?id=' || ID || '">' || LastName || ', ' || FirstName || '</a>' AS Name, 
	Title, 
	'<a href="mailto:' || Email || '">' || Email || '</a>' AS Email, 
	Phone 
FROM 
	Employee 
WHERE
	IsInactive = 'F'
ORDER BY 
	LastName, 
	FirstName
`;


var 
	query,
	runtime;


define( [ 'N/query', 'N/runtime' ], main );


function main( queryModule, runtimeModule ) {

	query = queryModule;
	runtime = runtimeModule;
	
    return {
        render: renderContent
    }

}


function renderContent( params ) {
		
	// Get the currently executing script.
	var scriptObj = runtime.getCurrentScript();

	// Get the portlet's title.
	var title = scriptObj.getParameter( { name: 'custscript_title' } );
	if ( title == null ) { 
		title = default_title; 
	}	
	params.portlet.title = title;
	
	// Get the SQL to be used.
	var sql = scriptObj.getParameter( { name: 'custscript_sql' } );
	if ( sql == null ) { 
		sql = default_sql; 
	}	
		
	// Run the query.
	var queryResults = query.runSuiteQL( { query: sql } ); 	
	
	// Get the mapped results.
	var records = queryResults.asMappedResults();
	
	// If records were returned...
	if ( records.length > 0 ) {	
	
		// Get the column names.
		var columnNames = Object.keys( records[0] );					
		
		// Loop over the column names...
		for ( i = 0; i < columnNames.length; i++ ) {
		
			// Get the column name.
			var columnName = columnNames[i];
		
			// Add the column to the portlet.
			params.portlet.addColumn(
				{
					id: 'custpage_' + columnName,
					type: 'text',
					label: columnName,
					align: 'LEFT'
				}
			);

		}	
		
		// Loop over the records...
		for ( r = 0; r < records.length; r++ ) {

			// Get the record.
			var record = records[r];
			
			// Initialize a row object.
			var row = {};

			// Loop over the columns names...
			for ( c = 0; c < columnNames.length; c++ ) {

				// Get the column name.
				var columnName = columnNames[c];

				// Get the column value.
				var value = record[columnName];
				if ( value != null ) { value = value.toString(); }
				
				// Add the column to the row object.
				row['custpage_' + columnName] = value;  
	
			}
									
			// Add the row to the portlet.
			params.portlet.addRow( { row: row } );			

		}	
		
	}
	
}