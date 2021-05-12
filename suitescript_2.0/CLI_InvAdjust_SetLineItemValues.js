// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
/*
   	Script Name:
	Author:
	Company:
	Date:
    Description:


	Script Modification Log:

	-- Date --			-- Modified By --				--Requested By--				-- Description --




	Below is a summary of the process controls enforced by this script file.  The control logic is described
	more fully, below, in the appropriate function headers and code blocks.

     PAGE INIT
		- pageInit(type)


     SAVE RECORD
		- saveRecord()


     VALIDATE FIELD
		- validateField(type, name, linenum)


     FIELD CHANGED
		- fieldChanged(type, name, linenum)


     POST SOURCING
		- postSourcing(type, name)


	LINE INIT
		- lineInit(type)


     VALIDATE LINE
		- validateLine()


     RECALC
		- reCalc()


     SUB-FUNCTIONS
		- The following sub-functions are called by the above core functions in order to maintain code
            modularization:





*/
}
// END SCRIPT DESCRIPTION BLOCK  ====================================



// BEGIN SCRIPT UPDATION BLOCK  ====================================
/*


*/
// END SCRIPT UPDATION BLOCK  ====================================




// BEGIN GLOBAL VARIABLE BLOCK  =====================================
{

	//  Initialize any Global Variables, in particular, debugging variables...


}
// END GLOBAL VARIABLE BLOCK  =======================================





// BEGIN PAGE INIT ==================================================

function pageInit_TransferType(type){
	/*  On page init:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--				--ID--			--Line Item Name--
	 */
	//  LOCAL VARIABLES
	
	
	//  PAGE INIT CODE BODY
	RecType = type;
	var Reason = nlapiGetFieldValue('custrecord_invadjust_reason');
	
	if (Reason == 4 || Reason == 6) {
		nlapiDisableField('custrecord_invadjust_toitem', false);
		nlapiDisableField('custrecord_invadjust_to_itemlocation', false);
		nlapiDisableField('custrecord_updated_unit_cost', false);
		nlapiDisableField('custrecord_invadjust_tobin', false);
	}
	else {
		nlapiDisableField('custrecord_invadjust_toitem', true);
		nlapiDisableField('custrecord_invadjust_to_itemlocation', true);
		nlapiDisableField('custrecord_updated_unit_cost', true);
		nlapiDisableField('custrecord_invadjust_tobin', true);
	}
}

// END PAGE INIT ====================================================





// BEGIN SAVE RECORD ================================================

