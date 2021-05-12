/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/currentRecord','N/https','N/url','N/runtime','N/search'],

    function(record, currentRecord, https, url, runtime,search){
		function pageInit_emptyapprove(context){
		}
		function createsmarttestingrecord(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_create_smarttesting_rec",
					deploymentId: "customdeploy1",
				});
				
				var userId = runtime.getCurrentUser().id;
				//alert(get_url)
				get_url += ('&shiprequestid=' + cur_record);
				get_url += ('&userid=' + userId);
				
				var response = https.request({
					method: https.Method.POST,
					url: get_url
				});
				
				var Resp = response.body
				
				if (Resp.indexOf("SUCCESS") >= 0) {
					var SMTID = Resp.split(":")[1];
					
					var OpenLink = url.resolveRecord({
						recordType: 'customrecord_smt',
						recordId: SMTID,
						isEditMode: false
					});
					
					window.open(OpenLink, "_self")
				}
				else {
					alert(response.body)
					window.location.reload();
					
				}
				
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		function createsmarttestingrecordfromaro(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var AROfieldLookUp = search.lookupFields({
					type: 'customrecord_aro',
					id: cur_record,
					columns: ['custrecord_aro_item_receipt']
				});
				
				var ItemReceipt = AROfieldLookUp.custrecord_aro_item_receipt[0].value;
				

				var get_url = url.resolveScript({
					scriptId: "customscript_sut_create_smarttesting_rec",
					deploymentId: "customdeploy1",
				});
				
				var userId = runtime.getCurrentUser().id;
				//alert(get_url)
				get_url += ('&shiprequestid=' + ItemReceipt);
				get_url += ('&userid=' + userId);
				
				var response = https.request({
					method: https.Method.POST,
					url: get_url
				});
				
				var Resp = response.body
				
				if (Resp.indexOf("SUCCESS") >= 0) {
					var SMTID = Resp.split(":")[1];
					
					var OpenLink = url.resolveRecord({
						recordType: 'customrecord_smt',
						recordId: SMTID,
						isEditMode: false
					});
					
					window.open(OpenLink, "_self")
				}
				else {
					alert(response.body)
					window.location.reload();
					
				}
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		return {
			pageInit: pageInit_emptyapprove,
			createsmarttestingrecord: createsmarttestingrecord,
			createsmarttestingrecordfromaro: createsmarttestingrecordfromaro
		};
	});