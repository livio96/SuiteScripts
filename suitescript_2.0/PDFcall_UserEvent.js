function createPDF(type,form)
{
   if(type == 'create' || type == 'edit' || type == 'view') 
   {
	 //get the current record Id	   
      var transID = nlapiGetRecordId();	  
	  nlapiLogExecution('Debug','transID ',transID);
	  
	  //generate a URL with suitelet script
      var scriptURL = nlapiResolveURL('SUITELET','customscript_warranty_pdf_suitelet','customdeploy_warranty_pdf_suitelet','external');
	  scriptURL += '&recno='+transID;
	  
	   nlapiLogExecution('Debug','URL',scriptURL);
	  
	  //call Suitelet from UserEvent
	  var responseObj = nlapiRequestURL(scriptURL, null, null);
		
   }
}
