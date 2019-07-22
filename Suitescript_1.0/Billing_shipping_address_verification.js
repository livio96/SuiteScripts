function quote_approval(){
	

 var bill_addr = nlapiGetFieldValue('billaddr1'); 
 var bill_city = nlapiGetFieldValue('billcity') ;
 var bill_state = nlapiGetFieldValue('billstate') ;
 var bill_country = nlapiGetFieldValue('billcountry') ;
 var bill_zip = nlapiGetFieldValue('billzip') ;
  var order_origin = nlapiGetFieldValue('custbodyorder_origin')
  
 var ship_addr = nlapiGetFieldValue('shipaddr1') ;
 var ship_city = nlapiGetFieldValue('shipcity') ;
 var ship_state = nlapiGetFieldValue('shipstate') ;
 var ship_country = nlapiGetFieldValue('shipcountry') ;
 var ship_zip = nlapiGetFieldValue('shipzip') ;
  
  

    	  nlapiLogExecution('Debug', 'error', bill_addr)
    	  nlapiLogExecution('Debug', 'error', bill_city)
    	  nlapiLogExecution('Debug', 'error', bill_state)
    	  nlapiLogExecution('Debug', 'error', bill_country)
    	  nlapiLogExecution('Debug', 'error', bill_zip)
    	  nlapiLogExecution('Debug', 'error', ship_addr)
    	  nlapiLogExecution('Debug', 'error', ship_city)
    	  nlapiLogExecution('Debug', 'error', ship_state)
      	  nlapiLogExecution('Debug', 'error', ship_country)
    	  nlapiLogExecution('Debug', 'error', ship_zip)

    	
//if order origin is telquestintl.com
if(order_origin = 33) {
  
  if(bill_addr != ship_addr || bill_city!=ship_city || bill_state != ship_state || bill_country != ship_country || bill_zip != ship_zip){
    	  nlapiLogExecution('Debug', 'error', 'Shipping addr does not match billing address')
    	throw nlapiCreateError('E010', 'Unable to process you request! Your shipping address does not match your billing address ', true);
  }

      

  

}

}


