function csvImportFunc(){

var mappingFileId = 297; //using internal id of Saved CSV Import
var primaryFile = nlapiLoadFile(12145668); //using the internal id of the file stored in the File Cabinet
 
var job = nlapiCreateCSVImport();
job.setMapping(mappingFileId);
job.setPrimaryFile(primaryFile);
job.setOption("jobName", "ParentUpdate-Scheduled Script");
 
//returns the internal id of the new job created in workqueue
var jobId = nlapiSubmitCSVImport(job);
 
}
