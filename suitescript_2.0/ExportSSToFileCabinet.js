/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(['N/search','N/file'],

function(search,file) {
   
	//Load saved search
    function execute(scriptContext) {
    	var mySearch = search.load({
    		id: '379271'
    	})
    	
		//Run saved search
    	var mySearchResultSet = mySearch.run();
    	log.debug('Results...',mySearchResultSet)
		
		//Headers of CSV File separated by commas and ends with a new line (\r\n)
		var csvFile = 'Internal ID,Item Name\r\n';

		//Iterate through each result
		mySearchResultSet.each(iterator);
			
			function iterator(resultObject){
				
			//Get value returned for Internal ID
				var internalid = resultObject.getValue({
					name: 'internalid'
				})
				//Get value returned for Item ID
                		var itemid = resultObject.getValue({
						 name: "item",
         				summary: "GROUP",
        				 label: "Item"
				})
				
				//Add each result as a new line on CSV
				csvFile += internalid+','+itemid+'\r\n'				
              return true;
				
			}
		
		//Variable for datetime
		var date = new Date();
		
		//Creation of file
    		var fileObj = file.create({
			//To make each file unique and avoid overwriting, append date on the title
			name: 'UpdateWebsiteQuantities.csv',
			fileType: file.Type.CSV,
			contents: csvFile,
			description: 'This is a CSV file.',
			encoding: file.Encoding.UTF8,
			folder: 9761866
    		});
		
		//Save the CSV file
		var fileId = fileObj.save()
    		log.debug('File ID...',fileId)
    }

    return {
        execute: execute
    };
    
});