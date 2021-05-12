var tmrTimeOut;

function CommitLine(){
dblVal = nlapiGetCurrentLineItemValue('item', 'quantity') * nlapiGetCurrentLineItemValue('item', 'custcolaveragecost');
nlapiSetCurrentLineItemValue('item','custcoltotalaveragecost',Math.round(dblVal*100)/100,false);

dblVal = ((nlapiGetCurrentLineItemValue('item', 'amount') - nlapiGetCurrentLineItemValue('item', 'custcoltotalaveragecost')) / nlapiGetCurrentLineItemValue('item', 'amount')) * 100;
nlapiSetCurrentLineItemValue('item','custcolmargin',Math.round(dblVal*100)/100);

var amt = 0;
var totalavgcost = 0;

if(nlapiGetCurrentLineItemIndex('item')!=nlapiGetLineItemCount('item')){
amt = parseFloat(nlapiGetCurrentLineItemValue('item', 'amount'));
totalavgcost = parseFloat(nlapiGetCurrentLineItemValue('item', 'custcoltotalaveragecost'));
}

CalcTotalMargin(amt,totalavgcost);

return true;
}

function CalcTotalMargin(amt,totalavgcost){
try{
var epsilonAmt = amt;
var epsilonTotalAvgCost = totalavgcost;

for (i=1;i<=nlapiGetLineItemCount('item');i++){
epsilonAmt += parseFloat(nlapiGetLineItemValue('item','amount',i));
epsilonTotalAvgCost += parseFloat(nlapiGetLineItemValue('item','custcoltotalaveragecost',i));
}

dblVal = ((epsilonAmt-epsilonTotalAvgCost)/epsilonAmt) * 100;
if(!isNaN(dblVal)){nlapiSetFieldValue('custbodytotalmargin',(Math.round(dblVal*100)/100)+"%",false)}
}
catch(err){
}

}

function Tmr(){
CalcTotalMargin(0,0);
}

function OnLoad(){
tmrTimeOut = window.setInterval("Tmr()",100);
}