function inventory_item_import() {
  
     nlapiLogExecution('Debug', 'Status', 'Import started...')
    var mappingFileId = 330; //using internal id of Saved CSV Import
    var primaryFile = nlapiLoadFile(14234026 ); //using the internal id of the file stored in the File Cabinet
    var job = nlapiCreateCSVImport();
    job.setMapping(mappingFileId);
    job.setPrimaryFile(primaryFile);
    job.setOption("jobName", "Update Website Quantities");

    //returns the internal id of the new job created in workqueue
    var jobId = nlapiSubmitCSVImport(job);


}

function non_inventory_item_import() {
  
    var mappingFileId = 310; //using internal id of Saved CSV Import
    var primaryFile = nlapiLoadFile(13987488); //using the internal id of the file stored in the File Cabinet

    var job = nlapiCreateCSVImport();
    job.setMapping(mappingFileId);
    job.setPrimaryFile(primaryFile);
    job.setOption("jobName", " Scheduled Parent Item Update");

    //returns the internal id of the new job created in workqueue
    var jobId = nlapiSubmitCSVImport(job);


}