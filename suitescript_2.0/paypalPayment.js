function PayPal_payment_method(){
	
	var paypalcheckbox = nlapiGetFieldValue('custbody_celigo_import_paypal'); 
  	   
  if (paypalcheckbox === 'T'){
    nlapiSetFieldValue('paymentmethod', '26');
  }
	

}