// SkySuite: Alex Trujillo
// Script Name: Item Average Cost Reset
// Script Type: Scheduled
// Script Function: ItemAverageCostReset
// 2.14.08
// Reset Item record
// 10 units per record
// 10000/10 = 1000 records per execution
// Approximately = 990

function ItemAverageCostReset()
{
	// Get starting seconds of script
	// Keeping track of seconds script is running
	var startdate = new Date();
	var startseconds = startdate.getTime();
	
	//Record ID's Live Account
	var SavedSearchID = '651';	// Live Account 651   -  168
	
	// Search saved search
	try {
		var items = nlapiSearchRecord( 'inventoryitem', SavedSearchID, null, null ); 
	}catch(err){
		nlapiLogExecution( 'debug', 'Search Saved Search Error', err.getDetails() );
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
			
			// Get Item Internal Id
			var itemId = items[i].getId();
			
			//try {
			//	// Set field to false
			//	nlapiSubmitField( 'inventoryitem', itemId, 'custitem_processed', 'F' );
			//}catch(err){
			//	nlapiLogExecution( 'debug', 'Submit Inventory Item Field Error', err.getDetails() );
			//	sendEmail( 'Submit Inventory Item Field Error: ' + err.getDetails(), itemId );
			//}
			
			// #########################################################################################
			// #########################################################################################
			// "Version 2008.1 Update" - serializedinventoryitem
			var error_message = '';
			var error_returned = 0;
			
			try{
				nlapiSubmitField( 'inventoryitem', itemId, 'custitem_processed', 'F' );
			}catch(err){
				error_returned = 1;
				error_message += err.getDetails();
				//nlapiLogExecution('debug', 'Inventory Item Submit Error', err.getDetails());
				//sendEmail( 'Inventory Item Submit Error: ' + err.getDetails(), itemID);
			}
			if ( error_returned == 1 )
			{
				// If inventory item type errored out, continue here
				error_returned = 0;
				try{
					nlapiSubmitField( 'serializedinventoryitem', itemId, 'custitem_processed', 'F' );
				}catch(err){
					error_returned = 1;
					error_message += err.getDetails();
					//nlapiLogExecution('debug', 'Inventory Item Submit Error', err.getDetails());
					//sendEmail( 'Inventory Item Submit Error: ' + err.getDetails(), itemID);
				}
			}
			if ( error_returned == 1 )
			{
				// If there was an error on both item types, send error email and print to log execution
				nlapiLogExecution('debug', 'Item Submit Error', error_message );
				sendEmail( 'Item Submit Error: ' + error_message, itemId );
			}
			
			// #########################################################################################
			// #########################################################################################
			
		}
	}

	return;
}

function sendEmail( err_Details, item_Id ){
	
	var emp_ID = "25";
	var email_Address = "52378";
	
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

