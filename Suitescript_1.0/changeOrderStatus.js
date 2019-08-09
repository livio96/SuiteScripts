function ChangeStatus(){

	var status_id = nlapiGetFieldValue('tranid'); 
		nlapiLogExecution('Debug', 'Id ', status_id ) ; 

	if(status_id === 1015634) {
	nlapiLogExecution('Debug', 'Entry', ' Entry' )

	nlapiSetFieldValue('status', 'Pending Approval'); 

	}
}