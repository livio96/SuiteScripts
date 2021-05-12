var tmrTimeOut;
var custbodyterm = new Array();

custbodyterm[0] = '';
custbodyterm[1] = 'Cod Certified Check';
custbodyterm[2] = 'Cod Company Check';
custbodyterm[3] = 'Credit Card';
custbodyterm[4] = 'Credit On Account';
custbodyterm[5] = 'Net 15';
custbodyterm[6] = 'Net 30';
custbodyterm[7] = 'Net 45';
custbodyterm[8] = 'PayPal';
custbodyterm[9] = 'Pre-Payment';
custbodyterm[10] = 'Wire Transfer';
custbodyterm[11] = 'No Charge';
custbodyterm[12] = 'Advance Replacement';
custbodyterm[13] = 'Cash';
custbodyterm[14] = 'Credit Card-Advance Replacement';
custbodyterm[15] = 'Google Checkout';



// DO NOT EDIT BEYOND THIS POINT



function GetIndex(val){
try{
for(x=0;x<custbodyterm.length;x++){
if(custbodyterm[x]==val){return x;}
}
}catch(err){
return -1;
}
return -1;
}


function OnFieldChange(type,fld){
try{

if(fld=='terms'){
SetTermValue(GetIndex(nlapiGetFieldText('terms')),custbodyterm[GetIndex(nlapiGetFieldText('terms'))]);
}
}catch(err){
}

return true;
}

function SetTermValue(val,desc){
try{
if(document.all){
     document.getElementById('custbodyterm_displayval').innerText = desc;
} else{
     document.getElementById('custbodyterm_displayval').textContent = desc;
}
}catch(err){
}
nlapiSetFieldValue('custbodyterm',val,true);
}

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

CalcTotalMargin(amt,totalavgcost);
}catch(err){

}

return true;
}

function CalcTotalMargin(amt,totalavgcost){
try{

var epsilonAmt = amt;
var epsilonTotalAvgCost = totalavgcost;

if(nlapiGetLineItemCount('item')==0){
nlapiSetFieldValue('custbodytotalmargin',"",false);
}else{

for (i=1;i<=nlapiGetLineItemCount('item');i++){

val = parseFloat(nlapiGetLineItemValue('item','amount',i))-0;
if(!isNaN(val)&&val!='Infinity'&&val!='-Infinity'){epsilonAmt += val;}

val = parseFloat(nlapiGetLineItemValue('item','custcoltotalaveragecost',i))-0;
if(!isNaN(val)&&val!='Infinity'&&val!='-Infinity'){epsilonTotalAvgCost += val;}

}

if(epsilonAmt==0){
dblVal = 0;
}else{
dblVal = ((epsilonAmt-epsilonTotalAvgCost)/epsilonAmt) * 100;
}
nlapiSetFieldValue('custbodytotalmargin',ZeroMin(dblVal,false)+"%",false);
}
}catch(err){
}

}


function Tmr(){
CalcTotalMargin(0,0);
}

function OnLoad(){
tmrTimeOut = window.setInterval("Tmr()",100);
try{
if(nlapiGetFieldText('entity')!=''&&nlapiGetFieldText('entity')!='<Type then tab>'){
while(window.status.indexOf('system.netsuite.com...')>-1){
}
SetTermValue(GetIndex(nlapiGetFieldText('terms')),nlapiGetFieldText('terms'));
}
}catch(err){
}
return true;
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