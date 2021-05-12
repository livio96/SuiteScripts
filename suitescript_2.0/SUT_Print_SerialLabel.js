function serialItemPrintSuitelet(request, response){
	try {
		var Rid = request.getParameter('Rid');
		
		var recObj = nlapiLoadRecord('customrecord_print_label', Rid);
		
		var emp_id = recObj.getFieldValue('owner');
		
		var tranId = Rid;
		
		var rec = "";
		var items = new Array();
		
		var strName = "<head>";
		strName += "<style>";
		strName += "th{background-color: #3c8dbc; color:white;}";
		strName += "body{font-family:Helvetica!important;}";
		strName += "</style>";
		strName += "</head>";
		
		var itemName = recObj.getFieldText('custrecord_pl_item_number');
		;
		var Description = recObj.getFieldValue('custrecord_pl_description');
		;
		
		var invLineCount = recObj.getLineItemCount('recmachcustrecord_pl_sn_print_label');
		
		for (var x = 1; x <= invLineCount; x++) {
			strName += "<body  width=\"101.6mm\" height=\"76.2mm\" padding=\"0.0in 0.1in 0.0in 0.0in\">";
			strName += "<table align=\"right\" width=\"98%\"  height=\"50%\">";
			strName += "  <tr height=\"12%\">"
			strName += "    <td align=\"center\">";
			strName += "<table width=\"100%\">";
			strName += "<tr>";
			strName += "<td style=\"font-size:20px;\">" + nlapiEscapeXML(itemName) + "</td>";
			strName += "<td align=\"right\">";
			strName += "<table style=\"border:1px;\">";
			strName += "<tr>";
			strName += "<td style=\"font-size :16px;\">";
			strName += "" + tranId + " - ";
			strName += "</td>";
			strName += "<td style=\"font-size :16px;\">";
			strName += "" + emp_id + "";
			strName += "</td>";
			strName += "</tr>";
			strName += "</table>";
			strName += "</td>";
			strName += "</tr>";
			strName += "</table>";
			strName += "<\/td><\/tr>";
			strName += " <tr height=\"28%\"><td align=\"center\">";
			strName += "<table width=\"100%\">";
			strName += "<tr>";
			strName += "<td style=\"font-size:16px;\">&nbsp;</td>";
			// strName += "<td style=\"font-size:16px;\">" + nlapiEscapeXML(itemCategory) + "</td>";
			strName += "</tr>";
			strName += "<tr>";
			strName += "<td style=\"font-size:12px;\">" + nlapiEscapeXML(Description) + "</td>";
			strName += "</tr>";
			strName += "</table>";
			strName += " <\/td> <\/tr>";
			strName += "</table>";
			strName += "<table align=\"left\" width=\"100%\" height=\"50%\"  v-align=\"bottom\" >";
			strName += "<tr  height=\"70px\" >";
			strName += "<td  height=\"70px\"  align=\"left\" style=\"font-size:10px;\">";
			var serialNumber = recObj.getLineItemValue('recmachcustrecord_pl_sn_print_label', 'custrecord_pl_sn_serial_number', x);
			if (serialNumber != "") {
				strName += "<barcode height=\"70px\" width=\"150px\" codetype=\"code128\" showtext=\"true\" value=\"" + serialNumber + "\"/>";
			}
			strName += "<\/td>";
			strName += "<\/tr>";
			strName += "<tr>";
			strName += "<td align=\"left\" style=\"font-size:25px;\">";
			strName += "<barcode  height=\"70px\" width=\"220px\" codetype=\"code128\" showtext=\"true\" value=\"" + itemName + "\"/>";
			strName += "<\/td>";
			strName += "<\/tr>";
			strName += "<\/table>";
			strName += "</body>";
		}
		
		//======================================DISPLAY IN PRINT============================		
		var xml = "<?xml version=\"1.0\"?>\n<!DOCTYPE pdf PUBLIC \"-//big.faceless.org//report\" \"report-1.1.dtd\">\n";
		xml += "<pdf>";
		xml += strName;
		xml += "</pdf>";
		var file = nlapiXMLToPDF(xml);
		response.setContentType('PDF', 'Item Labels.pdf', 'inline');
		response.write(file.getValue());
	} 
	catch (ex) {
		nlapiLogExecution("DEBUG", "Catch Exception", ex);
		nlapiLogExecution("DEBUG", "Catch Exception JSON Stringify", JSON.stringify(ex));
	}
}
