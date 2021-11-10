/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(["N/search", "N/record","N/email","N/runtime", "N/https","N/format"],
    function(search, record, email, runtime, https, format){
		function ParseHubIntegration(context){
			
				//var ApiKey = 'bGJlcWlyaUB0ZWxxdWVzdGludGwuY29tOiUpfHtQSiI5RTZRQEZ4QyQwVDVgbTVSKy1eejF4dA=='Sandbox
				var ApiKey = 'ti4cCuq8Bw5L'
				
				var req_headers = {
                    "Content-Type": "application/json"
                };

                var parameters = {
                    "api_key": ApiKey,
                    "start_url": "https://egov.uscis.gov/casestatus/landing.do",
                    "start_template": "start_temp"
                }
				
				
				
				var run_project = https.request({
					method: https.Method.POST,
					url: 'https://parsehub.com/api/v2/projects/t_rnhuZEzzCX/run',
					//body: JSON.stringify(RequestJs),
                    headers: req_headers,
                    urlParams: parameters

				});
				
				log.debug({
					title: 'run_project',
					details: run_project
				});
			
        }
		
		
		return {
			execute: ParseHubIntegration
		};
	});