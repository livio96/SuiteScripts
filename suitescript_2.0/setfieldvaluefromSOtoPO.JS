/**
 * Module Description
 *
 * Version    Date            Author           Remarks
 * 1.00       22 Jun 2019     Pradeep
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment.
 * @appliedtorecord recordType
 *
 * @param {String} type Operation types: create, edit, delete, xedit
 *                      approve, reject, cancel (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF)
 *                      markcomplete (Call, Task)
 *                      reassign (Case)
 *                      editforecast (Opp, Estimate)
 * @returns {Void}
 */
function userEventAfterSubmit(type)
{
	try
	{
		nlapiLogExecution("DEBUG", "type", type);
		if(type == "specialorder")
		{
			var soId = nlapiGetFieldValue("createdfrom");
			nlapiLogExecution("DEBUG", "soId", soId);
			if(soId)
			{
				var salesOrder = nlapiLoadRecord("salesorder", soId);
				var shipToAddr = salesOrder.getFieldValue("shipaddress");
				var purchaseOrder = nlapiLoadRecord(nlapiGetRecordType(), nlapiGetRecordId());
				purchaseOrder.setFieldValue("shipaddress", shipToAddr);
				//nlapiSubmitField("purchaseorder", nlapiGetRecordId(), "shipaddress", shipToAddr, false);
				nlapiSubmitRecord(purchaseOrder, false, true);
				//nlapiSetFieldValue("shipaddress", shipToAddr, false, true);
			}
		}
	}
	catch(ex)
	{
		nlapiLogExecution("DEBUG", "Exception", ex);
	}
}
