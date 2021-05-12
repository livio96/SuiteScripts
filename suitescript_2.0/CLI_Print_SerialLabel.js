function printseriallabel() 
{
    var recordid = nlapiGetRecordId();

    var url = nlapiResolveURL('SUITELET', 'customscript_sut_print_serial_label', '1')

    var URLWithParam = url + '&Rid=' + recordid;

    window.open(URLWithParam, '_blank')
}


// END FUNCTION =====================================================
