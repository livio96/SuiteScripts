// SkySuite: Alex Trujillo
// 2.14.08
// Script Name: Item Average Cost
// Script Type: Scheduled
// Function Name: ItemAverageCost
// Set Items average cost
// 10 units per record
// 10000/10 = 1000 records per execution
// Approximately 990


function ItemAverageCost()
{
	// Get starting seconds of script
	// Keeping track of seconds script is running
	var startdate = new Date();
	var startseconds = startdate.getTime();
	
	//Record ID's Live Account
	var SavedSearchID = '650';			// Live Account 650  -  167
	
	// Search saved search
	try {
		var items = nlapiSearchRecord( 'inventoryitem', SavedSearchID, null, null ); 
	}catch(err){
		nlapiLogExecution('debug', 'Search Saved Search Error', err.getDetails());
		sendEmail( 'Search Saved Search Error: ' + err.getDetails(), '' );
		items = null;
	}
	
	if ( items != null )
	{
		
		for ( var i = 0; i < items.length; i++ )
		{
			
			// If units exceeds 10000 or 600 seconds
			// Check seconds used by script so far
			var diffdate = new Date();
			var diffseconds = diffdate.getTime();
			var scriptseconds = (diffseconds - startseconds)/1000;
			if ( nlapiGetContext().getRemainingUsage() < 100 ){
				return;
			}
			else if ( scriptseconds > 550 ){
				return;
			}
			
			var itemId = items[i].getId();
			var averageCost = checkIfNull( items[i].getValue('averagecost') );
			
			// If average cost is blank, set it to 0
			if ( averageCost == '' )
			{
				averageCost = 0;
				// Load Item to check if average cost = 0
				//try {
				//	var rs = nlapiLoadRecord( 'inventoryitem', itemId );
				//}catch(err){
				//	nlapiLogExecution( 'debug', 'Load Inventory Item Error', err.getDetails() );
				//	sendEmail( 'Load Inventory Item Error: ' + err.getDetails(), itemId );
				//	rs = null;
				//}
				//if ( rs != null )
				//{
				//	averageCost = checkIfNull( rs.getFieldValue('averagecost') );
				//}
			}
			
			// Check if there is an average cost to set to 2 decimal places
			//if ( parseFloat(averageCost) || averageCost == 0 )
			//{
				
				if ( averageCost != 0 )
				{
					// Set to 2 decimal places
					averageCost = Math.round(averageCost*100)/100;
				}
				var FieldArray = new Array( 'custitem_processed', 'custitem_imp_avg_cost' );
				var ValueArray = new Array( 'T', averageCost );
				
			//}
			//else
			//{
				
			//	var FieldArray = new Array( 'custitem_processed' );
			//	var ValueArray = new Array( 'T' );
				
			//}
			
			// Submit item fields
			try {
				nlapiSubmitField( 'inventoryitem', itemId, FieldArray, ValueArray );
			}catch(err){
				nlapiLogExecution( 'debug', 'Submit Inventory Item Field Error', err.getDetails() );
				sendEmail( 'Submit Inventory Item Field Error: ' + err.getDetails(), itemId );
			}
		}
	}

	return;
}

function sendEmail( err_Details, item_Id ){
	
	var emp_ID = "25";
	var email_Address = "25";
	
	var errorDate = new Date();
	var hrs = errorDate.getHours();
	var minute = errorDate.getMinutes();

	if ( hrs > 12 ){
		hrs = hrs - 12;
		am_pm = "pm";
	}
	else {
		if ( hrs == 12 ){
			am_pm = "pm";
		}
		else {
			am_pm = "am";
		}
	}
	
	if ( parseFloat(minute) < 10 ){
		minute = '0' + minute;	
	}

	var timeOf = " " + hrs + ":" + minute + " " + am_pm

       	var dateOfError = nlapiDateToString( errorDate );
	var message = "";
	message = "Date: " + dateOfError + " " + timeOf + "\n";
	
	
	if ( item_Id != '' ){
		message = message + "Record Type: Inventory Item" + "\n";
		message = message + "Inventory Item Internal ID: " + item_Id + "\n";
	}
	
	message = message + err_Details + "\n";

	try {
		nlapiSendEmail( emp_ID, email_Address, err_Details, message, null );
	}catch(err){
		nlapiLogExecution( 'debug', 'Send Email Error: ', err.getDetails() );
		return 1;
	}
	return 0;
}

function checkIfNull( value )
{
	
	if ( value == 0 )
	{
		return 0;
	}
	else if ( value == null )
	{
		return '';
	}
	return value;
	
}

