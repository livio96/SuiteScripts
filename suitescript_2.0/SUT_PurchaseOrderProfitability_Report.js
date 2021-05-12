// BEGIN SCRIPT DESCRIPTION BLOCK  ==================================
{
    /*
        Script Name:
        Author:		
        Company:.
        Date:		
    
        Script Modification Log:
    
        -- Date --			-- Modified By --				--Requested By--				-- Description --
    
    
    
    Below is a summary of the process controls enforced by this script file.  The control logic is described
    more fully, below, in the appropriate function headers and code blocks.
    
    
         SUITELET
            - suiteletFunction(request, response)
    
    
         SUB-FUNCTIONS
            - The following sub-functions are called by the above core functions in order to maintain code
                modularization:
    
                   - NOT USED
    
    */
}
// END SCRIPT DESCRIPTION BLOCK  ====================================



// BEGIN GLOBAL VARIABLE BLOCK  =====================================
{
    //  Initialize any Global Variables, in particular, debugging variables...




}
// END GLOBAL VARIABLE BLOCK  =======================================





// BEGIN SUITELET ==================================================

function suiteletFunction_poprofit(request, response)
{

	/*  Suitelet:
	 - EXPLAIN THE PURPOSE OF THIS FUNCTION
	 -
	 FIELDS USED:
	 --Field Name--				--ID--
	 */
	//  LOCAL VARIABLES
	
	
	//  SUITELET CODE BODY
	
	if (request.getMethod() == 'GET') 
	{
		var form = nlapiCreateForm('Purchase Order Profitability');
		
		form.setScript('customscript_cli_po_profit_report');
		
		var purchaseOrdersearch = request.getParameter('purchaseOrdersearch');
		
		var o_posearch_Obj = form.addField('custpage_puchaseordersearch', 'text', 'Purchase Order Search');
		
		var o_po_Obj = form.addField('custpage_puchaseorder', 'Select', 'Purchase Order');
		o_po_Obj.addSelectOption('', '')
		
		if (purchaseOrdersearch != null && purchaseOrdersearch != '' && purchaseOrdersearch != undefined) 
		{
			o_posearch_Obj.setDefaultValue(purchaseOrdersearch);
			populatePurchaseOrder(o_po_Obj, purchaseOrdersearch);
		}
		
		var purchaseOrder = request.getParameter('purchaseOrder');
		
		if (purchaseOrder != null && purchaseOrder != '' && purchaseOrder != undefined) 
		{
			o_po_Obj.setDefaultValue(purchaseOrder);
		}
		
		form.addButton('custpage_searchpo', 'Search', 'searchPurchaseOrder()')
		
		var ItemWisesublist = form.addSubList('custpage_poprofititemlist', 'list', 'Item Wise');
		
		var BrandWisesublist = form.addSubList('custpage_poprofitbrandlist', 'list', 'Brand Wise');
		
		var sublist1 = form.addSubList('custpage_poprofitlist', 'list', 'Serail Wise');
		
		var InvAdjustSublist = form.addSubList('custpage_inventoryadjustlist', 'list', 'Inventory Adjustment');
		
		setSubList(InvAdjustSublist,BrandWisesublist, ItemWisesublist, sublist1, form, request, response, purchaseOrder)
		
		response.writePage(form);
	}
}

// END SUITELET ====================================================




// BEGIN OBJECT CALLED/INVOKING FUNCTION ===================================================


