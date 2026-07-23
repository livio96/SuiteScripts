/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @description Custom Suitelet for searching and bulk printing Sales Order Picking Tickets.
 *              Fully custom HTML UI with search-based PDF generation.
 *              Client-side filtering/sorting for instant response; server only reloads on location change.
 *              Drop ship lines (custcol_so_is_drop_ship = T) are excluded from picking logic and the PDF.
 *
 *              Packer-alert banners (top + bottom of each ticket) call out:
 *                - Transparency code required (any line)
 *                - Signature required on delivery
 *                - Blind shipment (no TelQuest branding)
 *                - Customer UPS shipper number to use
 *                - Customer FedEx shipper number to use
 *              Transparency-required rows are also highlighted in the items table.
 */
define([
    'N/ui/serverWidget',
    'N/search',
    'N/render',
    'N/runtime',
    'N/url',
    'N/record',
    'N/log'
], (serverWidget, search, render, runtime, url, record, log) => {

    const STATUSES = ['SalesOrd:B', 'SalesOrd:D', 'SalesOrd:E'];
    const DEFAULT_LOCATION = '1';
    const SEARCH_BATCH = 1000;

    // ── Helpers ────────────────────────────────────────────────────────

    const escapeXml = (str) => {
        if (str === null || str === undefined || str === '') return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    };

    const escapeHtml = (str) => {
        if (str === null || str === undefined || str === '') return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    const escapeJs = (str) => {
        if (str === null || str === undefined || str === '') return '';
        return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
    };

    const formatAddress = (addr) => {
        if (!addr) return '';
        return escapeXml(addr).replace(/\n/g, '<br/>');
    };

    const getVal = (result, col) => {
        const text = result.getText(col);
        if (text !== null && text !== undefined && text !== '') return text;
        const val = result.getValue(col);
        if (val !== null && val !== undefined) return String(val);
        return '';
    };

    const getLocations = () => {
        const locations = [];
        search.create({
            type: 'location',
            filters: [['isinactive', 'is', 'F']],
            columns: [search.createColumn({ name: 'name', sort: search.Sort.ASC })]
        }).run().each((result) => {
            locations.push({ id: String(result.id), name: result.getValue('name') || '' });
            return true;
        });
        return locations;
    };

    /**
     * Normalize NetSuite checkbox/boolean values to consistent 'T'/'F' strings.
     * NS can return: true/false (boolean), 'T'/'F', 'true'/'false' (string), or empty.
     */
    const normalizeBool = (val) => {
        if (val === true || val === 'T' || val === 'true') return 'T';
        return 'F';
    };

    /**
     * Truthy test for mixed-format NS values. Handles boolean true, 'T', 'true', 'Yes'.
     * Used by the packer-alert banner.
     */
    const isTrue = (v) => {
        if (v === true) return true;
        if (typeof v === 'string') {
            const s = v.toLowerCase();
            return s === 't' || s === 'true' || s === 'yes';
        }
        return false;
    };

    // ── Packer Alert Banner ────────────────────────────────────────────
    /**
     * Builds a stack of colored alert bars highlighting flags packers must not miss.
     * Returns '' when no flags apply, so the banner disappears for clean orders.
     */
    const buildAlertsBanner = (order) => {
        const e = escapeXml;
        const alerts = [];

        // Website order — telquestintl.com (SuiteCommerce) order.
        // Two signals, either one flags it (and neither catches a marketplace
        // order, since Amazon/eBay/Walmart orders always carry a generic rep):
        //   1. source = "Web" (internal value NLWebStore) — the webstore source
        //   2. no sales rep assigned
        // Placed first so it sits at the very top of the ticket.
        const srcText = String(order.source || '').trim().toLowerCase();
        const isWebSource = (srcText === 'web' || srcText === 'nlwebstore');
        const noRep = !order.salesrep || String(order.salesrep).trim() === '';
        if (isWebSource || noRep) {
            alerts.push({ bg: '#7c3aed', text: 'WEBSITE ORDER \u2014 TELQUESTINTL.COM' });
        }

        // Transparency code on any line item (per-line checkbox)
        const hasTransparency = order.items.some((item) => isTrue(item.transparencyCode));
        if (hasTransparency) {
            alerts.push({ bg: '#dc2626', text: 'TRANSPARENCY CODE REQUIRED — APPLY BEFORE PACKING' });
        }

        // Signature required on delivery
        if (isTrue(order.signatureRequired)) {
            alerts.push({ bg: '#ea580c', text: 'SIGNATURE REQUIRED ON DELIVERY' });
        }

        // Blind shipment — no TelQuest branding
        if (isTrue(order.shipBlind)) {
            alerts.push({ bg: '#7c2d12', text: 'BLIND SHIPMENT — NO TELQUEST BRANDING OR PACKING SLIP' });
        }

        // Customer UPS/FedEx shipper number — only alert when Ship Via or Shipping Terms
        // explicitly says "Use Shipper Number" (matches "Use Shipper #", "use shipper num", etc.)
        const useShipperRegex = /use\s*shipper\s*(?:number|#|num)/i;
        const usesShipperNum =
            (order.shipmethod && useShipperRegex.test(order.shipmethod)) ||
            (order.shippingTerms && useShipperRegex.test(order.shippingTerms));

        if (usesShipperNum) {
            if (order.upsShipper && String(order.upsShipper).trim() !== '') {
                alerts.push({ bg: '#1e40af', text: 'USE CUSTOMER UPS SHIPPER #: ' + order.upsShipper });
            }
            if (order.fedexShipper && String(order.fedexShipper).trim() !== '') {
                alerts.push({ bg: '#1e40af', text: 'USE CUSTOMER FEDEX SHIPPER #: ' + order.fedexShipper });
            }
        }

        if (alerts.length === 0) return '';

        const rows = alerts.map((a) =>
            '<tr><td style="background-color:' + a.bg + ';color:#ffffff;font-size:12pt;font-weight:bold;padding:6px 10px;border:1.5px solid #000000;">' +
            e(a.text) + '</td></tr>'
        ).join('\n');

        return '<table style="width:100%;margin:6px 0;border-collapse:collapse;">' + rows + '</table>';
    };

    /**
     * Display checkbox/boolean values as Yes/No instead of T/F/true/false.
     */
    const yn = (v) => isTrue(v) ? 'Yes' : 'No';

    /**
     * Builds the clean, table-formatted order info middle section of the picking ticket.
     * One details table (with Ship To on the right) in the original field order,
     * plus a Shipping Instructions section when present.
     */
    const buildOrderInfoSection = (order) => {
        const e = escapeXml;
        const hasShipInstr = order.shippingInstructions && String(order.shippingInstructions).trim() !== '';

        // Reusable styles
        const headerBar = 'background-color:#2c3e50;color:#ffffff;font-weight:bold;padding:9px 14px;font-size:12pt;';
        const labelCell = 'background-color:#f5f5f5;font-weight:bold;padding:14px 18px;border:0.5px solid #c0c0c0;';
        const valueCell = 'padding:14px 18px;border:0.5px solid #c0c0c0;';

        // ── Order Details + Ship To (original field order) ────────
        const detailsHtml =
            '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:16px;font-size:11pt;">' +
                '<tr>' +
                    '<td colspan="2" style="' + headerBar + '">ORDER DETAILS</td>' +
                    '<td colspan="2" style="' + headerBar + '">SHIP TO</td>' +
                '</tr>' +
                '<tr>' +
                    '<td style="width:18%;' + labelCell + 'vertical-align:top;">Order Contact</td>' +
                    '<td style="width:32%;' + valueCell + 'vertical-align:top;">' + e(order.contactName) + '</td>' +
                    '<td colspan="2" rowspan="13" style="width:50%;vertical-align:top;padding:12px 12px 12px 36px;border:0.5px solid #c0c0c0;font-size:9pt;">' + formatAddress(order.shipaddress) + '</td>' +
                '</tr>' +
                '<tr><td style="' + labelCell + '">Ship Via</td><td style="' + valueCell + '">' + e(order.shipmethod) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Shipping Terms</td><td style="' + valueCell + '">' + e(order.shippingTerms) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Payment Terms</td><td style="' + valueCell + '">' + e(order.terms) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Sales Rep</td><td style="' + valueCell + '">' + e(order.salesrep) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">UPS Shipper #</td><td style="' + valueCell + '">' + e(order.upsShipper) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">FedEx Shipper #</td><td style="' + valueCell + '">' + e(order.fedexShipper) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Don\'t Insure</td><td style="' + valueCell + '">' + yn(order.dontInsure) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Ship Blind</td><td style="' + valueCell + '">' + yn(order.shipBlind) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Shipping Cost</td><td style="' + valueCell + '">' + e(order.shippingCost) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Approval Date</td><td style="' + valueCell + '">' + e(order.approvalDate) + '</td></tr>' +
                '<tr><td style="' + labelCell + '">Billing ZIP</td><td style="' + valueCell + '">' + e(order.billingZip) + '</td></tr>' +
            '</table>';

        // ── Shipping Instructions (only if present) ────────────────
        let instructionsHtml = '';
        if (hasShipInstr) {
            instructionsHtml =
                '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11pt;">' +
                    '<tr><td style="' + headerBar + '">SHIPPING INSTRUCTIONS</td></tr>' +
                    '<tr><td style="padding:12px 14px;border:0.5px solid #c0c0c0;background-color:#fef3c7;">' + e(order.shippingInstructions) + '</td></tr>' +
                '</table>';
        }

        return detailsHtml + instructionsHtml;
    };

    // ── PDF XML Builder ────────────────────────────────────────────────

    const buildTicketXml = (order) => {
        const e = escapeXml;

        let itemsSection = '';
        if (order.items.length > 0) {
            const itemRows = order.items.map((item) => {
                const flagged = isTrue(item.transparencyCode);
                const rowBg = flagged ? ' style="background-color:#fee2e2;"' : '';
                const barcodeCellBg = flagged ? 'background-color:#fee2e2;' : '';
                const cellBg = flagged ? 'background-color:#fee2e2;font-weight:bold;color:#7f1d1d;' : '';
                return '<tr' + rowBg + '>' +
                    '<td colspan="4" style="' + barcodeCellBg + 'width: 164px; height: 29px;"><barcode codetype="code128" style="width: 100pt; height: 30pt;" showtext="true" value="' + e(item.name) + '"/></td>' +
                    '<td style="' + cellBg + 'width: 191px; height: 29px;">' + e(item.description) + '</td>' +
                    '<td style="' + cellBg + 'height: 29px; width: 65px;">' + e(item.quantity) + '</td>' +
                    '<td style="' + cellBg + 'height: 29px; width: 65px;">' + yn(item.transparencyCode) + '</td>' +
                    '<td style="' + cellBg + 'height: 29px; width: 100px;">' + e(item.extendedDescription && String(item.extendedDescription).trim() !== '' ? item.extendedDescription : item.verifiedDims) + '</td>' +
                    '<td style="' + cellBg + 'height: 29px; width: 90px;">' + e(item.pickBin) + '</td>' +
                    '</tr>';
            }).join('\n');
            itemsSection =
                '<table class="itemtable" style="width: 100%; margin-top: 10px;"><thead><tr>' +
                '<th colspan="4" style="width: 164px;">Item</th>' +
                '<th style="width: 151px;">Description</th><th style="width: 65px;">Ordered</th>' +
                '<th style="width: 100px;">Transparency Code Req</th><th style="width: 100px;">Verified Dims</th>' +
                '<th style="width: 90px;">Bin Location</th></tr></thead>' + itemRows + '</table>';
        }

        return '<pdf>\n<head>\n' +
        '    <link name="NotoSans" type="font" subtype="truetype" src="${nsfont.NotoSans_Regular}" src-bold="${nsfont.NotoSans_Bold}" src-italic="${nsfont.NotoSans_Italic}" src-bolditalic="${nsfont.NotoSans_BoldItalic}" bytes="2" />\n' +
        '    <macrolist><macro id="nlfooter"><p>&#160;</p></macro></macrolist>\n' +
        '    <style type="text/css">\n' +
        '        * { font-family: NotoSans, sans-serif; }\n' +
        '        table { font-size: 9pt; table-layout: fixed; }\n' +
        '        th { font-weight: bold; font-size: 8pt; vertical-align: middle; padding: 5px 6px 3px; background-color: #e3e3e3; color: #333333; }\n' +
        '        td { padding: 4px 6px; } td p { align:left } b { font-weight: bold; color: #333333; }\n' +
        '        table.header td { padding: 0; font-size: 10pt; } table.footer td { padding: 0; font-size: 8pt; }\n' +
        '        table.itemtable th { padding-bottom: 10px; padding-top: 10px; } table.body td { padding-top: 2px; }\n' +
        '        td.addressheader { font-size: 8pt; padding-top: 6px; padding-bottom: 2px; } td.address { padding-top: 0; }\n' +
        '        span.title { font-size: 28pt; } span.number { font-size: 16pt; }\n' +
        '        span.itemname { font-weight: bold; line-height: 150%; }\n' +
        '        hr { width: 100%; color: #d3d3d3; background-color: #d3d3d3; height: 1px; }\n' +
        '    </style>\n</head>\n' +
        '<body footer="nlfooter" footer-height="20pt" padding="0.5in 0.5in 0.5in 0.5in" size="Letter">\n' +
        buildAlertsBanner(order) +
        '    <table cellpadding="1" cellspacing="1" style="width: 813px;"><tr>\n' +
        '    <td style="height: 29px; width: 220.5px;"><span style="font-size:18px;"><strong>Picking Ticket</strong></span></td>\n' +
        '    <td style="height: 29px; width: 320.5px;"><span style="font-size:18px;"><strong>' + e(order.onHoldMessage) + '</strong></span>\n' +
        '    <table border="0" cellpadding=".5" cellspacing=".5"><tr>\n' +
        '        <td style="width: 340px;"><span style="font-size:14px;">' + e(order.picker) + '</span></td>\n' +
        '    </tr></table></td>\n' +
        '    <td style="height: 29px; width: 200px; text-align: right;">&#160;</td>\n' +
        '    <td rowspan="3" style="height: 29px; width: 344px; text-align: right;"><barcode codetype="code128" style="width: 100pt; height: 30pt;" showtext="true" value="' + e(order.tranid) + ' ' + e(order.onHoldMessage) + '"/>' + (order.etailOrderId ? '<br/><barcode codetype="code128" style="width: 100pt; height: 30pt;" showtext="true" value="' + e(order.etailOrderId) + '"/>' : '') + '</td>\n' +
        '    </tr><tr><td style="width: 220.5px;"><span style="font-size:20px;"><strong>' + e(order.tranid) + '</strong></span></td><td style="width: 200px; text-align: right;">&#160;</td>\n' +
        '    </tr><tr><td style="width: 220.5px;"><span style="font-size:16px;">' + e(order.trandate) + '</span></td><td style="width: 200px; text-align: right;">&#160;</td></tr></table>\n' +
        buildOrderInfoSection(order) +
        '<br />' + itemsSection + '\n' +
        '</body>\n</pdf>';
    };

    // ── Build custom HTML page ─────────────────────────────────────────
    const buildPageHtml = (params) => {
        const h = escapeHtml;
        const { suiteletUrl, locations, locationId, orders, amazonOrders } = params;

        const locationOpts = locations.map((loc) =>
            '<option value="' + h(loc.id) + '"' + (loc.id === locationId ? ' selected' : '') + '>' + h(loc.name) + '</option>'
        ).join('');

        // Build JSON data for client-side filtering/sorting
        const ordersJson = JSON.stringify(orders);
        const amazonJson = JSON.stringify(amazonOrders || []);

        return '<!DOCTYPE html>\n<html>\n<head>\n' +
        '<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
        '<title>Picking Tickets</title>\n' +
        '<style>\n' +
        '  @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");\n' +
        '  *{margin:0;padding:0;box-sizing:border-box}\n' +
        '  body{font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}\n' +
        '  .tq-topbar{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:20px 32px;display:flex;align-items:center;box-shadow:0 4px 20px rgba(0,0,0,.15)}\n' +
        '  .tq-topbar-left{display:flex;align-items:center;gap:16px}\n' +
        '  .tq-topbar h1{color:#fff;font-size:22px;font-weight:700;letter-spacing:-.5px}\n' +
        '  .tq-icon{width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px}\n' +
        '  .tq-stats{display:flex;gap:16px;padding:24px 32px 0}\n' +
        '  .tq-stat-card{flex:1;background:#fff;border-radius:16px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid #e2e8f0;display:flex;align-items:center;gap:16px}\n' +
        '  .tq-stat-icon{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}\n' +
        '  .tq-stat-icon.blue{background:#eff6ff}.tq-stat-icon.green{background:#f0fdf4}.tq-stat-icon.purple{background:#faf5ff}\n' +
        '  .tq-stat-info h3{font-size:28px;font-weight:800;color:#0f172a;letter-spacing:-1px;line-height:1}\n' +
        '  .tq-stat-info p{font-size:13px;font-weight:500;color:#64748b;margin-top:4px}\n' +
        '  .tq-controls{display:flex;align-items:center;gap:16px;padding:20px 32px;flex-wrap:wrap}\n' +
        '  .tq-control-group{display:flex;align-items:center;gap:8px}\n' +
        '  .tq-control-group label{font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}\n' +
        '  .tq-select{padding:10px 36px 10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:500;color:#1e293b;background:#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'%2364748b\' viewBox=\'0 0 16 16\'%3E%3Cpath d=\'M8 11L3 6h10z\'/%3E%3C/svg%3E") no-repeat right 12px center;appearance:none;cursor:pointer;transition:border-color .15s,box-shadow .15s;min-width:160px}\n' +
        '  .tq-select:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}\n' +
        '  .tq-toggle{display:flex;align-items:center;gap:10px;padding:8px 16px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:all .15s;user-select:none}\n' +
        '  .tq-toggle:hover{border-color:#cbd5e1;background:#f8fafc}\n' +
        '  .tq-toggle.active{border-color:#6366f1;background:#eef2ff}\n' +
        '  .tq-toggle-label{font-size:13px;font-weight:600;color:#475569}\n' +
        '  .tq-toggle.active .tq-toggle-label{color:#4f46e5}\n' +
        '  .tq-switch{position:relative;width:36px;height:20px;background:#cbd5e1;border-radius:10px;transition:background .2s;flex-shrink:0}\n' +
        '  .tq-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.15)}\n' +
        '  .tq-toggle.active .tq-switch{background:#6366f1}\n' +
        '  .tq-toggle.active .tq-switch::after{transform:translateX(16px)}\n' +
        '  .tq-divider{width:1px;height:32px;background:#e2e8f0;margin:0 4px}\n' +
        '  .tq-spacer{flex:1}\n' +
        '  .tq-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .15s}\n' +
        '  .tq-btn-primary{background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;box-shadow:0 2px 10px rgba(99,102,241,.3)}\n' +
        '  .tq-btn-primary:hover{box-shadow:0 4px 18px rgba(99,102,241,.45);transform:translateY(-1px)}\n' +
        '  .tq-btn-primary:disabled{background:#94a3b8;box-shadow:none;cursor:not-allowed;transform:none}\n' +
        '  .tq-btn-outline{background:#fff;color:#475569;border:1.5px solid #e2e8f0}\n' +
        '  .tq-btn-outline:hover{background:#f8fafc;border-color:#cbd5e1}\n' +
        '  .tq-table-wrap{padding:0 32px 32px}\n' +
        '  .tq-table-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid #e2e8f0}\n' +
        '  .tq-table-toolbar{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #f1f5f9}\n' +
        '  .tq-table-toolbar-left{display:flex;align-items:center;gap:12px}\n' +
        '  .tq-table-title{font-size:16px;font-weight:700;color:#0f172a}\n' +
        '  .tq-count-pill{background:#f1f5f9;color:#475569;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}\n' +
        '  .tq-search-input{padding:8px 14px 8px 36px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;width:240px;background:#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' fill=\'%2394a3b8\' viewBox=\'0 0 16 16\'%3E%3Cpath d=\'M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z\'/%3E%3C/svg%3E") no-repeat 12px center;transition:border-color .15s,box-shadow .15s}\n' +
        '  .tq-search-input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}\n' +
        '  .tq-table{width:100%;border-collapse:collapse}\n' +
        '  .tq-table thead th{background:#f8fafc;padding:14px 16px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.6px;border-bottom:2px solid #e2e8f0;white-space:nowrap;user-select:none;cursor:pointer}\n' +
        '  .tq-table thead th:hover{color:#4f46e5}\n' +
        '  .tq-td{padding:14px 16px;font-size:14px;color:#334155;border-bottom:1px solid #f1f5f9;vertical-align:middle}\n' +
        '  .tq-td-check{width:48px;text-align:center}.tq-td-order{font-weight:600}\n' +
        '  .tq-row{transition:background .1s;cursor:pointer}.tq-row:hover{background:#f8fafc}.tq-row.selected{background:#eef2ff}\n' +
        '  .tq-check{width:18px;height:18px;accent-color:#6366f1;cursor:pointer}\n' +
        '  .tq-link{color:#4f46e5;text-decoration:none;font-weight:600}.tq-link:hover{text-decoration:underline}\n' +
        '  .tq-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:#f0fdf4;color:#15803d}\n' +
        '  .tq-badge-warn{background:#fef3c7;color:#92400e}\n' +
        '  .tq-badge-ok{font-size:12px;color:#94a3b8;font-weight:500}\n' +
        '  .tq-empty{text-align:center;padding:60px 20px}\n' +
        '  .tq-empty-icon{font-size:48px;margin-bottom:16px;opacity:.5}\n' +
        '  .tq-empty h3{font-size:18px;font-weight:600;color:#475569;margin-bottom:6px}\n' +
        '  .tq-empty p{font-size:14px;color:#94a3b8}\n' +
        '  @media(max-width:900px){.tq-stats{flex-direction:column;padding:16px}.tq-controls{padding:16px}.tq-table-wrap{padding:0 16px 16px}.tq-select{min-width:130px}}\n' +
        '  .tq-viewswitch{display:flex;gap:16px;padding:24px 32px 0}\n' +
        '  .tq-viewbtn{flex:1;max-width:300px;background:#fff;border:2px solid #e2e8f0;border-radius:16px;padding:22px 24px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:all .15s;text-align:center}\n' +
        '  .tq-viewbtn:hover{border-color:#cbd5e1;background:#f8fafc;transform:translateY(-2px)}\n' +
        '  .tq-viewbtn.active{border-color:#6366f1;background:#eef2ff;box-shadow:0 4px 18px rgba(99,102,241,.2)}\n' +
        '  .tq-viewbtn-icon{font-size:30px;line-height:1}\n' +
        '  .tq-viewbtn-label{font-size:16px;font-weight:700;color:#0f172a}\n' +
        '  .tq-viewbtn-sub{font-size:12px;color:#64748b;font-weight:500}\n' +
        '  .tq-viewbtn.active .tq-viewbtn-label{color:#4f46e5}\n' +
        '</style>\n</head>\n<body>\n' +

        '<div class="tq-topbar"><div class="tq-topbar-left"><div class="tq-icon">\u{1F4CB}</div><h1>Picking Tickets</h1></div></div>\n' +

        '<div class="tq-viewswitch">\n' +
        '  <div class="tq-viewbtn active" id="viewSoBtn"><div class="tq-viewbtn-icon">\u{1F9FE}</div><div class="tq-viewbtn-label">Sales Orders</div><div class="tq-viewbtn-sub"><span id="soBtnCount">0</span> ready to pick</div></div>\n' +
        '  <div class="tq-viewbtn" id="viewAmazonBtn"><div class="tq-viewbtn-icon">\u{1F4E6}</div><div class="tq-viewbtn-label">Amazon FBA Shipments</div><div class="tq-viewbtn-sub"><span id="azBtnCount">0</span> to print</div></div>\n' +
        '</div>\n' +

        '<div id="soView">\n' +

        '<div class="tq-stats">\n' +
        '  <div class="tq-stat-card"><div class="tq-stat-icon blue">\u{1F4E6}</div><div class="tq-stat-info"><h3 id="totalCount">0</h3><p>Orders Ready to Pick</p></div></div>\n' +
        '  <div class="tq-stat-card"><div class="tq-stat-icon green">\u2705</div><div class="tq-stat-info"><h3 id="selectedCount">0</h3><p>Selected for Print</p></div></div>\n' +
        '  <div class="tq-stat-card"><div class="tq-stat-icon purple">\u{1F5A8}\uFE0F</div><div class="tq-stat-info"><h3>PDF</h3><p>Bulk Print Ready</p></div></div>\n' +
        '</div>\n' +

        '<div class="tq-controls">\n' +
        '  <div class="tq-control-group"><label>Location</label><select class="tq-select" id="locationSelect">' + locationOpts + '</select></div>\n' +
        '  <div class="tq-control-group"><label>Channel</label><select class="tq-select" id="channelSelect"><option value="">All Channels</option></select></div>\n' +
        '  <div class="tq-control-group"><label>Sales Rep</label><select class="tq-select" id="salesRepSelect"><option value="">All Sales Reps</option></select></div>\n' +
        '  <div class="tq-control-group"><label>Sort By</label><select class="tq-select" id="sortSelect">' +
        '    <option value="item">Item Name</option><option value="tranid">Order #</option><option value="brand">Manufacturer</option><option value="bin">Bin Location</option><option value="approvalDate">Approval Date</option>' +
        '  </select></div>\n' +
        '  <div class="tq-divider"></div>\n' +
        '  <div class="tq-toggle" id="onHoldToggle"><div class="tq-switch"></div><span class="tq-toggle-label">Include On Hold</span></div>\n' +
        '  <div class="tq-toggle" id="reprintToggle"><div class="tq-switch"></div><span class="tq-toggle-label">Show Printed</span></div>\n' +
        '  <div class="tq-spacer"></div>\n' +
        '  <button class="tq-btn tq-btn-primary" id="printBtn" disabled>\n' +
        '    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>\n' +
        '    Print Selected\n' +
        '  </button>\n' +
        '</div>\n' +

        '<div class="tq-table-wrap"><div class="tq-table-card">\n' +
        '  <div class="tq-table-toolbar">\n' +
        '    <div class="tq-table-toolbar-left"><span class="tq-table-title">Sales Orders</span><span class="tq-count-pill" id="countPill">0 total</span></div>\n' +
        '    <div style="display:flex;align-items:center;gap:10px;">\n' +
        '      <input type="text" class="tq-search-input" id="searchInput" placeholder="Search orders..." />\n' +
        '      <button class="tq-btn tq-btn-outline" id="selectAllBtn">Select All</button>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '  <table class="tq-table"><thead><tr>' +
        '    <th style="width:48px;text-align:center;cursor:default"><input type="checkbox" class="tq-check" id="checkAll" /></th>' +
        '    <th data-sort="tranid">Order #</th><th data-sort="customer">Customer</th><th data-sort="date">Date</th><th data-sort="status">Status</th><th data-sort="salesRepText">Sales Rep</th><th data-sort="channelText">Channel</th><th data-sort="approvalDate">Approval Date</th><th data-sort="onHold">On Hold</th><th data-sort="printed">Printed</th>' +
        '  </tr></thead><tbody id="orderTableBody"></tbody></table>\n' +
        '  <div class="tq-empty" id="emptyState" style="display:none;"><div class="tq-empty-icon">\u{1F4ED}</div><h3>No orders found</h3><p>No picking tickets match the current filters.</p></div>\n' +
        '</div></div>\n' +
        '</div>\n' +

        '<div id="amazonView" style="display:none;">\n' +
        '<div class="tq-stats">\n' +
        '  <div class="tq-stat-card"><div class="tq-stat-icon blue">\u{1F4E6}</div><div class="tq-stat-info"><h3 id="azTotalCount">0</h3><p>Amazon FBA Shipments</p></div></div>\n' +
        '  <div class="tq-stat-card"><div class="tq-stat-icon green">\u2705</div><div class="tq-stat-info"><h3 id="azSelectedCount">0</h3><p>Selected for Print</p></div></div>\n' +
        '  <div class="tq-stat-card"><div class="tq-stat-icon purple">\u{1F5A8}\uFE0F</div><div class="tq-stat-info"><h3>PDF</h3><p>Bulk Print Ready</p></div></div>\n' +
        '</div>\n' +
        '<div class="tq-controls">\n' +
        '  <div class="tq-spacer"></div>\n' +
        '  <button class="tq-btn tq-btn-primary" id="azPrintBtn" disabled>\n' +
        '    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>\n' +
        '    Print Amazon Tickets\n' +
        '  </button>\n' +
        '</div>\n' +
        '<div class="tq-table-wrap"><div class="tq-table-card">\n' +
        '  <div class="tq-table-toolbar">\n' +
        '    <div class="tq-table-toolbar-left"><span class="tq-table-title">Amazon FBA Shipments</span><span class="tq-count-pill" id="azCountPill">0 total</span></div>\n' +
        '    <div style="display:flex;align-items:center;gap:10px;">\n' +
        '      <input type="text" class="tq-search-input" id="azSearchInput" placeholder="Search shipments..." />\n' +
        '      <button class="tq-btn tq-btn-outline" id="azSelectAllBtn">Select All</button>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '  <table class="tq-table"><thead><tr>' +
        '    <th style="width:48px;text-align:center;cursor:default"><input type="checkbox" class="tq-check" id="azCheckAll" /></th>' +
        '    <th data-azsort="dateAdded">Date Added</th><th data-azsort="sku">Item</th><th data-azsort="quantity">Quantity</th><th data-azsort="highPriority">High Priority</th><th data-azsort="amazonStore">Amazon Store</th><th data-azsort="transparency">T/C Req</th><th data-azsort="whAvail">WH A Avail</th>' +
        '  </tr></thead><tbody id="azTableBody"></tbody></table>\n' +
        '  <div class="tq-empty" id="azEmptyState" style="display:none;"><div class="tq-empty-icon">\u{1F4ED}</div><h3>No shipments found</h3><p>No Amazon shipments need box/unit setup right now.</p></div>\n' +
        '</div></div>\n' +
        '</div>\n' +

        '<script>\n' +
        '(function(){\n' +
        '  var BASE_URL=' + JSON.stringify(suiteletUrl) + ';\n' +
        '  var ALL_ORDERS=' + ordersJson + ';\n' +
        '  var ALL_AMAZON=' + amazonJson + ';\n' +
        '  var selectedIds={};\n' +
        '  var includeOnHold=false, showPrinted=false;\n' +
        '  var channelFilter="", salesRepFilter="", sortBy="item", searchQuery="";\n' +
        '\n' +
        '  // Build channel dropdown from data\n' +
        '  var channels={};\n' +
        '  ALL_ORDERS.forEach(function(o){if(o.channelVal)channels[o.channelVal]=o.channelText||o.channelVal});\n' +
        '  var chSel=document.getElementById("channelSelect");\n' +
        '  Object.keys(channels).sort(function(a,b){return(channels[a]||"").localeCompare(channels[b]||"")}).forEach(function(k){\n' +
        '    var opt=document.createElement("option");opt.value=k;opt.textContent=channels[k];chSel.appendChild(opt);\n' +
        '  });\n' +
        '\n' +
        '  // Build sales rep dropdown from data\n' +
        '  var salesReps={};\n' +
        '  ALL_ORDERS.forEach(function(o){if(o.salesRepVal)salesReps[o.salesRepVal]=o.salesRepText||o.salesRepVal});\n' +
        '  var srSel=document.getElementById("salesRepSelect");\n' +
        '  Object.keys(salesReps).sort(function(a,b){return(salesReps[a]||"").localeCompare(salesReps[b]||"")}).forEach(function(k){\n' +
        '    var opt=document.createElement("option");opt.value=k;opt.textContent=salesReps[k];srSel.appendChild(opt);\n' +
        '  });\n' +
        '\n' +
        '  function getFiltered(){\n' +
        '    return ALL_ORDERS.filter(function(o){\n' +
        '      if(!includeOnHold && o.onHold==="T") return false;\n' +
        '      if(!showPrinted && o.toBePrinted==="T") return false;\n' +
        '      if(channelFilter && o.channelVal!==channelFilter) return false;\n' +
        '      if(salesRepFilter && o.salesRepVal!==salesRepFilter) return false;\n' +
        '      if(searchQuery){\n' +
        '        var s=searchQuery;\n' +
        '        var hay=(o.tranid+" "+o.customer+" "+o.date+" "+o.status+" "+(o.salesRepText||"")+" "+(o.channelText||"")+" "+(o.onHoldMsg||"")+" "+(o.approvalDate||"")).toLowerCase();\n' +
        '        if(hay.indexOf(s)===-1) return false;\n' +
        '      }\n' +
        '      return true;\n' +
        '    });\n' +
        '  }\n' +
        '\n' +
        '  function getSorted(list){\n' +
        '    var s=sortBy;\n' +
        '    return list.slice().sort(function(a,b){\n' +
        '      if(s==="item") return(a.sortItem||"").localeCompare(b.sortItem||"");\n' +
        '      if(s==="brand") return(a.sortBrand||"").localeCompare(b.sortBrand||"");\n' +
        '      if(s==="bin") return(a.sortBin||"").localeCompare(b.sortBin||"");\n' +
        '      if(s==="customer") return(a.customer||"").localeCompare(b.customer||"");\n' +
        '      if(s==="date") return(a.date||"").localeCompare(b.date||"");\n' +
        '      if(s==="status") return(a.status||"").localeCompare(b.status||"");\n' +
        '      if(s==="salesRepText") return(a.salesRepText||"").localeCompare(b.salesRepText||"");\n' +
        '      if(s==="channelText") return(a.channelText||"").localeCompare(b.channelText||"");\n' +
        '      if(s==="approvalDate") return(a.approvalDate||"").localeCompare(b.approvalDate||"");\n' +
        '      if(s==="onHold") return(a.onHold||"").localeCompare(b.onHold||"");\n' +
        '      if(s==="printed") return(a.toBePrinted||"").localeCompare(b.toBePrinted||"");\n' +
        '      return(a.tranid||"").localeCompare(b.tranid||"");\n' +
        '    });\n' +
        '  }\n' +
        '\n' +
        '  function esc(s){if(!s)return"";var d=document.createElement("div");d.appendChild(document.createTextNode(s));return d.innerHTML}\n' +
        '\n' +
        '  function renderTable(){\n' +
        '    var filtered=getFiltered();\n' +
        '    var sorted=getSorted(filtered);\n' +
        '    var tbody=document.getElementById("orderTableBody");\n' +
        '    var empty=document.getElementById("emptyState");\n' +
        '    document.getElementById("totalCount").textContent=sorted.length;\n' +
        '    document.getElementById("countPill").textContent=sorted.length+" total";\n' +
        '    if(sorted.length===0){tbody.innerHTML="";empty.style.display="";return}\n' +
        '    empty.style.display="none";\n' +
        '    var html="";\n' +
        '    sorted.forEach(function(o){\n' +
        '      var isOnHold=o.onHold==="T";\n' +
        '      var isPrinted=o.toBePrinted==="T";\n' +
        '      var checked=selectedIds[o.id]?" checked":"";\n' +
        '      var selClass=selectedIds[o.id]?" selected":"";\n' +
        '      html+=\'<tr class="tq-row\'+selClass+\'" data-id="\'+esc(o.id)+\'">\'+\n' +
        '        \'<td class="tq-td tq-td-check"><input type="checkbox" class="tq-check" data-id="\'+esc(o.id)+\'"\'+checked+\' /></td>\'+\n' +
        '        \'<td class="tq-td tq-td-order"><a href="/app/accounting/transactions/salesord.nl?id=\'+esc(o.id)+\'" target="_blank" class="tq-link">\'+esc(o.tranid)+\'</a></td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.customer)+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.date)+\'</td>\'+\n' +
        '        \'<td class="tq-td"><span class="tq-badge">\'+esc(o.status)+\'</span></td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.salesRepText)+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.channelText)+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.approvalDate)+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+(isOnHold?\'<span class="tq-badge tq-badge-warn">\'+esc(o.onHoldMsg||"On Hold")+\'</span>\':\'<span class="tq-badge-ok">No</span>\')+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+(isPrinted?\'<span class="tq-badge tq-badge-warn">Printed</span>\':\'<span class="tq-badge-ok">No</span>\')+\'</td>\'+\n' +
        '        \'</tr>\';\n' +
        '    });\n' +
        '    tbody.innerHTML=html;\n' +
        '    bindRowEvents();\n' +
        '    updateSelectedCount();\n' +
        '  }\n' +
        '\n' +
        '  function bindRowEvents(){\n' +
        '    document.querySelectorAll("#orderTableBody .tq-row").forEach(function(row){\n' +
        '      row.addEventListener("click",function(e){\n' +
        '        if(e.target.tagName==="INPUT"||e.target.tagName==="A") return;\n' +
        '        var cb=row.querySelector(".tq-check");\n' +
        '        if(cb){cb.checked=!cb.checked;toggleSel(cb);updateSelectedCount()}\n' +
        '      });\n' +
        '    });\n' +
        '    document.querySelectorAll("#orderTableBody .tq-check").forEach(function(cb){\n' +
        '      cb.addEventListener("change",function(){toggleSel(cb);updateSelectedCount()});\n' +
        '    });\n' +
        '  }\n' +
        '\n' +
        '  function toggleSel(cb){\n' +
        '    var id=cb.getAttribute("data-id");\n' +
        '    if(cb.checked) selectedIds[id]=true; else delete selectedIds[id];\n' +
        '    var row=cb.closest(".tq-row");\n' +
        '    if(row) row.classList.toggle("selected",cb.checked);\n' +
        '  }\n' +
        '\n' +
        '  function updateSelectedCount(){\n' +
        '    var n=Object.keys(selectedIds).length;\n' +
        '    document.getElementById("selectedCount").textContent=n;\n' +
        '    document.getElementById("printBtn").disabled=n===0;\n' +
        '  }\n' +
        '\n' +
        '  // Location = server reload (only filter that requires it)\n' +
        '  document.getElementById("locationSelect").addEventListener("change",function(){\n' +
        '    window.location.href=BASE_URL+"&locationId="+encodeURIComponent(this.value);\n' +
        '  });\n' +
        '\n' +
        '  // All other filters = client-side instant\n' +
        '  document.getElementById("channelSelect").addEventListener("change",function(){channelFilter=this.value;renderTable()});\n' +
        '  document.getElementById("salesRepSelect").addEventListener("change",function(){salesRepFilter=this.value;renderTable()});\n' +
        '  document.getElementById("sortSelect").addEventListener("change",function(){sortBy=this.value;renderTable()});\n' +
        '  document.getElementById("searchInput").addEventListener("input",function(){searchQuery=this.value.toLowerCase();renderTable()});\n' +
        '\n' +
        '  document.getElementById("onHoldToggle").addEventListener("click",function(){\n' +
        '    includeOnHold=!includeOnHold;this.classList.toggle("active",includeOnHold);renderTable();\n' +
        '  });\n' +
        '  document.getElementById("reprintToggle").addEventListener("click",function(){\n' +
        '    showPrinted=!showPrinted;this.classList.toggle("active",showPrinted);renderTable();\n' +
        '  });\n' +
        '\n' +
        '  // Check all visible\n' +
        '  document.getElementById("checkAll").addEventListener("change",function(){\n' +
        '    var checked=this.checked;\n' +
        '    document.querySelectorAll("#orderTableBody .tq-check").forEach(function(cb){\n' +
        '      cb.checked=checked;toggleSel(cb);\n' +
        '    });\n' +
        '    updateSelectedCount();\n' +
        '  });\n' +
        '\n' +
        '  var allSel=false;\n' +
        '  document.getElementById("selectAllBtn").addEventListener("click",function(){\n' +
        '    allSel=!allSel;\n' +
        '    document.querySelectorAll("#orderTableBody .tq-check").forEach(function(cb){cb.checked=allSel;toggleSel(cb)});\n' +
        '    document.getElementById("checkAll").checked=allSel;\n' +
        '    this.textContent=allSel?"Deselect All":"Select All";\n' +
        '    updateSelectedCount();\n' +
        '  });\n' +
        '\n' +
        '  // Column header click to sort\n' +
        '  document.querySelectorAll("th[data-sort]").forEach(function(th){\n' +
        '    th.addEventListener("click",function(){\n' +
        '      sortBy=th.getAttribute("data-sort");\n' +
        '      document.getElementById("sortSelect").value=(["item","tranid","brand","bin","approvalDate"].indexOf(sortBy)>-1)?sortBy:"tranid";\n' +
        '      renderTable();\n' +
        '    });\n' +
        '  });\n' +
        '\n' +
        '  // Print\n' +
        '  document.getElementById("printBtn").addEventListener("click",function(){\n' +
        '    var ids=Object.keys(selectedIds);\n' +
        '    if(!ids.length){alert("Select at least one order.");return}\n' +
        '    var s=document.getElementById("sortSelect").value;\n' +
        '    window.open(BASE_URL+"&action=print&orderIds="+ids.join(",")+"&sortBy="+encodeURIComponent(s),"_blank");\n' +
        '    // Mark as printed in background\n' +
        '    fetch(BASE_URL+"&action=markprinted&orderIds="+ids.join(",")).then(function(r){return r.json()}).then(function(data){\n' +
        '      // Update client data so toggling reprint filter reflects the change\n' +
        '      var printed={};\n' +
        '      (data.success||[]).forEach(function(id){printed[id]=true});\n' +
        '      ALL_ORDERS.forEach(function(o){if(printed[o.id])o.toBePrinted="T"});\n' +
        '      // Clear selections and re-render\n' +
        '      selectedIds={};\n' +
        '      document.getElementById("checkAll").checked=false;\n' +
        '      allSel=false;\n' +
        '      document.getElementById("selectAllBtn").textContent="Select All";\n' +
        '      renderTable();\n' +
        '    }).catch(function(e){console.error("Mark printed error:",e)});\n' +
        '  });\n' +
        '\n' +
        '  // ── Amazon Shipments view ──────────────────────────────────\n' +
        '  var azSelectedIds={};\n' +
        '  var azSortBy="highPriority", azSearchQuery="";\n' +
        '\n' +
        '  function showView(v){\n' +
        '    var so=document.getElementById("soView"), az=document.getElementById("amazonView");\n' +
        '    var sb=document.getElementById("viewSoBtn"), ab=document.getElementById("viewAmazonBtn");\n' +
        '    if(v==="amazon"){so.style.display="none";az.style.display="";sb.classList.remove("active");ab.classList.add("active");}\n' +
        '    else{so.style.display="";az.style.display="none";ab.classList.remove("active");sb.classList.add("active");}\n' +
        '  }\n' +
        '  document.getElementById("viewSoBtn").addEventListener("click",function(){showView("so")});\n' +
        '  document.getElementById("viewAmazonBtn").addEventListener("click",function(){showView("amazon")});\n' +
        '\n' +
        '  function azGetFiltered(){\n' +
        '    return ALL_AMAZON.filter(function(o){\n' +
        '      if(azSearchQuery){\n' +
        '        var hay=((o.sku||"")+" "+(o.amazonStore||"")+" "+(o.dateAdded||"")+" "+(o.quantity||"")).toLowerCase();\n' +
        '        if(hay.indexOf(azSearchQuery)===-1) return false;\n' +
        '      }\n' +
        '      return true;\n' +
        '    });\n' +
        '  }\n' +
        '  function azGetSorted(list){\n' +
        '    var s=azSortBy;\n' +
        '    return list.slice().sort(function(a,b){\n' +
        '      if(s==="highPriority"){var d=(b.highPriority==="T"?1:0)-(a.highPriority==="T"?1:0);if(d)return d;return(b.dateAdded||"").localeCompare(a.dateAdded||"");}\n' +
        '      if(s==="quantity") return(parseFloat(a.quantity)||0)-(parseFloat(b.quantity)||0);\n' +
        '      if(s==="whAvail") return(parseFloat(a.whAvail)||0)-(parseFloat(b.whAvail)||0);\n' +
        '      if(s==="dateAdded") return(b.dateAdded||"").localeCompare(a.dateAdded||"");\n' +
        '      if(s==="transparency") return(b.transparency||"").localeCompare(a.transparency||"");\n' +
        '      return(a[s]||"").localeCompare(b[s]||"");\n' +
        '    });\n' +
        '  }\n' +
        '  function azRender(){\n' +
        '    var sorted=azGetSorted(azGetFiltered());\n' +
        '    var tbody=document.getElementById("azTableBody"), empty=document.getElementById("azEmptyState");\n' +
        '    document.getElementById("azTotalCount").textContent=sorted.length;\n' +
        '    document.getElementById("azBtnCount").textContent=ALL_AMAZON.length;\n' +
        '    document.getElementById("azCountPill").textContent=sorted.length+" total";\n' +
        '    if(sorted.length===0){tbody.innerHTML="";empty.style.display="";azUpdateCount();return}\n' +
        '    empty.style.display="none";\n' +
        '    var html="";\n' +
        '    sorted.forEach(function(o){\n' +
        '      var checked=azSelectedIds[o.id]?" checked":"";\n' +
        '      var selClass=azSelectedIds[o.id]?" selected":"";\n' +
        '      var hp=o.highPriority==="T"?\'<span class="tq-badge tq-badge-warn">High</span>\':\'<span class="tq-badge-ok">No</span>\';\n' +
        '      var tc=o.transparency==="T"?\'<span class="tq-badge tq-badge-warn">Yes</span>\':\'<span class="tq-badge-ok">No</span>\';\n' +
        '      html+=\'<tr class="tq-row\'+selClass+\'" data-id="\'+esc(o.id)+\'">\'+\n' +
        '        \'<td class="tq-td tq-td-check"><input type="checkbox" class="tq-check az-check" data-id="\'+esc(o.id)+\'"\'+checked+\' /></td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.dateAdded)+\'</td>\'+\n' +
        '        \'<td class="tq-td tq-td-order">\'+esc(o.sku)+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.quantity)+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+hp+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.amazonStore)+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+tc+\'</td>\'+\n' +
        '        \'<td class="tq-td">\'+esc(o.whAvail)+\'</td>\'+\n' +
        '        \'</tr>\';\n' +
        '    });\n' +
        '    tbody.innerHTML=html;\n' +
        '    azBindRows();\n' +
        '    azUpdateCount();\n' +
        '  }\n' +
        '  function azBindRows(){\n' +
        '    document.querySelectorAll("#azTableBody .tq-row").forEach(function(row){\n' +
        '      row.addEventListener("click",function(e){\n' +
        '        if(e.target.tagName==="INPUT"||e.target.tagName==="A") return;\n' +
        '        var cb=row.querySelector(".az-check");\n' +
        '        if(cb){cb.checked=!cb.checked;azToggle(cb);azUpdateCount()}\n' +
        '      });\n' +
        '    });\n' +
        '    document.querySelectorAll(".az-check").forEach(function(cb){\n' +
        '      cb.addEventListener("change",function(){azToggle(cb);azUpdateCount()});\n' +
        '    });\n' +
        '  }\n' +
        '  function azToggle(cb){\n' +
        '    var id=cb.getAttribute("data-id");\n' +
        '    if(cb.checked) azSelectedIds[id]=true; else delete azSelectedIds[id];\n' +
        '    var row=cb.closest(".tq-row");\n' +
        '    if(row) row.classList.toggle("selected",cb.checked);\n' +
        '  }\n' +
        '  function azUpdateCount(){\n' +
        '    var n=Object.keys(azSelectedIds).length;\n' +
        '    document.getElementById("azSelectedCount").textContent=n;\n' +
        '    document.getElementById("azPrintBtn").disabled=n===0;\n' +
        '  }\n' +
        '  document.getElementById("azSearchInput").addEventListener("input",function(){azSearchQuery=this.value.toLowerCase();azRender()});\n' +
        '  document.getElementById("azCheckAll").addEventListener("change",function(){\n' +
        '    var checked=this.checked;\n' +
        '    document.querySelectorAll(".az-check").forEach(function(cb){cb.checked=checked;azToggle(cb)});\n' +
        '    azUpdateCount();\n' +
        '  });\n' +
        '  var azAllSel=false;\n' +
        '  document.getElementById("azSelectAllBtn").addEventListener("click",function(){\n' +
        '    azAllSel=!azAllSel;\n' +
        '    document.querySelectorAll(".az-check").forEach(function(cb){cb.checked=azAllSel;azToggle(cb)});\n' +
        '    document.getElementById("azCheckAll").checked=azAllSel;\n' +
        '    this.textContent=azAllSel?"Deselect All":"Select All";\n' +
        '    azUpdateCount();\n' +
        '  });\n' +
        '  document.querySelectorAll("th[data-azsort]").forEach(function(th){\n' +
        '    th.addEventListener("click",function(){azSortBy=th.getAttribute("data-azsort");azRender()});\n' +
        '  });\n' +
        '  document.getElementById("azPrintBtn").addEventListener("click",function(){\n' +
        '    var ids=Object.keys(azSelectedIds);\n' +
        '    if(!ids.length){alert("Select at least one shipment.");return}\n' +
        '    window.open(BASE_URL+"&action=printamazon&recIds="+ids.join(","),"_blank");\n' +
        '  });\n' +
        '  document.getElementById("soBtnCount").textContent=ALL_ORDERS.length;\n' +
        '  azRender();\n' +
        '\n' +
        '  // Initial render\n' +
        '  renderTable();\n' +
        '})();\n' +
        '</script>\n</body>\n</html>';
    };

    // ── Entry Point ────────────────────────────────────────────────────
    const onRequest = (context) => {
        if (context.request.parameters.action === 'print') {
            handlePrint(context);
            return;
        }
        if (context.request.parameters.action === 'markprinted') {
            handleMarkPrinted(context);
            return;
        }
        if (context.request.parameters.action === 'printamazon') {
            handlePrintAmazon(context);
            return;
        }
        handleForm(context);
    };

    // ── Form + Search (loads ALL data for location, client filters the rest) ──
    const handleForm = (context) => {
        const request = context.request;
        const locationId = request.parameters.locationId || DEFAULT_LOCATION;

        const suiteletUrl = url.resolveScript({
            scriptId: runtime.getCurrentScript().id,
            deploymentId: runtime.getCurrentScript().deploymentId
        });

        const locations = getLocations();

        // ── Header search: load ALL orders for this location (no on-hold/reprint filter)
        // Always include location 26 (Refurbishment warehouse) regardless of selected location
        const REFURB_LOCATION = '26';
        const locationFilter = locationId === REFURB_LOCATION ? [locationId] : [locationId, REFURB_LOCATION];
        const filters = [
            ['type', 'anyof', 'SalesOrd'],
            'AND', ['status', 'anyof', STATUSES],
            'AND', ['location', 'anyof', locationFilter],
            'AND', ['mainline', 'is', 'T']
        ];

        const orderSearch = search.create({
            type: search.Type.SALES_ORDER,
            filters: filters,
            columns: [
                search.createColumn({ name: 'tranid', sort: search.Sort.ASC }),
                search.createColumn({ name: 'entity' }),
                search.createColumn({ name: 'trandate' }),
                search.createColumn({ name: 'statusref' }),
                search.createColumn({ name: 'custbody_celigo_etail_channel' }),
                search.createColumn({ name: 'custbody_on_hold_message' }),
                search.createColumn({ name: 'custbody_on_hold' }),
                search.createColumn({ name: 'tobeprinted' }),
                search.createColumn({ name: 'salesrep' }),
                search.createColumn({ name: 'custbody_approval_date' }),
                search.createColumn({ name: 'location' })
            ]
        });

        let headerResults = [];
        orderSearch.run().each((result) => {
            headerResults.push({
                id:          String(result.id),
                tranid:      result.getValue('tranid') || '',
                customer:    result.getText('entity') || '',
                date:        result.getValue('trandate') || '',
                status:      result.getText('statusref') || '',
                channelVal:  result.getValue('custbody_celigo_etail_channel') || '',
                channelText: result.getText('custbody_celigo_etail_channel') || result.getValue('custbody_celigo_etail_channel') || '',
                onHold:      (result.getValue('custbody_on_hold') === 'T' || result.getValue('custbody_on_hold') === true || (result.getValue('custbody_on_hold_message') && result.getValue('custbody_on_hold_message') !== '')) ? 'T' : 'F',
                onHoldMsg:   result.getValue('custbody_on_hold_message') || '',
                toBePrinted: normalizeBool(result.getValue('tobeprinted')),
                salesRepVal:  result.getValue('salesrep') || '',
                salesRepText: result.getText('salesrep') || '',
                approvalDate: result.getValue('custbody_approval_date') || '',
                locationId:  String(result.getValue('location') || '')
            });
            return true;
        });

        // ── Unpicked filter ───────────────────────────────────────────
        // Location 26 (Refurbishment warehouse) has negative quantities — always include them
        // Drop ship lines (custcol_so_is_drop_ship = T) are excluded — nothing to physically pick
        if (headerResults.length > 0) {
            const needsPickingIds = {};
            const nonRefurbIds = headerResults.filter((r) => r.locationId !== REFURB_LOCATION).map((r) => r.id);
            for (let start = 0; start < nonRefurbIds.length; start += SEARCH_BATCH) {
                const batch = nonRefurbIds.slice(start, start + SEARCH_BATCH);
                search.create({
                    type: search.Type.SALES_ORDER,
                    filters: [
                        ['internalid', 'anyof', batch],
                        'AND', ['mainline', 'is', 'F'],
                        'AND', ['taxline', 'is', 'F'],
                        'AND', ['shipping', 'is', 'F'],
                        'AND', ['cogs', 'is', 'F'],
                        'AND', ['custcol_so_is_drop_ship', 'is', 'F'],
                        'AND', ['formulanumeric: NVL({quantity},0) - NVL({quantitypicked},0)', 'greaterthan', '0']
                    ],
                    columns: [search.createColumn({ name: 'internalid', summary: 'GROUP' })]
                }).run().each((result) => {
                    needsPickingIds[result.getValue({ name: 'internalid', summary: 'GROUP' })] = true;
                    return true;
                });
            }
            headerResults = headerResults.filter((r) => r.locationId === REFURB_LOCATION || needsPickingIds[r.id]);
        }

        // ── Uncommitted filter ────────────────────────────────────────
        // Location 26 (Refurbishment warehouse) always shows regardless of committed status
        // Drop ship lines (custcol_so_is_drop_ship = T) are excluded — not stocked/committed here
        if (headerResults.length > 0) {
            const nonRefurbResults = headerResults.filter((r) => r.locationId !== REFURB_LOCATION);
            if (nonRefurbResults.length > 0) {
                const uncommittedIds = {};
                const ids = nonRefurbResults.map((r) => r.id);
                for (let start = 0; start < ids.length; start += SEARCH_BATCH) {
                    const batch = ids.slice(start, start + SEARCH_BATCH);
                    search.create({
                        type: search.Type.SALES_ORDER,
                        filters: [
                            ['internalid', 'anyof', batch],
                            'AND', ['mainline', 'is', 'F'],
                            'AND', ['taxline', 'is', 'F'],
                            'AND', ['shipping', 'is', 'F'],
                            'AND', ['cogs', 'is', 'F'],
                            'AND', ['custcol_so_is_drop_ship', 'is', 'F'],
                            'AND', ['item.type', 'anyof', 'InvtPart', 'Assembly', 'Kit', 'SerializedInventoryItem', 'LotNumberedInventoryItem'],
                            'AND', ['formulanumeric: NVL({quantity},0) - NVL({quantitycommitted},0) - NVL({quantityshiprecv},0)', 'greaterthan', '0']
                        ],
                        columns: [search.createColumn({ name: 'internalid', summary: 'GROUP' })]
                    }).run().each((result) => {
                        uncommittedIds[result.getValue({ name: 'internalid', summary: 'GROUP' })] = true;
                        return true;
                    });
                }
                headerResults = headerResults.filter((r) => r.locationId === REFURB_LOCATION || !uncommittedIds[r.id]);
            }
        }

        // ── Line-item sort data (item name, brand, bin) ───────────────
        // Drop ship lines (custcol_so_is_drop_ship = T) are excluded so the sort
        // key reflects the first pickable stock line, not a drop ship line.
        const orderItemData = {};
        if (headerResults.length > 0) {
            const allIds = headerResults.map((r) => r.id);
            for (let start = 0; start < allIds.length; start += SEARCH_BATCH) {
                const batch = allIds.slice(start, start + SEARCH_BATCH);
                search.create({
                    type: search.Type.SALES_ORDER,
                    filters: [
                        ['internalid', 'anyof', batch],
                        'AND', ['mainline', 'is', 'F'],
                        'AND', ['taxline', 'is', 'F'],
                        'AND', ['shipping', 'is', 'F'],
                        'AND', ['cogs', 'is', 'F'],
                        'AND', ['custcol_so_is_drop_ship', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'item' }),
                        search.createColumn({ name: 'description', join: 'item' }),
                        search.createColumn({ name: 'custcol_pick_bin' })
                    ]
                }).run().each((result) => {
                    const id = String(result.id);
                    if (!orderItemData[id]) {
                        const desc = result.getValue({ name: 'description', join: 'item' }) || '';
                        orderItemData[id] = {
                            item:  getVal(result, 'item'),
                            brand: desc.trim().split(/\s+/)[0] || '',
                            bin:   getVal(result, 'custcol_pick_bin')
                        };
                    }
                    return true;
                });
            }
        }

        // ── Merge sort data into orders for client-side use ───────────
        headerResults.forEach((o) => {
            const sd = orderItemData[o.id] || {};
            o.sortItem  = sd.item || '';
            o.sortBrand = sd.brand || '';
            o.sortBin   = sd.bin || '';
        });

        // ── Amazon Shipments (separate view) ──────────────────────────
        // customrecord_ask rows still missing box/units-per-box setup.
        // Grouped by internalid so each row maps 1:1 to a printable ticket,
        // while the MAX formula collapses the inventory-location join.
        const amazonResults = [];
        const azGet = (result, name) => {
            const t = result.getText({ name, summary: 'GROUP' });
            if (t !== null && t !== undefined && t !== '') return t;
            const v = result.getValue({ name, summary: 'GROUP' });
            return (v !== null && v !== undefined) ? String(v) : '';
        };
        search.create({
            type: 'customrecord_ask',
            filters: [
                ['custrecord_asl_boxes', 'isempty', ''],
                'OR',
                ['custrecord_asl_units_per_box', 'isempty', '']
            ],
            columns: [
                search.createColumn({ name: 'internalid', summary: 'GROUP' }),
                search.createColumn({ name: 'created', summary: 'GROUP', sort: search.Sort.DESC }),
                search.createColumn({ name: 'custrecord_asl_sku', summary: 'GROUP' }),
                search.createColumn({ name: 'custrecord_asl_quanity', summary: 'GROUP' }),
                search.createColumn({ name: 'custrecord105', summary: 'GROUP' }),
                search.createColumn({ name: 'custrecord_to_location', summary: 'GROUP' }),
                search.createColumn({ name: 'custrecord_transparency_code_r', summary: 'GROUP' }),
                search.createColumn({
                    name: 'formulanumeric',
                    summary: 'MAX',
                    formula: "CASE WHEN {custrecord_asl_sku.inventorylocation} = 'FF-Warehouse A' THEN {custrecord_asl_sku.quantityavailable} ELSE 0 END"
                })
            ]
        }).run().each((result) => {
            amazonResults.push({
                id:           String(result.getValue({ name: 'internalid', summary: 'GROUP' })),
                dateAdded:    result.getValue({ name: 'created', summary: 'GROUP' }) || '',
                sku:          azGet(result, 'custrecord_asl_sku'),
                quantity:     result.getValue({ name: 'custrecord_asl_quanity', summary: 'GROUP' }) || '',
                highPriority: normalizeBool(result.getValue({ name: 'custrecord105', summary: 'GROUP' })),
                amazonStore:  azGet(result, 'custrecord_to_location'),
                transparency: normalizeBool(result.getValue({ name: 'custrecord_transparency_code_r', summary: 'GROUP' })),
                whAvail:      result.getValue({ name: 'formulanumeric', summary: 'MAX' }) || ''
            });
            return true;
        });

        // ── Render ────────────────────────────────────────────────────
        context.response.write(buildPageHtml({
            suiteletUrl, locations, locationId, orders: headerResults, amazonOrders: amazonResults
        }));
    };

    // ── PDF Generation ─────────────────────────────────────────────────
    const handlePrint = (context) => {
        const orderIdsParam = context.request.parameters.orderIds;
        if (!orderIdsParam) { context.response.write('<html><body><p>No orders selected.</p></body></html>'); return; }
        const orderIds = orderIdsParam.split(',').filter(Boolean);
        if (orderIds.length === 0) { context.response.write('<html><body><p>No orders selected.</p></body></html>'); return; }

        const orderData = {};
        const headerCols = [
            'tranid', 'trandate', 'shipmethod', 'terms', 'salesrep',
            'shipaddress', 'shippingcost', 'billzip',
            'custbody_on_hold_message', 'custbody_rfs_picker', 'custbody28',
            'custbody_shipping_terms', 'custbody_latest_ship',
            'custbody_shipper_number', 'custbody_fedex_shipper_number',
            'custbodyspecialinstructions', 'custbodyshippinginstructions',
            'custbody_dont_insure', 'custbody_ship_blind',
            'custbody_order_contact_email', 'custbody19',
            'custbody_approval_date', 'custbody_celigo_etail_order_id',
            'source'
        ];
        const lineCols = ['item', 'quantity', 'custcol_transparency_code_line_requir', 'custcol_verified_dims', 'custcol_pick_bin'];

        for (let start = 0; start < orderIds.length; start += SEARCH_BATCH) {
            const batch = orderIds.slice(start, start + SEARCH_BATCH);

            search.create({
                type: search.Type.SALES_ORDER,
                filters: [['internalid', 'anyof', batch], 'AND', ['mainline', 'is', 'T']],
                columns: headerCols.map((col) => search.createColumn({ name: col }))
            }).run().each((result) => {
                orderData[result.id] = {
                    tranid: getVal(result, 'tranid'), trandate: getVal(result, 'trandate'),
                    onHoldMessage: getVal(result, 'custbody_on_hold_message'), picker: getVal(result, 'custbody_rfs_picker'),
                    contactName: getVal(result, 'custbody28'), shipmethod: getVal(result, 'shipmethod'),
                    shippingTerms: getVal(result, 'custbody_shipping_terms'), terms: getVal(result, 'terms'),
                    salesrep: getVal(result, 'salesrep'), latestShip: getVal(result, 'custbody_latest_ship'),
                    upsShipper: getVal(result, 'custbody_shipper_number'), fedexShipper: getVal(result, 'custbody_fedex_shipper_number'),
                    specialInstructions: getVal(result, 'custbodyspecialinstructions'),
                    shippingInstructions: getVal(result, 'custbodyshippinginstructions'),
                    dontInsure: getVal(result, 'custbody_dont_insure'),
                    shipBlind: result.getValue('custbody_ship_blind'),                       // raw value for isTrue()
                    contactEmail: getVal(result, 'custbody_order_contact_email'), partialDropShip: getVal(result, 'custbody19'),
                    shippingCost: getVal(result, 'shippingcost'), approvalDate: getVal(result, 'custbody_approval_date'),
                    etailOrderId: getVal(result, 'custbody_celigo_etail_order_id'),
                    billingZip: getVal(result, 'billzip'),
                    source: getVal(result, 'source'),                                  // 'Web' for telquestintl.com webstore orders
                    shipaddress: result.getValue('shipaddress') || '', items: []
                };
                return true;
            });

            // Line items — drop ship lines (custcol_so_is_drop_ship = T) excluded from the PDF
            search.create({
                type: search.Type.SALES_ORDER,
                filters: [['internalid', 'anyof', batch], 'AND', ['mainline', 'is', 'F'], 'AND', ['taxline', 'is', 'F'], 'AND', ['shipping', 'is', 'F'], 'AND', ['cogs', 'is', 'F'], 'AND', ['custcol_so_is_drop_ship', 'is', 'F']],
                columns: [...lineCols.map((col) => search.createColumn({ name: col })), search.createColumn({ name: 'memo' }), search.createColumn({ name: 'description', join: 'item' }), search.createColumn({ name: 'custitem_extended_description', join: 'item' })]
            }).run().each((result) => {
                if (orderData[result.id]) {
                    // Prefer the sales order LINE description (line-level memo).
                    // Fall back to the item-record description if the line is blank
                    // (e.g. service/warranty or manually added lines with no line text).
                    const lineDesc = result.getValue('memo') || '';
                    const itemDesc = result.getValue({ name: 'description', join: 'item' }) || '';
                    orderData[result.id].items.push({
                        name: getVal(result, 'item'),
                        description: lineDesc.trim() !== '' ? lineDesc : itemDesc,
                        quantity: getVal(result, 'quantity'),
                        transparencyCode: result.getValue('custcol_transparency_code_line_requir'),  // raw for isTrue()
                        verifiedDims: getVal(result, 'custcol_verified_dims'),
                        extendedDescription: result.getValue({ name: 'custitem_extended_description', join: 'item' }) || '',
                        pickBin: getVal(result, 'custcol_pick_bin')
                    });
                }
                return true;
            });
        }

        const sortBy = context.request.parameters.sortBy || 'item';
        const sortableIds = orderIds.filter((id) => orderData[id]);
        const sortKeys = {};
        sortableIds.forEach((id) => {
            const items = orderData[id].items;
            if (items.length > 0) {
                const desc = items[0].description || '';
                sortKeys[id] = { item: items[0].name || '', brand: desc.trim().split(/\s+/)[0] || '', bin: items[0].pickBin || '' };
            } else { sortKeys[id] = { item: '', brand: '', bin: '' }; }
        });
        sortableIds.sort((a, b) => {
            const ad = sortKeys[a], bd = sortKeys[b];
            if (sortBy === 'item') return ad.item.localeCompare(bd.item);
            if (sortBy === 'brand') return ad.brand.localeCompare(bd.brand);
            if (sortBy === 'bin') return ad.bin.localeCompare(bd.bin);
            if (sortBy === 'approvalDate') return (orderData[a].approvalDate || '').localeCompare(orderData[b].approvalDate || '');
            return (orderData[a].tranid || '').localeCompare(orderData[b].tranid || '');
        });

        const xmlParts = sortableIds.map((id) => buildTicketXml(orderData[id]));
        if (xmlParts.length === 0) { context.response.write('<html><body><p>No order data found.</p></body></html>'); return; }

        let finalXml;
        if (xmlParts.length === 1) {
            finalXml = '<?xml version="1.0"?>\n<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n' + xmlParts[0];
        } else {
            finalXml = '<?xml version="1.0"?>\n<!DOCTYPE pdfset PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n<pdfset>\n' + xmlParts.join('\n') + '\n</pdfset>';
        }

        context.response.writeFile({ file: render.xmlToPdf({ xmlString: finalXml }), isInline: true });
    };

    // ── Mark orders as printed (called async after PDF delivery) ─────
    const handleMarkPrinted = (context) => {
        const orderIdsParam = context.request.parameters.orderIds;
        const results = { success: [], failed: [] };

        if (orderIdsParam) {
            const orderIds = orderIdsParam.split(',').filter(Boolean);
            orderIds.forEach((id) => {
                try {
                    record.submitFields({
                        type: record.Type.SALES_ORDER,
                        id: id,
                        values: { tobeprinted: true },
                        options: { enableSourcing: false, ignoreMandatoryFields: true }
                    });
                    results.success.push(id);
                } catch (e) {
                    log.error({ title: 'Failed to mark order printed', details: 'Order ID: ' + id + ' - ' + e.message });
                    results.failed.push(id);
                }
            });
        }

        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        context.response.write(JSON.stringify(results));
    };

    // ── Amazon Shipment Picking Ticket (customrecord_ask) ──────────────
    // Ported from SUT single-record Amazon ticket; one ticket per record,
    // combined into a pdfset for bulk print. Reuses escapeXml / isTrue / yn.
    const AMAZON_BIN_BARCODE = 'Amazon FBA Shipments';

    const buildAmazonAlertsBanner = (o) => {
        const e = escapeXml;
        if (!isTrue(o.transparency)) return '';
        const row = '<tr><td style="background-color:#dc2626;color:#ffffff;font-size:12pt;font-weight:bold;padding:6px 10px;border:1.5px solid #000000;">' +
            e('TRANSPARENCY CODE REQUIRED \u2014 APPLY BEFORE PACKING') + '</td></tr>';
        return '<table style="width:100%;margin:6px 0;border-collapse:collapse;">' + row + '</table>';
    };

    const buildAmazonInfoSection = (o) => {
        const e = escapeXml;
        const headerBar = 'background-color:#2c3e50;color:#ffffff;font-weight:bold;padding:9px 14px;font-size:12pt;';
        const labelCell = 'background-color:#f5f5f5;font-weight:bold;padding:12px 18px;border:0.5px solid #c0c0c0;width:30%;';
        const valueCell = 'padding:12px 18px;border:0.5px solid #c0c0c0;';
        const row = (label, val) =>
            '<tr><td style="' + labelCell + '">' + label + '</td><td style="' + valueCell + '">' + e(val) + '</td></tr>';
        return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:16px;font-size:11pt;">' +
            '<tr><td colspan="2" style="' + headerBar + '">SHIPMENT DETAILS</td></tr>' +
            row('UPC', o.upc) +
            row('Quantity to Pick', o.quantity) +
            row('Units per Box', o.unitsPerBox) +
            row('Boxes', o.boxes) +
            row('Pick From Location', o.fromLocation) +
            row('Destination (Amazon WH)', o.amazonWarehouse) +
            row('Transfer Order', o.transferOrder) +
            row('Pick Up Date', o.pickUpDate) +
            '</table>';
    };

    const buildAmazonItemTable = (o) => {
        const e = escapeXml;
        const flagged = isTrue(o.transparency);
        const rowBg = flagged ? ' style="background-color:#fee2e2;"' : '';
        const cellBg = flagged ? 'background-color:#fee2e2;font-weight:bold;color:#7f1d1d;' : '';
        const barcodeCellBg = flagged ? 'background-color:#fee2e2;' : '';
        const itemRow =
            '<tr' + rowBg + '>' +
            '<td colspan="4" style="' + barcodeCellBg + 'width:164px;height:29px;"><barcode codetype="code128" style="width:100pt;height:30pt;" showtext="true" value="' + e(o.sku) + '"/></td>' +
            '<td style="' + cellBg + 'width:240px;height:29px;">' + e(o.description) + '</td>' +
            '<td style="' + cellBg + 'height:29px;width:80px;">' + e(o.quantity) + '</td>' +
            '<td style="' + cellBg + 'height:29px;width:90px;">' + yn(o.transparency) + '</td>' +
            '<td style="' + cellBg + 'height:29px;width:110px;">' + e(o.bin) + '</td>' +
            '</tr>';
        return '<table class="itemtable" style="width:100%;margin-top:10px;"><thead><tr>' +
            '<th colspan="4" style="width:164px;">Item</th>' +
            '<th style="width:240px;">Description</th>' +
            '<th style="width:80px;">Qty to Pick</th>' +
            '<th style="width:90px;">Transparency Code Req</th>' +
            '<th style="width:110px;">Bin Location</th>' +
            '</tr></thead>' + itemRow + '</table>';
    };

    const buildAmazonTicketXml = (o) => {
        const e = escapeXml;
        return '<pdf>\n<head>\n' +
            '    <link name="NotoSans" type="font" subtype="truetype" src="${nsfont.NotoSans_Regular}" src-bold="${nsfont.NotoSans_Bold}" src-italic="${nsfont.NotoSans_Italic}" src-bolditalic="${nsfont.NotoSans_BoldItalic}" bytes="2" />\n' +
            '    <macrolist><macro id="nlfooter"><table style="width:100%;"><tr><td style="text-align:right;padding-top:4px;"><barcode codetype="code128" style="width:120pt;height:30pt;" showtext="true" value="' + e(AMAZON_BIN_BARCODE) + '"/></td></tr></table></macro></macrolist>\n' +
            '    <style type="text/css">\n' +
            '        * { font-family: NotoSans, sans-serif; }\n' +
            '        table { font-size: 9pt; table-layout: fixed; }\n' +
            '        th { font-weight: bold; font-size: 8pt; vertical-align: middle; padding: 5px 6px 3px; background-color: #e3e3e3; color: #333333; }\n' +
            '        td { padding: 4px 6px; }\n' +
            '        table.itemtable th { padding-bottom: 10px; padding-top: 10px; }\n' +
            '    </style>\n</head>\n' +
            '<body footer="nlfooter" footer-height="42pt" padding="0.5in 0.5in 0.5in 0.5in" size="Letter">\n' +
            buildAmazonAlertsBanner(o) +
            '    <table cellpadding="1" cellspacing="1" style="width:813px;"><tr>\n' +
            '    <td style="height:29px;width:420px;"><span style="font-size:18px;"><strong>Picking Ticket</strong></span></td>\n' +
            '    <td rowspan="3" style="height:29px;width:344px;text-align:right;"><barcode codetype="code128" style="width:100pt;height:30pt;" showtext="true" value="' + e(o.fbaShipmentId || o.sku) + '"/></td>\n' +
            '    </tr><tr><td style="width:420px;"><span style="font-size:20px;"><strong>' + e(o.sku) + '</strong></span></td></tr>\n' +
            '    <tr><td style="width:420px;"><span style="font-size:13px;">FBA Shipment: ' + e(o.fbaShipmentId) + '</span></td></tr></table>\n' +
            '    <div style="font-size:12pt;font-weight:bold;margin-top:6px;">' + e(o.description) + '</div>\n' +
            buildAmazonInfoSection(o) +
            '<br />' + buildAmazonItemTable(o) + '\n' +
            '</body>\n</pdf>';
    };

    const handlePrintAmazon = (context) => {
        const recIdsParam = context.request.parameters.recIds;
        if (!recIdsParam) { context.response.write('<html><body><p>No shipments selected.</p></body></html>'); return; }
        const recIds = recIdsParam.split(',').filter(Boolean);
        if (recIds.length === 0) { context.response.write('<html><body><p>No shipments selected.</p></body></html>'); return; }

        const data = {};
        const cols = [
            'custrecord_asl_sku', 'custrecord_asl_description', 'custrecord_asl_upc',
            'custrecord_asl_quanity', 'custrecord_asl_units_per_box', 'custrecord_asl_boxes',
            'custrecord_asl_from_location', 'custrecord_asl_amazon_warehouse',
            'custrecord_asl_fba_shipment_id', 'custrecord_ass_transfer_order',
            'custrecord_pick_up_date', 'custrecord_asl_bin', 'custrecord_transparency_code_r'
        ].map((n) => search.createColumn({ name: n }));

        for (let start = 0; start < recIds.length; start += SEARCH_BATCH) {
            const batch = recIds.slice(start, start + SEARCH_BATCH);
            search.create({
                type: 'customrecord_ask',
                filters: [['internalid', 'anyof', batch]],
                columns: cols
            }).run().each((result) => {
                data[result.id] = {
                    sku:             getVal(result, 'custrecord_asl_sku'),
                    description:     getVal(result, 'custrecord_asl_description'),
                    upc:             getVal(result, 'custrecord_asl_upc'),
                    quantity:        getVal(result, 'custrecord_asl_quanity'),
                    unitsPerBox:     getVal(result, 'custrecord_asl_units_per_box'),
                    boxes:           getVal(result, 'custrecord_asl_boxes'),
                    fromLocation:    getVal(result, 'custrecord_asl_from_location'),
                    amazonWarehouse: getVal(result, 'custrecord_asl_amazon_warehouse'),
                    fbaShipmentId:   getVal(result, 'custrecord_asl_fba_shipment_id'),
                    transferOrder:   getVal(result, 'custrecord_ass_transfer_order'),
                    pickUpDate:      getVal(result, 'custrecord_pick_up_date'),
                    bin:             getVal(result, 'custrecord_asl_bin'),
                    transparency:    result.getValue('custrecord_transparency_code_r')  // raw for isTrue()
                };
                return true;
            });
        }

        const xmlParts = recIds.filter((id) => data[id]).map((id) => buildAmazonTicketXml(data[id]));
        if (xmlParts.length === 0) { context.response.write('<html><body><p>No shipment data found.</p></body></html>'); return; }

        let finalXml;
        if (xmlParts.length === 1) {
            finalXml = '<?xml version="1.0"?>\n<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n' + xmlParts[0];
        } else {
            finalXml = '<?xml version="1.0"?>\n<!DOCTYPE pdfset PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n<pdfset>\n' + xmlParts.join('\n') + '\n</pdfset>';
        }

        context.response.writeFile({ file: render.xmlToPdf({ xmlString: finalXml }), isInline: true });
    };

    return { onRequest };
});