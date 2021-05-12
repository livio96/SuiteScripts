/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/email','N/render', 'N/search', 'N/record', 'N/runtime', 'N/format'],

function (email, render, search, record, runtime, format) {

    function getInputData() 
	{	
		//Search Name : Newegg ABR Bank Record Creation 
		var wexOrders = search.load({
			  id: 'customsearch380251'
			});
			
			//Handy dandy method for getting all results instead of that stupid arbitrary 4000 limit...  Equivalent of searchGetAllResults library
			wexOrders = wexOrders.runPaged();
			var resultSet = [];
			wexOrders.pageRanges.forEach(function(pageRange) {
				  var myPage = wexOrders.fetch({index: pageRange.index});
				  myPage.data.forEach(function(result) {
					resultSet.push(result);
				  return true;
				  });
				});

        return resultSet;
    }

    function reduce(context) 
	{
		try 
		{
			var mapResults = JSON.parse(context.values[0]);
			log.debug('mapResults', mapResults);
			
			var id = mapResults.id;
			
			var vals = JSON.parse(JSON.stringify(mapResults.values));
			
			var type = vals['custrecord45'];
			var amount = vals['formulanumeric'];
			var checkNum = vals['custrecord46'];
			var reference = vals['custrecord50']; 
			var settlementDate = new Date(vals['custrecord51']);
			
			var accTypeInfo = vals["CUSTRECORD53.custrecord56"], accType = '';
          
			if(accTypeInfo)
			{
				accType = accTypeInfo[0].text;
			}
			
			log.debug('Vals', type+" : "+amount+" : "+checkNum+" : "+reference+" : "+accType);
			
			if(accType)
			{
				var abrRec = record.create({ type: 'customrecord_nbsabr_bankstatementline' });
				if(type)
					abrRec.setValue({ fieldId: 'custrecord_bsl_type', value: type });
				if(amount)
					abrRec.setValue({ fieldId: 'custrecord_bsl_amount', value: amount });
				if(checkNum)
					abrRec.setValue({ fieldId: 'custrecord_bsl_checknumber', value: checkNum });
				if(reference)
					abrRec.setValue({ fieldId: 'custrecord_bsl_reference', value: reference });
				
				if(accType == 'Newegg')
				{
					abrRec.setValue({ fieldId: 'custrecord_bsl_bankstatementid', value: 243 });
                  	abrRec.setValue({fieldId: 'custrecord_bsl_reconaccount', value: 4});
				}
				else if(accType == 'Newegg Business')
				{
					abrRec.setValue({ fieldId: 'custrecord_bsl_bankstatementid', value: 245 });
                  	abrRec.setValue({fieldId: 'custrecord_bsl_reconaccount', value: 5});
				}
				var abrRecId = abrRec.save(true, true);
				log.debug('abrRecId', abrRecId);
				
				
				if(abrRecId)
				{
					record.submitFields({ type: 'customrecord_newegg_sett_tran', id: id, values: { 'custrecord59' : true } });
					
					record.submitFields({ type: 'customrecord_nbsabr_bankstatementline', id: abrRecId, values: { 'custrecord_bsl_date' : settlementDate } });
				}
				
			}
		}
		catch(e) 
		{
			log.debug( 'Error In Auto Invoice Generation', 'Error In auto Invoice Generation '+id+' Error: ' + e);
		}
    }
    return {
        getInputData: getInputData,
        //map: map,
        reduce: reduce,
		//summarize: summarize
    };
});