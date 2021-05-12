function block_customer_creation(){
  
   		var user_role = nlapiGetRole(); 
       //if user role is sales rep or sales rep training.
      if(user_role == '1027' || user_role == '1022')
		throw nlapiCreateError('E010', 'Access Denied! ', true);

}