function prefrredEqp(request, response)
{
	
	if( request.getMethod() == 'GET')
	{
		try{
			//Load ObPreferred Equipment List
			var filters = [];
			filters[0] = new nlobjSearchFilter("isinactive",null,"is","F");
			
			var columns = [];
			columns[0] = new nlobjSearchColumn('internalId');
			columns[1] = new nlobjSearchColumn('name');
			
			
			var prefer_eqp = nlapiSearchRecord('customlist1',null,filters,columns);
			nlapiLogExecution('Debug','prefer_eqp',prefer_eqp.length);
			response.write(JSON.stringify(prefer_eqp));
			
		}
		catch(e)
		{
			nlapiLogExecution('Debug','Error',e);
		}
	
	}
	
}