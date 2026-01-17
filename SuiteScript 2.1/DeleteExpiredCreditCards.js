/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/log', 'N/query'], function (record, log, query) {
    function execute(context) {
        log.audit({
            title: 'Script Started',
            details: 'Searching for expired payment cards'
        });

        let cardsProcessed = 0;
        let cardsDeleted = 0;
        let errorCount = 0;
        const BATCH_SIZE = 200;

        try {
            const sql = `
                SELECT id, mask, nameoncard, state, entity
                FROM paymentcard
                WHERE TO_DATE('01/' || SUBSTR(mask, INSTR(mask, '(') + 1, INSTR(mask, ')') - INSTR(mask, '(') - 1), 'DD/MM/YYYY') < TRUNC(SYSDATE, 'MM')
                AND isinactive = 'F'
                AND ROWNUM <= ${BATCH_SIZE}
            `;

            const results = query.runSuiteQL({ query: sql }).asMappedResults();

            log.audit({
                title: 'Query Results',
                details: `Found ${results.length} expired cards (batch limit: ${BATCH_SIZE})`
            });

            results.forEach(function (row) {
                cardsProcessed++;

                log.debug({
                    title: `Expired Card ${cardsProcessed} - ID: ${row.id}`,
                    details: `Entity: ${row.entity} | Mask: ${row.mask} | Name: ${row.nameoncard} | State: ${row.state}`
                });

                try {
                    record.delete({
                        type: 'paymentcard',
                        id: row.id
                    });
                    cardsDeleted++;
                    log.audit({
                        title: 'Card Deleted',
                        details: `Deleted payment card ID: ${row.id}`
                    });
                } catch (e) {
                    errorCount++;
                    log.error({
                        title: 'Delete Error',
                        details: `Card ${row.id}: ${e.message}`
                    });
                }
            });

        } catch (e) {
            log.error({
                title: 'Query Error',
                details: e.message
            });
        }

        log.audit({
            title: 'Script Completed',
            details: `Processed ${cardsProcessed} expired cards. Deleted ${cardsDeleted}. Errors: ${errorCount}`
        });
    }

    return {
        execute: execute
    };
});
