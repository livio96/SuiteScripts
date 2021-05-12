/**
*@NApiVersion 2.x
*@NScriptType ScheduledScript
*/

/*
** Description: This script is used to create the commission plan records on every month 1st based on the custom records.
** @libraries used:
** @client: 
** @author: 
** @dated:  
** @version: 2.0
** @type: ScheduledScript
/******************************************************************************************/
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format'],
function(search, record, runtime, file, format){
    return{ 
        execute: function(context)
        {
            try
            {   
				/* var script = runtime.getCurrentScript();
				var customDate = script.getParameter({ name:'custscript_today_date' }); 
					log.debug({ title:'customDate', details: customDate }); */
					
				var date = new Date();
				var dd = date.getDate();
				var mm = date.getMonth()+1;
				var yyyy = date.getFullYear();
				
				var sd = mm+'/01/'+yyyy; 
				log.debug({ title:'sd', details: sd });
				log.debug({ title:'mm', details: mm });
				var lastDate = new Date(yyyy, mm, 0);
					log.debug({ title:'lastDate', details: lastDate });
					
				var dd = lastDate.getDate();
				var mm = lastDate.getMonth()+1;
				var yyyy = lastDate.getFullYear();
				
				var ld = mm+'/'+dd+'/'+yyyy; 
				log.debug({ title:'ld', details: ld });	
				yyyy = ''+yyyy;
				
				lastDate = format.parse({ value: lastDate, type: format.Type.DATE });
					log.debug({ title:'lastDate', details: lastDate });
					
				var initialFormattedDateString = new Date(sd);
				var startDate = format.parse({ value: initialFormattedDateString, type: format.Type.DATE });
					log.debug({ title:'startDate', details: startDate });
				
				//cps = Commission Plan Setting
				var customrecord10SearchObj = search.create({
											   type: "customrecord_commiss_plan_setting_deatai",filters:[ ["custrecord_comm_plan_settling_ref.isinactive","is","F"], "AND",
												["custrecord_commission_month","anyof", mm],
												"AND", ["custrecord_year_cps_details","is", yyyy] ],
											   columns:
											   [
												  search.createColumn({name: "internalid", label: "Internal ID"}),
												  search.createColumn({name: "custrecord_target_from",sort: search.Sort.ASC,label: "Target (From)"}),
												  search.createColumn({name: "custrecord_comm_schedule",sort: search.Sort.ASC,label: "Commission Schedule"}),
												  search.createColumn({name: "custrecord_target_to", label: "Target (To)"}),
												  search.createColumn({name: "custrecord_commission_month", label: "custrecord_commission_month"}),
												  search.createColumn({name: "custrecord_comm_plan_settling_ref", label: "Commission Plan Setting Ref"}),
												  search.createColumn({name: "custrecord_employee",join: "CUSTRECORD_COMM_PLAN_SETTLING_REF",label: "Employee"}),
												  
											   ]}).run();

				if(customrecord10SearchObj)
				{
					var cpsArr = [];
					var empArr = [];
					var commissionSche = [];
					var commissionScheName = [];
					var monthArr = [];
					var cpsdArr = [];
					
					var searchResults = customrecord10SearchObj.getRange(0,1000);
					log.debug({ title:'searchResults', details: searchResults.length });
					for(var s = 0; s<searchResults.length; s++)
					{
						var cps_Id = searchResults[s].getValue({ name: "custrecord_comm_plan_settling_ref" });
						var index = cpsArr.indexOf(cps_Id);
						if(index == -1 )
						{
							cpsArr.push(cps_Id);
							var employee = searchResults[s].getValue({ name: "custrecord_employee",join: "CUSTRECORD_COMM_PLAN_SETTLING_REF" });
							var commissionSchedule = searchResults[s].getValue({ name: "custrecord_comm_schedule" });
							var month = searchResults[s].getValue({ name: "custrecord_commission_month" });
							var commissionScheduleName = searchResults[s].getText({ name: "custrecord_comm_schedule" });
							var cpsdId = searchResults[s].getValue({ name: "internalid" });
							log.debug({ title:'month', details: month });
							if(commissionSche.indexOf(commissionSchedule) != -1)
							{
								var ind = commissionSche.indexOf(commissionSchedule);
								
								var empVal = empArr[ind];
								empVal = empVal +','+employee;
								empArr[ind] = empVal;
								
								var cpsdIdVal = cpsdArr[ind];
								cpsdIdVal = cpsdIdVal +','+cpsdId;
								cpsdArr[ind] = cpsdIdVal;
								
								monthArr.push(month);
							}
							else
							{
								monthArr.push(month);
								commissionSche.push(commissionSchedule);
								commissionScheName.push(commissionScheduleName);
								empArr.push(employee);
								cpsdArr.push(cpsdId);
							}
						}
					}
				}
				log.debug({ title:'cpsArr', details: cpsArr });
				log.debug({ title:'empArr', details: empArr });
				log.debug({ title:'commissionSche', details: commissionSche });
				log.debug({ title:'commissionScheName', details: commissionScheName });
				log.debug({ title:'monthArr', details: monthArr });
				log.debug({ title:'cpsdArr', details: cpsdArr });
				
				var count = 0;
				var cpsRecId = '';
				if(cpsArr.length > 0)
				{
					if( (empArr.length == commissionSche.length) )
					{
						for(var a =0;a<commissionSche.length; a++)
						{
							var saveFlag = 0;
							var name = commissionScheName[a]+'  '+sd+' - '+ld;
								log.debug({ title:'name', details: name });
							var commissionSchedule = commissionSche[a];
								log.debug({ title:'commissionSchedule', details: commissionSchedule });
							var empVal = empArr[a];
								log.debug({ title:'empVal', details: empVal });
							empVal = empVal.split(',');
								log.debug({ title:'empVal', details: empVal });
							var employeeArr = [];
							
							var cpsRec = record.create({ type: 'commissionplan', isDynamic: true });
								
							cpsRec.setValue({ fieldId: 'planname', value: name });
							
							cpsRec.selectNewLine({ sublistId: 'planscheds'});
								cpsRec.setCurrentSublistValue({ sublistId:'planscheds', fieldId: 'schedule', value: commissionSchedule });
							cpsRec.commitLine({ sublistId: 'planscheds'});
							
							for(var r=0; r<empVal.length; r++)
							{
								var emp = empVal[r];
								employeeArr.push(emp);
								if(emp)
								{	
									employeeArr.push(emp);
									log.debug({ title:'emp', details: emp });
									cpsRec.selectNewLine({ sublistId: 'planreps'});
									cpsRec.setCurrentSublistValue({ sublistId:'planreps', fieldId: 'entity', value: emp });
									cpsRec.setCurrentSublistValue({ sublistId:'planreps', fieldId: 'dfrom', value: startDate });
									cpsRec.setCurrentSublistValue({ sublistId:'planreps', fieldId: 'dto', value: lastDate });
									cpsRec.commitLine({ sublistId: 'planreps'});
									
									saveFlag = 10;
								}
							}
							if(saveFlag == 10)
							{
								cpsRecId = cpsRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
						
								log.debug({ title:'cpsRecId', details: cpsRecId });
								saveFlag = 0;
								
								var custRec = record.create({ type: 'customrecord_commission_plan_replica' });
									custRec.setValue({ fieldId: 'custrecord_comm_month', value: mm});
									custRec.setValue({ fieldId: 'custrecord_commission_sche', value: commissionSchedule });
									custRec.setValue({ fieldId: 'custrecord_comm_id', value: cpsRecId });
									custRec.setValue({ fieldId: 'custrecord_emp_commission', value: employeeArr });
									custRec.setValue({ fieldId: 'custrecord_year_cps_replica', value: yyyy });
								
								var replicaRecId = custRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
								log.debug({ title:'replicaRecId', details: replicaRecId });
								
								var cpsdIdVal = cpsdArr[a];
									log.debug({ title:'cpsdIdVal', details: cpsdIdVal });
								cpsdIdVal = cpsdIdVal.split(',');
								
								for(var e=0;e<cpsdIdVal.length; e++)
								{
									if(cpsdIdVal[e])
									{
										var cpsdId = record.submitFields({ type: 'customrecord_commiss_plan_setting_deatai', id: cpsdIdVal[e], values: { 'custrecord_commission_plan_id' : cpsRecId },
																				options: { enableSourcing: false,ignoreMandatoryFields : true } });
																				
										log.debug({ title:'cpsdId', details: cpsdId });
									}
								} 
							}
						}
					}
				} 
				if(cpsRecId)
				{
					var name = "TelQuest 16.6%"+'  '+sd+' - '+ld;
					var cpsRec = record.create({ type: 'commissionplan', isDynamic: true });
								
					cpsRec.setValue({ fieldId: 'planname', value: name });
							
					cpsRec.selectNewLine({ sublistId: 'planscheds'});
						cpsRec.setCurrentSublistValue({ sublistId:'planscheds', fieldId: 'schedule', value:  3 });
					cpsRec.commitLine({ sublistId: 'planscheds'});
					
					var cpsRecId1 =  cpsRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
						log.debug({ title:'cpsRecId1', details: cpsRecId1 });
						
					if(cpsRecId1)
					{
						var custRec = record.create({ type: 'customrecord_commission_plan_replica', isDynamic: true });
							custRec.setValue({ fieldId: 'custrecord_comm_month', value: mm});
							custRec.setValue({ fieldId: 'custrecord_commission_sche', value:  3 });
							custRec.setValue({ fieldId: 'custrecord_comm_id', value: cpsRecId1 });
							//custRec.setValue({ fieldId: 'custrecord_emp_commission', value: employeeArr });
							custRec.setValue({ fieldId: 'custrecord_year_cps_replica', value: yyyy });
						
						var replicaRecId = custRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
						log.debug({ title:'replicaRecId', details: replicaRecId });
					}
					
					var name = "TelQuest 20%"+'  '+sd+' - '+ld;
					var cpsRec = record.create({ type: 'commissionplan', isDynamic: true });
								
					cpsRec.setValue({ fieldId: 'planname', value: name });
							
					cpsRec.selectNewLine({ sublistId: 'planscheds'});
						cpsRec.setCurrentSublistValue({ sublistId:'planscheds', fieldId: 'schedule', value: 5 });
					cpsRec.commitLine({ sublistId: 'planscheds'});
					
					var cpsRecId1 =  cpsRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
						log.debug({ title:'cpsRecId1', details: cpsRecId1 });
						
					if(cpsRecId1)
					{
						var custRec = record.create({ type: 'customrecord_commission_plan_replica', isDynamic: true });
							custRec.setValue({ fieldId: 'custrecord_comm_month', value: mm});
							custRec.setValue({ fieldId: 'custrecord_commission_sche', value:  5 });
							custRec.setValue({ fieldId: 'custrecord_comm_id', value: cpsRecId1 });
							//custRec.setValue({ fieldId: 'custrecord_emp_commission', value: employeeArr });
							custRec.setValue({ fieldId: 'custrecord_year_cps_replica', value: yyyy });
						
						var replicaRecId = custRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
						log.debug({ title:'replicaRecId', details: replicaRecId });
					}
				} 
			}
            catch(e)
            {
				 var errorRec = record.create({ type:'customrecord_error_rec_commission_plan'});
					errorRec.setValue({ fieldId: 'custrecord_schedule_error', value : e.toString() });
					errorRec.setValue({ fieldId: 'custrecord_schedule_error_on', value : ''+new Date()});
					errorRec.setValue({ fieldId: 'custrecord_schedule_script', value : 1896 });
					//errorRec.setValue({ fieldId: '', value : });
				var errorId = errorRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
					log.debug({ title:'errorId', details: errorId });
					
                log.debug({ title:'Error', details: e.toString() });
            }
        }
    };
});