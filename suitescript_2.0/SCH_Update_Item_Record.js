// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
/*
   	Script Name:SCH_Update_Item_Record.js
	Author:
	Company:
	Date:
	Details: update item record


	Script Modification Log:

	-- Date --			-- Modified By --				--Requested By--				-- Description --
    4/6/2021            Frank Baert                     Frank Baert                     Added Forecasting Custom Record ID to update record along with others every 2 hours

Below is a summary of the process controls enforced by this script file.  The control logic is described
more fully, below, in the appropriate function headers and code blocks.

     SCHEDULED FUNCTION
		- scheduledFunction(type)

     SUB-FUNCTIONS
		- The following sub-functions are called by the above core functions in order to maintain code
            modularization:

               - NOT USED
*/
}
// END SCRIPT DESCRIPTION BLOCK  ====================================


// BEGIN SCHEDULED FUNCTION =============================================

function schedulerFunction_UpdateItem(type){
	/*  On scheduled function:
	 - PURPOSE
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	//  SCHEDULED FUNCTION CODE BODY
	
	try {
		var i_context = nlapiGetContext();
		
		var invent_searchResult = nlapiLoadSearch('item', 'customsearch380161');
		
		if (invent_searchResult != null && invent_searchResult != '' && invent_searchResult != undefined) {
			var resultset = invent_searchResult.runSearch();
			var searchid = 0;
			
			var j = 0;
			
			do {
				var mapping_search = resultset.getResults(searchid, searchid + 1000);
				
				if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
					for (var rs in mapping_search) {
						try {
						
							var usageRemaining = i_context.getRemainingUsage();
							
							if (usageRemaining <= 500) {
								nlapiLogExecution('DEBUG', 'schedulerFunction', ' do loop usageRemaining<= 200 =>' + usageRemaining);
								nlapiYieldScript(); // Rescheduling script if script limit exceeds
							}
							
							var result = mapping_search[rs];
							var columns = result.getAllColumns();
							var columnLen = columns.length;
							
							var internalId = '';
							var Type = '';
							var CurrentDate = '';
							var SalesID = '';
							var PricingID = '';
                          	var ForecastID = '';
							
							
							for (var i = 0; i < columnLen; i++) {
								var column = columns[i];
								var fieldName = column.getName();
								var fieldLabel = column.getLabel();
								var value = result.getValue(column);
								
								if (fieldLabel == 'ITEM ID') {
									internalId = value;
								}
								if (fieldLabel == 'SALES ID') {
									SalesID = value;
								}
								if (fieldLabel == 'PRICING ID') {
									PricingID = value;
								}
                                if (fieldLabel == 'FORECAST ID'){
                                    ForecastID = value;
                                }
								if (fieldName == 'type') {
									Type = value;
								}
								if (fieldLabel == 'CurrentDateTime') {
									CurrentDate = value;
								}
                                
							}
							
							var Datetime = nlapiStringToDate(CurrentDate);
							
							var finaldate = nlapiDateToString(Datetime, 'datetimetz');
							//nlapiLogExecution('DEBUG', 'SCH Set Transactions', 'finaldate-->' + finaldate);
							
							searchid++;
							
							var itemRecType = getItemRecType(Type);
							
							var o_recObj = nlapiLoadRecord(itemRecType, internalId);
							
							o_recObj.setDateTimeValue('custitem_scheduled_update', finaldate);
							
							var UpdatedID = nlapiSubmitRecord(o_recObj, {
								enablesourcing: true,
								ignoremandatoryfields: true
							});
							
							//disabletriggers: true,
							nlapiLogExecution('DEBUG', 'SCH Set Transactions', 'UpdatedID-->' + UpdatedID);
							
							if (PricingID != null && PricingID != '' && PricingID != undefined) {
								try {
								
									var o_PricerecObj = nlapiLoadRecord('customrecord_pricing_information', PricingID);
									
									o_PricerecObj.setDateTimeValue('custrecord_last_updated', finaldate);
									
									var UpdatedPriceID = nlapiSubmitRecord(o_PricerecObj, {
										enablesourcing: true,
										ignoremandatoryfields: true
									});
									
									//disabletriggers: true,
									nlapiLogExecution('DEBUG', 'SCH Set Transactions', 'UpdatedPriceID-->' + UpdatedPriceID);
								} 
								catch (exception) {
									nlapiLogExecution('DEBUG', 'Update Pricing', 'exception-->' + exception);
								}
							}
							if (SalesID != null && SalesID != '' && SalesID != undefined) {
								try {
								
									var o_SalesrecObj = nlapiLoadRecord('customrecord_previous_sales_summary', SalesID);
									
									o_SalesrecObj.setDateTimeValue('custrecord_ps_last_updated', finaldate);
									
									var UpdatedSalesID = nlapiSubmitRecord(o_SalesrecObj, {
										enablesourcing: true,
										ignoremandatoryfields: true
									});
									
									//disabletriggers: true,
									nlapiLogExecution('DEBUG', 'SCH Set Transactions', 'UpdatedSalesID-->' + UpdatedSalesID);
								} 
								catch (exception) {
									nlapiLogExecution('DEBUG', 'update sales', 'exception-->' + exception);
								}
							}
							if (ForecastID != null && ForecastID != '' && ForecastID != undefined) {
								try {
								
									var o_SalesrecObj = nlapiLoadRecord('customrecord_ros', ForecastID);
									
									o_SalesrecObj.setDateTimeValue('custrecord97', finaldate);
									
									var UpdatedForecastID = nlapiSubmitRecord(o_SalesrecObj, {
										enablesourcing: true,
										ignoremandatoryfields: true
									});
									
									//disabletriggers: true,
									nlapiLogExecution('DEBUG', 'SCH Set Transactions', 'UpdatedForecastID-->' + UpdatedForecastID);
								} 
								catch (exception) {
									nlapiLogExecution('DEBUG', 'update forecast', 'exception-->' + exception);
								}
							}
						} 
						catch (exception) {
							nlapiLogExecution('DEBUG', 'set OPL', 'exception-->' + exception);
						}
					}
				}
			}
			while (mapping_search.length >= 1000);
		}
	} 
	catch (exception) {
		nlapiLogExecution('DEBUG', 'set OPL', 'exception-->' + exception);
	}
}

function getItemRecType(typeName)
{
	var recordType = "";

	switch (typeName) {   // Compare item type to its record type counterpart
	case 'InvtPart':
		recordType = 'inventoryitem';
		break;
	case 'Kit':
		recordType = 'kititem';
		break;
	case 'NonInvtPart':
		recordType = 'noninventoryitem';
		break;
	case 'Service':
		recordType = 'serviceitem';
		break;
	case 'Assembly':
		recordType = 'assemblyitem';
		break;
	case 'GiftCert':
		recordType = 'giftcertificateitem';
		break;
	case 'Description':
		recordType = 'descriptionitem';
			//need to add Description type!!
	default:
	}

	return recordType;
}

// END SCHEDULED FUNCTION ===============================================


