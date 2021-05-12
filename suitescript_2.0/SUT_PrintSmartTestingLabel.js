function SmartTestPrintSuitelet(request, response){
	try {
		var Rid = request.getParameter('Rid');
		
		//var Rid = 30;
		var recordType = request.getParameter("recordType");// we give the request to get id 
		var recObjInvAdj = nlapiLoadRecord('customrecord_smt', Rid);
	    var emp_id = recObjInvAdj.getFieldValue('custrecord_smt_tester'); 	
		var tranId = Rid;
		
		var rec = "";
		var items = new Array();
		
		var strName = "<head>";
		strName += "<style>";
		strName += "th{background-color: #3c8dbc; color:white;}";
		strName += "body{font-family:Helvetica!important;}";
		strName += "</style>";
		strName += "</head>";
		
		var invLineCount = recObjInvAdj.getLineItemCount('recmachcustrecord_smt_sn_smart_testing');
		
		for (var x = 1; x <= invLineCount; x++) {
			var itemName = recObjInvAdj.getLineItemText('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_part_number_update', x);
			var Description = recObjInvAdj.getLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_item_description', x);
			if (Description != null && Description != '' && Description != undefined) {
			
			}
			else {
				Description = '';
			}
			var serialNumber = recObjInvAdj.getLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_serial', x);
			var Iserialized = recObjInvAdj.getLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_serialized', x);
			var Status = recObjInvAdj.getLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_testupdate', x);
			if (Status != null && Status != '' && Status != undefined) {
			
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
				
				if (Iserialized == "T") {
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
		}
		var xml = "<?xml version=\"1.0\"?>\n<!DOCTYPE pdf PUBLIC \"-//big.faceless.org//report\" \"report-1.1.dtd\">\n";
		xml += "<pdf>";
		xml += strName;
		xml += "</pdf>";
		var file = nlapiXMLToPDF(xml);
		response.setContentType('PDF', 'Smart Testing Item Labels.pdf', 'inline');
		response.write(file.getValue());
	} 
	catch (ex) {
		nlapiLogExecution("DEBUG", "Catch Exception", ex);
		nlapiLogExecution("DEBUG", "Catch Exception JSON Stringify", JSON.stringify(ex));
	}
}
