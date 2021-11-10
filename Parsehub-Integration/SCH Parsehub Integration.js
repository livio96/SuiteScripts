/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(["N/search", "N/record", "N/email", "N/runtime", "N/https", "N/format", "N/file"],
    function(search, record, email, runtime, https, format, file) {

        function setTimeout(aFunction, milliseconds) {
            var date = new Date();
            date.setMilliseconds(date.getMilliseconds() + milliseconds);
            while (new Date() < date) {}

            return aFunction();
        }
  
        //__________________________________________________________________________________________________________________________________

        function Parsehub_Brokerbin_Supply_Demand(context) {

            //ParseHub Account: lbeqiri@telquestintl.com
            var ApiKey = 'ti4cCuq8Bw5L'
            //Project Token : tGW4ODsUXPt4
            var run_project = https.request({
                method: https.Method.POST,
                url: 'https://parsehub.com/api/v2/projects/tGW4ODsUXPt4/run?api_key=ti4cCuq8Bw5L',

            });

            //tfY__aobBThh
            var run_project_body = JSON.parse(run_project.body);
            var RunToken = run_project_body.run_token;
            RunToken = "tfY__aobBThh";
            var run_url = "https://parsehub.com/api/v2/runs/" + RunToken + "/data?api_key=ti4cCuq8Bw5L&format=csv"

            setTimeout(function() {
                log.debug({
                    title: 'ran after 2 min ',
                    details: 'ran after 2 min'
                });

            }, 1000);

            var get_run_data = https.request({
                method: https.Method.GET,
                url: run_url
            });

            log.debug({
                title: 'get_run_data',
                details: get_run_data
            });

            var NewFile = file.create({
                name: 'results.csv',
                fileType: file.Type.CSV,
                contents: get_run_data.body,
            });

            email.send({
                author: 1692630,
                recipients: "website@telquestintl.com",
                subject: "Automated Match Your Hits Scape - Parsehub",
                body: "Automated parsehub scrape!",
                attachments: [NewFile]
            });




        }


        //______________________________________________________________________________________________________________________

     
        function main() {

            //Parsehub_Brokerbin_Supply_Demand();
            Parsehub_case_status();


        }

        return {
            execute: main
        };
    });
