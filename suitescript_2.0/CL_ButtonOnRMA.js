/**
 *@NApiVersion 2.x
 */
/*
** Description: This script is used to validate the RMA onclick on Return To Vendor Custom Button
** @libraries used:
** @client: 
** @author: 
** @dated:  
** @version: 2.0
** @type: ClientScript(saveRecord)
/******************************************************************************************/
define(['N/currentRecord','N/url','N/record'],
function(currentRecord, urlMod, record) 
{
	function returnToVendor()
	{
		try
		{
			var rec = currentRecord.get();
			
			var rmaRec = record.load({ type: rec.type, id: rec.id});
			var vendor = rmaRec.getValue({ fieldId: 'custbody_vendor_for_rtv'});
			var rtv_action = rmaRec.getValue({ fieldId: 'custbody_rtv_action'});
			var recId = rec.id;
			//alert(vendor);
			
			if(vendor)
			{
				//if(rtv_action)
				{
					var url = urlMod.resolveScript({ scriptId: 'customscript_sl_create_rtv', 
													deploymentId: 'customdeploy_sl_create_rtv', 
													returnExternalUrl: false, 
													params : { rma_id : recId }});
													
					window.open(url, '_blank');
				}
			}
			else
			{
				alert("Please select Vendor to create RTV");
			}
			return true;
		}
		catch(e)
		{
			alert(e.toString());
		}
	}
	return {
		returnToVendor : returnToVendor,
	};
});