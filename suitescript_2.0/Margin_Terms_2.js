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
custbodyterm[12] = 'Cash';




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





// =======================================================================================
// v2
// February 3, 2009

	/*
	-field is currently free form text and will be changed to rich text
	-Green: if positive %, then set calculated {value} as <FONT color=#008000>{value}</FONT>
	-Red: if negative %, then set calculated {value} as <FONT color=#ff0000>{value}</FONT>
	-Black: if 0%, then set calculated {value} as <FONT color=#000000>{value}</FONT>
	*/
	
	var value = ZeroMin( dblVal, false );
	
	if ( value > 0 )
		nlapiSetFieldValue( 'custbodytotalmargin', "<FONT color=#008000 size=6>" + value + "%</FONT>", false );
	else if ( value < 0 )
		nlapiSetFieldValue( 'custbodytotalmargin', "<FONT color=#ff0000 size=6>" + value + "%</FONT>", false );
	else if ( value == 0 )
		nlapiSetFieldValue( 'custbodytotalmargin', "<FONT color=#000000 size=6>" + value + "%</FONT>", false );
	
	//nlapiSetFieldValue('custbodytotalmargin',ZeroMin(dblVal,false)+"%",false);



// =======================================================================================





}
}catch(err){
}

}

function Tmr(){
CalcTotalMargin(0,0);
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
		var saveRecord = 'true'; //SM
		
		if ( term == defaultTerms || term == "Credit On Account" || term == "Pre-Payment" || term == "Wire Transfer" || term == "Cash")
		{
			found = 1;
		}

		//if( originalTerms != nlapiGetFieldText('terms') && ( nlapiGetFieldText('terms') != defaultTerms ) ){
		if( originalTerms != nlapiGetFieldText('terms') && found == 0 )
		{

			msg = (originalTerms==defaultTerms)?defaultTerms:originalTerms + ', ' + defaultTerms;
			msg += ", Credit On Account, Pre-Payment or Wire Transfer";

			alert('Please change the Terms to ' + msg + ', and then save this sales order.');
			//return false;  - commented out by SM
			saveRecord = 'false';
			
		}
		
		
	    if (nlapiGetFieldValue('custbody_primary_contact_co_alert') == 'F')
		{
				 var entityId = nlapiGetFieldValue('entity');
				// alert ('Entity ID: ' + entityId);
				 
			     //execute saved search to see if any contacts are associated with the customer on the sales order
				 var results = CustomerSavedSearch(entityId);
		          
		//		 alert ('results: ' + results);
				  		 
				 if (results == 0)
				 {
				 	saveRecord = 'false';
					alert('This customer requires a primary contact. Please add a primary contact to this customer. Then save this sales order.');
				 }
				 
				 //check if the line items has a CO item
				 var coItemResults = CheckCOLineItem();
			     
				 
				 if (nlapiGetFieldText('terms') == 'Credit Card' && coItemResults == 0)
				 {
		      	    saveRecord = 'false';
					alert('This sales order requires a CO line item. Please add a CO line item to this sales order. Then save this sales order.');
				 }		 
			}
		
	if (saveRecord == 'false') 
		return false;
	else 
	{
		//set the check box for primary contact to true 
		nlapiSetFieldValue('custbody_primary_contact_co_alert','T');	
		return true;
	}	
	}catch(err){return true;}
	
	
	
}
/**
 * Name: CustomerSavedSearch
 * Purpose:A saved search against the customer record to see if any primary contact is associated with the customer
 * 
 */

function CustomerSavedSearch(entityId)
{
	try {
		var filter;
		//alert ('CustomerSavedSearch');
		filter = new nlobjSearchFilter( 'internalid', null, 'is', entityId);
		
		var results = nlapiSearchRecord('customer', 'customsearch_primary_contacts', filter, null); //10 units used
		//alert ('results: ' + results);
		
		if (results != null) 
			return 1;
		else 
			return 0;
		
	} 
	catch (err){}
		
}

/**
 * Name: CheckCOLineItem
 * Purpose: The purpose of this script is to check the line items on a Sales Order for "CO" item
 * 
 */
function CheckCOLineItem(){
	//var saveRecord;
	var results = 0;
	var item;
	
	try {
		   //iterate through the line items on the Sales Order
		   for ( i = 1; i <= nlapiGetLineItemCount('item'); i++)
	       {
				item = 	nlapiGetLineItemText('item', 'item', i);
			//	alert('item: ' + item);
				
				if (item == 'CO')
				{
					 //saveRecord = 'true';
					 results = 1;
					 break;
				}
				else
				{
				    results = 0;
					continue;
				}
	       }   
	//alert('results: ' + results);
	return results;
		
	}catch(e){}
	
	
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