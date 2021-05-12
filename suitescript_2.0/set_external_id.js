function external_id_create(){
	

	var item_id = nlapiGetFieldValue('custrecord16')

	var itemSearch = nlapiSearchRecord("item",null,
[
   ["internalid","anyof", item_id]
], 
[
   new nlobjSearchColumn("itemid")
]
);

   var name = itemSearch[0].getValue('itemid');

	nlapiSetFieldValue('externalid', name);
}

function external_id_create_prev_sales_summary(){
	

	var item_id = nlapiGetFieldValue('custrecord16')

	var itemSearch = nlapiSearchRecord("item",null,
[
   ["internalid","anyof", item_id]
], 
[
   new nlobjSearchColumn("itemid")
]
);

   var name = itemSearch[0].getValue('itemid');

	nlapiSetFieldValue('externalid', name);
}