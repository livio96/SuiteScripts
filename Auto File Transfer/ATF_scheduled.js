function importToFileCabinet() {

    var todays_date = new Date();
    var today_date = nlapiDateToString(todays_date);
    var day = todays_date.getDay() + parseInt(1);


    var customrecord_auto_file_transferSearch = nlapiSearchRecord("customrecord_auto_file_transfer", null,
        [
            ["isinactive", "is", "F"],
            "AND",
            ["custrecord_schedule", "anyof", day]
        ],
        [
            new nlobjSearchColumn("name").setSort(false),
            new nlobjSearchColumn("custrecord_external_source_url"),
            new nlobjSearchColumn("custrecord_destination_folder_id"),
            new nlobjSearchColumn("custrecord_schedule"),
            new nlobjSearchColumn("custrecord_deny_file_replacement"),
            new nlobjSearchColumn("internalid")

        ]
    );

    if (customrecord_auto_file_transferSearch) {
        var i = 0;
        var search_length = customrecord_auto_file_transferSearch.length;

        for (i = 0; i < search_length; i++) {

            var file_name = customrecord_auto_file_transferSearch[i].getValue("name");
            var source_url = customrecord_auto_file_transferSearch[i].getValue("custrecord_external_source_url");
            var destination_folder_id = customrecord_auto_file_transferSearch[i].getValue("custrecord_destination_folder_id");
            var internal_id = customrecord_auto_file_transferSearch[i].getValue("internalid");
            var deny_file_replacement = customrecord_auto_file_transferSearch[i].getValue("custrecord_deny_file_replacement");


            if (deny_file_replacement === 'T') {
                file_name = file_name + today_date;
            }


            var response = nlapiRequestURL(source_url);
            var fileData = response.getBody();
            var file = nlapiCreateFile(file_name, 'CSV', fileData);
            file.setFolder(destination_folder_id);

            nlapiSubmitFile(file);

            if (internal_id != null) {
                nlapiLogExecution('Debug', 'Date', today_date);
                var rec = nlapiLoadRecord('customrecord_auto_file_transfer', internal_id)
                rec.setFieldValue('custrecord_last_transfer', today_date);
                nlapiSubmitRecord(rec)
            }

        }
    }


}
