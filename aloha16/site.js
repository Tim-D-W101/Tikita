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

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window;

  /* ── Navigation: mark the section on screen ─────────── */
  var spyNav = $('[data-spy]');
  if (spyNav && canObserve) {
    var links = $$('a[href^="#"]', spyNav);
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var mark = function (id) {
      links.forEach(function (a) {
        if (byId[id] === a) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    };
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) mark(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach(function (sec) { spy.observe(sec); });
  }

  /* ── One "Check dates" on screen at a time ─────────────
   * The header button (desktop) and the bottom dock (phone) wait until the
   * hero's own button has scrolled away, and the dock steps aside again
   * while the form itself is on screen. */
  var head = $('.site-head');
  var heroCta = $('.hero-actions .btn-sun');
  var dock = $('.dock');
  var datesSection = $('#check-dates');
  var heroShowing = !!heroCta, formShowing = false;
  var syncDock = function () { if (dock) dock.classList.toggle('is-hidden', heroShowing || formShowing); };
  if (heroCta && canObserve) {
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      heroShowing = e.isIntersecting;
      if (head) head.classList.toggle('is-past-hero', !e.isIntersecting && e.boundingClientRect.top < 0);
      syncDock();
    }).observe(heroCta);
  } else {
    heroShowing = false;
    if (head) head.classList.add('is-past-hero');
  }
  if (datesSection && canObserve) {
    new IntersectionObserver(function (entries) {
      formShowing = entries[0].isIntersecting;
      syncDock();
    }, { threshold: 0.2 }).observe(datesSection);
  }
  syncDock();

  /* ── Roadbook: the rows arrive in order, once ──────── */
  var roadbook = $('.roadbook');
  if (roadbook && canObserve && !reduceMotion) {
    $$('.rb-row', roadbook).forEach(function (row, i) { row.style.setProperty('--i', i); });
    roadbook.classList.add('will-reveal');
    var reveal = function () { roadbook.classList.add('is-revealed'); };
    var rbObs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { reveal(); rbObs.disconnect(); }
    }, { threshold: 0.15 });
    rbObs.observe(roadbook);
    window.addEventListener('beforeprint', reveal);
  }

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
  var done = $('#form-done', form);
  var doneTitle = $('#form-done-title', form);
  var tried = false;

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (v) { if (!v) return null; var p = v.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var pretty = function (d) {
    return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  };
  var nightsBetween = function (a, b) { return Math.round((b - a) / 86400000); };
  var num = function (el) { return parseInt(el.value, 10) || 0; };

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  arrive.min = iso(today);

  /* Errors sit under their own field and are read out with it */
  function setError(field, text) {
    var box = $('#' + field.id + '-error', form);
    if (text) {
      field.setAttribute('aria-invalid', 'true');
      if (box) { box.textContent = text; box.hidden = false; }
    } else {
      field.removeAttribute('aria-invalid');
      if (box) { box.textContent = ''; box.hidden = true; }
    }
    return !text;
  }

  var rules = {
    arrive: function () {
      var a = parse(arrive.value);
      if (!a) return 'Choose the day you arrive.';
      if (a < today) return 'Arrival can’t be in the past. Choose today or a later date.';
      return '';
    },
    depart: function () {
      var a = parse(arrive.value), b = parse(depart.value);
      if (!b) return 'Choose the day you leave.';
      if (a && b <= a) return 'Departure needs to be at least one night after arrival.';
      return '';
    },
    adults: function () {
      if (num(adults) < 1) return 'Add at least one adult.';
      var total = num(adults) + num(children);
      if (total > maxGuests) return 'The house sleeps up to ' + maxGuests + '. You have ' + total + ' guests.';
      return '';
    },
    children: function () { return num(children) < 0 ? 'Children can’t be a negative number.' : ''; },
    name: function () { return name.value.trim() ? '' : 'Add your name so we know who to reply to.'; }
  };
  var order = [arrive, depart, adults, children, name];

  function checkOne(field) { return setError(field, rules[field.id]()); }

  function updateNights() {
    var a = parse(arrive.value), b = parse(depart.value);
    if (a) { var next = new Date(a); next.setDate(next.getDate() + 1); depart.min = iso(next); }
    if (a && b && b > a) {
      var n = nightsBetween(a, b);
      nightsOut.textContent = n + (n === 1 ? ' night' : ' nights') + (n < 7 ? '. In high season the minimum stay is 7 nights.' : '');
    } else {
      nightsOut.textContent = '';
    }
  }

  function updateSteppers() {
    $$('.step', form).forEach(function (btn) {
      var input = $('#' + btn.getAttribute('data-for'), form);
      var step = parseInt(btn.getAttribute('data-step'), 10);
      var v = num(input);
      var min = parseInt(input.min, 10), max = parseInt(input.max, 10);
      var full = num(adults) + num(children) >= maxGuests;
      btn.disabled = step < 0 ? v <= min : (v >= max || full);
    });
  }

  arrive.addEventListener('change', function () {
    var a = parse(arrive.value), b = parse(depart.value);
    if (a && (!b || b <= a)) {
      var week = new Date(a); week.setDate(week.getDate() + 7);
      depart.value = iso(week);
    }
    updateNights();
    if (tried || arrive.value) checkOne(arrive);
    if (depart.getAttribute('aria-invalid')) checkOne(depart);
  });
  depart.addEventListener('change', function () { updateNights(); checkOne(depart); });

  /* Check a field when the guest leaves it, not on every keystroke */
  [adults, children, name].forEach(function (field) {
    field.addEventListener('blur', function () {
      if (tried || field.value) checkOne(field);
      /* the head count is one rule across both fields */
      if (field === children || adults.getAttribute('aria-invalid')) checkOne(adults);
    });
    field.addEventListener('input', function () {
      if (field.getAttribute('aria-invalid')) checkOne(field);
      updateSteppers();
    });
  });

  $$('.step', form).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = $('#' + btn.getAttribute('data-for'), form);
      var v = num(input) + parseInt(btn.getAttribute('data-step'), 10);
      v = Math.max(parseInt(input.min, 10), Math.min(parseInt(input.max, 10), v));
      input.value = v;
      updateSteppers();
      if (adults.getAttribute('aria-invalid') || tried) checkOne(adults);
    });
  });
  updateSteppers();

  function compose() {
    var a = parse(arrive.value), b = parse(depart.value);
    var n = nightsBetween(a, b), ad = num(adults), ch = num(children);
    var lines = [
      'Hi Aloha 16, I’d like to check availability.',
      '',
      'Arrival: ' + pretty(a),
      'Departure: ' + pretty(b) + ' (' + n + (n === 1 ? ' night' : ' nights') + ')',
      'Guests: ' + ad + (ad === 1 ? ' adult' : ' adults') + (ch ? ', ' + ch + (ch === 1 ? ' child' : ' children') : ''),
      'Name: ' + name.value.trim()
    ];
    if (msg.value.trim()) lines.push('', msg.value.trim());
    return { text: lines.join('\n'), a: a, b: b };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    tried = true;
    done.hidden = true;
    var firstBad = null;
    order.forEach(function (field) { if (!checkOne(field) && !firstBad) firstBad = field; });
    if (firstBad) { firstBad.focus(); return; }

    var m = compose();
    var via = e.submitter ? e.submitter.value : 'whatsapp';
    if (via === 'email') {
      var subject = 'Availability: ' + pretty(m.a) + ' to ' + pretty(m.b);
      window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(m.text);
      doneTitle.textContent = 'Your message is ready in your email app';
    } else {
      window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(m.text), '_blank', 'noopener');
      doneTitle.textContent = 'Your message is ready in WhatsApp';
    }
    done.hidden = false;
  });
})();
