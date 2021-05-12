/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/currentRecord','N/https','N/url','N/runtime'],

    function(record, currentRecord, https, url, runtime){
		function pageInit_emptyapprove(context){
		}
		function submitfinaltestingrecord(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_create_st_adjustment",
					deploymentId: "customdeploy1",
				});
				
				var userId = runtime.getCurrentUser().id;
				//alert(get_url)
				get_url += ('&strequestid=' + cur_record);
				get_url += ('&userid=' + userId);
				
				var response = https.request({
					method: https.Method.POST,
					url: get_url
				});
				
				alert(response.body)
				window.location.reload();
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		function submitfinaltestingline(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_create_st_adjustment",
					deploymentId: "customdeploy1",
				});
				
				
				var SMT_Obj = record.load({
					type: 'customrecord_smt_sn',
					id: cur_record,
					isDynamic: true
				});
				
				var STID = SMT_Obj.getValue('custrecord_smt_sn_smart_testing')
				
				var userId = runtime.getCurrentUser().id;
				//alert(get_url)
				get_url += ('&strequestid=' + STID);
				get_url += ('&stlinerequestid=' + cur_record);
				get_url += ('&userid=' + userId);
				
				var response = https.request({
					method: https.Method.POST,
					url: get_url
				});
				
				alert(response.body)
				window.location.reload();
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		function printfinaltestedrecord(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_print_smt_label",
					deploymentId: "customdeploy1",
				});
				
				var userId = runtime.getCurrentUser().id;
				//	alert(get_url)
				get_url += ('&Rid=' + cur_record);
				
				window.open(get_url, "_blank")
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		function markalltestingrec(scriptContext){
		
			var i_LineCount = currentRecord.get().getLineCount({
				sublistId: 'recmachcustrecord_smt_sn_smart_testing'
			})
			
			for (var i = 0; i < i_LineCount; i++) {
			
			
				currentRecord.get().selectLine({
					sublistId: 'recmachcustrecord_smt_sn_smart_testing',
					line: i
				});
				
				var Processed = currentRecord.get().getCurrentSublistValue({
					sublistId: 'recmachcustrecord_smt_sn_smart_testing',
					fieldId: 'custrecord_smt_sn_processed',
				});
				
				if (Processed != true) {
					currentRecord.get().setCurrentSublistValue({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						fieldId: 'custrecord_smt_sn_apply',
						value: true
					});
					
					
					currentRecord.get().commitLine({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing'
					});
				}
				
			}
			
		}
		function unmarkalltestingrec(scriptContext){
			try {
			
				var i_LineCount = currentRecord.get().getLineCount({
					sublistId: 'recmachcustrecord_smt_sn_smart_testing'
				})
				for (var i = 0; i < i_LineCount; i++) {
				
				
					currentRecord.get().selectLine({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						line: i
					});
					
					var Processed = currentRecord.get().getCurrentSublistValue({
						sublistId: 'recmachcustrecord_smt_sn_smart_testing',
						fieldId: 'custrecord_smt_sn_processed',
					});
					
					if (Processed != true) {
						currentRecord.get().setCurrentSublistValue({
							sublistId: 'recmachcustrecord_smt_sn_smart_testing',
							fieldId: 'custrecord_smt_sn_apply',
							value: false
						});
						currentRecord.get().commitLine({
							sublistId: 'recmachcustrecord_smt_sn_smart_testing'
						});
					}
				}
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		return {
			pageInit: pageInit_emptyapprove,
			submitfinaltestingrecord: submitfinaltestingrecord,
			printfinaltestedrecord: printfinaltestedrecord,
			markalltestingrec: markalltestingrec,
			unmarkalltestingrec: unmarkalltestingrec,
			submitfinaltestingline: submitfinaltestingline,
		};
	});