function saveRecord_validateReason() {
    /*  On save record:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--			--ID--		--Line Item Name--
	 */
    //  LOCAL VARIABLES



    //  SAVE RECORD CODE BODY
    var Reason = nlapiGetFieldValue('custrecord_invadjust_reason');

    if (Reason == 4 || Reason == 6) {
        var TO_Item = nlapiGetFieldValue('custrecord_invadjust_toitem');

        if (TO_Item != null && TO_Item != '' && TO_Item != undefined) {

        }
        else {
            alert("Part Number Changed : To Item is Mandatory");
            return false;
        }

        var TO_Location = nlapiGetFieldValue('custrecord_invadjust_to_itemlocation');

        if (TO_Location != null && TO_Location != '' && TO_Location != undefined) {

        }
        else {
            alert("Part Number Changed : To Location is Mandatory");
            return false;
        }
    }

    if (Reason == 5 || Reason == 6) {
        var i_linecount = nlapiGetLineItemCount('recmachcustrecord_invserial_parent');

        var receiptserial_linecount = nlapiGetLineItemCount('recmachcustrecord_issueserial_parentrec');

        if (i_linecount != receiptserial_linecount) {
            alert(" Issue and Receipt Quantity Must be Same");
            return false;
        }

    }
    if (Reason == 1 || Reason == 4 || Reason == 5 || Reason == 6) {
        var i_linecount = nlapiGetLineItemCount('recmachcustrecord_invserial_parent');

        if (i_linecount != null && i_linecount != '' && i_linecount != undefined && i_linecount != 0) {

        }
        else {
            alert("Please Enter Atleast one Serial Number For Adjsutment");
            return false;
        }
    }
    if (Reason == 2) {
        var i_linecount = nlapiGetLineItemCount('recmachcustrecord_issueserial_parentrec');

        if (i_linecount != null && i_linecount != '' && i_linecount != undefined && i_linecount != 0) {

        }
        else {
            alert("Please Enter Atleast one Serial Number For Adjustment");
            return false;
        }
    }

    if (Reason == 2 || Reason == 5) {
        var Item = nlapiGetFieldValue('custrecord_invadjust_item');
        var Location = nlapiGetFieldValue('custrecord_invadjust_location');

        var ItemUseBin = nlapiLookupField('item', Item, 'usebins');
        var LocationUseBin = nlapiLookupField('location', Location, 'usesbins')

        if (ItemUseBin == 'T' && LocationUseBin == 'T') {
            nlapiSetFieldValue('custrecord_invadjust_use_bins', 'T');

            var FromBin = nlapiGetFieldValue('custrecord_bin_number');

            if (FromBin != null && FromBin != '' && FromBin != undefined) {

            }
            else {
                alert('Please select the Bin Number');
                return false;
            }
        }
        else {
            nlapiSetFieldValue('custrecord_invadjust_use_bins', 'F');
        }
    }
    if (Reason == 4 || Reason == 6) {
        var Item = nlapiGetFieldValue('custrecord_invadjust_toitem');
        var Location = nlapiGetFieldValue('custrecord_invadjust_to_itemlocation');

        var ItemUseBin = nlapiLookupField('item', Item, 'usebins');
        var LocationUseBin = nlapiLookupField('location', Location, 'usesbins')

        if (ItemUseBin == 'T' && LocationUseBin == 'T') {
            nlapiSetFieldValue('custrecord_invadjust_toitem_usebin', 'T');

            var ToBin = nlapiGetFieldValue('custrecord_invadjust_tobin');

            if (ToBin != null && ToBin != '' && ToBin != undefined) {

            }
            else {
                alert('Please select the To Bin Number');
                return false;
            }
        }
        else {
            nlapiSetFieldValue('custrecord_invadjust_toitem_usebin', 'F');
        }

        var Item = nlapiGetFieldValue('custrecord_invadjust_toitem');

        var IsSerialItem = nlapiLookupField('item', Item, 'isserialitem');

        if (IsSerialItem != 'T') {
            alert('Please select the Item as Serial Item');

            return false;
        }
    }

    var Item = nlapiGetFieldValue('custrecord_invadjust_item');

    var IsSerialItem = nlapiLookupField('item', Item, 'isserialitem');

    if (IsSerialItem != 'T') {
        alert('Please select the To Item as Serial Item');

        return false;
    }

    //=============================== Start validate serial numbers Availability on save =================================//
    if (Reason == 1 || Reason == 4 || Reason == 5 || Reason == 6) {
        var SerialArray = new Array();

        var i_linecount = nlapiGetLineItemCount('recmachcustrecord_invserial_parent');
        for (var l = 1; l <= i_linecount; l++) {
            var SerialNumber = nlapiGetLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_invserial_serailnumber', l);
            SerialArray.push(SerialNumber);
        }

        var i_item = nlapiGetFieldValue('custrecord_invadjust_item');
        var i_location = nlapiGetFieldValue('custrecord_invadjust_location');

        var filter = new Array();
        var column = new Array();

        filter.push(new nlobjSearchFilter('location', null, 'anyOf', i_location));
        filter.push(new nlobjSearchFilter('item', null, 'anyOf', i_item));
        filter.push(new nlobjSearchFilter('isonhand', null, 'is', 'F'));
        filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', SerialArray));

        column[0] = new nlobjSearchColumn('internalid');
        column[1] = new nlobjSearchColumn('inventorynumber');

        var ar_results = nlapiSearchRecord('inventorynumber', null, filter, column);

        if (ar_results != null && ar_results != '' && ar_results != undefined) {
            var SerialError = '';
            for (var i_k = 0; i_k < ar_results.length; i_k++) {
                var SerialNo = ar_results[i_k].getValue('inventorynumber');

                SerialError = SerialError + '-' + SerialNo;

            }
            alert('Serial Number Not Available :' + SerialNo)
            return false;
        }
    }
    //===============================End validate serial numbers Availability on save =================================//

    return true;

}

