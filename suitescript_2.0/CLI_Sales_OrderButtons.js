/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/currentRecord','N/https','N/url','N/runtime'],

    function(record, currentRecord, https, url, runtime){
		function pageInit_emptyapprove(context){
		
		}
		function printwarrabtypdf(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_print_warranty_pdf",
					deploymentId: "customdeploy1"
				});
				
				get_url += ('&sorecid=' + cur_record);
				
				window.open(get_url, '_blank');
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		function createshippingissuecase(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				//alert(cur_record);
				var get_url = url.resolveRecord({
					recordType: "customrecord_sp"
				});
				
				get_url += ('&sorecid=' + cur_record);
				//alert(get_url)
				window.open(get_url, '_blank');
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		function fulfilldropshiporder(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_fulfill_drop_ship_order",
					deploymentId: "customdeploy1"	
				});
				//alert(get_url)
				//returnExternalUrl: true
				get_url += ('&shiprequestid=' + cur_record);
				
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
		return {
			pageInit: pageInit_emptyapprove,
			printwarrabtypdf: printwarrabtypdf,
			createshippingissuecase: createshippingissuecase,
			fulfilldropshiporder: fulfilldropshiporder
		};
	});