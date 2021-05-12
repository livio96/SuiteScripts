function auto_create_fba_rma() {
    var status = nlapiGetFieldValue('custrecord_webstore_rma_pros_status');
    var existing_rma = nlapiGetFieldValue('custrecord_webstore_rma_rma');
   var webstore_order_id = nlapiGetFieldValue('custrecord_webstore_rma_orderid');
    nlapiLogExecution('Debug', 'Started', 'Started')
    if (status === '1' && (existing_rma === null || existing_rma === '')) {
        var invoice_id = nlapiGetFieldValue('custrecord_webstore_rma_invoice_id');

        var item_name = nlapiGetFieldValue('custrecord_webstore_rma_item');
       
        //var item_name = nlapiGetFieldValue('custrecord_webstore_rma_invoice_id');
        var inv_rec = nlapiLoadRecord('invoice', invoice_id);
        var inv_item_line = inv_rec.getLineItemValue('item', 'item', 1);
        var i = 1;
        var total_quantity_sold = parseFloat(0);

        while (inv_item_line != null) {
            inv_item_line = inv_rec.getLineItemValue('item', 'item', i);
            if (inv_item_line != null) {
                var qty_sold = inv_rec.getLineItemValue('item', 'quantity', i);

                i = i + 1;
                total_quantity_sold += parseFloat(qty_sold);
            }



        }


        var customrecord_webstore_rmaSearch = nlapiSearchRecord("customrecord_webstore_rma",null,
            [
                ["custrecord_webstore_rma_orderid","contains",webstore_order_id],
                "AND",
                ["custrecord_webstore_rma_pros_status","anyof","1"]
            ],
            [
                new nlobjSearchColumn("custrecord_webstore_rma",null,"SUM")
            ]
        );

        if (customrecord_webstore_rmaSearch) {
            var qty_returned = customrecord_webstore_rmaSearch[0].getValue("custrecord_webstore_rma",null,"SUM");
            if (qty_returned == total_quantity_sold) {

                nlapiLogExecution('Debug', 'complete', 'complete');
                inv_rec.setFieldValue('custbody_rma_type', '2');
                inv_rec.setFieldValue('custbody_rma_type', '3');
                nlapiSubmitRecord(inv_rec);

                var customrecord_webstore_rmaSearch2 = nlapiSearchRecord("customrecord_webstore_rma", null,
                    [
                        ["custrecord_webstore_rma_pros_status", "anyof", "1"],
                        "AND",
                        ["custrecord_webstore_rma_orderid", "contains", webstore_order_id]
                    ],
                    [
                        new nlobjSearchColumn("custrecord_webstore_rma_orderid", null, "GROUP"),
                        new nlobjSearchColumn("custrecord_webstore_rma", null, "SUM"),
                        new nlobjSearchColumn("internalid", null, "GROUP")
                    ]
                );

                if(customrecord_webstore_rmaSearch2){
                    for (var i = 0; i < customrecord_webstore_rmaSearch2.length; i++) {
                        var internal_id = customrecord_webstore_rmaSearch2[i].getValue("internalid", null, "GROUP");
                        var other_rec = nlapiLoadRecord('customrecord_webstore_rma', internal_id);
                        nlapiLogExecution('Debug', 'internal_id', internal_id);
                        other_rec.setFieldValue('custrecord_webstore_rma_pros_status', '2');
                        nlapiSubmitRecord(other_rec);
                    }
                }

                //create an RMA and auto approve it
                var rma = nlapiTransformRecord('invoice', invoice_id, 'returnauthorization');
                rma.setFieldValue('orderstatus', 'B');
                rma.setFieldValue('custbody_auto_receive_rma', 'T')
                nlapiSubmitRecord(rma, true, true);
                nlapiSetFieldValue('custrecord_webstore_rma_pros_status', '2');



            }


        }
    }

    //if full RMA already exists
    if(status === '1' && existing_rma != null){
        //existing_rma = parseFloat(existing_rma);
        var returnauthorizationSearch = nlapiSearchRecord("returnauthorization",null,
            [
                ["type","anyof","RtnAuth"],
                "AND",
                ["internalid","anyof",existing_rma]
            ],
            [
                new nlobjSearchColumn("internalid",null,"GROUP"),
                new nlobjSearchColumn("quantity",null,"SUM")
            ]
        );
         if(returnauthorizationSearch){
        var existing_return_quantity = returnauthorizationSearch[0].getValue("quantity",null,"SUM");
        existing_return_quantity = parseFloat(existing_return_quantity)*(-1); 
        nlapiLogExecution('Debug', 'RMA Qty', existing_return_quantity);
         }
      
		var customrecord_webstore_rmaSearch = nlapiSearchRecord("customrecord_webstore_rma",null,
            [
                ["custrecord_webstore_rma_orderid","contains",webstore_order_id],
                "AND",
                ["custrecord_webstore_rma_pros_status","anyof","1"]
            ],
            [
                new nlobjSearchColumn("custrecord_webstore_rma",null,"SUM")
            ]
        );

        if (customrecord_webstore_rmaSearch) {
            var qty_returned = customrecord_webstore_rmaSearch[0].getValue("custrecord_webstore_rma",null,"SUM");
            nlapiLogExecution('Debug' , 'qty_returned',qty_returned )
        }
        if(existing_return_quantity == qty_returned ){
          nlapiSetFieldValue('custrecord_webstore_rma_pros_status', '3');
        }
    }


}

