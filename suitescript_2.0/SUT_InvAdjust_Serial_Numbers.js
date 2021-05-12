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

function suiteletFunctionSetSerialNo(request, response) {
    if (request.getMethod() == 'GET') {
        var i_conext = nlapiGetContext();

        var i_Item = request.getParameter('custscript_item');
        nlapiLogExecution('DEBUG', 'suiteletFunction', ' i_Item -->' + i_Item);

        var i_location = request.getParameter('custscript_location');
        nlapiLogExecution('DEBUG', 'suiteletFunction', 'i_location -->' + i_location);

        var f_form = nlapiCreateForm('Serial Numbers');

        f_form.setScript('customscript_cli_promised_saleable_stock');

        var f_Promised_Sales_tab = f_form.addSubList('custpage_seriallist', 'list', 'Serial Numbers');

        f_Promised_Sales_tab.addMarkAllButtons();

        f_Promised_Sales_tab.addField('custpage_select', 'checkbox', 'Select');

        var SerialFieldObj = f_Promised_Sales_tab.addField('custpage_serialno', 'select', 'Serial Number', 'inventorynumber');
        SerialFieldObj.setDisplayType('inline');

        //var StatusObj = f_Promised_Sales_tab.addField('custpage_serialstatus', 'select', 'Status', 'inventorystatus');
        var StatusObj = f_Promised_Sales_tab.addField('custpage_serialstatus', 'text', 'Status');
        StatusObj.setDisplayType('inline');

        var LocationObj = f_Promised_Sales_tab.addField('custpage_seriallocation', 'select', 'Location', 'location');
        LocationObj.setDisplayType('inline');


        try {
            SearchItem(f_Promised_Sales_tab, i_Item, i_location)
        }
        catch (exec) {
            nlapiLogExecution('DEBUG', 'ERROR', ' Exception Caught -->' + exec);
        }

        f_form.addSubmitButton('Add To Inv Adjust');
        response.writePage(f_form);
    }
    else
        if (request.getMethod() == 'POST') {
            var v = 0;
            var a_PSS_and_QTY = new Array();

            var i_line_count = request.getLineItemCount('custpage_seriallist');
            nlapiLogExecution('debug', 'suiteletFunction', 'Line Count -->' + i_line_count);

            if (i_line_count != -1) {
                for (var l = 1; l <= i_line_count; l++) {
                    try {
                        var i_select = request.getLineItemValue('custpage_seriallist', 'custpage_select', l);

                        if (i_select == 'T') {
                            var SerialID = request.getLineItemValue('custpage_seriallist', 'custpage_serialno', l);
                            nlapiLogExecution('debug', 'suiteletFunction', 'Line SerialID -->' + SerialID);

                            a_PSS_and_QTY[v] = SerialID;

                            v++;
                        }
                    }
                    catch (excbb) {
                        nlapiLogExecution('debug', 'ERROR', 'Add Lines Exception Caught -->' + excbb);
                    }
                }
            }
            try {
                nlapiLogExecution('debug', 'ERROR', ' Response ......');
                response.write('<html><head><script>window.opener.setLineSerialNumbers("' + a_PSS_and_QTY + '");self.close();</script></head><body></body></html>');
            }
            catch (eqn) {
                nlapiLogExecution('DEBUG', 'ERROR', ' Error XXX-->' + eqn)
            }
        }
}


function SearchItem(f_Promised_Sales_tab, i_item, i_location) {

    var SerialArray = new Array();

    var i_cnt = 0;
    var filter = new Array();
    var column = new Array();
    filter.push(new nlobjSearchFilter('location', null, 'anyOf', i_location));
    filter.push(new nlobjSearchFilter('item', null, 'is', i_item));

    column[0] = new nlobjSearchColumn('internalid');
    column[1] = new nlobjSearchColumn('inventorynumber');

    var ar_results = nlapiSearchRecord('inventorynumber', 'customsearch_invadjust_itemnumber', filter, column);
    if (ar_results != null && ar_results != '' && ar_results != undefined) {
        for (var i_k = 0; i_k < ar_results.length; i_k++) {
            var SerialId = ar_results[i_k].getValue('internalid');
            SerialArray.push(SerialId);

            //var i_cnt = parseInt(i_cnt) + 1;
            //f_Promised_Sales_tab.setLineItemValue('custpage_serialno', i_cnt, ar_results[i_k].getValue('internalid'));
            //o_select.addSelectOption(ar_results[i_k].getValue('internalid'), ar_results[i_k].getValue('inventorynumber'))
        }

        var Serialfilter = new Array();
        var Serialcolumn = new Array();

        Serialfilter.push(new nlobjSearchFilter('internalid', 'inventorynumber', 'anyOf', SerialArray));
        Serialfilter.push(new nlobjSearchFilter('item', null, 'anyOf', i_item));
        Serialfilter.push(new nlobjSearchFilter('location', null, 'anyOf', i_location));

        Serialcolumn[0] = new nlobjSearchColumn('inventorynumber',null, 'group');
        // Serialcolumn[1] = new nlobjSearchColumn('status');
        Serialcolumn[1] = new nlobjSearchColumn('formulatext', null, 'max')
        Serialcolumn[1].setFormula("max({status}) keep(dense_rank last order by {internalid})");

        var Se_StatusResult = nlapiSearchRecord('inventorydetail', null, Serialfilter, Serialcolumn);

        if (Se_StatusResult != null && Se_StatusResult != '' && Se_StatusResult != undefined) {
            for (var i = 0; i < Se_StatusResult.length; i++) {
                var SerialId = Se_StatusResult[i].getValue(Serialcolumn[0]);
                var Status = Se_StatusResult[i].getValue(Serialcolumn[1]);
                var i_cnt = parseInt(i_cnt) + 1;
                f_Promised_Sales_tab.setLineItemValue('custpage_serialno', i_cnt, SerialId);
                f_Promised_Sales_tab.setLineItemValue('custpage_serialstatus', i_cnt, Status);
                f_Promised_Sales_tab.setLineItemValue('custpage_seriallocation', i_cnt, i_location);
                //o_select.addSelectOption(ar_results[i_k].getValue('internalid'), ar_results[i_k].getValue('inventorynumber'))
            }
        }
    }
}
			
			   
			   