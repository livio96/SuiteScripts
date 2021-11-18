/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
 define(["N/search", "N/record","N/email","N/runtime", "N/https","N/format"],
 function(search, record, email, runtime, https, format){
     function credit_limit_request(context){
 
             //Get Field Values 
             var newRecord = context.newRecord;

             var company_name = newRecord.getValue({
                fieldId: 'custrecord_comp_name'
            });
            var street_name = newRecord.getValue({
                fieldId: 'custrecord_street_name'
            });
            var street_number = newRecord.getValue({
                fieldId: 'custrecord_street_number'
            });
            var city = newRecord.getValue({
                fieldId: 'custrecord_city'
            });
            var zip = newRecord.getValue({
                fieldId: 'custrecord_zip_code'
            });
            var country_code = newRecord.getValue({
                fieldId: 'custrecord_country_code'
            });
       
       
            if(country_code == '' || country_code != undefined)
              country_code = null;
        if(zip == '' || zip != undefined)
              zip = null;
        if(city == '' || city != undefined)
              city = null;
        if(street_number == '' || street_number != undefined)
              street_number = null;
        if(street_name == '' || street_name != undefined)
              street_name = null;
       
            
           

             
             var ApiKey = 'bGJlcWlyaUB0ZWxxdWVzdGludGwuY29tOjFfSDctPjB1Um5pQlZZRSc1NTVqZSZyZVxwb350Zw=='  //Production
             //var ApiKey = 'bGJlcWlyaUB0ZWxxdWVzdGludGwuY29tOi5XIXE/UD9rZ1EnLmpbNio0WHo+VFF1blVYNVxSeA=='  //Sandbox
             var Auth_Headers = {};
             Auth_Headers['Content-Type'] = 'application/json';
             var RequestJs = {
                 "apiKey": ApiKey
             }
             // Authorize Connection        
             var EH_Auth_Response = https.request({
                 method: https.Method.POST,
                 url: 'https://api.eulerhermes.com/v1/idp/oauth2/authorize',
                 //url: "https://api-services.uat.1placedessaisons.com/uatm/v1/idp/oauth2/authorize",
                 body: JSON.stringify(RequestJs),
                 headers: Auth_Headers
             });
 
             
             if (EH_Auth_Response.code == 200) {
                 var AuthResult = JSON.parse(EH_Auth_Response.body);
                 var AccessToken = AuthResult.access_token;
                 
             }


             // Search for Company 
             var newRequestBody = {
             
             "companyName": company_name,
             "streetName": street_name,
             "streetNumber": street_number,
             "town": city,
             "postalCode": zip,
             "countryCode": country_code,
             "extendCountrySearch": "true"
             }


             //Headers
             var search_Auth_Headers = {};
             search_Auth_Headers['Content-Type'] = 'application/json';
             search_Auth_Headers['Authorization'] = 'Bearer ' + AccessToken;
             search_Auth_Headers['Content-Length'] = '0';
             search_Auth_Headers['Host'] = '<calculated when request is sent>';
             search_Auth_Headers['User-Agent'] = 'PostmanRuntime/7.28.4';
             search_Auth_Headers['Accept'] = '*/*';
             search_Auth_Headers['Accept-Encoding'] = 'gzip, deflate, br';
             search_Auth_Headers['Connection'] = 'keep-alive';



       
           
            
             var search_for_company = https.request({
                 method: https.Method.POST,
                 url: 'https://api.eulerhermes.com/search/v2/companies/advancedSearch',
                // url: "https://api-services.uat.1placedessaisons.com/search/uatm-v2/companies/advancedSearch",
                 body: JSON.stringify(newRequestBody),
                 headers: search_Auth_Headers
             });

              var search_for_company_body = JSON.parse(search_for_company.body);
              var search_for_company_res = search_for_company_body.results;

              
             log.debug({
               title: ' Response', 
               details: search_for_company
             })
           
              for(var i=0; i<30; i++){
                  if(search_for_company_res != undefined && search_for_company_res != null){
                    if(search_for_company_body.results[i].company.communicationChannels[1] != null || search_for_company_body.results[i].company.communicationChannels[1] != undefined)
                    newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_phone_number',
                                line: i,
                                value: search_for_company_body.results[i].company.communicationChannels[0].value
                            });
                   if(search_for_company_res[i].company.legalData != null || search_for_company_res[i].company.legalData != undefined)
                    newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_company_name_res',
                                line: i,
                                value: search_for_company_res[i].company.legalData.companyName
                            });
                    
                     newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_company_id',
                                line: i,
                                value: search_for_company_body.results[i].company.companyId
                            });
                     if(search_for_company_body.results[i].company.address != null || search_for_company_body.results[i].company.address != undefined)
                     newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_street_name_res',
                                line: i,
                                value: search_for_company_body.results[0].company.address.streetName
                            });
                     if(search_for_company_body.results[i].company.address != null || search_for_company_body.results[i].company.address != undefined)
                     newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_town_res',
                                line: i,
                                value: search_for_company_body.results[i].company.address.town
                            });
                      if(search_for_company_body.results[i].company.address != null || search_for_company_body.results[i].company.address != undefined)
                     newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_country_code_res',
                                line: i,
                                value: search_for_company_body.results[i].company.address.countryCode
                            });
                    if(search_for_company_body.results[i].company.communicationChannels[1] != null || search_for_company_body.results[i].company.communicationChannels[1] != undefined)
                     newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_web_site',
                                line: i,
                                value: search_for_company_body.results[i].company.communicationChannels[1].value
                            });
                    if(search_for_company_body.results[i].company.address.postCodes[0] != null || search_for_company_body.results[i].company.address.postCodes[0] != undefined)
                    newRecord.setSublistValue({
                                sublistId: 'recmachcustrecord_credit_limit_request_link',
                                fieldId: 'custrecord_zip_code_res',
                                line: i,
                                value: search_for_company_body.results[i].company.address.postCodes[0].postCodeValue
                            });
                    
                    

                  }
               
                
              }
         
             
                          
         
         }
     
     return {
         beforeSubmit: credit_limit_request,
     };
 });
