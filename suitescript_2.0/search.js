them within the sealed function.

/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(['N/search', 'N/log'],
    function(search, log) {
        return {beforeLoad: beforeLoad};

        function beforeLoad(context){

            var srch = search.create({type: 'itemfulfillment', filters: [], columns:[]};

            var srchResults = srch.run();

            srchResults.each(function(result){
                log.debug('Result', result.id);
            });
        }
    }
);
