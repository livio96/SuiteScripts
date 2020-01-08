function importToFileCabinet(){
  nlapiLogExecution('Debug', 'Test', 'Entry')
  var response = nlapiRequestURL('https://www.dropbox.com/s/l0l0pr2bo71zyso/test.csv?dl=0');
var csvDataInBase64 = response.getBody();
var file = nlapiCreateFile('test.csv', 'CSV', csvDataInBase64);
file.setFolder(1) ;
  
  nlapiSubmitFile(file);
    nlapiLogExecution('Debug', 'done', 'done')

}

