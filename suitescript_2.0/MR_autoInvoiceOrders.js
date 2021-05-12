/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/email','N/render', 'N/search', 'N/record', 'N/runtime', 'N/format'],

function (email, render, search, record, runtime, format) {

    function getInputData() 
	{	
	
			/* var script = runtime.getCurrentScript();
			var customForm = script.getParameter({ name: 'custscript_custom_form' }); */
		//Search Name : Auto Bill Net Orders [Do Not Delete]
		var wexOrders = search.load({
			  id: 'customsearch379797'
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
		var mapResults = JSON.parse(context.values[0]);
		var id = mapResults.id;
		log.debug({title: 'id',details: id});
		try 
		{
			//GEt Values from Configuraion Record
			var configRec = record.load({ type: 'customrecord_ag_configuration', id: 1 });
			var shipMethods = configRec.getValue({ fieldId: 'custrecord_free_shipping_methods'}); //[240196, 240111, 240195, 240136, 175144];
			log.debug({title: 'shipMethods',details: shipMethods });
			
			var soRec = record.load({ type: 'salesorder', id: id });
			var shippingCost = soRec.getValue({ fieldId: 'shippingcost' }) || 0.00;
			var shippingMethod = soRec.getValue({ fieldId: 'shipmethod' });
            var tracking_num = soRec.getValue({ fieldId: 'linkedtrackingnumbers' }) 
			
			var invoiceRec = record.transform({ fromType: 'salesorder', fromId: id, toType: 'invoice', isDynamic: true });
				invoiceRec.setValue({ fieldId: 'customform', value: 278 });
				invoiceRec.setValue({ fieldId: 'trackingnumbers', value: tracking_num });
				//SS to find the IF with Freight Terms as Bill Receipt
				var itemfulfillmentSearchObj = search.create({
											   type: "itemfulfillment",
											   filters:
											   [
												  ["type","anyof","ItemShip"], 
												  "AND", 
												  ["createdfrom.internalid","anyof",id], 
												  "AND", 
												  ["mainline","is","T"], 
												  "AND", 
												  ["shipping","is","F"], 
												  "AND", 
												  ["custbody_pacejet_freight_terms","anyof","6"]
											   ],columns:[search.createColumn({name: "tranid", label: "Document Number"})]}).run();
				var results = [];
				
				if(itemfulfillmentSearchObj)
					results = itemfulfillmentSearchObj.getRange(0,100);
				
				if(results.length > 0)
					invoiceRec.setValue({ fieldId: 'shippingcost', value: 0.00 });
				
				else if(shippingCost != 0.00 || shippingCost > 0.00)
					invoiceRec.setValue({ fieldId: 'shippingcost', value: shippingCost });
				
				else if(shippingMethod)
				{
					if(shipMethods.indexOf(shippingMethod) != -1)
						invoiceRec.setValue({ fieldId: 'shippingcost', value: 0.00 });
					else
					{
						var itemfulfillmentSearchObj = search.create({
											   type: "itemfulfillment",
											   filters:
											   [
												  ["type","anyof","ItemShip"], 
												  "AND", 
												  ["createdfrom.internalid","anyof", id],
												  "AND", 
												  ["mainline","is","T"], 
												  "AND", 
												  ["shipping","is","F"]
											   ],
											   columns:
											   [ search.createColumn({name: "custbody_pacejet_freight_pricecurrency",summary: "SUM",label: "Shipping Cost"})]}).run();
						
						var res = [];
						if(res)
							res = itemfulfillmentSearchObj.getRange(0,1000);
						
						if(res.length > 0)
						{
							var sCost = res[0].getValue({ name: "custbody_pacejet_freight_pricecurrency",summary: "SUM" });
							log.debug({title: 'sCost',details: sCost});
							if(sCost || sCost == 0.00)
								invoiceRec.setValue({ fieldId: 'shippingcost', value: sCost });
						}
					}
				}
				else
				{
					var itemfulfillmentSearchObj = search.create({
											   type: "itemfulfillment",
											   filters:
											   [
												  ["type","anyof","ItemShip"], 
												  "AND", 
												  ["createdfrom.internalid","anyof", id]
											   ],
											   columns:
											   [ search.createColumn({name: "custbody_pacejet_freight_pricecurrency",summary: "SUM",label: "Shipping Cost"})]}).run();
						
					var res = [];
					if(res)
						res = itemfulfillmentSearchObj.getRange(0,1000);
					
					if(shippingCost != 0.00 || shippingCost > 0.00)
							invoiceRec.setValue({ fieldId: 'shippingcost', value: shippingCost });
					else if(res.length > 0)
					{
						var sCost = res[0].getValue({ name: "custbody_pacejet_freight_pricecurrency",summary: "SUM" });
						
						if(sCost || sCost == 0.00)
							invoiceRec.setValue({ fieldId: 'shippingcost', value: sCost });
					}
				}
				invoiceRec.setValue({ fieldId: 'tobeemailed', value: true });
			var invoiceId = invoiceRec.save(true, true);
			log.debug({title: 'invoiceId',details: invoiceId });
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