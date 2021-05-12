// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
    /*
        Script Name:
        Author:		
        Company:.
        Date:		
    
        Script Modification Log:
    
        -- Date --			-- Modified By --				--Requested By--				-- Description --
    
    
    
    Below is a summary of the process controls enforced by this script file.  The control logic is described
    more fully, below, in the appropriate function headers and code blocks.
    
    
         SUITELET
            - suiteletFunction(request, response)
    
    
         SUB-FUNCTIONS
            - The following sub-functions are called by the above core functions in order to maintain code
                modularization:
    
                   - NOT USED
    
    */
}
// END SCRIPT DESCRIPTION BLOCK  ====================================



// BEGIN GLOBAL VARIABLE BLOCK  =====================================
{
    //  Initialize any Global Variables, in particular, debugging variables...




}
// END GLOBAL VARIABLE BLOCK  =======================================





// BEGIN SUITELET ==================================================

function suiteletFunction_PrintWarrantyPdf(request, response){

	/*  Suitelet:
	 - EXPLAIN THE PURPOSE OF THIS FUNCTION
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  SUITELET CODE BODY
	
	if (request.getMethod() == 'GET') {
	
		var SORecID = request.getParameter('sorecid');
		//var SORecID = 17806006;
		
		var o_recordObj = nlapiLoadRecord('salesorder', SORecID)
		
		var Customer = o_recordObj.getFieldText('entity');
		Customer = nlapiEscapeXML(Customer);
		
		
		var OrderDate = o_recordObj.getFieldValue('trandate');
		var TranID = o_recordObj.getFieldValue('tranid');
		
		
		var strVar = "";
		strVar += "<html>";
		strVar += "<head>";
		strVar += "<style>";
		strVar += "table {";
		strVar += "    font-family: arial, sans-serif;";
		strVar += "    border-collapse: collapse;";
		strVar += "    width: 100%;";
		strVar += "}";
		strVar += "";
		strVar += "td, th {";
		// strVar += " border: 0.5px solid #dddddd;";
		strVar += "    text-align: left;";
		strVar += "    padding: 3px;";
		strVar += "}";
		strVar += "";
		strVar += ".unjustify {";
		strVar += "    display: inline-block;";
		strVar += "    width: 3px;";
		strVar += "}";
		strVar += "";
		
		strVar += "body, td {"
		strVar += "font-family: Open Sans,Helvetica,sans-serif"
		strVar += "}"
		
		strVar += "<\/style>";
		strVar += "<\/head>";
		strVar += "<body footer=\"myfooter\" footer-height=\"1em\" size=\"A4\">";
		strVar += "";
		strVar += "<table style=\"border: 1px solid #dddddd;margin-bottom:10px;\" align = \"center\">";
		strVar += "  <tr>";
		strVar += "  <td>";
		strVar += "<table style=\"margin-bottom:10px;\" align = \"center\">";
		strVar += "  <tr>";
		strVar += "    <td  align=\"center\" style=\"text-align:center;font-size:14px;font-weight: bold;border: 0px;\" valign=\"top\">" + nlapiEscapeXML('Warranty Registration') + "<\/td>";
		strVar += "  <\/tr>";
		strVar += "<\/table>";
		
		strVar += "<table style=\"margin-bottom:20px;\" align = \"center\">";
		strVar += "  <tr>";
		strVar += "    <td colspan= \"2\" align=\"left\" style=\"text-align:left;font-size: 12px;font-weight: bold;border: 0px;\" valign=\"top\">Customer Name<\/td>";
		strVar += "    <td colspan= \"8\" align=\"left\" style=\"text-align:left;font-size: 12px;font-weight: bold;border: 0px;\" valign=\"top\">: " + Customer + "<\/td>";
		strVar += "    <td colspan= \"2\" align=\"left\" style=\"text-align:left;font-size: 12px;font-weight: bold;border: 0px;\" valign=\"top\">Order Date<\/td>";
		strVar += "    <td colspan= \"4\" align=\"left\" style=\"text-align:left;font-size: 12px;font-weight: bold;border: 0px;\" valign=\"top\">: " + OrderDate + "<\/td>";
		strVar += "  <\/tr>";
		strVar += "  <tr>";
		strVar += "    <td colspan= \"2\" align=\"left\" style=\"text-align:left;font-size: 12px;font-weight: bold;border: 0px;\" valign=\"top\">Order ID<\/td>";
		strVar += "    <td colspan= \"14\" align=\"left\" style=\"text-align:left;font-size: 12px;font-weight: bold;border: 0px;\" valign=\"top\">: " + TranID + "<\/td>";
		strVar += "  <\/tr>";
		strVar += "<\/table>";
		strVar += "";
		strVar += "<table style=\"\">";
		strVar += "<thead>";
		strVar += "  <tr style=\"background-color: black ;color:white;\">";
		strVar += "    <th style=\"border-left:1px;border-right: 0px;border-top: 0px;border-bottom: 0px;text-align:center;font-size:12px;\"><b>Item Name</b><\/th>";
		strVar += "    <th style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px;text-align:center;font-size: 12px;\"><b>Quantity</b><\/th>";
		//strVar += "    <th style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px;text-align:center;font-size: 12px;\"><b>Units</b><\/th>";
		strVar += "    <th style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px;text-align:center;font-size: 12px;\"><b>Exp Date</b><\/th>";
		strVar += "    <th style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 1px;text-align:right;font-size: 12px;\"><b>Warranty Term</b><\/th>";
		strVar += "  <\/tr>";
		strVar += "<\/thead>";
		
		var i_linecount = o_recordObj.getLineItemCount('item')
		var j = 1;
		for (var k = 1; k <= i_linecount; k++) {
			var Item = o_recordObj.getLineItemText('item', 'item', k);
			var quantity = o_recordObj.getLineItemValue('item', 'quantity', k);
			//var units = o_recordObj.getLineItemText('item', 'units', k);
			var expdate = o_recordObj.getLineItemValue('item', 'custcol_sw_expiration', k);
			var terms = o_recordObj.getLineItemText('item', 'custcol_sw_warranty', k);
			
			if (terms != null && terms != '' && terms != undefined) {
				j++;
				if (j % 2 == 0) {
					strVar += "  <tr   style=\"border-left:1px;border-right: 0px;border-top: 0px;border-bottom: 0px;background-color: #efefef !important;\">";
				}
				else {
					strVar += "  <tr   style=\"border-left:1px;border-right: 0px;border-top: 0px;border-bottom: 0px;\">"
				}
				strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 12px;text-align:left\" >" + nlapiEscapeXML(Item) + "<\/td>";
				strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 12px;text-align:center\">" + quantity + "<\/td>";
				//strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 12px;text-align:center\">" + nlapiEscapeXML(units) + "<\/td>";
				strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 12px;text-align:center\">" + nlapiEscapeXML(expdate) + "<\/td>";
				strVar += "    <td  align=\"center\" style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 12px;text-align:center\">" + nlapiEscapeXML(terms) + "<\/td>";
				strVar += "  <\/tr>";
			}
		}
		strVar += "  <tr style=\"border-left:1px;border-right: 0px;border-top: 0px;border-bottom: 0px;\">"
		strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 7px;text-align:left\" ><\/td>";
		strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 7px;text-align:center\"><\/td>";
		strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 7px;text-align:center\"><\/td>";
		strVar += "    <td style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 7px;text-align:center\"><\/td>";
		strVar += "    <td  align=\"center\" style=\"border-left:0px;border-right: 0px;border-top: 0px;border-bottom: 0px ;font-size: 7px;text-align:center\"><\/td>";
		strVar += "  <\/tr>";
		strVar += "  ";
		strVar += "<\/table>";
		strVar += "  <\/td>";
		strVar += "  <\/tr>";
		strVar += "  ";
		strVar += "<\/table>";
		strVar += "<\/body>";
		strVar += "<\/html>";
		strVar += "";
		
		var xml = "<?xml version=\"1.0\"?>\n<!DOCTYPE pdf PUBLIC \"-//big.faceless.org//report\" \"report-1.1.dtd\">\n<pdf style=\"margin-top: 0pt;\">\n" + strVar + "\n</pdf>";
		
		var file = nlapiXMLToPDF(xml);
		response.setContentType('PDF', TranID + '_Warranty.pdf', 'inline');
		response.write(file.getValue());
	}
}

// END SUITELET ====================================================




// BEGIN OBJECT CALLED/INVOKING FUNCTION ===================================================


// END OBJECT CALLED/INVOKING FUNCTION =====================================================
