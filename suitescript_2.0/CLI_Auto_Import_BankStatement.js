/****************************************************************************************
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope public
 *
 ****************************************************************************************/
define(['N/currentRecord','N/record','N/search','N/url','N/https','N/runtime','N/format'],
    function(currentRecord, record, search, url, https, runtime, format){
		function pageInit_emptyapprove(context){
		
		}
		function saveRecord_ValidateDuplicate(context){
		
			var currentRecord = context.currentRecord;
			
			var FromDate = currentRecord.getValue({
				fieldId: 'custpage_importfromdate'
			});
			var ToDate = currentRecord.getValue({
				fieldId: 'custpage_importtodate'
			});
			
			if (FromDate != null && FromDate != '' && FromDate != undefined) {
			
			}
			else {
				alert('Enter From Date');
				return false;
			}
			if (ToDate != null && ToDate != '' && ToDate != undefined) {
			
			}
			else {
				alert('Enter To Date');
				return false;
			}
			
			var FromDate = format.format({
				value: FromDate,
				type: format.Type.DATE
			});
			var ToDate = format.format({
				value: ToDate,
				type: format.Type.DATE
			});
			
			var ItemSearchRes = search.create({
				type: 'customrecord_nbsabr_bankstatementline',
				filters: [["custrecord_bsl_date", "before", ToDate], "AND", ["custrecord_bsl_date", "onorAfter", FromDate], "AND", ["custrecord_bsl_reconaccount", "anyOf", '11']],
				columns: [search.createColumn({
					name: 'custrecord_bsl_date'
				}), search.createColumn({
					name: 'custrecord_bsl_reconaccount'
				})]
			}).run().getRange(0, 1000);
			
			if (ItemSearchRes != null && ItemSearchRes != '' && ItemSearchRes != undefined) {
				var STDate = ItemSearchRes[0].getValue({
					name: 'custrecord_bsl_date',
				});
				
				alert('Bank statement data already exist for ' + STDate)
				
				return false;
			}
			
			return true;
		}
		function searchbankstatementdata(context){
			try {
				//var transaction = currentRecord.get();
				
				var FromDate = currentRecord.get().getValue('custpage_importfromdate');
				var ToDate = currentRecord.get().getValue('custpage_importtodate');
				
				var FromDate = format.format({
					value: FromDate,
					type: format.Type.DATE
				});
				var ToDate = format.format({
					value: ToDate,
					type: format.Type.DATE
				});
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_auto_import_bank_stat",
					deploymentId: "customdeploy1",
				});
				
				get_url += ('&custpage_importfromdate=' + FromDate);
				get_url += ('&custpage_importtodate=' + ToDate);
				
				
				if (window.onbeforeunload) {
					window.onbeforeunload = function(){
						null;
					};
				}
				window.location.href = get_url;
			} 
			catch (e) {
				alert(e.message);
			}
		}
		function backToSuitelet(context){
			try {
				//var transaction = currentRecord.get();
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_auto_import_bank_stat",
					deploymentId: "customdeploy1",
				});
				
				if (window.onbeforeunload) {
					window.onbeforeunload = function(){
						null;
					};
				}
				window.location.href = get_url;
			} 
			catch (e) {
				alert(e.message);
			}
		}
		return {
			pageInit: pageInit_emptyapprove,
			saveRecord: saveRecord_ValidateDuplicate,
			searchbankstatementdata: searchbankstatementdata,
			backToSuitelet: backToSuitelet
		};
	});
	
