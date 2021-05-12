/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/record', 'N/runtime','N/search','N/redirect'],
    function(ui, record, runtime, search, redirect)
	{
		function onRequestLicensePlate(context)
		{
			try 
			{
				if (context.request.method === 'GET') 
				{
					//creates suitelet user interface
					createInterface(ui, context, search);
				}
				else 
				{
					//creates customer payment when submitted
					try {
						AddLicensePlateToOrder(context, record, search, redirect);
					} 
					catch (e) {
						log.error('onRequest', 'error adding license plate to order - ' + e.message);
					}
				}
			} 
			catch (e) {
				log.error('onRequest', e.message);
			}
		}
		return {
			onRequest: onRequestLicensePlate
		};
	});
  /*************************
   Create Interface
  **************************/

function createInterface(ui, context, search){
	var form = ui.createForm({
		title: 'License Plate'
	});
	
	form.clientScriptModulePath = './CLI_LicensePlate_Form.js';
	//Getting parameter values
	var ItemID = context.request.parameters.itemid;
	var Quantity = context.request.parameters.quantity;
	var Location = context.request.parameters.location;
	
	var LocationBodyField = form.addField({
		id: 'custpage_location',
		label: 'Location',
		type: ui.FieldType.SELECT,
		source: 'location',
	}).updateDisplayType({
		displayType: ui.FieldDisplayType.HIDDEN
	});
	
	var LicensePlateField = form.addField({
		id: 'custpage_licenseplate',
		label: 'License Plate',
		type: ui.FieldType.MULTISELECT,
	});
	
	LicensePlateField.addSelectOption({
		value: '',
		text: ''
	});
	
	var ItemBodyField = form.addField({
		id: 'custpage_item',
		label: 'Item',
		type: ui.FieldType.SELECT,
		source: 'item',
	}).updateDisplayType({
		displayType: ui.FieldDisplayType.HIDDEN
	});
	
	var QuantityField = form.addField({
		id: 'custpage_quantity',
		label: 'Quantity',
		type: ui.FieldType.TEXT,
	}).updateDisplayType({
		displayType: ui.FieldDisplayType.HIDDEN
	});
	
	var LPListField = form.addField({
		id: 'custpage_lp',
		label: 'LP',
		type: ui.FieldType.TEXT,
	}).updateDisplayType({
		displayType: ui.FieldDisplayType.HIDDEN
	});
	
	var LPListTextField = form.addField({
		id: 'custpage_lptext',
		label: 'LP',
		type: ui.FieldType.TEXT,
	}).updateDisplayType({
		displayType: ui.FieldDisplayType.HIDDEN
	});
	
	
	LocationBodyField.defaultValue = Location;
	ItemBodyField.defaultValue = ItemID;
	QuantityField.defaultValue = Quantity;
	
	
	
	populateItemLicensePlate(search, LicensePlateField, ItemID, Location)
	form.addSubmitButton({
		label: 'Submit'
	});
	context.response.writePage(form);
}
    function AddLicensePlateToOrder(context, record, search, redirect){
		var LicensePlate = context.request.parameters.custpage_lp;
		log.debug('response', 'LicensePlate' + LicensePlate);
		
		var LicensePlateText = context.request.parameters.custpage_lptext;
		log.debug('response', 'LicensePlateText' + LicensePlateText);
		
		if (LicensePlate != null && LicensePlate != '' && LicensePlate != undefined) {
			context.response.write('<html><head><script>window.opener.nlapiSetCurrentLineItemValue("item","custcol_license_plate_ids","' + LicensePlate + '");window.opener.nlapiSetCurrentLineItemValue("item","custcol_license_plate_text","' + LicensePlateText + '");window.opener.nlapiSetCurrentLineItemValue("item","custcol_validate_lp","T");self.close();</script></head><body></body></html>');
		}
		else {
			context.response.write('<html><head><script>window.opener.nlapiSetCurrentLineItemValue("item","custcol_license_plate_ids","' + LicensePlate + '");window.opener.nlapiSetCurrentLineItemValue("item","custcol_license_plate_text","' + LicensePlateText + '");window.opener.nlapiSetCurrentLineItemValue("item","custcol_validate_lp","F");self.close();</script></head><body></body></html>');
		}
	}
function populateItemLicensePlate(search, LicensePlateField, ItemID, Location){
	if (ItemID != null && ItemID != undefined && ItemID != '') {
		var LPSearch = search.create({
			type: "customrecord_rfs_lp_line",
			filters: [["custrecord_rfs_lp_line_item", "anyOf", ItemID], "AND", ["custrecord_rfs_lp_line_parent.custrecord_rfs_lp_header_location", "anyOf", Location], "AND", ["custrecord_rfs_lp_line_parent.custrecord_rfs_lp_header_status", "anyOf",2]],
			columns: [search.createColumn({
				name: "internalid",
				label: "Internal ID"
			}), search.createColumn({
				name: "custrecord_rfs_lp_line_parent",
				label: "Name"
			})]
		});
		
		LPSearch.run().each(function(result){
			var internalid = "";
			var name = "";
			internalid = result.getValue({
				name: "internalid",
				label: "Internal ID"
			})
			
			name = result.getText({
				name: "custrecord_rfs_lp_line_parent",
				label: "Name"
			});
			
			LicensePlateField.addSelectOption({
				value: internalid,
				text: name
			});
			return true;
		});
	} // end for (var y = 0; y < a_subisidiary.length; y++) 	
}
		
		
	
	
