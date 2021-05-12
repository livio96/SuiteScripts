/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/file','N/http'],
    function(render, search, record, email, runtime, file, http){
		function executeexpotdatatobrokerbin(context){
		
			try {
			
				var BrokerBinSearch = search.load({
					id: 'customsearch379593'
				});
				
				var BB_Headers = {};
				BB_Headers.Authorization = 'Bearer Q6Ua6arUdm40sAOE';
				BB_Headers['Content-Type'] = 'application/json';
				
				
				var BB_Del_Response = http.request({
					method: http.Method.DELETE,
					url: 'http://rti.brokerbin.com/api/v1/parts?acknowledge_full_removal=true',
					headers: BB_Headers
				});
				
				log.debug({
					title: 'BB_Del_Response',
					details: BB_Del_Response.code
				});
				
				log.debug({
					title: 'BB_Del_Response',
					details: BB_Del_Response.body
				});
				
				var searchid = 0;
				
				var j = 0;
				
				do {
					var searchResults = BrokerBinSearch.run().getRange(searchid, searchid + 100);
					
					if (searchResults != null && searchResults != '' && searchResults != undefined) {
					
						try {
						
							j++;
							log.debug('search', '--> ' + searchResults.length);
							
							var productDetailsList = new Array();
							
							for (var Trans in searchResults) {
								var result = searchResults[Trans];
								var columnLen = result.columns.length;
								
								var PartNumber = '';
								var Manufacturer = '';
								var Condition = '';
								var Quantity = '';
								var Description = '';
								var Price = '';
								
								for (var t = 0; t < columnLen; t++) {
									var column = result.columns[t];
									var LabelName = column.label;
									var fieldName = column.name;
									var value = result.getValue(column);
									var text = result.getText(column);
									if (LabelName == 'Part Number') {
										PartNumber = value
									}
									if (LabelName == 'Manufacturer') {
										Manufacturer = value
									}
									if (LabelName == 'Condition') {
										Condition = value
									}
									if (LabelName == 'Price') {
										Price = value
									}
									if (LabelName == 'Quantity') {
										Quantity = value
									}
									if (LabelName == 'Description') {
										Description = value
									}
								}
								
								if (PartNumber != '' && PartNumber != null && PartNumber != undefined) {
								
								}
								else {
									PartNumber = '';
								}
								
								if (Manufacturer != '' && Manufacturer != null && Manufacturer != undefined) {
								
								}
								else {
									Manufacturer = '';
								}
								
								if (Description != '' && Description != null && Description != undefined) {
								
								}
								else {
									Description = '';
								}
								
								if (Price != null && Price != '' && Price != undefined) {
								
									var UpperCaseReading = String(Price).toUpperCase();
									
									if (UpperCaseReading.indexOf('CALL') > -1) {
										Price = 0;
									}
									
								}
								else {
									Price = 0;
								}
								
								var productDetails = {};
								productDetails.partsno = PartNumber;
								productDetails.mfg = Manufacturer;
								productDetails.cond = Condition;
								productDetails.qty = Quantity;
								productDetails.price = Price;
								productDetails.description = Description;
								productDetails.status = "In-Stock";
								
								productDetailsList.push(productDetails);
								
								
								searchid++;
							}
							
							/*
						 log.debug({
						 title: 'JSON.stringify(productDetailsList)',
						 details: JSON.stringify(productDetailsList)
						 });
						 */
							var BB_Response = http.request({
								method: http.Method.PUT,
								url: 'http://rti.brokerbin.com/api/v1/parts/batch',
								body: JSON.stringify(productDetailsList),
								headers: BB_Headers
							});
							
							log.debug({
								title: j + '-BB_Response.code',
								details: BB_Response.code
							});
							
						} 
						catch (err) {
							log.debug('Internal error', '--> ' + err);
						}
						
					/*
					 log.debug({
					 title: 'BB_Response.body',
					 details: BB_Response.body
					 });
					 */
					}
				}
				while (searchResults.length >= 100);
				
				
				log.debug('Data Exported', 'Data Exported');
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		return {
			execute: executeexpotdatatobrokerbin
		};
	});