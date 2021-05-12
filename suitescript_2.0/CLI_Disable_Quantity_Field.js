/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/search', 'N/record','N/runtime'],
    function(error, search, rec, runtime){
		var SORecordMode = '';
		function pageInit_QtyRecordMode(context){
			SORecordMode = context.mode;
		}
		function lineInit_DisableQuantity(context){
			if (SORecordMode == 'edit') {
				var currentRecord = context.currentRecord;
				var sublistName = context.sublistId;
				var FieldName = context.fieldId;
				
				if (sublistName == 'item') {
					try {
						var userRole = runtime.getCurrentUser().role;
						
						if (userRole == 1022 || userRole == 1027) {
						
							var Item = currentRecord.getCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'item'
							});
							
							var lineuniquekey = currentRecord.getCurrentSublistValue({
								sublistId: 'item',
								fieldId: 'lineuniquekey'
							});
							
							if (Item != null && Item != '' && Item != undefined && lineuniquekey != null && lineuniquekey != '' && lineuniquekey != undefined) {
							
								var SORecordID = context.currentRecord.id;
								
								var SOSearchRes = search.create({
									type: rec.Type.SALES_ORDER,
									filters: [["lineuniquekey", "anyOf", lineuniquekey], "AND", ["item", "anyOf", Item], "AND", ["internalid", "anyOf", SORecordID], "AND", ["mainline", "is", "F"], "AND", ["taxline", "is", "F"], "AND", ["shipping", "is", "F"], "AND", ["cogs", "is", "F"]],
									columns: [search.createColumn({
										name: 'quantitypicked',
										label: 'Picked'
									}), search.createColumn({
										name: 'quantitypacked',
										label: 'Packed'
									}), search.createColumn({
										name: 'item',
										label: 'Item'
									})]
								}).run().getRange(0, 1000);
								
								if (SOSearchRes != null && SOSearchRes != '' && SOSearchRes != undefined) {
								
								
									var QtyPicked = SOSearchRes[0].getValue({
										name: 'quantitypicked'
									});
									
									
									if ((QtyPicked != null && QtyPicked != '' && QtyPicked != undefined)) {
										if (parseFloat(QtyPicked) > parseFloat(0)) {
											eval("nlapiDisableLineItemField('item','quantity', true)");
                                            eval("nlapiDisableLineItemField('item','rate', true)");
										}
										else {
											eval("nlapiDisableLineItemField('item','quantity', false)");
                                            eval("nlapiDisableLineItemField('item','rate', false)");

										}
									}
									else {
										eval("nlapiDisableLineItemField('item','quantity', false)");
                                        eval("nlapiDisableLineItemField('item','rate', false)");

									}
								}
								else {
									eval("nlapiDisableLineItemField('item','quantity', false)");
                                    eval("nlapiDisableLineItemField('item','rate', false)");

                                  
								}
							}
							else {
								eval("nlapiDisableLineItemField('item','quantity', false)");
                               eval("nlapiDisableLineItemField('item','rate', false)");

							}
						}
					} 
					catch (ex) {
					
					}
				}
			}
		}
		function saveRecord(context)
		{
			var rec = context.currentRecord;
			var recType = rec.type;
			
			var customer = rec.getValue({ fieldId: 'entity' });
			var terms = rec.getValue({ fieldId: 'terms' });
			
			if(customer && terms == 4)
			{
				var res = [];
				var customerSearchObj = search.create({
						   type: "customer",
						   filters:
						   [
							  ["isinactive","is","F"], 
							  "AND", 
							  ["ccdefault","is","T"], 
							  "AND", 
							  ["internalid","anyof", customer]
						   ],
						   columns:
						   [
							  search.createColumn({name: "internalid", label: "Internal ID"}),
							  search.createColumn({name: "altname", label: "Name"}),
							  search.createColumn({name: "ccinternalid", label: "Credit Card Internal ID"}),
							  search.createColumn({name: "ccnumber", label: "Credit Card Number"}),
							  search.createColumn({name: "cctype", label: "Credit Card Type"})
						   ]}).run();

				res = customerSearchObj.getRange(0,100);
				if(res.length > 0)
				{
					
				}
				else
				{
					alert("No default credit card for the selected customer");
					return false;
				}
			}
			return true;
		}
  function postSourcing(context)
		{
			try
			{
				//alert(runtime.executionContext);
				if(runtime.executionContext == 'USERINTERFACE')
				{
					var rec = context.currentRecord;
					var fd = context.fieldId;
					
					if(fd == 'entity')
					{
						var customer = rec.getValue({ fieldId: 'entity'});
						if(customer)
						{
							var shipcarrier = rec.getValue({ fieldId: 'shipcarrier'});
							if(shipcarrier && shipcarrier != 'nonups')
								rec.setValue({ fieldId: 'shipcarrier', value: 'nonups'});
							
							rec.setValue({ fieldId: 'shipmethod', value: '139727'});
						}
					}
				}
			}catch(e)
			{
				alert(e);
			}
		}
		return {
			saveRecord: saveRecord,
			pageInit: pageInit_QtyRecordMode,
			lineInit: lineInit_DisableQuantity,
          postSourcing: postSourcing
		}
	});
	