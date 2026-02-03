/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Print Label UI Suitelet
 * Creates print label records with serial number validation
 * Generates PDF labels with barcodes
 */
define(['N/ui/serverWidget', 'N/record', 'N/search', 'N/log', 'N/url', 'N/runtime', 'N/render'],
    function(serverWidget, record, search, log, url, runtime, render) {

        /**
         * Validates serial numbers against inventory
         */
        function validateSerialNumbers(serialNumbers) {
            if (!serialNumbers) return { valid: [], invalid: [], details: {} };

            const cleanedSerials = serialNumbers
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .split('\n')
                .map(sn => sn.trim())
                .filter(sn => sn !== '');

            if (cleanedSerials.length === 0) return { valid: [], invalid: [], details: {} };

            const filterExpression = [];
            cleanedSerials.forEach((serial, index) => {
                if (index > 0) filterExpression.push('OR');
                filterExpression.push(['inventorynumber', 'is', serial]);
            });

            const foundSerials = {};

            try {
                search.create({
                    type: 'inventorynumber',
                    filters: filterExpression,
                    columns: ['inventorynumber']
                }).run().each(result => {
                    const sn = result.getValue('inventorynumber');
                    foundSerials[sn] = true;
                    return true;
                });
            } catch (e) {
                log.error('Search Error', e.message);
            }

            const valid = [];
            const invalid = [];

            cleanedSerials.forEach(serial => {
                if (foundSerials[serial]) {
                    valid.push(serial);
                } else {
                    invalid.push(serial);
                }
            });

            return { valid, invalid };
        }

        /**
         * Escapes XML special characters
         */
        function escapeXml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        /**
         * Generates PDF labels using BFO XML format
         */
        function generateLabelsPdf(labelData) {
            const itemName = escapeXml(labelData.itemText || labelData.item);
            const description = escapeXml(labelData.description);
            const recordId = labelData.recordId || '';

            let bodyContent = '';

            // If we have serial numbers, create a label for each
            if (labelData.serialNumbers && labelData.serialNumbers.length > 0) {
                labelData.serialNumbers.forEach(serialNumber => {
                    const escapedSerial = escapeXml(serialNumber);

                    bodyContent += `
                    <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.0in">
                        <table align="right" width="98%" height="50%">
                            <tr height="12%">
                                <td align="center">
                                    <table width="100%">
                                        <tr>
                                            <td style="font-size:18px;">${itemName}</td>
                                            <td align="right">
                                                <table style="border:1px;">
                                                    <tr>
                                                        <td style="font-size:16px;">${recordId}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <tr height="25%">
                                <td align="center">
                                    <table width="100%">
                                        <tr>
                                            <td style="font-size:11px;">${description}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        <table align="left" width="100%" height="50%" v-align="bottom">
                            <tr height="60px">
                                <td height="60px" align="left" style="font-size:10px;">
                                    <barcode height="60px" width="240px" codetype="code128" showtext="true" value="${escapedSerial}"/>
                                </td>
                            </tr>
                            <tr>
                                <td align="left" style="font-size:25px;">
                                    <barcode height="60px" width="220px" codetype="code128" showtext="true" value="${itemName}"/>
                                </td>
                            </tr>
                        </table>
                    </body>`;
                });
            } else {
                // No serial numbers - create a single label without serial barcode
                bodyContent += `
                <body width="101.6mm" height="76.2mm" padding="0.0in 0.1in 0.0in 0.0in">
                    <table align="right" width="98%" height="50%">
                        <tr height="12%">
                            <td align="center">
                                <table width="100%">
                                    <tr>
                                        <td style="font-size:18px;">${itemName}</td>
                                        <td align="right">
                                            <table style="border:1px;">
                                                <tr>
                                                    <td style="font-size:16px;">${recordId}</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr height="25%">
                            <td align="center">
                                <table width="100%">
                                    <tr>
                                        <td style="font-size:11px;">${description}</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <table align="left" width="100%" height="50%" v-align="bottom">
                        <tr>
                            <td align="left" style="font-size:25px;">
                                <barcode height="60px" width="220px" codetype="code128" showtext="true" value="${itemName}"/>
                            </td>
                        </tr>
                    </table>
                </body>`;
            }

            const xml = `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
    <head>
        <style>
            th { background-color: #3c8dbc; color: white; }
            body { font-family: Helvetica; }
        </style>
    </head>
    ${bodyContent}
</pdf>`;

            return render.xmlToPdf({ xmlString: xml });
        }

        /**
         * Returns the inline client script for the entry form
         */
        function getEntryFormScript(suiteletUrl) {
            return `
                <script>
                    // Update serial count display
                    function updateSerialCount() {
                        var serialField = document.getElementById('custpage_serial_numbers');
                        var countDisplay = document.getElementById('serial_count');
                        if (!serialField) return;

                        var serials = serialField.value
                            .split(/[\\r\\n]+/)
                            .map(function(s) { return s.trim(); })
                            .filter(function(s) { return s !== ''; });

                        var count = serials.length;

                        if (countDisplay) {
                            countDisplay.textContent = count;
                        }
                    }

                    // Clear form
                    function clearForm() {
                        if (!confirm('Clear all fields?')) return;

                        var itemField = document.getElementById('custpage_item');
                        var serialField = document.getElementById('custpage_serial_numbers');

                        if (itemField) itemField.value = '';
                        if (serialField) serialField.value = '';

                        updateSerialCount();
                    }

                    // Initialize
                    function initPage() {
                        updateSerialCount();

                        var serialField = document.getElementById('custpage_serial_numbers');
                        if (serialField) {
                            serialField.addEventListener('input', updateSerialCount);
                            serialField.addEventListener('paste', function() {
                                setTimeout(updateSerialCount, 50);
                            });
                        }
                    }

                    // Run init
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', initPage);
                    } else {
                        initPage();
                    }

                    // Also use jQuery if available (NetSuite)
                    if (typeof jQuery !== 'undefined') {
                        jQuery(function() {
                            initPage();
                        });
                    }
                </script>
            `;
        }

        /**
         * Escapes a string for safe use in JavaScript
         */
        function escapeForJs(str) {
            if (!str) return '';
            return String(str)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
        }

        /**
         * Returns the inline client script for the success page
         * pdfUrl is the complete URL to generate the PDF (built server-side)
         */
        function getSuccessPageScript(suiteletUrl, pdfUrl) {
            const safePdfUrl = escapeForJs(pdfUrl);
            const safeSuiteletUrl = escapeForJs(suiteletUrl);
            return `
                <script>
                    // Print labels - opens pre-built PDF URL
                    function printLabels() {
                        window.open('${safePdfUrl}', '_blank');
                    }

                    // Create another
                    function createAnother() {
                        window.location.href = '${safeSuiteletUrl}';
                    }
                </script>
            `;
        }

        /**
         * Returns custom CSS styles - Warehouse-Friendly UI
         * Optimized for visibility and ease of use
         */
        function getCustomStyles() {
            return `
                <style>
                    :root {
                        --primary: #1e40af;
                        --primary-dark: #1e3a8a;
                        --primary-light: #3b82f6;
                        --success: #047857;
                        --success-light: #d1fae5;
                        --error: #b91c1c;
                        --error-light: #fee2e2;
                        --warning: #b45309;
                        --warning-light: #fef3c7;
                        --gray-50: #f9fafb;
                        --gray-100: #f3f4f6;
                        --gray-200: #e5e7eb;
                        --gray-300: #d1d5db;
                        --gray-500: #6b7280;
                        --gray-700: #374151;
                        --gray-900: #111827;
                    }

                    /* Base styles - larger fonts for readability */
                    body, html {
                        font-size: 18px !important;
                        line-height: 1.5;
                        background-color: #f1f5f9 !important;
                    }

                    /* Hide default NetSuite page title since we have custom headers */
                    .uir-page-title, .uir-page-title-firstline, .uir-page-title-secondline {
                        display: none !important;
                    }

                    .tq-container {
                        max-width: 1000px;
                        margin: 0 auto;
                        padding: 24px;
                    }

                    .tq-card {
                        background: white;
                        border-radius: 16px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                        padding: 32px;
                        margin-bottom: 24px;
                        border: 2px solid var(--gray-200);
                    }

                    .tq-card-header {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        margin-bottom: 24px;
                        padding-bottom: 20px;
                        border-bottom: 3px solid var(--gray-200);
                    }

                    .tq-card-icon {
                        width: 56px;
                        height: 56px;
                        background: linear-gradient(135deg, var(--primary), var(--primary-dark));
                        border-radius: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: 28px;
                    }

                    .tq-card-title {
                        font-size: 24px;
                        font-weight: 700;
                        color: var(--gray-900);
                        margin: 0;
                    }

                    .tq-card-subtitle {
                        font-size: 16px;
                        color: var(--gray-500);
                        margin: 4px 0 0 0;
                    }

                    .tq-alert {
                        padding: 20px 24px;
                        border-radius: 12px;
                        margin-bottom: 24px;
                        display: flex;
                        align-items: flex-start;
                        gap: 16px;
                        font-size: 18px;
                        border-width: 2px;
                    }

                    .tq-alert-success {
                        background: var(--success-light);
                        border: 2px solid #34d399;
                        color: #065f46;
                    }

                    .tq-alert-error {
                        background: var(--error-light);
                        border: 2px solid #f87171;
                        color: #991b1b;
                    }

                    .tq-alert-warning {
                        background: var(--warning-light);
                        border: 2px solid #fbbf24;
                        color: #92400e;
                    }

                    .tq-alert-icon {
                        font-size: 28px;
                        line-height: 1;
                    }

                    .tq-alert-content {
                        flex: 1;
                        font-size: 18px;
                    }

                    .tq-alert-title {
                        font-weight: 700;
                        margin-bottom: 6px;
                        font-size: 20px;
                    }

                    .tq-serial-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 16px;
                    }

                    .tq-serial-label {
                        font-weight: 600;
                        color: var(--gray-700);
                        font-size: 18px;
                    }

                    .tq-badge {
                        display: inline-flex;
                        align-items: center;
                        padding: 10px 20px;
                        border-radius: 25px;
                        font-size: 16px;
                        font-weight: 600;
                        color: white;
                        background: #64748b;
                        transition: background 0.2s;
                    }

                    .tq-serial-count {
                        font-size: 48px;
                        font-weight: 700;
                        color: var(--primary);
                        line-height: 1;
                    }

                    .tq-help-text {
                        font-size: 16px;
                        color: var(--gray-500);
                        margin-top: 12px;
                        line-height: 1.5;
                    }

                    /* Form field styling - LARGER inputs */
                    input[type="text"],
                    input[type="number"],
                    select,
                    textarea {
                        font-size: 18px !important;
                        padding: 14px 16px !important;
                        border: 2px solid var(--gray-300) !important;
                        border-radius: 10px !important;
                        min-height: 52px !important;
                    }

                    input[type="text"]:focus,
                    input[type="number"]:focus,
                    select:focus,
                    textarea:focus {
                        border-color: var(--primary) !important;
                        outline: none !important;
                        box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.2) !important;
                    }

                    textarea {
                        min-height: 150px !important;
                        line-height: 1.6 !important;
                    }

                    /* NetSuite form labels */
                    .uir-label,
                    .smalltextnolink,
                    .inputlabel {
                        font-size: 18px !important;
                        font-weight: 600 !important;
                        color: var(--gray-700) !important;
                        margin-bottom: 8px !important;
                    }

                    /* Large submit button */
                    input[type="submit"],
                    .uir-button,
                    .rndbuttoninpt {
                        font-size: 18px !important;
                        font-weight: 700 !important;
                        padding: 16px 32px !important;
                        border-radius: 10px !important;
                        min-height: 54px !important;
                        cursor: pointer !important;
                        transition: all 0.2s !important;
                        border: none !important;
                    }

                    /* Primary action button (submit/create) */
                    input[type="submit"] {
                        background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%) !important;
                        color: white !important;
                        box-shadow: 0 4px 14px rgba(30, 64, 175, 0.4) !important;
                    }

                    input[type="submit"]:hover {
                        transform: translateY(-2px) !important;
                        box-shadow: 0 6px 20px rgba(30, 64, 175, 0.5) !important;
                    }

                    /* Secondary buttons */
                    .uir-button:not([type="submit"]) {
                        background: white !important;
                        color: var(--gray-700) !important;
                        border: 2px solid var(--gray-300) !important;
                    }

                    .uir-button:not([type="submit"]):hover {
                        background: var(--gray-50) !important;
                        border-color: var(--gray-400) !important;
                    }

                    /* Button container spacing */
                    .uir-button-bar {
                        margin-top: 24px !important;
                        padding: 20px 32px !important;
                        background: var(--gray-50) !important;
                        border-top: 1px solid var(--gray-200) !important;
                        display: flex !important;
                        gap: 12px !important;
                    }

                    /* Serial list styling */
                    .tq-serial-list {
                        background: var(--gray-50);
                        border: 2px solid var(--gray-200);
                        border-radius: 12px;
                        padding: 20px;
                        max-height: 320px;
                        overflow-y: auto;
                    }

                    .tq-serial-list ul {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px 20px;
                    }

                    .tq-serial-list li {
                        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
                        font-size: 15px;
                        padding: 10px 12px;
                        background: white;
                        border-radius: 6px;
                        border: 2px solid var(--gray-200);
                        font-weight: 500;
                    }

                    .tq-label-preview {
                        background: white;
                        border: 3px solid var(--gray-400);
                        border-radius: 12px;
                        padding: 24px;
                        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    }

                    .tq-label-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        padding-bottom: 14px;
                        border-bottom: 3px solid var(--gray-900);
                        margin-bottom: 14px;
                    }

                    .tq-label-item {
                        font-size: 24px;
                        font-weight: 800;
                        color: var(--gray-900);
                        letter-spacing: -0.5px;
                    }

                    .tq-label-id {
                        font-size: 16px;
                        color: var(--gray-600);
                        background: var(--gray-100);
                        padding: 4px 12px;
                        border-radius: 6px;
                        font-weight: 600;
                    }

                    .tq-label-desc {
                        font-size: 16px;
                        color: var(--gray-700);
                        line-height: 1.5;
                        margin-bottom: 18px;
                    }

                    .tq-barcode {
                        background: var(--gray-100);
                        border: 2px dashed var(--gray-400);
                        border-radius: 8px;
                        padding: 16px;
                        text-align: center;
                        margin-bottom: 10px;
                    }

                    .tq-barcode-bars {
                        font-family: 'Libre Barcode 128', monospace;
                        font-size: 56px;
                        letter-spacing: 2px;
                        color: var(--gray-900);
                    }

                    .tq-barcode-text {
                        font-family: monospace;
                        font-size: 14px;
                        font-weight: 600;
                        color: var(--gray-700);
                        margin-top: 6px;
                    }

                    .tq-link {
                        color: var(--primary);
                        text-decoration: none;
                        font-weight: 600;
                        font-size: 18px;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        padding: 10px 0;
                    }

                    .tq-link:hover {
                        text-decoration: underline;
                    }

                    .tq-stat-box {
                        background: linear-gradient(135deg, var(--primary), var(--primary-dark));
                        border-radius: 14px;
                        padding: 24px;
                        color: white;
                        text-align: center;
                    }

                    .tq-stat-number {
                        font-size: 56px;
                        font-weight: 800;
                        line-height: 1;
                    }

                    .tq-stat-label {
                        font-size: 18px;
                        opacity: 0.95;
                        margin-top: 6px;
                        font-weight: 500;
                    }

                    /* Part Number Display - Extra Large */
                    .tq-part-number {
                        font-size: 32px;
                        font-weight: 800;
                        color: var(--primary-dark);
                        background: linear-gradient(135deg, #dbeafe, #eff6ff);
                        padding: 16px 24px;
                        border-radius: 12px;
                        border: 3px solid var(--primary-light);
                        display: inline-block;
                        margin: 12px 0;
                        letter-spacing: -0.5px;
                    }

                    /* Page title override */
                    .uir-page-title-secondline,
                    .uir-page-title {
                        font-size: 28px !important;
                        font-weight: 700 !important;
                    }

                    /* Make dropdown selects easier to use */
                    select option {
                        font-size: 18px !important;
                        padding: 12px !important;
                    }

                    /* ========== ENTRY FORM LAYOUT ========== */
                    .tq-form-wrapper {
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    .tq-form-card {
                        background: white;
                        border-radius: 16px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                        border: 1px solid var(--gray-200);
                        overflow: hidden;
                    }

                    .tq-form-header {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        padding: 28px 32px;
                        background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
                        color: white;
                    }

                    .tq-form-icon {
                        width: 56px;
                        height: 56px;
                        background: rgba(255,255,255,0.2);
                        border-radius: 12px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 28px;
                    }

                    .tq-form-title {
                        font-size: 26px;
                        font-weight: 700;
                        margin: 0;
                        color: white;
                    }

                    .tq-form-subtitle {
                        font-size: 15px;
                        margin: 4px 0 0 0;
                        opacity: 0.9;
                    }

                    .tq-form-section {
                        padding: 28px 32px;
                        border-bottom: 1px solid var(--gray-200);
                    }

                    .tq-form-section-first {
                        padding-top: 32px;
                    }

                    .tq-form-section:last-of-type {
                        border-bottom: none;
                    }

                    .tq-section-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }

                    .tq-section-title {
                        font-size: 18px;
                        font-weight: 700;
                        color: var(--gray-700);
                        margin-bottom: 16px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    .tq-section-header .tq-section-title {
                        margin-bottom: 0;
                    }

                    .tq-section-hint {
                        font-size: 14px;
                        color: var(--gray-500);
                        margin: 0 0 16px 0;
                    }

                    .tq-label-counter {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        background: var(--gray-100);
                        padding: 8px 16px;
                        border-radius: 8px;
                        border: 2px solid var(--gray-200);
                    }

                    .tq-counter-label {
                        font-size: 14px;
                        color: var(--gray-600);
                        font-weight: 500;
                    }

                    .tq-counter-number {
                        font-size: 28px;
                        font-weight: 800;
                        color: var(--primary);
                        line-height: 1;
                        min-width: 40px;
                        text-align: center;
                    }

                    .tq-form-info {
                        display: flex;
                        align-items: flex-start;
                        gap: 12px;
                        padding: 20px 32px;
                        background: #f0f9ff;
                        border-top: 1px solid #bae6fd;
                    }

                    .tq-info-icon {
                        font-size: 20px;
                        line-height: 1;
                    }

                    .tq-info-text {
                        font-size: 14px;
                        color: #0369a1;
                        line-height: 1.5;
                    }

                    /* Override NetSuite table layouts inside our form */
                    .tq-form-wrapper table {
                        width: 100% !important;
                    }

                    .tq-form-wrapper td {
                        padding: 6px 0 !important;
                    }

                    /* Alerts inside form wrapper */
                    .tq-form-wrapper .tq-alert {
                        margin-bottom: 20px;
                    }

                    /* ========== SUCCESS PAGE LAYOUT ========== */
                    .tq-success-wrapper {
                        max-width: 900px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    .tq-success-header {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        background: linear-gradient(135deg, #047857 0%, #10b981 100%);
                        padding: 24px 28px;
                        border-radius: 16px;
                        margin-bottom: 20px;
                        color: white;
                    }

                    .tq-success-icon {
                        width: 52px;
                        height: 52px;
                        background: rgba(255,255,255,0.2);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 28px;
                        font-weight: bold;
                    }

                    .tq-success-title {
                        font-size: 24px;
                        font-weight: 700;
                        margin: 0;
                        color: white;
                    }

                    .tq-success-subtitle {
                        font-size: 16px;
                        margin: 4px 0 0 0;
                        opacity: 0.95;
                    }

                    .tq-success-card {
                        background: white;
                        border-radius: 16px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                        border: 1px solid var(--gray-200);
                        overflow: hidden;
                    }

                    .tq-part-section {
                        text-align: center;
                        padding: 32px;
                        background: linear-gradient(180deg, #f8fafc 0%, white 100%);
                        border-bottom: 1px solid var(--gray-200);
                    }

                    .tq-part-label {
                        font-size: 13px;
                        font-weight: 600;
                        color: var(--gray-500);
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }

                    .tq-part-number-large {
                        font-size: 36px;
                        font-weight: 800;
                        color: var(--primary-dark);
                        margin: 12px 0;
                        letter-spacing: -0.5px;
                    }

                    .tq-part-desc {
                        font-size: 15px;
                        color: var(--gray-600);
                        margin: 0;
                        max-width: 500px;
                        margin: 0 auto;
                        line-height: 1.5;
                    }

                    .tq-success-columns {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 0;
                    }

                    @media (max-width: 800px) {
                        .tq-success-columns {
                            grid-template-columns: 1fr;
                        }
                    }

                    .tq-success-col {
                        padding: 24px;
                    }

                    .tq-success-col:first-child {
                        border-right: 1px solid var(--gray-200);
                    }

                    @media (max-width: 800px) {
                        .tq-success-col:first-child {
                            border-right: none;
                            border-bottom: 1px solid var(--gray-200);
                        }
                    }

                    .tq-col-header {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 16px;
                    }

                    .tq-col-icon {
                        font-size: 20px;
                    }

                    .tq-col-title {
                        font-size: 16px;
                        font-weight: 700;
                        color: var(--gray-700);
                    }

                    .tq-col-badge {
                        font-size: 12px;
                        background: var(--gray-100);
                        color: var(--gray-600);
                        padding: 4px 10px;
                        border-radius: 20px;
                        margin-left: auto;
                    }

                    .tq-no-serial-info {
                        background: var(--gray-50);
                        border: 1px solid var(--gray-200);
                        border-radius: 10px;
                        padding: 24px;
                        text-align: center;
                        color: var(--gray-500);
                        margin-bottom: 16px;
                    }

                    .tq-no-serial-info p {
                        margin: 0;
                        font-size: 15px;
                    }

                    /* Override old tq-serial-list for new layout */
                    .tq-success-col .tq-serial-list {
                        margin-bottom: 16px;
                    }
                </style>
            `;
        }

        /**
         * Creates the main entry form
         */
        function createEntryForm(context, message, messageType, prefill) {
            const form = serverWidget.createForm({
                title: 'Print Label Creator'
            });

            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId
            });

            // Styles and Scripts
            const styleField = form.addField({
                id: 'custpage_styles',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            styleField.defaultValue = getCustomStyles() + getEntryFormScript(suiteletUrl);

            // Message Banner (if any)
            const messageBanner = message ? `
                <div class="tq-alert ${messageType === 'success' ? 'tq-alert-success' : messageType === 'warning' ? 'tq-alert-warning' : 'tq-alert-error'}">
                    <span class="tq-alert-icon">${messageType === 'success' ? '✓' : messageType === 'warning' ? '⚠' : '✕'}</span>
                    <div class="tq-alert-content">${message}</div>
                </div>
            ` : '';

            // Form Header Section
            const headerField = form.addField({
                id: 'custpage_header',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            headerField.defaultValue = `
                <div class="tq-form-wrapper">
                    ${messageBanner}
                    <div class="tq-form-card">
                        <div class="tq-form-section tq-form-section-first">
                            <div class="tq-section-title">Item Selection</div>
            `;

            // Item Field
            const itemField = form.addField({
                id: 'custpage_item',
                type: serverWidget.FieldType.SELECT,
                label: 'Select Item',
                source: 'item'
            });
            itemField.isMandatory = true;
            if (prefill && prefill.item) {
                itemField.defaultValue = prefill.item;
            }

            // Serial Numbers Section Header
            const serialHeaderField = form.addField({
                id: 'custpage_serial_header',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            serialHeaderField.defaultValue = `
                        </div>
                        <div class="tq-form-section">
                            <div class="tq-section-header">
                                <div class="tq-section-title">Serial Numbers</div>
                                <div class="tq-label-counter">
                                    <span class="tq-counter-label">Labels to create:</span>
                                    <span class="tq-counter-number" id="serial_count">0</span>
                                </div>
                            </div>
                            <p class="tq-section-hint">Enter one serial number per line. Leave empty to create a single label without serial.</p>
            `;

            // Serial Numbers Textarea
            const serialField = form.addField({
                id: 'custpage_serial_numbers',
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Serial Numbers'
            });
            serialField.updateDisplaySize({ height: 10, width: 60 });
            if (prefill && prefill.serialNumbers) {
                serialField.defaultValue = prefill.serialNumbers;
            }

            // Form Footer / Close wrapper
            const footerField = form.addField({
                id: 'custpage_footer',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            footerField.defaultValue = `
                        </div>
                        <div class="tq-form-info">
                            <div class="tq-info-icon">ℹ️</div>
                            <div class="tq-info-text">Serial numbers will be validated against NetSuite inventory. A PDF label with barcode will be generated for each valid serial number.</div>
                        </div>
                    </div>
                </div>
            `;

            // Buttons - Large and Clear
            form.addSubmitButton({
                label: 'CREATE LABELS'
            });

            form.addButton({
                id: 'custpage_clear',
                label: 'CLEAR FORM',
                functionName: 'clearForm'
            });

            context.response.writePage(form);
        }

        /**
         * Creates the success page
         */
        function createSuccessPage(context, recordId, labelData) {
            const form = serverWidget.createForm({
                title: 'Labels Created'
            });

            // Get the external URL for this Suitelet (required for "Available Without Login")
            const suiteletUrl = url.resolveScript({
                scriptId: runtime.getCurrentScript().id,
                deploymentId: runtime.getCurrentScript().deploymentId,
                returnExternalUrl: true
            });

            // Build PDF URL with all data encoded
            const serialsParam = (labelData.serialNumbers || []).join('\n');
            const pdfUrl = suiteletUrl +
                '&ajax_action=printpdf' +
                '&record_id=' + encodeURIComponent(recordId) +
                '&item_text=' + encodeURIComponent(labelData.itemText || '') +
                '&description=' + encodeURIComponent(labelData.description || '') +
                '&serials=' + encodeURIComponent(serialsParam);

            // Styles and Scripts
            const styleField = form.addField({
                id: 'custpage_styles',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            styleField.defaultValue = getCustomStyles() + getSuccessPageScript(suiteletUrl, pdfUrl);

            // Success Content
            const contentField = form.addField({
                id: 'custpage_content',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });

            const hasSerials = labelData.serialNumbers && labelData.serialNumbers.length > 0;
            const labelCount = hasSerials ? labelData.serialNumbers.length : 1;
            const serialListItems = hasSerials ? labelData.serialNumbers.map(sn => `<li>${escapeXml(sn)}</li>`).join('') : '';
            const sampleSerial = hasSerials ? labelData.serialNumbers[0] : '';

            // Build serial barcode preview only if we have serials
            const serialBarcodePreview = hasSerials ? `
                                <div class="tq-barcode">
                                    <div class="tq-barcode-bars">║║│║║│║║│║║│║║</div>
                                    <div class="tq-barcode-text">${escapeXml(sampleSerial)}</div>
                                </div>
            ` : '';

            contentField.defaultValue = `
                <div class="tq-success-wrapper">
                    <!-- Success Header -->
                    <div class="tq-success-header">
                        <div class="tq-success-icon">✓</div>
                        <div class="tq-success-text">
                            <h2 class="tq-success-title">Labels Created Successfully</h2>
                            <p class="tq-success-subtitle">Record #${recordId} - <strong>${labelCount}</strong> label${labelCount !== 1 ? 's' : ''} ready to print</p>
                        </div>
                    </div>

                    <!-- Main Content Card -->
                    <div class="tq-success-card">
                        <!-- Part Number Section -->
                        <div class="tq-part-section">
                            <span class="tq-part-label">PART NUMBER</span>
                            <div class="tq-part-number-large">${escapeXml(labelData.itemText)}</div>
                        </div>

                        <!-- Two Column Layout -->
                        <div class="tq-success-columns">
                            <!-- Left Column - Serial Numbers or Info -->
                            <div class="tq-success-col">
                                ${hasSerials ? `
                                <div class="tq-col-header">
                                    <span class="tq-col-icon">🏷️</span>
                                    <span class="tq-col-title">Serial Numbers (${labelCount})</span>
                                </div>
                                <div class="tq-serial-list">
                                    <ul>${serialListItems}</ul>
                                </div>
                                ` : `
                                <div class="tq-col-header">
                                    <span class="tq-col-icon">🏷️</span>
                                    <span class="tq-col-title">Label Info</span>
                                </div>
                                <div class="tq-no-serial-info">
                                    <p>Single label without serial number</p>
                                </div>
                                `}
                                <a href="/app/common/custom/custrecordentry.nl?rectype=1780&id=${recordId}" class="tq-link" target="_blank">
                                    View Record in NetSuite →
                                </a>
                            </div>

                            <!-- Right Column - Label Preview -->
                            <div class="tq-success-col">
                                <div class="tq-col-header">
                                    <span class="tq-col-icon">👁️</span>
                                    <span class="tq-col-title">Label Preview</span>
                                    <span class="tq-col-badge">4" × 3"</span>
                                </div>
                                <div class="tq-label-preview">
                                    <div class="tq-label-header">
                                        <span class="tq-label-item">${escapeXml(labelData.itemText)}</span>
                                        <span class="tq-label-id">#${recordId}</span>
                                    </div>
                                    ${serialBarcodePreview}
                                    <div class="tq-barcode">
                                        <div class="tq-barcode-bars">║║│║║│║║│║║│║║</div>
                                        <div class="tq-barcode-text">${escapeXml(labelData.itemText)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Buttons - Large and Clear for warehouse use
            form.addButton({
                id: 'custpage_print',
                label: 'PRINT LABELS',
                functionName: 'printLabels'
            });

            form.addButton({
                id: 'custpage_new',
                label: 'CREATE MORE LABELS',
                functionName: 'createAnother'
            });

            context.response.writePage(form);
        }

        /**
         * Handle PDF generation
         * Uses URL parameters to avoid record.load/search calls that require login
         */
        function handlePrintPdf(context) {
            const recordId = context.request.parameters.record_id;
            const itemText = context.request.parameters.item_text || '';
            const description = context.request.parameters.description || '';
            const serialsRaw = context.request.parameters.serials || '';

            if (!recordId) {
                context.response.write('Error: No record ID provided');
                return;
            }

            try {
                const serialNumbers = serialsRaw
                    .split('\n')
                    .map(s => s.trim())
                    .filter(s => s !== '');

                const pdfFile = generateLabelsPdf({
                    itemText: itemText,
                    description: description,
                    serialNumbers: serialNumbers,
                    recordId: recordId
                });

                context.response.setHeader({ name: 'Content-Type', value: 'application/pdf' });
                context.response.setHeader({
                    name: 'Content-Disposition',
                    value: 'inline; filename="Labels_' + recordId + '.pdf"'
                });
                context.response.write(pdfFile.getContents());

            } catch (e) {
                log.error('PDF Generation Error', e.message);
                context.response.write('Error generating PDF: ' + e.message);
            }
        }

        /**
         * Main entry point
         */
        function onRequest(context) {
            try {
                if (context.request.method === 'GET') {
                    const ajaxAction = context.request.parameters.ajax_action;
                    
                    if (ajaxAction === 'validate') {
                        const serialNumbers = context.request.parameters.serials;
                        const result = validateSerialNumbers(serialNumbers);
                        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                        context.response.write(JSON.stringify(result));
                        return;
                    }

                    if (ajaxAction === 'printpdf') {
                        handlePrintPdf(context);
                        return;
                    }

                    createEntryForm(context);
                    
                } else {
                    const item = context.request.parameters.custpage_item;
                    const serialNumbers = context.request.parameters.custpage_serial_numbers || '';

                    if (!item) {
                        createEntryForm(context, 'Please select a part number.', 'error', {
                            item, serialNumbers
                        });
                        return;
                    }

                    // Only validate serial numbers if provided
                    let validSerials = [];
                    if (serialNumbers.trim()) {
                        const validationResult = validateSerialNumbers(serialNumbers);

                        if (validationResult.invalid.length > 0) {
                            const errorMsg = `
                                <div class="tq-alert-title">Invalid Serial Numbers</div>
                                The following serial numbers were not found in inventory:<br>
                                <strong>${validationResult.invalid.join(', ')}</strong>
                            `;
                            createEntryForm(context, errorMsg, 'error', { item, serialNumbers });
                            return;
                        }
                        validSerials = validationResult.valid;
                    }

                    let itemText = '';
                    let description = '';
                    try {
                        const itemLookup = search.lookupFields({
                            type: search.Type.ITEM,
                            id: item,
                            columns: ['itemid', 'displayname', 'salesdescription']
                        });
                        itemText = itemLookup.displayname || itemLookup.itemid || item;
                        description = itemLookup.salesdescription || '';
                    } catch (e) {
                        itemText = item;
                    }

                    const printLabelRecord = record.create({
                        type: 'customrecord_print_label',
                        isDynamic: true
                    });

                    printLabelRecord.setValue({ fieldId: 'custrecord_pl_item_number', value: item });
                    printLabelRecord.setValue({
                        fieldId: 'custrecord_express_entry',
                        value: validSerials.join('<br>')
                    });

                    const recordId = printLabelRecord.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: false
                    });

                    log.audit('Print Label Created', `ID: ${recordId}, Labels: ${validSerials.length || 1}`);

                    createSuccessPage(context, recordId, {
                        item, itemText, description,
                        serialNumbers: validSerials
                    });
                }
            } catch (e) {
                log.error('Suitelet Error', e.message + ' | ' + e.stack);
                createEntryForm(context, 'An error occurred: ' + e.message, 'error');
            }
        }

        return { onRequest };
    });
