/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Inbound Shipment Calendar Suitelet
 * Displays a large, warehouse-friendly interactive calendar for managing inbound shipments.
 * Covers the current year through the next 10 years.
 * Creates records on customrecord_purchase_receipt_report.
 */
define(['N/ui/serverWidget', 'N/record', 'N/search', 'N/log', 'N/format', 'N/runtime', 'N/url'],
    (serverWidget, record, search, log, format, runtime, url) => {

        /**
         * Load existing shipment records for the given year/month range.
         * Returns an array of shipment objects.
         */
        /**
         * Load active employees for the purchaser dropdown.
         * Returns an array of { id, name }.
         */
        function loadEmployees() {
            const employees = [];
            try {
                const srch = search.create({
                    type: search.Type.EMPLOYEE,
                    filters: [
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'entityid' }),
                        search.createColumn({ name: 'firstname' }),
                        search.createColumn({ name: 'lastname' })
                    ]
                });
                const pagedData = srch.runPaged({ pageSize: 1000 });
                pagedData.pageRanges.forEach(pageRange => {
                    const page = pagedData.fetch({ index: pageRange.index });
                    page.data.forEach(result => {
                        const first = result.getValue('firstname') || '';
                        const last = result.getValue('lastname') || '';
                        const displayName = (first + ' ' + last).trim() || result.getValue('entityid') || '';
                        employees.push({
                            id: result.getValue('internalid'),
                            name: displayName
                        });
                    });
                });
                employees.sort((a, b) => a.name.localeCompare(b.name));
            } catch (e) {
                log.error({ title: 'loadEmployees Error', details: e.message });
            }
            return employees;
        }

        function loadShipments() {
            const shipments = [];
            try {
                const srch = search.create({
                    type: 'customrecord_purchase_receipt_report',
                    filters: [
                        ['isinactive', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'custrecord_po_number_text' }),
                        search.createColumn({ name: 'custrecord_expected_delivery_date' }),
                        search.createColumn({ name: 'custrecord_number_of_skids' }),
                        search.createColumn({ name: 'custrecord_number_of_boxes' }),
                        search.createColumn({ name: 'custrecord_detailed_description_of_shipm' }),
                        search.createColumn({ name: 'custrecord115' })
                    ]
                });

                const pagedData = srch.runPaged({ pageSize: 1000 });
                pagedData.pageRanges.forEach(pageRange => {
                    const page = pagedData.fetch({ index: pageRange.index });
                    page.data.forEach(result => {
                        const rawDate = result.getValue('custrecord_expected_delivery_date');
                        shipments.push({
                            id: result.getValue('internalid'),
                            poNumber: result.getValue('custrecord_po_number_text') || '',
                            date: rawDate || '',
                            skids: result.getValue('custrecord_number_of_skids') || '',
                            boxes: result.getValue('custrecord_number_of_boxes') || '',
                            description: result.getValue('custrecord_detailed_description_of_shipm') || '',
                            purchaserId: result.getValue('custrecord115') || '',
                            purchaserName: result.getText('custrecord115') || ''
                        });
                    });
                });
            } catch (e) {
                log.error({ title: 'loadShipments Error', details: e.message });
            }
            return shipments;
        }

        /**
         * Create a new shipment record from POST data.
         */
        function createShipment(data) {
            const rec = record.create({
                type: 'customrecord_purchase_receipt_report',
                isDynamic: true
            });

            rec.setValue({ fieldId: 'custrecord_po_number_text', value: data.poNumber });
            rec.setValue({ fieldId: 'custrecord_expected_delivery_date', value: format.parse({ value: data.date, type: format.Type.DATE }) });

            if (data.skids) {
                rec.setValue({ fieldId: 'custrecord_number_of_skids', value: parseInt(data.skids, 10) });
            }
            if (data.boxes) {
                rec.setValue({ fieldId: 'custrecord_number_of_boxes', value: parseInt(data.boxes, 10) });
            }
            if (data.description) {
                rec.setValue({ fieldId: 'custrecord_detailed_description_of_shipm', value: data.description });
            }
            if (data.purchaserId) {
                rec.setValue({ fieldId: 'custrecord115', value: parseInt(data.purchaserId, 10) });
            }

            const recId = rec.save({ enableSourcing: false, ignoreMandatoryFields: true });
            log.audit({ title: 'Shipment Created', details: 'Record ID: ' + recId });
            return recId;
        }

        /**
         * Update an existing shipment record.
         */
        function updateShipment(data) {
            const rec = record.load({
                type: 'customrecord_purchase_receipt_report',
                id: parseInt(data.id, 10),
                isDynamic: true
            });

            if (data.poNumber !== undefined) {
                rec.setValue({ fieldId: 'custrecord_po_number_text', value: data.poNumber });
            }
            if (data.date) {
                rec.setValue({ fieldId: 'custrecord_expected_delivery_date', value: format.parse({ value: data.date, type: format.Type.DATE }) });
            }
            if (data.skids !== undefined) {
                rec.setValue({ fieldId: 'custrecord_number_of_skids', value: data.skids ? parseInt(data.skids, 10) : '' });
            }
            if (data.boxes !== undefined) {
                rec.setValue({ fieldId: 'custrecord_number_of_boxes', value: data.boxes ? parseInt(data.boxes, 10) : '' });
            }
            if (data.description !== undefined) {
                rec.setValue({ fieldId: 'custrecord_detailed_description_of_shipm', value: data.description });
            }
            if (data.purchaserId !== undefined) {
                rec.setValue({ fieldId: 'custrecord115', value: data.purchaserId ? parseInt(data.purchaserId, 10) : '' });
            }

            rec.save({ enableSourcing: false, ignoreMandatoryFields: true });
            log.audit({ title: 'Shipment Updated', details: 'Record ID: ' + data.id });
            return data.id;
        }

        /**
         * Delete (inactivate) a shipment record.
         */
        function deleteShipment(id) {
            record.submitFields({
                type: 'customrecord_purchase_receipt_report',
                id: parseInt(id, 10),
                values: { isinactive: true }
            });
            log.audit({ title: 'Shipment Deleted', details: 'Record ID: ' + id });
        }

        /**
         * Build the full HTML calendar page.
         */
        function buildCalendarHTML(shipments, suiteletUrl, employees) {
            const shipmentsJSON = JSON.stringify(shipments).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
            const employeesJSON = JSON.stringify(employees).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
            const currentYear = new Date().getFullYear();
            const maxYear = currentYear + 10;

            return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Warehouse Inbound Shipment Calendar</title>
<style>
    /* ===== RESET & BASE ===== */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        min-height: 100vh;
    }

    /* ===== HEADER ===== */
    .header {
        background: linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%);
        padding: 20px 40px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 3px solid #f59e0b;
        flex-wrap: wrap;
        gap: 15px;
    }
    .header-title {
        display: flex;
        align-items: center;
        gap: 15px;
    }
    .header-title .icon {
        font-size: 40px;
    }
    .header-title h1 {
        font-size: 28px;
        font-weight: 700;
        color: #f8fafc;
        letter-spacing: 0.5px;
    }
    .header-title h1 span {
        color: #f59e0b;
    }

    /* ===== CONTROLS ===== */
    .controls {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }
    .nav-btn {
        background: #334155;
        color: #f8fafc;
        border: 2px solid #475569;
        border-radius: 10px;
        padding: 12px 22px;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .nav-btn:hover {
        background: #475569;
        border-color: #f59e0b;
        transform: translateY(-1px);
    }
    .nav-btn.today-btn {
        background: #f59e0b;
        color: #0f172a;
        border-color: #f59e0b;
    }
    .nav-btn.today-btn:hover {
        background: #fbbf24;
    }
    .month-year-display {
        font-size: 26px;
        font-weight: 700;
        color: #f8fafc;
        min-width: 280px;
        text-align: center;
    }
    .year-select {
        background: #334155;
        color: #f8fafc;
        border: 2px solid #475569;
        border-radius: 10px;
        padding: 12px 16px;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
    }
    .year-select:focus {
        outline: none;
        border-color: #f59e0b;
    }

    /* ===== LEGEND ===== */
    .legend {
        display: flex;
        gap: 25px;
        padding: 12px 40px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        flex-wrap: wrap;
        align-items: center;
    }
    .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
        color: #94a3b8;
    }
    .legend-dot {
        width: 14px;
        height: 14px;
        border-radius: 4px;
    }
    .legend-dot.shipment { background: #3b82f6; }
    .legend-dot.today { background: #f59e0b; }
    .legend-dot.weekend { background: #475569; }

    .stats-bar {
        margin-left: auto;
        display: flex;
        gap: 20px;
        align-items: center;
    }
    .stat-badge {
        background: #334155;
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
        color: #f8fafc;
    }
    .stat-badge .num { color: #f59e0b; font-size: 16px; }

    /* ===== CALENDAR GRID ===== */
    .calendar-container {
        padding: 25px 40px 40px;
    }
    .weekday-header {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
        margin-bottom: 6px;
    }
    .weekday-header div {
        text-align: center;
        font-size: 16px;
        font-weight: 700;
        color: #94a3b8;
        padding: 10px 0;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
    }
    .day-cell {
        min-height: 130px;
        background: #1e293b;
        border-radius: 12px;
        padding: 10px;
        cursor: pointer;
        transition: all 0.2s;
        border: 2px solid transparent;
        position: relative;
        overflow: hidden;
    }
    .day-cell:hover {
        border-color: #3b82f6;
        background: #253347;
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(59,130,246,0.15);
    }
    .day-cell.other-month {
        opacity: 0.3;
        cursor: default;
    }
    .day-cell.other-month:hover {
        border-color: transparent;
        background: #1e293b;
        transform: none;
        box-shadow: none;
    }
    .day-cell.today {
        border-color: #f59e0b;
        background: #2d2206;
    }
    .day-cell.weekend {
        background: #162033;
    }
    .day-cell.has-shipment {
        border-color: #3b82f6;
        background: #1a2744;
    }
    .day-number {
        font-size: 20px;
        font-weight: 700;
        color: #e2e8f0;
        margin-bottom: 6px;
    }
    .day-cell.today .day-number {
        color: #f59e0b;
    }

    /* ===== SHIPMENT BADGES ===== */
    .shipment-badge {
        background: linear-gradient(135deg, #1d4ed8, #2563eb);
        color: #fff;
        border-radius: 8px;
        padding: 5px 8px;
        margin-bottom: 4px;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        transition: all 0.15s;
        line-height: 1.3;
        word-break: break-word;
    }
    .shipment-badge:hover {
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        transform: scale(1.03);
    }
    .shipment-badge .badge-icon {
        flex-shrink: 0;
        font-size: 13px;
    }
    .badge-more {
        background: #475569;
        color: #e2e8f0;
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
    }
    .badge-more:hover {
        background: #64748b;
    }

    /* ===== ADD BUTTON (on cell hover) ===== */
    .add-btn-cell {
        position: absolute;
        bottom: 6px;
        right: 6px;
        width: 28px;
        height: 28px;
        background: #f59e0b;
        color: #0f172a;
        border: none;
        border-radius: 50%;
        font-size: 20px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s;
        line-height: 1;
    }
    .day-cell:hover .add-btn-cell {
        opacity: 1;
    }
    .day-cell.other-month:hover .add-btn-cell {
        opacity: 0;
    }

    /* ===== MODAL OVERLAY ===== */
    .modal-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        z-index: 1000;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
    }
    .modal-overlay.active {
        display: flex;
    }
    .modal {
        background: #1e293b;
        border-radius: 20px;
        padding: 0;
        width: 580px;
        max-width: 95vw;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 60px rgba(0,0,0,0.5);
        border: 2px solid #334155;
    }
    .modal-header {
        background: linear-gradient(135deg, #1e3a5f, #0f2744);
        padding: 24px 30px;
        border-radius: 18px 18px 0 0;
        border-bottom: 3px solid #f59e0b;
    }
    .modal-header h2 {
        font-size: 24px;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .modal-header .modal-date {
        font-size: 16px;
        color: #94a3b8;
        margin-top: 6px;
    }
    .modal-body {
        padding: 30px;
    }
    .form-group {
        margin-bottom: 22px;
    }
    .form-group label {
        display: block;
        font-size: 15px;
        font-weight: 600;
        color: #94a3b8;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .form-group label .required {
        color: #ef4444;
    }
    .form-input {
        width: 100%;
        background: #0f172a;
        border: 2px solid #334155;
        border-radius: 10px;
        padding: 14px 16px;
        font-size: 18px;
        color: #f8fafc;
        transition: border-color 0.2s;
        font-family: inherit;
    }
    .form-input:focus {
        outline: none;
        border-color: #3b82f6;
    }
    .form-input::placeholder {
        color: #475569;
    }
    textarea.form-input {
        min-height: 100px;
        resize: vertical;
    }
    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
    }
    .modal-footer {
        padding: 0 30px 30px;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
    }
    .btn {
        padding: 14px 32px;
        border-radius: 10px;
        font-size: 17px;
        font-weight: 700;
        cursor: pointer;
        border: 2px solid transparent;
        transition: all 0.2s;
    }
    .btn-primary {
        background: #3b82f6;
        color: #fff;
        border-color: #3b82f6;
    }
    .btn-primary:hover {
        background: #2563eb;
        transform: translateY(-1px);
    }
    .btn-primary:disabled {
        background: #475569;
        border-color: #475569;
        cursor: not-allowed;
        transform: none;
    }
    .btn-cancel {
        background: transparent;
        color: #94a3b8;
        border-color: #475569;
    }
    .btn-cancel:hover {
        background: #334155;
        color: #f8fafc;
    }

    /* ===== VIEW MODAL (shipment details) ===== */
    .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 14px 0;
        border-bottom: 1px solid #334155;
        font-size: 17px;
    }
    .detail-row:last-child {
        border-bottom: none;
    }
    .detail-label {
        color: #94a3b8;
        font-weight: 600;
    }
    .detail-value {
        color: #f8fafc;
        font-weight: 700;
        text-align: right;
        max-width: 60%;
        word-break: break-word;
    }

    /* ===== TOAST ===== */
    .toast {
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: #065f46;
        color: #fff;
        padding: 18px 28px;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 2000;
        box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s ease;
    }
    .toast.show {
        transform: translateY(0);
        opacity: 1;
    }
    .toast.error {
        background: #991b1b;
    }

    /* ===== DRAG AND DROP ===== */
    .shipment-badge[draggable="true"] {
        cursor: grab;
    }
    .shipment-badge[draggable="true"]:active {
        cursor: grabbing;
    }
    .shipment-badge.dragging {
        opacity: 0.4;
        transform: scale(0.95);
    }
    .day-cell.drag-over {
        border-color: #f59e0b !important;
        background: #2d2206 !important;
        box-shadow: 0 0 20px rgba(245,158,11,0.3) !important;
        transform: translateY(-2px);
    }
    .day-cell.other-month.drag-over {
        border-color: transparent !important;
        background: #1e293b !important;
        box-shadow: none !important;
        transform: none;
    }

    /* ===== ACTION BUTTONS IN VIEW MODAL ===== */
    .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding: 0 30px 10px;
    }
    .btn-edit {
        background: #f59e0b;
        color: #0f172a;
        border-color: #f59e0b;
    }
    .btn-edit:hover {
        background: #fbbf24;
        transform: translateY(-1px);
    }
    .btn-delete {
        background: #dc2626;
        color: #fff;
        border-color: #dc2626;
    }
    .btn-delete:hover {
        background: #ef4444;
        transform: translateY(-1px);
    }
    .btn-delete:disabled, .btn-edit:disabled {
        background: #475569;
        border-color: #475569;
        cursor: not-allowed;
        transform: none;
    }

    /* ===== CONFIRM DIALOG ===== */
    .confirm-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.75);
        z-index: 2000;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
    }
    .confirm-overlay.active {
        display: flex;
    }
    .confirm-box {
        background: #1e293b;
        border: 2px solid #dc2626;
        border-radius: 16px;
        padding: 30px;
        width: 440px;
        max-width: 90vw;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    }
    .confirm-box .confirm-icon {
        font-size: 48px;
        margin-bottom: 12px;
    }
    .confirm-box h3 {
        font-size: 22px;
        color: #f8fafc;
        margin-bottom: 10px;
    }
    .confirm-box p {
        font-size: 16px;
        color: #94a3b8;
        margin-bottom: 24px;
        line-height: 1.5;
    }
    .confirm-buttons {
        display: flex;
        gap: 12px;
        justify-content: center;
    }

    /* ===== LOADING SPINNER ===== */
    .spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ===== RESPONSIVE ===== */
    @media (max-width: 1200px) {
        .day-cell { min-height: 100px; }
        .calendar-container { padding: 15px 20px 30px; }
        .header { padding: 15px 20px; }
    }
    @media (max-width: 768px) {
        .day-cell { min-height: 80px; padding: 6px; }
        .day-number { font-size: 16px; }
        .shipment-badge { font-size: 10px; padding: 3px 5px; }
        .month-year-display { font-size: 20px; min-width: auto; }
        .form-row { grid-template-columns: 1fr; }
    }
</style>
</head>
<body>

<!-- ===== HEADER ===== -->
<div class="header">
    <div class="header-title">
        <div class="icon">&#128230;</div>
        <h1>Inbound <span>Shipment</span> Calendar</h1>
    </div>
    <div class="controls">
        <button class="nav-btn" onclick="changeMonth(-1)" title="Previous Month">&#9664; Prev</button>
        <button class="nav-btn today-btn" onclick="goToToday()">Today</button>
        <button class="nav-btn" onclick="changeMonth(1)" title="Next Month">Next &#9654;</button>
        <div class="month-year-display" id="monthYearDisplay"></div>
        <select class="year-select" id="yearSelect" onchange="jumpToYear(this.value)"></select>
    </div>
</div>

<!-- ===== LEGEND ===== -->
<div class="legend">
    <div class="legend-item"><div class="legend-dot today"></div> Today</div>
    <div class="legend-item"><div class="legend-dot shipment"></div> Shipment Scheduled</div>
    <div class="legend-item"><div class="legend-dot weekend"></div> Weekend</div>
    <div class="stats-bar">
        <div class="stat-badge">This Month: <span class="num" id="monthCount">0</span> shipments</div>
        <div class="stat-badge">Total: <span class="num" id="totalCount">0</span> shipments</div>
    </div>
</div>

<!-- ===== CALENDAR ===== -->
<div class="calendar-container">
    <div class="weekday-header">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
    </div>
    <div class="calendar-grid" id="calendarGrid"></div>
</div>

<!-- ===== ADD/EDIT SHIPMENT MODAL ===== -->
<div class="modal-overlay" id="addModal">
    <div class="modal">
        <div class="modal-header">
            <h2 id="addModalTitle">&#128666; New Inbound Shipment</h2>
            <div class="modal-date" id="addModalDate"></div>
        </div>
        <input type="hidden" id="formEditId" value="">
        <div class="modal-body">
            <div class="form-group">
                <label>PO Number <span class="required">*</span></label>
                <input type="text" class="form-input" id="formPO" placeholder="e.g. 145268">
            </div>
            <div class="form-group">
                <label>Purchaser</label>
                <select class="form-input" id="formPurchaser">
                    <option value="">-- Select Purchaser --</option>
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Number of Skids</label>
                    <input type="number" class="form-input" id="formSkids" placeholder="0" min="0">
                </div>
                <div class="form-group">
                    <label>Number of Boxes</label>
                    <input type="number" class="form-input" id="formBoxes" placeholder="0" min="0">
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea class="form-input" id="formDesc" placeholder="e.g. 12 skids of widgets arriving via FedEx Freight"></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-cancel" onclick="closeAddModal()">Cancel</button>
            <button class="btn btn-primary" id="submitBtn" onclick="submitShipment()">
                Create Shipment
            </button>
        </div>
    </div>
</div>

<!-- ===== VIEW SHIPMENT MODAL ===== -->
<div class="modal-overlay" id="viewModal">
    <div class="modal">
        <div class="modal-header">
            <h2>&#128230; Shipment Details</h2>
            <div class="modal-date" id="viewModalDate"></div>
        </div>
        <div class="modal-body" id="viewModalBody"></div>
        <div class="modal-actions">
            <button class="btn btn-edit" id="viewEditBtn" onclick="editCurrentShipment()">Edit</button>
            <button class="btn btn-delete" id="viewDeleteBtn" onclick="confirmDeleteShipment()">Delete</button>
        </div>
        <div class="modal-footer">
            <button class="btn btn-cancel" onclick="closeViewModal()">Close</button>
        </div>
    </div>
</div>

<!-- ===== DELETE CONFIRM DIALOG ===== -->
<div class="confirm-overlay" id="confirmDialog">
    <div class="confirm-box">
        <div class="confirm-icon">&#9888;</div>
        <h3>Delete Shipment?</h3>
        <p id="confirmMsg">Are you sure you want to delete this shipment? This action cannot be undone.</p>
        <div class="confirm-buttons">
            <button class="btn btn-cancel" onclick="closeConfirmDialog()">Cancel</button>
            <button class="btn btn-delete" id="confirmDeleteBtn" onclick="executeDeleteShipment()">Delete</button>
        </div>
    </div>
</div>

<!-- ===== TOAST ===== -->
<div class="toast" id="toast"></div>

<script>
(function() {
    // ===== STATE =====
    const SUITELET_URL = "${suiteletUrl}";
    const CURRENT_YEAR = ${currentYear};
    const MAX_YEAR = ${maxYear};
    let shipments = ${shipmentsJSON};
    const employees = ${employeesJSON};
    let viewYear = new Date().getFullYear();
    let viewMonth = new Date().getMonth();
    let selectedDate = null;
    let currentViewShipment = null;  // tracks which shipment is shown in view modal
    let draggedShipmentId = null;     // tracks which shipment is being dragged

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // ===== GENERIC AJAX HELPER =====
    function postJSON(payload, onSuccess, onError) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', SUITELET_URL, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                try {
                    const resp = JSON.parse(xhr.responseText);
                    if (resp.success) { onSuccess(resp); }
                    else { onError(resp.error || 'Unknown error'); }
                } catch(e) { onError('Error processing response.'); }
            }
        };
        xhr.onerror = function() { onError('Network error. Please try again.'); };
        xhr.send(JSON.stringify(payload));
    }

    // ===== INIT =====
    function init() {
        populateYearSelect();
        populatePurchaserDropdown();
        renderCalendar();
        updateStats();
    }

    function populatePurchaserDropdown() {
        const sel = document.getElementById('formPurchaser');
        employees.forEach(function(emp) {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = emp.name;
            sel.appendChild(opt);
        });
    }

    function populateYearSelect() {
        const sel = document.getElementById('yearSelect');
        sel.innerHTML = '';
        for (let y = CURRENT_YEAR; y <= MAX_YEAR; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === viewYear) opt.selected = true;
            sel.appendChild(opt);
        }
    }

    // ===== NAVIGATION =====
    window.changeMonth = function(delta) {
        viewMonth += delta;
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        if (viewYear < CURRENT_YEAR) { viewYear = CURRENT_YEAR; viewMonth = 0; }
        if (viewYear > MAX_YEAR) { viewYear = MAX_YEAR; viewMonth = 11; }
        document.getElementById('yearSelect').value = viewYear;
        renderCalendar();
        updateStats();
    };

    window.goToToday = function() {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
        document.getElementById('yearSelect').value = viewYear;
        renderCalendar();
        updateStats();
    };

    window.jumpToYear = function(year) {
        viewYear = parseInt(year);
        renderCalendar();
        updateStats();
    };

    // ===== HELPERS =====
    function formatDateKey(m, d, y) {
        return (m + 1) + '/' + d + '/' + y;
    }

    function parseDateKey(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return { month: parseInt(parts[0]) - 1, day: parseInt(parts[1]), year: parseInt(parts[2]) };
        }
        return null;
    }

    function findShipmentById(id) {
        return shipments.find(function(s) { return String(s.id) === String(id); });
    }

    function getShipmentsForDate(m, d, y) {
        return shipments.filter(function(s) {
            const p = parseDateKey(s.date);
            if (!p) return false;
            return p.month === m && p.day === d && p.year === y;
        });
    }

    function getMonthShipmentCount(m, y) {
        return shipments.filter(function(s) {
            const p = parseDateKey(s.date);
            return p && p.month === m && p.year === y;
        }).length;
    }

    function updateStats() {
        document.getElementById('monthCount').textContent = getMonthShipmentCount(viewMonth, viewYear);
        document.getElementById('totalCount').textContent = shipments.length;
    }

    // ===== RENDER CALENDAR =====
    function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';
        document.getElementById('monthYearDisplay').textContent = MONTHS[viewMonth] + ' ' + viewYear;

        const now = new Date();
        const todayStr = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();

        const firstDay = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

        // Previous month days
        for (let i = firstDay - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            const cell = createDayCell(d, true, false);
            grid.appendChild(cell);
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(viewYear, viewMonth, d);
            const isToday = (viewYear + '-' + viewMonth + '-' + d) === todayStr;
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const dayShipments = getShipmentsForDate(viewMonth, d, viewYear);
            const cell = createDayCell(d, false, isToday, isWeekend, dayShipments);
            grid.appendChild(cell);
        }

        // Next month days
        const totalCells = grid.children.length;
        const remaining = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
        for (let d = 1; d <= remaining; d++) {
            const cell = createDayCell(d, true, false);
            grid.appendChild(cell);
        }
    }

    function createDayCell(day, isOtherMonth, isToday, isWeekend, dayShipments) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        if (isOtherMonth) cell.classList.add('other-month');
        if (isToday) cell.classList.add('today');
        if (isWeekend && !isOtherMonth) cell.classList.add('weekend');
        if (dayShipments && dayShipments.length > 0) cell.classList.add('has-shipment');

        // Drop target data
        if (!isOtherMonth) {
            cell.setAttribute('data-day', day);
            cell.setAttribute('data-month', viewMonth);
            cell.setAttribute('data-year', viewYear);
        }

        const numDiv = document.createElement('div');
        numDiv.className = 'day-number';
        numDiv.textContent = day;
        cell.appendChild(numDiv);

        // Shipment badges (draggable)
        if (dayShipments && dayShipments.length > 0) {
            const maxShow = 2;
            dayShipments.slice(0, maxShow).forEach(function(s) {
                const badge = document.createElement('div');
                badge.className = 'shipment-badge';
                badge.setAttribute('draggable', 'true');
                badge.setAttribute('data-shipment-id', s.id);
                let badgeText = '<span class="badge-icon">&#128666;</span> PO: ' + escapeHtml(s.poNumber || 'N/A');
                if (s.purchaserName) badgeText += ' | ' + escapeHtml(s.purchaserName);
                if (s.skids) badgeText += ' | ' + s.skids + ' skids';
                badge.innerHTML = badgeText;

                // Drag events
                badge.addEventListener('dragstart', function(e) {
                    draggedShipmentId = s.id;
                    badge.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', s.id);
                });
                badge.addEventListener('dragend', function() {
                    badge.classList.remove('dragging');
                    draggedShipmentId = null;
                    clearAllDragOver();
                });

                badge.onclick = function(e) { e.stopPropagation(); showShipmentDetail(s); };
                cell.appendChild(badge);
            });
            if (dayShipments.length > maxShow) {
                const more = document.createElement('div');
                more.className = 'badge-more';
                more.textContent = '+' + (dayShipments.length - maxShow) + ' more';
                more.onclick = function(e) { e.stopPropagation(); showDayShipments(day); };
                cell.appendChild(more);
            }
        }

        // Drop zone events (only for current-month cells)
        if (!isOtherMonth) {
            cell.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                cell.classList.add('drag-over');
            });
            cell.addEventListener('dragleave', function() {
                cell.classList.remove('drag-over');
            });
            cell.addEventListener('drop', function(e) {
                e.preventDefault();
                cell.classList.remove('drag-over');
                const shipId = e.dataTransfer.getData('text/plain');
                if (shipId) {
                    handleDrop(shipId, parseInt(cell.getAttribute('data-month')), parseInt(cell.getAttribute('data-day')), parseInt(cell.getAttribute('data-year')));
                }
            });

            // Add button
            const addBtn = document.createElement('button');
            addBtn.className = 'add-btn-cell';
            addBtn.innerHTML = '+';
            addBtn.title = 'Add shipment';
            addBtn.onclick = function(e) { e.stopPropagation(); openAddModal(day); };
            cell.appendChild(addBtn);

            cell.onclick = function() { openAddModal(day); };
        }

        return cell;
    }

    function clearAllDragOver() {
        document.querySelectorAll('.day-cell.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== DRAG & DROP HANDLER =====
    function handleDrop(shipmentId, targetMonth, targetDay, targetYear) {
        const s = findShipmentById(shipmentId);
        if (!s) return;

        const newDate = (targetMonth + 1) + '/' + targetDay + '/' + targetYear;
        if (newDate === s.date) return; // dropped on same date

        showToast('Moving shipment PO: ' + s.poNumber + '...');

        postJSON(
            { action: 'update', id: s.id, date: newDate },
            function(resp) {
                s.date = newDate;
                renderCalendar();
                updateStats();
                showToast('Shipment moved to ' + MONTHS[targetMonth] + ' ' + targetDay + ', ' + targetYear);
            },
            function(err) {
                showToast('Failed to move: ' + err, true);
            }
        );
    }

    // ===== ADD / EDIT MODAL =====
    window.openAddModal = function(day) {
        selectedDate = new Date(viewYear, viewMonth, day);
        const dateStr = MONTHS[viewMonth] + ' ' + day + ', ' + viewYear;
        document.getElementById('addModalTitle').innerHTML = '&#128666; New Inbound Shipment';
        document.getElementById('addModalDate').textContent = dateStr;
        document.getElementById('formEditId').value = '';
        document.getElementById('formPO').value = '';
        document.getElementById('formPurchaser').value = '';
        document.getElementById('formSkids').value = '';
        document.getElementById('formBoxes').value = '';
        document.getElementById('formDesc').value = '';
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('submitBtn').innerHTML = 'Create Shipment';
        document.getElementById('addModal').classList.add('active');
        setTimeout(function() { document.getElementById('formPO').focus(); }, 200);
    };

    function openEditModal(s) {
        const dateInfo = parseDateKey(s.date);
        if (!dateInfo) return;
        selectedDate = new Date(dateInfo.year, dateInfo.month, dateInfo.day);
        const dateStr = MONTHS[dateInfo.month] + ' ' + dateInfo.day + ', ' + dateInfo.year;
        document.getElementById('addModalTitle').innerHTML = '&#9998; Edit Shipment #' + s.id;
        document.getElementById('addModalDate').textContent = dateStr;
        document.getElementById('formEditId').value = s.id;
        document.getElementById('formPO').value = s.poNumber || '';
        document.getElementById('formPurchaser').value = s.purchaserId || '';
        document.getElementById('formSkids').value = s.skids || '';
        document.getElementById('formBoxes').value = s.boxes || '';
        document.getElementById('formDesc').value = s.description || '';
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('submitBtn').innerHTML = 'Save Changes';
        document.getElementById('addModal').classList.add('active');
        setTimeout(function() { document.getElementById('formPO').focus(); }, 200);
    }

    window.closeAddModal = function() {
        document.getElementById('addModal').classList.remove('active');
        selectedDate = null;
    };

    // ===== VIEW MODAL =====
    function showShipmentDetail(s) {
        currentViewShipment = s;
        const dateInfo = parseDateKey(s.date);
        if (dateInfo) {
            document.getElementById('viewModalDate').textContent = MONTHS[dateInfo.month] + ' ' + dateInfo.day + ', ' + dateInfo.year;
        }
        let html = '<div class="detail-row"><div class="detail-label">PO Number</div><div class="detail-value">' + escapeHtml(s.poNumber || 'N/A') + '</div></div>';
        html += '<div class="detail-row"><div class="detail-label">Purchaser</div><div class="detail-value">' + escapeHtml(s.purchaserName || '\\u2014') + '</div></div>';
        html += '<div class="detail-row"><div class="detail-label">Expected Date</div><div class="detail-value">' + escapeHtml(s.date || 'N/A') + '</div></div>';
        html += '<div class="detail-row"><div class="detail-label">Skids</div><div class="detail-value">' + escapeHtml(s.skids || '\\u2014') + '</div></div>';
        html += '<div class="detail-row"><div class="detail-label">Boxes</div><div class="detail-value">' + escapeHtml(s.boxes || '\\u2014') + '</div></div>';
        html += '<div class="detail-row"><div class="detail-label">Description</div><div class="detail-value">' + escapeHtml(s.description || '\\u2014') + '</div></div>';
        html += '<div class="detail-row"><div class="detail-label">Record ID</div><div class="detail-value">#' + escapeHtml(String(s.id || '')) + '</div></div>';
        document.getElementById('viewModalBody').innerHTML = html;
        document.getElementById('viewEditBtn').disabled = false;
        document.getElementById('viewDeleteBtn').disabled = false;
        document.getElementById('viewModal').classList.add('active');
    }

    function showDayShipments(day) {
        const dayShips = getShipmentsForDate(viewMonth, day, viewYear);
        if (dayShips.length === 1) { showShipmentDetail(dayShips[0]); return; }
        currentViewShipment = null;
        document.getElementById('viewModalDate').textContent = MONTHS[viewMonth] + ' ' + day + ', ' + viewYear + ' \\u2014 ' + dayShips.length + ' Shipments';
        let html = '';
        dayShips.forEach(function(s, i) {
            html += '<div style="margin-bottom:16px; padding:14px; background:#0f172a; border-radius:10px; border-left:4px solid #3b82f6; cursor:pointer;" data-list-idx="' + i + '" data-list-day="' + day + '">';
            html += '<div style="font-weight:700; font-size:17px; color:#f8fafc; margin-bottom:4px;">PO: ' + escapeHtml(s.poNumber || 'N/A') + '</div>';
            html += '<div style="font-size:14px; color:#94a3b8;">' + escapeHtml(s.description || 'No description') + '</div>';
            html += '</div>';
        });
        document.getElementById('viewModalBody').innerHTML = html;
        // Attach click handlers via delegation
        document.querySelectorAll('[data-list-idx]').forEach(function(el) {
            el.addEventListener('click', function() {
                var idx = parseInt(el.getAttribute('data-list-idx'));
                var d = parseInt(el.getAttribute('data-list-day'));
                var dShips = getShipmentsForDate(viewMonth, d, viewYear);
                if (dShips[idx]) showShipmentDetail(dShips[idx]);
            });
        });
        document.getElementById('viewEditBtn').disabled = true;
        document.getElementById('viewDeleteBtn').disabled = true;
        document.getElementById('viewModal').classList.add('active');
    }

    window.closeViewModal = function() {
        document.getElementById('viewModal').classList.remove('active');
        currentViewShipment = null;
    };

    // ===== EDIT FROM VIEW MODAL =====
    window.editCurrentShipment = function() {
        if (!currentViewShipment) return;
        var s = currentViewShipment;
        closeViewModal();
        openEditModal(s);
    };

    // ===== DELETE FROM VIEW MODAL =====
    window.confirmDeleteShipment = function() {
        if (!currentViewShipment) return;
        document.getElementById('confirmMsg').textContent = 'Delete shipment PO: ' + (currentViewShipment.poNumber || 'N/A') + ' (ID #' + currentViewShipment.id + ')? This will inactivate the record.';
        document.getElementById('confirmDeleteBtn').disabled = false;
        document.getElementById('confirmDeleteBtn').innerHTML = 'Delete';
        document.getElementById('confirmDialog').classList.add('active');
    };

    window.executeDeleteShipment = function() {
        if (!currentViewShipment) return;
        var s = currentViewShipment;
        var btn = document.getElementById('confirmDeleteBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Deleting...';

        postJSON(
            { action: 'delete', id: s.id },
            function() {
                shipments = shipments.filter(function(sh) { return String(sh.id) !== String(s.id); });
                closeConfirmDialog();
                closeViewModal();
                renderCalendar();
                updateStats();
                showToast('Shipment #' + s.id + ' deleted.');
            },
            function(err) {
                showToast('Delete failed: ' + err, true);
                btn.disabled = false;
                btn.innerHTML = 'Delete';
            }
        );
    };

    window.closeConfirmDialog = function() {
        document.getElementById('confirmDialog').classList.remove('active');
    };

    // ===== SUBMIT SHIPMENT (CREATE OR UPDATE) =====
    window.submitShipment = function() {
        const poNumber = document.getElementById('formPO').value.trim();
        if (!poNumber) {
            showToast('PO Number is required!', true);
            document.getElementById('formPO').focus();
            return;
        }
        if (!selectedDate) return;

        const editId = document.getElementById('formEditId').value;
        const isEdit = !!editId;

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> ' + (isEdit ? 'Saving...' : 'Creating...');

        const m = selectedDate.getMonth() + 1;
        const d = selectedDate.getDate();
        const y = selectedDate.getFullYear();
        const dateStr = m + '/' + d + '/' + y;

        const purchaserSel = document.getElementById('formPurchaser');
        const purchaserId = purchaserSel.value;
        const purchaserName = purchaserSel.options[purchaserSel.selectedIndex] ? purchaserSel.options[purchaserSel.selectedIndex].text : '';

        if (isEdit) {
            // UPDATE existing
            const payload = {
                action: 'update',
                id: editId,
                poNumber: poNumber,
                date: dateStr,
                skids: document.getElementById('formSkids').value.trim(),
                boxes: document.getElementById('formBoxes').value.trim(),
                description: document.getElementById('formDesc').value.trim(),
                purchaserId: purchaserId
            };

            postJSON(payload,
                function() {
                    var s = findShipmentById(editId);
                    if (s) {
                        s.poNumber = payload.poNumber;
                        s.date = payload.date;
                        s.skids = payload.skids;
                        s.boxes = payload.boxes;
                        s.description = payload.description;
                        s.purchaserId = purchaserId;
                        s.purchaserName = purchaserId ? purchaserName : '';
                    }
                    closeAddModal();
                    renderCalendar();
                    updateStats();
                    showToast('Shipment #' + editId + ' updated successfully!');
                },
                function(err) {
                    showToast('Error: ' + err, true);
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Save Changes';
                }
            );
        } else {
            // CREATE new
            const payload = {
                action: 'create',
                poNumber: poNumber,
                date: dateStr,
                skids: document.getElementById('formSkids').value.trim(),
                boxes: document.getElementById('formBoxes').value.trim(),
                description: document.getElementById('formDesc').value.trim(),
                purchaserId: purchaserId
            };

            postJSON(payload,
                function(resp) {
                    shipments.push({
                        id: resp.recordId,
                        poNumber: payload.poNumber,
                        date: payload.date,
                        skids: payload.skids,
                        boxes: payload.boxes,
                        description: payload.description,
                        purchaserId: purchaserId,
                        purchaserName: purchaserId ? purchaserName : ''
                    });
                    closeAddModal();
                    renderCalendar();
                    updateStats();
                    showToast('Shipment created successfully! (ID: ' + resp.recordId + ')');
                },
                function(err) {
                    showToast('Error: ' + err, true);
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Create Shipment';
                }
            );
        }
    };

    // ===== TOAST =====
    function showToast(msg, isError) {
        const toast = document.getElementById('toast');
        toast.className = 'toast' + (isError ? ' error' : '');
        toast.innerHTML = (isError ? '&#9888;' : '&#9989;') + ' ' + escapeHtml(msg);
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 4000);
    }

    // ===== KEYBOARD =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.getElementById('confirmDialog').classList.contains('active')) {
                closeConfirmDialog();
            } else {
                closeAddModal();
                closeViewModal();
            }
        }
    });

    // Close modals on overlay click
    document.getElementById('addModal').addEventListener('click', function(e) {
        if (e.target === this) closeAddModal();
    });
    document.getElementById('viewModal').addEventListener('click', function(e) {
        if (e.target === this) closeViewModal();
    });
    document.getElementById('confirmDialog').addEventListener('click', function(e) {
        if (e.target === this) closeConfirmDialog();
    });

    init();
})();
</script>
</body>
</html>`;
        }

        /**
         * Main Suitelet entry point.
         */
        const onRequest = (context) => {
            if (context.request.method === 'GET') {
                // Load all shipments and employees, then serve the calendar HTML page
                const shipments = loadShipments();
                const employees = loadEmployees();

                const suiteletUrl = url.resolveScript({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    returnExternalUrl: false
                });

                const currentYear = new Date().getFullYear();
                const maxYear = currentYear + 10;

                const html = buildCalendarHTML(shipments, suiteletUrl, employees);
                context.response.write(html);

            } else if (context.request.method === 'POST') {
                // Handle shipment creation via AJAX
                let response = { success: false };
                try {
                    const body = JSON.parse(context.request.body);
                    if (body.action === 'create') {
                        const recordId = createShipment({
                            poNumber: body.poNumber || '',
                            date: body.date || '',
                            skids: body.skids || '',
                            boxes: body.boxes || '',
                            description: body.description || '',
                            purchaserId: body.purchaserId || ''
                        });
                        response = { success: true, recordId: recordId };
                    } else if (body.action === 'update') {
                        updateShipment({
                            id: body.id,
                            poNumber: body.poNumber,
                            date: body.date || '',
                            skids: body.skids,
                            boxes: body.boxes,
                            description: body.description,
                            purchaserId: body.purchaserId
                        });
                        response = { success: true, recordId: body.id };
                    } else if (body.action === 'delete') {
                        deleteShipment(body.id);
                        response = { success: true, recordId: body.id };
                    }
                } catch (e) {
                    log.error({ title: 'POST Error', details: e.message });
                    response = { success: false, error: e.message };
                }
                context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                context.response.write(JSON.stringify(response));
            }
        };

        return { onRequest };
    }
);
