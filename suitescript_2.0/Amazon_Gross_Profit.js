/*Calculate Amazon Gross Profit for FBA & FBM Orders
 * Created by Livio Beqiri
 * 4/30/2020
*/


function amazon_fba_gross_profit(){
    //check if it is an amazon FBA Order
    var is_amazon_order = nlapiGetFieldValue('custbody_celigo_amz_fulfillmentchannel');
     var reimbursement = nlapiGetFieldValue('custbody_amazon_reimbursement');
     var doc_number = nlapiGetFieldValue('tranid');
     var subtotal = nlapiGetFieldValue('subtotal');

    var referral_fee = 0 ;
    var reduced_referral_fee = 0;
    var fulfillment_fee = 0;
    var rate = 0;
    var qty = 0;
    var total_amazon_cost = 0;
   // var item_type = '';

    //if amazon FBA order
    if(is_amazon_order === 'FBA' && reimbursement === 'F'){
        var item_id = nlapiGetLineItemValue('item', 'item', '1');
        var item_name = nlapiGetLineItemValue('item', 'item_display', 1 );
        var item_type = nlapiGetLineItemValue('item', 'itemtype', 1);

        var i = 1 ;
        while(item_id !== null && item_type === 'InvtPart'){
            item_id = nlapiGetLineItemValue('item', 'item', i);
            item_name = nlapiGetLineItemValue('item','item_display',i);
            rate = nlapiGetLineItemValue('item','rate',i);
            qty = nlapiGetLineItemValue('item', 'quantity', i);
			item_type = nlapiGetLineItemValue('item', 'itemtype', i );

            if(item_id !==null && item_type === 'InvtPart'){
                var item_record = nlapiLoadRecord('inventoryitem', item_id);
                referral_fee = item_record.getFieldValue('custitem_amazon_referral_fee') ;
                reduced_referral_fee= item_record.getFieldValue('custitem_reduced_referral_fee') ;
                fulfillment_fee = item_record.getFieldValue('custitem_fba_fulfillment_fee') ;
                if(referral_fee == null || referral_fee == '')
                    referral_fee = parseFloat(0);
                if(fulfillment_fee == null || fulfillment_fee == '')
                    fulfillment_fee = parseFloat(0)
                if(reduced_referral_fee == null || reduced_referral_fee == '')
                    reduced_referral_fee=parseFloat(0);

            }

            if(rate<=100 && item_id !==null){
                var amazon_cost = (parseFloat(rate)*(parseFloat(referral_fee)/100)+parseFloat(fulfillment_fee))*parseFloat(qty);
                nlapiSetLineItemValue('item', 'custcol_amazon_fees', i, nlapiFormatCurrency(amazon_cost) );
               if(amazon_cost != null )
                total_amazon_cost += parseFloat(amazon_cost);
            }
            if(rate>100 && item_id !==null){
                if(reduced_referral_fee == null || reduced_referral_fee == '') {
                var amazon_cost = (parseFloat(rate)*(parseFloat(referral_fee)/100) + parseFloat(fulfillment_fee))*parseFloat(qty);
                 	nlapiSetLineItemValue('item', 'custcol_amazon_fees',i , amazon_cost );
                }
                else{
                  var amazon_cost = (parseFloat(100)*(parseFloat(referral_fee)/100)+ parseFloat(rate-100)*(parseFloat(reduced_referral_fee)/100) + parseFloat(fulfillment_fee))*parseFloat(qty);
                 nlapiSetLineItemValue('item', 'custcol_amazon_fees',i , nlapiFormatCurrency(amazon_cost) );
                }
                if(amazon_cost != null )
                total_amazon_cost += parseFloat(amazon_cost);
            }
                      i= i+1;

        }
        if(total_amazon_cost != null) {
            nlapiSetFieldValue('custbody_total_amazon_fees', nlapiFormatCurrency(total_amazon_cost));
			var standard_gross_profit = nlapiGetFieldValue('estgrossprofit');
            nlapiSetFieldValue('custbody_amazon_gross_profit', nlapiFormatCurrency(standard_gross_profit - total_amazon_cost));
            if(subtotal>0)
            nlapiSetFieldValue('custbody_amazon_gross_profit_percent', ((standard_gross_profit - total_amazon_cost)/subtotal)*100)
            nlapiLogExecution('Debug', 'Success', doc_number)
        }

    }



}


