function searchPurchaseOrder()
{
	var purchaseOrder = nlapiGetFieldValue('custpage_puchaseorder');
	
	var purchaseOrdersearch = nlapiGetFieldValue('custpage_puchaseordersearch');
	
	if (window.onbeforeunload) {
		window.onbeforeunload = function(){
			null;
		};
	}
	
	var URL = nlapiResolveURL('SUITELET', 'customscript_sut_po_profit_report', '1');
	
	URL = URL + '&purchaseOrdersearch=' + purchaseOrdersearch;
	
	window.location = URL;
	
}

function feildchangesearchPurchaseOrder(type, name){

	if (name == 'custpage_puchaseorder') {
		var purchaseOrder = nlapiGetFieldValue('custpage_puchaseorder');
		
		var purchaseOrdersearch = nlapiGetFieldValue('custpage_puchaseordersearch');
		
		if (window.onbeforeunload) {
			window.onbeforeunload = function(){
				null;
			};
		}
		
		var URL = nlapiResolveURL('SUITELET', 'customscript_sut_po_profit_report', '1');
		
		URL = URL + '&purchaseOrdersearch=' + purchaseOrdersearch + '&purchaseOrder=' + purchaseOrder;
		
		window.location = URL;
	}
	
}
