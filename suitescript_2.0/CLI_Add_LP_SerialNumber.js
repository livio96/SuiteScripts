/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/https','N/url'],
    function(error, https, url)
	{
		function fieldChanged_SetLP(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if ((sublistName == 'item') && (FieldName == 'custcol_add_license_plate')) {
			
				var MainLocation = currentRecord.getValue('location');
				
				var Item = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'item'
				});
				
				var Quantity = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'quantity'
				});
				
				var Location = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'location'
				});
				
				if (Location != null && Location != '' && Location != undefined) {
				
				}
				else {
					Location = MainLocation
				}
				
				var Suturl = url.resolveScript({
					scriptId: "customscript_sut_license_plate_form",
					deploymentId: "customdeploy1",
				});
				
				var URLWithParam = Suturl + '&itemid=' + Item + '&quantity=' + Quantity + '&location=' + Location;
				
				popupCenter(URLWithParam, 'Window',450, 450);
				
			}
			if ((sublistName == 'item') && (FieldName == 'quantity')) {
			
				var Quantity = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'quantity'
				});
				
				var ValidateLP = currentRecord.getCurrentSublistValue({
					sublistId: 'item',
					fieldId: 'custcol_validate_lp'
				});
				
				if (ValidateLP == true) {
					alert('Please Re-Enter the License Plate Details,if required');
					
					currentRecord.setCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_validate_lp',
						value: false
					});
					
					currentRecord.setCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_license_plate_text',
						value: ''
					});
					
					currentRecord.setCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_license_plate_ids',
						value: ''
					});
					
				}
			}
		}
		function UpdateSalesorderLicensePlate(LicensePlate)
		{
			alert('so');
			alert(LicensePlate)
			var currentRecord = context.currentRecord;
			currentRecord.setCurrentSublistValue({
				sublistId: 'item',
				fieldId: 'custcol_license_plate_ids',
				value: LicensePlate
			});
			
		}
		function popupCenter(url, title, w, h){
			var left = (screen.width / 2) - (w / 2);
			var top = (screen.height / 2) - (h / 2);
			
			return window.open(url, title, 'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);
		}
		return {
			fieldChanged: fieldChanged_SetLP,
			UpdateSalesorderLicensePlate: UpdateSalesorderLicensePlate
		}
	});