function setSubList(InvAdjustSublist, BrandWisesublist, ItemWisesublist, sublist1, form, request, response, purchaseOrder){

	if (purchaseOrder != null && purchaseOrder != '' && purchaseOrder != undefined) {
	
		//======================================Start Header Fields=====================================================//
		
		var HeadTotalSerialFieldObj = form.addField('custpage_totalposerial', 'text', 'Total PO Serial');
		HeadTotalSerialFieldObj.setDisplayType('inline');
		
		var HeadOnhandFieldObj = form.addField('custpage_onhand', 'text', 'Onhand');
		HeadOnhandFieldObj.setDisplayType('inline');
		
		var InvAdjustCountFieldObj = form.addField('custpage_invadjustcount', 'text', 'Adjusted');
		InvAdjustCountFieldObj.setDisplayType('inline');
		
		var HeadTotalSalesFieldObj = form.addField('custpage_totalsales', 'text', 'Total Sales');
		HeadTotalSalesFieldObj.setDisplayType('inline');
		
		var HeadPOAmtObj = form.addField('custpage_poamount', 'currency', 'PO Amount');
		HeadPOAmtObj.setDisplayType('inline');
		
		var HeadTotalSalesAmtObj = form.addField('custpage_totalsalesamt', 'currency', 'Total Sales Amount');
		HeadTotalSalesAmtObj.setDisplayType('inline');
		
		var DiffAmtObj = form.addField('custpage_totaldiffamt', 'currency', 'Profit Amount');
		DiffAmtObj.setDisplayType('inline');
		
		//======================================End Header Fields=====================================================//
		
		var a_venreturn_Vertical = {};
		var a_venreturn_Vertical_array = new Array();
		
		var searchid = 0;
		var j = 0;
		var SerialCost = 0;
		var TotalSerialCost = 0;
		var TotalOnHandQty = 0;
		var TotalSalesQty = 0;
		var TotalSalesAmount = 0;
		var TotalSerialCount = 0;
		
		//sublist1.addField('trandate', 'Date', 'Date');
		
		//======================================Start Item Sublist Fields=====================================================//
		
		var ItemListFieldObj = ItemWisesublist.addField('custitem_itemnumber', 'select', 'Item', 'item');
		ItemListFieldObj.setDisplayType('inline')
		
		ItemWisesublist.addField('custitem_serilcount', 'text', 'PO Serial Count');
		
		ItemWisesublist.addField('custitem_onhandcount', 'text', 'Onhand Count');
		
		ItemWisesublist.addField('custitem_poamount', 'currency', 'PO Amount');
		
		ItemWisesublist.addField('custitem_salescount', 'text', 'Sold Count');
		
		ItemWisesublist.addField('custitem_salesamount', 'currency', 'Sold Amount');
		
		//======================================End Item Sublist Fields=====================================================//
		
		
		//======================================Start Brand Sublist Fields=====================================================//
		
		var BrandListFieldObj = BrandWisesublist.addField('custbrand_itemnumber', 'select', 'Brand', 'customlist32');
		BrandListFieldObj.setDisplayType('inline')
		
		BrandWisesublist.addField('custbrand_serilcount', 'text', 'PO Serial Count');
		
		BrandWisesublist.addField('custbrand_onhandcount', 'text', 'Onhand Count');
		
		BrandWisesublist.addField('custbrand_poamount', 'currency', 'PO Amount');
		
		BrandWisesublist.addField('custbrand_salescount', 'text', 'Sold Count');
		
		BrandWisesublist.addField('custbrand_salesamount', 'currency', 'Sold Amount');
		
		//======================================End Item Sublist Fields=====================================================//
		
		
		//======================================Start Serial Sublist Fields=====================================================//
		var ItemFieldObj = sublist1.addField('poitemnumber', 'select', 'Item', 'item');
		ItemFieldObj.setDisplayType('inline')
		
		var SerialFieldObj = sublist1.addField('poserialnumber', 'select', 'Serial Number', 'inventorynumber');
		SerialFieldObj.setDisplayType('inline')
		
		//sublist1.addField('poserialnumber', 'text', 'Serial Number');
		sublist1.addField('onhandcount', 'text', 'Onhand Quantity');
		
		sublist1.addField('poamount', 'currency', 'PO Amount');
		
		var POOBJ = sublist1.addField('potransaction', 'select', 'Transaction #', 'transaction');
		POOBJ.setDisplayType('inline')
		
		// sublist1.addField('salescount', 'text', 'Sales Quantity');
		sublist1.addField('salesamount', 'currency', 'Sales Amount');
		
		//======================================End Serial Sublist Fields=====================================================//
		
		//======================================Start Inventory Adjustment Sublist Fields=====================================================//
		
		var Invadjust_ItemFieldObj = InvAdjustSublist.addField('poinvadjustitemnumber', 'select', 'Item', 'item');
		Invadjust_ItemFieldObj.setDisplayType('inline')
		
		var Invadjust_SerialFieldObj = InvAdjustSublist.addField('poinvadjsutserialnumber', 'select', 'Serial Number', 'inventorynumber');
		Invadjust_SerialFieldObj.setDisplayType('inline')
		
		var Invadjust_POOBJ = InvAdjustSublist.addField('poinvadjusttransaction', 'select', 'Transaction #', 'transaction');
		Invadjust_POOBJ.setDisplayType('inline')
		
		InvAdjustSublist.addField('invadjustamount', 'currency', 'Serail Cost');
		
		//======================================End Inventory Adjustment Sublist Fields=====================================================//
		
		var IR_filter = new Array();
		var IR_Column = new Array();
		
		IR_filter.push(new nlobjSearchFilter('createdfrom', null, 'anyOf', purchaseOrder));
		
		var itemrec_search = nlapiLoadSearch('transaction', 'customsearch_po_linked_serial_number');
		
		if (itemrec_search != null && itemrec_search != '' && itemrec_search != undefined) {
			itemrec_search.addFilters(IR_filter);
			
			var POSerialArray = new Array();
			
			var resultset = itemrec_search.runSearch();
			
			do {
				var mapping_search = resultset.getResults(searchid, searchid + 1000);
				
				if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
					for (var rs in mapping_search) {
						var result = mapping_search[rs];
						var columns = result.getAllColumns();
						var columnLen = columns.length;
						
						var SerialNumber = '';
						var SerialCost = '';
						var Onhand = '';
						
						for (var i = 0; i < columnLen; i++) {
							var column = columns[i];
							var LabelName = column.getLabel();
							var fieldName = column.getName();
							var value = result.getValue(column);
							//var text = result.getText(column);
							
							if (LabelName == 'SerialID') {
								SerialNumber = value
							}
							if (LabelName == 'Rate') {
								SerialCost = value;
							}
							if (LabelName == 'OnHand') {
								Onhand = value;
							}
						}
						
						TotalSerialCount++;
						
						POSerialArray.push(SerialNumber);
						
						TotalSerialCost = (parseFloat(TotalSerialCost) + parseFloat(SerialCost));
						
						if (Onhand == 'T') {
							//TotalOnHandQty = (parseFloat(TotalOnHandQty) + parseFloat(1));
						}
						j++;
						searchid++;
					}
				}
			}
			while (mapping_search.length >= 1000);
			
			
			//==========================================start On Hand Serial Number irrecspective of location==================//
			
			var OnHandArray = [];
			var a_onhandserial = {};
			var a_onhandserail_array = new Array();
			var sn_searchid = 0;
			var SN_filter = new Array();
			var SN_Column = new Array();
			
			//Tran_filter.push(new nlobjSearchFilter('inventorynumber', 'inventorydetail', 'anyOf', POSerialArray));
			SN_filter.push(new nlobjSearchFilter('internalid',null, 'anyOf', POSerialArray));
			
			var Onhand_search = nlapiLoadSearch('inventorynumber', 'customsearch_poprofit_itemnumber');
			
			if (Onhand_search != null && Onhand_search != '' && Onhand_search != undefined) {
				Onhand_search.addFilters(SN_filter);
				
				var onhandresultset = Onhand_search.runSearch();
				
				do {
					var onhand_mapping_search = onhandresultset.getResults(sn_searchid, sn_searchid + 1000);
					
					if (onhand_mapping_search != null && onhand_mapping_search != '' && onhand_mapping_search != undefined) {
						for (var rs in onhand_mapping_search) {
							var result = onhand_mapping_search[rs];
							var columns = result.getAllColumns();
							var columnLen = columns.length;
							
							var SerialNumber = '';
							var Item = '';
							var Category = '';
							
							
							for (var t = 0; t < columnLen; t++) {
								var column = columns[t];
								var LabelName = column.getLabel();
								var fieldName = column.getName();
								var value = result.getValue(column);
								//var text = result.getText(column);
								
								if (fieldName == 'internalid') {
									SerialNumber = value
								}
								if (fieldName == 'item') {
									Item = value
								}
								if (fieldName == 'custitem_category') {
									Category = value
								}
							}
							TotalOnHandQty = (parseFloat(TotalOnHandQty) + parseFloat(1));
							a_onhandserial[SerialNumber] = Item;
							a_onhandserail_array.push(a_onhandserial);
							
							sn_searchid++;
							
							OnHandArray.push({
								'internalid': SerialNumber,
								'itemId': Item,
								'brand': Category,
							});
						}
					}
				}
				while (onhand_mapping_search.length >= 1000);
			}
	
			HeadTotalSerialFieldObj.setDefaultValue(TotalSerialCount);
			HeadOnhandFieldObj.setDefaultValue(TotalOnHandQty);
			HeadPOAmtObj.setDefaultValue(TotalSerialCost);
			
			nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'IF Serach')
			
			
			var searchid = 0;
			var TotalSalesQty = 0;
			var TotalSalesAmt = 0;
			var Tran_filter = new Array();
			var Tran_Column = new Array();
			
			//Tran_filter.push(new nlobjSearchFilter('inventorynumber', 'inventorydetail', 'anyOf', POSerialArray));
			Tran_filter.push(new nlobjSearchFilter('internalid', 'itemnumber', 'anyOf', POSerialArray));
			
			var Salesrec_search = nlapiLoadSearch('transaction', 'customsearch_transaction_serial_number');
			
			if (Salesrec_search != null && Salesrec_search != '' && Salesrec_search != undefined) {
				Salesrec_search.addFilters(Tran_filter);
				
				var Salesresultset = Salesrec_search.runSearch();
				
				do {
					var sales_mapping_search = Salesresultset.getResults(searchid, searchid + 1000);
					
					if (sales_mapping_search != null && sales_mapping_search != '' && sales_mapping_search != undefined) {
						for (var rs in sales_mapping_search) {
							var result = sales_mapping_search[rs];
							var columns = result.getAllColumns();
							var columnLen = columns.length;
							
							var SerialNumber = '';
							var SerialCost = '';
							var TransactionID = '';
							var Type = '';
							
							for (var t = 0; t < columnLen; t++) {
								var column = columns[t];
								var LabelName = column.getLabel();
								var fieldName = column.getName();
								var value = result.getValue(column);
								//var text = result.getText(column);
								
								if (LabelName == 'SERIAL') {
									SerialNumber = value
								}
								if (fieldName == 'rate') {
									SerialCost = value;
								}
								if (LabelName == 'TRANSACTIONID') {
									TransactionID = value;
								}
								if (LabelName == 'Type') {
									Type = value;
								}
							}
							
							if (Type == 'RtnAuth') {
								TotalSalesQty = (parseFloat(TotalSalesQty) - parseFloat(1));
								
								TotalSalesAmt = (parseFloat(TotalSalesAmt) - parseFloat(SerialCost));
							}
							else {
								TotalSalesQty = (parseFloat(TotalSalesQty) + parseFloat(1));
								
								TotalSalesAmt = (parseFloat(TotalSalesAmt) + parseFloat(SerialCost));
							}
							
							if (SerialNumber in a_venreturn_Vertical) {
								var SerialDetails = a_venreturn_Vertical[SerialNumber];
								nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'SerialDetails -->' + SerialCost + '#' + TransactionID + '#' + SerialDetails);
								
								a_venreturn_Vertical[SerialNumber] = SerialDetails + "@" + SerialCost + '#' + TransactionID;
								
							}
							else {
								a_venreturn_Vertical[SerialNumber] = SerialCost + '#' + TransactionID;
								a_venreturn_Vertical_array.push(a_venreturn_Vertical);
							}
							
							searchid++;
						}
					}
				}
				while (sales_mapping_search.length >= 1000);
			}
			
			HeadTotalSalesFieldObj.setDefaultValue(TotalSalesQty);
			HeadTotalSalesAmtObj.setDefaultValue(TotalSalesAmt);
			
			var TotalDiffAmt = (parseFloat(TotalSalesAmt) - parseFloat(TotalSerialCost))
			
			DiffAmtObj.setDefaultValue(TotalDiffAmt);
			
			
			var searchid = 0;
			var j = 0;
			do {
				var mapping_search = resultset.getResults(searchid, searchid + 1000);
				
				if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
					for (var rs in mapping_search) {
						var result = mapping_search[rs];
						var columns = result.getAllColumns();
						var columnLen = columns.length;
						
						var SerialNumber = '';
						var SerialCost = '';
						var Onhand = '';
						var ITEM = '';
						
						for (var i = 0; i < columnLen; i++) {
							var column = columns[i];
							var LabelName = column.getLabel();
							var fieldName = column.getName();
							var value = result.getValue(column);
							//var text = result.getText(column);
							
							if (LabelName == 'SerialID') {
								SerialNumber = value
							}
							if (LabelName == 'Rate') {
								SerialCost = value;
							}
							if (LabelName == 'OnHand') {
								Onhand = value;
							}
							if (LabelName == 'ITEM') {
								ITEM = value;
							}
						}
						
						searchid++;
						
					    if(SerialNumber in a_onhandserial)
						{
							Onhand = 'T';
						}
						else
						{
							Onhand = 'F';
						}
					
						if (SerialNumber in a_venreturn_Vertical) {
							var SerialDetails = a_venreturn_Vertical[SerialNumber];
							
							var TransList = new Array();
							
							TransList = SerialDetails.split('@');
							
							for (var l = 0; l < TransList.length; l++) {
								j++;
								var FinalSerialDetails = TransList[l];
								
								// nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'FinalSerialDetails -->' + FinalSerialDetails);
								sublist1.setLineItemValue('potransaction', j, FinalSerialDetails.split('#')[1]);
								sublist1.setLineItemValue('poserialnumber', j, SerialNumber);
								sublist1.setLineItemValue('onhandcount', j, Onhand);
								sublist1.setLineItemValue('poamount', j, SerialCost);
								//sublist1.setLineItemValue('salescount', j, 1);
								sublist1.setLineItemValue('salesamount', j, FinalSerialDetails.split('#')[0]);
								sublist1.setLineItemValue('poitemnumber', j, ITEM);
							}
						}
						else {
						
							j++;
							//sublist1.setLineItemValue('potransaction', j, purchaseOrder);
							sublist1.setLineItemValue('poserialnumber', j, SerialNumber);
							sublist1.setLineItemValue('onhandcount', j, Onhand);
							sublist1.setLineItemValue('poamount', j, SerialCost);
							// sublist1.setLineItemValue('salescount', j, 0);
							sublist1.setLineItemValue('salesamount', j, 0);
							sublist1.setLineItemValue('poitemnumber', j, ITEM);
						}
					}
				}
			}
			while (mapping_search.length >= 1000);
			
			
			
			//================================Start PO item Wise Serial Detail =================================================//
			
			
			//================================End PO item Wise Serial Detail =================================================//
			
			
			//if (Array.isArray(POSerialArray) && POSerialArray.length)
			var Sales_IFResult = "";
			{
				var IF_filter = new Array();
				var IF_Column = new Array();
				var Brand_Column = new Array();
				//IF_filter.push(new nlobjSearchFilter('inventorynumber', 'inventorydetail', 'anyOf', POSerialArray));
				IF_filter.push(new nlobjSearchFilter('internalid', 'itemnumber', 'anyOf', POSerialArray));
				
				//IF_Column[0] = new nlobjSearchColumn('internalid', 'itemnumber', 'count');
				IF_Column[0] = new nlobjSearchColumn('item', null, 'group');
				IF_Column[1] = new nlobjSearchColumn('formulanumeric', null, 'sum')
				IF_Column[1].setFormula("case when {type} = 'Return Authorization' then -1 else 1 end");
				IF_Column[2] = new nlobjSearchColumn('formulanumeric', null, 'sum')
				IF_Column[2].setFormula("case when {type} = 'Return Authorization' then -{rate} else {rate} end");
				//IF_Column[3] = new nlobjSearchColumn('internalid', 'itemnumber');
				
				var Sales_IFResult = nlapiSearchRecord('transaction', 'customsearch_transaction_serial_number', IF_filter, IF_Column);
				
				//IF_Column[0] = new nlobjSearchColumn('internalid', 'itemnumber', 'count');
				Brand_Column[0] = new nlobjSearchColumn('custitem_category', 'item', 'group');
				Brand_Column[1] = new nlobjSearchColumn('formulanumeric', null, 'sum')
				Brand_Column[1].setFormula("case when {type} = 'Return Authorization' then -1 else 1 end");
				Brand_Column[2] = new nlobjSearchColumn('formulanumeric', null, 'sum')
				Brand_Column[2].setFormula("case when {type} = 'Return Authorization' then -{rate} else {rate} end");
				//IF_Column[3] = new nlobjSearchColumn('internalid', 'itemnumber');
				
				var Brand_IFResult = nlapiSearchRecord('transaction', 'customsearch_transaction_serial_number', IF_filter, Brand_Column);
			}
			
			var POItem = 0;
			
			var PO_ItemWise_filter = new Array();
			var PO_ItemWise_Column = new Array();
			
			PO_ItemWise_filter.push(new nlobjSearchFilter('createdfrom', null, 'anyOf', purchaseOrder));
			
			PO_ItemWise_Column[0] = new nlobjSearchColumn('item', null, 'group');
			PO_ItemWise_Column[1] = new nlobjSearchColumn('rate', 'appliedtotransaction', 'sum');
			PO_ItemWise_Column[2] = new nlobjSearchColumn('internalid', 'itemnumber', 'count');
			PO_ItemWise_Column[3] = new nlobjSearchColumn('formulanumeric', null, 'sum')
			PO_ItemWise_Column[3].setFormula("case when {itemnumber.isonhand} = 'T' then 1 else 0 end");
			
			var POItemWise_IFResult = nlapiSearchRecord('transaction', 'customsearch_po_linked_serial_number', PO_ItemWise_filter, PO_ItemWise_Column);
			
			if (POItemWise_IFResult != null && POItemWise_IFResult != '' && POItemWise_IFResult != undefined) 
			{
				for (cp = 0; cp < POItemWise_IFResult.length; cp++) 
				{
					POItem++;
					nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'SerialDetails -->' + cp);
					
					var Item = POItemWise_IFResult[cp].getValue(PO_ItemWise_Column[0]);
					var POAmount = POItemWise_IFResult[cp].getValue(PO_ItemWise_Column[1]);
					var SerialCount = POItemWise_IFResult[cp].getValue(PO_ItemWise_Column[2]);
					
					
					var OnHand = 0;
					if (OnHandArray != null && OnHandArray != '' && OnHandArray != undefined) {
						for (var onhand_i = 0; onhand_i < OnHandArray.length; onhand_i++) {
							var OnhandItem = OnHandArray[onhand_i].itemId;
							
							if (OnhandItem == Item) {
								OnHand = parseInt(OnHand) + parseInt(1);
							}
						}
					}
					
					//var OnHand = POItemWise_IFResult[cp].getValue(PO_ItemWise_Column[3]);
					
					var TotalSalesQty = 0;
					var TotalSalesAmount = 0;
					
					if (Sales_IFResult != null && Sales_IFResult != '' && Sales_IFResult != undefined) 
					{
						for (SR = 0; SR < Sales_IFResult.length; SR++) 
						{
							var SalesItem = Sales_IFResult[SR].getValue(IF_Column[0]);
							//nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'TotalSalesQty -->' + TotalSalesQty);
							
							if (SalesItem == Item) 
							{
								TotalSalesQty = Sales_IFResult[SR].getValue(IF_Column[1]);
								
								TotalSalesAmount = Sales_IFResult[SR].getValue(IF_Column[2]);
								break;
							}
						}
					}
					ItemWisesublist.setLineItemValue('custitem_itemnumber', POItem, Item);
					ItemWisesublist.setLineItemValue('custitem_serilcount', POItem, SerialCount);
					ItemWisesublist.setLineItemValue('custitem_onhandcount', POItem, OnHand);
					ItemWisesublist.setLineItemValue('custitem_poamount', POItem, POAmount);
					ItemWisesublist.setLineItemValue('custitem_salescount', POItem, TotalSalesQty);
					ItemWisesublist.setLineItemValue('custitem_salesamount', POItem, TotalSalesAmount);
					
				}
			}
			
			var POBrand = 0;
			
			var PO_BrandWise_filter = new Array();
			var PO_BrandWise_Column = new Array();
			
			PO_BrandWise_filter.push(new nlobjSearchFilter('createdfrom', null, 'anyOf', purchaseOrder));
			
			PO_BrandWise_Column[0] = new nlobjSearchColumn('custitem_category', 'item', 'group');
			PO_BrandWise_Column[1] = new nlobjSearchColumn('rate', 'appliedtotransaction', 'sum');
			PO_BrandWise_Column[2] = new nlobjSearchColumn('internalid', 'itemnumber', 'count');
			PO_BrandWise_Column[3] = new nlobjSearchColumn('formulanumeric', null, 'sum')
			PO_BrandWise_Column[3].setFormula("case when {itemnumber.isonhand} = 'T' then 1 else 0 end");
			
			var POBrandWise_IFResult = nlapiSearchRecord('transaction', 'customsearch_po_linked_serial_number', PO_BrandWise_filter, PO_BrandWise_Column);
			
			if (POBrandWise_IFResult != null && POBrandWise_IFResult != '' && POBrandWise_IFResult != undefined) {
				for (br = 0; br < POBrandWise_IFResult.length; br++) {
					POBrand++;
					nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'SerialDetails -->' + br);
					
					var Item = POBrandWise_IFResult[br].getValue(PO_BrandWise_Column[0]);
					var POAmount = POBrandWise_IFResult[br].getValue(PO_BrandWise_Column[1]);
					var SerialCount = POBrandWise_IFResult[br].getValue(PO_BrandWise_Column[2]);
					
					var OnHand = 0;
					if (OnHandArray != null && OnHandArray != '' && OnHandArray != undefined) {
						for (var onhand_i = 0; onhand_i < OnHandArray.length; onhand_i++) {
							var OnhandBrand = OnHandArray[onhand_i].brand;
							
							if (OnhandBrand == Item) {
								OnHand = parseInt(OnHand) + parseInt(1);
							}
						}
					}
					
					//var OnHand = POBrandWise_IFResult[br].getValue(PO_BrandWise_Column[3]);
					
					var TotalSalesQty = 0;
					var TotalSalesAmount = 0;
					
					if (Brand_IFResult != null && Brand_IFResult != '' && Brand_IFResult != undefined) {
						for (SR = 0; SR < Sales_IFResult.length; SR++) {
                            if(Brand_IFResult[SR] != '' && Brand_IFResult[SR]!= undefined && Brand_IFResult[SR] != null){
							var SalesItem = Brand_IFResult[SR].getValue(Brand_Column[0]);
							//nlapiLogExecution('DEBUG', 'Link PO Payment Amount', 'TotalSalesQty -->' + TotalSalesQty);
							
							if (SalesItem == Item) {
								TotalSalesQty = Brand_IFResult[SR].getValue(Brand_Column[1]);
								
								TotalSalesAmount = Brand_IFResult[SR].getValue(Brand_Column[2]);
								break;
							}
                            }
                        }
					}
					BrandWisesublist.setLineItemValue('custbrand_itemnumber', POBrand, Item);
					BrandWisesublist.setLineItemValue('custbrand_serilcount', POBrand, SerialCount);
					BrandWisesublist.setLineItemValue('custbrand_onhandcount', POBrand, OnHand);
					BrandWisesublist.setLineItemValue('custbrand_poamount', POBrand, POAmount);
					BrandWisesublist.setLineItemValue('custbrand_salescount', POBrand, TotalSalesQty);
					BrandWisesublist.setLineItemValue('custbrand_salesamount', POBrand, TotalSalesAmount);
				}
			}
			
			//==========================Begin Inventory Adjust Serial ====================================//
			var searchid = 0;
			var j = 0;
			var Invadjust_Tran_filter = new Array();
			var Invadjust_Tran_Column = new Array();
			
			//Tran_filter.push(new nlobjSearchFilter('inventorynumber', 'inventorydetail', 'anyOf', POSerialArray));
			Invadjust_Tran_filter.push(new nlobjSearchFilter('internalid', 'itemnumber', 'anyOf', POSerialArray));
			
			var Invadjustrec_search = nlapiLoadSearch('transaction', 'customsearch_po_profit_serialadjustment');
			
			if (Invadjustrec_search != null && Invadjustrec_search != '' && Invadjustrec_search != undefined) {
				Invadjustrec_search.addFilters(Invadjust_Tran_filter);
				
				var Inadjustresultset = Invadjustrec_search.runSearch();
				
				do {
					var invadjust_mapping_search = Inadjustresultset.getResults(searchid, searchid + 1000);
					
					if (invadjust_mapping_search != null && invadjust_mapping_search != '' && invadjust_mapping_search != undefined) {
						for (var rs in invadjust_mapping_search) {
							var result = invadjust_mapping_search[rs];
							var columns = result.getAllColumns();
							var columnLen = columns.length;
							
							var SerialNumber = '';
							var SerialCost = '';
							var TransactionID = '';
							var Type = '';
							
							for (var t = 0; t < columnLen; t++) {
								var column = columns[t];
								var LabelName = column.getLabel();
								var fieldName = column.getName();
								var value = result.getValue(column);
								//var text = result.getText(column);
								
								if (LabelName == 'SERIAL') {
									SerialNumber = value
								}
								if (fieldName == 'rate') {
									SerialCost = value;
								}
								if (LabelName == 'TRANSACTIONID') {
									TransactionID = value;
								}
								if (LabelName == 'Type') {
									Type = value;
								}
								if (LabelName == 'ITEM') {
									ITEM = value;
								}
							}
							
							searchid++;
							j++;
							
							InvAdjustSublist.setLineItemValue('poinvadjsutserialnumber', j, SerialNumber);
							InvAdjustSublist.setLineItemValue('poinvadjusttransaction', j, TransactionID);
							InvAdjustSublist.setLineItemValue('invadjustamount', j, SerialCost);
							InvAdjustSublist.setLineItemValue('poinvadjustitemnumber', j, ITEM);
							
						}
					}
				}
				while (invadjust_mapping_search.length >= 1000);
			}
			
			InvAdjustCountFieldObj.setDefaultValue(j);
			//==========================Begin Inventory Adjust Serial ====================================//
		}
	}
}

