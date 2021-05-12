/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/https','N/url', 'N/search'],
    function(error, https, url, search){
		function saveRecord_SETLP(context){
			var currentRecord = context.currentRecord;
			
			var LicensePlateList = new Array();
			
			var LicensePlate = currentRecord.getValue({
				fieldId: 'custpage_licenseplate'
			});
			
			var LineQty = currentRecord.getValue({
				fieldId: 'custpage_quantity'
			});
			
			
			LicensePlateList = String(LicensePlate).split(",");
			
			var LP = '';
			
			for (i = 0; i < LicensePlateList.length; i++) {
				if (LP != null && LP != '' && LP != undefined) {
					LP = LP + "#" + LicensePlateList[i];
				}
				else {
					LP = LicensePlateList[i];
				}
			}
			
			currentRecord.setValue('custpage_lp', LP)
			
			var LicensePlateText = currentRecord.getText({
				fieldId: 'custpage_licenseplate'
			});
			
			LicensePlateListText = String(LicensePlateText).split(",");
			
			var LPText = '';
			
			for (i = 0; i < LicensePlateListText.length; i++) {
				if (LPText != null && LPText != '' && LPText != undefined) {
					LPText = LPText + "#" + LicensePlateListText[i];
				}
				else {
					LPText = LicensePlateListText[i];
				}
			}
			
			currentRecord.setValue('custpage_lptext', LPText)
			
			if (LicensePlate != null && LicensePlate != '' && LicensePlate != undefined) {
				var LPSearch = search.create({
					type: "customrecord_rfs_lp_line",
					filters: [["internalid", "anyOf", LicensePlateList]],
					columns: [search.createColumn({
						name: "custrecord_rfs_lp_line_quantity",
						summary: "SUM",
						label: "Quantity"
					})]
				}).run().getRange(0, 1000);
				
				if (LPSearch != null && LPSearch != '' && LPSearch != undefined) {
					var internalid = "";
					var name = "";
					var TotalLPQuantity = LPSearch[0].getValue({
						name: "custrecord_rfs_lp_line_quantity",
						summary: "SUM",
						label: "Quantity"
					})
					
					if (parseFloat(LineQty) < parseFloat(TotalLPQuantity)) {
						alert('License Plate Quantity '+TotalLPQuantity+' cannot be greater than Sales Order Quantity '+LineQty );
						return false;
					}
				}
			}
			
			return true;
		}
		return {
			saveRecord: saveRecord_SETLP,
		}
	});