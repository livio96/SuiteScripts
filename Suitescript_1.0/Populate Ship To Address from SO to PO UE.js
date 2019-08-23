
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
