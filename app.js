/*
 * Tikita — daily worker attendance register.
 *
 * All data lives in this device's localStorage; nothing is sent anywhere.
 * Export builds an .xlsx in the browser and hands it to the share sheet
 * (phone) or downloads it (desktop).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'tikita.v1';
  var SCHEMA_VERSION = 1;
  var ALL_SITES = '__all__';

  var WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ── state ──────────────────────────────────────────────

  var state = {
    version: SCHEMA_VERSION,
    sites: [],      // {id, name}
    workers: [],    // {id, siteId, name, active}
    records: {},    // {'YYYY-MM-DD': {workerId: {s: 'P'|'A', x: number}}}
    sync: null,     // {code, name, lastNow, lastSyncedAt, lastError} — see sync.js
    pending: null   // changes this phone still owes the other phones
  };

  var ui = {
    view: 'today',
    date: todayKey(),
    siteId: null,
    exportFrom: null,
    exportTo: null,
    exportSite: ALL_SITES
  };

  function load() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      toast('This browser is blocking storage — records cannot be saved.');
      return;
    }
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.sites = Array.isArray(parsed.sites) ? parsed.sites : [];
        state.workers = Array.isArray(parsed.workers) ? parsed.workers : [];
        state.records = (parsed.records && typeof parsed.records === 'object') ? parsed.records : {};
        if (parsed.sync) state.sync = parsed.sync;
        if (parsed.pending) state.pending = parsed.pending;
      }
    } catch (err) {
      toast('Saved data could not be read.');
    }
  }

  /*
   * Written synchronously on every change. A phone can be locked, swiped away
   * or killed a moment after a tap, so a deferred write risks losing the mark
   * the user just made.
   */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: SCHEMA_VERSION,
        sites: state.sites,
        workers: state.workers,
        records: state.records,
        sync: state.sync,
        pending: state.pending
      }));
    } catch (err) {
      toast('Could not save — device storage may be full.');
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ── dates ──────────────────────────────────────────────

  function dateKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function todayKey() { return dateKey(new Date()); }

  function parseKey(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function shiftKey(key, days) {
    var d = parseKey(key);
    d.setDate(d.getDate() + days);
    return dateKey(d);
  }

  function longDate(key) {
    var d = parseKey(key);
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
      + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function shortDate(key) {
    var d = parseKey(key);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function eachDay(fromKey, toKey) {
    var out = [];
    var cursor = parseKey(fromKey);
    var end = parseKey(toKey);
    var guard = 0;
    while (cursor <= end && guard++ < 1000) {
      out.push(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  // ── data helpers ───────────────────────────────────────

  function siteById(id) {
    for (var i = 0; i < state.sites.length; i++) {
      if (state.sites[i].id === id) return state.sites[i];
    }
    return null;
  }

  function workersOfSite(siteId, includeInactive) {
    return state.workers.filter(function (w) {
      return w.siteId === siteId && (includeInactive || w.active !== false);
    });
  }

  function currentRoster() {
    if (!ui.siteId) return [];
    return workersOfSite(ui.siteId, false);
  }

  /* The teams shown on the Today screen: one, or all of them. */
  function visibleTeams() {
    var sites = (ui.siteId === ALL_SITES)
      ? state.sites.slice()
      : [siteById(ui.siteId)].filter(Boolean);
    return sites.map(function (site) {
      var workers = workersOfSite(site.id, false);
      var present = 0, absent = 0, extra = 0;
      workers.forEach(function (w) {
        var mark = getMark(ui.date, w.id);
        if (!mark) return;
        if (mark.s === 'P') { present++; extra += mark.x || 0; }
        else absent++;
      });
      return {
        site: site, workers: workers,
        present: present, absent: absent, extra: extra,
        allPresent: workers.length > 0 && present === workers.length
      };
    });
  }

  function getMark(key, workerId) {
    var day = state.records[key];
    return day ? day[workerId] : undefined;
  }

  function setMark(key, workerId, status) {
    if (!state.records[key]) state.records[key] = {};
    var day = state.records[key];
    var existing = day[workerId];

    if (existing && existing.s === status) {
      // tapping the active choice again clears it
      delete day[workerId];
      if (!Object.keys(day).length) delete state.records[key];
    } else {
      day[workerId] = { s: status, x: (status === 'P' && existing) ? (existing.x || 0) : 0 };
    }
    changed('marks', TikitaSync.markKey(key, workerId));
  }

  function setExtra(key, workerId, hours) {
    var day = state.records[key];
    if (!day || !day[workerId] || day[workerId].s !== 'P') return;
    day[workerId].x = Math.max(0, Math.min(24, Math.round(hours * 4) / 4)) || 0;
    changed('marks', TikitaSync.markKey(key, workerId));
  }

  /*
   * Save locally, then remember the change so the next sync carries it to the
   * other phones. Local first, always — signal is not something a site has.
   */
  function changed(kind, key) {
    TikitaSync.touch(kind, key);
    save();
    TikitaSync.schedule();
  }

  // ── small DOM utils ────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ── view: today ────────────────────────────────────────

  function renderToday() {
    $('dateText').textContent = longDate(ui.date);
    $('datePicker').value = ui.date;
    $('todayBtn').hidden = (ui.date === todayKey());
    $('nextDay').disabled = false;

    renderSiteChips();

    var list = $('rosterList');

    if (!state.sites.length) {
      $('summary').hidden = true;
      $('bulkRow').hidden = true;
      list.innerHTML = emptyState(
        'No teams yet',
        'Add a team or site first — a yard, a block, a crew — then add the workers who belong to it.',
        'Set up teams'
      );
      return;
    }

    var teams = visibleTeams();
    var anyWorkers = teams.some(function (t) { return t.workers.length > 0; });

    if (!anyWorkers) {
      $('summary').hidden = true;
      $('bulkRow').hidden = true;
      list.innerHTML = emptyState(
        'No workers yet',
        (ui.siteId === ALL_SITES)
          ? 'Add the people who work on each team and they will show up here every day.'
          : 'Add the people working on ' + escapeHtml(siteName(ui.siteId)) +
            ' and they will show up here every day.',
        'Add workers'
      );
      return;
    }

    var present = 0, absent = 0, extra = 0;
    var nudge = TikitaSync.status().connected ? '' :
      '<div class="sync-nudge">' +
        '<p>Records are kept on this phone only.</p>' +
        '<button type="button" data-act="goto-sync">Share with other phones</button>' +
      '</div>';

    var html = teams.map(function (team) {
      present += team.present;
      absent += team.absent;
      extra += team.extra;

      var count = team.workers.length;
      var head =
        '<div class="team" data-site="' + team.site.id + '">' +
          '<div class="team-info">' +
            '<div class="team-name">' + escapeHtml(team.site.name) + '</div>' +
            '<div class="team-count">' +
              (count ? team.present + ' of ' + count + ' present' : 'No workers yet') +
            '</div>' +
          '</div>' +
          (count
            ? '<button type="button" class="team-btn' + (team.allPresent ? ' on' : '') + '" ' +
                'data-act="team-present" aria-pressed="' + team.allPresent + '">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>' +
                '<span>All present</span>' +
              '</button>'
            : '') +
        '</div>';

      var cards = team.workers.map(function (w) {
        var mark = getMark(ui.date, w.id);
        var status = mark ? mark.s : null;

        var card = '<div class="worker" data-worker="' + w.id + '">' +
          '<div class="worker-top">' +
            '<div class="worker-name">' + escapeHtml(w.name) + '</div>' +
            '<div class="seg" role="group" aria-label="' + escapeHtml(w.name) + ' attendance">' +
              '<button type="button" data-act="mark" data-status="P"' +
                (status === 'P' ? ' class="on-p" aria-pressed="true"' : ' aria-pressed="false"') + '>P</button>' +
              '<button type="button" data-act="mark" data-status="A"' +
                (status === 'A' ? ' class="on-a" aria-pressed="true"' : ' aria-pressed="false"') + '>A</button>' +
            '</div>' +
          '</div>';

        if (status === 'P') {
          var hours = mark.x || 0;
          card += '<div class="extra">' +
            '<label for="x-' + w.id + '">Extra hours worked</label>' +
            '<div class="stepper">' +
              '<button type="button" data-act="minus" aria-label="Less extra time">\u2212</button>' +
              '<input id="x-' + w.id + '" type="number" inputmode="decimal" step="0.25" min="0" max="24" ' +
                'value="' + hours + '" data-act="extra" aria-label="Extra hours for ' + escapeHtml(w.name) + '">' +
              '<button type="button" data-act="plus" aria-label="More extra time">+</button>' +
            '</div>' +
          '</div>';
        }

        return card + '</div>';
      }).join('');

      return '<section class="team-block">' + head + cards + '</section>';
    }).join('');

    list.innerHTML = nudge + html;

    var totalWorkers = teams.reduce(function (n, t) { return n + t.workers.length; }, 0);
    $('sumPresent').textContent = present;
    $('sumAbsent').textContent = absent;
    $('sumTodo').textContent = totalWorkers - present - absent;
    $('sumExtra').textContent = round2(extra);
    $('summary').hidden = false;
    $('bulkRow').hidden = false;
  }

  function emptyState(title, body, action) {
    return '<div class="empty"><h3>' + title + '</h3><p>' + body + '</p>' +
      '<button type="button" class="primary-btn" data-act="goto-workers">' + action + '</button></div>';
  }

  function siteName(id) {
    var site = siteById(id);
    return site ? site.name : 'this site';
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function renderSiteChips() {
    var row = $('siteChips');
    if (state.sites.length < 2) { row.hidden = true; row.innerHTML = ''; return; }
    row.hidden = false;

    var chips = [{ id: ALL_SITES, name: 'All teams' }].concat(state.sites);
    row.innerHTML = chips.map(function (s) {
      return '<button type="button" class="chip' + (s.id === ui.siteId ? ' is-active' : '') +
        '" role="tab" aria-selected="' + (s.id === ui.siteId) + '" data-site="' + s.id + '">' +
        escapeHtml(s.name) + '</button>';
    }).join('');
  }

  // ── view: workers ──────────────────────────────────────

  function renderWorkers() {
    var host = $('sitesAdmin');

    if (!state.sites.length) {
      host.innerHTML = '<div class="empty"><h3>No sites yet</h3>' +
        '<p>Start by adding a site or team above. Workers are grouped under a site so you can tick off one crew at a time.</p></div>';
      return;
    }

    host.innerHTML = state.sites.map(function (site) {
      var workers = workersOfSite(site.id, true);
      var lines = workers.length
        ? workers.map(function (w) {
            return '<div class="worker-line' + (w.active === false ? ' inactive' : '') + '" data-worker="' + w.id + '">' +
              '<span>' + escapeHtml(w.name) + '</span>' +
              '<button type="button" class="mini-btn" data-act="rename-worker">Rename</button>' +
              '<button type="button" class="mini-btn" data-act="toggle-worker">' +
                (w.active === false ? 'Restore' : 'Remove') + '</button>' +
            '</div>';
          }).join('')
        : '<div class="worker-line"><span style="color:var(--text-dim)">No workers yet</span></div>';

      return '<div class="site-block" data-site="' + site.id + '">' +
        '<div class="site-head">' +
          '<h3>' + escapeHtml(site.name) + '</h3>' +
          '<button type="button" class="mini-btn" data-act="rename-site">Rename</button>' +
          '<button type="button" class="mini-btn danger" data-act="delete-site">Delete</button>' +
        '</div>' +
        lines +
        '<div class="site-foot">' +
          '<form class="addform" data-act="add-worker" autocomplete="off">' +
            '<input type="text" placeholder="Add worker to ' + escapeHtml(site.name) + '" maxlength="60" required aria-label="New worker name">' +
            '<button type="submit" class="primary-btn compact">Add</button>' +
          '</form>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── view: export ───────────────────────────────────────

  function renderExport() {
    if (!ui.exportFrom || !ui.exportTo) applyRangePreset('thisMonth');
    $('exportFrom').value = ui.exportFrom;
    $('exportTo').value = ui.exportTo;

    var select = $('exportSite');
    select.innerHTML = '<option value="' + ALL_SITES + '">All sites</option>' +
      state.sites.map(function (s) {
        return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>';
      }).join('');
    select.value = ui.exportSite;

    if (!$('rangePresets').querySelector('.is-active')) {
      $('rangePresets').firstElementChild.classList.add('is-active');
    }

    updateExportPreview();
  }

  function applyRangePreset(preset) {
    var now = new Date();
    var from, to;
    if (preset === 'thisMonth') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = now;
    } else if (preset === 'lastMonth') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === 'last7') {
      from = new Date(now); from.setDate(from.getDate() - 6); to = now;
    } else {
      from = new Date(now); from.setDate(from.getDate() - 29); to = now;
    }
    ui.exportFrom = dateKey(from);
    ui.exportTo = dateKey(to);
  }

  function exportSelection() {
    var from = ui.exportFrom, to = ui.exportTo;
    if (!from || !to) return null;
    if (parseKey(from) > parseKey(to)) { var swap = from; from = to; to = swap; }

    var days = eachDay(from, to);
    var sites = (ui.exportSite === ALL_SITES)
      ? state.sites.slice()
      : [siteById(ui.exportSite)].filter(Boolean);

    var groups = sites.map(function (site) {
      var workers = workersOfSite(site.id, true).filter(function (w) {
        if (w.active !== false) return true;
        // keep removed workers only if they have marks inside the period
        return days.some(function (d) { return !!getMark(d, w.id); });
      });
      return { site: site, workers: workers };
    }).filter(function (g) { return g.workers.length > 0; });

    var marks = 0;
    groups.forEach(function (g) {
      g.workers.forEach(function (w) {
        days.forEach(function (d) { if (getMark(d, w.id)) marks++; });
      });
    });

    return { from: from, to: to, days: days, groups: groups, marks: marks };
  }

  function updateExportPreview() {
    var sel = exportSelection();
    var btn = $('exportBtn');
    if (!sel || !sel.groups.length) {
      $('exportPreview').textContent = 'Nothing to export for this selection yet.';
      btn.disabled = true;
      return;
    }
    var workers = sel.groups.reduce(function (n, g) { return n + g.workers.length; }, 0);
    $('exportPreview').textContent =
      workers + (workers === 1 ? ' worker' : ' workers') + ' · ' +
      sel.days.length + (sel.days.length === 1 ? ' day' : ' days') + ' · ' +
      sel.marks + (sel.marks === 1 ? ' mark' : ' marks') + ' recorded';
    btn.disabled = false;
  }

  function buildWorkbook(sel) {
    var S = XlsxWriter.styles;
    var days = sel.days;
    var spansMonths = parseKey(sel.from).getMonth() !== parseKey(sel.to).getMonth() ||
                      parseKey(sel.from).getFullYear() !== parseKey(sel.to).getFullYear();

    var siteLabel = (ui.exportSite === ALL_SITES) ? 'All sites' : siteName(ui.exportSite);
    var lastCol = days.length + 3; // worker col + days + present + absent + extra

    var rows = [];
    var merges = [];

    // title block
    rows.push([{ v: 'Attendance register', s: S.TITLE }]);
    rows.push([{
      v: siteLabel + '  ·  ' + shortDate(sel.from) + ' to ' + shortDate(sel.to) +
         '  ·  exported ' + shortDate(todayKey()),
      s: S.SUBTITLE
    }]);
    rows.push([]);
    merges.push('A1:' + XlsxWriter.colName(Math.min(lastCol, 8)) + '1');
    merges.push('A2:' + XlsxWriter.colName(Math.min(lastCol, 12)) + '2');

    // two header rows: day number, then weekday
    var headA = [{ v: 'Worker', s: S.HEAD }];
    var headB = [{ v: '', s: S.HEAD }];
    days.forEach(function (key) {
      var d = parseKey(key);
      headA.push({ v: spansMonths ? (d.getDate() + '/' + (d.getMonth() + 1)) : String(d.getDate()), s: S.HEAD });
      headB.push({ v: WEEKDAYS[d.getDay()], s: S.HEAD_SMALL });
    });
    headA.push({ v: 'Present', s: S.HEAD }, { v: 'Absent', s: S.HEAD }, { v: 'Extra hrs', s: S.HEAD });
    headB.push({ v: '', s: S.HEAD_SMALL }, { v: '', s: S.HEAD_SMALL }, { v: '', s: S.HEAD_SMALL });
    rows.push(headA);
    rows.push(headB);

    var headerRowIndex = rows.length; // 1-based row number of headB
    merges.push('A4:A5');
    [days.length + 1, days.length + 2, days.length + 3].forEach(function (c) {
      var name = XlsxWriter.colName(c);
      merges.push(name + '4:' + name + '5');
    });

    var grand = { present: 0, absent: 0, extra: 0 };

    sel.groups.forEach(function (group) {
      // site banner spanning the full table width
      var banner = [{ v: group.site.name, s: S.GROUP }];
      for (var i = 1; i <= lastCol; i++) banner.push({ v: '', s: S.GROUP_SPAN });
      rows.push(banner);
      merges.push('A' + rows.length + ':' + XlsxWriter.colName(lastCol) + rows.length);

      var subtotal = { present: 0, absent: 0, extra: 0 };

      group.workers.forEach(function (worker) {
        var line = [{ v: worker.name + (worker.active === false ? ' (removed)' : ''), s: S.TEXT }];
        var present = 0, absent = 0, extra = 0;

        days.forEach(function (key) {
          var mark = getMark(key, worker.id);
          if (!mark) { line.push({ v: '', s: S.BLANK_CELL }); return; }
          if (mark.s === 'P') {
            present++;
            var hrs = mark.x || 0;
            extra += hrs;
            line.push({ v: hrs > 0 ? ('P+' + round2(hrs)) : 'P', s: S.PRESENT });
          } else {
            absent++;
            line.push({ v: 'A', s: S.ABSENT });
          }
        });

        line.push({ v: present, t: 'n', s: S.TOTAL });
        line.push({ v: absent, t: 'n', s: S.TOTAL });
        line.push({ v: round2(extra), t: 'n', s: S.HOURS });
        rows.push(line);

        subtotal.present += present;
        subtotal.absent += absent;
        subtotal.extra += extra;
      });

      var totalRow = [{ v: group.site.name + ' total', s: S.GROUP }];
      for (var j = 0; j < days.length; j++) totalRow.push({ v: '', s: S.GROUP_SPAN });
      totalRow.push({ v: subtotal.present, t: 'n', s: S.GROUP });
      totalRow.push({ v: subtotal.absent, t: 'n', s: S.GROUP });
      totalRow.push({ v: round2(subtotal.extra), t: 'n', s: S.GROUP });
      rows.push(totalRow);
      merges.push('A' + rows.length + ':' + XlsxWriter.colName(days.length) + rows.length);
      rows.push([]);

      grand.present += subtotal.present;
      grand.absent += subtotal.absent;
      grand.extra += subtotal.extra;
    });

    if (sel.groups.length > 1) {
      var g = [{ v: 'All sites total', s: S.GROUP }];
      for (var k = 0; k < days.length; k++) g.push({ v: '', s: S.GROUP_SPAN });
      g.push({ v: grand.present, t: 'n', s: S.GROUP });
      g.push({ v: grand.absent, t: 'n', s: S.GROUP });
      g.push({ v: round2(grand.extra), t: 'n', s: S.GROUP });
      rows.push(g);
      merges.push('A' + rows.length + ':' + XlsxWriter.colName(days.length) + rows.length);
    }

    rows.push([]);
    rows.push([{ v: 'P = present · A = absent · P+n = present with n extra hours · blank = not marked', s: S.SUBTITLE }]);

    var cols = [{ width: 26 }];
    days.forEach(function () { cols.push({ width: spansMonths ? 6.5 : 5.6 }); });
    cols.push({ width: 9 }, { width: 8 }, { width: 10 });

    return XlsxWriter.build({
      sheetName: 'Attendance',
      rows: rows,
      cols: cols,
      merges: merges,
      freeze: { row: headerRowIndex, col: 1 }
    });
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
  }

  function doExport() {
    var sel = exportSelection();
    if (!sel || !sel.groups.length) return;

    var blob;
    try {
      blob = buildWorkbook(sel);
    } catch (err) {
      toast('Could not build the file: ' + err.message);
      return;
    }

    var label = (ui.exportSite === ALL_SITES) ? 'all-sites' : slug(siteName(ui.exportSite));
    var filename = 'attendance-' + label + '-' + sel.from + '-to-' + sel.to + '.xlsx';

    deliverFile(blob, filename).then(function (how) {
      if (how === 'shared') {
        $('exportHint').textContent = 'Sent. Open it on your PC from wherever you shared it to.';
      } else if (how === 'downloaded') {
        $('exportHint').textContent = 'Saved as ' + filename;
      }
    });
  }

  /* Phones get the share sheet; desktops get a plain download. */
  function deliverFile(blob, filename) {
    var touchFirst = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    if (touchFirst && navigator.canShare) {
      try {
        var file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: filename })
            .then(function () { return 'shared'; })
            .catch(function (err) {
              if (err && err.name === 'AbortError') return 'cancelled';
              return download(blob, filename);
            });
        }
      } catch (err) { /* fall through to download */ }
    }
    return Promise.resolve(download(blob, filename));
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return 'downloaded';
  }

  // ── backup / restore ───────────────────────────────────

  function doBackup() {
    // deliberately without state.sync — a backup file must not carry the
    // company code around in someone's WhatsApp
    var payload = JSON.stringify({
      app: 'tikita',
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      sites: state.sites,
      workers: state.workers,
      records: state.records
    }, null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    deliverFile(blob, 'tikita-backup-' + todayKey() + '.json');
  }

  function doRestore(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        toast('That file is not a Tikita backup.');
        return;
      }
      if (!data || data.app !== 'tikita' || !Array.isArray(data.sites)) {
        toast('That file is not a Tikita backup.');
        return;
      }
      var days = Object.keys(data.records || {}).length;
      var ok = confirm('Restore this backup?\n\n' +
        data.sites.length + ' site(s), ' + (data.workers || []).length + ' worker(s), ' +
        days + ' day(s) of records.\n\nThis replaces everything currently on this device.');
      if (!ok) return;

      state.sites = data.sites;
      state.workers = Array.isArray(data.workers) ? data.workers : [];
      state.records = (data.records && typeof data.records === 'object') ? data.records : {};
      ui.siteId = state.sites.length ? state.sites[0].id : null;
      state.sites.forEach(function (x) { TikitaSync.touch('sites', x.id); });
      state.workers.forEach(function (x) { TikitaSync.touch('workers', x.id); });
      Object.keys(state.records).forEach(function (day) {
        Object.keys(state.records[day]).forEach(function (w) {
          TikitaSync.touch('marks', TikitaSync.markKey(day, w));
        });
      });
      save();
      TikitaSync.schedule();
      render();
      toast('Backup restored.');
    };
    reader.readAsText(file);
  }

  // ── routing ────────────────────────────────────────────

  function setView(name) {
    ui.view = name;
    ['today', 'workers', 'export', 'sync'].forEach(function (v) {
      $('view-' + v).hidden = (v !== name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var on = tab.dataset.view === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    var validSelection = (ui.siteId === ALL_SITES && state.sites.length > 1) ||
                         (ui.siteId && siteById(ui.siteId));
    if (!validSelection) {
      ui.siteId = state.sites.length ? state.sites[0].id : null;
    }
    if (ui.view === 'today') renderToday();
    else if (ui.view === 'workers') renderWorkers();
    else if (ui.view === 'sync') renderSync();
    else renderExport();
  }

  // ── view: sync ─────────────────────────────────────────

  function agoText(iso) {
    if (!iso) return '';
    var secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (secs < 60) return 'just now';
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    return shortDate(dateKey(new Date(iso)));
  }

  function renderSyncChip(st) {
    var dot = $('syncDot');
    var text = $('syncChipText');
    dot.className = 'dot';

    if (!st.connected) { text.textContent = 'This phone only'; return; }
    if (st.syncing) { dot.classList.add('busy'); text.textContent = 'Syncing…'; return; }
    if (st.error) { dot.classList.add('error'); text.textContent = 'Not synced'; return; }
    if (st.pending) {
      dot.classList.add('pending');
      text.textContent = st.pending + ' waiting';
      return;
    }
    dot.classList.add('ok');
    text.textContent = 'Synced';
  }

  function renderSync() {
    var st = TikitaSync.status();

    $('connectCard').hidden = st.connected;
    $('syncActions').hidden = !st.connected;

    var line = $('syncStatusLine');
    var sub = $('syncSubLine');

    if (!st.connected) {
      line.textContent = 'This phone only';
      sub.textContent = 'Records stay on this device. Other phones will not see them, ' +
                        'and you will not see theirs.';
      return;
    }

    if (st.syncing) line.textContent = 'Syncing…';
    else if (st.error) line.textContent = 'Could not sync';
    else if (st.pending) line.textContent = st.pending + (st.pending === 1 ? ' change waiting' : ' changes waiting');
    else line.textContent = 'Up to date';

    var bits = ['Connected to ' + (st.company || 'your team') + '.'];
    if (st.error) bits.push(st.error);
    else if (!st.online) bits.push('No signal — changes will go up when you are back in range.');
    if (st.lastSyncedAt) bits.push('Last synced ' + agoText(st.lastSyncedAt) + '.');
    sub.textContent = bits.join(' ');
  }

  // ── events ─────────────────────────────────────────────

  function wire() {
    document.querySelector('.tabbar').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (tab) setView(tab.dataset.view);
    });

    $('prevDay').addEventListener('click', function () { ui.date = shiftKey(ui.date, -1); renderToday(); });
    $('nextDay').addEventListener('click', function () { ui.date = shiftKey(ui.date, 1); renderToday(); });
    $('todayBtn').addEventListener('click', function () { ui.date = todayKey(); renderToday(); });
    $('datePicker').addEventListener('change', function (e) {
      if (e.target.value) { ui.date = e.target.value; renderToday(); }
    });

    $('siteChips').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-site]');
      if (!chip) return;
      ui.siteId = chip.dataset.site;
      renderToday();
    });

    // roster interactions
    $('rosterList').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;

      if (btn.dataset.act === 'goto-workers') { setView('workers'); return; }
      if (btn.dataset.act === 'goto-sync') { setView('sync'); return; }

      if (btn.dataset.act === 'team-present') {
        markTeam(btn.closest('[data-site]').dataset.site);
        return;
      }

      var card = btn.closest('[data-worker]');
      if (!card) return;
      var workerId = card.dataset.worker;

      if (btn.dataset.act === 'mark') {
        setMark(ui.date, workerId, btn.dataset.status);
        renderToday();
      } else if (btn.dataset.act === 'plus' || btn.dataset.act === 'minus') {
        var input = card.querySelector('input[data-act="extra"]');
        var next = (parseFloat(input.value) || 0) + (btn.dataset.act === 'plus' ? 0.5 : -0.5);
        setExtra(ui.date, workerId, next);
        renderToday();
      }
    });

    $('rosterList').addEventListener('change', function (e) {
      var input = e.target.closest('input[data-act="extra"]');
      if (!input) return;
      var card = input.closest('[data-worker]');
      setExtra(ui.date, card.dataset.worker, parseFloat(input.value) || 0);
      renderToday();
    });

    $('allPresentBtn').addEventListener('click', function () {
      var marked = 0;
      visibleTeams().forEach(function (team) {
        team.workers.forEach(function (w) {
          if (!getMark(ui.date, w.id)) { setMark(ui.date, w.id, 'P'); marked++; }
        });
      });
      renderToday();
      toast(marked ? 'Marked ' + marked + ' more present.' : 'Everyone is already marked.');
    });

    $('clearDayBtn').addEventListener('click', function () {
      var scope = (ui.siteId === ALL_SITES) ? 'every team' : siteName(ui.siteId);
      if (!confirm('Clear all marks for ' + longDate(ui.date) + ' on ' + scope + '?')) return;
      clearWorkers(visibleTeams().reduce(function (all, t) { return all.concat(t.workers); }, []));
      renderToday();
    });

    // sites & workers admin
    $('addSiteForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('siteNameInput');
      var name = input.value.trim();
      if (!name) return;
      var site = { id: uid(), name: name };
      state.sites.push(site);
      ui.siteId = site.id;
      input.value = '';
      changed('sites', site.id);
      render();
    });

    $('sitesAdmin').addEventListener('submit', function (e) {
      var form = e.target.closest('form[data-act="add-worker"]');
      if (!form) return;
      e.preventDefault();
      var block = form.closest('[data-site]');
      var input = form.querySelector('input');
      var name = input.value.trim();
      if (!name) return;
      var worker = { id: uid(), siteId: block.dataset.site, name: name, active: true };
      state.workers.push(worker);
      input.value = '';
      changed('workers', worker.id);
      renderWorkers();
      input.focus();
    });

    $('sitesAdmin').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      var block = btn.closest('[data-site]');
      var line = btn.closest('[data-worker]');

      if (act === 'rename-site') {
        var site = siteById(block.dataset.site);
        var name = prompt('Team name', site.name);
        if (name && name.trim()) { site.name = name.trim(); changed('sites', site.id); render(); }

      } else if (act === 'delete-site') {
        var target = siteById(block.dataset.site);
        var count = workersOfSite(target.id, true).length;
        if (!confirm('Delete "' + target.name + '"' +
            (count ? ' and its ' + count + ' worker(s)' : '') +
            '?\n\nPast attendance records for these workers are deleted too. This cannot be undone.')) return;
        var removedIds = workersOfSite(target.id, true).map(function (w) { return w.id; });
        state.workers = state.workers.filter(function (w) { return w.siteId !== target.id; });
        state.sites = state.sites.filter(function (s) { return s.id !== target.id; });
        Object.keys(state.records).forEach(function (key) {
          removedIds.forEach(function (id) {
            if (!state.records[key][id]) return;
            delete state.records[key][id];
            TikitaSync.touch('marks', TikitaSync.markKey(key, id));
          });
          if (!Object.keys(state.records[key]).length) delete state.records[key];
        });
        removedIds.forEach(function (id) { TikitaSync.touch('workers', id); });
        changed('sites', target.id);
        render();

      } else if (act === 'rename-worker') {
        var worker = workerById(line.dataset.worker);
        var newName = prompt('Worker name', worker.name);
        if (newName && newName.trim()) {
          worker.name = newName.trim();
          changed('workers', worker.id);
          renderWorkers();
        }

      } else if (act === 'toggle-worker') {
        var w2 = workerById(line.dataset.worker);
        if (w2.active === false) {
          w2.active = true;
        } else {
          if (!confirm('Remove ' + w2.name + ' from the daily list?\n\nPast records are kept and still appear in exports.')) return;
          w2.active = false;
        }
        changed('workers', w2.id);
        renderWorkers();
      }
    });

    // export
    $('rangePresets').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-range]');
      if (!chip) return;
      applyRangePreset(chip.dataset.range);
      Array.prototype.forEach.call($('rangePresets').children, function (c) {
        c.classList.toggle('is-active', c === chip);
      });
      $('exportFrom').value = ui.exportFrom;
      $('exportTo').value = ui.exportTo;
      $('exportHint').textContent = '';
      updateExportPreview();
    });

    $('exportFrom').addEventListener('change', function (e) {
      ui.exportFrom = e.target.value;
      clearPresetHighlight();
      updateExportPreview();
    });
    $('exportTo').addEventListener('change', function (e) {
      ui.exportTo = e.target.value;
      clearPresetHighlight();
      updateExportPreview();
    });
    $('exportSite').addEventListener('change', function (e) {
      ui.exportSite = e.target.value;
      updateExportPreview();
    });
    $('exportBtn').addEventListener('click', doExport);

    $('syncChip').addEventListener('click', function () { setView('sync'); });

    $('connectForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('connectBtn');
      var hint = $('connectHint');
      btn.disabled = true;
      hint.textContent = 'Connecting…';
      TikitaSync.connect($('codeInput').value).then(function (name) {
        hint.textContent = '';
        $('codeInput').value = '';
        btn.disabled = false;
        render();
        toast('Connected to ' + name + '.');
      }).catch(function (err) {
        btn.disabled = false;
        hint.textContent = err.message;
      });
    });

    $('syncNowBtn').addEventListener('click', function () {
      TikitaSync.sync().then(function () { renderSync(); });
    });

    $('disconnectBtn').addEventListener('click', function () {
      if (!confirm('Disconnect this phone?\n\nRecords already on it stay put, but it ' +
                   'will stop sharing with the other phones.')) return;
      TikitaSync.disconnect();
      render();
    });

    TikitaSync.onStatus(function (st) {
      renderSyncChip(st);
      if (ui.view === 'sync') renderSync();
    });

    $('backupBtn').addEventListener('click', doBackup);
    $('restoreBtn').addEventListener('click', function () { $('restoreInput').click(); });
    $('restoreInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) doRestore(e.target.files[0]);
      e.target.value = '';
    });
  }

  /*
   * One tap for a whole crew. Tapping again when everyone is already present
   * clears the team, behind a confirm — the same toggle the per-worker
   * buttons have, but a whole team is worth asking about.
   */
  function markTeam(siteId) {
    var team = null;
    visibleTeams().forEach(function (t) { if (t.site.id === siteId) team = t; });
    if (!team || !team.workers.length) return;

    if (team.allPresent) {
      if (!confirm('Clear all marks for ' + team.site.name + ' on ' + longDate(ui.date) + '?')) return;
      clearWorkers(team.workers);
      renderToday();
      return;
    }

    team.workers.forEach(function (w) {
      var mark = getMark(ui.date, w.id);
      if (!mark || mark.s !== 'P') setMark(ui.date, w.id, 'P');
    });
    renderToday();
    toast(team.site.name + ': all ' + team.workers.length + ' present.');
  }

  function clearWorkers(workers) {
    var day = state.records[ui.date];
    if (!day) return;
    workers.forEach(function (w) {
      if (!day[w.id]) return;
      delete day[w.id];
      TikitaSync.touch('marks', TikitaSync.markKey(ui.date, w.id));
    });
    if (!Object.keys(day).length) delete state.records[ui.date];
    save();
    TikitaSync.schedule();
  }

  function clearPresetHighlight() {
    Array.prototype.forEach.call($('rangePresets').children, function (c) {
      c.classList.remove('is-active');
    });
  }

  function workerById(id) {
    for (var i = 0; i < state.workers.length; i++) {
      if (state.workers[i].id === id) return state.workers[i];
    }
    return null;
  }

  // ── install prompt ─────────────────────────────────────

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    $('installBtn').hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    $('installBtn').hidden = true;
    deferredPrompt = null;
  });

  // ── boot ───────────────────────────────────────────────

  load();

  TikitaSync.init({
    getState: function () { return state; },
    save: save,
    onRemoteChange: function () { render(); }
  });

  wire();
  $('installBtn').addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt = null;
    $('installBtn').hidden = true;
  });
  applyRangePreset('thisMonth');
  renderSyncChip(TikitaSync.status());
  render();

  // keep the header date honest if the app sits open past midnight
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && ui.view === 'today') renderToday();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline support is optional */ });
    });
  }
})();
