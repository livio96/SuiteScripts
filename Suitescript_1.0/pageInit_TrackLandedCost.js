//Created by Frank Lozano SuiteScript 1.0

function pageInit_Inventory(type){
  
nlapiLogExecution('Debug', 'type: ', type);
  
 if(type==='create') {
alert("Please Make Sure Mandatory fields are set:  \n1.Use Bins \n2.Track Landed Cost\nCreated by: Frank Lozano");
nlapiLogExecution('Debug', 'Enter', 'Enter');
var mandatoryFieldLandedCost = nlapiGetFieldValue('tracklandedcost');
nlapiLogExecution('Debug', 'Mandatory Field', mandatoryFieldLandedCost);
var trackLandedCost = nlapiSetFieldValue('tracklandedcost', 'T');
  
 }
};
