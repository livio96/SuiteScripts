/**
 * ATHQ Testing Department — Queue, Bench Grid & Throughput
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Record: customrecord_refurb_scan_log (the record you already have)
 *
 * ---------------------------------------------------------------------------
 * HOW IT WORKS
 * ---------------------------------------------------------------------------
 * One record per unit of work, edited in place. A row is created as Pending and
 * moves Pending → Testing → Passed / Failed on the same record, so "pending" and
 * "completed" are two views of one table instead of two separate entries.
 *
 * This Suitelet only ever touches rows where RSL Activity = Test. Refurb rows
 * written by the other station are invisible here and untouched.
 *
 * Views:
 *   Queue       — editable grid of everything still open (Pending / Testing / On Hold)
 *   Completed   — editable grid of Passed / Failed for a chosen period
 *   Throughput  — units, pass rate and average bench minutes per technician
 *
 * ---------------------------------------------------------------------------
 * FIELDS YOU ALREADY HAVE — reused as-is
 * ---------------------------------------------------------------------------
 *   custrecord_rsl_serial      Free-Form Text
 *   custrecord_rsl_technician  List/Record → Employee
 *   custrecord_rsl_item        List/Record → Item
 *   custrecord_rsl_scan_date   Date/Time      → now means "when the test finished"
 *   custrecord_rsl_notes       Free-Form Text
 *   custrecord_rsl_activity    List/Record → RSL Activity
 *   custrecord_rsl_qty         Integer Number
 *
 * FIELDS TO ADD — four required
 * ---------------------------------------------------------------------------
 *   custrecord_rsl_status      Free-Form Text   Pending | Testing | On Hold | Passed | Failed
 *   custrecord_rsl_queued      Date/Time        when it entered the queue
 *   custrecord_rsl_started     Date/Time        when a tech started on it
 *   custrecord_rsl_minutes     Integer Number   bench time: started → completed
 *
 * FIELDS TO ADD — three optional (set HAS below to false if you skip them)
 * ---------------------------------------------------------------------------
 *   custrecord_rsl_turnaround  Integer Number   turnaround: queued → completed
 *   custrecord_rsl_source      Free-Form Text   PO / receipt / RMA reference
 *   custrecord_rsl_rush        Check Box
 *
 * Both minutes are stamped automatically the moment a row is set to Passed or
 * Failed. If nobody ever pressed Start, bench time falls back to the full
 * queued → completed span so the number is never blank.
 *
 * The technician is stamped automatically too: moving a row off Pending assigns
 * it to whoever is logged in, unless a technician is already set.
 *
 * Existing rows have a blank status. Anything with a scan date and no status is
 * treated as Passed so your history still counts in Completed and Throughput.
 * A one-time mass update setting status = "Passed" on old test rows is cleaner
 * but not required.
 * ---------------------------------------------------------------------------
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/runtime', 'N/url', 'N/format', 'N/log'],
(serverWidget, search, record, runtime, url, format, log) => {

  /* ================================================================== */
  /* Config                                                             */
  /* ================================================================== */

  const REC = 'customrecord_refurb_scan_log';

  const F = {
    // existing
    serial:    'custrecord_rsl_serial',
    tech:      'custrecord_rsl_technician',
    item:      'custrecord_rsl_item',
    completed: 'custrecord_rsl_scan_date',   // reused: the finish stamp
    notes:     'custrecord_rsl_notes',
    activity:  'custrecord_rsl_activity',
    qty:       'custrecord_rsl_qty',
    // new — required
    status:    'custrecord_rsl_status',
    queued:    'custrecord_rsl_queued',
    started:   'custrecord_rsl_started',
    minutes:   'custrecord_rsl_minutes',
    // new — optional
    turnaround: 'custrecord_rsl_turnaround',
    source:     'custrecord_rsl_source',
    rush:       'custrecord_rsl_rush'
  };

  // Flip to false for any optional field you did not create.
  const HAS = { turnaround: true, source: true, rush: true };

  // RSL Activity list. Leave TEST_ACTIVITY_ID blank to resolve it by name at
  // runtime; hardcode the internal id once you know it to save a search.
  const ACTIVITY_LIST      = 'customlist_rsl_activity';
  const TEST_ACTIVITY_ID   = '';
  const TEST_ACTIVITY_NAME = 'test';

  const STATUS = {
    PENDING: 'Pending',
    TESTING: 'Testing',
    HOLD:    'On Hold',
    PASS:    'Passed',
    FAIL:    'Failed'
  };

  const OPEN_STATUSES = [STATUS.PENDING, STATUS.TESTING, STATUS.HOLD];
  const DONE_STATUSES = [STATUS.PASS, STATUS.FAIL];
  const ALL_STATUSES  = OPEN_STATUSES.concat(DONE_STATUSES);

  // Limit the technician dropdown to these employee department internal ids.
  // Empty array = every active employee.
  const TECH_DEPARTMENTS = [];

  const PAGE_SIZE = 150;
  const NOTES_MAX = 300;   // free-form text field limit

  /* ================================================================== */
  /* Entry point                                                        */
  /* ================================================================== */

  function onRequest(ctx) {
    if (ctx.request.method === 'GET') return renderPage(ctx);
    return handlePost(ctx);
  }

  function handlePost(ctx) {
    let out;
    try {
      const body = JSON.parse(ctx.request.body || '{}');
      switch (body.action) {
        case 'list':    out = doList(body);    break;
        case 'add':     out = doAdd(body);     break;
        case 'save':    out = doSave(body);    break;
        case 'split':   out = doSplit(body);   break;
        case 'remove':  out = doRemove(body);  break;
        case 'metrics': out = doMetrics(body); break;
        case 'lookup':  out = doLookup(body);  break;
        default:        out = { ok: false, error: 'Unknown action "' + body.action + '".' };
      }
    } catch (e) {
      log.error({ title: 'Test queue POST failed', details: e });
      out = { ok: false, error: (e.message || String(e)) };
    }
    ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    ctx.response.write({ output: JSON.stringify(out) });
  }

  /* ================================================================== */
  /* Activity                                                           */
  /* ================================================================== */

  let _testAct;

  /** Internal id of the "Test" value on the RSL Activity list, or '' if absent. */
  function testActivityId() {
    if (TEST_ACTIVITY_ID) return TEST_ACTIVITY_ID;
    if (_testAct !== undefined) return _testAct;
    try {
      const rs = search.create({
        type: ACTIVITY_LIST,
        filters: [['name', 'contains', TEST_ACTIVITY_NAME], 'AND', ['isinactive', 'is', 'F']],
        columns: ['internalid', 'name']
      }).run().getRange({ start: 0, end: 5 });
      _testAct = rs.length ? rs[0].getValue('internalid') : '';
      if (!rs.length) {
        log.audit({ title: 'RSL Activity', details: 'No value containing "' + TEST_ACTIVITY_NAME + '" found.' });
      }
    } catch (e) {
      log.error({ title: 'RSL Activity lookup failed', details: e });
      _testAct = '';
    }
    return _testAct;
  }

  /** Every search starts here: testing rows only. */
  function baseFilters() {
    const act = testActivityId();
    return act ? [[F.activity, 'anyof', act]] : [];
  }

  function andThen(filters, extra) {
    if (!extra || !extra.length) return filters;
    return filters.length ? filters.concat(['AND'], [extra]) : [extra];
  }

  /* ================================================================== */
  /* Status helpers                                                     */
  /* ================================================================== */

  function statusAnyOf(values) {
    const group = [];
    values.forEach((v, i) => {
      if (i) group.push('OR');
      group.push([F.status, 'is', v]);
    });
    return group;
  }

  /** Passed / Failed plus legacy rows that were logged before status existed. */
  function doneFilterGroup() {
    return statusAnyOf(DONE_STATUSES).concat(['OR', [F.status, 'isempty', '']]);
  }

  /** Blank status on an old row means it was already done. */
  function statusOf(result) {
    const v = result.getValue(F.status);
    if (v) return v;
    return result.getValue(F.completed) ? STATUS.PASS : STATUS.PENDING;
  }

  /* ================================================================== */
  /* Small helpers                                                      */
  /* ================================================================== */

  function toDate(raw) {
    if (!raw) return null;
    try { return format.parse({ value: raw, type: format.Type.DATETIMETZ }); }
    catch (e) { try { return new Date(raw); } catch (e2) { return null; } }
  }

  function minutesBetween(from, to) {
    if (!from || !to) return 0;
    const m = Math.round((to.getTime() - from.getTime()) / 60000);
    return m > 0 ? m : 0;
  }

  function daysSince(raw) {
    const d = toDate(raw);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ================================================================== */
  /* Read — grid                                                        */
  /* ================================================================== */

  function doList(body) {
    const view   = body.view === 'completed' ? 'completed' : 'queue';
    const page   = parseInt(body.page, 10) || 0;
    const q      = (body.q || '').trim();
    const techId = body.techId || '';
    const status = body.status || '';
    const range  = body.range || 'thisweek';

    let filters = baseFilters();

    if (status && ALL_STATUSES.indexOf(status) > -1) {
      filters = andThen(filters, [F.status, 'is', status]);
    } else {
      filters = andThen(filters, view === 'queue' ? statusAnyOf(OPEN_STATUSES) : doneFilterGroup());
    }

    if (view === 'completed') filters = andThen(filters, [F.completed, 'within', range]);
    if (techId)               filters = andThen(filters, [F.tech, 'anyof', techId]);

    if (q) {
      const or = [[F.serial, 'contains', q], 'OR', [F.item + '.itemid', 'contains', q]];
      if (HAS.source) or.push('OR', [F.source, 'contains', q]);
      filters = andThen(filters, or);
    }

    const sortCol = view === 'queue'
      ? search.createColumn({ name: F.queued, sort: search.Sort.ASC })       // oldest first — work the backlog
      : search.createColumn({ name: F.completed, sort: search.Sort.DESC });

    const baseCols = [
      'internalid', sortCol,
      F.item, F.serial, F.qty, F.status, F.tech, F.notes,
      F.queued, F.started, F.completed, F.minutes
    ];
    if (HAS.turnaround) baseCols.push(F.turnaround);
    if (HAS.source)     baseCols.push(F.source);
    if (HAS.rush)       baseCols.push(F.rush);

    // The item join gives us the description without a second search. If the
    // join is unavailable for any reason we fall back to the plain columns
    // rather than failing the whole screen.
    function build(withDesc) {
      let f = filters;
      let cols = baseCols;
      if (withDesc) {
        cols = baseCols.concat([
          search.createColumn({ name: 'displayname', join: F.item }),
          search.createColumn({ name: 'salesdescription', join: F.item })
        ]);
        if (q) f = andThen(filters, [[F.item + '.displayname', 'contains', q]]);
      }
      return search.create({ type: REC, filters: f, columns: cols });
    }

    const start = page * PAGE_SIZE;
    let descOk = true, total = 0, raw;

    try {
      const s = build(true);
      total = s.runPaged().count;
      raw = s.run().getRange({ start: start, end: start + PAGE_SIZE });
    } catch (e) {
      log.error({ title: 'Item description join failed, retrying without it', details: e });
      descOk = false;
      const s = build(false);
      try { total = s.runPaged().count; } catch (e2) { total = 0; }
      raw = s.run().getRange({ start: start, end: start + PAGE_SIZE });
    }

    const rows = raw.map(r => {
      const queued = r.getValue(F.queued) || '';
      let desc = '';
      if (descOk) {
        desc = r.getValue({ name: 'displayname', join: F.item }) ||
               r.getValue({ name: 'salesdescription', join: F.item }) || '';
      }
      return {
        id:        r.getValue('internalid'),
        item:      r.getText(F.item) || '',
        desc:      desc,
        itemId:    r.getValue(F.item) || '',
        serial:    r.getValue(F.serial) || '',
        qty:       Number(r.getValue(F.qty) || 1),
        status:    statusOf(r),
        techId:    r.getValue(F.tech) || '',
        tech:      r.getText(F.tech) || '',
        notes:     r.getValue(F.notes) || '',
        queuedAt:  queued,
        age:       daysSince(queued),
        started:   r.getValue(F.started) || '',
        completed: r.getValue(F.completed) || '',
        minutes:   Number(r.getValue(F.minutes) || 0),
        turnaround: HAS.turnaround ? Number(r.getValue(F.turnaround) || 0) : 0,
        source:    HAS.source ? (r.getValue(F.source) || '') : '',
        rush:      HAS.rush ? (r.getValue(F.rush) === true || r.getValue(F.rush) === 'T') : false
      };
    });

    return {
      ok: true, rows: rows, page: page, pageSize: PAGE_SIZE,
      total: total, hasMore: (start + rows.length) < total
    };
  }

  /* ================================================================== */
  /* Read — metrics                                                     */
  /* ================================================================== */

  function doMetrics(body) {
    const range = body.range || 'today';

    // Open work — no date filter, this is the backlog as it stands right now.
    const open = { pending: 0, testing: 0, hold: 0, lines: 0, oldest: null };
    search.create({
      type: REC,
      filters: andThen(baseFilters(), statusAnyOf(OPEN_STATUSES)),
      columns: [F.status, F.qty, F.queued, F.completed]
    }).run().each(r => {
      const qty = Number(r.getValue(F.qty) || 1);
      const st = statusOf(r);
      if (st === STATUS.TESTING)   open.testing += qty;
      else if (st === STATUS.HOLD) open.hold += qty;
      else                         open.pending += qty;
      open.lines += 1;
      const age = daysSince(r.getValue(F.queued));
      if (age !== null && (open.oldest === null || age > open.oldest)) open.oldest = age;
      return true;
    });

    // Closed inside the period.
    const agg = {};
    const done = { units: 0, pass: 0, fail: 0, lines: 0, minutes: 0, timed: 0, turn: 0, turned: 0 };

    const doneCols = [F.status, F.qty, F.tech, F.minutes, F.completed];
    if (HAS.turnaround) doneCols.push(F.turnaround);

    search.create({
      type: REC,
      filters: andThen(andThen(baseFilters(), doneFilterGroup()), [F.completed, 'within', range]),
      columns: doneCols
    }).run().each(r => {
      const qty  = Number(r.getValue(F.qty) || 1);
      const mins = Number(r.getValue(F.minutes) || 0);
      const turn = HAS.turnaround ? Number(r.getValue(F.turnaround) || 0) : 0;
      const st   = statusOf(r);
      const tech = r.getText(F.tech) || '(unassigned)';
      const a = agg[tech] || (agg[tech] = {
        tech: tech, units: 0, pass: 0, fail: 0, lines: 0, minutes: 0, timed: 0, turn: 0, turned: 0
      });

      a.units += qty; a.lines += 1;
      done.units += qty; done.lines += 1;
      if (st === STATUS.FAIL) { a.fail += qty; done.fail += qty; }
      else                    { a.pass += qty; done.pass += qty; }
      if (mins > 0) { a.minutes += mins; a.timed  += 1; done.minutes += mins; done.timed  += 1; }
      if (turn > 0) { a.turn    += turn; a.turned += 1; done.turn    += turn; done.turned += 1; }
      return true;
    });

    const techs = Object.keys(agg).map(k => {
      const a = agg[k];
      a.avgMinutes    = a.timed  ? Math.round(a.minutes / a.timed)  : 0;
      a.avgTurnaround = a.turned ? Math.round(a.turn / a.turned)    : 0;
      a.passRate      = a.units  ? Math.round((a.pass / a.units) * 100) : 0;
      return a;
    }).sort((x, y) => y.units - x.units);

    return {
      ok: true, range: range, open: open, techs: techs, hasTurnaround: HAS.turnaround,
      done: {
        units: done.units, pass: done.pass, fail: done.fail, lines: done.lines,
        passRate: done.units ? Math.round((done.pass / done.units) * 100) : 0,
        avgMinutes: done.timed ? Math.round(done.minutes / done.timed) : 0,
        avgTurnaround: done.turned ? Math.round(done.turn / done.turned) : 0
      }
    };
  }

  /* ================================================================== */
  /* Write — add to queue                                               */
  /* ================================================================== */

  function doAdd(body) {
    const lines = body.lines || [];
    if (!lines.length) return { ok: false, error: 'Nothing to add.' };

    const now = new Date();
    const act = testActivityId();
    const saved = [];
    const failed = [];

    lines.forEach(line => {
      try {
        if (!line.itemId) throw new Error('No item on this line.');
        const rec = record.create({ type: REC, isDynamic: false });
        rec.setValue({ fieldId: F.item,   value: line.itemId });
        rec.setValue({ fieldId: F.qty,    value: parseInt(line.qty, 10) || 1 });
        rec.setValue({ fieldId: F.status, value: STATUS.PENDING });
        rec.setValue({ fieldId: F.queued, value: now });
        if (act)         rec.setValue({ fieldId: F.activity, value: act });
        if (line.serial) rec.setValue({ fieldId: F.serial, value: String(line.serial).trim() });
        if (line.notes)  rec.setValue({ fieldId: F.notes,  value: String(line.notes).slice(0, NOTES_MAX) });
        if (line.techId) rec.setValue({ fieldId: F.tech,   value: line.techId });
        if (HAS.source && line.source) rec.setValue({ fieldId: F.source, value: String(line.source).trim() });
        if (HAS.rush   && line.rush)   rec.setValue({ fieldId: F.rush,   value: true });
        saved.push(rec.save({ ignoreMandatoryFields: true }));
      } catch (e) {
        log.error({ title: 'Test queue add failed', details: e });
        failed.push({ label: line.serial || line.itemText || 'line', error: (e.message || String(e)) });
      }
    });

    return { ok: true, saved: saved, failed: failed };
  }

  /* ================================================================== */
  /* Write — save grid edits                                            */
  /* ================================================================== */

  function doSave(body) {
    const edits = body.edits || [];
    if (!edits.length) return { ok: false, error: 'Nothing to save.' };

    const ids = edits.map(e => String(e.id));
    const current = {};

    search.create({
      type: REC,
      filters: [['internalid', 'anyof', ids]],
      columns: [F.status, F.started, F.completed, F.queued, F.tech]
    }).run().each(r => {
      current[r.id] = {
        status:    statusOf(r),
        started:   r.getValue(F.started) || '',
        completed: r.getValue(F.completed) || '',
        queued:    r.getValue(F.queued) || '',
        tech:      r.getValue(F.tech) || ''
      };
      return true;
    });

    const now = new Date();
    const act = testActivityId();
    const me  = runtime.getCurrentUser().id;
    const saved = [];
    const failed = [];

    edits.forEach(e => {
      try {
        const cur = current[String(e.id)];
        if (!cur) throw new Error('Record no longer exists.');

        const values = {};

        if (typeof e.notes === 'string')  values[F.notes] = e.notes.slice(0, NOTES_MAX);
        if (e.techId !== undefined)       values[F.tech]  = e.techId || '';
        if (e.qty !== undefined) {
          const q = parseInt(e.qty, 10);
          if (!q || q < 1) throw new Error('Quantity must be 1 or more.');
          values[F.qty] = q;
        }

        if (e.status !== undefined && e.status !== cur.status) {
          if (ALL_STATUSES.indexOf(e.status) === -1) throw new Error('Unknown status "' + e.status + '".');
          values[F.status] = e.status;

          const wasDone = DONE_STATUSES.indexOf(cur.status) > -1;
          const isDone  = DONE_STATUSES.indexOf(e.status) > -1;

          if (e.status === STATUS.TESTING && !cur.started) values[F.started] = now;

          if (isDone) {
            values[F.completed] = now;

            const queuedAt  = toDate(cur.queued);
            const startedAt = toDate(cur.started) || (values[F.started] || null);
            const turnaround = queuedAt ? minutesBetween(queuedAt, now) : 0;

            // Bench time. If nobody pressed Start, fall back to the full span so
            // the number is never blank.
            values[F.minutes] = startedAt ? minutesBetween(startedAt, now) : turnaround;

            if (HAS.turnaround && queuedAt) values[F.turnaround] = turnaround;
            if (act) values[F.activity] = act;   // keep legacy rows tagged correctly
          }
          if (wasDone && !isDone) {              // re-opened — drop the finish stamps
            values[F.completed] = '';
            values[F.minutes]   = '';
            if (HAS.turnaround) values[F.turnaround] = '';
          }
          if (e.status === STATUS.PENDING) {     // back on the shelf — drop the clock
            values[F.started] = '';
          }

          // Whoever moves it off Pending owns it, unless it is already assigned
          // or the person explicitly picked someone in the grid.
          if (me && !cur.tech && !values[F.tech] && e.status !== STATUS.PENDING) {
            values[F.tech] = me;
          }
        }

        if (!Object.keys(values).length) return;

        record.submitFields({
          type: REC, id: e.id, values: values,
          options: { enableSourcing: false, ignoreMandatoryFields: true }
        });
        saved.push(e.id);

      } catch (err) {
        log.error({ title: 'Test queue save failed for ' + e.id, details: err });
        failed.push({ id: e.id, label: e.label || e.id, error: (err.message || String(err)) });
      }
    });

    return { ok: true, saved: saved, failed: failed };
  }

  /* ================================================================== */
  /* Write — split a batch on close-out                                 */
  /* ================================================================== */

  /**
   * Close out part of a non-serialized batch. The row splits into finished
   * rows plus whatever is left, which stays open with its original queued
   * date so its age keeps counting.
   */
  function doSplit(body) {
    const pass = parseInt(body.pass, 10) || 0;
    const fail = parseInt(body.fail, 10) || 0;
    if (pass < 0 || fail < 0)  return { ok: false, error: 'Quantities cannot be negative.' };
    if (pass + fail === 0)     return { ok: false, error: 'Enter how many passed or failed.' };

    const src = record.load({ type: REC, id: body.id, isDynamic: false });
    const qty = parseInt(src.getValue({ fieldId: F.qty }), 10) || 1;
    if (pass + fail > qty) {
      return { ok: false, error: 'That is ' + (pass + fail) + ' units out of ' + qty + '.' };
    }

    const now       = new Date();
    const remaining = qty - pass - fail;
    const me        = runtime.getCurrentUser().id;
    const act       = testActivityId();

    const queuedAt  = src.getValue({ fieldId: F.queued })  || null;
    const startedAt = src.getValue({ fieldId: F.started }) || null;
    const tech      = src.getValue({ fieldId: F.tech }) || me || '';

    const benchMins = startedAt ? minutesBetween(startedAt, now)
                                : (queuedAt ? minutesBetween(queuedAt, now) : 0);
    const turnMins  = queuedAt ? minutesBetween(queuedAt, now) : 0;

    const carry = {};
    carry[F.item]   = src.getValue({ fieldId: F.item });
    carry[F.serial] = src.getValue({ fieldId: F.serial }) || '';
    carry[F.notes]  = body.notes ? String(body.notes).slice(0, NOTES_MAX)
                                 : (src.getValue({ fieldId: F.notes }) || '');
    if (HAS.source) carry[F.source] = src.getValue({ fieldId: F.source }) || '';
    if (HAS.rush)   carry[F.rush]   = src.getValue({ fieldId: F.rush }) === true;

    const outcomes = [];
    if (pass > 0) outcomes.push({ status: STATUS.PASS, qty: pass });
    if (fail > 0) outcomes.push({ status: STATUS.FAIL, qty: fail });

    function stampDone(rec, outcome) {
      rec.setValue({ fieldId: F.status,    value: outcome.status });
      rec.setValue({ fieldId: F.qty,       value: outcome.qty });
      rec.setValue({ fieldId: F.completed, value: now });
      rec.setValue({ fieldId: F.minutes,   value: benchMins });
      if (HAS.turnaround) rec.setValue({ fieldId: F.turnaround, value: turnMins });
      if (queuedAt)  rec.setValue({ fieldId: F.queued,  value: queuedAt });
      if (startedAt) rec.setValue({ fieldId: F.started, value: startedAt });
      if (tech) rec.setValue({ fieldId: F.tech, value: tech });
      if (act)  rec.setValue({ fieldId: F.activity, value: act });
    }

    const created = [];
    let startIndex = 0;

    if (remaining > 0) {
      // The original keeps its identity and its age, just fewer units.
      src.setValue({ fieldId: F.qty, value: remaining });
      src.save({ ignoreMandatoryFields: true });
    } else {
      // Nothing left over — the original becomes the first outcome.
      stampDone(src, outcomes[0]);
      src.save({ ignoreMandatoryFields: true });
      startIndex = 1;
    }

    for (let i = startIndex; i < outcomes.length; i++) {
      const rec = record.create({ type: REC, isDynamic: false });
      Object.keys(carry).forEach(k => rec.setValue({ fieldId: k, value: carry[k] }));
      stampDone(rec, outcomes[i]);
      created.push(rec.save({ ignoreMandatoryFields: true }));
    }

    return { ok: true, created: created, remaining: remaining, pass: pass, fail: fail };
  }

  function doRemove(body) {
    const ids = body.ids || [];
    if (!ids.length) return { ok: false, error: 'Nothing to remove.' };
    const removed = [];
    const failed = [];
    ids.forEach(id => {
      try { record.delete({ type: REC, id: id }); removed.push(id); }
      catch (e) {
        log.error({ title: 'Test queue delete failed for ' + id, details: e });
        failed.push({ id: id, error: (e.message || String(e)) });
      }
    });
    return { ok: true, removed: removed, failed: failed };
  }

  /* ================================================================== */
  /* Lookups                                                            */
  /* ================================================================== */

  function findSerial(serial) {
    const rs = search.create({
      type: 'inventorynumber',
      filters: [['inventorynumber', 'is', serial]],
      columns: [
        'internalid', 'item',
        search.createColumn({ name: 'itemid', join: 'item' }),
        search.createColumn({ name: 'displayname', join: 'item' }),
        'location'
      ]
    }).run().getRange({ start: 0, end: 1 });

    if (!rs.length) return null;
    const r = rs[0];
    return {
      serial:   serial,
      itemId:   r.getValue('item'),
      itemText: r.getValue({ name: 'itemid', join: 'item' }),
      itemName: r.getValue({ name: 'displayname', join: 'item' }),
      location: r.getText('location') || ''
    };
  }

  function findItems(partNo) {
    const cols = ['internalid', 'itemid', 'displayname'];
    const exact = search.create({
      type: search.Type.ITEM,
      filters: [['itemid', 'is', partNo], 'AND', ['isinactive', 'is', 'F']],
      columns: cols
    }).run().getRange({ start: 0, end: 5 });

    const rows = exact.length ? exact : search.create({
      type: search.Type.ITEM,
      filters: [['itemid', 'contains', partNo], 'AND', ['isinactive', 'is', 'F']],
      columns: cols
    }).run().getRange({ start: 0, end: 15 });

    return rows.map(r => ({
      itemId:   r.getValue('internalid'),
      itemText: r.getValue('itemid'),
      itemName: r.getValue('displayname')
    }));
  }

  /** Is this serial already sitting open in the test queue? */
  function openRowForSerial(serial) {
    const rs = search.create({
      type: REC,
      filters: andThen(andThen(baseFilters(), [F.serial, 'is', serial]), statusAnyOf(OPEN_STATUSES)),
      columns: ['internalid', F.status, F.tech, F.completed]
    }).run().getRange({ start: 0, end: 1 });
    if (!rs.length) return null;
    return {
      id: rs[0].getValue('internalid'),
      status: statusOf(rs[0]),
      tech: rs[0].getText(F.tech) || ''
    };
  }

  function doLookup(body) {
    const q = (body.query || '').trim();
    if (!q) return { ok: false, error: 'Nothing to look up.' };

    if (body.mode === 'serial') {
      const hit = findSerial(q);
      if (!hit) return { ok: false, error: 'Serial ' + q + ' is not in NetSuite.' };
      hit.alreadyQueued = openRowForSerial(q);
      return { ok: true, kind: 'serial', data: hit };
    }

    const items = findItems(q);
    if (!items.length) return { ok: false, error: 'No active item matches "' + q + '".' };
    return { ok: true, kind: 'item', data: items };
  }

  function getTechnicians() {
    const filters = [['isinactive', 'is', 'F']];
    if (TECH_DEPARTMENTS.length) filters.push('AND', ['department', 'anyof', TECH_DEPARTMENTS]);
    return search.create({
      type: search.Type.EMPLOYEE,
      filters: filters,
      columns: ['internalid', search.createColumn({ name: 'entityid', sort: search.Sort.ASC })]
    }).run().getRange({ start: 0, end: 1000 }).map(r => ({
      id: r.getValue('internalid'),
      name: r.getValue('entityid')
    }));
  }

  /* ================================================================== */
  /* UI                                                                 */
  /* ================================================================== */

  function renderPage(ctx) {
    const form = serverWidget.createForm({ title: 'Testing Department', hideNavBar: false });

    const fld = form.addField({
      id: 'custpage_tq',
      type: serverWidget.FieldType.INLINEHTML,
      label: ' '
    });

    const boot = {
      url: url.resolveScript({
        scriptId: runtime.getCurrentScript().id,
        deploymentId: runtime.getCurrentScript().deploymentId,
        returnExternalUrl: false
      }),
      techs: getTechnicians(),
      me: runtime.getCurrentUser().id,
      statuses: { open: OPEN_STATUSES, done: DONE_STATUSES, all: ALL_STATUSES, map: STATUS },
      has: HAS,
      activityOk: !!testActivityId(),
      view: ctx.request.parameters.view || 'queue'
    };

    fld.defaultValue = css() + html(boot);
    ctx.response.writePage(form);
  }

  function css() {
    return `
<style>
  .tq { --ink:#10151c; --paper:#fff; --line:#d8dee7; --hair:#eef1f5; --muted:#5d6b7d;
        --wash:#f2f5f9; --hi:#1866c2; --go:#0f7b3d; --stop:#b3261e; --warn:#8a5a00;
        --amber:#fff6e0; --dirty:#fffbe6;
        font-family:'Inter','Segoe UI',Arial,sans-serif; color:var(--ink); max-width:1500px; }
  .tq *,.tq *::before,.tq *::after { box-sizing:border-box; }

  .tq-tabs { display:flex; gap:2px; border-bottom:2px solid var(--line); margin-bottom:18px; }
  .tq-tabs button { padding:11px 20px; font:inherit; font-size:14px; font-weight:600;
                    background:none; border:0; border-bottom:3px solid transparent;
                    margin-bottom:-2px; color:var(--muted); cursor:pointer; }
  .tq-tabs button[aria-selected="true"] { color:var(--ink); border-bottom-color:var(--ink); }

  .tq-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:18px; }
  @media (max-width:1000px){ .tq-kpis{ grid-template-columns:repeat(2,1fr); } }
  .tq-kpi { background:var(--wash); border-radius:9px; padding:14px 16px; }
  .tq-kpi .n { font-size:28px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
  .tq-kpi .l { font-size:10px; font-weight:700; letter-spacing:.09em; text-transform:uppercase;
               color:var(--muted); margin-top:6px; }
  .tq-kpi .s { font-size:11px; color:var(--muted); margin-top:3px; }
  .tq-kpi.hot .n { color:var(--stop); }

  .tq-card { background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:16px; }

  .tq-bar { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; margin-bottom:14px; }
  .tq-bar .grow { flex:1; min-width:180px; }
  .tq-lab { display:block; font-size:10px; font-weight:700; letter-spacing:.09em;
            text-transform:uppercase; color:var(--muted); margin:0 0 5px; }
  .tq-in, .tq-sel { padding:9px 11px; font-size:14px; font-family:inherit; width:100%;
                    border:1px solid var(--line); border-radius:6px; background:var(--paper); color:var(--ink); }
  .tq-in:focus, .tq-sel:focus { outline:3px solid rgba(24,102,194,.3); border-color:var(--hi); }
  .tq-in:disabled { background:#f0f2f5; color:var(--muted); }
  .tq-scan { font-size:20px; font-weight:700; letter-spacing:.03em;
             font-family:'SF Mono',Consolas,monospace; padding:12px; }

  .tq-btn { padding:9px 15px; font:inherit; font-size:13px; font-weight:700; border:1px solid var(--line);
            border-radius:6px; background:var(--paper); color:var(--ink); cursor:pointer; white-space:nowrap; }
  .tq-btn:hover:not(:disabled) { background:var(--wash); }
  .tq-btn:disabled { opacity:.45; cursor:not-allowed; }
  .tq-btn.primary { background:var(--ink); color:#fff; border-color:var(--ink); }
  .tq-btn.primary:hover:not(:disabled) { filter:brightness(1.25); background:var(--ink); }
  .tq-btn.pass { border-color:var(--go); color:var(--go); }
  .tq-btn.pass:hover:not(:disabled) { background:#e6f4ec; }
  .tq-btn.fail { border-color:var(--stop); color:var(--stop); }
  .tq-btn.fail:hover:not(:disabled) { background:#fdecea; }
  .tq-btn.save { background:var(--go); border-color:var(--go); color:#fff; }
  .tq-btn.save:hover:not(:disabled) { filter:brightness(1.1); background:var(--go); }
  .tq-link { background:none; border:0; color:var(--hi); font:inherit; font-size:13px;
             cursor:pointer; padding:0; text-decoration:underline; }

  .tq-msg { margin:12px 0 0; padding:11px 13px; border-radius:6px; font-size:13px; line-height:1.45; display:none; }
  .tq-msg[data-kind="ok"]   { display:block; background:#e6f4ec; color:var(--go);  border-left:4px solid var(--go); }
  .tq-msg[data-kind="err"]  { display:block; background:#fdecea; color:var(--stop); border-left:4px solid var(--stop); }
  .tq-msg[data-kind="warn"] { display:block; background:var(--amber); color:var(--warn); border-left:4px solid #d99000; }

  .tq-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 12px;
                background:var(--wash); border:1px solid var(--line); border-bottom:0;
                border-radius:9px 9px 0 0; font-size:13px; }
  .tq-actions .count { font-weight:700; margin-right:4px; }
  .tq-actions .spacer { flex:1; }

  .tq-wrap { border:1px solid var(--line); border-radius:0 0 9px 9px; overflow:auto; max-height:66vh; }
  .tq-grid { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
  .tq-grid th { position:sticky; top:0; z-index:2; background:var(--paper); text-align:left;
                font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted);
                padding:9px 10px; border-bottom:2px solid var(--line); white-space:nowrap; }
  .tq-grid td { padding:0; border-bottom:1px solid var(--hair); vertical-align:middle; }
  .tq-grid td .pad { padding:8px 10px; }
  .tq-grid tr.sel td { background:#f0f7ff; }
  .tq-grid tr.dirty td { background:var(--dirty); }
  .tq-grid tr.rush td:first-child { box-shadow:inset 3px 0 0 var(--stop); }
  .tq-grid tr.flash td { animation:tqflash 1.2s ease-out; }
  @keyframes tqflash { from { background:#fff3bf; } to { background:transparent; } }
  .tq-grid .mono { font-family:'SF Mono',Consolas,monospace; }
  .tq-grid .num { text-align:right; font-variant-numeric:tabular-nums; }
  .tq-grid .dim { color:var(--muted); }
  .tq-desc { display:block; font-size:11px; color:var(--muted); margin-top:2px;
             max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .tq-mask { position:fixed; inset:0; background:rgba(16,21,28,.45); z-index:900;
             display:none; align-items:center; justify-content:center; }
  .tq-mask.open { display:flex; }
  .tq-modal { background:var(--paper); border-radius:12px; padding:22px; width:420px;
              max-width:92vw; box-shadow:0 20px 50px rgba(16,21,28,.3); }
  .tq-modal h3 { margin:0 0 4px; font-size:17px; }
  .tq-modal .sub { font-size:13px; color:var(--muted); margin-bottom:16px; }
  .tq-modal .split { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .tq-modal .rem { margin:14px 0 4px; padding:10px 12px; background:var(--wash);
                   border-radius:6px; font-size:13px; }
  .tq-modal .foot { display:flex; gap:8px; justify-content:flex-end; margin-top:18px; }

  .tq-cell { width:100%; border:0; background:transparent; font:inherit; font-size:13px;
             color:inherit; padding:8px 10px; }
  .tq-cell:focus { outline:2px solid var(--hi); outline-offset:-2px; background:var(--paper); }
  select.tq-cell { cursor:pointer; }
  .tq-cell.qty { text-align:right; font-variant-numeric:tabular-nums; width:64px; }

  .tq-pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
  .tq-pill.pass { background:#e6f4ec; color:var(--go); }
  .tq-pill.fail { background:#fdecea; color:var(--stop); }
  .tq-age { font-variant-numeric:tabular-nums; font-weight:700; font-size:12px; }
  .tq-age.warn { color:var(--warn); }
  .tq-age.bad  { color:var(--stop); }

  .tq-empty { padding:44px 12px; text-align:center; color:var(--muted); font-size:14px; }
  .tq-foot { display:flex; align-items:center; gap:12px; margin-top:12px; font-size:12px; color:var(--muted); }
  .tq-drawer { display:none; }
  .tq-drawer.open { display:block; }
  .tq-found { margin-top:10px; padding:10px 12px; background:var(--wash); border-radius:6px;
              font-size:13px; display:none; }
  .tq-found b { font-family:'SF Mono',Consolas,monospace; }
</style>`;
  }

  function html(boot) {
    const techOpts = boot.techs.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    const meOpts = boot.techs.map(t =>
      `<option value="${esc(t.id)}"${String(t.id) === String(boot.me) ? ' selected' : ''}>${esc(t.name)}</option>`).join('');

    const activityWarning = boot.activityOk ? '' : `
  <div class="tq-msg" data-kind="warn" style="display:block; margin-bottom:16px;">
    No value containing "test" was found on the RSL Activity list, so this screen is showing
    every activity — refurb rows included. Add a Test value to the list, or set
    TEST_ACTIVITY_ID at the top of the script.
  </div>`;

    return `
<div class="tq">
${activityWarning}
  <div class="tq-tabs" id="tqTabs">
    <button type="button" data-view="queue"      aria-selected="true">Queue</button>
    <button type="button" data-view="completed"  aria-selected="false">Completed</button>
    <button type="button" data-view="throughput" aria-selected="false">Throughput</button>
  </div>

  <div class="tq-kpis" id="tqKpis"></div>

  <div id="tqGridView">

    <div class="tq-card" style="margin-bottom:16px;">
      <div class="tq-bar" style="margin-bottom:0;">
        <div style="width:150px;">
          <span class="tq-lab">Add work</span>
          <button type="button" class="tq-btn" id="tqAddToggle">Add to queue</button>
        </div>
        <div class="grow"></div>
        <div style="width:200px;">
          <label class="tq-lab" for="tqQ">Find</label>
          <input id="tqQ" class="tq-in" placeholder="Serial, part${boot.has.source ? ', PO' : ''}…" autocomplete="off">
        </div>
        <div style="width:150px;">
          <label class="tq-lab" for="tqStatus">Status</label>
          <select id="tqStatus" class="tq-sel"><option value="">All</option></select>
        </div>
        <div style="width:170px;">
          <label class="tq-lab" for="tqTechFilter">Technician</label>
          <select id="tqTechFilter" class="tq-sel"><option value="">Everyone</option>${techOpts}</select>
        </div>
        <div style="width:150px;" id="tqRangeWrap">
          <label class="tq-lab" for="tqRange">Period</label>
          <select id="tqRange" class="tq-sel">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="thisweek" selected>This week</option>
            <option value="lastweek">Last week</option>
            <option value="thismonth">This month</option>
            <option value="lastmonth">Last month</option>
          </select>
        </div>
        <button type="button" class="tq-btn" id="tqRefresh">Refresh</button>
      </div>

      <div class="tq-drawer" id="tqAddDrawer" style="margin-top:16px; border-top:1px solid var(--hair); padding-top:16px;">
        <div class="tq-bar">
          <div style="width:200px;">
            <label class="tq-lab" for="tqMode">Entering by</label>
            <select id="tqMode" class="tq-sel">
              <option value="serial">Serial number</option>
              <option value="item">Part number + quantity</option>
            </select>
          </div>
          <div class="grow">
            <label class="tq-lab" for="tqScan">Scan or type</label>
            <input id="tqScan" class="tq-in tq-scan" autocomplete="off" spellcheck="false" placeholder="Scan…">
          </div>
          <div style="width:100px;">
            <label class="tq-lab" for="tqQty">Quantity</label>
            <input id="tqQty" class="tq-in" type="number" min="1" step="1" value="1" disabled>
          </div>
          ${boot.has.source ? `
          <div style="width:160px;">
            <label class="tq-lab" for="tqSource">Source (PO / RMA)</label>
            <input id="tqSource" class="tq-in" autocomplete="off" placeholder="Optional">
          </div>` : ''}
          <div style="width:170px;">
            <label class="tq-lab" for="tqAssign">Assign to</label>
            <select id="tqAssign" class="tq-sel"><option value="">Unassigned</option>${meOpts}</select>
          </div>
          ${boot.has.rush ? `
          <div style="width:70px;">
            <label class="tq-lab" for="tqRush">Rush</label>
            <input id="tqRush" type="checkbox" style="width:20px; height:20px; margin:8px 0;">
          </div>` : ''}
          <button type="button" class="tq-btn primary" id="tqAdd">Add</button>
        </div>
        <div id="tqFound" class="tq-found"></div>
        <div id="tqPickWrap" style="display:none; max-width:520px; margin-top:10px;">
          <label class="tq-lab" for="tqPick">Which item</label>
          <select id="tqPick" class="tq-sel"></select>
        </div>
        <div id="tqAddMsg" class="tq-msg"></div>
      </div>
    </div>

    <div class="tq-actions">
      <span class="count" id="tqSelCount">Nothing selected</span>
      <button type="button" class="tq-btn" id="tqStart">Start testing</button>
      <button type="button" class="tq-btn pass" id="tqPass">Mark passed</button>
      <button type="button" class="tq-btn fail" id="tqFail">Mark failed</button>
      <button type="button" class="tq-btn" id="tqHold">Put on hold</button>
      <button type="button" class="tq-btn" id="tqSplit" title="Close out part of a batch">Close out part…</button>
      <select id="tqAssignSel" class="tq-sel" style="width:auto;">
        <option value="">Assign to…</option>${meOpts}
      </select>
      <button type="button" class="tq-btn" id="tqDelete">Delete</button>
      <span class="spacer"></span>
      <button type="button" class="tq-btn" id="tqExport">Export CSV</button>
      <button type="button" class="tq-btn" id="tqRevert" disabled>Discard changes</button>
      <button type="button" class="tq-btn save" id="tqSave" disabled>Save</button>
    </div>

    <div class="tq-wrap" id="tqWrap"><div class="tq-empty">Loading…</div></div>

    <div class="tq-foot">
      <span id="tqCount"></span>
      <button class="tq-link" id="tqMore" style="display:none;">Load more</button>
      <span style="margin-left:auto;">Enter moves down · Ctrl+D copies the cell above · Ctrl+S saves</span>
    </div>

    <div id="tqMsg" class="tq-msg"></div>
  </div>

  <div id="tqThroughputView" style="display:none;">
    <div class="tq-card">
      <div class="tq-bar">
        <div style="width:180px;">
          <label class="tq-lab" for="tqTRange">Period</label>
          <select id="tqTRange" class="tq-sel">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="thisweek" selected>This week</option>
            <option value="lastweek">Last week</option>
            <option value="thismonth">This month</option>
            <option value="lastmonth">Last month</option>
          </select>
        </div>
      </div>
      <div id="tqTOut"><div class="tq-empty">Loading…</div></div>
    </div>
  </div>
  <div class="tq-mask" id="tqSplitMask">
    <div class="tq-modal">
      <h3>Close out part of this batch</h3>
      <div class="sub" id="tqSplitWhat"></div>
      <div class="split">
        <div>
          <label class="tq-lab" for="tqSplitPass">Passed</label>
          <input id="tqSplitPass" class="tq-in" type="number" min="0" step="1" value="0">
        </div>
        <div>
          <label class="tq-lab" for="tqSplitFail">Failed</label>
          <input id="tqSplitFail" class="tq-in" type="number" min="0" step="1" value="0">
        </div>
      </div>
      <div style="margin-top:12px;">
        <label class="tq-lab" for="tqSplitNotes">Notes on the units you are closing</label>
        <input id="tqSplitNotes" class="tq-in" maxlength="300" placeholder="Optional">
      </div>
      <div class="rem" id="tqSplitRem"></div>
      <div id="tqSplitMsg" class="tq-msg"></div>
      <div class="foot">
        <button type="button" class="tq-btn" id="tqSplitCancel">Cancel</button>
        <button type="button" class="tq-btn primary" id="tqSplitGo">Close out</button>
      </div>
    </div>
  </div>

</div>

<script>
(function(){
  var CFG = ${JSON.stringify({ url: boot.url, statuses: boot.statuses, techs: boot.techs, me: boot.me, has: boot.has })};
  var ST = CFG.statuses.map;

  var S = {
    view:'queue', rows:[], edits:{}, sel:{}, page:0, total:0, hasMore:false,
    pending:null, lastAdd:[], busy:false
  };

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function post(payload){
    return fetch(CFG.url, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload) }).then(function(r){ return r.json(); });
  }

  function say(el, kind, text){
    var m = $(el);
    if(!text){ m.removeAttribute('data-kind'); m.innerHTML=''; return; }
    m.setAttribute('data-kind', kind); m.innerHTML = text;
  }

  function range(){ return $('tqRange').value; }

  /* ---------------- KPIs ---------------- */

  function loadMetrics(){
    post({ action:'metrics', range: S.view === 'throughput' ? $('tqTRange').value : range() })
      .then(function(res){
        if(!res.ok) return;
        renderKpis(res);
        if(S.view === 'throughput') renderThroughput(res);
      });
  }

  function renderKpis(m){
    var oldest = m.open.oldest;
    $('tqKpis').innerHTML =
      kpi(m.open.pending, 'Waiting to test', m.open.lines + ' open lines') +
      kpi(m.open.testing, 'On the bench now', m.open.hold ? m.open.hold + ' on hold' : '') +
      kpi(m.done.units, 'Tested this period', m.done.pass + ' passed · ' + m.done.fail + ' failed') +
      kpi(m.done.passRate + '%', 'Pass rate', m.done.lines + ' lines closed') +
      kpi(oldest === null ? '—' : oldest + 'd', 'Oldest still waiting',
          m.done.avgMinutes
            ? fmtMins(m.done.avgMinutes) + ' average on the bench' +
              (m.done.avgTurnaround ? ' · ' + fmtMins(m.done.avgTurnaround) + ' door to door' : '')
            : '',
          (oldest !== null && oldest >= 7) ? ' hot' : '');
  }

  function kpi(n, l, s, cls){
    return '<div class="tq-kpi' + (cls||'') + '"><div class="n">' + esc(n) + '</div>' +
           '<div class="l">' + esc(l) + '</div>' +
           (s ? '<div class="s">' + esc(s) + '</div>' : '') + '</div>';
  }

  /* ---------------- grid ---------------- */

  var COLS = {
    queue: ['check','age','item','serial','qty','status','tech','notes','source','queuedAt']
             .filter(function(c){ return c !== 'source' || CFG.has.source; }),
    completed: ['check','result','item','serial','qty','tech','minutes','turnaround','completed','notes']
             .filter(function(c){ return c !== 'turnaround' || CFG.has.turnaround; })
  };

  var HEAD = {
    check:'', age:'Age', item:'Item', serial:'Serial', qty:'Qty', status:'Status',
    result:'Result', tech:'Technician', notes:'Notes', source:'Source',
    queuedAt:'Queued', minutes:'On bench', turnaround:'Turnaround', completed:'Completed'
  };

  /** 47 → "47m", 190 → "3h 10m", 2900 → "2d 0h" */
  function fmtMins(n){
    n = Number(n || 0);
    if(!n) return '—';
    if(n < 60) return n + 'm';
    var h = Math.floor(n / 60), m = n % 60;
    if(h < 24) return h + 'h' + (m ? ' ' + m + 'm' : '');
    var d = Math.floor(h / 24);
    return d + 'd' + (h % 24 ? ' ' + (h % 24) + 'h' : '');
  }

  function statusOptions(current){
    return CFG.statuses.all.map(function(s){
      return '<option value="'+esc(s)+'"'+(s===current?' selected':'')+'>'+esc(s)+'</option>';
    }).join('');
  }

  function techOptions(current){
    return '<option value="">—</option>' + CFG.techs.map(function(t){
      return '<option value="'+esc(t.id)+'"'+(String(t.id)===String(current)?' selected':'')+'>'+esc(t.name)+'</option>';
    }).join('');
  }

  function val(row, field){
    var e = S.edits[row.id];
    return (e && e[field] !== undefined) ? e[field] : row[field];
  }

  function renderGrid(){
    var cols = COLS[S.view];
    if(!S.rows.length){
      $('tqWrap').innerHTML = '<div class="tq-empty">' +
        (S.view === 'queue'
          ? 'Nothing waiting. Add work with the button above, or clear the filters.'
          : 'Nothing was closed out in this period.') + '</div>';
      updateBars();
      return;
    }

    var h = '<table class="tq-grid"><thead><tr>';
    cols.forEach(function(c){
      h += '<th' + (c==='check' ? ' style="width:34px;"' : '') + '>' +
           (c==='check' ? '<input type="checkbox" id="tqAll">' : esc(HEAD[c])) + '</th>';
    });
    h += '</tr></thead><tbody>';

    S.rows.forEach(function(r){
      var cls = (S.sel[r.id] ? 'sel ' : '') + (S.edits[r.id] ? 'dirty ' : '') + (r.rush ? 'rush' : '');
      h += '<tr data-id="'+esc(r.id)+'" class="'+cls.trim()+'">';
      cols.forEach(function(c){ h += cell(r, c); });
      h += '</tr>';
    });

    $('tqWrap').innerHTML = h + '</tbody></table>';
    updateBars();
  }

  function cell(r, c){
    switch(c){
      case 'check':
        return '<td><div class="pad"><input type="checkbox" class="tq-ck" data-id="'+esc(r.id)+'"'+
               (S.sel[r.id]?' checked':'')+'></div></td>';
      case 'age':
        var a = r.age;
        var k = a === null ? '' : (a >= 7 ? ' bad' : (a >= 3 ? ' warn' : ''));
        return '<td><div class="pad"><span class="tq-age'+k+'">'+(a===null?'—':a+'d')+'</span>'+
               (r.rush?' <span class="tq-pill fail">RUSH</span>':'')+'</div></td>';
      case 'item':
        return '<td><div class="pad"><span class="mono">'+esc(r.item)+'</span>'+
               (r.desc ? '<span class="tq-desc" title="'+esc(r.desc)+'">'+esc(r.desc)+'</span>' : '')+
               '</div></td>';
      case 'serial':
        return '<td><div class="pad mono">'+esc(r.serial || '—')+'</div></td>';
      case 'source':
        return '<td><div class="pad dim">'+esc(r.source || '—')+'</div></td>';
      case 'queuedAt':
        return '<td><div class="pad dim">'+esc(r.queuedAt || '—')+'</div></td>';
      case 'completed':
        return '<td><div class="pad dim">'+esc(r.completed || '—')+'</div></td>';
      case 'minutes':
        return '<td class="num"><div class="pad">'+fmtMins(r.minutes)+'</div></td>';
      case 'turnaround':
        return '<td class="num"><div class="pad dim">'+fmtMins(r.turnaround)+'</div></td>';
      case 'result':
        var st = val(r,'status');
        return '<td><div class="pad"><span class="tq-pill '+(st===ST.FAIL?'fail':'pass')+'">'+esc(st)+'</span></div></td>';
      case 'qty':
        return '<td class="num"><input class="tq-cell qty" type="number" min="1" step="1" data-f="qty" value="'+
               esc(val(r,'qty'))+'"></td>';
      case 'status':
        return '<td><select class="tq-cell" data-f="status">'+statusOptions(val(r,'status'))+'</select></td>';
      case 'tech':
        return '<td><select class="tq-cell" data-f="techId">'+techOptions(val(r,'techId'))+'</select></td>';
      case 'notes':
        return '<td><input class="tq-cell" data-f="notes" maxlength="300" value="'+esc(val(r,'notes'))+'" placeholder="—"></td>';
      default:
        return '<td></td>';
    }
  }

  function rowById(id){
    for(var i=0;i<S.rows.length;i++){ if(String(S.rows[i].id)===String(id)) return S.rows[i]; }
    return null;
  }

  function setEdit(id, field, value){
    var r = rowById(id);
    if(!r) return;
    var e = S.edits[id] || (S.edits[id] = {});
    if(String(r[field]) === String(value)){
      delete e[field];
      if(!Object.keys(e).length) delete S.edits[id];
    } else {
      e[field] = value;
    }
    var tr = $('tqWrap').querySelector('tr[data-id="'+id+'"]');
    if(tr) tr.classList.toggle('dirty', !!S.edits[id]);
    updateBars();
  }

  function updateBars(){
    var dirty = Object.keys(S.edits).length;
    var sel = Object.keys(S.sel).length;
    $('tqSave').disabled = !dirty;
    $('tqSave').textContent = dirty ? 'Save ' + dirty + (dirty===1?' change':' changes') : 'Save';
    $('tqRevert').disabled = !dirty;
    $('tqSelCount').textContent = sel ? sel + (sel===1?' row selected':' rows selected') : 'Nothing selected';
    ['tqStart','tqPass','tqFail','tqHold','tqDelete'].forEach(function(b){ $(b).disabled = !sel; });
    $('tqSplit').disabled = sel !== 1;
    $('tqAssignSel').disabled = !sel;
    $('tqCount').textContent = S.total ? 'Showing ' + S.rows.length + ' of ' + S.total : '';
    $('tqMore').style.display = S.hasMore ? 'inline' : 'none';
  }

  function applyToSelected(field, value){
    var ids = Object.keys(S.sel);
    if(!ids.length) return;
    ids.forEach(function(id){ setEdit(id, field, value); });
    renderGrid();
    say('tqMsg','ok', ids.length + (ids.length===1?' row':' rows') +
        ' set — press Save to write it to NetSuite.');
  }

  /* ---------------- load / save ---------------- */

  function load(reset){
    if(reset){ S.page = 0; S.rows = []; S.edits = {}; S.sel = {}; }
    S.busy = true;
    post({
      action:'list', view: S.view, page: S.page,
      q: $('tqQ').value.trim(), techId: $('tqTechFilter').value,
      status: $('tqStatus').value, range: range()
    }).then(function(res){
      S.busy = false;
      if(!res.ok) return say('tqMsg','err', esc(res.error));
      S.rows = S.page === 0 ? res.rows : S.rows.concat(res.rows);
      S.total = res.total; S.hasMore = res.hasMore;
      renderGrid();
    }).catch(function(e){
      S.busy = false; say('tqMsg','err','Could not load the queue: ' + esc(e.message));
    });
  }

  function save(){
    var ids = Object.keys(S.edits);
    if(!ids.length || S.busy) return;
    S.busy = true; $('tqSave').disabled = true; $('tqSave').textContent = 'Saving…';

    var edits = ids.map(function(id){
      var e = S.edits[id], r = rowById(id) || {};
      return { id:id, status:e.status, techId:e.techId, qty:e.qty, notes:e.notes,
               label: r.serial || r.item };
    });

    post({ action:'save', edits: edits }).then(function(res){
      S.busy = false;
      if(!res.ok){ updateBars(); return say('tqMsg','err', esc(res.error)); }

      (res.saved || []).forEach(function(id){ delete S.edits[id]; });

      if(res.failed && res.failed.length){
        say('tqMsg','err', res.saved.length + ' saved. ' + res.failed.length + ' did not: ' +
          res.failed.map(function(f){ return esc(f.label) + ' — ' + esc(f.error); }).join('; ') +
          '. Those rows are still highlighted.');
      } else {
        say('tqMsg','ok','Saved ' + res.saved.length + (res.saved.length===1?' change.':' changes.'));
      }
      load(true);
      loadMetrics();
    }).catch(function(e){
      S.busy = false; updateBars();
      say('tqMsg','err','Could not save: ' + esc(e.message));
    });
  }

  function removeSelected(){
    var ids = Object.keys(S.sel);
    if(!ids.length) return;
    if(!confirm('Delete ' + ids.length + ' row' + (ids.length===1?'':'s') +
                ' from the test queue? This cannot be undone.')) return;
    post({ action:'remove', ids: ids }).then(function(res){
      if(!res.ok) return say('tqMsg','err', esc(res.error));
      say('tqMsg','ok','Removed ' + res.removed.length + (res.removed.length===1?' row.':' rows.'));
      load(true); loadMetrics();
    });
  }

  /* ---------------- add drawer ---------------- */

  function clearScan(){
    S.pending = null;
    $('tqScan').value = '';
    $('tqFound').style.display = 'none';
    $('tqPickWrap').style.display = 'none';
    $('tqPick').innerHTML = '';
  }

  function lookup(){
    var q = $('tqScan').value.trim();
    if(!q) return;
    say('tqAddMsg','','');

    post({ action:'lookup', mode: $('tqMode').value, query: q }).then(function(res){
      if(!res.ok){ say('tqAddMsg','err', esc(res.error)); $('tqScan').select(); return; }

      if(res.kind === 'serial'){
        var d = res.data;
        if(d.alreadyQueued){
          say('tqAddMsg','warn', esc(d.serial) + ' is already in the queue as ' +
            esc(d.alreadyQueued.status) +
            (d.alreadyQueued.tech ? ' with ' + esc(d.alreadyQueued.tech) : '') +
            '. Find it in the grid and set the result there.');
          clearScan(); $('tqScan').focus();
          flashRow(d.alreadyQueued.id);
          return;
        }
        S.pending = { itemId:d.itemId, itemText:d.itemText, itemName:d.itemName, serial:d.serial };
        $('tqFound').style.display = 'block';
        $('tqFound').innerHTML = '<b>' + esc(d.itemText) + '</b><br>' + esc(d.itemName || '') +
          (d.location ? '<br><span style="color:#5d6b7d;">' + esc(d.location) + '</span>' : '');
        addLine();   // serials are one unit — no reason to make them press Add
      } else {
        var items = res.data;
        if(items.length === 1){
          S.pending = items[0];
          $('tqPickWrap').style.display = 'none';
          $('tqFound').style.display = 'block';
          $('tqFound').innerHTML = '<b>' + esc(items[0].itemText) + '</b><br>' + esc(items[0].itemName || '');
          $('tqQty').focus(); $('tqQty').select();
        } else {
          $('tqFound').style.display = 'none';
          $('tqPickWrap').style.display = 'block';
          $('tqPick').innerHTML = items.map(function(i){
            return '<option value="'+esc(i.itemId)+'" data-t="'+esc(i.itemText)+'" data-n="'+esc(i.itemName||'')+'">'+
                   esc(i.itemText)+' — '+esc(i.itemName||'')+'</option>';
          }).join('');
          S.pending = items[0];
          $('tqPick').focus();
        }
      }
    });
  }

  function addLine(){
    if(!S.pending) return say('tqAddMsg','err','Scan a serial or type a part number first.');
    var qty = S.pending.serial ? 1 : (parseInt($('tqQty').value, 10) || 1);
    if(qty < 1) return say('tqAddMsg','err','Quantity must be 1 or more.');

    post({ action:'add', lines: [{
      itemId: S.pending.itemId, itemText: S.pending.itemText,
      serial: S.pending.serial || '', qty: qty,
      source: CFG.has.source ? $('tqSource').value.trim() : '',
      techId: $('tqAssign').value,
      rush: CFG.has.rush ? $('tqRush').checked : false
    }]}).then(function(res){
      if(!res.ok) return say('tqAddMsg','err', esc(res.error));
      if(res.failed && res.failed.length){
        return say('tqAddMsg','err', res.failed.map(function(f){
          return esc(f.label) + ' — ' + esc(f.error); }).join('; '));
      }
      S.lastAdd = res.saved;
      say('tqAddMsg','ok','Queued ' + esc(S.pending.itemText) + (qty>1 ? ' x' + qty : '') +
        (S.pending.serial ? ' · ' + esc(S.pending.serial) : '') +
        ' <button class="tq-link" id="tqUndoAdd">Undo</button>');
      var u = $('tqUndoAdd');
      if(u) u.onclick = function(){
        post({ action:'remove', ids: S.lastAdd }).then(function(){
          say('tqAddMsg','ok','Removed.'); load(true); loadMetrics();
        });
      };
      clearScan();
      $('tqQty').value = 1;
      $('tqScan').focus();
      if(S.view === 'queue') load(true);
      loadMetrics();
    });
  }

  function flashRow(id){
    var tr = $('tqWrap').querySelector('tr[data-id="'+id+'"]');
    if(!tr) return;
    tr.classList.add('flash');
    tr.scrollIntoView({ block:'center', behavior:'smooth' });
    setTimeout(function(){ tr.classList.remove('flash'); }, 1300);
  }

  /* ---------------- throughput ---------------- */

  function renderThroughput(m){
    if(!m.techs.length){
      $('tqTOut').innerHTML = '<div class="tq-empty">Nothing was tested in this period.</div>';
      return;
    }
    var turn = !!m.hasTurnaround;
    var h = '<table class="tq-grid"><thead><tr>' +
      '<th>Technician</th><th class="num">Units</th><th class="num">Passed</th>' +
      '<th class="num">Failed</th><th class="num">Pass rate</th>' +
      '<th class="num">Avg on bench</th>' + (turn ? '<th class="num">Avg turnaround</th>' : '') +
      '<th class="num">Lines</th></tr></thead><tbody>';
    m.techs.forEach(function(t){
      h += '<tr>' +
        '<td><div class="pad">'+esc(t.tech)+'</div></td>' +
        '<td class="num"><div class="pad"><b>'+t.units+'</b></div></td>' +
        '<td class="num"><div class="pad">'+t.pass+'</div></td>' +
        '<td class="num"><div class="pad">'+t.fail+'</div></td>' +
        '<td class="num"><div class="pad">'+t.passRate+'%</div></td>' +
        '<td class="num"><div class="pad">'+fmtMins(t.avgMinutes)+'</div></td>' +
        (turn ? '<td class="num"><div class="pad dim">'+fmtMins(t.avgTurnaround)+'</div></td>' : '') +
        '<td class="num"><div class="pad dim">'+t.lines+'</div></td>' +
      '</tr>';
    });
    $('tqTOut').innerHTML = h + '</tbody></table>';
  }

  /* ---------------- CSV ---------------- */

  function exportCsv(){
    if(!S.rows.length) return;
    var cols = COLS[S.view].filter(function(c){ return c !== 'check'; });
    var head = cols.map(function(c){ return HEAD[c] || c; });
    var itemAt = cols.indexOf('item');
    if(itemAt > -1){ head.splice(itemAt + 1, 0, 'Description'); }
    var lines = [head.join(',')];
    S.rows.forEach(function(r){
      var cells = cols.map(function(c){
        var v = c === 'result' ? val(r,'status')
              : c === 'tech'   ? (r.tech || '')
              : c === 'age'    ? (r.age === null ? '' : r.age)
              : (val(r, c) !== undefined ? val(r, c) : (r[c] || ''));
        return String(v == null ? '' : v);
      });
      if(itemAt > -1){ cells.splice(itemAt + 1, 0, r.desc || ''); }
      lines.push(cells.map(function(v){
        return /[",\\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
      }).join(','));
    });
    var blob = new Blob([lines.join('\\n')], { type:'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'testing_' + S.view + '_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  /* ---------------- views ---------------- */

  function setView(v){
    S.view = v;
    Array.prototype.forEach.call($('tqTabs').children, function(b){
      b.setAttribute('aria-selected', String(b.dataset.view === v));
    });
    var grid = v !== 'throughput';
    $('tqGridView').style.display = grid ? '' : 'none';
    $('tqThroughputView').style.display = grid ? 'none' : '';
    $('tqRangeWrap').style.display = (v === 'completed') ? '' : 'none';

    $('tqStatus').innerHTML = '<option value="">All</option>' +
      (v === 'completed' ? CFG.statuses.done : CFG.statuses.open).map(function(s){
        return '<option value="'+esc(s)+'">'+esc(s)+'</option>'; }).join('');

    say('tqMsg','','');
    if(grid) load(true);
    loadMetrics();
  }

  /* ---------------- wiring ---------------- */

  Array.prototype.forEach.call($('tqTabs').children, function(b){
    b.onclick = function(){
      if(Object.keys(S.edits).length && !confirm('You have unsaved changes. Leave them behind?')) return;
      setView(b.dataset.view);
    };
  });

  $('tqWrap').addEventListener('change', function(e){
    var t = e.target;
    if(t.id === 'tqAll'){
      S.rows.forEach(function(r){ if(t.checked) S.sel[r.id] = true; else delete S.sel[r.id]; });
      renderGrid();
      return;
    }
    if(t.classList.contains('tq-ck')){
      if(t.checked) S.sel[t.dataset.id] = true; else delete S.sel[t.dataset.id];
      var tr = t.closest('tr'); if(tr) tr.classList.toggle('sel', t.checked);
      updateBars();
      return;
    }
    if(t.classList.contains('tq-cell')) setEdit(t.closest('tr').dataset.id, t.dataset.f, t.value);
  });

  $('tqWrap').addEventListener('input', function(e){
    var t = e.target;
    if(t.tagName === 'INPUT' && t.classList.contains('tq-cell')){
      setEdit(t.closest('tr').dataset.id, t.dataset.f, t.value);
    }
  });

  $('tqWrap').addEventListener('keydown', function(e){
    var t = e.target;
    if(!t.classList || !t.classList.contains('tq-cell')) return;
    if(e.key === 'Enter' || (e.key === 'ArrowDown' && t.tagName === 'INPUT')){
      e.preventDefault(); moveFocus(t, 1);
    } else if(e.key === 'ArrowUp' && t.tagName === 'INPUT'){
      e.preventDefault(); moveFocus(t, -1);
    } else if(e.key === 'd' && (e.ctrlKey || e.metaKey)){
      e.preventDefault(); fillDown(t);
    }
  });

  function siblingCell(cellEl, dir){
    var tr = cellEl.closest('tr');
    var next = dir > 0 ? tr.nextElementSibling : tr.previousElementSibling;
    return next ? next.querySelector('[data-f="' + cellEl.dataset.f + '"]') : null;
  }
  function moveFocus(cellEl, dir){
    var n = siblingCell(cellEl, dir);
    if(n){ n.focus(); if(n.select) n.select(); }
  }
  function fillDown(cellEl){
    var above = siblingCell(cellEl, -1);
    if(!above) return;
    cellEl.value = above.value;
    setEdit(cellEl.closest('tr').dataset.id, cellEl.dataset.f, cellEl.value);
  }

  /* ---------------- close out part of a batch ---------------- */

  var splitRow = null;

  function openSplit(){
    var ids = Object.keys(S.sel);
    if(ids.length !== 1){
      return say('tqMsg','warn','Select exactly one batch row to close out part of it.');
    }
    var r = rowById(ids[0]);
    if(!r) return;
    if(r.qty < 2){
      return say('tqMsg','warn','That row is a single unit — use Mark passed or Mark failed.');
    }
    splitRow = r;
    $('tqSplitWhat').innerHTML = esc(r.item) + (r.desc ? ' · ' + esc(r.desc) : '') +
      '<br><b>' + r.qty + ' units</b> in this row';
    $('tqSplitPass').value = r.qty;
    $('tqSplitFail').value = 0;
    $('tqSplitNotes').value = '';
    say('tqSplitMsg','','');
    updateSplitRemainder();
    $('tqSplitMask').classList.add('open');
    $('tqSplitPass').focus(); $('tqSplitPass').select();
  }

  function closeSplit(){
    $('tqSplitMask').classList.remove('open');
    splitRow = null;
  }

  function updateSplitRemainder(){
    if(!splitRow) return;
    var p = parseInt($('tqSplitPass').value, 10) || 0;
    var f = parseInt($('tqSplitFail').value, 10) || 0;
    var rem = splitRow.qty - p - f;
    var el = $('tqSplitRem');
    if(rem < 0){
      el.innerHTML = '<b style="color:#b3261e;">That is ' + (p+f) + ' units out of ' +
                     splitRow.qty + '.</b>';
    } else if(rem === 0){
      el.innerHTML = 'Closes the whole row. Nothing stays in the queue.';
    } else {
      el.innerHTML = '<b>' + rem + '</b> unit' + (rem===1?'':'s') +
        ' stay Pending, keeping the original queued date so the age keeps counting.';
    }
    $('tqSplitGo').disabled = (rem < 0) || (p + f === 0);
  }

  function doSplit(){
    if(!splitRow) return;
    var p = parseInt($('tqSplitPass').value, 10) || 0;
    var f = parseInt($('tqSplitFail').value, 10) || 0;
    $('tqSplitGo').disabled = true;

    post({ action:'split', id: splitRow.id, pass: p, fail: f, notes: $('tqSplitNotes').value })
      .then(function(res){
        if(!res.ok){ $('tqSplitGo').disabled = false; return say('tqSplitMsg','err', esc(res.error)); }
        closeSplit();
        say('tqMsg','ok','Closed out ' + (p ? p + ' passed' : '') + (p && f ? ', ' : '') +
          (f ? f + ' failed' : '') +
          (res.remaining ? '. ' + res.remaining + ' still in the queue.' : '.'));
        load(true); loadMetrics();
      }).catch(function(e){
        $('tqSplitGo').disabled = false;
        say('tqSplitMsg','err','Could not close it out: ' + esc(e.message));
      });
  }

  $('tqSplit').onclick = openSplit;
  $('tqSplitCancel').onclick = closeSplit;
  $('tqSplitGo').onclick = doSplit;
  $('tqSplitPass').addEventListener('input', updateSplitRemainder);
  $('tqSplitFail').addEventListener('input', updateSplitRemainder);
  $('tqSplitMask').addEventListener('click', function(e){ if(e.target === this) closeSplit(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && $('tqSplitMask').classList.contains('open')) closeSplit();
  });

  $('tqStart').onclick  = function(){ applyToSelected('status', ST.TESTING); };
  $('tqPass').onclick   = function(){ applyToSelected('status', ST.PASS); };
  $('tqFail').onclick   = function(){ applyToSelected('status', ST.FAIL); };
  $('tqHold').onclick   = function(){ applyToSelected('status', ST.HOLD); };
  $('tqDelete').onclick = removeSelected;
  $('tqAssignSel').onchange = function(){
    if(!this.value) return;
    applyToSelected('techId', this.value);
    this.selectedIndex = 0;
  };

  $('tqSave').onclick = save;
  $('tqRevert').onclick = function(){
    if(!confirm('Discard every unsaved change on this screen?')) return;
    S.edits = {}; renderGrid(); say('tqMsg','','');
  };
  $('tqExport').onclick = exportCsv;
  $('tqRefresh').onclick = function(){ load(true); loadMetrics(); };
  $('tqMore').onclick = function(){ S.page += 1; load(false); };

  $('tqStatus').onchange = function(){ load(true); };
  $('tqTechFilter').onchange = function(){ load(true); };
  $('tqRange').onchange = function(){ load(true); loadMetrics(); };
  $('tqTRange').onchange = loadMetrics;

  var qTimer;
  $('tqQ').addEventListener('input', function(){
    clearTimeout(qTimer);
    qTimer = setTimeout(function(){ load(true); }, 350);
  });

  $('tqAddToggle').onclick = function(){
    var d = $('tqAddDrawer');
    d.classList.toggle('open');
    this.textContent = d.classList.contains('open') ? 'Close' : 'Add to queue';
    if(d.classList.contains('open')) $('tqScan').focus();
  };
  $('tqMode').onchange = function(){
    clearScan();
    $('tqScan').placeholder = this.value === 'serial' ? 'Scan…' : 'e.g. CP-8841-K9-N';
    $('tqQty').disabled = this.value === 'serial';
    $('tqScan').focus();
  };
  $('tqScan').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); lookup(); }
  });
  $('tqQty').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); addLine(); }
  });
  $('tqPick').onchange = function(){
    var o = this.options[this.selectedIndex];
    S.pending = { itemId: this.value, itemText: o.dataset.t, itemName: o.dataset.n };
  };
  $('tqAdd').onclick = addLine;

  document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.key === 's'){ e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', function(e){
    if(Object.keys(S.edits).length){ e.preventDefault(); e.returnValue = ''; }
  });

  setView('${boot.view === 'completed' ? 'completed' : (boot.view === 'throughput' ? 'throughput' : 'queue')}');
})();
</script>`;
  }

  return { onRequest };
});
