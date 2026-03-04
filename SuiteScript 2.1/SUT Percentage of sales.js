/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define(['N/ui/serverWidget', 'N/search', 'N/runtime', 'N/format'],
    (ui, search, runtime, format) => {

        function getStartOfMonth() {
            const today = new Date();
            return format.format({
                value: new Date(today.getFullYear(), today.getMonth(), 1),
                type: format.Type.DATE
            });
        }

        function getStartOfYear() {
            const today = new Date();
            return format.format({
                value: new Date(today.getFullYear(), 0, 1),
                type: format.Type.DATE
            });
        }

        function getPreviousDay(dateString) {
            const date = format.parse({
                value: dateString,
                type: format.Type.DATE
            });
            const previousDay = new Date(date.getTime() - 24 * 60 * 60 * 1000);
            return format.format({
                value: previousDay,
                type: format.Type.DATE
            });
        }

        function getToday() {
            return format.format({
                value: new Date(),
                type: format.Type.DATE
            });
        }

        function runCustomerAnalysis(dateStart, dateEnd, salesPct, profitPct) {
            let searchResults = [];
            let totalSales = 0;
            let totalProfit = 0;

            const filters = [
                ['type', 'anyof', 'CashSale', 'CustInvc', 'CustCred'], 'AND',
                ['mainline', 'is', 'T'], 'AND',
                ['salesrep', 'anyof', '@CURRENT@'], 'AND',
                ['customer.salesrep', 'anyof', '@ALL@'], 'AND',
                ['trandate', 'within', dateStart, dateEnd]
            ];

            const salesSearch = search.create({
                type: 'transaction',
                settings: [{ name: 'consolidationtype', value: 'ACCTTYPE' }],
                filters: filters,
                columns: [
                    search.createColumn({ name: 'entityid', join: 'customerMain', summary: 'GROUP' }),
                    search.createColumn({ name: 'altname', join: 'customerMain', summary: 'GROUP' }),
                    search.createColumn({ name: 'amount', summary: 'SUM' }),
                    search.createColumn({ name: 'tranestgrossprofit', summary: 'SUM' })
                ]
            });

            salesSearch.run().each(result => {
                const name = result.getValue({ name: 'altname', join: 'customerMain', summary: 'GROUP' });
                const id = result.getValue({ name: 'entityid', join: 'customerMain', summary: 'GROUP' });
                const amount = parseFloat(result.getValue({ name: 'amount', summary: 'SUM' }) || '0');
                const profit = parseFloat(result.getValue({ name: 'tranestgrossprofit', summary: 'SUM' }) || '0');

                totalSales += amount;
                totalProfit += profit;
                searchResults.push({ name, id, amount, profit });
                return true;
            });

            return { searchResults, totalSales, totalProfit };
        }

        function getTopCustomers(analysisResults, salesPct, profitPct) {
            const { searchResults, totalSales, totalProfit } = analysisResults;
            
            const salesTarget = salesPct ? totalSales * salesPct : null;
            const profitTarget = profitPct ? totalProfit * profitPct : null;

            let accumSales = 0;
            let accumProfit = 0;
            let filteredCustomers = [];

            searchResults.sort((a, b) => b.amount - a.amount);
            for (const cust of searchResults) {
                const include = (salesTarget && accumSales < salesTarget) ||
                               (profitTarget && accumProfit < profitTarget);
                if (!include) break;
                accumSales += cust.amount;
                accumProfit += cust.profit;
                filteredCustomers.push({
                    ...cust,
                    pctOfSales: ((cust.amount / totalSales) * 100).toFixed(2),
                    pctOfProfit: ((cust.profit / totalProfit) * 100).toFixed(2)
                });
            }

            return {
                customers: filteredCustomers,
                accumSales: accumSales,
                accumProfit: accumProfit
            };
        }

        function getNewBusinessCustomers(currentPeriodResults, comparisonTopCustomers) {
            const topCustomerIds = new Set(comparisonTopCustomers.map(c => c.id));
            
            // Filter current period customers who are NOT in the top customers from comparison period
            const newBusinessCustomers = currentPeriodResults.searchResults
                .filter(customer => !topCustomerIds.has(customer.id))
                .map(customer => ({
                    ...customer,
                    pctOfSales: ((customer.amount / currentPeriodResults.totalSales) * 100).toFixed(2),
                    pctOfProfit: ((customer.profit / currentPeriodResults.totalProfit) * 100).toFixed(2)
                }))
                .sort((a, b) => b.amount - a.amount);

            return newBusinessCustomers;
        }

        function onRequest(context) {
            const request = context.request;
            const response = context.response;

            if (request.method === 'GET') {
                const form = ui.createForm({ title: 'Top Customer Sales/Profit Filter' });
                form.addField({ id: 'sales_pct', type: ui.FieldType.PERCENT, label: 'Sales Percentage (optional)' });
                form.addField({ id: 'profit_pct', type: ui.FieldType.PERCENT, label: 'Profit Percentage (optional)' });

                const startField = form.addField({ id: 'date_filter', type: ui.FieldType.DATE, label: 'Start Date', isMandatory: true });
                const endField = form.addField({ id: 'date_filter_end', type: ui.FieldType.DATE, label: 'End Date', isMandatory: true });
                startField.defaultValue = getStartOfMonth();
                endField.defaultValue = getToday();

                form.addSubmitButton({ label: 'Run Report' });
                response.writePage(form);
            } else {
                const salesPct = request.parameters.sales_pct ? parseFloat(request.parameters.sales_pct) / 100 : null;
                const profitPct = request.parameters.profit_pct ? parseFloat(request.parameters.profit_pct) / 100 : null;
                const dateStart = request.parameters.date_filter;
                const dateEnd = request.parameters.date_filter_end;

                if (!dateStart || !dateEnd || (!salesPct && !profitPct)) {
                    const form = ui.createForm({ title: 'Top Customer Sales/Profit Filter' });
                    form.addField({ id: 'sales_pct', type: ui.FieldType.PERCENT, label: 'Sales Percentage (optional)' })
                        .defaultValue = request.parameters.sales_pct || '';
                    form.addField({ id: 'profit_pct', type: ui.FieldType.PERCENT, label: 'Profit Percentage (optional)' })
                        .defaultValue = request.parameters.profit_pct || '';

                    const startField = form.addField({ id: 'date_filter', type: ui.FieldType.DATE, label: 'Start Date', isMandatory: true });
                    const endField = form.addField({ id: 'date_filter_end', type: ui.FieldType.DATE, label: 'End Date', isMandatory: true });
                    startField.defaultValue = dateStart || getStartOfMonth();
                    endField.defaultValue = dateEnd || getToday();

                    form.addSubmitButton({ label: 'Run Report' });
                    form.addPageLink({
                        type: ui.FormPageLinkType.CROSSLINK,
                        title: 'Error: You must enter a date range and at least one percentage.',
                        url: '#'
                    });
                    response.writePage(form);
                    return;
                }

                // Run analysis for selected period (current period)
                const currentPeriodResults = runCustomerAnalysis(dateStart, dateEnd, salesPct, profitPct);
                const currentTopCustomers = getTopCustomers(currentPeriodResults, salesPct, profitPct);

                // Run analysis for comparison period (start of year to day before selected start date)
                const yearStart = getStartOfYear();
                const comparisonEnd = getPreviousDay(dateStart);
                const comparisonPeriodResults = runCustomerAnalysis(yearStart, comparisonEnd, salesPct, profitPct);
                const comparisonTopCustomers = getTopCustomers(comparisonPeriodResults, salesPct, profitPct);

                // Get new business customers (bought in current period but weren't in top X% of comparison period)
                const newBusinessCustomers = getNewBusinessCustomers(currentPeriodResults, comparisonTopCustomers.customers);

                const form = ui.createForm({ title: 'Top Customer Sales/Profit Filter - Results' });
                
                // Input parameters display
                form.addField({ id: 'sales_pct', type: ui.FieldType.PERCENT, label: 'Sales Percentage' })
                    .defaultValue = (salesPct ? salesPct * 100 : '').toString();
                form.addField({ id: 'profit_pct', type: ui.FieldType.PERCENT, label: 'Profit Percentage' })
                    .defaultValue = (profitPct ? profitPct * 100 : '').toString();
                
                // Period information
                form.addField({ id: 'current_period', type: ui.FieldType.TEXT, label: 'Current Period' })
                    .defaultValue = `${dateStart} to ${dateEnd}`;
                form.addField({ id: 'comparison_period', type: ui.FieldType.TEXT, label: 'Comparison Period' })
                    .defaultValue = `${yearStart} to ${comparisonEnd}`;

                // Summary statistics
                form.addField({ id: 'top_customer_count', type: ui.FieldType.INTEGER, label: 'Top Customers (Current Period)' })
                    .defaultValue = currentTopCustomers.customers.length.toString();
                form.addField({ id: 'new_business_count', type: ui.FieldType.INTEGER, label: 'New Business Customers' })
                    .defaultValue = newBusinessCustomers.length.toString();

                // Current period totals
                form.addField({ id: 'current_total_sales', type: ui.FieldType.CURRENCY, label: 'Current Period Total Sales' })
                    .defaultValue = currentPeriodResults.totalSales.toFixed(2);
                form.addField({ id: 'current_total_profit', type: ui.FieldType.CURRENCY, label: 'Current Period Total Profit' })
                    .defaultValue = currentPeriodResults.totalProfit.toFixed(2);

                // TOP CUSTOMERS SUBLIST (Original functionality)
                const topSublist = form.addSublist({ 
                    id: 'top_customers', 
                    type: ui.SublistType.LIST, 
                    label: `Top ${(salesPct ? salesPct * 100 : profitPct * 100)}% Customers - Current Period` 
                });
                topSublist.addField({ id: 'id', type: ui.FieldType.TEXT, label: 'Customer ID' });
                topSublist.addField({ id: 'name', type: ui.FieldType.TEXT, label: 'Customer Name' });
                topSublist.addField({ id: 'amount', type: ui.FieldType.CURRENCY, label: 'Total Sales' });
                topSublist.addField({ id: 'profit', type: ui.FieldType.CURRENCY, label: 'Estimated Gross Profit' });
                topSublist.addField({ id: 'pct_sales', type: ui.FieldType.PERCENT, label: '% of Total Sales' });
                topSublist.addField({ id: 'pct_profit', type: ui.FieldType.PERCENT, label: '% of Total Profit' });

                // Calculate totals for top customers
                let topCustomersTotalSales = 0;
                let topCustomersTotalProfit = 0;
                let topCustomersTotalSalesPct = 0;
                let topCustomersTotalProfitPct = 0;

                currentTopCustomers.customers.forEach((cust, i) => {
                    topSublist.setSublistValue({ id: 'id', line: i, value: cust.id || '' });
                    topSublist.setSublistValue({ id: 'name', line: i, value: cust.name || '' });
                    topSublist.setSublistValue({ id: 'amount', line: i, value: (cust.amount || 0).toFixed(2) });
                    topSublist.setSublistValue({ id: 'profit', line: i, value: (cust.profit || 0).toFixed(2) });
                    topSublist.setSublistValue({ id: 'pct_sales', line: i, value: cust.pctOfSales || '0.00' });
                    topSublist.setSublistValue({ id: 'pct_profit', line: i, value: cust.pctOfProfit || '0.00' });

                    // Accumulate totals
                    topCustomersTotalSales += (cust.amount || 0);
                    topCustomersTotalProfit += (cust.profit || 0);
                    topCustomersTotalSalesPct += parseFloat(cust.pctOfSales || 0);
                    topCustomersTotalProfitPct += parseFloat(cust.pctOfProfit || 0);
                });

                // Add totals row for top customers if there are customers
                if (currentTopCustomers.customers.length > 0) {
                    const totalLineIndex = currentTopCustomers.customers.length;
                    topSublist.setSublistValue({ id: 'id', line: totalLineIndex, value: ' ' });
                    topSublist.setSublistValue({ id: 'name', line: totalLineIndex, value: '**TOTALS**' });
                    topSublist.setSublistValue({ id: 'amount', line: totalLineIndex, value: (topCustomersTotalSales || 0).toFixed(2) });
                    topSublist.setSublistValue({ id: 'profit', line: totalLineIndex, value: (topCustomersTotalProfit || 0).toFixed(2) });
                    topSublist.setSublistValue({ id: 'pct_sales', line: totalLineIndex, value: (topCustomersTotalSalesPct || 0).toFixed(2) });
                    topSublist.setSublistValue({ id: 'pct_profit', line: totalLineIndex, value: (topCustomersTotalProfitPct || 0).toFixed(2) });
                }

                // NEW BUSINESS CUSTOMERS SUBLIST
                const newBusinessSublist = form.addSublist({ 
                    id: 'new_business', 
                    type: ui.SublistType.LIST, 
                    label: `New Business Customers (Not in Top ${(salesPct ? salesPct * 100 : profitPct * 100)}% of Comparison Period)` 
                });
                newBusinessSublist.addField({ id: 'id', type: ui.FieldType.TEXT, label: 'Customer ID' });
                newBusinessSublist.addField({ id: 'name', type: ui.FieldType.TEXT, label: 'Customer Name' });
                newBusinessSublist.addField({ id: 'amount', type: ui.FieldType.CURRENCY, label: 'Current Period Sales' });
                newBusinessSublist.addField({ id: 'profit', type: ui.FieldType.CURRENCY, label: 'Current Period Profit' });
                newBusinessSublist.addField({ id: 'pct_sales', type: ui.FieldType.PERCENT, label: '% of Current Period Sales' });
                newBusinessSublist.addField({ id: 'pct_profit', type: ui.FieldType.PERCENT, label: '% of Current Period Profit' });

                // Calculate totals for new business customers
                let newBusinessTotalSales = 0;
                let newBusinessTotalProfit = 0;
                let newBusinessTotalSalesPct = 0;
                let newBusinessTotalProfitPct = 0;

                newBusinessCustomers.forEach((cust, i) => {
                    newBusinessSublist.setSublistValue({ id: 'id', line: i, value: cust.id || '' });
                    newBusinessSublist.setSublistValue({ id: 'name', line: i, value: cust.name || '' });
                    newBusinessSublist.setSublistValue({ id: 'amount', line: i, value: (cust.amount || 0).toFixed(2) });
                    newBusinessSublist.setSublistValue({ id: 'profit', line: i, value: (cust.profit || 0).toFixed(2) });
                    newBusinessSublist.setSublistValue({ id: 'pct_sales', line: i, value: cust.pctOfSales || '0.00' });
                    newBusinessSublist.setSublistValue({ id: 'pct_profit', line: i, value: cust.pctOfProfit || '0.00' });

                    // Accumulate totals
                    newBusinessTotalSales += (cust.amount || 0);
                    newBusinessTotalProfit += (cust.profit || 0);
                    newBusinessTotalSalesPct += parseFloat(cust.pctOfSales || 0);
                    newBusinessTotalProfitPct += parseFloat(cust.pctOfProfit || 0);
                });

                // Add totals row for new business customers if there are customers
                if (newBusinessCustomers.length > 0) {
                    const totalLineIndex = newBusinessCustomers.length;
                    newBusinessSublist.setSublistValue({ id: 'id', line: totalLineIndex, value: ' ' });
                    newBusinessSublist.setSublistValue({ id: 'name', line: totalLineIndex, value: '**TOTALS**' });
                    newBusinessSublist.setSublistValue({ id: 'amount', line: totalLineIndex, value: (newBusinessTotalSales || 0).toFixed(2) });
                    newBusinessSublist.setSublistValue({ id: 'profit', line: totalLineIndex, value: (newBusinessTotalProfit || 0).toFixed(2) });
                    newBusinessSublist.setSublistValue({ id: 'pct_sales', line: totalLineIndex, value: (newBusinessTotalSalesPct || 0).toFixed(2) });
                    newBusinessSublist.setSublistValue({ id: 'pct_profit', line: totalLineIndex, value: (newBusinessTotalProfitPct || 0).toFixed(2) });
                }

                form.addSubmitButton({ label: 'Back' });
                response.writePage(form);
            }
        }

        return { onRequest };
    });