function amazon_fbm_gross_profit(){
    //check if it is an amazon FBM Order
    var is_fbm_amazon_order = nlapiGetFieldValue('custbody_celigo_etail_channel');
    var reimbursement = nlapiGetFieldValue('custbody_amazon_reimbursement');
    var doc_number = nlapiGetFieldValue('tranid');
    var amazon_fulfillment_channel = nlapiGetFieldValue('custbody_celigo_amz_fulfillmentchannel')
    var subtotal = nlapiGetFieldValue('subtotal');

    var referral_fee = 0 ;
    var reduced_referral_fee = 0;
    var fulfillment_fee = 0;
    var rate = 0;
    var qty = 0;
    var total_amazon_cost = 0;
    var item_type = '';

    //if amazon FBM order
    if(is_fbm_amazon_order === '107' && reimbursement === 'F' && amazon_fulfillment_channel != 'FBA'){
        var item_id = nlapiGetLineItemValue('item', 'item', '1');
        var item_name = nlapiGetLineItemValue('item', 'item_display', 1 );
        var item_type = nlapiGetLineItemValue('item', 'itemtype', 1);
        var i = 1 ;
        while(item_id !== null && item_type ==='InvtPart'){
            item_id = nlapiGetLineItemValue('item', 'item', i);
            item_name = nlapiGetLineItemValue('item','item_display',i);
            rate = nlapiGetLineItemValue('item','rate',i);
            qty = nlapiGetLineItemValue('item', 'quantity', i);
            item_type = nlapiGetLineItemValue('item', 'itemtype', i);


            if(item_id !==null && item_type === 'InvtPart'){
                var item_record = nlapiLoadRecord('inventoryitem', item_id);
                referral_fee = item_record.getFieldValue('custitem_amazon_referral_fee') ;
                reduced_referral_fee= item_record.getFieldValue('custitem_reduced_referral_fee') ;
                if(referral_fee == null || referral_fee == '')
                    referral_fee = parseFloat(0);
                if(reduced_referral_fee == null || reduced_referral_fee == '')
                    reduced_referral_fee=parseFloat(0);

            }

            if(rate<=100 && item_id !==null){
                var amazon_cost = (parseFloat(rate)*(parseFloat(referral_fee)/100))*parseFloat(qty);
                nlapiSetLineItemValue('item', 'custcol_amazon_fees', i, nlapiFormatCurrency(amazon_cost) );
                if(amazon_cost != null )
                    total_amazon_cost += parseFloat(amazon_cost);
            }
            if(rate>100 && item_id !==null){
                if(reduced_referral_fee == null || reduced_referral_fee == '') {
                    var amazon_cost = (parseFloat(rate)*(parseFloat(referral_fee)/100))*parseFloat(qty);
                    nlapiSetLineItemValue('item', 'custcol_amazon_fees',i , nlapiFormatCurrency(amazon_cost) );

                }
                else{
                    var amazon_cost = (parseFloat(100)*(parseFloat(referral_fee)/100)+ parseFloat(rate-100)*(parseFloat(reduced_referral_fee)/100))*parseFloat(qty);
                    nlapiSetLineItemValue('item', 'custcol_amazon_fees',i , nlapiFormatCurrency(amazon_cost) );

                }
                if(amazon_cost != null )
                    total_amazon_cost += parseFloat(amazon_cost);
            }
            i= i+1;

        }
        if(total_amazon_cost != null) {
            nlapiSetFieldValue('custbody_total_amazon_fees', nlapiFormatCurrency(total_amazon_cost));
            var standard_gross_profit = nlapiGetFieldValue('estgrossprofit');
            nlapiSetFieldValue('custbody_amazon_gross_profit', nlapiFormatCurrency(standard_gross_profit - total_amazon_cost));
            if(subtotal>0)
            nlapiSetFieldValue('custbody_amazon_gross_profit_percent', ((standard_gross_profit - total_amazon_cost)/subtotal)*100)
            nlapiLogExecution('Debug', 'Success', doc_number)
        }

    }



}


