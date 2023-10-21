/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/record', 'N/search', 'N/ui/serverWidget'], function(record, search, serverWidget) {
    function onRequest(context) {
        var html = '<html><body><h1>Hello World</h1></body></html>';
        context.response.write(html);
        context.response.setHeader({
            name: 'Custom-Header-Demo',
            value: 'Demo'
        });
    }

    return {
        onRequest: onRequest
    };
});
