 function setLoggedoutPrice(request, response) {
	nlapiLogExecution('Debug','entry','entry');
   try {
   
	if(request.getMethod() == 'GET')
	{
		
	
	
		var cartItem = request.getParameter('itemid');
		var warranty_info = parseInt(request.getParameter('warranty'));
		nlapiLogExecution('Debug','warranty_info cart',warranty_info);
		//var warranty_info = 90;
		//nlapiLogExecution('Debug','warranty_info',warranty_info);
        var warranty_price;
		if(warranty_info)
		{
			if(warranty_info == 90)
			{
				warranty_price = Number(nlapiLookupField('item',cartItem,'custitem_awa_warranty_90'));
			}
			else if(warranty_info == 180)
			{
				warranty_price = Number(nlapiLookupField('item',cartItem,'custitem_awa_warranty_180'));
			}
			else if(warranty_info == 365)
			{
				warranty_price = Number(nlapiLookupField('item',cartItem,'custitem_awa_warranty_365'));
			}
			else if(warranty_info == 730)
			{
				warranty_price = Number(nlapiLookupField('item',cartItem,'custitem_awa_warranty_730'));
			}
			else if(warranty_info == 1095)
			{
				warranty_price = Number(nlapiLookupField('item',cartItem,'custitem_awa_warranty_1095'));
			}
		}	
		nlapiLogExecution('Debug','warranty_price',warranty_price);
		var inventoryitemSearch = nlapiSearchRecord("inventoryitem",null,
			[
				["type","anyof","InvtPart"], 
					"AND", 
				["internalid","anyof",cartItem]
			], 
			[
				new nlobjSearchColumn("pricelevel","pricing",null), 
				new nlobjSearchColumn("unitprice","pricing",null)
			]
		);
       	
		var price_obj = {};
		var cart_price= [];
		var price_level= [];
		if(inventoryitemSearch)
		{
			for(var i=0;inventoryitemSearch != null && i < inventoryitemSearch.length; i++)
			{ 
		        var pricing_level=inventoryitemSearch[i].getValue("pricelevel","pricing",null);
				var unit_pricing=inventoryitemSearch[i].getValue("unitprice","pricing",null);
				if(pricing_level && unit_pricing)
				{
					price_level.push(pricing_level);	
					cart_price.push(unit_pricing);
					//nlapiLogExecution('Debug','search result',pricing_level+' '+unit_pricing);				
				}
			}
		}
		price_obj.pricelevel = price_level;
		price_obj.unitprice = cart_price;
		price_obj.warranty_price = warranty_price;
		nlapiLogExecution('Debug','warranty_info',JSON.stringify(price_obj));
		response.write(JSON.stringify(price_obj));
		
	}


  }
  catch (e)
  {
  
    nlapiLogExecution('debug','Error',e);
  }

}

