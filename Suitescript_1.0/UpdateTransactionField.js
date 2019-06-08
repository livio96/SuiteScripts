function UpdateTransactionField(type) {
    
    
    if(type='edit') {
    var paypal_tran_id = nlapiGetFieldValue('paypaltranid') ; 
   
    
    if(paypal_tran_id != null) {

        nlapiSetFieldValue('custbody29', paypal_tran_id) ; 
    
    }
    }


}
