/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Veeqo Shipping Suitelet - ALLOCATION FLOW, LABEL CREATION ONLY
 * ------------------------------------------------------------------
 * Lets you split an Amazon order into boxes, assign which items (and how
 * many units) go in each box, and buy a shipping label per box. Built on
 * Veeqo's Allocation API so per-box item quantities are recorded and flow
 * to Amazon (one allocation = one box = one package = one label).
 *
 * No NetSuite writeback in this version. The NS Sales Order # is captured
 * and displayed only.
 *
 * Stages (hidden field "stage"):
 *   initial    -> enter NS SO # + Amazon Order ID -> Lookup
 *   looked_up  -> per box: dimensions/weight + units-per-SKU -> Get Rates
 *   quoted     -> pick one service (priced across all boxes) -> Ship
 *   shipped    -> per-box tracking + label links
 *
 * FLOW ON "Get Rates" (handleQuote):
 *   1. Delete the order's existing allocations (clears Veeqo's default
 *      "everything in one package" allocation).
 *   2. For each box: POST /orders/{id}/allocations with that box's
 *      line_items_attributes [{sellable_id, quantity}].
 *   3. PUT /allocations/{id}/allocation_package with the box dimensions.
 *   4. GET /shipping/rates/{id}?from_allocation_package=true for each box.
 *   5. Offer only services available for EVERY box, cost summed.
 *
 * FLOW ON "Ship" (handleShip):
 *   For each box's allocation: POST /shipping/shipments to buy the label.
 *   liability_amount=0.0 (no insurance); cheapest confirmation auto-picked.
 *
 * ------------------------------------------------------------------
 * DEPLOYMENT - Script Parameters:
 *   custscript_tq_veeqo_api_key       (Password)        Veeqo API key
 *   custscript_tq_veeqo_warehouse_id  (Free-Form Text)  Veeqo warehouse id (numeric)
 *
 * Units entered: inches and pounds (weight converted to oz for Veeqo).
 * ------------------------------------------------------------------
 */
