// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
/*
   	Script Name : 
	Author      : 
	Date        : 
	Description : 


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
	//  Initialize any Global Variables, in particular, debugging variables...

function suiteletFunctionBinSelection(request, response){
	if (request.getMethod() == 'GET') {
		var i_conext = nlapiGetContext();
		
		var i_Item = request.getParameter('custscript_item');
		nlapiLogExecution('DEBUG', 'suiteletFunction', ' i_Item -->' + i_Item);
		
		var i_location = request.getParameter('custscript_location');
		nlapiLogExecution('DEBUG', 'suiteletFunction', 'i_location -->' + i_location);
		
		var i_requesttype = request.getParameter('custscript_bintype');
		nlapiLogExecution('DEBUG', 'suiteletFunction', 'i_requesttype -->' + i_requesttype);
		
		var f_form = nlapiCreateForm('Bin Numbers');
		
		//f_form.setScript('customscript_cli_promised_saleable_stock');
		
		var BinReqObj =  f_form.addField('custpage_bintype', 'select', 'Type');
		BinReqObj.addSelectOption('1', 'From Bin');
		BinReqObj.addSelectOption('2', 'To Bin');
		BinReqObj.setDefaultValue(i_requesttype);
		BinReqObj.setDisplayType('inline');
		
		
		var BinObj = f_form.addField('custpage_binnumber', 'select', 'Bin Number');
		
		try {
			SearchItem(BinObj, i_Item, i_location)
		} 
		catch (exec) {
			nlapiLogExecution('DEBUG', 'ERROR', ' Exception Caught -->' + exec);
		}
		
		f_form.addSubmitButton('Add To Inv Adjust');
		response.writePage(f_form);
	}
	else 
		if (request.getMethod() == 'POST') {
			var BinType = request.getParameter('custpage_bintype');
			nlapiLogExecution('debug', 'suiteletFunction', 'BinType -->' + BinType);
			
			var Bin = request.getParameter('custpage_binnumber');
			nlapiLogExecution('debug', 'suiteletFunction', 'Bin -->' + Bin);
			
			if (BinType == 1) {
			
				try {
					nlapiLogExecution('debug', 'ERROR', ' Response ......');
					response.write('<html><head><script>window.opener.setFromBin("' + Bin + '");self.close();</script></head><body></body></html>');
				} 
				catch (eqn) {
					nlapiLogExecution('DEBUG', 'ERROR', ' Error XXX-->' + eqn)
				}
			}
			else {
				try {
					nlapiLogExecution('debug', 'ERROR', ' Response ......');
					response.write('<html><head><script>window.opener.setToBin("' + Bin + '");self.close();</script></head><body></body></html>');
				} 
				catch (eqn) {
					nlapiLogExecution('DEBUG', 'ERROR', ' Error XXX-->' + eqn)
				}
			}
		}
}


function SearchItem(BinObj, i_item, i_location)
{
	var binFilters = new Array();
	var binColumns = new Array();
	
	binFilters.push(new nlobjSearchFilter('internalid', null, 'anyOf', i_item));
	binFilters.push(new nlobjSearchFilter('location', 'binnumber', 'is', i_location));
	
	binColumns.push(new nlobjSearchColumn('internalid', 'binnumber'));
	binColumns.push(new nlobjSearchColumn('binnumber', 'binnumber'));
	
	var ar_results = nlapiSearchRecord('item', null, binFilters, binColumns);
	
	if (ar_results != null && ar_results != '' && ar_results != undefined) {
		for (var i_k = 0; i_k < ar_results.length; i_k++) {
			var i_cnt = parseInt(i_cnt) + 1;
			BinObj.addSelectOption(ar_results[i_k].getValue('internalid', 'binnumber'), ar_results[i_k].getValue('binnumber', 'binnumber'))
		}
	}
}


			
			   
			   