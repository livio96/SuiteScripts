/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/currentRecord','N/https','N/url'],
    function(record, currentRecord, https, url)
	{
		function validateLine_ApproveStatus(context)
		{
			
			return true;
		}
			function createreplacementorder(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_shipissue_ref_replace",
					deploymentId: "customdeploy1",
					returnExternalUrl: true
				});
				//alert(get_url)
				get_url += ('&shiprequestid=' + cur_record);
				get_url += ('&shiprequesttype=replacement');
			
				var response = https.request({
					method: https.Method.GET,
					url: get_url
				});
				
				
				alert(response.body)
				window.location.reload();
				
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		function createrefundorder(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_shipissue_ref_replace",
					deploymentId: "customdeploy1",
					returnExternalUrl: true
				});
				//alert(get_url)
				get_url += ('&shiprequestid=' + cur_record);
				get_url += ('&shiprequesttype=refund');
				//alert(get_url);
				
				var response = https.request({
					method: https.Method.GET,
					url: get_url
				});
				
				
				alert(response.body)
				window.location.reload();
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		return {
			validateLine: validateLine_ApproveStatus,
			createreplacementorder: createreplacementorder,
			createrefundorder: createrefundorder,
		
		};
	});