/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/currentRecord','N/https','N/url','N/runtime'],
    function(error, curRec, https, url, runtime){
		function saveRecord_UpdateTotal(context){
			UpdateHeaderTotal(context);
			return true;
		}
		function fieldChanged_setPOAmount(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if ((sublistName == 'item' && (FieldName == 'custcol_associated_cost' || FieldName == 'quantity'))) {
				var Unitcost = currentRecord.getCurrentSublistValue({
					sublistId: sublistName,
					fieldId: 'custcol_associated_cost'
				});
				
				if (Unitcost != null && Unitcost != '' && Unitcost != undefined) {
					var quantity = currentRecord.getCurrentSublistValue({
						sublistId: sublistName,
						fieldId: 'quantity'
					});
					
					if (quantity != null && quantity != '' && quantity != undefined) {
						var Amount = (parseFloat(Unitcost) * parseFloat(quantity));
						Amount = parseFloat(Amount).toFixed(2);
						
						currentRecord.setCurrentSublistValue({
							sublistId: sublistName,
							fieldId: 'custcol_po_amount',
							value: Amount
						});
					}
				}
			}
		}
		function sublistChanged_CalculateHeader(context){
			UpdateHeaderTotal(context);
		}
		
		function validateLine_setPOAmount(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			if (sublistName == 'item') {
				var Unitcost = currentRecord.getCurrentSublistValue({
					sublistId: sublistName,
					fieldId: 'custcol_associated_cost'
				});
				
				if (Unitcost != null && Unitcost != '' && Unitcost != undefined) {
					var quantity = currentRecord.getCurrentSublistValue({
						sublistId: sublistName,
						fieldId: 'quantity'
					});
					
					if (quantity != null && quantity != '' && quantity != undefined) {
						var Amount = (parseFloat(Unitcost) * parseFloat(quantity));
						Amount = parseFloat(Amount).toFixed(2);
						
						currentRecord.setCurrentSublistValue({
							sublistId: sublistName,
							fieldId: 'custcol_po_amount',
							value: Amount
						});
					}
				}
				else {
					currentRecord.setCurrentSublistValue({
						sublistId: sublistName,
						fieldId: 'custcol_po_amount',
						value: 0
					});
				}
			}
			return true;
		}
		function printrtvtransaction(scriptContext){
			try {
				var cur_record = curRec.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_print_rtv",
					deploymentId: "customdeploy1",
				});
				
				//var userId = runtime.getCurrentUser().id;
				//alert(get_url)
				get_url += ('&rtvid=' + cur_record);
				//get_url += ('&userid=' + userId);
				
				window.open(get_url, "_blank")
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		return {
			fieldChanged: fieldChanged_setPOAmount,
			validateLine: validateLine_setPOAmount,
			saveRecord: saveRecord_UpdateTotal,
			sublistChanged: sublistChanged_CalculateHeader,
			printrtvtransaction: printrtvtransaction
		};
	});
	
		function UpdateHeaderTotal(context){
			var currentRecord = context.currentRecord;
			
			var TotalAmount = 0;
			
			var i_LineCount = currentRecord.getLineCount({
				sublistId: 'item'
			})
			
			for (var i = 0; i < i_LineCount; i++) {
				var Item = currentRecord.getSublistValue({
					sublistId: 'item',
					fieldId: 'item',
					line: i
				});
				
				if (Item != null && Item != '' && Item != undefined) {
				
					var POAmount = currentRecord.getSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_po_amount',
						line: i
					});
					
					
					if (POAmount != null && POAmount != '' && POAmount != undefined) {
						TotalAmount = (parseFloat(TotalAmount) + parseFloat(POAmount));
					}
				}
			}
			
			currentRecord.setValue({
				fieldId: 'custbody_rtv_po_amount',
				value: TotalAmount
			});
			
		}
		
		
