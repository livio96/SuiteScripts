function ChangeStatus(){

	var status_id = nlapiGetFieldValue('tranid'); 
		nlapiLogExecution('Debug', 'Id ', status_id ) ;
    var current_status = nlapiGetFieldValue('orderstatus') ; 
    var memo = nlapiGetFieldValue('memo') ; 
  
  
	if(current_status = 'A' && memo === 'CSV IMPORT') {
	nlapiLogExecution('Debug', 'Entry', ' Entry' )

	nlapiSetFieldValue('orderstatus', 'B'); 

	}
}