/* Aloha 16 — small, dependency-free behaviour for the one-page site. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ── Year in the footer ─────────────────────────────── */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ── Phone menu ─────────────────────────────────────── */
  var menuBtn = $('.menu-btn');
  var nav = $('#site-nav');
  if (menuBtn && nav) {
    var setMenu = function (open) {
      nav.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
    };
    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
    });
  }

  /* ── Photos: a slot with a real file becomes clickable ─ */
  var slots = $$('.gallery .photo');

  function isLoaded(img) { return img.complete && img.naturalWidth > 0; }

  function arm(fig) {
    var img = $('img', fig);
    var btn = $('.photo-open', fig);
    if (!img || !btn) return;
    var ready = function () {
      if (!isLoaded(img)) return;
      btn.disabled = false;
      $$('[data-photo-hint]').forEach(function (el) { el.hidden = false; });
      btn.setAttribute('aria-label', 'Open photo: ' + img.alt);
    };
    if (img.complete) {
      if (isLoaded(img)) ready(); else fig.classList.add('is-empty');
    } else {
      img.addEventListener('load', ready);
      img.addEventListener('error', function () { fig.classList.add('is-empty'); });
    }
  }
  slots.forEach(arm);
  var heroFig = $('.hero-photo');
  if (heroFig) {
    var heroImg = $('img', heroFig);
    if (heroImg && heroImg.complete && !isLoaded(heroImg)) heroFig.classList.add('is-empty');
  }

  /* ── Lightbox ───────────────────────────────────────── */
  var lb = $('#lightbox');
  if (lb && typeof lb.showModal === 'function') {
    var lbImg = $('#lb-img');
    var lbCap = $('#lb-caption');
    var lbCount = $('#lb-count');
    var list = [];
    var at = 0;
    var opener = null;

    var show = function (i) {
      at = (i + list.length) % list.length;
      var src = list[at];
      lbImg.src = src.currentSrc || src.src;
      lbImg.alt = src.alt;
      lbCap.textContent = src.alt;
      lbCount.textContent = list.length > 1 ? (at + 1) + ' of ' + list.length : '';
    };

    slots.forEach(function (fig) {
      var btn = $('.photo-open', fig);
      if (!btn) return;
      btn.addEventListener('click', function () {
        list = slots.map(function (f) { return $('img', f); }).filter(function (img) { return img && isLoaded(img); });
        var mine = $('img', fig);
        var i = list.indexOf(mine);
        if (i < 0) return;
        opener = btn;
        show(i);
        lb.showModal();
      });
    });

    $('.lb-prev', lb).addEventListener('click', function () { show(at - 1); });
    $('.lb-next', lb).addEventListener('click', function () { show(at + 1); });
    $('.lb-close', lb).addEventListener('click', function () { lb.close(); });
    lb.addEventListener('close', function () { if (opener) opener.focus(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
    });

    var startX = null;
    lb.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(dx < 0 ? at + 1 : at - 1);
      startX = null;
    });
  }

  /* ── Copy GPS ───────────────────────────────────────── */
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var source = $(btn.getAttribute('data-copy'));
      var label = $('[data-copy-label]', btn);
      if (!source || !navigator.clipboard) return;
      navigator.clipboard.writeText(source.textContent.trim()).then(function () {
        if (!label) return;
        var was = label.textContent;
        label.textContent = 'Copied';
        setTimeout(function () { label.textContent = was; }, 2000);
      });
    });
  });

  /* ── Print just the directions ──────────────────────── */
  $$('[data-print-roadbook]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var root = document.documentElement;
      root.classList.add('print-roadbook');
      var done = function () { root.classList.remove('print-roadbook'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(done, 1000);
    });
  });

  /* ── Check dates: build a WhatsApp or email message ── */
  var form = $('#enquiry');
  if (!form) return;

  var maxGuests = parseInt(form.getAttribute('data-max-guests'), 10) || 18;
  var waNumber = form.getAttribute('data-whatsapp');
  var email = form.getAttribute('data-email');
  var arrive = $('#arrive', form);
  var depart = $('#depart', form);
  var adults = $('#adults', form);
  var children = $('#children', form);
  var name = $('#name', form);
  var msg = $('#msg', form);
  var nightsOut = $('#nights', form);
  var errorBox = $('#form-error', form);

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (v) { if (!v) return null; var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var pretty = function (d) {
    return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  };
  var nightsBetween = function (a, b) { return Math.round((b - a) / 86400000); };

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  arrive.min = iso(today);

  function updateNights() {
    var a = parse(arrive.value);
    var b = parse(depart.value);
    if (a) {
      var next = new Date(a); next.setDate(next.getDate() + 1);
      depart.min = iso(next);
    }
    if (a && b && b > a) {
      var n = nightsBetween(a, b);
      nightsOut.textContent = n + (n === 1 ? ' night' : ' nights') + (n < 7 ? '. In high season the minimum stay is 7 nights.' : '');
    } else {
      nightsOut.textContent = '';
    }
  }
  arrive.addEventListener('change', function () {
    var a = parse(arrive.value), b = parse(depart.value);
    if (a && (!b || b <= a)) {
      var week = new Date(a); week.setDate(week.getDate() + 7);
      depart.value = iso(week);
    }
    updateNights();
  });
  depart.addEventListener('change', updateNights);

  function fail(field, text) {
    errorBox.textContent = text;
    errorBox.hidden = false;
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    return false;
  }

  function check() {
    $$('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    errorBox.hidden = true;

    var a = parse(arrive.value);
    var b = parse(depart.value);
    var ad = parseInt(adults.value, 10) || 0;
    var ch = parseInt(children.value, 10) || 0;

    if (!a) return fail(arrive, 'Choose an arrival date.');
    if (a < today) return fail(arrive, 'Arrival can’t be in the past.');
    if (!b) return fail(depart, 'Choose a departure date.');
    if (b <= a) return fail(depart, 'Departure needs to be after arrival.');
    if (ad < 1) return fail(adults, 'Add at least one adult.');
    if (ch < 0) return fail(children, 'Children can’t be a negative number.');
    if (ad + ch > maxGuests) return fail(adults, 'Aloha 16 sleeps up to ' + maxGuests + ' guests. You have ' + (ad + ch) + '.');
    if (!name.value.trim()) return fail(name, 'Add your name so we know who to reply to.');
    return { a: a, b: b, ad: ad, ch: ch };
  }

  function compose(v) {
    var n = nightsBetween(v.a, v.b);
    var lines = [
      'Hi Aloha 16, I’d like to check availability.',
      '',
      'Arrival: ' + pretty(v.a),
      'Departure: ' + pretty(v.b) + ' (' + n + (n === 1 ? ' night' : ' nights') + ')',
      'Guests: ' + v.ad + (v.ad === 1 ? ' adult' : ' adults') + (v.ch ? ', ' + v.ch + (v.ch === 1 ? ' child' : ' children') : ''),
      'Name: ' + name.value.trim()
    ];
    if (msg.value.trim()) lines.push('', msg.value.trim());
    return lines.join('\n');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = check();
    if (!v) return;
    var text = compose(v);
    var via = e.submitter ? e.submitter.value : 'whatsapp';
    if (via === 'email') {
      var subject = 'Availability: ' + pretty(v.a) + ' to ' + pretty(v.b);
      window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
    } else {
      window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    }
  });
})();