// END SAVE RECORD ==================================================





// BEGIN VALIDATE FIELD =============================================

function validateField(type, name, linenum) {

    /*  On validate field:

          - EXPLAIN THE PURPOSE OF THIS FUNCTION


          FIELDS USED:

          --Field Name--				--ID--


    */


    //  LOCAL VARIABLES



    //  VALIDATE FIELD CODE BODY

   
    return true;
}

// END VALIDATE FIELD ===============================================





// BEGIN FIELD CHANGED ==============================================

function fieldChanged_SetSerialNum(type, name, linenum) {
    /*  On field changed:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
    //  LOCAL VARIABLES


    //  FIELD CHANGED CODE BODY

    if (name == 'custrecord_invadjust_reason') {
        var Reason = nlapiGetFieldValue('custrecord_invadjust_reason');

        if (Reason == 4 || Reason == 6) {
            nlapiDisableField('custrecord_invadjust_toitem', false);
            nlapiDisableField('custrecord_invadjust_to_itemlocation', false);
            nlapiDisableField('custrecord_updated_unit_cost', false);
            nlapiDisableField('custrecord_invadjust_tobin', false);
        }
        else {
            nlapiSetFieldValue('custrecord_invadjust_toitem', '', false, false);
            nlapiSetFieldValue('custrecord_invadjust_to_itemlocation', '', false, false);
            nlapiSetFieldValue('custrecord_updated_unit_cost', '', false, false);
            nlapiSetFieldValue('custrecord_invadjust_tobin', '', false, false);

            nlapiDisableField('custrecord_invadjust_toitem', true);
            nlapiDisableField('custrecord_invadjust_to_itemlocation', true);
            nlapiDisableField('custrecord_updated_unit_cost', true);
            nlapiDisableField('custrecord_invadjust_tobin', true);
        }

        if (Reason != null && Reason != '' && Reason != undefined)
        {
            var InvAdjustAccount = nlapiLookupField('customrecord_inv_adjsut_type_list', Reason, 'custrecord_adjustment_account');

            if (InvAdjustAccount != null && InvAdjustAccount != '' && InvAdjustAccount != undefined)
            {
                nlapiSetFieldValue('custrecord_invadjust_account', InvAdjustAccount);
            }
        }
    }

    if (name == 'custrecord_invadjust_toitem' || name == 'custrecord_invadjust_to_itemlocation') {
        var i_Item = nlapiGetFieldValue('custrecord_invadjust_toitem');
        var i_location = nlapiGetFieldValue('custrecord_invadjust_to_itemlocation');

        if (i_Item != null && i_Item != '' && i_Item != undefined && i_location != null && i_location != '' && i_location != undefined) {
            var filter = new Array();
            var column = new Array();

            filter.push(new nlobjSearchFilter('inventorylocation', null, 'anyOf', i_location));
            filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', i_Item));

            column[0] = new nlobjSearchColumn('internalid');
            column[1] = new nlobjSearchColumn('locationaveragecost');

            var Se_LocationPriceResult = nlapiSearchRecord('item', null, filter, column);

            if (Se_LocationPriceResult != null && Se_LocationPriceResult != '' && Se_LocationPriceResult != undefined) {
                var LocationAverageCost = Se_LocationPriceResult[0].getValue('locationaveragecost');
                //                              alert('LocationAverageCost' + LocationAverageCost);
                if (LocationAverageCost != null && LocationAverageCost != '' && LocationAverageCost != undefined) {
                    nlapiSetFieldValue('custrecord_invadjust_toitemcost', LocationAverageCost, true, true);
                    // nlapiSetFieldValue('custrecord_updated_unit_cost', LocationAverageCost, true, true);
                }
                else {
                    nlapiSetFieldValue('custrecord_invadjust_toitemcost', 0, true, true);
                    //nlapiSetFieldValue('custrecord_updated_unit_cost', 0, true, true);
                }
            }
            else {
                nlapiSetFieldValue('custrecord_invadjust_toitemcost', 0, true, true);
                // nlapiSetFieldValue('custrecord_updated_unit_cost', 0, true, true);
            }

            var Cost = nlapiGetFieldValue('custrecord_invadjust_unitcost');
            if (Cost != null && Cost != '' && Cost != undefined)
            {
                Cost = parseFloat(Cost);
                Cost = Cost.toFixed(2);
                nlapiSetFieldValue('custrecord_updated_unit_cost', Cost, true, true);
            }
        }
        updateEstimateValue();
    }

    if (name == 'custrecord_invadjust_item' || name == 'custrecord_invadjust_location') {
        var i_Item = nlapiGetFieldValue('custrecord_invadjust_item');
        var i_location = nlapiGetFieldValue('custrecord_invadjust_location');

        if (i_Item != null && i_Item != '' && i_Item != undefined && i_location != null && i_location != '' && i_location != undefined) {

            if (window.onbeforeunload) {
                window.onbeforeunload = function () {
                    null;
                };
            }
            var URL = nlapiResolveURL('RECORD', 'customrecord_invent_adjust_approval');
            URL = URL + '&item=' + i_Item + '&location=' + i_location;
            window.location = URL;
        }
    }

    if (type == 'recmachcustrecord_invserial_parent' && name == 'custpage_serialnumber') {

        var SerialNumber = nlapiGetCurrentLineItemValue('recmachcustrecord_invserial_parent', 'custpage_serialnumber');

        var Item = nlapiGetFieldValue('custrecord_invadjust_item');
        var Location = nlapiGetFieldValue('custrecord_invadjust_location');

        if (SerialNumber != null && SerialNumber != '' && SerialNumber != undefined) {
            nlapiSetCurrentLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_list_item', Item, true, true);
            nlapiSetCurrentLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_invserial_serailnumber', SerialNumber, true, true);

            var filter = new Array();
            var column = new Array();

            filter.push(new nlobjSearchFilter('internalid', 'inventorynumber', 'anyOf', SerialNumber));
            filter.push(new nlobjSearchFilter('item', null, 'anyOf', Item));
            filter.push(new nlobjSearchFilter('location', null, 'anyOf', Location));

            column[0] = new nlobjSearchColumn('internalid').setSort(true);
            column[1] = new nlobjSearchColumn('status');

            var Se_StatusResult = nlapiSearchRecord('inventorydetail', null, filter, column);

            if (Se_StatusResult != null && Se_StatusResult != '' && Se_StatusResult != undefined) {
                var Status = Se_StatusResult[0].getValue('status');
                if (Status != null && Status != '' && Status != undefined) {
                    nlapiSetCurrentLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_invserial_status', Status, true, true);

                }
            }
        }
    }

    if (name == 'custrecord_invadjust_unitcost' || name == 'custrecord_invadjust_toitemcost' || name == 'custrecord_invadjust_reason' || name == 'custrecord_updated_unit_cost') {
        updateEstimateValue()
    }
}

// END FIELD CHANGED ================================================





// BEGIN POST SOURCING ==============================================

function postSourcing(type, name) 
{

    /*  On post sourcing:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--			--ID--		--Line Item Name--
	 */
    //  LOCAL VARIABLES


    //  POST SOURCING CODE BODY

}

