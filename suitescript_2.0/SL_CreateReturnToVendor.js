/**
   *@NApiVersion 2.x
   *@NScriptType Suitelet
  */
/* 

** Description: Suitlet to create RTV on click on custom button on RMA
** @libraries used:
** @client: 
** @author: 
** @dated:  
** @version: 2.0
** @type: SUITELET
/******************************************************************************************/
define(['N/format','N/search','N/ui/serverWidget','N/record','N/url'],
function(format,search,serverWidget,record,url) 
{
    function createRTV(context) 
	{
        if (context.request.method === 'GET') 
		{
			try
			{
				var rma_id =  context.request.parameters.rma_id;
					log.debug({ title:'rma_id',details:rma_id });
			    
				//Load RA to get Vendor details
				var rmaRec = record.load({ type: 'returnauthorization', id: rma_id, isDynamic: true });
				var vendor = rmaRec.getValue({ fieldId: 'custbody_vendor_for_rtv' });
				var rtv_action = rmaRec.getValue({ fieldId: 'custbody_rtv_action' });
				var loc = rmaRec.getValue({fieldId: 'location'});
				var rtv = rmaRec.getValue({ fieldId: 'custbody_rtv_link'});
				
				if(rtv)
				{
					context.response.write('<h4>Return To Vendor was already created for Return Authorization. Please verify.');
					return;
				}
				else
				{
					//Search to find the item receipt of the RA
					var itemreceiptSearchObj = search.create({
								   type: "itemreceipt",
								   filters:
								   [
									  ["type","anyof","ItemRcpt"], 
									  "AND", 
									  ["mainline","is","T"], 
									  "AND", 
									  ["createdfrom.internalid","anyof",rma_id]
								   ],
								   columns:[search.createColumn({name: "internalid",label: "Internal Id"}) ]}).run();
						
					var res = [], irId = 0;;
					if(itemreceiptSearchObj)
						res = itemreceiptSearchObj.getRange(0,10);
					
					if(res.length>0)
						irId = res[0].getValue({ name: 'internalid'});
					
					if(irId == 0)
						return;
					log.debug({ title:'irId',details:irId });
					
					//Create and set the values on Return to Vendor record
					var rtvRec = record.create({ type: 'vendorreturnauthorization', isDynamic: true });
					rtvRec.setValue({ fieldId: 'entity', value: vendor });
					rtvRec.setValue({ fieldId: 'location', value: loc });
					rtvRec.setValue({ fieldId: 'custbody_rtv_action', value: rtv_action});
					
					//Load Item receipt to find the serail number in the bin to and add the items to RTV
					var irRec = record.load({ type: 'itemreceipt', id: irId, isDynamic : true });
					
					var lineCount = irRec.getLineCount({ sublistId: 'item'});
					var saveRec = 10;
					for(var abcd = 0; abcd< lineCount; abcd++)
					{
						var serialNumsArr = [], qtyArr = [], qtySum = 0, add = 0;
						irRec.selectLine({ sublistId: 'item', line: abcd});
						var item = irRec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item'});
						var isserial = irRec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'isserial'});
						var isnumbered = irRec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'isnumbered'});
						log.debug({ title:'isserial',details:isserial });
						log.debug({ title:'isnumbered',details:isnumbered });
						
						
						var subRec = irRec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail'});
						log.debug({ title:'subRec', details: subRec });
						if(subRec)
						{
							var subLineCount = subRec.getLineCount({ sublistId: 'inventoryassignment' });
							
							for(t=0;t<subLineCount;t++)
							{
								subRec.selectLine({ sublistId: 'inventoryassignment', line: t});
								var binNumber = subRec.getCurrentSublistText({ sublistId: 'inventoryassignment', fieldId: 'binnumber'});
								var qty = subRec.getCurrentSublistText({ sublistId: 'inventoryassignment', fieldId: 'quantity'});
								var serialNum = subRec.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber'});
								log.debug({ title:'binNumber', details: binNumber });
								
								if(binNumber == 'A-RTV-01')
								{
									serialNumsArr.push(serialNum);
									qtyArr.push(qty);
									
									qtySum += Number(qty);
									add = 10;
								}
							}
						}
						log.debug({ title:'serialNumsArr',details:serialNumsArr });
						log.debug({ title:'qtyArr',details:qtyArr });
						log.debug({ title:'qtySum',details:qtySum });
						log.debug({ title:'add',details: add  });
						if(add == 10)
						{
							rtvRec.selectNewLine({ sublistId: 'item'});
							rtvRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item });
							rtvRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: qtySum });
							
							var lookup = search.lookupFields({ type:'item', id: Item, columns: ["averagecost"] });
							if(lookup)
							{
								//alert(lookup.averagecost);
							
								if(lookup.averagecost)
								{
									var avgCost = Number(lookup.averagecost).toFixed(2);
									rtvRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: avgCost });
								}
							}
							if(isserial == 'T' || isnumbered == 'T')
							{
								var rtvSubRec = rtvRec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail'});
							
								for(var w=0;w<serialNumsArr.length;w++)
								{
									rtvSubRec.selectNewLine({ sublistId: 'inventoryassignment' });
									log.debug({ title:'serialNumsArr[w]',details: serialNumsArr[w]  });
									log.debug({ title:'qtyArr[w]',details: qtyArr[w]  });
									
									if(serialNumsArr[w])
										rtvSubRec.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: serialNumsArr[w] });
									if(qtyArr[w])
										rtvSubRec.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: qtyArr[w] });
									
									rtvSubRec.commitLine({ sublistId: 'inventoryassignment'});
								}
							}
							
							rtvRec.commitLine({ sublistId: 'item'});
							saveRec = 10;
						}
						
					}
					if(saveRec == 10)
					{
						rtvRec.setValue({ fieldId: 'custbody_return_auth_on_rtv', value: rma_id});
						
						var id = rtvRec.save(true, true);
						log.debug({ title:'id',details: id });
						
						record.submitFields({ type: 'returnauthorization', id: rma_id, values: { custbody_rtv_link: id} });
						
						var reqURL = url.resolveRecord({ recordType: 'vendorreturnauthorization',recordId: id, isEditMode: false });
						context.response.write('<html><head><title>Upload Successful</title></head><body><script language="JavaScript" type="text/javascript">window.open("'+ reqURL +'","_self" );</script></body></html>')
						
						
					}
				}
			} 
			catch(e)
			{
				log.debug({ title:'Error',details:e.toString() });
			}	
		}
	else
		{
			
		}
	}
     return {
          onRequest: createRTV
      };
  });