function send_email(){
  

// Send an email to xyz@gmail.com
nlapiSendEmail(1, 'xyz@gmail.com', 
               'Invoice Receipt', 'your order has been completed', 
               null, null, null, null, true, null, 'johnsmith@gmail.com');

  
//Attach an email template
/*function send_email(){
 var emailMerger = nlapiCreateEmailMerger(1458);

var mergeResult = emailMerger.merge();
var body = mergeResult.getBody();
var subject = mergeResult.getSubject();

nlapiSendEmail(nlapiGetUser(), 'lbeqiri@telquestintl.com', subject, body, null, null, null, null);

}
*/

}
