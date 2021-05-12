/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/render','N/search', 'N/record', 'N/email', 'N/runtime','N/file'],
    function(render, search, record, email, runtime, file){
		function executebrokerbinemail(context){
		
			try {
			
				var MainLine = "Part Number" + ',' + "Manufacturer" + ',' + "Condition" + ',' + "Price" + "," + "Quantity" + "," + "Description";
				
				var BrokerBinSearch = search.load({
					//id: 'customsearch377987'
					id: 'customsearch379593'
				});
				
				var searchid = 0;
				
				var j = 0;
				
				do {
					var searchResults = BrokerBinSearch.run().getRange(searchid, searchid + 1000);
					
					if (searchResults != null && searchResults != '' && searchResults != undefined) {
                      log.debug('search', '--> ' + searchResults.length);
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
								//desc = desc.replace(/\r?\n|\r/g, ' ');
								PartNumber = PartNumber.replace(/,/g, '');
								PartNumber = PartNumber.replace(/\r\n/g, '');
								PartNumber = PartNumber.replace(/,/g, '');
								PartNumber = PartNumber.replace(/™/g, '&trade;');
								PartNumber = PartNumber.replace(/"/g, '&Prime;');
							}
							else {
								PartNumber = '';
							}
							
							if (Manufacturer != '' && Manufacturer != null && Manufacturer != undefined) {
								//desc = desc.replace(/\r?\n|\r/g, ' ');
								Manufacturer = Manufacturer.replace(/,/g, '');
								Manufacturer = Manufacturer.replace(/\r\n/g, '');
								Manufacturer = Manufacturer.replace(/,/g, '');
								Manufacturer = Manufacturer.replace(/™/g, '&trade;');
								Manufacturer = Manufacturer.replace(/"/g, '&Prime;');
							}
							else {
								Manufacturer = '';
							}
							
							if (Description != '' && Description != null && Description != undefined) {
								//desc = desc.replace(/\r?\n|\r/g, ' ');
								Description = Description.replace(/,/g, '');
								Description = Description.replace(/\r\n/g, '');
								Description = Description.replace(/,/g, '');
								Description = Description.replace(/™/g, '&trade;');
								Description = Description.replace(/"/g, '&Prime;');
							}
							else {
								Description = '';
							}
							
							
							LineItems = PartNumber + ',' + Manufacturer + ',' + Condition + ',' + Price + ',' + Quantity + ',' + Description;
							
							MainLine = MainLine + "\n" + LineItems;
							searchid++;
						}
					}
				}
				while (searchResults.length >= 1000);
				
				var NewFile = file.create({
					name: 'BrokerBin.csv',
					fileType: file.Type.CSV,
					contents: MainLine,
				});
				
				//folder: '#' // Folder ID where the file should be saved in the File Cabinet
				
				email.send({
					author: 1708326,
					recipients: "fbaert@telquestintl.com",
					subject: 'BrokerBin Inventory Update',
					body: 'BrokerBin Inventory Update',
					attachments: [NewFile],
				});
				
				log.debug('Email Send','Email Send');
			} 
			catch (err) {
				log.debug('error', '--> ' + err);
			}
		}
		return {
			execute: executebrokerbinemail
		};
	});