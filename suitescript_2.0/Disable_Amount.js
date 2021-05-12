// Developer: SkySuite - TB
// Date: 12-6-2010
// Type: Global Client
// Name: Disable Amount
// Summary: Disable line item Amount field.

// Development
// var Email_From     = 10232;
// var Email_To       = 10232;

// Production
   var Email_From     = 11;
   var Email_To       = 11;

function Disable_Amount(type)
{
  
	try{
		//GET INTERNAL ID
		var MT_internalid = nlapiGetRecordId()
	}
	catch(err){
		//POPUP ALERT, SEND ERROR NOTIFICATION EMAIL AND EXIT SCRIPT
		var SkySuiteErrorMessage = "Error getting Internal ID"
		return popupAlertAndSendEmail(SkySuiteErrorMessage, err);
	}
	
	try{
		//DISABLE AMOUNT FIELD (PAGE INIT)
		if(type=="create" || type=="edit" || type=="copy"){
			nlapiDisableLineItemField("item", "amount", true)
		}
	}
	catch(err){
		//POPUP ALERT, SEND ERROR NOTIFICATION EMAIL AND EXIT SCRIPT
		var SkySuiteErrorMessage = ""
		if(checkIfNull(MT_internalid)!="")
			SkySuiteErrorMessage = "Error disabling Amount field for transaction Internal ID " + MT_internalid;
		else
			SkySuiteErrorMessage = "Error disabling Amount field for new transaction";
		return popupAlertAndSendEmail(SkySuiteErrorMessage, err);
	}
	
	try{
		//DISABLE AMOUNT FIELD (LINE INIT)
		if(type=="item"){
			nlapiDisableLineItemField("item", "amount", true)
		}
	}
	catch(err){
		//POPUP ALERT, SEND ERROR NOTIFICATION EMAIL AND EXIT SCRIPT
		var SkySuiteErrorMessage = ""
		if(checkIfNull(MT_internalid)!="")
			SkySuiteErrorMessage = "Error disabling Amount field for transaction Internal ID " + MT_internalid;
		else
			SkySuiteErrorMessage = "Error disabling Amount field for new transaction";
		return popupAlertAndSendEmail(SkySuiteErrorMessage, err);
	}
}

// ********************************************************************************
// HELPER FUNCTIONS
// ********************************************************************************

function popupAlertAndSendEmail( str_Message, err )
{
    // GET ERROR MESSAGE
    var err_Details = "";
    if ( err != null )
    {
        try {
            err_Details = err.getDetails();
        }
        catch( e ){
            err_Details = err.message;
        }
    }

    // POPUP ALERT
    alert(str_Message + '.  ' + err_Details);

    // ERROR NOTIFICATION EMAIL
    var SkySuiteErrorMessage = "Error sending email";

    // GET SERVER DATE AND TIME
    var MT_Date_Time = ( new Date() ).toString();

    var message = "Script: Disable Amount\n\n";
    message += "Date and Time: " + MT_Date_Time + "\n\n";
    message += "Notification: " + str_Message + '.  ' + err_Details + "\n";

    try {
        nlapiSendEmail( Email_From, Email_To, "Error Notification", message, null );
    }
    catch(err){
        // LOG ERROR AND CONTINUE
        nlapiLogExecution( 'error', 'Error Notification', SkySuiteErrorMessage + '.  ' + err.getDetails() );
        return false;
    }
	
    return false;
}

function checkIfNull(valuex)
{
	if(valuex == null)
	{
		return '';
	}
	return valuex;
}
