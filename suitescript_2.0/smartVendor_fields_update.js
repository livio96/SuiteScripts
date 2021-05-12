/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 */
define(['N/search', 'N/record', 'N/email', 'N/runtime', 'N/task'],
    function(search, record, email, runtime, task) {
        function execute(context) {
            
            var searchId = 'customsearch_smart_vendor_data';
			  
            try {
                var resultSet=search.load({
                    id: searchId
                }).run(); 
				var startIndex=0;
				var endIndex=1000; 
				var values=1000;
				mainLoop: while(values==1000)
				{
					var searchResult = resultSet.getRange({
										start: startIndex,
										end: endIndex
										}); 
					for (var res=0;res<searchResult.length;res++)
					{			
						var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
						if(remainingUsage<500)
							{		
								log.debug({
								 details: 'remainingUsage res:' +remainingUsage+' '+res
								 });						 
								var scheduleScriptTaskObj = task.create({
								   taskType: task.TaskType.SCHEDULED_SCRIPT,
								   scriptId: runtime.getCurrentScript().id,
								   deploymentId: runtime.getCurrentScript().deploymentId 			   						  
								  });
								scheduleScriptTaskObj.submit();
								
								break mainLoop;
							}		
						var itemSKU=searchResult[res].getText('custrecord_vifi_item');
						log.debug('itemSKU',itemSKU);
						var itemSearchObj = search.create({
						   type: "item",
						   filters:
						   [
							  ["type","anyof","Description","Subtotal","Discount","GiftCert","InvtPart","Group","Kit","Markup","NonInvtPart","OthCharge","Payment","Service"], 
							  "AND", 
							  ["name","is",itemSKU]
						   ],
						   columns:
						   [
							  search.createColumn({name: "itemid", label: "Name"}),
							  search.createColumn({name: "custitem_awa_custom_parent_url", label: "WebStore Parent Url Component"}),
							  search.createColumn({name: "urlcomponent", label: "URL Component"}),
							  search.createColumn({name: "custitem_display_sca", label: "Display in SCA"}),
							  search.createColumn({name: "custitem_awa_is_custom_child", label: "Is Matrix Child"}),
							  search.createColumn({name: "isonline", label: "Display in Web Site"})
						   ]
						});
						var searchResultCount = itemSearchObj.runPaged().count; 
						log.debug('searchResultCount',searchResultCount);
						if(searchResultCount>0){
							var obj={}; 
							itemSearchObj.run().each(function(result){
							   // .run().each has a limit of 4,000 results
							   obj.name=result.getValue('itemid');
							   obj.parentItemURL=result.getValue('custitem_awa_custom_parent_url');
							   obj.currentItemURL=result.getValue('urlcomponent');
							   obj.displayInSCA=result.getValue('custitem_display_sca');
							   obj.isChild=result.getValue('custitem_awa_is_custom_child');
							   return true;
							});
							log.debug('obj',JSON.stringify(obj));
							if(obj && obj.displayInSCA){	
								log.debug('id',searchResult[res].id)
								var rec = record.load({
									type: 'customrecord_awa_vendor_info_items',
									id: searchResult[res].id
								}); 
								if(obj.isChild){
									rec.setValue('custrecord_url_component', obj.parentItemURL);
								}else{
									rec.setValue('custrecord_url_component', obj.currentItemURL);
								}
								rec.setValue('custrecord_parent_display_in_sca', obj.displayInSCA); 
								rec.save();
							}
						
						}	
				
					}
				
						startIndex=endIndex;
						endIndex=startIndex+1000;
						values=searchResult.length;
						  
				}
			 
                
            } catch (e) {                
				 log.error({ details: e });
            }
        }
        return {
            execute: execute
        };
    });
	
 