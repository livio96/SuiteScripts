function duplicate_email_verification() {


    var email_address = nlapiGetFieldValue('email');


    nlapiLogExecution('Debug', 'Email Address', email_address)


    var customerSearch = nlapiSearchRecord("customer", null,
        [
            ["email", "is", "liviob@live.com"],
            "AND",
            ["isinactive", "is", "F"]
        ],
        [
            new nlobjSearchColumn("altname")
        ]
    );

    if (customerSearch) {
        nlapiLogExecution('Debug', 'error', 'This email address already exists. Contact your sales rep! ')
        throw nlapiCreateError('E010', 'This email address already exists. Contact your sales rep! ', true);
    }




}