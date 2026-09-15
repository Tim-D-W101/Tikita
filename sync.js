/*
 * Tikita sync.
 *
 * Phones share one company code. That code is the only secret: the database
 * exposes no tables, just three functions that verify the code first, so the
 * publishable key below is safe to ship in the page.
 *
 * Offline-first. Every change is written to this phone first and remembered
 * in a "pending" list; a sync pushes that list, then pulls whatever other
 * phones changed. Nothing is ever lost by being out of signal.
 */
(function (global) {
  'use strict';

  var API_URL = 'https://kgjmjzhovyclakppmnmf.supabase.co';
  var API_KEY = 'sb_publishable_B1Zr6gMynR5BP74kicH22w_WDndA_Kx';

  /*
   * Ask for slightly more history than strictly needed. A row can be stamped
   * just before a pull yet commit just after it, which would otherwise fall
   * into the gap between two syncs and never be seen again.
   */
  var OVERLAP_MS = 120000;
  var DEBOUNCE_MS = 2500;

  var ctx = null;
  var running = false;
  var queued = false;
  var debounce = null;
  var listeners = [];

  // ── plumbing ───────────────────────────────────────────

  function rpc(fn, body) {
    return fetch(API_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (err) { /* not json */ }
        if (!res.ok) {
          var error = new Error((data && (data.message || data.hint)) || ('HTTP ' + res.status));
          error.status = res.status;
          error.pgcode = data && data.code;
          throw error;
        }
        return data;
      });
    });
  }

  function describe(err) {
    if (err && (err.pgcode === '28000' || /invalid_code/.test(err.message || ''))) {
      return 'That company code was not recognised.';
    }
    if (err && err.status) return 'Server said no (' + err.status + ').';
    return 'No connection.';
  }

  function state() { return ctx.getState(); }

  function shape(s) {
    if (!s.sync) s.sync = { code: '', name: '', lastNow: null, lastSyncedAt: null, lastError: '' };
    if (!s.pending) s.pending = { sites: {}, workers: {}, marks: {} };
    return s;
  }

  function emit() {
    listeners.forEach(function (fn) { try { fn(status()); } catch (err) { /* ignore */ } });
  }

  // ── what this phone still owes the server ──────────────

  function markKey(day, workerId) { return day + '|' + workerId; }

  function touch(kind, key) {
    shape(state()).pending[kind][key] = 1;
  }

  function pendingCount() {
    var p = shape(state()).pending;
    return Object.keys(p.sites).length + Object.keys(p.workers).length + Object.keys(p.marks).length;
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* A pending id with nothing behind it locally means "deleted here". */
  function payload() {
    var s = state();
    return {
      sites: Object.keys(s.pending.sites).map(function (id) {
        var site = byId(s.sites, id);
        return site ? { id: id, name: site.name, deleted: false } : { id: id, deleted: true };
      }),
      workers: Object.keys(s.pending.workers).map(function (id) {
        var w = byId(s.workers, id);
        return w ? { id: id, siteId: w.siteId, name: w.name, active: w.active !== false, deleted: false }
                 : { id: id, deleted: true };
      }),
      marks: Object.keys(s.pending.marks).map(function (key) {
        var cut = key.indexOf('|');
        var day = key.slice(0, cut), workerId = key.slice(cut + 1);
        var mark = s.records[day] && s.records[day][workerId];
        return mark ? { day: day, workerId: workerId, status: mark.s, extra: mark.x || 0, deleted: false }
                    : { day: day, workerId: workerId, deleted: true };
      })
    };
  }

  // ── merging what other phones changed ──────────────────

  function applyRemote(data) {
    var s = state();
    var changed = false;

    (data.sites || []).forEach(function (row) {
      if (s.pending.sites[row.id]) return;   // unsent local edit wins for now
      var i = -1;
      s.sites.forEach(function (x, n) { if (x.id === row.id) i = n; });
      if (row.deleted) {
        if (i >= 0) { s.sites.splice(i, 1); changed = true; }
      } else if (i >= 0) {
        if (s.sites[i].name !== row.name) { s.sites[i].name = row.name; changed = true; }
      } else {
        s.sites.push({ id: row.id, name: row.name });
        changed = true;
      }
    });

    (data.workers || []).forEach(function (row) {
      if (s.pending.workers[row.id]) return;
      var i = -1;
      s.workers.forEach(function (x, n) { if (x.id === row.id) i = n; });
      if (row.deleted) {
        if (i >= 0) { s.workers.splice(i, 1); changed = true; }
        return;
      }
      var next = { id: row.id, siteId: row.siteId, name: row.name, active: row.active !== false };
      if (i >= 0) {
        var cur = s.workers[i];
        if (cur.name !== next.name || cur.siteId !== next.siteId || (cur.active !== false) !== next.active) {
          s.workers[i] = next;
          changed = true;
        }
      } else {
        s.workers.push(next);
        changed = true;
      }
    });

    (data.marks || []).forEach(function (row) {
      if (s.pending.marks[markKey(row.day, row.workerId)]) return;
      var day = s.records[row.day];
      if (row.deleted) {
        if (day && day[row.workerId]) {
          delete day[row.workerId];
          if (!Object.keys(day).length) delete s.records[row.day];
          changed = true;
        }
        return;
      }
      if (!day) { day = s.records[row.day] = {}; }
      var extra = Number(row.extra) || 0;
      var cur = day[row.workerId];
      if (!cur || cur.s !== row.status || (cur.x || 0) !== extra) {
        day[row.workerId] = { s: row.status, x: extra };
        changed = true;
      }
    });

    return changed;
  }

  // ── the sync itself ────────────────────────────────────

  function snapshot(pending) {
    return {
      sites: Object.keys(pending.sites),
      workers: Object.keys(pending.workers),
      marks: Object.keys(pending.marks)
    };
  }

  /* Clear only what we actually sent — a tap during the request stays pending. */
  function settle(sent) {
    var p = state().pending;
    sent.sites.forEach(function (k) { delete p.sites[k]; });
    sent.workers.forEach(function (k) { delete p.workers[k]; });
    sent.marks.forEach(function (k) { delete p.marks[k]; });
  }

  function run(manual) {
    var s = shape(state());
    if (!s.sync.code) return Promise.resolve('not-connected');
    if (running) { queued = true; return Promise.resolve('busy'); }
    if (!manual && global.navigator && navigator.onLine === false) {
      return Promise.resolve('offline');
    }

    running = true;
    emit();

    var body = payload();
    var sent = snapshot(s.pending);
    var hasWork = body.sites.length || body.workers.length || body.marks.length;

    var push = hasWork
      ? rpc('tikita_push', { p_code: s.sync.code, p_payload: body })
      : Promise.resolve(null);

    return push.then(function () {
      settle(sent);
      var since = s.sync.lastNow
        ? new Date(new Date(s.sync.lastNow).getTime() - OVERLAP_MS).toISOString()
        : null;
      return rpc('tikita_pull', { p_code: s.sync.code, p_since: since });
    }).then(function (data) {
      var changed = applyRemote(data);
      s.sync.lastNow = data.now;
      s.sync.lastSyncedAt = new Date().toISOString();
      s.sync.lastError = '';
      ctx.save();
      running = false;
      if (changed && ctx.onRemoteChange) ctx.onRemoteChange();
      emit();
      if (queued) { queued = false; setTimeout(function () { run(false); }, 400); }
      return 'ok';
    }).catch(function (err) {
      running = false;
      s.sync.lastError = describe(err);
      ctx.save();
      emit();
      return 'error';
    });
  }

  function schedule() {
    if (!shape(state()).sync.code) return;
    clearTimeout(debounce);
    debounce = setTimeout(function () { run(false); }, DEBOUNCE_MS);
    emit();
  }

  // ── joining and leaving ────────────────────────────────

  function connect(code) {
    var clean = String(code || '').trim().toUpperCase();
    if (!clean) return Promise.reject(new Error('Enter your company code.'));

    return rpc('tikita_join', { p_code: clean }).then(function (info) {
      var s = shape(state());
      s.sync.code = clean;
      s.sync.name = info.name;
      s.sync.lastNow = null;          // force a full pull
      s.sync.lastError = '';

      // Whatever is already on this phone should reach the others.
      s.sites.forEach(function (x) { s.pending.sites[x.id] = 1; });
      s.workers.forEach(function (x) { s.pending.workers[x.id] = 1; });
      Object.keys(s.records).forEach(function (day) {
        Object.keys(s.records[day]).forEach(function (w) { s.pending.marks[markKey(day, w)] = 1; });
      });

      ctx.save();
      emit();
      return run(true).then(function (result) {
        if (result === 'error') throw new Error(s.sync.lastError || 'Sync failed.');
        return info.name;
      });
    }).catch(function (err) {
      throw new Error(describe(err) === 'No connection.' && err.message && !err.status
        ? err.message : describe(err));
    });
  }

  function disconnect() {
    var s = shape(state());
    s.sync.code = '';
    s.sync.name = '';
    s.sync.lastNow = null;
    s.sync.lastSyncedAt = null;
    s.sync.lastError = '';
    s.pending = { sites: {}, workers: {}, marks: {} };
    ctx.save();
    emit();
  }

  function status() {
    var s = shape(state());
    return {
      connected: !!s.sync.code,
      company: s.sync.name,
      code: s.sync.code,
      pending: pendingCount(),
      syncing: running,
      lastSyncedAt: s.sync.lastSyncedAt,
      error: s.sync.lastError,
      online: !global.navigator || navigator.onLine !== false
    };
  }

  function init(options) {
    ctx = options;
    shape(state());

    global.addEventListener('online', function () { run(false); });
    global.addEventListener('focus', function () { run(false); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) run(false);
    });

    if (shape(state()).sync.code) setTimeout(function () { run(false); }, 600);
  }

  global.TikitaSync = {
    init: init,
    connect: connect,
    disconnect: disconnect,
    sync: function () { return run(true); },
    schedule: schedule,
    touch: touch,
    markKey: markKey,
    status: status,
    onStatus: function (fn) { listeners.push(fn); }
  };
})(window);
