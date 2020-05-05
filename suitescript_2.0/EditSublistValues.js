/* Suitescript 1.0 
 * Update - Average SO Rate (custom_field)
 * Calculates the average of recent sales orders (last 30 days)
 * Runs only on csv imports
 * Created by Livio Beqiri
 */

function average_so_rate(options) {
  var response = [];
  var object = {}
   object.data = [] ;
	object.data = options.data;
     	nlapiLogExecution('Debug', 'PostSubmit Response', options.data);
/*
	//for (var i = 0; i < object.data.length; i++) {
		var clone = JSON.parse(JSON.stringify(object.data[0]));
		response.push({
			statusCode : clone.statusCode || 200,
			id : clone.id,
			errors : clone.errors || [],
			ignored : clone.ignored || false
		});
	//}

    
   	nlapiLogExecution('Debug', 'PostSubmit Response', JSON.stringify(response));
  
	for (var i = 0; i < response.length; i++) {
		var record = response[i];
      
			var item_id = record.id;
            var item_rec = nlapiLoadRecord('inventoryitem', item_id)

		    var so_rate = item_rec.getFieldValue('custitem_so_rate'); 
			item_rec.setFieldValue('custitem_price_checker', so_rate); 
            nlapiSubmitRecord(item_rec);
           
   		    
		
	}

	return response;

*/

}

   
