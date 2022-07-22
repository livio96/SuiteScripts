/*
Developer: SkySuite - NL
Date: 1-19-2010
Type: User Event
Name: Invoice Date
Summary: Set invoice date to date of most recent associated item fulfillment.
*/

//Remove two forward slashes from the start of a line, to uncomment that line.
//Add two forward slashes to the start of a line, to comment that line.

/* Production Account */

/* Development Account */

function InvoiceDate(stType)
{
    try
    {
        if (stType != 'create' && stType != 'edit')
        {
            nlapiLogExecution('debug', 'Exit Log', stType + ' Type of Operation Unsupported.  Exit After Submit Successfully.');
            return;
        }  	

        var stContextErrorTitle = '';
        var stContextError = '';
        
        // GET INTERNAL ID
        // Units: 0

        var stInternalId = nlapiGetRecordId();
        
        // LOAD INVOICE AND GET DATA
        // Units: 10
        
        stContextErrorTitle = 'Invoice Error';
        stContextError = 'Error retrieving data for Invoice Internal ID ' + stInternalId + '.';        

        var recNew = nlapiGetNewRecord();
        var type = nlapiGetRecordType(); 
        
        var stCreatedFrom = recNew.getFieldValue('createdfrom');
        var stDisableDate = recNew.getFieldValue('custbody_disable_date_script');
        
        var memoryTable1 = new Array();
        
        if (stDisableDate != 'T' && !isEmpty(stCreatedFrom))
        {
            memoryTable1['createdfrom'] = stCreatedFrom;
            memoryTable1['disable_date_script'] = stDisableDate;
        }
        else
        {
            // EXIT SCRIPT
            return;
        }
        
        // EXECUTE ITEM FULFILLMENT SAVED SEARCH
        // Units: 10
        
        stContextErrorTitle = 'Item Fulfillment Search Error';
        stContextError = 'Error executing Item Fulfillment search (customsearch_invoice_date).';        
        
        var filters = [
            new nlobjSearchFilter('createdfrom', null, 'anyof', stCreatedFrom)
        ];
        
        var results = nlapiSearchRecord('transaction', 'customsearch_invoice_date', filters);
        
        if (!isArrayEmpty(results))
        {
            memoryTable1['trandate'] = results[0].getValue('trandate');
        }
        else
        {
            // EXIT SCRIPT
            return;        
        }

        // UPDATE INVOICE
        // Units: 10

        stContextErrorTitle = 'Invoice Error';
        stContextError = 'Error updating Invoice Internal ID ' + stInternalId + '.';
        if(type == 'invoice'){
        nlapiLogExecution('debug', 'Tran Date Updated', 
            nlapiSubmitField('invoice', stInternalId, 'trandate', memoryTable1['trandate']));
        }
       if(type == 'cashsale') {
        nlapiLogExecution('debug', 'Tran Date Updated', 
            nlapiSubmitField('cashsale', stInternalId, 'trandate', memoryTable1['trandate']));
       }
    }
    catch (error)
    {
        // LOG ERROR AND EXIT SCRIPT
        var stNsError = '';
        
        if (error.getDetails != undefined)
        {
            stNsError = error.getDetails();            
        }
        else
        {
            stNsError = error.toString();
        }
    
        nlapiLogExecution('error', stContextErrorTitle, stContextError + '  ' + stNsError);
    }
    
    return;
}

function isNullOrUndefined(value)
{
    if (value === null)
    {
        return true;
    }
    
    if (value === undefined)
    {
        return true;
    }  
    
    return false;
}

function isArrayEmpty(array)
{
    if (isNullOrUndefined(array))
    {
        return true;
    }
    
    if (array.length <= 0)
    {
        return true;
    }
    
    return false;
}

function isEmpty(stValue)
{
    if (isNullOrUndefined(stValue))
    {
        return true;
    }
    
    if (stValue.length == 0)
    {
        return true;
    }

    return false;
}

function forceParseInt(stValue)
{
    if (isEmpty(stValue))
    {
        return 0;
    }
    
    var intValue = parseInt(stValue.removeLeadingZeroes());
    
    if (isNaN(intValue))
    {
        return 0;
    }
    
    return intValue;
}

String.prototype.removeLeadingZeroes = function String_removeLeadingZeroes()
{
    if (isEmpty(this))
    {
        return this;
    }
    
    var stTrimmedString = this;
    
    for (var i = 0; i < stTrimmedString.length; i++)
    {
        if (stTrimmedString[i] === '0')
        {
            stTrimmedString = stTrimmedString.substring(1, stTrimmedString.length);
        }
        else
        {
            break;
        }
    }
    
    return stTrimmedString;
}