// END POST SOURCING ================================================



// BEGIN LINE INIT ==============================================

function lineInit(type)
{

}

// END LINE INIT ================================================


// BEGIN VALIDATE LINE ==============================================

function validateLine_DuplicateSerial(type){
	if (type == 'recmachcustrecord_invserial_parent') {
		var i_linecount = nlapiGetLineItemCount('recmachcustrecord_invserial_parent');
		
		var LineIndex = nlapiGetCurrentLineItemIndex('recmachcustrecord_invserial_parent');
		var CurrentSerialNo = nlapiGetCurrentLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_invserial_serailnumber');
		for (var k = 1; k <= i_linecount; k++) {
			var SerialNumber = nlapiGetLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_invserial_serailnumber', k);
			if (LineIndex != k) {
				if (CurrentSerialNo == SerialNumber) {
					alert("Serial Number Cannot be same on multiple Lines");
					return false;
				}
			}
		}
		var CurrentStatus = nlapiGetCurrentLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_invserial_status');
		if (CurrentStatus != null && CurrentStatus != '' && CurrentStatus != undefined) {
		
		}
		else {
			alert('Please select the current status');
			return false;
		}

		if (CurrentStatus == 12) {
		    alert('Please select the Serial Number with different status ,"Pending Approval Serial Number Not Allowed"');
		    return false;
		}
	}
	if (type == 'recmachcustrecord_issueserial_parentrec') {
		var i_linecount = nlapiGetLineItemCount('recmachcustrecord_issueserial_parentrec');
		
		var LineIndex = nlapiGetCurrentLineItemIndex('recmachcustrecord_issueserial_parentrec');
		var CurrentSerialNo = nlapiGetCurrentLineItemValue('recmachcustrecord_issueserial_parentrec', 'custrecord_issueserial_serialno');
		for (var k = 1; k <= i_linecount; k++) {
			var SerialNumber = nlapiGetLineItemValue('recmachcustrecord_issueserial_parentrec', 'custrecord_issueserial_serialno', k);
			if (LineIndex != k) {
				if (CurrentSerialNo == SerialNumber) {
					alert("Serial Number Cannot be same on multiple Lines");
					return false;
				}
			}
		}
		
		var SerialNo = nlapiGetCurrentLineItemValue('recmachcustrecord_issueserial_parentrec', 'custrecord_issueserial_serialno');
		if (SerialNo != null && SerialNo != '' && SerialNo != undefined) {
		
		}
		else {
			alert('Please select the Enter the issue serial number');
			return false;
		}
		
		var CurrentStatus = nlapiGetCurrentLineItemValue('recmachcustrecord_issueserial_parentrec', 'custrecord_issueserial_status');
		if (CurrentStatus != null && CurrentStatus != '' && CurrentStatus != undefined) {
		
		}
		else {
			alert('Please select the current Issue status');
			return false;
		}

		if (CurrentStatus == 12) {
		    alert('Please select the Serial Number with different status ,"Pending Approval Serial Number Not Allowed"');
		    return false;
		}
	}
	return true;
}

