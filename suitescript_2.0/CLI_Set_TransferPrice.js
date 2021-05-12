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

function pageInit_TransferType(type)
{
    /*  On page init:

	- PURPOSE

		FIELDS USED:

		--Field Name--				--ID--			--Line Item Name--

    */

    //  LOCAL VARIABLES


    //  PAGE INIT CODE BODY
    RecType = type;
	nlapiDisableLineItemField('item','rate',true);
	nlapiDisableLineItemField('item','amount',true);

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

function fieldChanged_OverwriteTransferPrice(type, name, linenum){
	/*  On field changed:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  FIELD CHANGED CODE BODY
	
	if (type == 'item' && name == 'custcol_overwrite_transfer_price') {
			var Status = nlapiGetFieldValue('orderstatus');
		if (Status == 'A' || Status == 'B') {
			var Overwrite = nlapiGetCurrentLineItemValue('item', 'custcol_overwrite_transfer_price');
			
			if (Overwrite == 'T') {
				nlapiDisableLineItemField('item', 'rate', false);
				nlapiDisableLineItemField('item','amount',false);
			}
			else {
				nlapiDisableLineItemField('item', 'rate', true);
				nlapiDisableLineItemField('item','amount',true);
			}
		}
	}
}

// END FIELD CHANGED ================================================





// BEGIN POST SOURCING ==============================================

function postSourcing_setTransferPrice(type, name) {

    /*  On post sourcing:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--			--ID--		--Line Item Name--
	 */
    //  LOCAL VARIABLES


    //  POST SOURCING CODE BODY

   /*
 if (type == 'item' && name == 'item')
    {
        if (RecType == 'create' || RecType == 'copy') {
            var item = nlapiGetCurrentLineItemValue('item', 'item');

            var location = nlapiGetFieldValue('location');

            if (location != null && location != '' && location != undefined) {
                if (item != null && item != '' && item != undefined) {
                    var OverWritePrice = nlapiGetCurrentLineItemValue('item', 'custcol_overwrite_transfer_price');

                    if (OverWritePrice != 'T') {


                        var UseItemCost = nlapiGetFieldValue('useitemcostastransfercost');
                       

                        if (UseItemCost != 'T') {
                            var filter = new Array();
                            var column = new Array();

                            filter.push(new nlobjSearchFilter('inventorylocation', null, 'anyOf', location));
                            filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', item));

                            column[0] = new nlobjSearchColumn('internalid');
                            column[1] = new nlobjSearchColumn('locationaveragecost');

                            var Se_LocationPriceResult = nlapiSearchRecord('item', null, filter, column);

                            if (Se_LocationPriceResult != null && Se_LocationPriceResult != '' && Se_LocationPriceResult != undefined) {
                                var LocationAverageCost = Se_LocationPriceResult[0].getValue('locationaveragecost');
//                              alert('LocationAverageCost' + LocationAverageCost);
                                if (LocationAverageCost != null && LocationAverageCost != '' && LocationAverageCost != undefined) {
                                    nlapiSetCurrentLineItemValue('item', 'rate', LocationAverageCost, true, true);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
*/
}

// END POST SOURCING ================================================



// BEGIN LINE INIT ==============================================

function lineInit_setDisabled(type){

	/*  On Line Init:
	 - PURPOSE
	 FIELDS USED:
	 --Field Name--			--ID--		--Line Item Name--
	 */
	//  LOCAL VARIABLES
	
	
	//  LINE INIT CODE BODY
	
	nlapiDisableLineItemField('item', 'rate', true);
	nlapiDisableLineItemField('item','amount',true);
	
	var Status = nlapiGetFieldValue('orderstatus');
	if (Status == 'A' || Status == 'B') {
		var Overwrite = nlapiGetCurrentLineItemValue('item', 'custcol_overwrite_transfer_price');
		
		if (Overwrite == 'T') {
			nlapiDisableLineItemField('item', 'rate', false);
			nlapiDisableLineItemField('item','amount',false);
		}
		else {
			nlapiDisableLineItemField('item', 'rate', true);
			nlapiDisableLineItemField('item','amount',true);
		}
	}
	
}

// END LINE INIT ================================================


// BEGIN VALIDATE LINE ==============================================

function validateLine_setTransferPrice(type){

	/*  On validate line:
	 - EXPLAIN THE PURPOSE OF THIS FUNCTION
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  VALIDATE LINE CODE BODY
	
	if (type == 'item') {
		var Status = nlapiGetFieldValue('orderstatus');
		
		if (Status == 'A' || Status == 'B') {
			var item = nlapiGetCurrentLineItemValue('item', 'item');
			
			var location = nlapiGetFieldValue('location');
			
			if (location != null && location != '' && location != undefined) {
				if (item != null && item != '' && item != undefined) {
					var OverWritePrice = nlapiGetCurrentLineItemValue('item', 'custcol_overwrite_transfer_price');
					
					if (OverWritePrice != 'T') {
						var UseItemCost = nlapiGetFieldValue('useitemcostastransfercost');
						
						if (UseItemCost != 'T') {
							var FieldObj = ['isserialitem', 'costingmethod'];
							
							var ItemObj = nlapiLookupField('item', item, FieldObj);
							
							//alert(ItemObj.costingmethod);
							
							if (ItemObj.isserialitem == 'T' && (ItemObj.costingmethod == 'Specific' || ItemObj.costingmethod == 'FIFO' || ItemObj.costingmethod == 'LIFO')) {
							
								var SubRecordObj = nlapiViewCurrentLineItemSubrecord('item', 'inventorydetail');
								
								if (SubRecordObj != null && SubRecordObj != '' && SubRecordObj != undefined) {
								
									var TotalSerailQty = 0;
									var TotalCost = 0;
									var A_InvNumbers = new Array();
									
									var lineCount = SubRecordObj.getLineItemCount('inventoryassignment');
									//alert('lineCount' + lineCount)
									
									for (var i = 1; i <= lineCount; i++) {
									
										SubRecordObj.selectLineItem('inventoryassignment', i);
										var InvetoryNumber = SubRecordObj.getCurrentLineItemValue('inventoryassignment', 'issueinventorynumber');
										var Quantity = SubRecordObj.getCurrentLineItemValue('inventoryassignment', 'quantity');
										
										TotalSerailQty = parseFloat(TotalSerailQty) + parseFloat(Quantity)
										
										//alert(InvetoryNumber)
										A_InvNumbers.push(InvetoryNumber);
									}
									
									if (lineCount > 0) {
										var item_filters = new Array();
										item_filters.push(new nlobjSearchFilter('internalid', null, 'anyOf', item));
										item_filters.push(new nlobjSearchFilter('internalid', 'inventorynumber', 'anyOf', A_InvNumbers));
										
										var item_search = nlapiLoadSearch('item', 'customsearch_specific_serail_cost');
										
										if (item_search != null && item_search != '' && item_search != undefined) {
											item_search.addFilters(item_filters);
											
											var resultset = item_search.runSearch();
											var searchid = 0;
											var j = 0;
											
											do {
												var mapping_search = resultset.getResults(searchid, searchid + 1000);
												
												if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
													for (var rs in mapping_search) {
														var result = mapping_search[rs];
														var columns = result.getAllColumns();
														var columnLen = columns.length;
														
														var SerialNumber = '';
														var Cost = '';
														
														for (var i = 0; i < columnLen; i++) {
															var column = columns[i];
															var LabelName = column.getLabel();
															var fieldName = column.getName();
															var value = result.getValue(column);
															//var text = result.getText(column);
															
															if (fieldName == 'inventorynumber') {
																SerialNumber = value
															}
															if (fieldName == 'serialnumbercost') {
																Cost = value;
															}
														}
														//alert(Cost);
														TotalCost = parseFloat(TotalCost) + parseFloat(Cost);
														searchid++;
													}
												}
											}
											while (mapping_search.length >= 1000);
										}
										
										//alert('TotalCost' + TotalCost)
										//alert('TotalSerailQty' + TotalSerailQty)
										
										var FinalCost = parseFloat(TotalCost) / parseFloat(TotalSerailQty);
										
										nlapiSetCurrentLineItemValue('item', 'rate', FinalCost, true, true);
									}
								}
							}
							else {
								var filter = new Array();
								var column = new Array();
								
								filter.push(new nlobjSearchFilter('inventorylocation', null, 'anyOf', location));
								filter.push(new nlobjSearchFilter('internalid', null, 'anyOf', item));
								
								column[0] = new nlobjSearchColumn('internalid');
								column[1] = new nlobjSearchColumn('locationaveragecost');
								
								var Se_LocationPriceResult = nlapiSearchRecord('item', null, filter, column);
								
								if (Se_LocationPriceResult != null && Se_LocationPriceResult != '' && Se_LocationPriceResult != undefined) {
									var LocationAverageCost = Se_LocationPriceResult[0].getValue('locationaveragecost');
									//                             alert('LocationAverageCost' + LocationAverageCost);
									if (LocationAverageCost != null && LocationAverageCost != '' && LocationAverageCost != undefined) {
										nlapiSetCurrentLineItemValue('item', 'rate', LocationAverageCost, true, true);
									}
								}
							}
						}
					}
				}
			}
		}
	}
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