function populatePurchaseOrder(o_po_Obj, purchaseOrdersearch){
	var po_filter = new Array();
	var po_Column = new Array();
	
	po_filter.push(new nlobjSearchFilter('tranid', 'createdfrom', 'contains', purchaseOrdersearch));
	
	var po_search = nlapiLoadSearch('transaction', 'customsearch_po_linked_serial_number_2');
	
	if (po_search != null && po_search != '' && po_search != undefined) {
		po_search.addFilters(po_filter);
		var posearchid = 0;
		
		var poresultset = po_search.runSearch();
		
		do {
			var mapping_search = poresultset.getResults(posearchid, posearchid + 1000);
			
			if (mapping_search != null && mapping_search != '' && mapping_search != undefined) {
				for (var rs in mapping_search) {
					var result = mapping_search[rs];
					var columns = result.getAllColumns();
					var columnLen = columns.length;
					
					
					var createdfromText = '';
					var createdfrom = '';
					
					for (var i = 0; i < columnLen; i++) {
						var column = columns[i];
						var LabelName = column.getLabel();
						var fieldName = column.getName();
						var value = result.getValue(column);
						var text = result.getText(column);
						
						if (fieldName == 'createdfrom') {
							createdfrom = value
						}
						if (fieldName == 'createdfrom') {
							createdfromText = text
						}
						
					}
					o_po_Obj.addSelectOption(createdfrom, createdfromText)
					
					posearchid++;
				}
			}
		}
		while (mapping_search.length >= 1000);
	}
}
// END OBJECT CALLED/INVOKING FUNCTION =====================================================

