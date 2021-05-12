/* global PacejetCart */
var PacejetCart = (function(/* ctx */) {
    'use strict';

    function logMe(title, data) {
        nlapiLogExecution('DEBUG', title, (data && JSON.stringify(data)) || data);
    }

    return {
        context: null,
        isExecuting: false,
        nonTaxDiscount: null,
        pageInit: function pageInit() {
            this.context = nlapiGetContext();
            this.executionContext = this.context.getExecutionContext().toString();
        },

        /** - PROMOTION - **/

        shouldCancelExecution: function shouldCancelExecution() {
            if (this.executionContext !== 'webstore') return true;

            var role = parseInt(nlapiGetRole(), 10);
            var user = parseInt(nlapiGetUser() || 0, 10);

            if (role === 17 /* shopper */ || user <= 0) {
                return true;
            }
            return false;
        },

        fieldChanged: function fieldChanged(type, name) {
            var strName = name + '';
            var valueToSet;
            if (this.shouldCancelExecution()) {
                return true;
            }

            if (strName === 'custbody_awa_pj_rate') {
                valueToSet = nlapiGetFieldValue('custbody_awa_pj_rate');
                logMe('SETTING custbody_awa_pj_rate', nlapiGetFieldValue('custbody_awa_pj_rate'));
				nlapiLogExecution('debug','this.executionContext',this.executionContext);
				
                nlapiSetFieldValue('shippingcost', valueToSet, true, true);
            }
            return true;
        }
    };
}(this));
