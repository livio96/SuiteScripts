/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/runtime', 'N/file', 'N/format', 'N/log'],

    function(search, record, runtime, file, format, log) {
      function afterSubmit(scriptContext) {
      var newRecord = scriptContext.newRecord;
      var type = newRecord.getValue({
        fieldId: 'custrecord_celigo_amzio_set_tran_ty_txt'
      });


      if(type === "Refund"){
        var id = newRecord.getValue({
          fieldId: 'scriptid'
        });

        var tranSearch = search.create({
          type: "customrecord_celigo_amzio_settle_trans",
          filters:
          [
            ["custrecord_celigo_amzio_set_tran_type","anyof","2"],
            "AND",
            ["custrecord_celigo_amzio_set_ip_par_trans.custrecord_celigo_amzio_set_ip_mis_am_d","startswith","RestockingFee"],
            "AND",
            ["custrecord_celigo_amzio_set_ip_par_trans.custrecord_celigo_amzio_set_ip_mis_amt","greaterthan","0"],
            "AND",
            ["scriptid","equalto",id]
          ],
          columns:
          [
            search.createColumn({
              name: "custrecord_celigo_amzio_set_order_id",
              summary: "GROUP",
              label: "Order Id"
            }),
            search.createColumn({
              name: "custrecord_celigo_amzio_set_ip_mis_amt",
              join: "CUSTRECORD_CELIGO_AMZIO_SET_IP_PAR_TRANS",
              summary: "SUM",
              label: "Misc Amount"
            })
          ]
        });

        var lines = tranSearch.run();
        var lines_range = lines.getRange(0, 1000);

        if(lines_range.length > 0){
          var restockFee = lines_range[0].getValue({
             name: "custrecord_celigo_amzio_set_ip_mis_amt",
              join: "CUSTRECORD_CELIGO_AMZIO_SET_IP_PAR_TRANS",
              summary: "SUM",
              label: "Misc Amount"
          });

          newRecord.setValue({
            fieldId: 'custrecord_restock_fee',
            value: restockFee
          });
        }
      }
      }
      return {
        afterSubmit: afterSubmit,
      };
    });
