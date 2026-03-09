/**
 * SS_ShipStation_TrackingSync.js
 *
 * Scheduled Script — ShipStation Tracking & Cost Sync (API v2)
 * Currently in TEST MODE: runs against a single hardcoded internal ID
 *
 * Match strategy (external_shipment_id against):
 *   1. custbody_celigo_etail_order_id  (marketplace orders)
 *   2. NetSuite internal record ID     (custom store orders)
 *   3. tranid                          (fallback)
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/record', 'N/https', 'N/runtime', 'N/log'],
(search, record, https, runtime, log) => {

    const SHIPSTATION_BASE = 'https://api.shipstation.com';
    const API_KEY          = '';
    const LOOKBACK_HOURS = 4;

    const FIELDS = {
        celigoOrderId:  'custbody_celigo_etail_order_id',
        trackingNumber: 'custbody_pacejet_if_carrier_tracking',
        shippingCost:   'custbody_pacejet_freight_costcurrency',
        synced:         'custbody_shipstation_synced'
    };

    const execute = (context) => {
        log.audit('Step 1', 'Fetching shipments from ShipStation v2...');
        const ssMap = buildShipStationMap();
        log.audit('ShipStation Map Built', 'Total shipments with external_shipment_id: ' + Object.keys(ssMap).length);

        if (Object.keys(ssMap).length === 0) {
            log.audit('Abort', 'No ShipStation shipments returned. Exiting.');
            return;
        }

        log.audit('Step 2', 'Fetching NetSuite orders...');
        const orders = getOrders();
        log.audit('Orders Found', orders.length + ' orders to process');

        let successCount = 0;
        let failCount    = 0;

        for (const order of orders) {
            if (runtime.getCurrentScript().getRemainingUsage() < 100) {
                log.audit('Governance Limit', 'Stopping early.');
                break;
            }
            try {
                if (syncOrder(order, ssMap)) successCount++;
                else failCount++;
            } catch (e) {
                failCount++;
                log.error('Error on SO ' + order.id, e.message || JSON.stringify(e));
            }
        }

        log.audit('Sync Complete', 'Success: ' + successCount + ' | Failed/Skipped: ' + failCount);
    };

    const buildShipStationMap = () => {
        const map = {};
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - LOOKBACK_HOURS);
        const createdAtStart = cutoff.toISOString();

        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            if (runtime.getCurrentScript().getRemainingUsage() < 200) {
                log.audit('Governance Limit', 'Stopping ShipStation fetch early.');
                break;
            }

            const url = SHIPSTATION_BASE + '/v2/shipments?created_at_start=' + encodeURIComponent(createdAtStart) + '&shipment_status=label_purchased&page_size=100&page=' + page + '&sort_by=created_at&sort_dir=desc';

            let response;
            try {
                response = https.get({
                    url: url,
                    headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' }
                });
            } catch (e) {
                log.error('ShipStation HTTP Error', e.message);
                break;
            }

            if (response.code !== 200) {
                log.error('ShipStation Non-200', 'HTTP ' + response.code + ' | ' + response.body);
                break;
            }

            let parsed;
            try {
                parsed = JSON.parse(response.body);
            } catch (e) {
                log.error('ShipStation Parse Error', response.body);
                break;
            }

            totalPages = parsed.pages || 1;
            const shipments = parsed.shipments || [];
            log.audit('SS Page ' + page + '/' + totalPages, shipments.length + ' shipments received');

            for (const s of shipments) {
                log.audit('SS Shipment', 'shipment_id=' + s.shipment_id +
                    ' | status=' + (s.shipment_status || '') +
                    ' | external_id=' + (s.external_shipment_id || '') +
                    ' | tracking=' + (s.tracking_number || '') +
                    ' | carrier=' + (s.carrier_id || '') +
                    ' | service=' + (s.service_code || '') +
                    ' | ship_date=' + (s.ship_date || '') +
                    ' | created=' + (s.created_at || ''));
                const extId = (s.external_shipment_id || '').trim();
                if (extId) {
                    map[extId.toLowerCase()] = s;
                }
            }

            page++;
        }

        return map;
    };

    const fetchLabel = (shipmentId) => {
        const url = SHIPSTATION_BASE + '/v2/labels?shipment_id=' + encodeURIComponent(shipmentId) + '&page_size=5&sort_by=created_at&sort_dir=desc';

        let response;
        try {
            response = https.get({
                url: url,
                headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' }
            });
        } catch (e) {
            log.error('Label HTTP Error', 'shipment_id=' + shipmentId + ' | ' + e.message);
            return null;
        }

        if (response.code !== 200) {
            log.error('Label Non-200', 'shipment_id=' + shipmentId + ' | HTTP ' + response.code);
            return null;
        }

        let parsed;
        try {
            parsed = JSON.parse(response.body);
        } catch (e) {
            log.error('Label Parse Error', response.body);
            return null;
        }

        const labels = (parsed.labels || []).filter(function(l) { return l.voided !== true; });
        if (labels.length === 0) return null;

        const label = labels[0];
        log.audit('Label Found', 'tracking="' + (label.tracking_number || 'NULL') + '" | cost="' + (label.shipment_cost ? JSON.stringify(label.shipment_cost) : 'NULL') + '"');

        return {
            trackingNumber: label.tracking_number || '',
            shippingCost:   label.shipment_cost && label.shipment_cost.amount ? label.shipment_cost.amount : 0
        };
    };

    const getOrders = () => {
        const filters = [
            ['status', 'anyof', ['SalesOrd:B', 'SalesOrd:D', 'SalesOrd:E']],
            'AND',
            [FIELDS.synced, 'is', 'F']
        ];

        const soSearch = search.create({
            type: search.Type.SALES_ORDER,
            filters: filters,
            columns: [
                search.createColumn({ name: 'tranid' }),
                search.createColumn({ name: FIELDS.celigoOrderId })
            ]
        });

        const seen = {};
        const results = [];
        soSearch.run().each(function(result) {
            if (!seen[result.id]) {
                seen[result.id] = true;
                results.push({
                    id:            result.id,
                    tranid:        result.getValue({ name: 'tranid' }),
                    celigoOrderId: result.getValue({ name: FIELDS.celigoOrderId })
                });
            }
            return true;
        });

        return results;
    };

    const getFulfillments = (soId) => {
        const ifSearch = search.create({
            type: search.Type.ITEM_FULFILLMENT,
            filters: [
                ['createdfrom', 'anyof', soId]
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'tranid' }),
                search.createColumn({ name: 'status' })
            ]
        });

        const seen = {};
        const results = [];
        ifSearch.run().each(function(result) {
            if (!seen[result.id]) {
                seen[result.id] = true;
                results.push({
                    id:     result.id,
                    tranid: result.getValue({ name: 'tranid' }),
                    status: result.getValue({ name: 'status' })
                });
            }
            return true;
        });

        return results;
    };

    const syncOrder = (order, ssMap) => {
        const id            = order.id;
        const tranid        = order.tranid;
        const celigoOrderId = order.celigoOrderId;

        log.audit('Processing SO ' + id, 'tranid="' + tranid + '" | celigoOrderId="' + (celigoOrderId || 'none') + '" | internalId="' + id + '"');

        let shipment  = null;
        let matchedBy = null;

        // Attempt 1: external_shipment_id vs celigoOrderId (marketplace orders)
        if (celigoOrderId) {
            shipment = ssMap[celigoOrderId.toLowerCase()];
            if (shipment) matchedBy = 'celigoOrderId="' + celigoOrderId + '"';
        }

        // Attempt 2: external_shipment_id vs NetSuite internal ID (custom store orders)
        if (!shipment) {
            shipment = ssMap[String(id)];
            if (shipment) matchedBy = 'internalId="' + id + '"';
        }

        // Attempt 3: external_shipment_id vs tranid (fallback)
        if (!shipment && tranid) {
            shipment = ssMap[tranid.toLowerCase()];
            if (shipment) matchedBy = 'tranid="' + tranid + '"';
        }

        if (!shipment) {
            log.audit('No Match — SO ' + id,
                'Tried celigoOrderId="' + (celigoOrderId || 'none') + '"' +
                ' | internalId="' + id + '"' +
                ' | tranid="' + tranid + '"' +
                ' against ' + Object.keys(ssMap).length + ' SS external_shipment_ids'
            );
            return false;
        }

        log.audit('Shipment Matched — SO ' + id, 'Matched by ' + matchedBy + ' | SS shipment_id="' + shipment.shipment_id + '"');

        const labelData      = fetchLabel(shipment.shipment_id);
        const trackingNumber = labelData ? labelData.trackingNumber : '';
        const shippingCost   = labelData ? labelData.shippingCost   : 0;

        if (!trackingNumber || !shippingCost) {
            log.audit('Skipping SO ' + id, 'Missing tracking or cost — tracking="' + trackingNumber + '" | cost=' + shippingCost);
            return false;
        }

        // Update fulfillments — set status to Shipped (C), tracking, and cost
        const fulfillments = getFulfillments(id);
        log.audit('Fulfillments Found — SO ' + id, fulfillments.length + ' fulfillment(s)');

        for (const ff of fulfillments) {
            log.audit('Updating IF ' + ff.id, 'tranid="' + ff.tranid + '" | current status="' + ff.status + '"');
            try {
                const ifRec = record.load({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ff.id,
                    isDynamic: false
                });

                ifRec.setValue({ fieldId: 'shipstatus', value: 'C' }); // Shipped
                ifRec.setValue({ fieldId: 'custbody_pacejet_master_tracking_num', value: trackingNumber });
                ifRec.setValue({ fieldId: 'custbody_pacejet_freight_costcurrency', value: shippingCost });
                ifRec.setValue({ fieldId: 'custbody_ship_station_tracking_number', value: trackingNumber });

                const savedId = ifRec.save({ ignoreMandatoryFields: true });
                log.audit('IF Updated ' + savedId, 'Status=Shipped | Tracking=' + trackingNumber + ' | Cost=$' + shippingCost);
            } catch (e) {
                log.error('IF Update Error ' + ff.id, e.message || JSON.stringify(e));
            }
        }

        // Update sales order fields
        const soRec = record.load({
            type: record.Type.SALES_ORDER,
            id: id,
            isDynamic: false
        });

        soRec.setValue({ fieldId: FIELDS.trackingNumber, value: trackingNumber });
        soRec.setValue({ fieldId: FIELDS.shippingCost, value: shippingCost });
        soRec.setValue({ fieldId: FIELDS.synced, value: true });
        soRec.setValue({ fieldId: 'custbody_ship_station_tracking_number', value: trackingNumber });

        soRec.save({ ignoreMandatoryFields: true });

        log.audit('Synced SO ' + id, 'Tracking: ' + trackingNumber + ' | Cost: $' + shippingCost + ' | Fulfillments updated: ' + fulfillments.length);
        return true;
    };

    return { execute };
});
