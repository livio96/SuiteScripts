/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/config','N/file', 'N/render', 'N/record', 'N/search','N/format','N/xml'],

    function(config, file, render, rec, search, format, NSXML){
		function onRequestPrintRTV(context){
			try {
			
				var record = {};
				var RequestrecId = context.request.parameters.rtvid;
				//var RequestrecId = 18862221;
				
				var o_RTVObj = rec.load({
					type: 'vendorreturnauthorization',
					id: RequestrecId,
					isDynamic: true,
				});
				
				var tranid = o_RTVObj.getValue({
					fieldId: 'tranid'
				});
				
				var memo = o_RTVObj.getValue({
					fieldId: 'memo'
				});
				
				var Vendor = o_RTVObj.getText({
					fieldId: 'entity'
				});
				
				if (Vendor != null && Vendor != '' && Vendor != undefined) {
					Vendor = NSXML.escape({
						xmlText: Vendor
					});
				}
				
				var trandate = o_RTVObj.getValue({
					fieldId: 'trandate'
				});
				
				var usertotal = o_RTVObj.getValue({
					fieldId: 'custbody_rtv_po_amount'
				});
				
				if (usertotal != null && usertotal != '' && usertotal != undefined) {
				
				}
				else {
					usertotal = 0;
				}
				
				record.tranid = tranid;
				record.memo = memo;
				record.entity = Vendor;
				record.total = parseFloat(usertotal).toFixed(2);
				
				
				var Month = (parseInt(trandate.getMonth()) + parseInt(1));
				var Year = trandate.getFullYear();
				var Date = trandate.getDate();
				
				record.trandate = Month + "/" + Date + "/" + Year;
				
				
				var renderer = render.create();
				
				renderer.setTemplateById(132); //Hard coded PDF
				var configRecObj = config.load({
					type: config.Type.COMPANY_INFORMATION
				});
				
				renderer.addCustomDataSource({ //Add JSON data manually
					format: render.DataSource.OBJECT,
					alias: "JSON",
					data: configRecObj
				});
				
				//items
				//quantity,item,rate,amount,description
				var numLines = o_RTVObj.getLineCount({
					sublistId: 'item'
				});
				record.item = [];
				
				for (var i = 0; i < numLines; i++) {
				
					o_RTVObj.selectLine({
						sublistId: 'item',
						line: i
					})
					
					var item = {};
					
					var Item = o_RTVObj.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'item_display'
					});
					var Rate = o_RTVObj.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_associated_cost'
					});
					
					if (Rate != null && Rate != '' && Rate != undefined) {
					
					}
					else {
						Rate = 0;
					}
					
					var description = o_RTVObj.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'description'
					});
					
					var quantity = o_RTVObj.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'quantity'
					});
					var amount = o_RTVObj.getCurrentSublistValue({
						sublistId: 'item',
						fieldId: 'custcol_po_amount'
					});
					
					if (amount != null && amount != '' && amount != undefined) {
					
					}
					else {
						amount = 0;
					}
					
					if (Item != null && Item != '' && Item != undefined) {
						Item = NSXML.escape({
							xmlText: Item
						});
					}
					if (description != null && description != '' && description != undefined) {
						description = NSXML.escape({
							xmlText: description
						});
					}
					
					item.item = Item;
					item.description = description;
					item.quantity = quantity;
					item.rate = parseFloat(Rate).toFixed(2);
					item.amount = parseFloat(amount).toFixed(2);
					
					record.item.push(item);
				}
				log.debug('after item', '--> ' + 'after item');
				
				renderer.addCustomDataSource({
					format: render.DataSource.OBJECT,
					alias: "record",
					data: record
				});
				
				var HTML = renderer.renderAsString();
				log.debug('HTML', '--> ' + HTML);
				
				
				
				var pdfFile = render.xmlToPdf({
					xmlString: HTML
				});
				
				//var newfile = pdfFile.renderAsPdf();
				
				//context.response.setContentType('PDF', 'ReturnCase.pdf', 'inline');
				context.response.writeFile(pdfFile, true);
				
			} 
			catch (error) {
				log.error('error @ onRequest', error)
			}
			
		}
		return {
			onRequest: onRequestPrintRTV
		};
	});
	
	function logValidation(value){
		if (value != null && value != '' && value != undefined) {
			return value;
		}
		else {
			return "";
		}
	}
