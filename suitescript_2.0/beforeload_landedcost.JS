function pageInit_landedcost(type){
nlapiLogExecution('Debug', 'Page Init', 'Enter');
//Alert(Currently Working.)
var landedCostValue = nlapiGetFieldValue('landedcostmethod');
nlapiLogExecution('Debug', 'Landed Cost Value: ', landedCostValue);

var defaultLandedCost = nlapiSetFieldValue('landedcostmethod', 'VALUE');
nlapiLogExecution('Debug', 'Page Init', 'Exit');

}
