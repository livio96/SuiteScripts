/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/search','N/record','N/https','N/url'],
    function(error, search,record, https, url){
		function saveRecord_UpdateTotal(context){
			//UpdateHeaderTotal(context);
			return true;
		}
		function sublistChanged_CalculateHeader(context){
			//UpdateHeaderTotal(context);
		}
		function fieldChanged_SetRateField(context){
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
			var FieldName = context.fieldId;
			
			if ((sublistName == 'recmachcustrecord_sp_item_parent' && (FieldName == 'custrecord_sp_item_price' || FieldName == 'custrecord_sp_item_quantity'))) {
			
				var ItemRate = currentRecord.getCurrentSublistValue({
					sublistId: 'recmachcustrecord_sp_item_parent',
					fieldId: 'custrecord_sp_item_price'
				});
				
				
				var quantity = currentRecord.getCurrentSublistValue({
					sublistId: 'recmachcustrecord_sp_item_parent',
					fieldId: 'custrecord_sp_item_quantity'
				});
				
				if (quantity != null && quantity != '' && quantity != undefined) {
					var Amount = (parseFloat(ItemRate) * parseFloat(quantity));
					
					Amount = parseFloat(Amount).toFixed(2);
					
					
					currentRecord.setCurrentSublistValue({
						sublistId: 'recmachcustrecord_sp_item_parent',
						fieldId: 'custrecord_sp_item_amount',
						value: Amount
					});
					
				}
			}
		}
		
		function validateLine_LineQuantity(context)
		{
			var currentRecord = context.currentRecord;
			var sublistName = context.sublistId;
            
			if (sublistName == 'recmachcustrecord_sp_item_parent') {
				var ItemRate = currentRecord.getCurrentSublistValue({
					sublistId: 'recmachcustrecord_sp_item_parent',
					fieldId: 'custrecord_sp_item_price'
				});
				
				
				var quantity = currentRecord.getCurrentSublistValue({
					sublistId: 'recmachcustrecord_sp_item_parent',
					fieldId: 'custrecord_sp_item_quantity'
				});
				
				if (quantity != null && quantity != '' && quantity != undefined) {
					var Amount = (parseFloat(ItemRate) * parseFloat(quantity));
					
					Amount = parseFloat(Amount).toFixed(2);
					
					
					currentRecord.setCurrentSublistValue({
						sublistId: 'recmachcustrecord_sp_item_parent',
						fieldId: 'custrecord_sp_item_amount',
						value: Amount
					});
					
				}
				
				
				var Index = currentRecord.getCurrentSublistIndex({
					sublistId: sublistName,
				});
				//alert(Index);
				
				var Item = currentRecord.getCurrentSublistValue({
					sublistId: sublistName,
					fieldId: 'custrecord_sp_item_name'
				});
				
				var OriginalSo = currentRecord.getValue({
					fieldId: 'custrecord_sp_ot'
				});
				
				
				var SOQty = parseFloat(0);
				var SOSearch = search.load({
					id: 'customsearch_shipping_issue'
				});
				
				var MyFilters = search.createFilter({
					name: 'item',
					operator: 'anyOf',
					values: Item
				})
				var MyFilter2 = search.createFilter({
					name: 'internalid',
					operator: 'anyOf',
					values: OriginalSo
				})
				
				var MyColumns = search.createColumn({
					name: 'internalid',
					summary: search.Summary.GROUP,
				});
				
				var MyColumns2 = search.createColumn({
					name: 'item',
					summary: search.Summary.GROUP,
				});
				
				var MyColumns3 = search.createColumn({
					name: 'quantity',
					summary: search.Summary.SUM,
				});
				
				SOSearch.filters.push(MyFilters);
				SOSearch.filters.push(MyFilter2);
				SOSearch.columns.push(MyColumns);
				SOSearch.columns.push(MyColumns2);
				SOSearch.columns.push(MyColumns3);
				
				var searchResults = SOSearch.run().getRange(0, 1000);
				
				if (searchResults != null && searchResults != '' && searchResults != undefined) {
					var SORecId = searchResults[0].getValue({
						name: 'internalid',
						summary: search.Summary.GROUP,
					});
					log.debug("SORecId", SORecId);
					
					var SOItem = searchResults[0].getValue({
						name: 'item',
						summary: search.Summary.GROUP,
					});
					log.debug("SOItem", SOItem);
					
					SOQty = searchResults[0].getValue({
						name: 'quantity',
						summary: search.Summary.SUM,
					});
					//alert("SOQty" + SOQty);
					
				}
				else {
					alert('Please Enter the Item exists on sales order');
					return false;
				}
				
				var ShipIssueQty = currentRecord.getCurrentSublistValue({
					sublistId: 'recmachcustrecord_sp_item_parent',
					fieldId: 'custrecord_sp_item_quantity'
				});
				
				
				var Shipping_LineCount = currentRecord.getLineCount({
					sublistId: 'recmachcustrecord_sp_item_parent'
				})
				
				var Shipping_LineCount = currentRecord.getLineCount({
					sublistId: 'recmachcustrecord_sp_item_parent'
				})
				
				for (var k = 0; k < Shipping_LineCount; k++) {
					var ShipLineItem = currentRecord.getSublistValue({
						sublistId: 'recmachcustrecord_sp_item_parent',
						fieldId: 'custrecord_sp_item_name',
						line: k
					});
					
					var ShipLineQuantity = currentRecord.getSublistValue({
						sublistId: 'recmachcustrecord_sp_item_parent',
						fieldId: 'custrecord_sp_item_quantity',
						line: k
					});
					
					if (k != Index && ShipLineItem == Item) {
						ShipIssueQty = parseFloat(ShipIssueQty) + parseFloat(ShipLineQuantity)
					}
				}
				if (parseFloat(SOQty) < parseFloat(ShipIssueQty)) {
					alert('Quantity cannot greater than salesorder quantity');
					return false;
				}
			}
			return true;
		}
	return {
			fieldChanged: fieldChanged_SetRateField,
			validateLine: validateLine_LineQuantity,
			saveRecord: saveRecord_UpdateTotal,
			sublistChanged: sublistChanged_CalculateHeader
		};
	});
	function UpdateHeaderTotal(context){
		var currentRecord = context.currentRecord;
		
		var TotalAmount = parseFloat(0);
		
		var Shipping_LineCount = currentRecord.getLineCount({
			sublistId: 'recmachcustrecord_sp_item_parent'
		})
		for (var k = 0; k < Shipping_LineCount; k++) {
		
			var amount = currentRecord.getSublistValue({
				sublistId: 'recmachcustrecord_sp_item_parent',
				fieldId: 'custrecord_sp_item_amount',
				line: k
			});
			
			
			TotalAmount = (parseFloat(TotalAmount) + parseFloat(amount));
			
		}
		currentRecord.setValue({
			fieldId: 'custrecord_sp_reimbursement',
			value: TotalAmount
		});
	}

	
