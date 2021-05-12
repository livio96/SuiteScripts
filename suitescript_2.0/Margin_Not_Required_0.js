var tmrTimeOut;

function CommitLine(){
try{
dblVal = nlapiGetCurrentLineItemValue('item', 'quantity') * nlapiGetCurrentLineItemValue('item', 'custcolaveragecost');
nlapiSetCurrentLineItemValue('item','custcoltotalaveragecost',ZeroMin(dblVal,false),false);

divisor = parseFloat(nlapiGetCurrentLineItemValue('item', 'amount')) - 0;

if(divisor==0){
dblVal = 0;
}else{
dblVal = ((nlapiGetCurrentLineItemValue('item', 'amount') - nlapiGetCurrentLineItemValue('item', 'custcoltotalaveragecost')) / nlapiGetCurrentLineItemValue('item', 'amount')) * 100;
}
nlapiSetCurrentLineItemValue('item','custcolmargin',ZeroMin(dblVal,false) + '%');

var amt = 0;
var totalavgcost = 0;

if(nlapiGetCurrentLineItemIndex('item')!=nlapiGetLineItemCount('item')){
amt = parseFloat(nlapiGetCurrentLineItemValue('item', 'amount'))-0;
totalavgcost = parseFloat(nlapiGetCurrentLineItemValue('item', 'custcoltotalaveragecost'))-0;
}

//CalcTotalMargin(amt,totalavgcost);
}catch(err){

}

return true;
}

function CalcTotalMargin(amt, totalavgcost){
	try {
	
		var epsilonAmt = amt;
		var epsilonTotalAvgCost = totalavgcost;
		
		if (nlapiGetLineItemCount('item') == 0) {
			nlapiSetFieldValue('custbodytotalmargin', "", false);
		}
		else {
		
			for (i = 1; i <= nlapiGetLineItemCount('item'); i++) {
			
				val = parseFloat(nlapiGetLineItemValue('item', 'amount', i)) - 0;
				if (!isNaN(val) && val != 'Infinity' && val != '-Infinity') {
					epsilonAmt += val;
				}
				
				val = parseFloat(nlapiGetLineItemValue('item', 'custcoltotalaveragecost', i)) - 0;
				if (!isNaN(val) && val != 'Infinity' && val != '-Infinity') {
					epsilonTotalAvgCost += val;
				}
				
			}
			
			if (epsilonAmt == 0) {
				dblVal = 0;
			}
			else {
				dblVal = ((epsilonAmt - epsilonTotalAvgCost) / epsilonAmt) * 100;
			}
			nlapiSetFieldValue('custbodytotalmargin', ZeroMin(dblVal, false) + "%", false);
		}
	} 
	catch (err) {
	}
	
}


function Tmr(){
//CalcTotalMargin(0,0);
}

function OnLoad(){
tmrTimeOut = window.setInterval("Tmr()",100);
}

function ZeroMin(val,zmin){
try{
if(val=='Infinity'||val=='-Infinity'||isNaN(val)){val=0}
if(zmin&&val<0){val=0}
val = Math.round(val*100)/100;
}catch(err){
return 0;
}
return val;
}


