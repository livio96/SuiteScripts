/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/error','N/https','N/url', 'N/search'],
    function(error, https, url, search){
		function saveRecord_ValidateDuplicate(context){
			var currentRecord = context.currentRecord;
			
			var RecordId = context.currentRecord.id;
			
			var BBPartNumber = currentRecord.getValue({
				fieldId: 'custrecord_bbl_brokerbin_part_number'
			});
			
			var BBItem = currentRecord.getText({
				fieldId: 'custrecord_bbl_item'
			});
			
			if (BBPartNumber != null && BBPartNumber != '' && BBPartNumber != undefined) {
			
			}
			else {
				BBPartNumber = BBItem;
			}
			
			if (RecordId != null && RecordId != '' && RecordId != undefined) {
				var DuplicateSearch = search.create({
					type: "customrecord_bbl",
					filters: [["internalid", "noneOf", RecordId], "AND", ["formulatext:case when {custrecord_bbl_brokerbin_part_number} is null then {custrecord_bbl_item} else {custrecord_bbl_brokerbin_part_number} end", "is", BBPartNumber]],
					columns: [search.createColumn({
						name: "internalid",
						label: "internalid"
					})]
				}).run().getRange(0, 1000);
				
				if (DuplicateSearch != null && DuplicateSearch != '' && DuplicateSearch != undefined) {
					var RECID = DuplicateSearch[0].getValue('internalid')
					alert('Part Number Already Exist RecId - ' + RECID);
					return false;
				}
				
			}
			else {
				var DuplicateSearch = search.create({
					type: "customrecord_bbl",
					filters: ["formulatext:case when {custrecord_bbl_brokerbin_part_number} is null then {custrecord_bbl_item} else {custrecord_bbl_brokerbin_part_number} end", "is", BBPartNumber],
					columns: [search.createColumn({
						name: "internalid",
						label: "internalid"
					})]
				}).run().getRange(0, 1000);
				
				if (DuplicateSearch != null && DuplicateSearch != '' && DuplicateSearch != undefined) {
					var RECID = DuplicateSearch[0].getValue('internalid')
					alert('Part Number Already Exist RecId - ' + RECID);
					return false;
				}
			}
			return true;
		}
		return {
			saveRecord: saveRecord_ValidateDuplicate,
		}
	});