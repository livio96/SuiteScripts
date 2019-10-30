/* Suitescript 1.0 
 * Update - Average SO Rate (custom_field)
 * Calculates the average of 5 most recent sales orders
 * Runs only on csv imports
 * Created by Livio Beqiri
 */
function average_so_rate() {

    var context = nlapiGetContext().getExecutionContext()
    if(context === 'csvimport'){
    var item_id = nlapiGetRecordId();

    if (item_id != null) {
        var salesorderSearch = nlapiSearchRecord("salesorder", null,
           [
   			["type","anyof","SalesOrd"], 
           "AND", 
  			 ["trandate","onorafter","thirtydaysago"], 
          "AND", 
   				["item","anyof",item_id]
], 
            [
               // new nlobjSearchColumn("trandate").setSort(true),
               new nlobjSearchColumn("trandate"),
                //new nlobjSearchColumn("amount"), 
                //new nlobjSearchColumn("quantity"),
                new nlobjSearchColumn("rate")

            ]
        );


        var search_length = 0;
            //nlapiLogExecution("Debug", "length", search_length);

        if (salesorderSearch) {
                          search_length = salesorderSearch.length;

         /*   if (salesorderSearch.length < 5) {
                search_length = salesorderSearch.length;
            } else
                search_length = 5;
*/

            var sum = 0;
            var rate = 0;
            //This is equal to search length - excluded lines
         	var final_length = 0; 
            for (var i = 0; i < search_length; i++) {
              	//nlapiLogExecution('Debug', 'Length', final_length)
               // rate = salesorderSearch[i].getValue("rate");
                if (rate > 0) {
                  	final_length = final_length + 1; 
                   nlapiLogExecution("Debug", "Value ", rate);
                    sum += parseFloat(rate);
                }

            }
        }

        if (search_length > 0) {
            var final_rate = Math.round(parseFloat(sum / final_length));

            nlapiLogExecution("Debug", "rate", final_rate);

            nlapiSetFieldValue("custitem_so_rate", final_rate);
        }

         }

   }

}
