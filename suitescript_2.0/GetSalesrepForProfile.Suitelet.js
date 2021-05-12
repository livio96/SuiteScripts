function getSalesRep(request, response) {
    var out = {status: 'ERROR'};

    try {
        var customerId = request.getParameter('customerId');
		var customer=nlapiLookupField('customer', customerId, ['salesrep.entityid','salesrep','salesrep.phone','salesrep.email','category']);
        var salesrepName = customer['salesrep'];
       // nlapiLogExecution('DEBUG', 'salesrepName', JSON.stringify(salesrepName));
        var salesrep = customer['salesrep.entityid'];
        //nlapiLogExecution('DEBUG', 'salesrep', JSON.stringify(salesrep));
        var salesrepPhone = customer['salesrep.phone'];
        //nlapiLogExecution('DEBUG', 'salesrepPhone', JSON.stringify(salesrepPhone));
        var salesrepEmail = customer['salesrep.email'];
        //nlapiLogExecution('DEBUG', 'salesrepEmail', JSON.stringify(salesrepEmail));
        var category = customer['category'];
        //nlapiLogExecution('DEBUG', 'category', category);
        out.status = 'OK';
        out.salesrep = {
            name: salesrep,
            phone: salesrepPhone,
            email: salesrepEmail
        };
		out.customer = {
            category: category, 
        };
        nlapiLogExecution('DEBUG', 'out', JSON.stringify(out));
    } catch(e) {
        out.message = e;
        out.status = 'ERROR';
        nlapiLogExecution('ERROR', 'Error', e);
    }

    response.write(JSON.stringify(out));
}

/*function getSalesRep(request, response) {
    var out = {status: 'ERROR'};

    try {
        var customerId = request.getParameter('customerId');
        var salesrepName = nlapiLookupField('customer', customerId, 'salesrep.entityid');
        out.status = 'OK';
        out.salesrep = salesrepName;
    } catch(e) {
        out.message = e;
        nlapiLogExecution('ERROR', 'Error', e);
    }

    response.write(JSON.stringify(out));
}*/