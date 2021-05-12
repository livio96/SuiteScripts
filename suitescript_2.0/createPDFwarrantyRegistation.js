 function createPDF(request, response) {
   try {	
			//Date Formatting
			var today = new Date();		
			var dd = today.getDate();
			var mm = today.getMonth()+1;
			var yyyy = today.getFullYear();
			today = mm+'/'+dd+'/'+yyyy;
       	    
			var companyInfo = nlapiLoadConfiguration('companyinformation');
			//nlapiLogExecution('Debug','logo',companyInfo.getFieldValue('pagelogo'));
			
			if(companyInfo.getFieldValue('pagelogo'))
			var logofile =  nlapiLoadFile(companyInfo.getFieldValue('pagelogo'));
			var logoURL = logofile.getURL();
						
			//nlapiLogExecution('Debug','Environment ',nlapiGetContext().getEnvironment());
			var finallogoURL;
			if(nlapiGetContext().getEnvironment() == "SANDBOX")
			finallogoURL = nlapiEscapeXML("https://586038-sb1.app.netsuite.com"+logoURL);
		    else
			finallogoURL = nlapiEscapeXML("https://586038.app.netsuite.com"+logoURL);
		
			//nlapiLogExecution('Debug','finallogoURL',finallogoURL);
				
			//Load the custom record from the Current Instance
			var recinternalid = request.getParameter('recno');
			var loadRec = nlapiLoadRecord('customrecord_wrm_warrantyreg',recinternalid);
			
			//Primary Information				
			var recID = loadRec.getFieldValue('recordid');
			var recRegistration = loadRec.getFieldValue('custrecord_wrm_reg_registration');
			var recCustomer = loadRec.getFieldText('custrecord_wrm_reg_customer');
			var recSubsidiary = loadRec.getFieldValue('custrecord_wrm_reg_subsidiary');
			var recClass = loadRec.getFieldValue('custrecord_wrm_reg_class');		
			var recDepartment = loadRec.getFieldValue('custrecord_wrm_reg_department');
			var recStatus = loadRec.getFieldValue('custrecord_wrm_reg_status');		
			var recLoc = loadRec.getFieldText('custrecord_wrm_reg_location');
			var recinActive = loadRec.getFieldValue('isinactive');		
			
			//Warranty Information
			var recmanualRegistration = loadRec.getFieldValue('custrecord_wrm_reg_manual_flag');
			var recInvoiceno = loadRec.getFieldText('custrecord_wrm_reg_invoice');
			var recItem = loadRec.getFieldText('custrecord_wrm_reg_item');
			var recQty = loadRec.getFieldValue('custrecord_wrm_reg_quantity');
			var recSerialnumber = loadRec.getFieldValue('custrecord_wrm_reg_serialnumber');
			var recInvoiceDate = loadRec.getFieldValue('custrecord_wrm_reg_invoicedate');
			var recOriginalwarrantyterms = loadRec.getFieldValue('custrecord_wrm_reg_warrantyterm');
			var recOriginalwarrantystdate = loadRec.getFieldValue('custrecord_wrm_reg_warrantybegin');
			var recExpiration = loadRec.getFieldValue('custrecord_wrm_reg_warrantyexpire');
			var recDoc = loadRec.getFieldValue('custrecord_wrm_reg_warrantydocument');
			var recRemarks = loadRec.getFieldValue('custrecord_wrm_reg_remarks');
			var recShiptoaddress = loadRec.getFieldValue('custrecord_wrm_reg_shiptoaddress');
			var recNewaddress = loadRec.getFieldValue('custrecord_wrm_reg_newaddress');
		
		
		//Formatting HTML using Content in the Custom Record			
		var html = '';
		html += '<?xml version="1.0"?><!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">';
		html += '<pdf>';   
		html += '<head>';
        html += '<style>';
		html += 'body{font-family: "Roboto", sans-serif;}';
		html += '</style>';
        html += '</head>';  		
		html += '<body font-size="12px" size="A4">';
		html +=' <table width="525" cellspacing="0" cellpadding="0">';
		html +=' <tbody>';		
		html +=' <tr>';
		html +=' <td width="350">';
		html +=' <img src="'+finallogoURL+'" alt="logo" title="logo" class="logo-img"></img>';
		html +=' </td>';		
		html +=' <td width="175" align="right" valign="middle" style="margin-top:25px;">';
		html +=' <span style="color:#636260">Date: </span><span>'+today+'</span>';
		html +=' </td>';
		html +=' </tr>'; 
		html +=' <tr>';
		html +=' <td>';
		html += '<table width="525" style="margin-top:10px;" cellspacing="0" cellpadding="0" bgColor="#fff">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td width="525" cellspacing="0" align="left" style="font-size:18px;font-weight:bold;line-height:35;">Warranty Registration</td>';
		html += '</tr>';
		html += '<tr>';
		html += '<td width="525" align="left" style="font-size:14px;font-weight:bold;background:#e0e6ef;color:#607799;">Primary Information</td>';
		html += '</tr>';
		html += '</tbody>';
		html += '</table>';
		
		html += '<table width="525" cellspacing="0" cellpadding="0" bgColor="#fff" style="margin-top:5px;margin-bottom:5px;">';
		html += '<tbody>';
		html += '<tr>';
		
		html += '<td width="165" align="left" style="margin-right:10px">';
		html += '<table cellspacing="0" cellpadding="0" align="left">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">ID</span> '+recID+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260;text-align:left;">Registration No</span> '+recRegistration+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Subsidiary</span> '+recSubsidiary+'</td>';		
		html += '</tr>';
		html += '</tbody>';
		html += '</table>';
		html += '</td>';

		html += '<td width="165" align="left" style="margin-right:10px">';
		html += '<table cellspacing="0" cellpadding="0" align="left">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Class</span> '+recClass+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Department</span> '+recDepartment+'</td>';
		html += '</tr>';
		html += '<tr>';	
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Status</span> '+recStatus+'</td>';
		html += '</tr>';
		html += '</tbody>';
		html += '</table>';
		html += '</td>';		
		
		html += '<td width="175" align="left">';
		html += '<table cellspacing="0" cellpadding="0" align="left">';
		html += '<tbody>';
		html += '<tr>';	
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Location</span> '+recLoc+'</td>';	
		html += '</tr>';
		html += '<tr>';	
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Inactive</span> '+recinActive+'</td>';
		html += '</tr>';
		html += '</tbody>';
		html += '</table>';
		html += '</td>';
		
		html += '</tr>';		
		html += '</tbody>';
		html += '</table>';
		
		html += '<table width="525" cellspacing="0" cellpadding="0" bgColor="#fff" style="margin-top:10px;">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Customer</span> '+recCustomer+'</td>';
		html += '</tr>';
		html += '</tbody>';
		html += '</table>';
		
		html += '<table width="525" cellspacing="0" cellpadding="0" bgColor="#fff" style="margin-top:15px;">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td width="100%" align="left" style="font-size:14px;font-weight:bold;background:#e0e6ef;color:#607799;">Warranty Information</td>';
		html += '</tr>';		
		html += '</tbody>';
		html += '</table>';
		
		html += '<table width="525" cellspacing="0" cellpadding="0" bgColor="#fff"  style="margin-top:5px;margin-bottom:5px;">';
		html += '<tbody>';
		html += '<tr>';
		
		html += '<td width="165" align="left" style="margin-right:10px">';
		html += '<table cellspacing="0" cellpadding="0" align="left">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"><span style="color:#636260">Manual Registration</span> '+recmanualRegistration+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Invoice No</span> '+recInvoiceno+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Reference Invoice</span> '+recInvoiceno+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Item</span> '+recItem+'</td>';		
		html += '</tr>';
	
		html += '</tbody>';
		html += '</table>';
		html += '</td>';

		html += '<td width="165" align="left" style="margin-right:10px">';
		html += '<table cellspacing="0" cellpadding="0" align="left">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Quantity</span> '+recQty+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Serial/Lot Number</span> '+recSerialnumber+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Reference Serial/Lot No</span> '+recSerialnumber+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Invoice Date</span> '+recInvoiceDate+'</td>';		
		html += '</tr>';

		html += '</tbody>';
		html += '</table>';
		html += '</td>';	
		
		html += '<td width="175" align="left">';
		html += '<table cellspacing="0" cellpadding="0" align="left">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Original Warranty Terms</span> '+recOriginalwarrantyterms+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Original Warranty Start Date</span> '+recOriginalwarrantystdate+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Warranty Expiration</span> '+recExpiration+'</td>';		
		html += '</tr>';
		html += '<tr>';
		html += '<td align="left" style="line-height:18;"> <span style="color:#636260">Warranty Document</span> '+recDoc+'</td>';		
		html += '</tr>';
		
		html += '</tbody>';
		html += '</table>';
		html += '</td>';
		
		html += '</tr>';                
		html += '</tbody>';
		html += '</table>';
		
		html += '<table width="525" cellspacing="0" cellpadding="0" bgColor="#fff"  style="margin-top:20px;margin-bottom:5px;">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td width="240" align="left" style="line-height:18;margin-right:45px;"> <span style="color:#636260">Ship To Address</span> '+recShiptoaddress+'</td>';
		html += '<td width="240" align="left" style="line-height:18;"> <span style="color:#636260">New Address</span> '+recNewaddress+'</td>';	
		html += '</tr>';
		html += '<tr>';
		html += '<td width="240" align="left" style="line-height:18;margin-top:10px;margin-right:45px;"> <span style="color:#636260">Remarks</span> '+recRemarks+'</td>';		
		html += '</tr>';                
		html += '</tbody>';
		html += '</table>';
		
		
		
		/* html += '<table width="525" style="margin-top: 20px" cellspacing="0" cellpadding="0" bgColor="#fff">';
		html += '<tbody>';
		html += '<tr>';
		html += '<td width="100%" align="left" style="line-height:25;border-top:1px solid #000;">Related Records</td>';
		html += '</tr>';		
		html += '</tbody>';
		html += '</table>'; */
		
		/* html += '<table width="525" cellspacing="0" cellpadding="0" align="left">';
		html += '<thead style="font-size:12px;background:#dddddd;color:#636260;">';
		html += '<tr>';		
		html += '<td align="left" style="line-height:18px;">Subject</td>';	
		html += '<td align="left" style="line-height:18px;">Number</td>';	
		html += '<td align="left" style="line-height:18px;">Status</td>';	
		html += '<td align="left" style="line-height:18px;">Last Message Date</td>';	
		html += '<td align="left" style="line-height:18px;">Priority</td>';	
		html += '<td align="left" style="line-height:18px;">Assigned To</td>';	
		html += '<td align="left" style="line-height:18px;">Company</td>';	
		html += '<td align="left" style="line-height:18px;">Contant</td>';	
		html += '<td align="left" style="line-height:18px;">Remove</td>';	
		html += '</tr>';                
		html += '</thead>';
		html += '<tbody>';
		html += '<tr>';		
		html += '<td align="left" style="line-height:18;">test</td>';	
		html += '<td align="left" style="line-height:18;">7700</td>';	
		html += '<td align="left" style="line-height:18;">Not Started</td>';	
		html += '<td align="left" style="line-height:18;"></td>';	
		html += '<td align="left" style="line-height:18;">Medium </td>';	
		html += '<td align="left" style="line-height:18;">Hayhurst </td>';	
		html += '<td align="left" style="line-height:18;">0006031 </td>';	
		html += '<td align="left" style="line-height:18;">Gordon Brant </td>';	
		html += '<td align="left" style="line-height:18;">Remove </td>';	
		html += '</tr>';                
		html += '</tbody>';
		html += '</table>'; */	
		
		html += '</td>';		
		html += '</tr>';                
		html += '</tbody>';
		html += '</table>';
				
		// code ends here//
		html += '</body>';
		html += '</pdf>';
		html = html.replace(/null/g, '');
		
		//setting pdf file name 
		var file_name='WarrantyRegister_'+recinternalid+'.pdf';
		var folder_id='9228380';

		//for conerting html file to pdf
		//nlapiLogExecution('debug', 'html', html);
		var QRFilePDF = nlapiXMLToPDF(html);
		nlapiLogExecution('debug', 'QRFilePDF', QRFilePDF);
	    //submitting file obj value

		QRFilePDF.setName(file_name);
		QRFilePDF.setFolder(folder_id);
		QRFilePDF.setIsOnline(true);
		var PDFSubit = nlapiSubmitFile(QRFilePDF);
		nlapiLogExecution('debug', 'PDFSubit', PDFSubit);

	} 
	catch (e) {
    nlapiLogExecution('Error', 'printPackingSlipPDF', e.toString());
    }
}