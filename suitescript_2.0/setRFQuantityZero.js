/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/search', 'N/record','N/log'],
    function(search, record, log){
		function setQuantityToZero(context){
			var SVsearch = search.load('customsearch380482');
			var results = SVsearch.run().getRange(0, 1000);
			
			log.debug('results length: ',  results.length);

			if (results.length > 0){
				for (var i = 0; i < results.length; i++){
					var id = results[i].getValue('internalid');
					var type = 'customrecord_awa_vendor_info_items';

					log.debug('recordObj', {id: id, type: type});

					record.submitFields({
						type: type, 
						id: id, 
						values: {
							custrecord64: 0
						}
					});
				}

				log.debug('finish', 'done');
			}
		}
		return {
			execute: setQuantityToZero
		};
	});