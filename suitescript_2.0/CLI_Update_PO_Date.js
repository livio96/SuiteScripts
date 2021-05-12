function OpenUpdatePODateForm()
{
    var User = nlapiGetUser();

    var i_recordID = nlapiGetRecordId();

    var url = nlapiResolveURL('SUITELET', 'customscript_sut_update_po_date', '1')

    var URLWithParam = url + '&recordID=' + i_recordID;

    popupCenter(URLWithParam, 'Window', 350, 450);

}

function UpdatePurchaseOrder() {

    //alert('so');
    window.location.reload();
}
function popupCenter(url, title, w, h){
	var left = (screen.width / 2) - (w / 2);
	var top = (screen.height / 2) - (h / 2);
	
	return window.open(url, title, 'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);
	
}
