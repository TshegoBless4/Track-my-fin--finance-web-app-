
(function () {
  'use strict';

  var PERM_DEF = { transactions: true, budgets: true, debts: false, goals: true, memory: false, store: false, analytics: false, categorise: true };
  var perms = function () { var p = {}; try { p = JSON.parse(localStorage.getItem('trackmyfin_privacy') || '{}') || {}; } catch (e) {} return Object.assign({}, PERM_DEF, p); };

  /* ---- privacy guard: no AI request leaves the browser against the user's permissions ---- */
  (function () {
    var realFetch = window.fetch; if (!realFetch) return;
    var reply = function (body, ok) { return Promise.resolve(new Response(JSON.stringify(body), { status: ok === false ? 403 : 200, headers: { 'Content-Type': 'application/json' } })); };
    window.fetch = function (url, opts) {
      try {
        var u = String(url), once = window.__tmfOnce || {}, P = perms();
        if (/\/api\/categorize/.test(u) && !P.categorise && !once.categorise) return reply({ error: 'AI categorisation is off' }, false);
        if (/\/api\/report/.test(u)) {
          var b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
          if (b.promptType === 'debt_coach') { if (!P.debts && !once.debts) return reply({ summary: 'Fin needs your permission to read your debts before giving tailored advice. You can allow it in Settings \u2192 Privacy & Fin. In general, paying the highest interest rate first (the avalanche method) saves the most.', source: 'rule-based' }); }
          else if (!P.transactions && !once.transactions) return reply({ summary: 'Fin does not have permission to analyse your transactions, so no written summary was created. You can allow it in Settings \u2192 Privacy & Fin.', source: 'rule-based' });
        }
      } catch (e) {}
      return realFetch.apply(this, arguments);
    };
  })();


  (function () {
    var QUIET = /^trackmyfin_(last_updated|alert_log|last_checkin|onboarded|notifications|motion|sample_loaded|goal_collapsed|goal_list_closed|fin_pref_reset|ui_collapsed|feed|fin_history|fin_dismissed)$/;
    var set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    function stamp(store, k) { if (store === window.localStorage && /^trackmyfin_/.test(k) && !QUIET.test(k)) set.call(store, 'trackmyfin_last_updated', String(Date.now())); }
    Storage.prototype.setItem = function (k, v) { set.call(this, k, v); stamp(this, k); };
    Storage.prototype.removeItem = function (k) { rem.call(this, k); stamp(this, k); };
  })();

  
  if (typeof Chart !== 'undefined') {
    try {
      Chart.defaults.font.family = "'DM Sans', sans-serif";
      Chart.defaults.plugins.legend.display = false;
      if (Chart.overrides && Chart.overrides.pie) Chart.overrides.pie.cutout = '70%';
      Chart.register({
        id: 'tmfDonut',
        beforeUpdate: function (chart) {
          if (!chart.canvas || chart.canvas.id !== 'categoryChart') return;
          chart.config.options.cutout = '70%';
          chart.data.datasets.forEach(function (d) { d.borderWidth = 0; d.borderRadius = 10; d.spacing = 3; d.hoverOffset = 6; });
        }
      });
    } catch (e) { console.warn('Chart setup', e); }
  }

  
  var NB = '\u00A0';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var PALETTE = ['#6058a3', '#b271af', '#7aa2c6', '#e6b85c', '#6a8a6a'];
  var $ = function (id) { return document.getElementById(id); };
  var read = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var write = function (k, v) { localStorage.setItem(k, JSON.stringify(v)); };
  var money = function (n) { return (n < 0 ? '-' : '') + 'R' + NB + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NB); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
  var escA = function (s) { return esc(s).replace(/"/g, '&quot;'); };
  var txs = function () { var t = read('trackmyfin_data', []); return Array.isArray(t) ? t : []; };
  var amt = function (t) { return typeof t.amount === 'number' ? t.amount : (parseFloat(String(t.amount).replace(/[^0-9.-]/g, '')) || 0); };
  var isInc = function (t) { return t.type === 'income' || t.type === 'Income' || t.category === 'Income'; };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymOf = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  var cur = function () { return ymOf(new Date()); };
  var shiftYM = function (ym, n) { var p = ym.split('-'); return ymOf(new Date(+p[0], +p[1] - 1 + n, 1)); };
  var prevYM = function (ym) { return shiftYM(ym, -1); };
  var monthName = function (ym) { return MONTHS[+ym.split('-')[1] - 1]; };
  var toast = function (m, t) { if (typeof showToast === 'function') showToast(m, t); };
  var safe = function (fn) { try { fn(); } catch (e) { console.warn('ui.js:', e); } };
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  var fmtMonths = function (m) { var y = Math.floor(m / 12), r = m % 12, o = []; if (y) o.push(y + (y === 1 ? ' year' : ' years')); if (r || !y) o.push(r + (r === 1 ? ' month' : ' months')); return o.join(' '); };
  var todayStr = function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var ord = function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  function monthTotals(ym) {
    var r = { income: 0, expense: 0 };
    txs().forEach(function (t) {
      if (!t.date || t.date.slice(0, 7) !== ym) return;
      if (isInc(t)) r.income += Math.abs(amt(t)); else r.expense += Math.abs(amt(t));
    });
    return r;
  }

  
  function watch(el, fn) {
    if (!el) return;
    var OPTS = { childList: true, characterData: true, subtree: true }, busy = false;
    var mo = new MutationObserver(function () {
      if (busy) return; busy = true; mo.disconnect();
      try { fn(); } finally { mo.observe(el, OPTS); busy = false; }
    });
    mo.observe(el, OPTS); fn();
  }

  function fmt(el) {                       // "R28400.00" -> "R 28 400"
    if (!el) return;
    var m = /^R\s?(-?\d+(?:\.\d+)?)$/.exec(el.textContent.trim());
    if (!m) return;
    var out = money(parseFloat(m[1]));
    if (el.textContent !== out) el.textContent = out;
  }

  function bindComposer(openId, boxId, closeId, focusId, onToggle) {
    var open = $(openId), box = $(boxId); if (!open || !box) return null;
    var toggle = function (show) {
      box.hidden = !show;
      if (onToggle) onToggle(show);
      if (show) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); var f = $(focusId); if (f) f.focus({ preventScroll: true }); }
    };
    open.addEventListener('click', function () { toggle(box.hidden); });
    var c = $(closeId); if (c) c.addEventListener('click', function () { toggle(false); });
    return toggle;
  }

 
  function earliest() {
    var m = txs().map(function (t) { return (t.date || '').slice(0, 7); }).filter(Boolean).sort();
    return m[0] && m[0] < cur() ? m[0] : cur();
  }
  var VIEW_KEY = /budget/i.test(location.pathname) ? 'tmf_view_budget' : 'tmf_view';   // Overview and Budget remember their own month
  function getView(allowAll) { var v = ss.get(VIEW_KEY) || cur(); if (v === 'all' && !allowAll) v = cur(); return v; }
  function viewLabel(v) { if (v === 'all') return 'All time'; if (v === cur()) return 'This month'; return monthName(v) + ' ' + v.slice(0, 4); }
  function bindMonthSwitch(allowAll, onChange) {
    var sw = $('monthSwitch'); if (!sw) return null;
    var prev = $('msPrev'), next = $('msNext'), all = $('msAll'), txt = $('msText'), btn = $('msLabel'), menu = $('msMenu');
    function list() {
      var c = cur(), e = earliest(), start = shiftYM(c, -11) < e ? shiftYM(c, -11) : e, out = [], m = c;
      while (m >= start && out.length < 48) { out.push(m); m = shiftYM(m, -1); } return out;
    }
    function buildMenu() {
      var v = getView(allowAll), cn = {}; txs().forEach(function (t) { var k = (t.date || '').slice(0, 7); if (k) cn[k] = (cn[k] || 0) + 1; });
      var h = allowAll ? '<button type="button" role="option" data-v="all" class="' + (v === 'all' ? 'on' : '') + '">All time<small>Everything together</small></button>' : '';
      list().forEach(function (m) { h += '<button type="button" role="option" data-v="' + m + '" class="' + (m === v ? 'on' : '') + '">' + monthName(m) + ' ' + m.slice(0, 4) + (m === cur() ? ' \u00B7 this month' : '') + '<small>' + (cn[m] ? cn[m] + ' transaction' + (cn[m] === 1 ? '' : 's') : 'No activity') + '</small></button>'; });
      menu.innerHTML = h;
    }
    function open(show) { menu.hidden = !show; btn.setAttribute('aria-expanded', show ? 'true' : 'false'); if (show) { buildMenu(); var on = menu.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' }); } }
    function paint() {
      var v = getView(allowAll), isAll = v === 'all';
      txt.textContent = viewLabel(v);
      prev.disabled = isAll || v <= earliest(); next.disabled = isAll || v >= cur();
      if (all) { all.setAttribute('aria-pressed', isAll ? 'true' : 'false'); all.classList.toggle('on', isAll); }
    }
    function set(v) { ss.set(VIEW_KEY, v); paint(); onChange(v); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden); });
    menu.addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) { open(false); set(b.dataset.v); } });
    document.addEventListener('click', function (e) { if (!sw.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
    prev.addEventListener('click', function () { set(shiftYM(getView(allowAll), -1)); });
    next.addEventListener('click', function () { set(shiftYM(getView(allowAll), 1)); });
    if (all) all.addEventListener('click', function () { set(getView(true) === 'all' ? cur() : 'all'); });
    paint();
    return { paint: paint, set: set };
  }

 
  var FEED_KEY = 'trackmyfin_feed';
  var feedGet = function () { var f = read(FEED_KEY, []); return Array.isArray(f) ? f : []; };
  function updateBadge() {
    var n = feedGet().filter(function (x) { return !x.read; }).length;
    [].forEach.call(document.querySelectorAll('[data-nav-badge]'), function (b) { b.textContent = n; b.hidden = !n; });
  }
  function addFeed(it) {
    var f = feedGet(); if (it.key && f.some(function (x) { return x.key === it.key; })) return false;
    f.unshift(Object.assign({ id: Date.now() + '' + Math.floor(Math.random() * 999), ts: Date.now(), read: false, seen: false }, it));
    write(FEED_KEY, f.slice(0, 120)); updateBadge(); return true;
  }
  function notify(o) { notice(o.icon, o.html); addFeed({ key: o.key, type: o.type, title: o.title, body: o.html, why: o.why, actions: o.actions || [] }); }

  
  function dialog(o) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div'); ov.className = 'tmf-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      ov.innerHTML = '<div class="tmf-box"><h3>' + esc(o.title) + '</h3>' + (o.body ? '<p>' + o.body + '</p>' : '') + (o.list && o.list.length ? '<ul>' + o.list.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '') + (o.note ? '<p class="tmf-note">' + o.note + '</p>' : '') +
        '<div class="tmf-btns">' + o.buttons.map(function (b, i) { return '<button class="' + (b.danger ? 'btn-danger-solid' : b.primary ? 'btn-primary' : 'btn-soft') + '" data-i="' + i + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
      document.body.appendChild(ov);
      function close(v) { ov.remove(); document.removeEventListener('keydown', key); resolve(v); }
      function key(e) { if (e.key === 'Escape') close(o.cancelValue); }
      ov.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) close(o.buttons[+b.dataset.i].value); else if (e.target === ov) close(o.cancelValue); });
      document.addEventListener('keydown', key);
      var f = ov.querySelector('.btn-primary,.btn-danger-solid') || ov.querySelector('[data-i]'); if (f) f.focus();
    });
  }
  function confirmDialog(o) { return dialog({ title: o.title, body: o.body, list: o.list, note: o.note, cancelValue: false, buttons: [{ label: o.cancel || 'Cancel', value: false }, { label: o.confirm || 'Confirm', value: true, danger: o.danger, primary: !o.danger }] }); }

  
  function prefs() { return Object.assign({ weekly: true, budget: true, goal: true }, read('trackmyfin_notifications', {}) || {}); }
  function notice(icon, html) {
    var c = document.querySelector('.container'), nav = c && c.querySelector('.top-nav'); if (!nav) return;
    var el = document.createElement('div'); el.className = 'notice'; el.setAttribute('role', 'status');
    el.innerHTML = '<span class="ico"><i class="fas ' + icon + '"></i></span><p>' + html + '</p><button class="icon-btn" aria-label="Dismiss"><i class="fas fa-xmark"></i></button>';
    el.querySelector('button').addEventListener('click', function () { el.remove(); });
    nav.insertAdjacentElement('afterend', el);
    return el;
  }
  function once(id) { var log = read('trackmyfin_alert_log', {}) || {}; if (log[id]) return false; log[id] = 1; write('trackmyfin_alert_log', log); return true; }

  function customCats() {
    var c = read('trackmyfin_custom_categories', []);
    return (Array.isArray(c) ? c : []).map(function (x) { return typeof x === 'object' ? { name: x.name, color: x.color || '#6058a3' } : { name: x, color: '#6058a3' }; });
  }
  var customLimits = function () { return read('trackmyfin_custom_limits', {}) || {}; };

  function budgetState(ym) {
    var names = ['Essential', 'Lifestyle', 'Financial'].concat(customCats().map(function (c) { return c.name; })), spent = {};
    names.forEach(function (n) { spent[n] = 0; });
    txs().forEach(function (t) {
      var a = amt(t); if (a >= 0 || !t.date || t.date.slice(0, 7) !== ym) return;
      if (spent[t.category] !== undefined) spent[t.category] += Math.abs(a);
    });
    return { cats: names, spent: spent };
  }
  function limitFor(name) {
    var b = read('trackmyfin_budgets', {}) || {}, k = name.toLowerCase();
    return (k === 'essential' || k === 'lifestyle' || k === 'financial') ? (b[k] || 0) : (customLimits()[name] || 0);
  }

  function checkBudgetAlerts() {
    if (!prefs().budget) return;
    var ym = cur(), st = budgetState(ym), hid = read('trackmyfin_budget_hidden', []) || [];
    st.cats.forEach(function (c) {
      if (hid.indexOf(c) >= 0) return;
      var lim = limitFor(c); if (!lim) return;
      var pct = st.spent[c] / lim * 100, lvl = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
      if (lvl && once('budget:' + c + ':' + ym + ':' + lvl)) notify({
        type: 'budget', icon: 'fa-bell', title: lvl === 100 ? 'Budget limit reached' : 'Budget warning',
        html: lvl === 100 ? '<b>' + esc(c) + '</b> has passed its ' + money(lim) + ' limit this month (' + Math.round(pct) + '%).' : '<b>' + esc(c) + '</b> has reached ' + Math.round(pct) + '% of its ' + money(lim) + ' limit this month.',
        why: 'Based on your ' + c + ' spending in ' + monthName(ym) + ' compared with your ' + money(lim) + ' limit.',
        actions: [{ label: 'View budget', href: 'budget.html', primary: true }, { label: 'Ask Fin', ask: 'My ' + c + ' category is at ' + Math.round(pct) + '% of its limit. How can I rebalance?' }]
      });
    });
  }
  
  var GOALS_KEY = 'trackmyfin_goals_v2';
  function goals() {
    var g = read(GOALS_KEY, null);
    if (!Array.isArray(g)) {                                   // one-time move from the old single goal
      var old = read('trackmyfin_savings', null);
      g = (old && old.target) ? [{ id: Date.now(), name: old.name, target: old.target, saved: old.saved || 0, priority: true }] : [];
      write(GOALS_KEY, g);
    }
    return g;
  }
  function priorityGoal() { var g = goals(); return g.filter(function (x) { return x.priority; })[0] || g[0] || null; }
  function gpct(g) { return g.target ? Math.min(100, Math.round((g.saved || 0) / g.target * 100)) : 0; }
  function goalForm(g) {
    return '<div class="goal-edit"><div class="goal-form"><input type="text" data-f="name" placeholder="Goal name (e.g., Cape Town escape)" aria-label="Goal name"><input type="number" min="0" data-f="target" placeholder="Target amount (R)" aria-label="Target amount"><input type="number" min="0" data-f="saved" placeholder="Saved so far (optional)" aria-label="Saved so far">' +
      '<div class="goal-btns"><button class="btn-primary" data-act="save" data-id="' + (g ? g.id : 'new') + '">Save goal</button>' + (g || goals().length ? '<button class="link-soft" data-act="cancel">Cancel</button>' : '') + '</div></div></div>';
  }
  function goalMeta(g) { var p = gpct(g), over = (g.saved || 0) - g.target; return '<div class="goal-meta"><span>' + (p >= 100 ? 'Goal reached' + (over > 0 ? ' \u00B7 ' + money(over) + ' over' : '') : money(Math.max(g.target - (g.saved || 0), 0)) + ' to go') + '</span><span>' + (p >= 100 ? 'Well done' : 'Keep going') + '</span></div>'; }
  function goalAdd(g) { return '<div class="goal-add"><input type="number" min="0" step="any" data-amt="' + g.id + '" placeholder="Amount to add (R)" aria-label="Amount to add to ' + escA(g.name) + '"><button class="btn-soft" data-act="add" data-id="' + g.id + '">Add</button></div>'; }
  var goalFold = function () { return read('trackmyfin_goal_collapsed', {}) || {}; };
  function goalItem(g) {
    var p = gpct(g), fold = !!goalFold()[g.id];
    return '<div class="goal-item' + (g.priority ? ' is-priority' : '') + (fold ? ' is-folded' : '') + '"><div class="goal-row"><button class="goal-chev" data-act="toggle" data-id="' + g.id + '" aria-expanded="' + (!fold) + '" aria-label="' + (fold ? 'Expand ' : 'Collapse ') + escA(g.name) + '"><i class="fas fa-chevron-' + (fold ? 'down' : 'up') + '"></i></button>' +
      '<div class="goal-ttl"><h4>' + esc(g.name) + (g.priority ? ' <span class="pill sm">Priority</span>' : '') + '</h4>' + (fold ? '' : '<p class="sub">' + money(g.saved || 0) + ' saved of ' + money(g.target) + '</p>') + '</div><span class="goal-pct">' + p + '%</span></div>' +
      '<div class="track"><i style="width:' + p + '%"></i></div>' +
      (fold ? '' : goalMeta(g) + goalAdd(g) + '<div class="goal-links"><button class="link-soft" data-act="edit" data-id="' + g.id + '">Edit</button>' + (g.priority ? '' : '<button class="link-soft" data-act="prio" data-id="' + g.id + '">Make priority</button>') + '<button class="link-danger" data-act="remove" data-id="' + g.id + '">Remove</button></div>') + '</div>';
  }
  function goalActions(root, st, rerender) {
    function fill(id) {
      var f = root.querySelector('.goal-edit'), g = goals().filter(function (x) { return String(x.id) === String(id); })[0]; if (!f || !g) return;
      f.querySelector('[data-f=name]').value = g.name; f.querySelector('[data-f=target]').value = g.target; f.querySelector('[data-f=saved]').value = g.saved || '';
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b)) return;
      var act = b.dataset.act, id = b.dataset.id, gs = goals(), g = gs.filter(function (x) { return String(x.id) === String(id); })[0];
      if (act === 'add') {
        var inp = root.querySelector('[data-amt="' + id + '"]'), v = parseFloat(inp && inp.value);
        if (!g) return; if (!v || v <= 0) { toast('Enter an amount to add', 'warning'); if (inp) inp.focus(); return; }
        g.saved = Math.round(((g.saved || 0) + v) * 100) / 100; write(GOALS_KEY, gs); toast('Added ' + money(v) + ' to ' + g.name, 'success'); rerender(); checkGoal();
      } else if (act === 'toggle') { var m = goalFold(); if (m[id]) delete m[id]; else m[id] = 1; write('trackmyfin_goal_collapsed', m); rerender(); }
      else if (act === 'toggleall') { var all = goals(), fm = goalFold(), nm = {}; if (!(all.length && all.every(function (x) { return fm[x.id]; }))) all.forEach(function (x) { nm[x.id] = 1; }); write('trackmyfin_goal_collapsed', nm); rerender(); }
      else if (act === 'togglelist') { localStorage.setItem('trackmyfin_goal_list_closed', localStorage.getItem('trackmyfin_goal_list_closed') === '1' ? '0' : '1'); rerender(); }
      else if (act === 'edit') { st.edit = id; rerender(); }
      else if (act === 'new') { st.edit = 'new'; localStorage.setItem('trackmyfin_goal_list_closed', '0'); rerender(); }
      else if (act === 'cancel') { st.edit = null; rerender(); }
      else if (act === 'prio') { gs.forEach(function (x) { x.priority = String(x.id) === String(id); }); write(GOALS_KEY, gs); rerender(); }
      else if (act === 'remove') {
        if (!g || !confirm('Remove the goal "' + g.name + '"?')) return;
        gs = gs.filter(function (x) { return x !== g && String(x.id) !== String(id); }); if (gs.length && !gs.some(function (x) { return x.priority; })) gs[0].priority = true;
        write(GOALS_KEY, gs); st.edit = null; rerender(); toast('Goal removed');
      } else if (act === 'save') {
        var f = b.closest('.goal-edit'), name = f.querySelector('[data-f=name]').value.trim(), target = parseFloat(f.querySelector('[data-f=target]').value), saved = parseFloat(f.querySelector('[data-f=saved]').value) || 0;
        if (!name || !target || target <= 0) { toast('Give your goal a name and a target amount', 'warning'); return; }
        if (id === 'new') { gs.push({ id: Date.now(), name: name, target: target, saved: saved, priority: !gs.length }); toast('Goal added', 'success'); }
        else if (g) { g.name = name; g.target = target; g.saved = saved; toast('Goal updated', 'success'); }
        write(GOALS_KEY, gs); st.edit = null; rerender(); checkGoal();
      }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-amt]')) { var a = root.querySelector('[data-act="add"][data-id="' + e.target.dataset.amt + '"]'); if (a) a.click(); }
      else if (e.target.matches('[data-f]')) { var sv = root.querySelector('[data-act="save"]'); if (sv) sv.click(); }
    });
    return fill;
  }
  function checkGoal() {
    if (!prefs().goal) return;
    goals().forEach(function (g) {
      if (!g.target) return;
      var p = Math.floor((g.saved || 0) / g.target * 100), hit = 0, first = once('goalseen:' + g.id);   // first sighting = baseline, no banner
      [25, 50, 75, 100].forEach(function (t) { if (p >= t && once('goal:' + g.id + ':' + t) && !first) hit = t; });
      if (hit) notify({ type: 'goals', icon: 'fa-flag-checkered', title: hit === 100 ? 'Goal reached' : 'Goal milestone reached',
        html: hit === 100 ? 'You reached your goal: <b>' + esc(g.name) + '</b>. Well done!' : 'Your <b>' + esc(g.name) + '</b> goal is now ' + hit + '% complete.',
        why: 'Based on ' + money(g.saved || 0) + ' saved toward your ' + money(g.target) + ' target.', actions: [{ label: 'View goals', href: 'budget.html#goal', primary: true }] });
    });
  }
    function checkWeekly() {
    if (!prefs().weekly || !txs().length) return;
    var now = new Date(), today = todayStr();
    var last = localStorage.getItem('trackmyfin_last_checkin'), days = last ? Math.round((new Date(today) - new Date(last)) / 864e5) : 99;
    if (last === today || !(now.getDay() === 0 || days >= 7)) return;
    var from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), inn = 0, out = 0;
    txs().forEach(function (t) { if (!t.date) return; var d = new Date(t.date + 'T00:00:00'); if (d >= from && d <= now) { if (isInc(t)) inn += Math.abs(amt(t)); else out += Math.abs(amt(t)); } });
    localStorage.setItem('trackmyfin_last_checkin', today);
    notify({ type: 'fin', icon: 'fa-mug-hot', title: 'Your weekly check-in', key: 'weekly:' + today,
      html: inn || out ? 'In the last 7 days you brought in ' + money(inn) + ' and spent ' + money(out) + '.' : 'No activity logged this week. A minute adding transactions keeps your plan accurate.',
      why: 'Based on your transactions from the last 7 days.', actions: [{ label: 'Ask Fin', ask: 'Explain my spending this week.', primary: true }] });
  }

  
  function dueInfo(d) {
    var day = (read('trackmyfin_debt_due', {}) || {})[d.id]; if (!day) return null;
    var n = new Date(), y = n.getFullYear(), m = n.getMonth(), last = function (yy, mm) { return new Date(yy, mm + 1, 0).getDate(); };
    var dt = new Date(y, m, Math.min(day, last(y, m))); n.setHours(0, 0, 0, 0);
    if (dt < n) dt = new Date(y, m + 1, Math.min(day, last(y, m + 1)));
    return { date: dt, days: Math.round((dt - n) / 864e5), day: day };
  }
  function dueReminders() {
    (read('trackmyfin_debts', []) || []).forEach(function (d) {
      var i = dueInfo(d); if (!i || i.days > 3) return;
      addFeed({ key: 'due:' + d.id + ':' + i.date.toISOString().slice(0, 10), type: 'payments', title: 'Payment approaching',
        body: 'Your <b>' + esc(d.name) + '</b> payment is due ' + (i.days === 0 ? 'today' : i.days === 1 ? 'tomorrow' : 'in ' + i.days + ' days') + '.',
        why: 'Based on the due day (the ' + ord(i.day) + ') you set for this debt.', actions: [{ label: 'View debt', href: 'debt.html', primary: true }, { label: 'Mark as paid', href: 'debt.html#pay' }] });
    });
  }

  
  function initials(n) { return (n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('') || 'TM'; }
  function common() {
    var p = read('trackmyfin_profile', {}) || {}, name = (p.name && p.name !== 'User') ? p.name : '';
    var nm = $('navName'), av = $('navAvatar');
    if (nm) nm.textContent = name || 'Welcome';
    if (av) av.textContent = initials(name);
    var navT = $('navToggle'), top = document.querySelector('.top-nav');
    if (navT && top) {
      var shut = function () { top.classList.remove('open'); navT.setAttribute('aria-expanded', 'false'); navT.innerHTML = '<i class="fas fa-bars"></i>'; };
      navT.addEventListener('click', function (e) { e.stopPropagation(); var o = top.classList.toggle('open'); navT.setAttribute('aria-expanded', o ? 'true' : 'false'); navT.innerHTML = o ? '<i class="fas fa-xmark"></i>' : '<i class="fas fa-bars"></i>'; });
      document.addEventListener('click', function (e) { if (!top.contains(e.target)) shut(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
    }
    dueReminders(); updateBadge();
    var mo = read('trackmyfin_motion', {}) || {};
    if (!localStorage.getItem('trackmyfin_fin_pref_reset')) { mo.fin = true; write('trackmyfin_motion', mo); localStorage.setItem('trackmyfin_fin_pref_reset', '1'); }
    document.body.classList.toggle('no-waves', mo.waves === false); document.body.classList.toggle('no-fin', mo.fin === false);
    var st = $('dataStamp');
    if (st) {
      var paint = function () {
        var t = +localStorage.getItem('trackmyfin_last_updated');
        if (!t) { st.textContent = txs().length ? 'Data stored on this device' : 'No data saved yet'; return; }
        var m = Math.floor((Date.now() - t) / 60000);
        st.textContent = 'Data updated ' + (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : new Date(t).getDate() + ' ' + MONTHS[new Date(t).getMonth()].slice(0, 3));
      };
      paint(); setInterval(paint, 30000);
    }
  }

  
  function dashboard() {
    if (!$('categoryChart')) return;
    var now = new Date(), h = now.getHours(), p = read('trackmyfin_profile', {}) || {};
    var first = (p.name && p.name !== 'User') ? p.name.split(' ')[0] : '';
    $('greeting').textContent = 'Good ' + (h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening') + (first ? ', ' + first : '') + '.';
    $('todayLabel').textContent = DAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()];
    bindComposer('openComposer', 'composer', 'closeComposer', 'descInput');
    ['incomeAmount', 'expenseAmount', 'remainingAmount'].forEach(function (id) { watch($(id), function () { fmt($(id)); }); });


    var view = getView(true);
    var inView = function (t) { return view === 'all' || (t.date || '').slice(0, 7) === view; };
    ['updateDashboardSummary', 'updateChart', 'updateTransactionList'].forEach(function (n) {
      var orig = window[n]; if (typeof orig !== 'function') return;
      window[n] = function () { var full = transactions; transactions = full.filter(inView); try { return orig.apply(this, arguments); } finally { transactions = full; } };
    });

    function setDelta(id, a, b, upGood) {
      var el = $(id); if (!el) return;
      if (!b) { el.textContent = a ? (view === cur() ? 'This month so far' : 'No earlier month to compare') : 'Nothing recorded'; return; }
      var pct = (a - b) / b * 100, good = upGood ? pct >= 0 : pct <= 0;
      el.innerHTML = '<b class="' + (good ? 'pos' : 'neg') + '">' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%</b> from ' + (view === cur() ? 'last month' : monthName(prevYM(view)));
    }
    function deltas() {
      if (view === 'all') { $('incomeDelta').textContent = 'Across all months'; $('expenseDelta').textContent = 'Across all months'; $('availableNote').textContent = 'Income minus spending'; return; }
      var c = monthTotals(view), pv = monthTotals(prevYM(view)), net = c.income - c.expense, mn = monthName(view);
      setDelta('incomeDelta', c.income, pv.income, true); setDelta('expenseDelta', c.expense, pv.expense, false);
      $('availableNote').textContent = view === cur() ? (net >= 0 ? 'On track for ' : 'Over plan for ') + mn : (net >= 0 ? 'Left over in ' : 'Overspent in ') + mn;
    }
    function relabel() {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      document.querySelectorAll('#transactionList .transaction-item > span:first-child').forEach(function (s) {
        var t = s.textContent.trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return;
        var d = new Date(t + 'T00:00:00'), diff = Math.round((today - d) / 864e5), row = s.parentNode, a = row.children[2];
        s.title = t;
        s.textContent = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
        if (a && !a.dataset.fmt) { var m = /R([\d.]+)/.exec(a.textContent), pos = /^\s*\+/.test(a.textContent); if (m) { a.textContent = (pos ? '+' : '-') + money(parseFloat(m[1])); a.dataset.fmt = '1'; } }
      });
    }
    var msw = null;
    function emptyHint() {
      var es = document.querySelector('#transactionList .empty-state'); if (!es || es.dataset.hint || !msw || view === 'all' || !txs().length) return;
      es.dataset.hint = '1';
      es.innerHTML = '<i class="fas fa-inbox"></i> Nothing to show for ' + viewLabel(view).toLowerCase() + '. Your other transactions are safe. <button class="link-soft" data-showall style="text-decoration:underline;font-weight:600">Show all time</button>';
      es.querySelector('[data-showall]').addEventListener('click', function () { msw.set('all'); });
    }
    watch($('transactionList'), function () { relabel(); deltas(); emptyHint(); });
    watch($('breakdownList'), function () {
      var items = [].slice.call(document.querySelectorAll('#breakdownList .breakdown-item'));
      var vals = items.map(function (i) { return parseFloat((i.querySelector('.breakdown-amount').textContent || '').replace(/[^0-9.-]/g, '')) || 0; });
      var total = vals.reduce(function (a, b) { return a + b; }, 0);
      items.forEach(function (it, i) {
        fmt(it.querySelector('.breakdown-amount'));
        var lab = it.querySelector('.breakdown-label');
        if (lab && !lab.querySelector('.pct')) { var s = document.createElement('small'); s.className = 'pct'; s.textContent = (total ? Math.round(vals[i] / total * 100) : 0) + '% of spending'; lab.appendChild(s); }
      });
      var c = $('donutTotal'); if (c) c.textContent = money(total);
    });
    function refresh() {
      updateDashboardSummary(); updateTransactionList(); updateChart(); deltas();
      $('donutSub').textContent = view === 'all' ? 'in total' : view === cur() ? 'this month' : 'in ' + monthName(view);
    }
    msw = bindMonthSwitch(true, function (v) { view = v; refresh(); });
    refresh();
    /* After a statement import, jump to the month it covers so you can see what you just added */
    var pio = window.processImportedTransactions;
    if (typeof pio === 'function') window.processImportedTransactions = function (rows) {
      var res = pio.apply(this, arguments);
      try {
        var cnt = {}, n = 0; (rows || []).forEach(function (r) { var k = (r.date || '').slice(0, 7); if (k) { cnt[k] = (cnt[k] || 0) + 1; n++; } });
        var keys = Object.keys(cnt), best = keys.slice().sort(function (a, b) { return cnt[b] - cnt[a] || (a < b ? 1 : -1); })[0];
        if (best && msw) {
          msw.set(best);
          var el = notice('fa-file-import', 'Imported <b>' + n + '</b> transaction' + (n === 1 ? '' : 's') + (keys.length > 1 ? ' across ' + keys.length + ' months' : '') + '. Showing <b>' + monthName(best) + ' ' + best.slice(0, 4) + '</b>. <button class="link-soft" data-showall style="text-decoration:underline;font-weight:600">Show all time</button>');
          if (el) el.querySelector('[data-showall]').addEventListener('click', function () { msw.set('all'); el.remove(); });
        }
      } catch (e) { console.warn('import jump', e); }
      return res;
    };

    /* priority goal card: your first goal, with any amount you like */
    var gst = { edit: null }, fillCard;
    function renderGoal() {
      var box = $('priorityGoal'), gs = goals(), g = priorityGoal(); if (!box) return;
      var editing = (g && gst.edit && gst.edit !== 'new' && String(gst.edit) === String(g.id)) ? g : null;
      if (!g || gst.edit === 'new' || editing) {
        box.innerHTML = '<div class="goal-top"><span class="ico"><i class="fas fa-bullseye"></i></span></div><p class="eyebrow">Your priority goal</p><h3>' + (editing ? 'Edit your goal' : gs.length ? 'Add another goal' : 'Set a goal') + '</h3>' +
          '<p class="sub">' + (editing ? 'Change the name, target or what you have saved.' : 'Name something you are saving for. It shows here and on Budget.') + '</p>' + goalForm(editing);
        if (editing) fillCard(editing.id); return;
      }
      var p = gpct(g), others = gs.length - 1;
      box.innerHTML = '<div class="goal-top"><span class="ico"><i class="fas fa-bullseye"></i></span><span class="pill sm">' + p + '% complete</span></div><p class="eyebrow">Your priority goal</p><h3></h3><p class="sub">A little closer with every smart choice.</p>' +
        '<div class="goal-fig">' + money(g.saved || 0) + '<small>of ' + money(g.target) + '</small></div><div class="track"><i style="width:' + p + '%"></i></div>' + goalMeta(g) + goalAdd(g) +
        '<div class="goal-links"><button class="link-soft" data-act="edit" data-id="' + g.id + '">Edit goal</button><button class="link-soft" data-act="new">New goal</button>' + (others ? '<a class="link-soft" href="budget.html#goal">' + others + ' more</a>' : '') + '</div>';
      box.querySelector('h3').textContent = g.name;
    }
    fillCard = goalActions($('priorityGoal'), gst, renderGoal);
    renderGoal();
    checkBudgetAlerts(); checkGoal(); checkWeekly();
  }

  
  function budget() {
    if (!$('budgetEssential')) return;
    var rows = [['Essential', 'budgetEssential', 'essential'], ['Lifestyle', 'budgetLifestyle', 'lifestyle'], ['Financial', 'budgetFinancial', 'financial']];
    var sw;
    function paintRow(spEl, bar, sp, limit) {
      spEl.textContent = money(sp) + ' spent';
      var pct = limit ? sp / limit * 100 : 0; bar.style.width = Math.min(pct, 100) + '%'; bar.classList.toggle('over', pct > 100);
    }
    function render() {
      var ym = getView(false), st = budgetState(ym), total = 0, used = 0, count = 0;
      rows.forEach(function (r) {
        var rowEl = $('bar-' + r[2]).closest('.limit-row');
        if (hiddenCats().indexOf(r[0]) >= 0) { rowEl.hidden = true; return; }
        rowEl.hidden = false;
        var limit = parseFloat($(r[1]).value) || 0, sp = st.spent[r[0]];
        total += limit; used += sp; if (limit > 0) count++; paintRow($('spent-' + r[2]), $('bar-' + r[2]), sp, limit);
      });
      [].forEach.call(document.querySelectorAll('#customLimitRows .limit-row'), function (r) {
        var limit = parseFloat(r.querySelector('input').value) || 0, sp = st.spent[r.dataset.name] || 0;
        total += limit; used += sp; if (limit > 0) count++; paintRow(r.querySelector('.sp'), r.querySelector('.fill'), sp, limit);
      });
      paintRemoved();
      $('monthLabel').textContent = monthName(ym) + ' ' + ym.slice(0, 4) + ' spending plan';
      $('bTotal').textContent = money(total);
      $('bTotalNote').textContent = 'Across ' + count + ' categor' + (count === 1 ? 'y' : 'ies');
      $('bUsed').textContent = money(used);
      var up = total ? Math.round(used / total * 100) : 0;
      $('bUsedNote').innerHTML = '<b class="' + (up > 90 ? 'neg' : 'pos') + '">' + up + '%</b> of your plan';
      var left = total - used; $('bLeft').textContent = money(left);
      var n = new Date();
      if (ym === cur()) {
        var days = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() - n.getDate() + 1;
        $('safeDay').innerHTML = money(Math.max(left, 0) / days) + '<small>/ day</small>';
        $('safeNote').textContent = 'Based on your remaining plan until the end of ' + MONTHS[n.getMonth()] + '.';
      } else { $('safeDay').innerHTML = '\u2014'; $('safeNote').textContent = 'The daily allowance only applies to the current month.'; }
      var hint = $('monthHint'), others = null;
      if (used === 0) {
        var ms = txs().filter(function (t) { return amt(t) < 0 && t.date && t.date.slice(0, 7) !== ym; }).map(function (t) { return t.date.slice(0, 7); }).sort();
        others = ms.length ? ms[ms.length - 1] : null;
      }
      if (others) {
        hint.hidden = false;
        hint.innerHTML = '<i class="fas fa-circle-info"></i> No spending recorded for ' + monthName(ym) + '. Your latest expenses are from <b>' + monthName(others) + ' ' + others.slice(0, 4) + '</b>. <button class="link-soft" id="hintGo">View ' + monthName(others) + '</button>';
        $('hintGo').addEventListener('click', function () { sw.set(others); });
      } else hint.hidden = true;
    }
    function rebuildCustom() {
      var box = $('customLimitRows'), cats = customCats(), lims = customLimits();
      box.innerHTML = cats.map(function (c, i) {
        return '<div class="limit-row custom" data-i="' + i + '" data-name="' + escA(c.name) + '">' +
          '<span class="ico" style="background:' + c.color + '2e;color:' + c.color + '"><i class="fas fa-wallet"></i></span>' +
          '<div class="nm"><strong>' + esc(c.name) + '</strong><small class="sp">R&nbsp;0 spent</small></div>' +
          '<div class="track"><i class="fill" style="width:0%;background:' + c.color + '"></i></div>' +
          '<label class="limit-in">Limit <input type="number" min="0" value="' + (lims[c.name] || '') + '" placeholder="0" aria-label="' + escA(c.name) + ' limit"></label>' +
          '<button class="x-btn" aria-label="Remove ' + escA(c.name) + '"><i class="fas fa-xmark"></i></button></div>';
      }).join('');
      [].forEach.call(box.querySelectorAll('.limit-row'), function (r) {
        var inp = r.querySelector('input');
        inp.addEventListener('input', render);
        inp.addEventListener('change', function () { var l = customLimits(); l[r.dataset.name] = parseFloat(inp.value) || 0; write('trackmyfin_custom_limits', l); render(); checkBudgetAlerts(); });
        r.querySelector('.x-btn').addEventListener('click', function () {
          var name = r.dataset.name;
          if (!confirm('Remove "' + name + '" from your budget? Past transactions keep their label.')) return;
          if (typeof removeCustomCategory === 'function') removeCustomCategory(+r.dataset.i);
          var l = customLimits(); delete l[name]; write('trackmyfin_custom_limits', l);
          rebuildCustom(); render();
        });
      });
    }

    var timer;
    rows.forEach(function (r) {
      var el = $(r[1]);
      el.addEventListener('input', render);
      el.addEventListener('change', function () { clearTimeout(timer); timer = setTimeout(function () { if (typeof saveBudgets === 'function') saveBudgets(); render(); checkBudgetAlerts(); }, 150); });
    });
    var LABELS = { Essential: 'Home & essentials', Lifestyle: 'Lifestyle', Financial: 'Future you' };
    function hiddenCats() { var h = read('trackmyfin_budget_hidden', []); return Array.isArray(h) ? h : []; }
    function paintRemoved() {
      var box = $('removedRows'), h = hiddenCats(); box.hidden = !h.length;
      box.innerHTML = h.length ? '<span>Removed from your plan:</span>' + h.map(function (c) { return '<button class="chip-add" data-restore="' + c + '"><i class="fas fa-plus"></i> ' + LABELS[c] + '</button>'; }).join('') : '';
    }
    [].forEach.call(document.querySelectorAll('[data-clear]'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-clear'), r = rows.filter(function (x) { return x[1] === id; })[0], h = hiddenCats();
        $(id).value = ''; if (h.indexOf(r[0]) < 0) h.push(r[0]); write('trackmyfin_budget_hidden', h);
        if (typeof saveBudgets === 'function') saveBudgets();                      // stores the limit as 0 (app.js)
        render(); toast('\u201C' + LABELS[r[0]] + '\u201D removed from your plan. Your transactions keep their category.', 'success');
      });
    });
    $('removedRows').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-restore]'); if (!btn) return;
      write('trackmyfin_budget_hidden', hiddenCats().filter(function (x) { return x !== btn.dataset.restore; }));
      render(); toast('\u201C' + LABELS[btn.dataset.restore] + '\u201D added back. Set a limit to start tracking it.', 'success');
      $(rows.filter(function (x) { return x[0] === btn.dataset.restore; })[0][1]).focus();
    });

    /* Create category: panel opens in place, new row lands in Category limits */
    var toggleCat = bindComposer('openCatPanel', 'catPanel', 'closeCatPanel', 'newCategoryName', function (show) {
      $('openCatPanel').innerHTML = show ? '<i class="fas fa-xmark"></i> Close' : '<i class="fas fa-plus"></i> Create category';
    });
    $('addCatBtn').addEventListener('click', function () {
      var name = $('newCategoryName').value.trim(), lim = parseFloat($('newCategoryLimit').value) || 0;
      if (!name) { toast('Give the category a name', 'warning'); $('newCategoryName').focus(); return; }
      if (['essential', 'lifestyle', 'financial', 'income'].indexOf(name.toLowerCase()) >= 0) { toast('That name is already used by a built-in category', 'warning'); return; }
      var before = customCats().length;
      if (typeof addCustomCategory === 'function') addCustomCategory();            // app.js: validates, saves, updates everything
      var all = read('trackmyfin_custom_categories', []);
      if (all.length <= before) return;                                             // duplicate: app.js already told the user
      var last = all[all.length - 1]; if (typeof last === 'object') { last.color = ($('newCategoryColor') && $('newCategoryColor').value) || PALETTE[(all.length - 1) % PALETTE.length]; write('trackmyfin_custom_categories', all); }
      var l = customLimits(); l[name] = lim; write('trackmyfin_custom_limits', l);
      $('newCategoryLimit').value = ''; rebuildCustom(); render(); checkBudgetAlerts();
      $('newCategoryName').focus();
    });

    /* savings goals */
    var bst = { edit: null }, fillList;
    function renderGoals() {
      var box = $('goalList'), all = goals(), gs = all.slice().sort(function (x, y) { return (y.priority ? 1 : 0) - (x.priority ? 1 : 0); }), h = '';
      var closed = localStorage.getItem('trackmyfin_goal_list_closed') === '1', fold = goalFold(), lt = $('goalToggleList'), la = $('goalToggleAll');
      if (lt) { lt.setAttribute('aria-expanded', closed ? 'false' : 'true'); lt.setAttribute('aria-label', closed ? 'Show savings goals' : 'Hide savings goals'); lt.innerHTML = '<i class="fas fa-chevron-' + (closed ? 'down' : 'up') + '"></i>'; }
      if (la) { la.hidden = closed || !all.length; la.textContent = (all.length && all.every(function (x) { return fold[x.id]; })) ? 'Expand all' : 'Collapse all'; }
      if (closed && bst.edit !== 'new') {
        var sv = all.reduce(function (s, x) { return s + (x.saved || 0); }, 0), tg = all.reduce(function (s, x) { return s + (x.target || 0); }, 0);
        box.innerHTML = '<p class="goal-summary"><b>' + all.length + ' goal' + (all.length === 1 ? '' : 's') + '</b> \u00B7 ' + money(sv) + ' saved of ' + money(tg) + '</p>'; return;
      }
      if (bst.edit === 'new') h += '<div class="goal-item">' + goalForm(null) + '</div>';
      if (!gs.length && bst.edit !== 'new') h += '<div class="empty-state"><i class="fas fa-piggy-bank"></i> No savings goals yet. Add one to start tracking.</div>';
      gs.forEach(function (g) { h += String(bst.edit) === String(g.id) ? '<div class="goal-item">' + goalForm(g) + '</div>' : goalItem(g); });
      box.innerHTML = h; if (bst.edit && bst.edit !== 'new') fillList(bst.edit);
    }
    fillList = goalActions($('goalSection'), bst, renderGoals);
    renderGoals();
    $('exportBudgetBtn').addEventListener('click', function () {
      var ym = getView(false), st = budgetState(ym), csv = 'Category,Limit,Spent,Remaining\n';
      st.cats.forEach(function (c) { var l = limitFor(c); csv += '"' + c + '",' + l + ',' + st.spent[c].toFixed(2) + ',' + (l - st.spent[c]).toFixed(2) + '\n'; });
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'budget_' + ym + '.csv'; a.click(); URL.revokeObjectURL(a.href); toast('Budget exported', 'success');
    });
    sw = bindMonthSwitch(false, function () { render(); });
    rebuildCustom(); render(); checkBudgetAlerts(); checkGoal();
  }

  
  function debt() {
    if (!$('debtList')) return;
    bindComposer('openDebtComposer', 'debtComposer', 'closeDebtComposer', 'debtName');
    var togglePay = bindComposer('openPayComposer', 'payComposer', 'closePayComposer', 'payAmount');
    var list = $('debtList'), bud = $('monthlyDebtBudget');
    var debtsNow = function () { return read('trackmyfin_debts', []); };
    var pays = function () { return read('trackmyfin_debt_payments', []); };
    var paidFor = function (id) { return pays().filter(function (p) { return p.debtId === id; }).reduce(function (s, p) { return s + p.amount; }, 0); };

    function whatIf() {
      var b = parseFloat(bud.value) || 0, x = parseFloat($('extraPay').value) || 0, out = $('extraResult');
      if (!debtsNow().length) { out.textContent = 'Add a debt to try this.'; return; }
      if (b <= 0) { out.textContent = 'Enter your monthly payment budget above first.'; return; }
      if (x <= 0) { out.textContent = 'Type an extra amount to see how much sooner you could be debt-free.'; return; }
      var a = calculateTimelineForMethod(b, 'avalanche'), c = calculateTimelineForMethod(b + x, 'avalanche');
      if (a.error || c.error) { out.textContent = 'Your budget is too low to cover the minimum payments.'; return; }
      var saved = Math.max(a.totalInterest - c.totalInterest, 0), faster = a.months - c.months;
      if (faster > 0) out.innerHTML = 'Paying <b>' + money(x) + '</b> more each month clears your debt <b>' + faster + ' month' + (faster === 1 ? '' : 's') + ' sooner</b> (' + fmtMonths(c.months) + ' instead of ' + fmtMonths(a.months) + ') and saves about <b>' + money(saved) + '</b> in interest.';
      else if (saved >= 1) out.innerHTML = 'At ' + money(b) + ' a month you are already debt-free in <b>' + fmtMonths(a.months) + '</b>. An extra ' + money(x) + ' won\u2019t shorten that, but it saves about <b>' + money(saved) + '</b> in interest.';
      else out.innerHTML = 'At ' + money(b) + ' a month you are already debt-free in <b>' + fmtMonths(a.months) + '</b>. Extra payments won\u2019t change that, so that money could go toward a savings goal instead.';
    }
    function deadline() {
      var out = $('deadlineResult'), v = $('targetDate').value, debts = debtsNow();
      if (!debts.length) { out.textContent = 'Add a debt to try this.'; return; }
      if (!v) { out.textContent = 'Pick a date and I\u2019ll work out what you would need to pay each month.'; return; }
      var now = new Date(), d = new Date(v + 'T00:00:00');
      if (d <= now) { out.textContent = 'Choose a date in the future.'; return; }
      var n = Math.max(1, Math.floor((d - now) / (30.4375 * 864e5)));
      var total = debts.reduce(function (s, x) { return s + x.balance; }, 0), lo = 0, hi = total * 1.5 + 1000;
      var ok = function (B) { var r = calculateTimelineForMethod(B, 'avalanche'); return !r.error && r.months <= n; };
      for (var i = 0; i < 32; i++) { var mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      var need = Math.ceil(hi / 10) * 10, r = calculateTimelineForMethod(need, 'avalanche'), b = parseFloat(bud.value) || 0;
      var when = d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
      out.innerHTML = 'To be debt-free by <b>' + when + '</b> (about ' + n + ' month' + (n === 1 ? '' : 's') + ') you would need around <b>' + money(need) + '</b> a month' +
        (b > 0 ? (need > b ? ', which is ' + money(need - b) + ' more than your current budget.' : '. Your budget of ' + money(b) + ' already gets you there.') : '.') + (r.totalInterest ? ' Estimated interest on the way: ' + money(r.totalInterest) + '.' : '');
    }
    function summary() {
      var debts = debtsNow(), n = debts.length;
      $('debtCount').textContent = n + ' active balance' + (n === 1 ? '' : 's');
      var top = n ? debts.reduce(function (m, d) { return (d.rate || 0) > (m.rate || 0) ? d : m; }, debts[0]) : null;
      $('highestRateName').textContent = top ? top.name : 'No debts yet';
      $('coachHeadline').textContent = top ? 'Focus on ' + top.name + ' first' : 'Add a debt to get started';
      $('monthlyInterest').textContent = money(debts.reduce(function (s, d) { return s + d.balance * (d.rate || 0) / 100 / 12; }, 0));
      var b = parseFloat(bud.value) || 0, out = '\u2014', note = 'Enter a monthly budget';
      if (n && b > 0 && typeof calculateTimelineForMethod === 'function') {
        var r = calculateTimelineForMethod(b, 'avalanche');
        if (r.error) note = 'Budget too low for minimums'; else { out = fmtMonths(r.months); note = 'Avalanche estimate'; }
      }
      $('payoffEstimate').textContent = out; $('payoffNote').textContent = note;
      whatIf(); deadline();
    }
    function enhance() {
      var debts = debtsNow();
      [].slice.call(list.children).forEach(function (row, i) {
        var d = debts[i], flex = row.firstElementChild;
        if (!d || !flex || flex.querySelector('.debt-bar') || row.classList.contains('empty-state')) return;
        var info = flex.children[0], right = flex.children[1]; if (!info || !right) return;
        var paid = paidFor(d.id), pct = paid ? paid / (paid + d.balance) * 100 : 0;
        var sub = info.querySelector('p'); if (sub) sub.textContent = (d.rate > 0 ? d.rate + '% interest' : 'No interest') + (dueInfo(d) ? ' \u00B7 due on the ' + ord(dueInfo(d).day) : '') + (paid ? ' \u00B7 ' + Math.round(pct) + '% paid' : '');
        [].slice.call(right.children).forEach(function (c) { if (/% interest/.test(c.textContent)) c.remove(); });
        if (right.firstElementChild) right.firstElementChild.textContent = money(d.balance);
        var bar = document.createElement('div'); bar.className = 'debt-bar'; bar.title = paid ? money(paid) + ' paid so far' : 'No payments recorded yet';
        bar.innerHTML = '<i style="width:' + pct + '%"></i>'; flex.insertBefore(bar, right);
      });
      summary(); fillPaySelect(); renderHistory();
    }
    function fillPaySelect() {
      var sel = $('payDebt'), keep = sel.value, debts = debtsNow();
      sel.innerHTML = debts.length ? debts.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + ' \u2014 ' + money(d.balance) + ' left</option>'; }).join('') : '<option value="">No debts to pay yet</option>';
      if (keep) sel.value = keep;
    }
    function renderHistory() {
      var box = $('payHistory'), all = pays().slice().reverse(), total = pays().reduce(function (s, p) { return s + p.amount; }, 0);
      $('paidTotal').textContent = total ? money(total) + ' paid so far' : '';
      if (!all.length) { box.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i> No payments recorded yet. Use &ldquo;Record payment&rdquo; whenever you pay something off.</div>'; return; }
      var today = new Date(); today.setHours(0, 0, 0, 0);
      box.innerHTML = all.slice(0, 12).map(function (p) {
        var d = new Date(p.date + 'T00:00:00'), diff = Math.round((today - d) / 864e5);
        var when = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
        return '<div class="pay-row"><span class="ico"><i class="fas fa-check"></i></span><div class="nm"><strong>' + esc(p.name) + '</strong><small>' + when + (p.balanceAfter === 0 ? ' \u00B7 paid off' : ' \u00B7 ' + money(p.balanceAfter) + ' left') + '</small></div><b>' + money(p.amount) + '</b><button class="x-btn" data-undo="' + p.id + '" aria-label="Remove this payment" title="Remove this payment"><i class="fas fa-xmark"></i></button></div>';
      }).join('');
    }
    $('payDate').value = todayStr(); $('payDate').max = todayStr();
    $('recordPayBtn').addEventListener('click', function () {
      var debts = debtsNow(), id = Number($('payDebt').value), v = parseFloat($('payAmount').value), date = $('payDate').value || todayStr();
      var d = debts.filter(function (x) { return x.id === id; })[0];
      if (!d) { toast('Add a debt first', 'warning'); return; }
      if (!v || v <= 0) { toast('Enter the amount you paid', 'warning'); return; }
      if (date > todayStr()) { toast('Choose today or an earlier date. Payments can\u2019t be in the future.', 'warning'); $('payDate').focus(); return; }
      if (date < '2000-01-01') { toast('That date looks too far in the past.', 'warning'); return; }
      var pay = Math.min(v, d.balance), after = Math.round((d.balance - pay) * 100) / 100;
      var log = pays(); log.push({ id: Date.now(), debtId: d.id, name: d.name, amount: pay, date: date, balanceAfter: after }); write('trackmyfin_debt_payments', log);
      if (after <= 0) { if (typeof deleteDebt === 'function') deleteDebt(d.id); toast(d.name + ' is paid off. Well done!', 'success'); }
      else { d.balance = after; write('trackmyfin_debts', debts); if (typeof displayDebts === 'function') displayDebts(); if (typeof updateDebtSummary === 'function') updateDebtSummary(); toast('Recorded ' + money(pay) + ' towards ' + d.name, 'success'); }
      $('payAmount').value = '';
    });
    $('payHistory').addEventListener('click', function (e) {
      var b = e.target.closest('[data-undo]'); if (!b) return;
      var log = pays(), p = log.filter(function (x) { return String(x.id) === b.dataset.undo; })[0]; if (!p) return;
      var debts = debtsNow(), d = debts.filter(function (x) { return x.id === p.debtId; })[0];
      confirmDialog({ title: 'Remove this payment?', body: 'The ' + money(p.amount) + ' payment to <b>' + esc(p.name) + '</b> will be removed from your history.' + (d ? ' That amount is added back to the balance.' : ' This debt was already cleared, so no balance changes.'), confirm: 'Remove payment', danger: true }).then(function (ok) {
        if (!ok) return; write('trackmyfin_debt_payments', log.filter(function (x) { return x !== p && String(x.id) !== b.dataset.undo; }));
        if (d) { d.balance = Math.round((d.balance + p.amount) * 100) / 100; write('trackmyfin_debts', debts); if (typeof displayDebts === 'function') displayDebts(); if (typeof updateDebtSummary === 'function') updateDebtSummary(); } else renderHistory();
        toast('Payment removed', 'success');
      });
    });
    var cph = $('clearPayHistory');
    if (cph) cph.addEventListener('click', function () {
      var log = pays(); if (!log.length) { toast('There is no payment history to clear', 'warning'); return; }
      var tot = log.reduce(function (s, x) { return s + x.amount; }, 0);
      confirmDialog({ title: 'Clear your payment history?', body: 'This deletes the record of what you have paid. Your current debt balances do not change.', list: [log.length + ' payment' + (log.length === 1 ? '' : 's') + ' (' + money(tot) + ' in total)'], note: 'This cannot be undone. Your data lives only in this browser, so there is no backup to restore from.', confirm: 'Clear history', danger: true }).then(function (ok) {
        if (!ok) return; write('trackmyfin_debt_payments', []); renderHistory(); if (typeof displayDebts === 'function') displayDebts(); toast('Payment history cleared', 'success');
      });
    });
    var sd = $('saveDueBtn');
    if (sd) sd.addEventListener('click', function () {
      var id = Number($('payDebt').value), day = parseInt($('dueDay').value, 10);
      if (!id) { toast('Add a debt first', 'warning'); return; }
      if (!day || day < 1 || day > 31) { toast('Enter a day between 1 and 31', 'warning'); return; }
      var m = read('trackmyfin_debt_due', {}) || {}; m[id] = day; write('trackmyfin_debt_due', m);
      if (typeof displayDebts === 'function') displayDebts(); toast('Due day saved. Fin will remind you 3 days before.', 'success'); dueReminders();
    });
    if (location.hash === '#pay') { var pc = $('payComposer'); if (pc) pc.hidden = false; }
    watch(list, enhance);
    watch($('totalDebt'), function () { fmt($('totalDebt')); });
    var sb = read('trackmyfin_debt_budget', 0); if (sb) { bud.value = sb; bud.dispatchEvent(new Event('input')); }
    var td = read('trackmyfin_debt_target', ''); if (td) $('targetDate').value = td;
    $('targetDate').min = todayStr();
    bud.addEventListener('input', function () { write('trackmyfin_debt_budget', parseFloat(bud.value) || 0); summary(); });
    $('extraPay').addEventListener('input', whatIf); $('targetDate').addEventListener('input', function () { write('trackmyfin_debt_target', $('targetDate').value || ''); deadline(); });
    $('avalancheBtn').addEventListener('click', function () {
      var debts = debtsNow(); if (!debts.length) { toast('Add a debt first', 'warning'); return; }
      if (typeof renderDebtPayoffSimulator === 'function') renderDebtPayoffSimulator();
      var top = debts.reduce(function (m, d) { return (d.rate || 0) > (m.rate || 0) ? d : m; }, debts[0]);
      toast('Avalanche: pay ' + top.name + ' first', 'success');
    });
  }

 
  function reports() {
    var mi = $('reportMonth'); if (!mi) return;
    var months = []; txs().forEach(function (t) { if (t.date) { var k = t.date.slice(0, 7); if (months.indexOf(k) < 0) months.push(k); } });
    months.sort();
    mi.value = (!months.length || months.indexOf(cur()) >= 0) ? cur() : months[months.length - 1];
    var ring = $('scoreRing'), pending = { score: 0, label: '', none: true }, raf;

    function setRing(score) { ring.style.setProperty('--pct', score); ring.style.setProperty('--ring', score >= 75 ? 'var(--purple)' : score >= 50 ? '#d9a15a' : 'var(--coral)'); }
    function resetRing() { cancelAnimationFrame(raf); setRing(0); $('scoreNum').textContent = '\u2014'; $('scoreLabel').textContent = 'Generate your report'; $('scoreLabel').style.color = 'var(--ink-3)'; ring.classList.remove('loading'); }
    function reveal() {
      ring.classList.remove('loading');
      if (pending.none) { $('scoreNum').textContent = '0'; $('scoreLabel').textContent = 'No data yet'; $('scoreLabel').style.color = 'var(--ink-3)'; return; }
      var t0 = null, to = pending.score;
      cancelAnimationFrame(raf);
      (function step(ts) { if (t0 === null) t0 = ts; var k = Math.min(1, (ts - t0) / 1100), e = 1 - Math.pow(1 - k, 3), v = Math.round(to * e); setRing(v); $('scoreNum').textContent = v; if (k < 1) raf = requestAnimationFrame(step); })(performance.now());
      $('scoreLabel').textContent = pending.label; $('scoreLabel').style.color = pending.neg ? 'var(--red)' : '';
    }
    function render() {
      var ym = mi.value || cur(), c = monthTotals(ym), pv = monthTotals(prevYM(ym)), net = c.income - c.expense, none = !c.income && !c.expense;
      $('noteHeadline').textContent = none ? 'Nothing recorded for ' + monthName(ym) + ' yet.' : net >= 0 ? 'Your finances are moving in the right direction.' : 'Spending ran ahead of income this month.';
      $('noteLocal').textContent = none ? 'Add a few transactions and this note will fill in.' : 'You brought in ' + money(c.income) + ', spent ' + money(c.expense) + ', and kept ' + money(net) + ' available. ' + (net >= 0 ? 'Keep protecting that positive gap.' : 'A small trim to lifestyle spending can close the gap.');
      var rate = c.income ? net / c.income : (c.expense ? -1 : 0);
      pending = { none: none, neg: net < 0, score: Math.round(rate >= 0 ? 60 + 40 * Math.min(1, rate / 0.3) : Math.max(0, 60 + 60 * rate)), label: net > 0 ? 'Positive cash flow' : net === 0 ? 'Break-even' : 'Negative cash flow' };
      var fn = $('flowNet'); fn.textContent = (net >= 0 ? '+' : '-') + 'R' + Math.abs(Math.round(net)).toLocaleString('en-US'); fn.classList.toggle('neg', net < 0);
      var p = ym.split('-'), data = [], mx = 1;
      for (var i = 5; i >= 0; i--) { var d = new Date(+p[0], +p[1] - 1 - i, 1), t = monthTotals(ymOf(d)); data.push({ l: MONTHS[d.getMonth()].slice(0, 3), t: t }); mx = Math.max(mx, t.income, t.expense); }
      $('flowBars').innerHTML = data.map(function (m, i) { return '<div class="bar-group"><div class="bar-pair"><div class="bar inc" style="height:' + (m.t.income / mx * 100) + '%;animation-delay:' + i * 60 + 'ms"></div><div class="bar exp" style="height:' + (m.t.expense / mx * 100) + '%;animation-delay:' + (i * 60 + 40) + 'ms"></div></div></div>'; }).join('');
      $('flowLabels').innerHTML = data.map(function (m) { return '<span>' + m.l + '</span>'; }).join('');
      var best = months.filter(function (k) { return k.slice(0, 4) === ym.slice(0, 4); }).every(function (k) { var t = monthTotals(k); return t.income - t.expense <= net; });
      $('hl1').textContent = money(Math.max(net, 0)) + ' saved'; $('hl1s').textContent = net > 0 && best ? 'Best month this year' : 'Net for ' + monthName(ym);
      if (pv.expense > 0) { var ch = (pv.expense - c.expense) / pv.expense * 100; $('hl2').textContent = Math.abs(Math.round(ch)) + '% ' + (ch >= 0 ? 'less' : 'more') + ' spent'; $('hl2s').textContent = 'Compared with ' + monthName(prevYM(ym)); }
      else { $('hl2').textContent = 'No earlier month yet'; $('hl2s').textContent = 'Nothing to compare against'; }
      var g = priorityGoal();
      if (g && g.target) { $('hl3').textContent = gpct(g) + '% goal progress'; $('hl3s').textContent = g.name + ' is getting closer'; }
      else { $('hl3').textContent = 'No savings goal yet'; $('hl3s').textContent = 'Set one on the Budget page'; }
    }
    /* The wellness ring waits for your report: it fills once the summary arrives */
    var prompt = '<div class="empty-state">Press &ldquo;Generate report&rdquo; for an AI-written summary of this month.</div>';
    mi.addEventListener('change', function () { render(); resetRing(); $('reportContent').innerHTML = prompt; });
    $('genBtn').addEventListener('click', function () { render(); resetRing(); ring.classList.add('loading'); $('scoreLabel').textContent = 'Reading your month\u2026'; });
    var rc = $('reportContent'), done = false;
    new MutationObserver(function () {
      var ok = !!$('reportSummaryText');
      if (ok && !done) { done = true; reveal(); } else if (!ok) { done = false; if (/Failed/i.test(rc.textContent)) { ring.classList.remove('loading'); $('scoreLabel').textContent = 'Report unavailable'; } }
    }).observe(rc, { childList: true, subtree: true });
    render(); resetRing();
  }

  
  function settings() {
    if (!$('profileName')) return;
    var em = $('profileEmail'); if (em) em.value = read('trackmyfin_email', '') || '';
    var sb = $('saveProfileBtn'); if (sb) sb.addEventListener('click', function () { if (em) write('trackmyfin_email', em.value.trim()); });
    var av = $('profileAvatar'), pn = $('profileName');
    var setAv = function () { if (av) av.textContent = initials(pn.value); }; pn.addEventListener('input', setAv); setTimeout(setAv, 0);
    var pr = prefs();
    [['nWeekly', 'weekly'], ['nBudget', 'budget'], ['nGoal', 'goal']].forEach(function (p) {
      var el = $(p[0]); el.checked = !!pr[p[1]];
      el.addEventListener('change', function () { pr[p[1]] = el.checked; write('trackmyfin_notifications', pr); toast('Preference saved', 'success'); });
    });
    var mo = Object.assign({ waves: true, fin: true }, read('trackmyfin_motion', {}) || {});
    [['nWaves', 'waves', 'no-waves'], ['nFin', 'fin', 'no-fin']].forEach(function (p) {
      var el = $(p[0]); if (!el) return; el.checked = mo[p[1]] !== false;
      el.addEventListener('change', function () { mo[p[1]] = el.checked; write('trackmyfin_motion', mo); document.body.classList.toggle(p[2], !el.checked); toast('Preference saved', 'success'); });
    });
    var links = [].slice.call(document.querySelectorAll('.side a'));
    links.forEach(function (a) { a.addEventListener('click', function () { links.forEach(function (x) { x.classList.remove('active'); }); a.classList.add('active'); }); });
  }

  
  function failFin(why) {
    console.error('[Track My Fin] Fin did not start: ' + why);
    if (document.getElementById('finDiag')) return;
    var el = notice('fa-triangle-exclamation', '<b>Fin could not start.</b> ' + why); if (el) el.id = 'finDiag';
  }
  function ensureFin() {
    if (!document.querySelector('.container') || window.__TMF_FIN) return;
    var me = [].slice.call(document.scripts).filter(function (s) { return /ui\.js/.test(s.src); })[0], base = me ? me.src.replace(/ui\.js.*$/, '') : '';
    if (!document.querySelector('link[href*="fin-companion.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'fin-companion.css?v=7'; document.head.appendChild(l); }
    if (!document.querySelector('script[src*="fin-companion.js"]')) {
      var s = document.createElement('script'); s.src = base + 'fin-companion.js?v=7';
      s.onerror = function () { failFin('The file fin-companion.js was not found next to ui.js. Put it in the same folder as index.html.'); };
      document.body.appendChild(s);
    }
    setTimeout(function () { if (!window.__TMF_FIN) failFin('fin-companion.js loaded but has an error. Make sure the project-root fin-companion.js is the browser file (not api/fin.js), then open the browser console for details.'); }, 2500);
  }
  window.TMF = { read: read, write: write, money: money, esc: esc, escA: escA, toast: toast, txs: txs, amt: amt, isInc: isInc, cur: cur, ymOf: ymOf, pad: pad, MONTHS: MONTHS, monthName: monthName,
    fmtMonths: fmtMonths, todayStr: todayStr, ord: ord, notice: notice, notify: notify, addFeed: addFeed, feedGet: feedGet, feedSet: function (v) { write(FEED_KEY, v); updateBadge(); }, updateBadge: updateBadge,
    dialog: dialog, confirmDialog: confirmDialog, perms: perms, PERM_DEF: PERM_DEF, setPerms: function (p) { write('trackmyfin_privacy', Object.assign({}, read('trackmyfin_privacy', {}) || {}, p)); }, dueInfo: dueInfo };
  document.addEventListener('DOMContentLoaded', function () {
    [common, dashboard, budget, debt, reports, settings].forEach(safe);
    setTimeout(ensureFin, 400);
  });
})();