
(function () {
  'use strict';
  var T = window.TMF; if (!T) { console.warn('extras.js needs ui.js (TMF) loaded first'); return; }
  var $ = function (id) { return document.getElementById(id); };
  var esc = T.esc, escA = T.escA, money = T.money, toast = T.toast, read = T.read, write = T.write, MONTHS = T.MONTHS;

  /* ---------- 1. keyword classifier (South African merchants + everyday words) ---------- */
  var LIFE = /\b(netflix|showmax|spotify|dstv|youtube|disney|restaurant|takeaway|take-away|take away|fast food|kfc|mcdonald|nando|steers|wimpy|burger|pizza|debonairs|uber eats|ubereats|mr d|mr delivery|coffee|starbucks|vida|pub|liquor|tops|cocktail|drinks|movie|cinema|ster-kinekor|nu metro|steam|playstation|xbox|takealot|amazon|shein|temu|zara|mr price|cotton on|clothing|clothes|shoes|fashion|holiday|hotel|airbnb|flight|entertainment|dining|dinner out|lunch out|gym|salon|barber|spa|gift|gifts|birthday|party)\b/;
  var FIN = /\b(bank fee|service fee|monthly fee|monthly account fee|account fee|admin fee|atm fee|cash withdrawal fee|transfer fee|overdraft|interest|loan|insurance|premium|credit card|instalment|installment|investment|retirement|unit trust|sars|tax|old mutual|sanlam|discovery|liberty|outsurance|king price|hollard)\b/;
  var ESS = /\b(groceries|grocery|food|checkers|pick n pay|picknpay|pnp|shoprite|spar|woolworths food|boxer|food lover|makro|fuel|petrol|diesel|engen|shell|sasol|caltex|electricity|prepaid|eskom|city power|water|rates|municipal|rent|levy|airtime|data bundle|mobile data|vodacom|mtn|telkom|cell c|fibre|wifi|internet|medical|medicine|medication|pharmacy|clicks|dis-chem|dischem|doctor|dentist|clinic|hospital|school|tuition|uniform|transport|taxi|bolt|uber|gautrain|bus|train|toll)\b/;
  function classify(desc, type) {
    var s = String(desc || '').toLowerCase();
    if (type === 'income' || /\b(salary|wage|payslip|deposit received|freelance|income)\b/.test(s)) return { category: 'Income', confidence: 0.95 };
    if (LIFE.test(s)) return { category: 'Lifestyle', confidence: 0.92 };
    if (FIN.test(s)) return { category: 'Financial', confidence: 0.92 };
    if (ESS.test(s)) return { category: 'Essential', confidence: 0.92 };
    return null;
  }
  /* AI first. Only when the AI cannot answer (no credit, offline, AI-categorisation switched off) do our keyword rules
     step in, so "food" or "groceries" still land in Essential instead of the generic Lifestyle fallback. */
  var origCat = window.categorizeTransaction;
  if (typeof origCat === 'function') window.categorizeTransaction = async function (description, amount, type) {
    var res = null;
    try { res = await origCat.apply(this, arguments); } catch (e) { res = null; }
    var src = res && res.source ? String(res.source) : 'fallback';
    if (res && src.indexOf('fallback') !== 0) return res; // the AI answered
    var loc = classify(description, type);
    if (loc) return { category: loc.category, confidence: loc.confidence, needsReview: typeof window.needsReview === 'function' ? window.needsReview(loc.confidence, description) : false, source: 'keyword' };
    return res || origCat.apply(this, arguments);
  };

  
  function iconFor(desc, cat, income) {
    var s = String(desc || '').toLowerCase();
    if (income) return 'income';
    var map = [[/netflix|showmax|dstv|disney|youtube|spotify/, 'tv'], [/kfc|mcdonald|nando|steers|wimpy|burger|pizza|debonairs|restaurant|takeaway|take away|uber eats|ubereats|mr d|dining|coffee|starbucks|vida/, 'food'],
      [/petrol|diesel|fuel|engen|shell|sasol|caltex/, 'fuel'], [/uber|bolt|taxi|gautrain|bus\b|train|toll|transport/, 'car'], [/checkers|pick n pay|picknpay|pnp|shoprite|spar|woolworths|boxer|food lover|makro|groceries|grocery|food/, 'cart'],
      [/electricity|prepaid|eskom|city power|water|rates|municipal/, 'bolt'], [/rent|levy|bond/, 'house'], [/medical|medicine|pharmacy|clicks|dis-chem|dischem|doctor|dentist|clinic|hospital/, 'heart'],
      [/school|tuition|uniform|university|college/, 'school'], [/airtime|vodacom|mtn|telkom|cell c|fibre|wifi|internet|data/, 'phone'], [/insurance|premium|outsurance|king price|hollard|sanlam|old mutual|discovery|liberty/, 'shield'],
      [/fee|interest|loan|overdraft|instal|credit card|bank|capitec|fnb|absa|nedbank|sars|tax/, 'bank'], [/hotel|airbnb|flight|holiday|travel/, 'plane'], [/takealot|amazon|shein|temu|zara|mr price|clothing|clothes|shoes|fashion|h&m/, 'bag'], [/gym|salon|barber|spa/, 'spa'], [/movie|cinema|game|steam|playstation|xbox/, 'game'], [/gift|birthday|party/, 'gift']];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(s)) return map[i][1];
    return cat === 'Essential' ? 'cart' : cat === 'Lifestyle' ? 'bag' : cat === 'Financial' ? 'bank' : 'wallet';
  }
  function guarded(el, fn) {
    var OPTS = { childList: true, characterData: true, subtree: true }, busy = false;
    var mo = new MutationObserver(function () { if (busy) return; busy = true; mo.disconnect(); try { fn(); } finally { mo.observe(el, OPTS); busy = false; } });
    mo.observe(el, OPTS); fn();
  }
  var list = $('transactionList');
  if (list) guarded(list, function () {
    var byId = {}; T.txs().forEach(function (t) { byId[String(t.id)] = t; });
    [].forEach.call(list.querySelectorAll('.transaction-item'), function (row) {
      var del = row.querySelector('.delete-btn'), m = /deleteTransaction\('([^']+)'\)/.exec((del && del.getAttribute('onclick')) || ''), t = m && byId[m[1]]; if (!t) return;
      var name = row.children[1];
      if (name && name.dataset.full !== '1') { name.textContent = t.description; name.title = t.description; name.dataset.full = '1'; }
      var sel = row.querySelector('select'), cat = sel ? sel.value : t.category;
      row.dataset.ic = iconFor(t.description, cat, T.isInc(t)); row.dataset.cat = T.isInc(t) ? 'Income' : (cat || '');
    });
  });

  
  var FOLD = 'trackmyfin_ui_collapsed';
  function counts() {
    var n = { debtList: (read('trackmyfin_debts', []) || []).length, payHistory: (read('trackmyfin_debt_payments', []) || []).length, events: (read('trackmyfin_events', []) || []).length };
    var w = { debtList: ['balance', 'balances'], payHistory: ['payment', 'payments'], events: ['plan', 'plans'] };
    [].forEach.call(document.querySelectorAll('[data-fold]'), function (sec) {
      var id = sec.dataset.fold, c = sec.querySelector('.fold-count'); if (!c || !w[id]) return;
      c.textContent = n[id] + ' ' + w[id][n[id] === 1 ? 0 : 1]; c.hidden = !sec.classList.contains('is-folded') && n[id] === 0;
    });
  }
  [].forEach.call(document.querySelectorAll('[data-fold]'), function (sec) {
    var id = sec.dataset.fold, btn = sec.querySelector('.fold-btn');
    function paint() { var f = !!(read(FOLD, {}) || {})[id]; sec.classList.toggle('is-folded', f); if (btn) { btn.setAttribute('aria-expanded', f ? 'false' : 'true'); btn.setAttribute('aria-label', (f ? 'Expand ' : 'Collapse ') + id); btn.innerHTML = '<i class="fas fa-chevron-' + (f ? 'down' : 'up') + '"></i>'; } }
    if (btn) btn.addEventListener('click', function () { var m = read(FOLD, {}) || {}; if (m[id]) delete m[id]; else m[id] = 1; write(FOLD, m); paint(); counts(); });
    paint();
  });
  counts();
  ['debtList', 'payHistory', 'eventList'].forEach(function (id) { var e = $(id); if (e) new MutationObserver(counts).observe(e, { childList: true }); });


  var chips = $('customCategoryList');
  if (chips) guarded(chips, function () {
    var cats = read('trackmyfin_custom_categories', []) || [];
    [].slice.call(chips.children).forEach(function (row, i) {
      var c = cats[i]; if (!c || typeof c !== 'object' || row.querySelector('.dot-pick')) return;
      var dot = row.querySelector('i.fa-circle'), inp = document.createElement('input');
      inp.type = 'color'; inp.className = 'dot-pick'; inp.value = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#6058a3'; inp.title = 'Change colour'; inp.setAttribute('aria-label', 'Colour for ' + c.name);
      if (dot) dot.replaceWith(inp); else row.insertBefore(inp, row.firstChild);
      inp.addEventListener('change', function () { var all = read('trackmyfin_custom_categories', []) || []; if (!all[i]) return; all[i].color = inp.value; write('trackmyfin_custom_categories', all); if (typeof displayCustomCategories === 'function') displayCustomCategories(); if (typeof updateAll === 'function') updateAll(); toast('Colour updated', 'success'); });
    });
  });


  var EV = 'trackmyfin_events';
  var evs = function () { var e = read(EV, []); return Array.isArray(e) ? e : []; };
  var daysTo = function (d) { var n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((new Date(d + 'T00:00:00') - n) / 864e5); };
  var fmtDate = function (d) { var x = new Date(d + 'T00:00:00'); return x.getDate() + ' ' + MONTHS[x.getMonth()].slice(0, 3) + ' ' + x.getFullYear(); };
  function evReminders() {
    evs().forEach(function (e) {
      var d = daysTo(e.date); if (d < 0 || d > 14) return;
      var thr = [0, 1, 3, 7, 14].filter(function (t) { return d <= t; })[0], spent = (e.items || []).reduce(function (s, x) { return s + x.amount; }, 0);
      T.addFeed({ key: 'event:' + e.id + ':' + thr, type: 'budget', title: 'Upcoming: ' + e.name,
        body: '<b>' + esc(e.name) + '</b> is ' + (d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days') + '. You have ' + money(e.budget - spent) + ' left of your ' + money(e.budget) + ' plan.',
        why: 'Based on the date (' + fmtDate(e.date) + ') and budget you set for this plan.', actions: [{ label: 'View plan', href: 'budget.html#events', primary: true }, { label: 'Ask Fin', ask: 'Help me plan for ' + e.name + ' on ' + fmtDate(e.date) + ' with a budget of ' + money(e.budget) + '.' }] });
    });
  }
  evReminders();
  if (localStorage.getItem('trackmyfin_onboarded')) T.addFeed({ key: 'welcome-privacy', type: 'security', title: 'Your data stays private', body: 'Track My Fin keeps your data in this browser. Fin only sees the parts you allow.', why: 'These are your privacy defaults. You can change them any time.', actions: [{ label: 'Review Fin permissions', href: 'privacy.html', primary: true }] });
  var box = $('eventList'); if (!box) return;
  var st = { edit: null };
  function form(e) {
    return '<div class="goal-item"><div class="goal-edit"><div class="goal-form"><input type="text" data-f="name" placeholder="What is it? (e.g., Mum\u2019s birthday)" aria-label="Plan name"><input type="date" data-f="date" aria-label="Date" min="' + T.todayStr() + '"><input type="number" min="0" data-f="budget" placeholder="Budget (R)" aria-label="Budget">' +
      '<div class="goal-btns"><button class="btn-primary" data-act="save" data-id="' + (e ? e.id : 'new') + '">Save plan</button><button class="link-soft" data-act="cancel">Cancel</button></div></div></div></div>';
  }
  function item(e) {
    var spent = (e.items || []).reduce(function (s, x) { return s + x.amount; }, 0), pct = e.budget ? Math.min(100, Math.round(spent / e.budget * 100)) : 0, left = e.budget - spent, d = daysTo(e.date);
    var fold = !!(read(FOLD, {}) || {})['ev' + e.id], cd = d > 1 ? 'in ' + d + ' days' : d === 1 ? 'tomorrow' : d === 0 ? 'today' : Math.abs(d) + (Math.abs(d) === 1 ? ' day' : ' days') + ' ago';
    var tip = '';
    if (d > 0 && left > 0) { var wk = Math.max(1, Math.ceil(d / 7)); tip = '<p class="ev-tip">To cover the remaining ' + money(left) + ', set aside about <b>' + money(left / wk) + ' a week</b>' + (d > 45 ? ' (about ' + money(left / Math.max(1, Math.round(d / 30.4))) + ' a month)' : '') + '.</p>'; }
    else if (left < 0) tip = '<p class="ev-tip over">You are ' + money(-left) + ' over this plan\u2019s budget.</p>';
    var its = (e.items || []).map(function (x, i) { return '<div class="pay-row"><div class="nm"><strong>' + esc(x.label) + '</strong></div><b style="color:var(--ink)">' + money(x.amount) + '</b><button class="x-btn" data-act="rmitem" data-id="' + e.id + '" data-i="' + i + '" aria-label="Remove ' + escA(x.label) + '"><i class="fas fa-xmark"></i></button></div>'; }).join('');
    return '<div class="goal-item event-item' + (fold ? ' is-folded' : '') + '"><div class="goal-row"><button class="goal-chev" data-act="toggle" data-id="' + e.id + '" aria-expanded="' + (!fold) + '" aria-label="' + (fold ? 'Expand ' : 'Collapse ') + escA(e.name) + '"><i class="fas fa-chevron-' + (fold ? 'down' : 'up') + '"></i></button>' +
      '<div class="goal-ttl"><h4>' + esc(e.name) + ' <span class="pill sm' + (d >= 0 && d <= 7 ? ' soon' : '') + '">' + cd + '</span></h4>' + (fold ? '' : '<p class="sub">' + fmtDate(e.date) + ' \u00B7 ' + money(spent) + ' spent of ' + money(e.budget) + '</p>') + '</div><span class="goal-pct">' + pct + '%</span></div>' +
      '<div class="track"><i style="width:' + pct + '%"' + (left < 0 ? ' class="over"' : '') + '></i></div>' +
      (fold ? '' : tip + its + '<div class="goal-add ev-add"><input type="text" data-l="' + e.id + '" placeholder="What did you spend on?" aria-label="Item"><input type="number" min="0" step="any" data-a="' + e.id + '" placeholder="Amount (R)" aria-label="Amount"><button class="btn-soft" data-act="addspend" data-id="' + e.id + '">Add</button></div>' +
        '<div class="goal-links"><button class="link-soft" data-act="edit" data-id="' + e.id + '">Edit</button><button class="link-danger" data-act="remove" data-id="' + e.id + '">Remove</button></div>') + '</div>';
  }
  function render() {
    var all = evs().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), h = st.edit === 'new' ? form(null) : '';
    if (!all.length && st.edit !== 'new') h += '<div class="empty-state"><i class="fas fa-cake-candles"></i> No upcoming plans yet. Add one to start budgeting for it.</div>';
    all.forEach(function (e) { h += String(st.edit) === String(e.id) ? form(e) : item(e); });
    box.innerHTML = h;
    if (st.edit && st.edit !== 'new') { var e2 = evs().filter(function (x) { return String(x.id) === String(st.edit); })[0], f = box.querySelector('.goal-edit'); if (e2 && f) { f.querySelector('[data-f=name]').value = e2.name; f.querySelector('[data-f=date]').value = e2.date; f.querySelector('[data-f=budget]').value = e2.budget; } }
  }
  var root = $('events');
  root.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act, id = b.dataset.id, all = evs(), e = all.filter(function (x) { return String(x.id) === String(id); })[0];
    if (act === 'new') { st.edit = 'new'; var m0 = read(FOLD, {}) || {}; delete m0.events; write(FOLD, m0); root.classList.remove('is-folded'); render(); return; }
    if (act === 'cancel') { st.edit = null; render(); }
    else if (act === 'edit') { st.edit = id; render(); }
    else if (act === 'toggle') { var m = read(FOLD, {}) || {}; if (m['ev' + id]) delete m['ev' + id]; else m['ev' + id] = 1; write(FOLD, m); render(); }
    else if (act === 'save') {
      var f = b.closest('.goal-edit'), name = f.querySelector('[data-f=name]').value.trim(), date = f.querySelector('[data-f=date]').value, budget = parseFloat(f.querySelector('[data-f=budget]').value);
      if (!name || !date || !budget || budget <= 0) { toast('Add a name, a date and a budget for your plan', 'warning'); return; }
      if (id === 'new' && date < T.todayStr()) { toast('Choose today or a future date for an upcoming plan', 'warning'); return; }
      if (id === 'new') all.push({ id: Date.now(), name: name, date: date, budget: budget, items: [] }); else if (e) { e.name = name; e.date = date; e.budget = budget; }
      write(EV, all); st.edit = null; render(); counts(); evReminders(); toast(id === 'new' ? 'Plan added' : 'Plan updated', 'success');
    } else if (act === 'addspend') {
      var l = box.querySelector('[data-l="' + id + '"]'), a = box.querySelector('[data-a="' + id + '"]'), v = parseFloat(a.value);
      if (!e) return; if (!l.value.trim() || !v || v <= 0) { toast('Add what you spent on and how much', 'warning'); return; }
      e.items = e.items || []; e.items.push({ label: l.value.trim(), amount: v }); write(EV, all); render(); toast('Added ' + money(v) + ' to ' + e.name, 'success');
    } else if (act === 'rmitem') { if (e) { e.items.splice(+b.dataset.i, 1); write(EV, all); render(); } }
    else if (act === 'remove') {
      if (!e) return;
      T.confirmDialog({ title: 'Remove this plan?', body: '<b>' + esc(e.name) + '</b> and its ' + (e.items || []).length + ' spending item' + ((e.items || []).length === 1 ? '' : 's') + ' will be deleted.', note: 'This cannot be undone.', confirm: 'Remove plan', danger: true }).then(function (ok) {
        if (!ok) return; write(EV, all.filter(function (x) { return x !== e; })); render(); counts(); toast('Plan removed', 'success');
      });
    }
  });
  root.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.matches('[data-a],[data-l]')) { var id = ev.target.dataset.a || ev.target.dataset.l, bt = box.querySelector('[data-act="addspend"][data-id="' + id + '"]'); if (bt) bt.click(); } });
  render();
})();