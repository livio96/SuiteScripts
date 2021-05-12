function WF_ClosePurchaseOrder() {
    var recordID = nlapiGetRecordId();
    nlapiLogExecution('Debug', 'WF_ClosePurchaseOrder', 'recordId' + recordID);

    var s_recordtype = nlapiGetRecordType();
    nlapiLogExecution('Debug', 'WF_ClosePurchaseOrder', 'RecordType' + s_recordtype);
    var o_recordOBJ = nlapiLoadRecord(s_recordtype, recordID);

    var lineCount = o_recordOBJ.getLineItemCount('item');
    nlapiLogExecution('DEBUG', 'WF_ClosePurchaseOrder', 'lines->' + lineCount);

    for (var i = 1; i <= lineCount; i++) {
        var Item = o_recordOBJ.setLineItemValue('item', 'isclosed', i, 'T');
    }

    o_recordOBJ.setFieldValue('custbody_po_close_status', 2);

    var UpdatedID = nlapiSubmitRecord(o_recordOBJ, {
        enablesourcing: false,
        ignoremandatoryfields: true
    });
    nlapiLogExecution('DEBUG', 'WF_ClosePurchaseOrder', 'UpdatedPOID-->' + UpdatedID);

    //nlapiVoidTransaction(RecordType, recordId);

    // nlapiSubmitField('purchaseorder', recordId, 'custbody_po_void_status', '2');
}