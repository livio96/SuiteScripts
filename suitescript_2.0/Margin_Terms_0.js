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




// DO NOT EDIT BEYOND THIS POINT


var defaultTerms;
defaultTerms = 'Credit Card';

var originalTerms;

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

var ss_rate = parseFloat(nlapiGetCurrentLineItemValue('item','rate'));
var ss_custcolminselling = parseFloat(nlapiGetCurrentLineItemValue('item','custcolminselling'));
if (Is_Not_Empty(ss_rate) && Is_Not_Empty(ss_custcolminselling) && ss_rate < ss_custcolminselling)
{
alert('Selling price must not be less than minimum selling price for this item. Please remove this item, save the transaction and then contact a supervisor to have this item added to this transaction with revised selling price.');
return false;
}

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
//CalcTotalMargin(0,0);
}

function OnFieldChange(type,fld){

try{
if(fld=='entity'){
window.setTimeout('NewEntityChosen()',500);
nlapiSetFieldText('terms','',true);
}

if(fld=='terms'){
SetTermValue(GetIndex(nlapiGetFieldText('terms')),custbodyterm[GetIndex(nlapiGetFieldText('terms'))]);
}
}catch(err){
}

return true;
}

function NewEntityChosen(){
try{
while(window.status.indexOf('system.netsuite.com...')>-1){
}

if(nlapiGetFieldText('terms')==''){
nlapiSetFieldText('terms',defaultTerms,true);
}

originalTerms = nlapiGetFieldText('terms');

SetTermValue(GetIndex(originalTerms),custbodyterm[GetIndex(originalTerms)]);

nlapiSetFieldValue('custbody_original_terms',originalTerms,true);

}catch(err){
}

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




function OnSave(){

	try{
	
		//"Cod Certified Check"
		//"Credit On Account"
		//"Pre-Payment"
		//"Wire Transfer"

		var term = nlapiGetFieldText('terms');
		var found = 0;
		if ( term == defaultTerms || term == "Cod Certified Check" || term == "Credit On Account" || term == "Pre-Payment" || term == "Wire Transfer" )
		{
			found = 1;
		}

		//if( originalTerms != nlapiGetFieldText('terms') && ( nlapiGetFieldText('terms') != defaultTerms ) ){
		if( originalTerms != nlapiGetFieldText('terms') && found == 0 )
		{

			msg = (originalTerms==defaultTerms)?defaultTerms:originalTerms + ', ' + defaultTerms;
			msg += ", Cod Certified Check, Credit On Account, Pre-Payment or Wire Transfer";

			alert('Please change the Terms to ' + msg + ', and then save this sales order.');
			return false;
			
		}
	
	}catch(err){
	}

	return true;
}





function OnLoad(){

try{
if(nlapiGetFieldText('entity')!=''&&nlapiGetFieldText('entity')!='<Type then tab>'){

while(window.status.indexOf('system.netsuite.com...')>-1){
}

originalTerms = nlapiGetFieldValue('custbody_original_terms');

if(originalTerms==''){
originalTerms = nlapiGetFieldText('terms');

if(originalTerms==''){
nlapiSetFieldText('terms',defaultTerms,true);
originalTerms = defaultTerms;
}

nlapiSetFieldValue('custbody_original_terms',originalTerms,true);

}

SetTermValue(GetIndex(nlapiGetFieldText('terms')),nlapiGetFieldText('terms'));



}
}catch(err){
}
window.setInterval("Tmr()",100);
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


// IS NOT EMPTY
function Is_Not_Empty(value)
{

if(value!=null && value.length!=0)
{
return true
}
else
{
return false
}

}