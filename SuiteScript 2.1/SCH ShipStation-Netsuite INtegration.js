/**
 * SS_ShipStation_TrackingSync.js
 *
 * Scheduled Script — ShipStation Tracking & Cost Sync (API v2)
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
    const LOOKBACK_HOURS = 1;

    const FIELDS = {
        celigoOrderId:  'custbody_celigo_etail_order_id',
        shippingCost:   'custbody_pacejet_freight_costcurrency',
        synced:         'custbody_shipstation_synced'
    };

    const execute = (context) => {
        const { map: ssMap, externalIds } = buildShipStationMap();

        if (Object.keys(ssMap).length === 0) return;

        const orders = getOrders();
        const allUpdatedFulfillments = [];

        for (const order of orders) {
            if (runtime.getCurrentScript().getRemainingUsage() < 100) break;
            try {
                const updatedFFs = syncOrder(order, ssMap);
                allUpdatedFulfillments.push(...updatedFFs);
            } catch (e) {}
        }

        log.audit('ShipStation Sync', 'External Shipment IDs: ' + externalIds.join(', ') + ' | Updated Fulfillments: ' + allUpdatedFulfillments.join(', '));
    };

    const buildShipStationMap = () => {
        const map = {};
        const externalIds = [];
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - LOOKBACK_HOURS);
        const modifiedAtStart = cutoff.toISOString();

        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            if (runtime.getCurrentScript().getRemainingUsage() < 200) break;

            const url = SHIPSTATION_BASE + '/v2/shipments?modified_at_start=' + encodeURIComponent(modifiedAtStart) + '&shipment_status=label_purchased&page_size=100&page=' + page + '&sort_by=modified_at&sort_dir=desc';

            let response;
            try {
                response = https.get({
                    url: url,
                    headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' }
                });
            } catch (e) {
                break;
            }

            if (response.code !== 200) break;

            let parsed;
            try {
                parsed = JSON.parse(response.body);
            } catch (e) {
                break;
            }

            totalPages = parsed.pages || 1;
            const shipments = parsed.shipments || [];

            for (const s of shipments) {
                const extId = (s.external_shipment_id || '').trim();
                if (extId) {
                    externalIds.push(extId);
                    map[extId.toLowerCase()] = s;
                }
                const shipNum = (s.shipment_number || '').trim();
                if (shipNum) map[shipNum.toLowerCase()] = s;
            }

            page++;
        }

        return { map, externalIds };
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
            return null;
        }

        if (response.code !== 200) return null;

        let parsed;
        try {
            parsed = JSON.parse(response.body);
        } catch (e) {
            return null;
        }

        const labels = (parsed.labels || []).filter(function(l) { return l.voided !== true; });
        if (labels.length === 0) return null;

        const label = labels[0];
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

        let shipment  = null;

        if (celigoOrderId) shipment = ssMap[celigoOrderId.toLowerCase()];
        if (!shipment) shipment = ssMap[String(id)];
        if (!shipment && tranid) shipment = ssMap[tranid.toLowerCase()];

        if (!shipment) return [];

        const labelData      = fetchLabel(shipment.shipment_id);
        const trackingNumber = labelData ? labelData.trackingNumber : '';
        const shippingCost   = labelData ? labelData.shippingCost   : 0;

        if (!trackingNumber || shippingCost === '' || shippingCost === null || shippingCost === undefined) return [];

        record.submitFields({
            type: record.Type.SALES_ORDER,
            id: id,
            values: {
                [FIELDS.shippingCost]: shippingCost,
                [FIELDS.synced]: true,
                'custbody_ship_station_tracking_number': trackingNumber
            },
            options: { ignoreMandatoryFields: true }
        });

        const fulfillments = getFulfillments(id);
        const updatedIFs = [];

        for (const ff of fulfillments) {
            try {
                const ifRec = record.load({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ff.id,
                    isDynamic: false
                });

                ifRec.setValue({ fieldId: 'shipstatus', value: 'C' });
                ifRec.setValue({ fieldId: 'custbody_pacejet_freight_costcurrency', value: shippingCost });
                ifRec.setValue({ fieldId: 'custbody_ship_station_tracking_number', value: trackingNumber });
                ifRec.setValue({ fieldId: 'custbody_pacejet_master_tracking_num', value: trackingNumber });

                var etailChannel = ifRec.getValue({ fieldId: 'custbody_celigo_etail_channel' });
                if (String(etailChannel) === '308' && shippingCost > 0) {
                    var markedUpCost = Math.round(shippingCost * 1.2 * 100) / 100;
                    ifRec.setValue({ fieldId: 'shippingcost', value: markedUpCost });
                }

                ifRec.save({ ignoreMandatoryFields: true });
                updatedIFs.push(ff.tranid);
            } catch (e) {}
        }

        return updatedIFs;
    };

    return { execute };
});
