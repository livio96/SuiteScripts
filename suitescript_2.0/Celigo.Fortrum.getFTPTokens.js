function setFTPCreds() {
 var credentials = new Celigo.io.CredentialsManager({ "id":"CELIGO_NEWEGG_CONNECTION"});
		credentials.getHost();
/*       credentials.setHost('ftp.itgbrands.com');
	   credentials.setUserName('celigo');
	   credentials.setPassword('XXXXXXXXx');
  var id = credentials.save(); 
        $$.logExecution('DEBUG', 'Credentials Saved. Id :', id); */
		$$.logExecution('DEBUG', 'credentials.getHost() :', credentials.getHost());
		$$.logExecution('DEBUG', 'credentials.getUserName() :', credentials.getUserName());
		$$.logExecution('DEBUG', 'credentials.getType() :', credentials.getType());
				$$.logExecution('DEBUG', 'credentials.getSecurityKey() :', credentials.getSecurityKey());

						$$.logExecution('DEBUG', 'credentials.getPassword() :', credentials.getPassword());

		
} 
