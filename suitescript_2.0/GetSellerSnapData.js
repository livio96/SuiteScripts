/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(["N/query", "N/search", "N/record", "N/email", "N/runtime", "N/https", "N/format"],
    function(query, search, record, email, runtime, https, format) {
        function smart_webstore_athq(context) {
            try {

                var newRecord = context.newRecord;
                var sku = newRecord.getValue({
                    fieldId: 'name'
                });


                var ns_item = newRecord.getValue({
                    fieldId: 'custrecord_celigo_etail_alias_par_item'
                });

                // Authorization

                //API Authorization
                var Auth_Headers = {};
                Auth_Headers['Content-Type'] = 'application/json';
                Auth_Headers['Accept'] = 'application/json';
                Auth_Headers['Authorization'] = 'Basic d2Vic2l0ZUB0ZWxxdWVzdGludGwuY29tOlNob3BwaW5nMjAxNiM';

                var url_athq = "https://api.sellersnap.io/store/394/listing/data?&sku="
                var url_athq_cr = "https://api.sellersnap.io/store/518/listing/data?&sku="
                var url_athq_discover = "https://api.sellersnap.io/store/379/listing/data?&sku="


                var getData_athq = https.request({
                    method: https.Method.GET,
                    url: url_athq + sku,
                    headers: Auth_Headers
                });

                var getData_athq_cr = https.request({
                    method: https.Method.GET,
                    url: url_athq_cr + sku,
                    headers: Auth_Headers
                });

                var getData_discover = https.request({
                    method: https.Method.GET,
                    url: url_athq_discover + sku,
                    headers: Auth_Headers
                });


                var data_athq = JSON.parse(getData_athq.body);
                var data_athq_cr = JSON.parse(getData_athq_cr.body);
                var data_discover = JSON.parse(getData_discover.body);

                if (data_athq.data != undefined) {

                    var smartweb_rec = record.create({
                        type: 'customrecord_sw',
                        isDynamic: true
                    });

                    smartweb_rec.setValue({
                        fieldId: 'externalid',
                        value: data_athq.data.sku
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_item',
                        value: ns_item
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_sku',
                        value: data_athq.data.sku
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_listing_title',
                        value: data_athq.data.title
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_channel',
                        value: data_athq.data.fulfillment_channel
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_price',
                        value: data_athq.data.listed_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord104',
                        value: data_athq.data.cur_buybox_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_quantity_available',
                        value: data_athq.data.fulfillable_quantity
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_min_price',
                        value: data_athq.data.min_price
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_max_price',
                        value: data_athq.data.max_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_webstore',
                        value: '1'
                    });
                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_account',
                        value: '1'
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_repricing_bool',
                        value: true
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_listing_id',
                        value: data_athq.data.asin
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_listing_image_url',
                        value: data_athq.data.image_url
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_seller_snap_cost',
                        value: data_athq.data.cost
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_min_price',
                        value: data_athq.data.min_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_max_price',
                        value: data_athq.data.max_price
                    });




                    smartweb_rec.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    });

                }

                if (data_athq_cr.data != undefined) {
                    var smartweb_rec = record.create({
                        type: 'customrecord_sw',
                        isDynamic: true
                    });

                    smartweb_rec.setValue({
                        fieldId: 'externalid',
                        value: data_athq_cr.data.sku
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_item',
                        value: ns_item
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_sku',
                        value: data_athq_cr.data.sku
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_listing_title',
                        value: data_athq_cr.data.title
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_channel',
                        value: data_athq_cr.data.fulfillment_channel
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_price',
                        value: data_athq_cr.data.listed_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord104',
                        value: data_athq_cr.data.cur_buybox_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_quantity_available',
                        value: data_athq_cr.data.fulfillable_quantity
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_min_price',
                        value: data_athq_cr.data.min_price
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_max_price',
                        value: data_athq_cr.data.max_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_webstore',
                        value: '1'
                    });
                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_account',
                        value: '3'
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_repricing_bool',
                        value: true
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_listing_id',
                        value: data_athq_cr.data.asin
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_listing_image_url',
                        value: data_athq_cr.data.image_url
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_seller_snap_cost',
                        value: data_athq_cr.data.cost
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_min_price',
                        value: data_athq_cr.data.min_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_max_price',
                        value: data_athq_cr.data.max_price
                    });



                    smartweb_rec.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    });

                }

                if (data_discover.data != undefined) {

                    var smartweb_rec = record.create({
                        type: 'customrecord_sw',
                        isDynamic: true
                    });

                    smartweb_rec.setValue({
                        fieldId: 'externalid',
                        value: data_discover.data.sku
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_sku',
                        value: data_discover.data.sku
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_item',
                        value: ns_item
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_listing_title',
                        value: data_discover.data.title
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_channel',
                        value: data_discover.data.fulfillment_channel
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_price',
                        value: data_discover.data.listed_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord104',
                        value: data_discover.data.cur_buybox_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_quantity_available',
                        value: data_discover.data.fulfillable_quantity
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_min_price',
                        value: data_discover.data.min_price
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_max_price',
                        value: data_discover.data.max_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_webstore',
                        value: '1'
                    });
                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_account',
                        value: '2'
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_repricing_bool',
                        value: true
                    });



                    smartweb_rec.setValue({
                        fieldId: 'custrecord_sw_listing_id',
                        value: data_discover.data.asin
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_listing_image_url',
                        value: data_discover.data.image_url
                    });


                    smartweb_rec.setValue({
                        fieldId: 'custrecord_seller_snap_cost',
                        value: data_discover.data.cost
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_min_price',
                        value: data_discover.data.min_price
                    });

                    smartweb_rec.setValue({
                        fieldId: 'custrecord_max_price',
                        value: data_discover.data.max_price
                    });




                    smartweb_rec.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: true
                    });

                }



            } catch (e) {
                log.error({
                    title: "Error",
                    details: e
                });

            }
        }
        return {
            beforeSubmit: smart_webstore_athq
        };
    });