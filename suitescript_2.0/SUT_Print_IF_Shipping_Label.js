/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record','N/search','N/runtime','N/xml','N/file','N/render'],
    function(record, search, runtime, NSXML, NSFile, render)
	{
		function onRequestShipandprintlabel(context)
		{
			try {
				var RequestrecId = context.request.parameters.shiprequestid;
				log.debug('RequestrecId', RequestrecId)
				
				var ItemFulfillobj = record.load({
					type: 'itemfulfillment',
					id: RequestrecId,
					isDynamic: true
				});
				
				var ShipStatus = ItemFulfillobj.getValue('shipstatus');
				var createdfrom = ItemFulfillobj.getValue('createdfrom');
				
				
				
				var fieldLookUp = search.lookupFields({
					type: search.Type.SALES_ORDER,
					id: createdfrom,
					columns: ['custbody_shipping_label']
				});
				
				var ShippingLabel = '';
				
				var ShippingLabelOBj = fieldLookUp.custbody_shipping_label;
				if (ShippingLabelOBj != null && ShippingLabelOBj != '' && ShippingLabelOBj != undefined) {
					if (ShippingLabelOBj.length > 0) {
						ShippingLabel = fieldLookUp.custbody_shipping_label[0].value;
					}
				}
				
				if (ShipStatus != 'C') 
				{
					ItemFulfillobj.setValue('shipstatus', 'C')
					
					var FulfillrecordId = ItemFulfillobj.save({
						enableSourcing: true,
						ignoreMandatoryFields: true
					});
				}
				
				log.debug("ShippingLabel" + ShippingLabel);
				
				var pdfFile = '';
				
				if (ShippingLabel != null && ShippingLabel != '' && ShippingLabel != undefined) {
				
					var FileObj = NSFile.load({
						id: ShippingLabel
					});
					//var FileData = FileObj.getContents();
					//var pdfFile = FileObj.renderAsPdf();
					
					context.response.writeFile(FileObj, true);
				}
				else {
					context.response.write("No Shippig Label Attached to Sales Order");
				}
			} 
			catch (error) {
				log.debug('error', error);
				context.response.write("Error :- " + error.message);
			}
		}
		return {
			onRequest: onRequestShipandprintlabel
		};
	});