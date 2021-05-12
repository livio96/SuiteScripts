/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       27 Nov 2017     Ravi
 *
 */

/**
 * @param {nlobjRequest} request Request object
 * @param {nlobjResponse} response Response object
 * @returns {Void} Any output is written via response object
 */
function showSalesRep(request, response)
{
	try
	{
		var form = nlapiCreateForm("Sales Rep Details");
		var field = form.addField("custpage_salesrep", "inlinehtml", "Sales Rep", null, null);
		var userId = nlapiGetUser();	    
		var criteria = new Array();
		criteria.push(new nlobjSearchFilter('internalid', null, 'anyof', userId));

		var col = new Array();
		col.push(new nlobjSearchColumn('salesrep'));
		var phoneNo = "", salesRep = "", fax = "", salesRepId = "";
		var searchRes = nlapiSearchRecord('customer', null, criteria, col); 
		if(searchRes)
		{
			for(var i = 0 ; i < searchRes.length ; i++)
			{
				salesRep = searchRes[i].getText(col[0]);				
				salesRepId = searchRes[i].getValue(col[0]);
			}		
		}		
		nlapiLogExecution("DEBUG", "Sales Rep", "Sales Rep : "+salesRep);
		nlapiLogExecution("DEBUG", "Sales Rep", "Sales Rep : "+salesRepId);
		var phoneNo = nlapiLookupField("employee",salesRepId,"phone",false);
		var fax = nlapiLookupField("employee",salesRepId,"fax",false);
		var mail = nlapiLookupField("employee",salesRepId,"email",false);
		var printString = "";
		printString += "<table>";
		printString += "<tr>";
		printString += "<td><b>Name</b></td>";
		printString += "<td><b>:</b></td>";
		printString += "<td>"+salesRep+"</td>";
		printString += "</tr>";
		printString += "<tr>";
		printString += "<td><b>Phone Number</b></td>";
		printString += "<td><b>:</b></td>";
		printString += "<td>"+phoneNo+"</td>";
		printString += "</tr>";
		printString += "<tr>";
		printString += "<td><b>Fax</b></td>";
		printString += "<td><b>:</b></td>";
		printString += "<td>"+fax+"</td>";
		printString += "</tr>";
		printString += "<tr>";
		printString += "<td><b>Mail</b></td>";
		printString += "<td><b>:</b></td>";
		printString += "<td>"+mail+"</td>";
		printString += "</tr>";
		printString += "</table>";
		field.setDefaultValue(printString);
		response.writePage(form);
	}
	catch(ex)
	{
		nlapiLogExecution("DEBUG", "Sales Rep", "Sales Rep :"+ex);
	}
	  
	  
	  
}
