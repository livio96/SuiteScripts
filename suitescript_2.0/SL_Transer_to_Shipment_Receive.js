/**
   *@NApiVersion 2.x
   *@NScriptType Suitelet
  */
/*  
** Description: 
** @libraries used:
** @client: 
** @author: 
** @dated:  
** @version: 2.0
** @type: SUITELET
/******************************************************************************************/
 define(['N/url','N/format','N/search','N/ui/serverWidget','N/record','N/render','N/email'],
function(url,format,search,serverWidget,record,render,email) {
    function onRequest(context) {
        if (context.request.method === 'GET') 
		{
			try
			{
				var tfId =  Number(context.request.parameters.tfId);
				log.debug({ title:'tfId',details: tfId });
				if(tfId)
				{
					try
					{
						var tfRec = record.load({ type: 'transferorder', id: tfId, isDynamic: true });
						var tfLineCount = tfRec.getLineCount({ sublistId: 'item'});
							
						var shipmentRec = record.transform({ fromType: 'transferorder', fromId: tfId, toType: 'itemfulfillment', isDynamic: true });
						var shipLineCount = shipmentRec.getLineCount({ sublistId: 'item'});
							shipmentRec.setValue({ fieldId: 'shipstatus',value: 'C' });
						for(var w=0;w<tfLineCount; w++)
						{
							var serialNumArr = [];
							tfRec.selectLine({ sublistId: 'item', line: w});
							var qty = tfRec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });
							
							var item = tfRec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
							
							var inventoryitemSearchObj = search.create({type: "inventoryitem",
													   filters:
													   [["type","anyof","InvtPart"], 
														  "AND", 
														  ["internalid","anyof", item], 
														  "AND", 
														  ["preferredbin","is", "T"]],
													   columns:
													   [
														  search.createColumn({ name: "preferredbin", label: "Preferred Bin"}),
														  search.createColumn({ name: "binnumber",join: "binNumber",label: "Bin Number"}),
														  search.createColumn({ name: "internalid",join: "binNumber",label: "Internal ID"})] }).run();
							var res = [];
							var binNumber = 5; //Bin A
							if(inventoryitemSearchObj)
							{
								res = inventoryitemSearchObj.getRange(0,1000);
								if(res.length >0)
									binNumber = res[0].getValue({ name: "internalid",join: "binNumber" });
							}
							log.debug({ title:'binNumber',details: binNumber });
							
							var subRec = tfRec.getCurrentSublistSubrecord({ sublistId :'item', fieldId :'inventorydetail'});
							 var subRecLineCount = subRec.getLineCount({ sublistId: 'inventoryassignment'});
								log.debug({ title:'subRecLineCount',details: subRecLineCount });
							
							for(var abcd = 0;abcd<subRecLineCount; abcd++)
							{
								var serialNum = subRec.getSublistValue({sublistId :'inventoryassignment', fieldId: 'issueinventorynumber', line: abcd});
								log.debug({ title:'serialNum',details: serialNum });
								if(serialNum)
									serialNumArr.push(serialNum);
							}
							log.debug({ title:'serialNumArr',details: serialNumArr }); 
							
							
							if(qty == serialNumArr.length)
							{
								log.debug({ title:'qty',details: qty });
								
								shipmentRec.selectLine({ sublistId: 'item', line: w });
								shipmentRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: qty });
								
								var subRec = shipmentRec.getCurrentSublistSubrecord({ sublistId :'item', fieldId :'inventorydetail'});
								var subRecLineCount = subRec.getLineCount({ sublistId: 'inventoryassignment'});
								log.debug({ title:'subRecLineCount',details: subRecLineCount });
								
								for(var s=subRecLineCount-1;s>=0; s--)
								{
									var bin = subRec.getSublistValue({ sublistId :'inventoryassignment', fieldId: 'binnumber', line: s });
									if(bin)
									{
										
									}
									else
									{
										subRec.setSublistValue({ sublistId :'inventoryassignment', fieldId: 'binnumber', line: s, value: binNumber });
									}
									//subRec.removeLine({ sublistId: 'inventoryassignment', line: s})
								} 
								
								/* for(var d=0;d<serialNumArr.length; d++)
								{
									subRec.selectNewLine({ sublistId: 'inventoryassignment' });
									subRec.setCurrentSublistValue({ sublistId :'inventoryassignment', fieldId: 'issueinventorynumber', value: serialNumArr[d] });
									subRec.setCurrentSublistValue({ sublistId :'inventoryassignment', fieldId: 'inventorystatus', value: 1 });
									//subRec.setCurrentSublistValue({ sublistId :'inventoryassignment', fieldId: 'binnumber', value: binNumber });
									subRec.commitLine({ sublistId: 'inventoryassignment'});
								}  */
								
								shipmentRec.commitLine({ sublistId: 'item' });
							}
						}
						var shipmentId = shipmentRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
						log.debug({ title:'shipmentId',details: shipmentId });
						if(shipmentId)  
						{
							var receiptRec = record.transform({ fromType: 'transferorder', fromId: tfId, toType: 'itemreceipt', isDynamic: true });
							receiptRec.setValue({ fieldId : 'landedcostperline', value: true });
							
							for(var abcd = 0;abcd<tfLineCount;abcd++)
							{
								tfRec.selectLine({ sublistId: 'item', line: abcd});
								var qty = Number(tfRec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' }) );
								log.debug({ title:'qty',details: qty });
								log.debug({ title:'serialNumArr',details: serialNumArr });
								
								if(qty == serialNumArr.length)
								{
									receiptRec.selectLine({ sublistId: 'item', line: abcd });
									receiptRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'receive',value: true  });
									receiptRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity',value: qty  });
										
									var subRec = receiptRec.getCurrentSublistSubrecord({ sublistId :'item', fieldId :'inventorydetail'});
									var subRecLineCount = subRec.getLineCount({ sublistId: 'inventoryassignment'});
									log.debug({ title:'subRecLineCount',details: subRecLineCount });
									
									/* for(var s=subRecLineCount-1;s>=0; s--)
									{
										subRec.removeLine({ sublistId: 'inventoryassignment', line: s})
									}  */ 
									
									for(var d=0;d<subRecLineCount; d++)
									{
										log.debug({ title:'d',details: d });
										log.debug({ title:'serialNum',details: serialNumArr[d] });
										
										subRec.selectLine({ sublistId: 'inventoryassignment', line: d });
										//subRec.setCurrentSublistValue({ sublistId :'inventoryassignment', fieldId: 'receiptinventorynumber', value: serialNumArr[d] });
										//subRec.setCurrentSublistValue({ sublistId :'inventoryassignment', fieldId: 'inventorystatus', value: 1 });
										
										var binNum = subRec.getCurrentSublistValue({ sublistId :'inventoryassignment', fieldId: 'binnumber' });
										if(!binNum)
											subRec.setCurrentSublistValue({ sublistId :'inventoryassignment', fieldId: 'binnumber', value: 5 });
										
										subRec.commitLine({ sublistId: 'inventoryassignment'});
									} 
									
									receiptRec.commitLine({ sublistId: 'item' });
									
									receiptRec.selectLine({ sublistId: 'item', line: abcd });
									
									var refurbishmentCost = Number(tfRec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_refurbishment_cost' }));
										log.debug({ title:'refurbishmentCost',details: refurbishmentCost });
									
									if(refurbishmentCost)
									{
										var landedcost = qty*refurbishmentCost;
										var subrec = receiptRec.getCurrentSublistSubrecord({ sublistId: 'item',fieldId: 'landedcost'});
											subrec.selectNewLine({ sublistId:'landedcostdata'});
												subrec.setCurrentSublistValue({ sublistId: 'landedcostdata', fieldId:'costcategory', value: 11 });
												subrec.setCurrentSublistValue({ sublistId: 'landedcostdata', fieldId:'amount', value: landedcost});
											subrec.commitLine({ sublistId: 'landedcostdata' });
											
										receiptRec.commitLine({ sublistId: 'item' });
									}
									
								}
							}
							var receiptId = receiptRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
							log.debug({ title:'receiptId',details: receiptId }); 
							
							var tfId = record.submitFields({ type: 'transferorder', id: tfId, values:{ 'custbody_error_in_refurbishment': '' } });
						
							var validURL = url.resolveRecord({ recordType: 'transferorder', recordId: tfId,isEditMode: false });
			
							context.response.write('<html><head><title>Upload Successful</title></head><body>asfgdsadf<script language="JavaScript" type="text/javascript">window.opener.document.location.href = "'+ validURL +'";window.close();</script></body></html>');
			
						}
					}
					catch(e)
					{
						log.debug({ title:'Error',details:e.toString() });
						
						var error = e.toString();
							log.debug({ title:'Error',details: error.split(',')[2] });
							
						var tfId = record.submitFields({ type: 'transferorder', id: tfId, values:{ 'custbody_error_in_refurbishment': error.split(',')[2] } });
						
						var validURL = url.resolveRecord({ recordType: 'transferorder', recordId: tfId,isEditMode: false });
			
						context.response.write('<html><head><title>Upload Successful</title></head><body>asfgdsadf<script language="JavaScript" type="text/javascript">window.opener.document.location.href = "'+ validURL +'";window.close();</script></body></html>');
			
					}
				}
				/* form.clientScriptModulePath ='./clientValidationsOnBlanketReleaseSL.js'; 	  
				form.addSubmitButton('Submit');
                context.response.writePage(form); */ 
				
			} 
			catch(e)
			{
				log.debug({ title:'Error',details:e.toString() });
			}	
		}
		else
		{
			try
			{
				
			}
			catch(e)
			{
				log.debug({ title:'Error',details:e.toString() });
			}
		}
    }
     return {
          onRequest: onRequest
      };
});
 