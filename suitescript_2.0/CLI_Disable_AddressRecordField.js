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

function pageInit_DisableCheckBoxField(type){
	/*  On page init:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--				--ID--			--Line Item Name--
	 */
	//  LOCAL VARIABLES
	
	
	//  PAGE INIT CODE BODY
	try {
	
		var Etype = getParameter('etype');
		
		if (Etype != null && Etype != '' && Etype != undefined && Etype == 'custjob') {
			nlapiDisableField('defaultshipping', true);
			nlapiDisableField('defaultbilling', true);
			
			var AddressId = getParameter('id');
			
			if (AddressId != '' && AddressId != null && AddressId != undefined) {
			
			}
			else {
				nlapiSetFieldValue('defaultshipping', 'F');
				nlapiSetFieldValue('defaultbilling', 'F');
			}
			
		}
	} 
	catch (ex) {
	
	}
}

// END PAGE INIT ====================================================





// BEGIN SAVE RECORD ================================================

function saveRecord()
{
    /*  On save record:

	- PURPOSE



	  FIELDS USED:

		--Field Name--			--ID--		--Line Item Name--


    */


    //  LOCAL VARIABLES



    //  SAVE RECORD CODE BODY


	return true;

}

// END SAVE RECORD ==================================================





// BEGIN VALIDATE FIELD =============================================

function validateField(type, name, linenum)
{

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

function fieldChanged(type, name, linenum)
{
	/*  On field changed:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  FIELD CHANGED CODE BODY

}

// END FIELD CHANGED ================================================





// BEGIN POST SOURCING ==============================================

function postSourcing(type, name) {

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

	/*  On Line Init:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--			--ID--		--Line Item Name--
	 */
	//  LOCAL VARIABLES
	
	
	//  LINE INIT CODE BODY
	
}

// END LINE INIT ================================================


// BEGIN VALIDATE LINE ==============================================

function validateLine(type)
{

	/*  On validate line:
	 - EXPLAIN THE PURPOSE OF THIS FUNCTION
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  VALIDATE LINE CODE BODY
	
	
	return true;
}

// END VALIDATE LINE ================================================




// BEGIN RECALC =====================================================

function recalc(type)
{

	/*  On recalc:

          - EXPLAIN THE PURPOSE OF THIS FUNCTION


          FIELDS USED:

          --Field Name--				--ID--


    */


	//  LOCAL VARIABLES


	//  RECALC CODE BODY


}

// END RECALC =======================================================




// BEGIN FUNCTION ===================================================





// END FUNCTION =====================================================