define([
    'N/https',
    'N/runtime',
    'N/log'
], function (https, runtime, log) {

    var VEEQO_API_BASE = 'https://api.veeqo.com';

    var MODE = {
        INITIAL:   'initial',
        LOOKED_UP: 'looked_up',
        QUOTED:    'quoted',
        SHIPPED:   'shipped'
    };

    var NEXT_ACTION = {
        initial:   'lookup',
        looked_up: 'quote',
        quoted:    'ship'
    };

    // ==================================================================
    // ENTRY POINT
    // ==================================================================
    function onRequest(ctx) {
        var req = ctx.request;
        var res = ctx.response;
        res.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });

        try {
            if (req.method === 'GET') {
                res.write({ output: renderPage({ stage: MODE.INITIAL, state: emptyState() }) });
                return;
            }

            var state = readState(req);
            var action = NEXT_ACTION[state.stage] || '';
            log.audit('POST', 'stage=' + state.stage + ' next=' + action +
                ' so=' + state.nsSoNumber + ' amzn=' + state.amazonOrderId);

            var view;
            if      (action === 'lookup') view = handleLookup(state);
            else if (action === 'quote')  view = handleQuote(state, req);
            else if (action === 'ship')   view = handleShip(state, req);
            else                          view = { stage: MODE.INITIAL, state: emptyState() };

            res.write({ output: renderPage(view) });
        } catch (e) {
            log.error('Suitelet error', e);
            res.write({ output: renderErrorPage(e, req) });
        }
    }

    // ==================================================================
    // STAGE HANDLERS
    // ==================================================================
    function handleLookup(state) {
        if (!state.nsSoNumber)    throw new Error('NetSuite Sales Order # is required.');
        if (!state.amazonOrderId) throw new Error('Amazon Order ID is required.');

        var match = veeqoFindOrder(state.amazonOrderId);
        if (!match) throw new Error('No order found in Veeqo for Amazon ID "' + state.amazonOrderId + '".');

        var order = veeqoGetOrder(match.id);
        state.veeqoOrderId = String(order.id);

        return { stage: MODE.LOOKED_UP, state: state, order: order, items: orderItems(order) };
    }

    function handleQuote(state, req) {
        if (!state.veeqoOrderId) throw new Error('Missing Veeqo order id - re-run Lookup.');

        var order = veeqoGetOrder(state.veeqoOrderId);
        var items = orderItems(order);
        var boxes = readBoxAssignments(req, items);
        if (!boxes.length) throw new Error('Add at least one box with dimensions and at least one unit assigned.');

        var warehouseId = parseInt(getWarehouseId(), 10);

        // 1. Clear existing allocations (incl. Veeqo's default single-package one).
        var existing = order.allocations || [];
        for (var e = 0; e < existing.length; e++) {
            try { veeqoDeleteAllocation(existing[e].id); }
            catch (delErr) { log.error('Delete allocation ' + existing[e].id + ' failed', delErr); }
        }

        // 2-4. Create one allocation per box, set its package, rate it.
        var known = {};
        var perBox = []; // { allocationId, dims, items:[{label,qty}], quotes:[...] }
        for (var b = 0; b < boxes.length; b++) {
            var box = boxes[b];
            var lineAttrs = box.assignments.map(function (a) {
                return { sellable_id: a.sellableId, quantity: a.quantity };
            });

            var allocId = createAllocationGetId(state.veeqoOrderId, warehouseId, lineAttrs, known);

            veeqoUpdateAllocationPackage(allocId, {
                weight: round2(box.weight * 16), weight_unit: 'oz',
                width: box.width, height: box.height, depth: box.length,
                dimensions_unit: 'inches',
                package_provider: 'CUSTOM',
                package_selection_source: 'ONE_OFF',
                save_for_similar_shipments: false
            });

            var ratesResp = veeqoGetAllocationRates(allocId);
            var quotes = normalizeAllocRates(ratesResp);
            if (!quotes.length) {
                throw new Error('Veeqo returned no rates for box ' + (b + 1) +
                    ' (allocation ' + allocId + '). Check the box dimensions/weight.');
            }
            perBox.push({
                allocationId: allocId,
                dims: box.length + 'x' + box.width + 'x' + box.height + ' in, ' + box.weight + ' lb',
                items: box.assignments.map(function (a) { return { label: a.label, qty: a.quantity }; }),
                quotes: quotes
            });
        }

        var rates = combineRates(perBox);
        if (!rates.length) {
            throw new Error('No single service is available for all ' + boxes.length +
                ' boxes. Adjust box dimensions/weights, or ship boxes separately.');
        }
        rates.sort(function (a, b2) { return a.totalCost - b2.totalCost; });

        // Carry a lightweight per-box summary for display on the quote + success screens.
        state.allocSummary = JSON.stringify(perBox.map(function (pb) {
            return { allocationId: pb.allocationId, dims: pb.dims, items: pb.items };
        }));

        return { stage: MODE.QUOTED, state: state, order: order, rates: rates };
    }

    function handleShip(state, req) {
        var picked = req.parameters.selected_rate || '';
        if (!picked) throw new Error('Select a rate before clicking Ship.');

        var rate = JSON.parse(picked);
        var legs = rate.legs || [];
        if (!legs.length) throw new Error('Selected rate has no allocations - re-quote rates.');

        var summary = [];
        try { summary = state.allocSummary ? JSON.parse(state.allocSummary) : []; } catch (e) { summary = []; }

        var results = [];
        for (var i = 0; i < legs.length; i++) {
            var leg = legs[i];
            var boxItems = matchSummaryItems(summary, leg.allocationId);
            try {
                var resp = veeqoPurchaseLabel(leg);
                log.audit('Purchase label raw response (box ' + (i + 1) + ')', JSON.stringify(resp));
                var ex = extractPurchase(resp);
                results.push({
                    box: i + 1,
                    ok: true,
                    allocationId: leg.allocationId,
                    items: boxItems,
                    trackingUrl: ex.trackingUrl,
                    trackingNumber: ex.trackingNumber,
                    labelUrl: ex.labelUrl
                });
            } catch (bookErr) {
                log.error('Purchase label for box ' + (i + 1) + ' (allocation ' + leg.allocationId + ') failed', bookErr);
                results.push({ box: i + 1, ok: false, allocationId: leg.allocationId, items: boxItems, error: bookErr.message });
            }
        }

        return { stage: MODE.SHIPPED, state: state, rate: rate, results: results };
    }

    // ==================================================================
    // REQUEST PARSING
    // ==================================================================
    function emptyState() {
        return { stage: MODE.INITIAL, nsSoNumber: '', amazonOrderId: '', veeqoOrderId: '', allocSummary: '' };
    }

    function readState(req) {
        var p = req.parameters;
        return {
            stage:         (p.stage || MODE.INITIAL).trim(),
            nsSoNumber:    (p.ns_so_number || '').trim(),
            amazonOrderId: (p.amazon_order_id || '').trim(),
            veeqoOrderId:  (p.veeqo_order_id || '').trim(),
            allocSummary:  (p.alloc_summary || '').trim()
        };
    }

    // Normalize a Veeqo order's line items into {sellableId, sku, title, qty}.
    function orderItems(order) {
        var lis = (order && order.line_items) || [];
        var out = [];
        for (var i = 0; i < lis.length; i++) {
            var li = lis[i];
            var pv = li.sellable || li.product || {};
            var sid = (li.sellable && li.sellable.id) || li.sellable_id || pv.id;
            if (!sid) continue;
            out.push({
                sellableId: sid,
                sku:        pv.sku_code || pv.sku || '',
                title:      (pv.title || pv.product_title || pv.sellable_title || '').substring(0, 80),
                qty:        li.quantity || 0
            });
        }
        return out;
    }

    // Parse per-box dimensions and per-SKU unit counts from the form.
    // Field names: box_length_{b}, box_width_{b}, box_height_{b}, box_weight_{b},
    //              box_{b}_item_{li}_qty   (li = index into items array)
    function readBoxAssignments(req, items) {
        var p = req.parameters;
        var maxBox = parseInt(p.box_count || '0', 10); // monotonic upper bound
        var boxes = [];
        for (var b = 0; b < maxBox; b++) {
            var L  = num(p['box_length_' + b]);
            var W  = num(p['box_width_'  + b]);
            var H  = num(p['box_height_' + b]);
            var Wt = num(p['box_weight_' + b]);
            if (!(L > 0 && W > 0 && H > 0 && Wt > 0)) continue; // removed/blank box

            var assignments = [];
            for (var li = 0; li < items.length; li++) {
                var q = parseInt(p['box_' + b + '_item_' + li + '_qty'] || '0', 10);
                if (q > 0) {
                    assignments.push({
                        sellableId: items[li].sellableId,
                        quantity: q,
                        label: (items[li].sku || items[li].title || ('item ' + li))
                    });
                }
            }
            if (!assignments.length) {
                throw new Error('Box ' + (b + 1) + ' has dimensions but no units assigned. ' +
                    'Enter how many of each SKU go in it, or remove the box.');
            }
            boxes.push({ length: L, width: W, height: H, weight: Wt, assignments: assignments });
        }
        return boxes;
    }

    // ==================================================================
    // RATE COMBINE ACROSS BOXES (one service must be available for all)
    // ==================================================================
    function combineRates(perBox) {
        var map = {}; // serviceId -> combined
        for (var b = 0; b < perBox.length; b++) {
            var quotes = perBox[b].quotes;
            var allocId = perBox[b].allocationId;
            for (var q = 0; q < quotes.length; q++) {
                var r = quotes[q];
                var key = r.serviceId || (r.serviceCarrier + '|' + r.serviceType);
                if (!map[key]) {
                    map[key] = {
                        key: key,
                        carrier: r.serviceCarrier || r.carrier,
                        service: r.serviceId || r.serviceType,
                        currency: r.currency,
                        deliveryDate: r.deliveryDate,
                        protected: r.protected,
                        totalCost: 0,
                        legs: []
                    };
                }
                if (map[key].legs.length === b) { // first quote of this service for this box
                    map[key].totalCost += r.baseRate;
                    map[key].legs.push({
                        allocationId:   allocId,
                        remoteShipmentId: r.remoteShipmentId,
                        serviceType:    r.serviceType,   // the rate "name"
                        serviceCarrier: r.serviceCarrier,
                        subCarrierId:   r.subCarrierId,
                        carrierId:      r.carrierId,
                        carrier:        r.carrier,
                        baseRate:       r.baseRate,
                        confKey:        r.confKey,
                        confValue:      r.confValue
                    });
                    if (r.deliveryDate && (!map[key].deliveryDate || r.deliveryDate > map[key].deliveryDate)) {
                        map[key].deliveryDate = r.deliveryDate;
                    }
                }
            }
        }
        var out = [];
        for (var k in map) {
            if (map.hasOwnProperty(k) && map[k].legs.length === perBox.length) out.push(map[k]);
        }
        return out;
    }

    function matchSummaryItems(summary, allocationId) {
        for (var i = 0; i < summary.length; i++) {
            if (String(summary[i].allocationId) === String(allocationId)) return summary[i].items || [];
        }
        return [];
    }

    // ==================================================================
    // VEEQO API CALLS
    // ==================================================================
    function veeqoHeaders() {
        var key = runtime.getCurrentScript().getParameter({ name: 'custscript_tq_veeqo_api_key' });
        if (!key) throw new Error('Script parameter custscript_tq_veeqo_api_key is not set.');
        return { 'x-api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' };
    }

    function getWarehouseId() {
        var id = runtime.getCurrentScript().getParameter({ name: 'custscript_tq_veeqo_warehouse_id' });
        if (!id) throw new Error('Script parameter custscript_tq_veeqo_warehouse_id is not set.');
        return id;
    }

    function veeqoRequest(method, fullUrl, body) {
        var opts = { url: fullUrl, headers: veeqoHeaders() };
        if (body !== undefined && body !== null) opts.body = JSON.stringify(body);

        var resp = https[method.toLowerCase()](opts);
        if (resp.code < 200 || resp.code >= 300) {
            log.error('Veeqo ' + method + ' ' + fullUrl + ' -> ' + resp.code, resp.body);
            throw new Error('Veeqo API ' + resp.code + ' on ' + fullUrl + ': ' + truncate(resp.body, 500));
        }
        if (!resp.body) return null;
        try { return JSON.parse(resp.body); }
        catch (e) { log.error('Veeqo non-JSON response', resp.body); throw new Error('Veeqo returned non-JSON response.'); }
    }

    function veeqoFindOrder(amazonOrderId) {
        var url = VEEQO_API_BASE + '/orders?query=' + encodeURIComponent(amazonOrderId) + '&page_size=10';
        var list = veeqoRequest('GET', url, null);
        if (!list || !list.length) return null;
        for (var i = 0; i < list.length; i++) {
            var o = list[i];
            if (o.number === amazonOrderId || o.external_id === amazonOrderId ||
                (o.channel_order && o.channel_order.id === amazonOrderId)) return o;
        }
        return list[0];
    }

    function veeqoGetOrder(orderId) {
        return veeqoRequest('GET', VEEQO_API_BASE + '/orders/' + encodeURIComponent(orderId), null);
    }

    function veeqoDeleteAllocation(allocationId) {
        return veeqoRequest('DELETE', VEEQO_API_BASE + '/allocations/' + encodeURIComponent(allocationId), null);
    }

    function veeqoCreateAllocation(orderId, warehouseId, lineItemsAttributes) {
        var body = { allocation: { warehouse_id: warehouseId, line_items_attributes: lineItemsAttributes } };
        return veeqoRequest('POST', VEEQO_API_BASE + '/orders/' + encodeURIComponent(orderId) + '/allocations', body);
    }

    // Create an allocation and resolve its new id. Tracks ids already seen so
    // the freshly-created allocation can be identified.
    function createAllocationGetId(orderId, warehouseId, lineItemsAttributes, knownSet) {
        var resp = veeqoCreateAllocation(orderId, warehouseId, lineItemsAttributes);
        var allocs = (resp && resp.allocations) || [];
        if (!allocs.length) { var o = veeqoGetOrder(orderId); allocs = o.allocations || []; }

        var newId = null;
        for (var i = allocs.length - 1; i >= 0; i--) {
            var id = String(allocs[i].id);
            if (!knownSet[id]) { newId = id; break; }
        }
        if (!newId && allocs.length) newId = String(allocs[allocs.length - 1].id);
        if (!newId) throw new Error('Could not determine the created allocation id from Veeqo response.');
        knownSet[newId] = true;
        return newId;
    }

    function veeqoUpdateAllocationPackage(allocationId, pkg) {
        var body = { allocation_package: pkg };
        return veeqoRequest('PUT', VEEQO_API_BASE + '/allocations/' + encodeURIComponent(allocationId) + '/allocation_package', body);
    }

    function veeqoGetAllocationRates(allocationId) {
        var url = VEEQO_API_BASE + '/shipping/rates/' + encodeURIComponent(allocationId) +
            '?from_allocation_package=true&format_with_unavailable_quotes=false';
        return veeqoRequest('GET', url, null);
    }

    function veeqoPurchaseLabel(leg) {
        var shipment = {
            allocation_id:      parseInt(leg.allocationId, 10),
            carrier_id:         leg.carrierId || '',
            remote_shipment_id: leg.remoteShipmentId,
            service_type:       leg.serviceType,
            notify_customer:    true,
            sub_carrier_id:     leg.subCarrierId || '',
            service_carrier:    leg.serviceCarrier || '',
            payment_method_id:  null,
            liability_amount:   '0.0',
            try_inbound_label:  false,
            total_net_charge:   '$' + Number(leg.baseRate || 0).toFixed(2),
            base_rate:          Number(leg.baseRate || 0).toFixed(2)
        };
        if (leg.confKey && leg.confValue) shipment[leg.confKey] = leg.confValue;

        var body = { carrier: leg.carrier || 'amazon_shipping_v2', shipment: shipment };
        log.debug('Purchase label body', JSON.stringify(body));
        return veeqoRequest('POST', VEEQO_API_BASE + '/shipping/shipments', body);
    }

    // The purchase response nests label/tracking differently than the simplified
    // docs suggest, so pull them out of string-or-object fields with a deep-scan
    // fallback, and only ever return absolute http(s) URLs (a relative/garbage
    // value would resolve against NetSuite and 404).
    function extractPurchase(resp) {
        if (!resp) return { labelUrl: '', trackingUrl: '', trackingNumber: '' };

        var labelUrl = urlish(resp.label_url) || urlish(resp.labelUrl) || urlish(resp.label) ||
                       urlish(resp.label_download_url) || urlish(resp.pdf_url) ||
                       (resp.labels && resp.labels.length ? urlish(resp.labels[0]) : '') ||
                       (resp.documents && resp.documents.length ? urlish(resp.documents[0]) : '');
        var trackingUrl = urlish(resp.tracking_url) || urlish(resp.trackingUrl) || urlish(resp.tracking);
        var trackingNum = trackNum(resp.tracking_number) || trackNum(resp.trackingNumber) ||
                          trackNum(resp.tracking) ||
                          (resp.tracking_numbers && resp.tracking_numbers.length ? trackNum(resp.tracking_numbers[0]) : '');

        if (!labelUrl || !trackingUrl || !trackingNum) {
            var found = deepScan(resp);
            if (!labelUrl)    labelUrl    = found.labelUrl;
            if (!trackingUrl) trackingUrl = found.trackingUrl;
            if (!trackingNum) trackingNum = found.trackingNumber;
        }
        return {
            labelUrl:       isHttp(labelUrl) ? labelUrl : '',
            trackingUrl:    isHttp(trackingUrl) ? trackingUrl : '',
            trackingNumber: trackingNum || ''
        };
    }

    function urlish(v) {
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'object') return v.url || v.href || v.pdf || v.label_url ||
            v.tracking_url || v.link || v.download_url || '';
        return '';
    }
    function trackNum(v) {
        if (!v) return '';
        if (typeof v === 'string') return /^https?:/i.test(v) ? '' : v;
        if (typeof v === 'object') return v.number || v.tracking_number || v.code || v.value || '';
        return '';
    }
    function isHttp(s) { return typeof s === 'string' && /^https?:\/\//i.test(s); }

    // Breadth-walk the response for the first label URL and tracking info.
    function deepScan(root) {
        var out = { labelUrl: '', trackingUrl: '', trackingNumber: '' };
        var stack = [{ k: '', v: root }];
        var guard = 0;
        while (stack.length && guard < 800) {
            guard++;
            var node = stack.pop();
            var k = String(node.k || '').toLowerCase();
            var v = node.v;
            if (v == null) continue;
            if (typeof v === 'string') {
                if (isHttp(v)) {
                    if (!out.labelUrl && (/label/.test(k) || /label|\.pdf|document/i.test(v))) out.labelUrl = v;
                    else if (!out.trackingUrl && /track/.test(k)) out.trackingUrl = v;
                } else if (!out.trackingNumber && /track/.test(k) && /^[A-Za-z0-9\-]{6,}$/.test(v)) {
                    out.trackingNumber = v;
                }
            } else if (typeof v === 'object') {
                for (var key in v) { if (v.hasOwnProperty(key)) stack.push({ k: key, v: v[key] }); }
            }
        }
        return out;
    }

    // Normalize allocation-rate "available" quotes.
    function normalizeAllocRates(resp) {
        var available = (resp && resp.available) || [];
        return available.map(function (r) {
            var base = parseFloat(r.base_rate || '0');
            var conf = pickConfirmation(r.shipping_service_options || []);
            return {
                carrier:        r.carrier || 'amazon_shipping_v2',
                serviceCarrier: r.service_carrier || '',
                subCarrierId:   r.sub_carrier_id || (r.service_carrier ? String(r.service_carrier).toUpperCase() : ''),
                serviceId:      r.service_id || '',
                serviceType:    r.name || '',          // unique rate id used as service_type on purchase
                carrierId:      r.carrier_id || '',
                remoteShipmentId: r.remote_shipment_id || '',
                baseRate:       isFinite(base) ? base : 0,
                currency:       r.currency || 'USD',
                deliveryDate:   r.delivery_promise_date || '',
                protected:      !!r.protected,
                confKey:        conf ? conf.key : '',
                confValue:      conf ? conf.value : ''
            };
        });
    }

    // From shipping_service_options, find the confirmation option and pick the
    // cheapest value (avoids paid signature confirmation).
    function pickConfirmation(serviceOptions) {
        for (var i = 0; i < serviceOptions.length; i++) {
            var o = serviceOptions[i];
            if (o && o.key && /CONFIRMATION/i.test(o.key)) {
                var vals = o.values || [];
                if (!vals.length) return null;
                var best = null;
                for (var j = 0; j < vals.length; j++) {
                    var price = parseFloat(vals[j].price || 0) || 0;
                    if (best === null || price < best.price) best = { value: vals[j].value, price: price };
                }
                return best ? { key: o.key, value: best.value } : null;
            }
        }
        return null;
    }

    // ==================================================================
    // HTML RENDERING
    // ==================================================================
    function renderPage(view) {
        var stage = view.stage;
        var state = view.state || emptyState();

        var body = '';
        body += renderLookupSection(stage, state);

        if (stage === MODE.LOOKED_UP) {
            body += renderOrderSummary(view.order);
            body += renderAssignSection(view.items || []);
        }
        if (stage === MODE.QUOTED) {
            body += renderOrderSummary(view.order);
            body += renderAllocSummary(state);
            body += renderRatesSection(view.rates || []);
        }
        if (stage === MODE.SHIPPED) {
            body += renderSuccessSection(view);
        }

        body += renderSubmitButton(stage);

        return shell(
            '<form method="POST" id="veeqo-form" autocomplete="off">' +
                renderHiddenState(stage, state) + body +
            '</form>',
            stage,
            (stage === MODE.LOOKED_UP) ? (view.items || []) : null
        );
    }

    function shell(inner, stage, itemsForJs) {
        var itemsScript = '';
        if (itemsForJs) {
            var arr = itemsForJs.map(function (it, i) {
                return { i: i, l: (it.sku ? it.sku + ' - ' : '') + (it.title || '') + (it.qty ? ' (ordered ' + it.qty + ')' : '') };
            });
            var json = JSON.stringify(arr).replace(/</g, '\\u003c');
            itemsScript = '<script>var VQ_ITEMS=' + json + ';</script>';
        }
        return '<!DOCTYPE html><html lang="en"><head>' +
            '<meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Veeqo Shipping</title>' + STYLES +
            '</head><body>' +
            '<div class="vq-shell">' +
                '<header class="vq-header"><div class="vq-header-inner">' +
                    '<div class="vq-logo">VEEQO</div>' +
                    '<div class="vq-title">Create Shipping Label</div>' +
                    '<a href="?" class="vq-newship-btn">+ New Shipment</a>' +
                    '<div class="vq-stage-badge">' + stageBadge(stage) + '</div>' +
                '</div></header>' +
                '<main class="vq-container">' + inner + '</main>' +
            '</div>' + itemsScript + SCRIPTS + '</body></html>';
    }

    function stageBadge(stage) {
        var labels = { initial: '1. Lookup', looked_up: '2. Pack Boxes', quoted: '3. Rates', shipped: '4. Done' };
        return '<span class="vq-badge">' + escapeHtml(labels[stage] || stage) + '</span>';
    }

    function renderHiddenState(stage, state) {
        return hidden('stage', stage) +
               hidden('ns_so_number',    state.nsSoNumber) +
               hidden('amazon_order_id', state.amazonOrderId) +
               hidden('veeqo_order_id',  state.veeqoOrderId) +
               hidden('alloc_summary',   state.allocSummary || '');
    }

    function hidden(name, value) {
        return '<input type="hidden" name="' + escapeAttr(name) + '" value="' + escapeAttr(value || '') + '">';
    }

    function renderLookupSection(stage, state) {
        var ro = (stage !== MODE.INITIAL) ? 'readonly ' : '';
        return '<section class="vq-card">' +
            '<h2 class="vq-card-title">Order Lookup</h2>' +
            '<div class="vq-grid-2">' +
                '<label class="vq-field"><span class="vq-label">NetSuite Sales Order #</span>' +
                    '<input type="text" name="ns_so_number_input" value="' + escapeAttr(state.nsSoNumber) + '" ' +
                        'oninput="document.getElementsByName(\'ns_so_number\')[0].value=this.value" ' + ro + 'required></label>' +
                '<label class="vq-field"><span class="vq-label">Amazon Order ID</span>' +
                    '<input type="text" name="amazon_order_id_input" value="' + escapeAttr(state.amazonOrderId) + '" ' +
                        'oninput="document.getElementsByName(\'amazon_order_id\')[0].value=this.value" ' +
                        'placeholder="123-1234567-1234567" ' + ro + 'required></label>' +
            '</div>' +
            '</section>';
    }

    function renderOrderSummary(order) {
        if (!order) return '';
        var ship = order.deliver_to || {};
        var custName = order.customer
            ? ((order.customer.first_name || '') + ' ' + (order.customer.last_name || '')).trim() : '';
        var channel = (order.channel && order.channel.name) || 'unknown';
        var addrLines = [
            ship.first_name ? (ship.first_name + ' ' + (ship.last_name || '')).trim() : '',
            ship.company, ship.address1, ship.address2,
            [ship.city, ship.state, ship.zip].filter(Boolean).join(', '), ship.country
        ].filter(Boolean).map(escapeHtml).join('<br>');

        return '<section class="vq-card">' +
            '<h2 class="vq-card-title">Order Summary</h2>' +
            '<div class="vq-grid-4">' +
                kv('Channel', channel) + kv('Customer', custName) +
                kv('Status', order.status || '') + kv('Total', String(order.total_price || '')) +
            '</div>' +
            '<div class="vq-shipto"><div class="vq-label">Ship To</div>' +
                '<div class="vq-addr">' + (addrLines || '<i class="vq-muted">no address</i>') + '</div></div>' +
            '</section>';
    }

    function kv(label, value) {
        return '<div class="vq-kv"><div class="vq-label">' + escapeHtml(label) + '</div>' +
            '<div class="vq-value">' + escapeHtml(value || '-') + '</div></div>';
    }

    // The packing UI: per-box dimensions + a unit count for each SKU.
    function renderAssignSection(items) {
        if (!items.length) {
            return '<section class="vq-card"><h2 class="vq-card-title">Items</h2>' +
                '<p class="vq-warn">This Veeqo order has no line items to allocate.</p></section>';
        }
        var itemList = items.map(function (it) {
            return '<tr><td>' + escapeHtml(it.sku || '') + '</td><td>' + escapeHtml(it.title || '') +
                '</td><td class="vq-num">' + escapeHtml(String(it.qty || 0)) + '</td></tr>';
        }).join('');

        return '<section class="vq-card">' +
            '<h2 class="vq-card-title">Order Items <span class="vq-muted">(' + items.length + ' SKUs)</span></h2>' +
            '<table class="vq-table"><thead><tr><th>SKU</th><th>Title</th><th class="vq-num">Ordered</th></tr></thead>' +
                '<tbody>' + itemList + '</tbody></table>' +
            '</section>' +
            '<section class="vq-card">' +
                '<div class="vq-card-head">' +
                    '<h2 class="vq-card-title">Pack Boxes <span class="vq-muted">(one box per row of labels; dims in inches, weight in lb)</span></h2>' +
                    '<button type="button" class="vq-btn vq-btn-secondary" onclick="vqAddBox()">+ Add Box</button>' +
                '</div>' +
                '<div id="vq-boxes">' + boxCardHtml(0, items, 1) + '</div>' +
                '<input type="hidden" name="box_count" id="vq-box-count" value="1">' +
            '</section>';
    }

    function boxCardHtml(b, items, displayNum) {
        var itemRows = items.map(function (it, li) {
            return '<label class="vq-bi">' +
                '<span class="vq-bi-label">' + escapeHtml((it.sku || it.title || ('item ' + li))) + '</span>' +
                '<input type="number" min="0" step="1" name="box_' + b + '_item_' + li + '_qty" placeholder="0">' +
            '</label>';
        }).join('');
        return '<div class="vq-boxcard" data-boxcard data-box="' + b + '">' +
            '<div class="vq-boxcard-head"><strong>Box <span class="vq-boxnum">' + displayNum + '</span></strong>' +
                '<button type="button" class="vq-btn-icon" title="Remove box" onclick="vqRemoveBox(this)">&times;</button></div>' +
            '<div class="vq-box-dims">' +
                '<input type="number" step="0.01" min="0" name="box_length_' + b + '" placeholder="Length">' +
                '<input type="number" step="0.01" min="0" name="box_width_'  + b + '" placeholder="Width">' +
                '<input type="number" step="0.01" min="0" name="box_height_' + b + '" placeholder="Height">' +
                '<input type="number" step="0.01" min="0" name="box_weight_' + b + '" placeholder="Weight">' +
            '</div>' +
            '<div class="vq-box-items"><div class="vq-bi-title">Units in this box</div>' +
                '<div class="vq-bi-grid">' + itemRows + '</div>' +
            '</div>' +
        '</div>';
    }

    function renderAllocSummary(state) {
        var summary = [];
        try { summary = state.allocSummary ? JSON.parse(state.allocSummary) : []; } catch (e) { summary = []; }
        if (!summary.length) return '';
        var rows = summary.map(function (s, i) {
            var itemsStr = (s.items || []).map(function (it) { return escapeHtml(it.label + ' x' + it.qty); }).join(', ');
            return '<tr><td>Box ' + (i + 1) + '</td><td>' + escapeHtml(s.dims) + '</td><td>' + itemsStr + '</td></tr>';
        }).join('');
        return '<section class="vq-card">' +
            '<h2 class="vq-card-title">Boxes <span class="vq-muted">(' + summary.length + ' allocations created)</span></h2>' +
            '<table class="vq-table"><thead><tr><th>Box</th><th>Dimensions</th><th>Contents</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table>' +
            '</section>';
    }

    function renderRatesSection(rates) {
        if (!rates.length) return '';
        var multi = rates[0].legs && rates[0].legs.length > 1;
        var cards = rates.map(function (r, i) {
            var json = escapeAttr(JSON.stringify(r));
            var badge = i === 0 ? '<span class="vq-tag vq-tag-best">Cheapest</span>' : '';
            var prot = r.protected ? '<span class="vq-tag vq-tag-ok">Amazon Protected</span>' : '';
            var boxesBadge = multi ? '<span class="vq-tag vq-tag-info">' + r.legs.length + ' boxes</span>' : '';
            var deliveryStr = r.deliveryDate ? formatDeliveryDate(r.deliveryDate) : '';
            return '<label class="vq-rate-card">' +
                '<input type="radio" name="selected_rate" value="' + json + '" required>' +
                '<div class="vq-rate-card-body">' +
                    '<div class="vq-rate-head">' +
                        '<div><div class="vq-rate-carrier">' + escapeHtml((r.carrier || '').toUpperCase()) + '</div>' +
                            '<div class="vq-rate-service">' + escapeHtml(r.service) + '</div></div>' +
                        '<div class="vq-rate-price">' + escapeHtml(r.currency) + ' ' + r.totalCost.toFixed(2) +
                            (multi ? '<span class="vq-rate-sub">all boxes</span>' : '') + '</div>' +
                    '</div>' +
                    '<div class="vq-rate-meta">' +
                        (deliveryStr ? '<span>' + escapeHtml(deliveryStr) + '</span>' : '') + badge + prot + boxesBadge +
                    '</div>' +
                '</div>' +
            '</label>';
        }).join('');
        return '<section class="vq-card">' +
            '<h2 class="vq-card-title">Pick a Rate <span class="vq-muted">(' + rates.length +
                ' available' + (multi ? ', priced across all boxes' : '') + ', cheapest first)</span></h2>' +
            '<div class="vq-rate-grid">' + cards + '</div>' +
            '</section>';
    }

    function formatDeliveryDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            return 'Est. ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } catch (e) { return iso; }
    }

    function renderSubmitButton(stage) {
        var labels = { initial: 'Lookup Order', looked_up: 'Create Allocations & Get Rates', quoted: 'Buy Label(s) & Ship' };
        if (!labels[stage]) return '';
        return '<div class="vq-actions"><button type="submit" class="vq-btn vq-btn-primary">' +
            escapeHtml(labels[stage]) + '</button></div>';
    }

    function renderSuccessSection(view) {
        var r = view.rate, results = view.results || [], state = view.state;
        var okCount = results.filter(function (x) { return x.ok; }).length;
        var allOk = okCount === results.length;

        var rows = results.map(function (x) {
            var itemsStr = (x.items || []).map(function (it) { return escapeHtml(it.label + ' x' + it.qty); }).join(', ');
            if (x.ok) {
                var track = x.trackingUrl
                    ? '<a target="_blank" href="' + escapeAttr(x.trackingUrl) + '">' + escapeHtml(x.trackingNumber || 'Track') + '</a>'
                    : escapeHtml(x.trackingNumber || '(none)');
                var label = x.labelUrl
                    ? '<a target="_blank" href="' + escapeAttr(x.labelUrl) + '" class="vq-btn vq-btn-mini">Label PDF</a>'
                    : '<span class="vq-muted">no label url</span>';
                return '<tr><td>Box ' + x.box + '</td><td>' + (itemsStr || '-') + '</td><td>' + track + '</td><td>' + label + '</td></tr>';
            }
            return '<tr class="vq-row-fail"><td>Box ' + x.box + '</td><td>' + (itemsStr || '-') +
                '</td><td colspan="2" class="vq-warn">FAILED: ' + escapeHtml(x.error || 'unknown error') + '</td></tr>';
        }).join('');

        var header = allOk ? 'Label(s) Created' : (okCount ? 'Partially Shipped' : 'Booking Failed');
        var iconClass = allOk ? 'vq-success-icon' : 'vq-warn-icon';
        var icon = allOk ? '&#10003;' : '!';
        var cardClass = allOk ? 'vq-card-success' : 'vq-card-warn';

        return '<section class="vq-card ' + cardClass + '">' +
            '<div class="' + iconClass + '">' + icon + '</div>' +
            '<h2 class="vq-card-title">' + header + '</h2>' +
            '<div class="vq-grid-4">' +
                kv('SO #', state.nsSoNumber) + kv('Amazon Order', state.amazonOrderId) +
                kv('Carrier', (r.carrier || '').toUpperCase() + ' - ' + (r.service || '')) +
                kv('Total Cost', (r.currency || '') + ' ' + (r.totalCost || 0).toFixed(2)) +
            '</div>' +
            '<table class="vq-table" style="margin-top:14px">' +
                '<thead><tr><th>Box</th><th>Contents</th><th>Tracking</th><th>Label</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table>' +
            '<div class="vq-success-actions"><a href="?" class="vq-btn vq-btn-primary">+ New Shipment</a></div>' +
            '</section>';
    }

    function renderErrorPage(err, req) {
        var state = req ? readState(req) : emptyState();
        return shell(
            '<section class="vq-card vq-card-error">' +
                '<div class="vq-error-icon">!</div>' +
                '<h2 class="vq-card-title">Error</h2>' +
                '<pre class="vq-error-msg">' + escapeHtml(err.message || String(err)) + '</pre>' +
                '<div class="vq-actions">' +
                    '<a href="javascript:history.back()" class="vq-btn vq-btn-secondary">&larr; Back</a>' +
                    '<a href="?" class="vq-btn vq-btn-primary">Start Over</a>' +
                '</div>' +
            '</section>',
            state.stage, null
        );
    }

    // ==================================================================
    // CSS + JS
    // ==================================================================
    var STYLES =
        '<style>' +
        '*{box-sizing:border-box}' +
        'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;background:#f3f4f6;color:#1f2937;font-size:14px;line-height:1.5}' +
        '.vq-shell{min-height:100vh;display:flex;flex-direction:column}' +
        '.vq-header{background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);color:#fff;padding:18px 0;box-shadow:0 2px 8px rgba(0,0,0,.08)}' +
        '.vq-header-inner{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:18px}' +
        '.vq-logo{font-weight:800;letter-spacing:2px;font-size:18px;background:rgba(255,255,255,.12);padding:6px 12px;border-radius:6px}' +
        '.vq-title{font-size:18px;font-weight:600;flex:1}' +
        '.vq-newship-btn{background:rgba(255,255,255,.18);color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;transition:background .15s}' +
        '.vq-newship-btn:hover{background:rgba(255,255,255,.30)}' +
        '.vq-badge{background:rgba(255,255,255,.18);padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.5px}' +
        '.vq-container{max-width:1100px;width:100%;margin:0 auto;padding:24px;flex:1}' +
        '.vq-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.04)}' +
        '.vq-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}' +
        '.vq-card-title{margin:0 0 16px 0;font-size:16px;font-weight:700;color:#111827}' +
        '.vq-card-head .vq-card-title{margin-bottom:0}' +
        '.vq-muted{color:#6b7280;font-weight:400;font-size:13px}' +
        '.vq-warn{color:#b45309;font-weight:500}' +
        '.vq-label{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;display:block}' +
        '.vq-value{font-size:14px;color:#111827;font-weight:500}' +
        '.vq-field{display:flex;flex-direction:column}' +
        '.vq-field input{padding:9px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;font-family:inherit;background:#fff;transition:border-color .15s,box-shadow .15s}' +
        '.vq-field input:focus{outline:0;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}' +
        '.vq-field input[readonly]{background:#f9fafb;color:#6b7280}' +
        '.vq-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}' +
        '.vq-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px}' +
        '.vq-shipto{padding-top:14px;border-top:1px solid #f3f4f6}' +
        '.vq-addr{font-size:13px;color:#111827;line-height:1.55;margin-top:4px}' +
        '.vq-table{width:100%;border-collapse:collapse;font-size:13px}' +
        '.vq-table th{background:#f9fafb;color:#374151;text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px}' +
        '.vq-table td{padding:8px 10px;border-bottom:1px solid #f3f4f6}' +
        '.vq-row-fail td{background:#fef2f2}' +
        '.vq-num{text-align:right}' +
        '.vq-boxcard{border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:12px;background:#fcfcfd}' +
        '.vq-boxcard-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:14px;color:#111827}' +
        '.vq-box-dims{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px}' +
        '.vq-box-dims input{padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit}' +
        '.vq-box-dims input:focus{outline:0;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}' +
        '.vq-bi-title{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}' +
        '.vq-bi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}' +
        '.vq-bi{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #eef0f3;border-radius:6px;padding:6px 8px}' +
        '.vq-bi-label{flex:1;font-size:12px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.vq-bi input{width:64px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;text-align:right}' +
        '.vq-bi input:focus{outline:0;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}' +
        '.vq-btn{display:inline-block;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;border:1px solid transparent;cursor:pointer;text-decoration:none;font-family:inherit;line-height:1.2}' +
        '.vq-btn-primary{background:#2563eb;color:#fff}.vq-btn-primary:hover{background:#1d4ed8}' +
        '.vq-btn-secondary{background:#fff;color:#374151;border-color:#d1d5db}.vq-btn-secondary:hover{background:#f9fafb}' +
        '.vq-btn-mini{padding:5px 10px;font-size:12px;background:#2563eb;color:#fff}.vq-btn-mini:hover{background:#1d4ed8}' +
        '.vq-btn-icon{width:30px;height:30px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;color:#9ca3af;cursor:pointer;font-size:18px;line-height:1}' +
        '.vq-btn-icon:hover{background:#fee;color:#c93030;border-color:#fbb}' +
        '.vq-actions{margin-top:16px;display:flex;gap:10px}' +
        '.vq-rate-grid{display:grid;grid-template-columns:1fr;gap:10px}' +
        '.vq-rate-card{display:block;border:2px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:border-color .15s,background .15s;position:relative}' +
        '.vq-rate-card:hover{border-color:#93c5fd;background:#f8fafc}' +
        '.vq-rate-card input{position:absolute;opacity:0;pointer-events:none}' +
        '.vq-rate-card:has(input:checked){border-color:#2563eb;background:#eff6ff}' +
        '.vq-rate-card-body{padding:14px 18px}' +
        '.vq-rate-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}' +
        '.vq-rate-carrier{font-size:15px;font-weight:700;color:#111827}' +
        '.vq-rate-service{font-size:13px;color:#6b7280;margin-top:2px}' +
        '.vq-rate-price{font-size:18px;font-weight:700;color:#0f172a;white-space:nowrap;text-align:right}' +
        '.vq-rate-sub{display:block;font-size:11px;font-weight:500;color:#6b7280}' +
        '.vq-rate-meta{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;font-size:12px;color:#6b7280;align-items:center}' +
        '.vq-tag{padding:3px 8px;border-radius:999px;font-weight:600;font-size:11px}' +
        '.vq-tag-best{background:#d1fae5;color:#065f46}.vq-tag-ok{background:#dbeafe;color:#1e40af}.vq-tag-info{background:#ede9fe;color:#5b21b6}' +
        '.vq-card-success{border-color:#86efac;background:linear-gradient(180deg,#f0fdf4 0%,#fff 100%)}' +
        '.vq-success-icon{width:48px;height:48px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:12px}' +
        '.vq-card-warn{border-color:#fcd34d;background:linear-gradient(180deg,#fffbeb 0%,#fff 100%)}' +
        '.vq-warn-icon{width:48px;height:48px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;margin-bottom:12px}' +
        '.vq-success-actions{margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
        '.vq-card-error{border-color:#fca5a5;background:linear-gradient(180deg,#fef2f2 0%,#fff 100%)}' +
        '.vq-error-icon{width:48px;height:48px;border-radius:50%;background:#dc2626;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;margin-bottom:12px}' +
        '.vq-error-msg{background:#fff;border:1px solid #fecaca;color:#991b1b;padding:12px 14px;border-radius:6px;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;margin:0 0 16px 0}' +
        '@media (max-width:768px){.vq-grid-2,.vq-grid-4{grid-template-columns:1fr}.vq-box-dims{grid-template-columns:1fr 1fr}.vq-header-inner{flex-wrap:wrap}.vq-title{flex-basis:100%;order:3}}' +
        '</style>';

    var SCRIPTS =
        '<script>' +
        'function vqBoxInner(b){' +
            'var h=\'<div class="vq-boxcard-head"><strong>Box <span class="vq-boxnum"></span></strong>\' +' +
                '\'<button type="button" class="vq-btn-icon" title="Remove box" onclick="vqRemoveBox(this)">&times;</button></div>\';' +
            'h+=\'<div class="vq-box-dims">\' +' +
                '\'<input type="number" step="0.01" min="0" name="box_length_\'+b+\'" placeholder="Length">\' +' +
                '\'<input type="number" step="0.01" min="0" name="box_width_\'+b+\'" placeholder="Width">\' +' +
                '\'<input type="number" step="0.01" min="0" name="box_height_\'+b+\'" placeholder="Height">\' +' +
                '\'<input type="number" step="0.01" min="0" name="box_weight_\'+b+\'" placeholder="Weight">\' +' +
            '\'</div>\';' +
            'var rows="";' +
            'for(var i=0;i<VQ_ITEMS.length;i++){' +
                'rows+=\'<label class="vq-bi"><span class="vq-bi-label">\'+VQ_ITEMS[i].l.replace(/</g,"&lt;")+\'</span>\' +' +
                    '\'<input type="number" min="0" step="1" name="box_\'+b+\'_item_\'+VQ_ITEMS[i].i+\'_qty" placeholder="0"></label>\';' +
            '}' +
            'h+=\'<div class="vq-box-items"><div class="vq-bi-title">Units in this box</div><div class="vq-bi-grid">\'+rows+\'</div></div>\';' +
            'return h;' +
        '}' +
        'function vqAddBox(){' +
            'var wrap=document.getElementById("vq-boxes");' +
            'var counter=document.getElementById("vq-box-count");' +
            'var b=parseInt(counter.value,10);' +
            'var card=document.createElement("div");' +
            'card.className="vq-boxcard";card.setAttribute("data-boxcard","");card.setAttribute("data-box",b);' +
            'card.innerHTML=vqBoxInner(b);' +
            'wrap.appendChild(card);' +
            'counter.value=b+1;' +
            'vqRenumber();' +
        '}' +
        'function vqRemoveBox(btn){' +
            'var wrap=document.getElementById("vq-boxes");' +
            'if(wrap.querySelectorAll("[data-boxcard]").length<=1)return;' +
            'btn.closest("[data-boxcard]").remove();' +
            'vqRenumber();' +
        '}' +
        'function vqRenumber(){' +
            'var cards=document.querySelectorAll("#vq-boxes [data-boxcard]");' +
            'for(var i=0;i<cards.length;i++){var s=cards[i].querySelector(".vq-boxnum");if(s)s.textContent=(i+1);}' +
        '}' +
        'document.addEventListener("DOMContentLoaded",vqRenumber);' +
        '</script>';

    // ==================================================================
    // MISC
    // ==================================================================
    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    function round2(n) { return Math.round(n * 100) / 100; }
    function truncate(s, n) { s = String(s || ''); return s.length > n ? s.substring(0, n) + '...' : s; }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escapeAttr(s) { return escapeHtml(s); }

    return { onRequest: onRequest };
});
