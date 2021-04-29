/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget','N/runtime', 'N/record', 'N/search', 'N/email'],

    function(ui,runtime, record, search, email){
		function beforeLoadShowDueAlert(scriptContext){
			try {
				if (scriptContext.type == 'view' || scriptContext.type == 'edit') {
					var FormRec = scriptContext.form;
					var recType = scriptContext.newRecord.type;
					var i_recordId = scriptContext.newRecord.id;
					
					if (runtime.executionContext == "USERINTERFACE") {
						var CustomerOverdueSearch = search.create({
							type: 'customer',
							filters: [['overduebalance', 'greaterthan', 0], "AND", ['internalid', 'anyOf', i_recordId]],
							columns: [search.createColumn({
								name: 'internalid',
							})]
						}).run().getRange(0, 1000);
						
						if (CustomerOverdueSearch != null && CustomerOverdueSearch != '' && CustomerOverdueSearch != undefined) {
							var DueFieldObj = FormRec.addField({
								id: 'custpage_duealert',
								label: ' ',
								type: ui.FieldType.INLINEHTML,
							});
							
							var DueAlert = "<script>showAlertBox('div__alert', 'WARNING', 'Customer has Overdue Balance !' , NLAlertDialog.WARNING, '100%', null, null, null)</script>"
							
							DueFieldObj.defaultValue = DueAlert;
							
						}
					}
				}
			} 
			catch (err) {
				log.debug('error @ beforeLoad', err)
			}
		}
		return {
			beforeLoad: beforeLoadShowDueAlert
		};
	});