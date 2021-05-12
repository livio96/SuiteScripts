/**

 *@NApiVersion 2.x

 *@NScriptType MapReduceScript

 */
define(['N/search', 'N/record', 'N/log', 'N/format'],



    function(search, record, log, format) {



        function getInputData(context) {



            /* Load your saved search using the internal ID*/

            log.audit('Searches to Delete');

            var SavedSearchOBJ = search.load({

                id: 'customsearch_old_saved_searches_to_delet', //** Delete: Saved Searches

                type: 'SavedSearch'

            });

            //** Run the saved Search

            var searchResults = SavedSearchOBJ.runPaged().count;

            log.audit("Search count", searchResults);



            return SavedSearchOBJ;

        }



        function map(context) {



            //Parse the JSON out to get search id

            var json = JSON.parse(context.value);

            try

            {



                search.delete({

                    id: json.id

                });

            } catch (e)

            {

                log.error('Saved Search delete FAILED', e + ' : ' + json.id);

            }



        }

        function reduce(context) {

            log.audit('REDUCEP');



            log.audit({

                title: 'Summary',

                details: context

            });

        }



        function summarize(context) {



            // Log details about the script's execution.

            log.audit({

                title: 'Summary',

                details: context

            });

        }

        // Link each entry point to the appropriate function.

        return {

            getInputData: getInputData,

            map: map,

            reduce: reduce,

            summarize: summarize

        };

    });