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



// END VALIDATE FIELD ===============================================





// BEGIN FIELD CHANGED ==============================================

function fieldChanged_UpdateStatus(type, name, linenum){
	/*  On field changed:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  FIELD CHANGED CODE BODY
	
	if (name == 'custrecord_smt_update' || name == 'custrecord_smt_testing_update') {
		var TestingUpdate = nlapiGetFieldValue('custrecord_smt_testing_update');
		var HeaderUpdate = nlapiGetFieldValue('custrecord_smt_update');
		
		if (TestingUpdate != null && TestingUpdate != '' && TestingUpdate != undefined && HeaderUpdate == 'T') {
			var i_linecount = nlapiGetLineItemCount('recmachcustrecord_smt_sn_smart_testing');
			
			for (var k = 1; k <= i_linecount; k++) {
				var Processed = nlapiGetLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_processed', k)
				
				if (Processed != 'T') {
					nlapiSetLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_testupdate', k, TestingUpdate)
				}
			}
			
			nlapiSetFieldValue('custrecord_smt_testing_update', '', false, false)
			nlapiSetFieldValue('custrecord_smt_update', 'F', false, false)
		}
	}
}

// END FIELD CHANGED ================================================


function pageInit_disableSerialNo(type)
{
		if (type == 'recmachcustrecord_smt_sn_smart_testing') {
			var Isserial = nlapiGetCurrentLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_serialized');
			if (Isserial == 'T') {
				nlapiDisableLineItemField('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_serial', false)
			}
			else {
				nlapiDisableLineItemField('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_serial', true)
			}
		}
}


// BEGIN POST SOURCING ==============================================
function lineInit_disableSerialNo(type){
	if (type == 'recmachcustrecord_smt_sn_smart_testing') {
		var Isserial = nlapiGetCurrentLineItemValue('recmachcustrecord_smt_sn_smart_testing','custrecord_smt_sn_serialized');
	
		if (Isserial == 'T') {
			nlapiDisableLineItemField('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_serial', false)
		}
		else {
			nlapiDisableLineItemField('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_serial', true)
		}
	}
}
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

function markalltestingrec(type){

	var i_linecount = nlapiGetLineItemCount('recmachcustrecord_smt_sn_smart_testing');
	
	for (var k = 1; k <= i_linecount; k++) {
		var Processed = nlapiGetLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_processed', k)
		
		if (Processed != 'T') {
			nlapiSetLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_apply', k, 'T')
		}
	}
}
function unmarkalltestingrec(type){
	var i_linecount = nlapiGetLineItemCount('recmachcustrecord_smt_sn_smart_testing');
	
	for (var k = 1; k <= i_linecount; k++) {
		var Processed = nlapiGetLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_processed', k)
		
		if (Processed != 'T') {
			nlapiSetLineItemValue('recmachcustrecord_smt_sn_smart_testing', 'custrecord_smt_sn_apply', k, 'F')
		}
	}
}

// BEGIN LINE INIT ==============================================
