/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
					
define(['N/search','N/record','N/runtime'],

    function(search, record, runtime){
		function ChangePriceLevel(context){
	
			
				var newRecord = context.newRecord;
                var customer_group = newRecord.getValue({
                    fieldId: 'custentity_customer_group'
                });

                if(customer_group == 5){
                  var customer_group = newRecord.setValue({
                    fieldId: 'pricelevel', 
                    value: 25
                });
                }
               if(customer_group == 1 && customer_group !=5){
                  var customer_group = newRecord.setValue({
                    fieldId: 'pricelevel', 
                    value: 21
                });
               }
               

		
			
		}
		return {
			beforeSubmit: ChangePriceLevel,
		};
	});