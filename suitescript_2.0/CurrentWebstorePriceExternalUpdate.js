/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

 define(['N/search','N/ui/serverWidget','N/https','N/runtime','N/record', 'N/log'],
 function(search, serverWidget, https, runtime, record, log) {
	 function afterSubmitUpdatePrice(context) {
	 var c = context.type;
	 if (c != 'delete'){
		  var smartWebstoreRec = context.newRecord;
	   var itemRecID = smartWebstoreRec.getValue('custrecord_sw_item');
	   var priceSearch = search.load('customsearch_current_webstore_prices');
	   var newFilter = {"name":"internalid","operator":"anyof","values":[itemRecID],"isor":false,"isnot":false,"leftparens":0,"rightparens":0};
	   var curFilters = priceSearch.filters;
	   curFilters.push(newFilter);
	   priceSearch.filters = curFilters;
	   var priceSearchResults = priceSearch.run().getRange(0, 1);

	   if (priceSearchResults.length > 0){
		 var amazonFBMPrice = priceSearchResults[0].getValue(priceSearch.columns[1]);
		 var amazonFBAPrice = priceSearchResults[0].getValue(priceSearch.columns[2]);
		 var amazonFBMBusinessPrice = priceSearchResults[0].getValue(priceSearch.columns[3]);
		 var amazonFBABusinessPrice = priceSearchResults[0].getValue(priceSearch.columns[4]);
		 var neweggPrice = priceSearchResults[0].getValue(priceSearch.columns[5]);
		 var neweggBusinessPrice = priceSearchResults[0].getValue(priceSearch.columns[7]);
		 var eBayPrice = priceSearchResults[0].getValue(priceSearch.columns[6]);

		 /*log.debug('fbmprice', amazonFBMPrice);
		 log.debug('fbmbusinessprice', amazonFBMBusinessPrice);
		 log.debug('fbaprice', amazonFBAPrice);
		 log.debug('fbabusinessprice', amazonFBABusinessPrice);
		 log.debug('ebay', eBayPrice);
		 log.debug('newegg', neweggPrice);
		 log.debug('neweggbusiness', neweggBusinessPrice);*/
		 try {
		   var prices = record.submitFields({
			 type: record.Type.INVENTORY_ITEM,
			 id: itemRecID,
			 values: {
			   custitem39: amazonFBMPrice,
			   custitem41: amazonFBMBusinessPrice,
			   custitem40: amazonFBAPrice,
			   custitem42: amazonFBABusinessPrice,
			   custitem_ebay_price: eBayPrice,
			   custitem_newegg_price: neweggPrice,
			   custitem43: neweggBusinessPrice
			 }
		   });
		 }
		 catch (err) {
		   var prices = record.submitFields({
			 type: record.Type.SERIALIZED_INVENTORY_ITEM,
			 id: itemRecID,
			 values: {
			   custitem39: amazonFBMPrice,
			   custitem41: amazonFBMBusinessPrice,
			   custitem40: amazonFBAPrice,
			   custitem42: amazonFBABusinessPrice,
			   custitem_ebay_price: eBayPrice,
			   custitem_newegg_price: neweggPrice,
			   custitem43: neweggBusinessPrice
			 }
		   });
		 }
		 /*itemRec.setValue('custitem39', amazonFBMPrice);
		 itemRec.setValue('custitem41', amazonFBMBusinessPrice);
		 itemRec.setValue('custitem40', amazonFBAPrice);
		 itemRec.setValue('custitem42', amazonFBABusinessPrice);
		 itemRec.setValue('custitem_ebay_price', eBayPrice);
		 itemRec.setValue('custitem_newegg_price', neweggPrice);
		 itemRec.setValue('custitem43', neweggBusinessPrice);*/
	   }
	 }
   };
   return {
	   afterSubmit: afterSubmitUpdatePrice
   };
});