// END VALIDATE LINE ================================================




// BEGIN RECALC =====================================================

function recalc_calculateestimate(type){

	/*  On recalc:
	 - EXPLAIN THE PURPOSE OF THIS FUNCTION
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  RECALC CODE BODY
	
	if (type == 'recmachcustrecord_issueserial_parentrec' || type == 'recmachcustrecord_invserial_parent') 
	{
		 updateEstimateValue()
	}
}

// END RECALC =======================================================




// BEGIN FUNCTION ===================================================
function AddMultipleSerialNumbers()
{
	
	var custscript_item = nlapiGetFieldValue('custrecord_invadjust_item');
	
	var custscript_location = nlapiGetFieldValue('custrecord_invadjust_location');
	
	var url = nlapiResolveURL('SUITELET', 'customscript_sut_invadjust_serial_number', '1')
	
	var URLWithParam = url + '&custscript_item=' + custscript_item + '&custscript_location=' + custscript_location;
	
	popupCenter(URLWithParam, 'Window', 500, 500);
}

function popupCenter(url, title, w, h)
{
	var left = (screen.width / 2) - (w / 2);
	var top = (screen.height / 2) - (h / 2);
	
	return window.open(url, title, 'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);
	
}

function setLineSerialNumbers(a_data_array)
{
	try 
	{
		var a_Serial_array = new Array();
		//if (_logValidation(a_data_array)) 
		{
			a_Serial_array = a_data_array.split(',');
			for (var k = 0; k < a_Serial_array.length; k++) 
			{
				var Flag = true;
				var SerialID = a_Serial_array[k];
				var i_linecount = nlapiGetLineItemCount('recmachcustrecord_invserial_parent');
				for (var l = 1; l <= i_linecount; l++) 
				{
					var SerialNumber = nlapiGetLineItemValue('recmachcustrecord_invserial_parent', 'custrecord_invserial_serailnumber', l);
					if (SerialID == SerialNumber) 
					{
						Flag = false;
						break;
					}
				}		
				if (Flag == true) 
				{
					nlapiSelectNewLineItem('recmachcustrecord_invserial_parent');
					nlapiSetCurrentLineItemValue('recmachcustrecord_invserial_parent', 'custpage_serialnumber', SerialID, true, true);
					nlapiCommitLineItem('recmachcustrecord_invserial_parent');
				}
			}
		}
	} 
	catch (exc) {
		alert(exc)
	}
}
function SelectFromBin()
{
	
	var custscript_item = nlapiGetFieldValue('custrecord_invadjust_item');
	
	var custscript_location = nlapiGetFieldValue('custrecord_invadjust_location');
	
	var url = nlapiResolveURL('SUITELET', 'customscript_sut_invajust_bin_numbers', '1')
	
	var URLWithParam = url + '&custscript_item=' + custscript_item + '&custscript_location=' + custscript_location + '&custscript_bintype=' + 1;
	
	popupCenter(URLWithParam, 'Window', 500, 500);
}
function SelecToBin()
{
	
	var custscript_item = nlapiGetFieldValue('custrecord_invadjust_toitem');
	
	var custscript_location = nlapiGetFieldValue('custrecord_invadjust_to_itemlocation');
	
	var url = nlapiResolveURL('SUITELET', 'customscript_sut_invajust_bin_numbers', '1')
	
	var URLWithParam = url + '&custscript_item=' + custscript_item + '&custscript_location=' + custscript_location + '&custscript_bintype=' + 2;
	
	popupCenter(URLWithParam, 'Window', 500, 500);
}
function setFromBin(bin)
{
	try 
	{
		if (bin != null && bin != '' && bin != undefined) 
		{
			nlapiSetFieldValue('custrecord_bin_number',bin);
		}
		else 
		{
			nlapiSetFieldValue('custrecord_bin_number','');
		}
	} 
	catch (exc) {
		alert(exc)
	}
}

function setToBin(bin)
{
	try 
	{
		if (bin != null && bin != '' && bin != undefined) 
		{
			nlapiSetFieldValue('custrecord_invadjust_tobin',bin);
		}
		else 
		{
			nlapiSetFieldValue('custrecord_invadjust_tobin','');
		}
	} 
	catch (exc) {
		alert(exc)
	}
}


function updateEstimateValue() {
    var From_UnitCost = nlapiGetFieldValue('custrecord_invadjust_unitcost');
    var To_UnitCost = nlapiGetFieldValue('custrecord_updated_unit_cost');

    if (From_UnitCost != null && From_UnitCost != '' && From_UnitCost != undefined)
    {
        From_UnitCost = parseFloat(From_UnitCost);
        From_UnitCost = From_UnitCost.toFixed(2);
    }
    else {
        From_UnitCost = 0;
    }

    if (To_UnitCost != null && To_UnitCost != '' && To_UnitCost != undefined) {
        To_UnitCost = parseFloat(To_UnitCost);
        To_UnitCost = To_UnitCost.toFixed(2);
    }
    else {
        To_UnitCost = 0;
    }

    var Reason = nlapiGetFieldValue('custrecord_invadjust_reason');

    if (Reason == 4 || Reason == 6)
    {
        var i_linecount = nlapiGetLineItemCount('recmachcustrecord_invserial_parent');

        var FromCost = (parseFloat(From_UnitCost) * parseFloat(i_linecount))
        var ToCost = (parseFloat(To_UnitCost) * parseFloat(i_linecount))

        var EstimatedValue = (parseFloat(ToCost) - parseFloat(FromCost));

        nlapiSetFieldValue('custrecord_invadjust_estimated_value', EstimatedValue)
    }
    if (Reason == 1 || Reason == 3)
    {
        var i_linecount = nlapiGetLineItemCount('recmachcustrecord_invserial_parent');

        var FromCost = (((parseFloat(From_UnitCost) * parseFloat(i_linecount))) * (-1))

        nlapiSetFieldValue('custrecord_invadjust_estimated_value', FromCost)

    }
    if (Reason == 2) {
        var i_linecount = nlapiGetLineItemCount('recmachcustrecord_issueserial_parentrec');

        var FromCost = (((parseFloat(From_UnitCost) * parseFloat(i_linecount))))

        nlapiSetFieldValue('custrecord_invadjust_estimated_value', FromCost)

    }
    if (Reason == 5) {
        //var i_linecount = nlapiGetLineItemCount('recmachcustrecord_issueserial_parentrec');

        //var FromCost = (((parseFloat(From_UnitCost) * parseFloat(i_linecount))))

        nlapiSetFieldValue('custrecord_invadjust_estimated_value', 0)

    }
}
         
function OpenExpressEntrySerialNumberForm() {
    try {
        var SerialNumbers = nlapiGetFieldValue('custpage_serialnumber');
        var Status = nlapiGetFieldValue('custpage_status');

        if (SerialNumbers != null && SerialNumbers != '' && SerialNumbers != undefined) {

        }
        else {
            alert('Please enter Serial Number For Express Entry');
            return false;
        }

        if (Status != null && Status != '' && Status != undefined) {

        }
        else {
            alert('Please enter Status For Express Entry');
            return false;
        }

        var a_Serial_array = new Array();
        //if (_logValidation(a_data_array)) 
        {
            a_Serial_array = SerialNumbers.split('\n');
            for (var k = 0; k < a_Serial_array.length; k++) {
                var SerialID = a_Serial_array[k];

                if (SerialID != null && SerialID != '' && SerialID != undefined) {
                    nlapiSelectNewLineItem('recmachcustrecord_issueserial_parentrec');
                    nlapiSetCurrentLineItemValue('recmachcustrecord_issueserial_parentrec', 'custrecord_issueserial_serialno', SerialID, true, true);
                    nlapiSetCurrentLineItemValue('recmachcustrecord_issueserial_parentrec', 'custrecord_issueserial_status', Status, true, true);
                    nlapiCommitLineItem('recmachcustrecord_issueserial_parentrec');
                }

            }
        }

        nlapiSetFieldValue('custpage_serialnumber', '');
        nlapiSetFieldValue('custpage_status', '');

    }
    catch (exc) {
        alert("Error--->" + exc)
    }
}



function OpenIssueExpressEntrySerialNumber() {
    try {
        var SerialNumbers = nlapiGetFieldValue('custpage_issueexpressserialnumber');

        if (SerialNumbers != null && SerialNumbers != '' && SerialNumbers != undefined) {

        }
        else {
            alert('Please enter Serial Number For Express Entry');
            return false;
        }

        var a_Serial_array = new Array();
        //if (_logValidation(a_data_array)) 
        {
            a_Serial_array = SerialNumbers.split('\n');
            for (var k = 0; k < a_Serial_array.length; k++) {
                var SerialID = a_Serial_array[k];

                if (SerialID != null && SerialID != '' && SerialID != undefined) {
                    nlapiSelectNewLineItem('recmachcustrecord_invserial_parent');
                    nlapiSetCurrentLineItemText('recmachcustrecord_invserial_parent', 'custpage_serialnumber', SerialID, true, true);
                    nlapiCommitLineItem('recmachcustrecord_invserial_parent');
                }
            }
        }
        nlapiSetFieldValue('custpage_issueexpressserialnumber', '');
    }
    catch (exc) {
        alert("Error--->" + exc)
        return false;
    }
}

function printinventoryadjustmentlabel() {
    var recordid = nlapiGetRecordId();

    var url = nlapiResolveURL('SUITELET', 'customscript_sut_printinvadjustapproval', '1')

    var URLWithParam = url + '&Rid=' + recordid;

    window.open(URLWithParam, '_blank')
}


// END FUNCTION =====================================================
