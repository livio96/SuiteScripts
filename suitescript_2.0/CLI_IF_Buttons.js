/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/currentRecord','N/https','N/url','N/runtime'],

    function(record, currentRecord, https, url, runtime){
		function pageInit_emptyapprove(context){
		
		}
		function shipandprintitemfulfillment(scriptContext){
			try {
				var cur_record = currentRecord.get().id;
				
				var get_url = url.resolveScript({
					scriptId: "customscript_sut_print_if_shipping_label",
					deploymentId: "customdeploy1"
				});
				
				get_url += ('&shiprequestid=' + cur_record);
				
				window.open(get_url, '_blank');
			} 
			catch (er) {
				console.log('err', er)
			}
		}
		return {
			pageInit: pageInit_emptyapprove,
			shipandprintitemfulfillment: shipandprintitemfulfillment
		};
	});