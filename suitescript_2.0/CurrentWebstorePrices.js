/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/search','N/ui/serverWidget','N/https','N/runtime','N/record', 'N/log'],
    function(search, serverWidget, https, runtime, record, log) {
        function beforeSubmitUpdatePrice(context) {
          var itemRec = context.newRecord;
          var recId = itemRec.id;
          var priceSearch = search.load('customsearch_current_webstore_prices');
          var newFilter = {"name":"internalid","operator":"anyof","values":[recId],"isor":false,"isnot":false,"leftparens":0,"rightparens":0};
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

            log.debug('fbmprice', amazonFBMPrice);
            log.debug('fbmbusinessprice', amazonFBMBusinessPrice);
            log.debug('fbaprice', amazonFBAPrice);
            log.debug('fbabusinessprice', amazonFBABusinessPrice);
            log.debug('ebay', eBayPrice);
            log.debug('newegg', neweggPrice);
            log.debug('neweggbusiness', neweggBusinessPrice);

            itemRec.setValue('custitem39', amazonFBMPrice);
            itemRec.setValue('custitem41', amazonFBMBusinessPrice);
            itemRec.setValue('custitem40', amazonFBAPrice);
            itemRec.setValue('custitem42', amazonFBABusinessPrice);
            itemRec.setValue('custitem_ebay_price', eBayPrice);
            itemRec.setValue('custitem_newegg_price', neweggPrice);
            itemRec.setValue('custitem43', neweggBusinessPrice);
          }
      };
      return {
          afterSubmit: beforeSubmitUpdatePrice
      };
});
