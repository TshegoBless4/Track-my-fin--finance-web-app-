
(function () {
  'use strict';
  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var DEBUG = false; try { DEBUG = /[?&]debug=1/.test(location.search) || localStorage.getItem('tmf_debug') === '1'; } catch (e) {}
  var FIN_URL = isLocal ? 'http://localhost:3000/api/fin' : '/api/fin';
  var NB = '\u00A0';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var $ = function (id) { return document.getElementById(id); };
  var read = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var VIEW_KEY = /budget/i.test(location.pathname) ? 'tmf_view_budget' : 'tmf_view';
  var ssGet = function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  var money = function (n) { return (n < 0 ? '-' : '') + 'R' + NB + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NB); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
  var escA = function (s) { return esc(s).replace(/"/g, '&quot;'); };
  var txs = function () { var t = read('trackmyfin_data', []); return Array.isArray(t) ? t : []; };
  var amt = function (t) { return typeof t.amount === 'number' ? t.amount : (parseFloat(String(t.amount).replace(/[^0-9.-]/g, '')) || 0); };
  var isInc = function (t) { return t.type === 'income' || t.type === 'Income' || t.category === 'Income'; };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymOf = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  var cur = function () { return ymOf(new Date()); };
  var monthName = function (ym) { return MONTHS[+ym.split('-')[1] - 1]; };
  var PAGE = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  var LABEL = { index: 'overview', budget: 'budget', debt: 'debt', reports: 'reports', settings: 'settings', notifications: 'notifications', privacy: 'privacy' }[PAGE] || 'overview';
  var T = window.TMF || { perms: function () { return { transactions: true, budgets: true, debts: true, goals: true, memory: false, store: false }; }, setPerms: function () {}, addFeed: function () {}, fmtMonths: function (m) { return m + ' months'; }, todayStr: function () { return new Date().toISOString().slice(0, 10); }, read: read };
  var hashStr = function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return String(h); };

  var AVATAR = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M32 10v6"/><circle cx="32" cy="7.5" r="2.4" fill="currentColor" stroke="none"/>' +
    '<rect x="13" y="17" width="38" height="31" rx="14"/><path d="M9.5 30v6M54.5 30v6"/>' +
    '<g class="fin-eyes"><ellipse class="fin-eye" cx="25" cy="31" rx="2.6" ry="3.3" fill="currentColor" stroke="none"/><ellipse class="fin-eye" cx="39" cy="31" rx="2.6" ry="3.3" fill="currentColor" stroke="none"/></g>' +
    '<path d="M26 40c3.2 3 8.8 3 12 0"/></svg>';
  var avatar = function (cls) { return '<span class="fin-av ' + (cls || '') + '">' + AVATAR + '</span>'; };

  /* ---------------- data Fin can see (all read locally) ---------------- */
  function limitFor(name) {
    var b = read('trackmyfin_budgets', {}) || {}, k = name.toLowerCase();
    return (k === 'essential' || k === 'lifestyle' || k === 'financial') ? (b[k] || 0) : ((read('trackmyfin_custom_limits', {}) || {})[name] || 0);
  }
  function goals() {
    var g = read('trackmyfin_goals_v2', null);
    if (!Array.isArray(g)) { var o = read('trackmyfin_savings', null); g = o && o.target ? [{ name: o.name, target: o.target, saved: o.saved || 0, priority: true }] : []; }
    return g;
  }
  var topGoal = function () { var g = goals(); return g.filter(function (x) { return x.priority; })[0] || g[0] || null; };
  function period() {
    var v = ssGet(VIEW_KEY) || cur(); if (PAGE !== 'index' && v === 'all') v = cur();
    var inc = 0, exp = 0, by = {}, big = [];
    txs().forEach(function (t) {
      var d = t.date || ''; if (v !== 'all' && d.slice(0, 7) !== v) return;
      var a = Math.abs(amt(t));
      if (isInc(t)) inc += a; else { exp += a; var c = t.category || 'Uncategorised'; by[c] = (by[c] || 0) + a; big.push({ description: t.description, amount: Math.round(a), category: c, date: d }); }
    });
    big.sort(function (x, y) { return y.amount - x.amount; });
    return { view: v, label: v === 'all' ? 'all time' : monthName(v) + ' ' + v.slice(0, 4), income: inc, spending: exp, available: inc - exp, byCat: by, big: big.slice(0, 5) };
  }
  function ctxFull() {
    var p = period(), prof = read('trackmyfin_profile', {}) || {}, pays = read('trackmyfin_debt_payments', []) || [];
    var names = ['Essential', 'Lifestyle', 'Financial'];
    (read('trackmyfin_custom_categories', []) || []).forEach(function (c) { names.push(typeof c === 'object' ? c.name : c); });
    return {
      page: LABEL, today: new Date().toISOString().slice(0, 10), userName: prof.name && prof.name !== 'User' ? prof.name : '',
      period: p.label, income: Math.round(p.income), spending: Math.round(p.spending), available: Math.round(p.available),
      categories: names.map(function (n) { return { name: n, spent: Math.round(p.byCat[n] || 0), monthlyLimit: limitFor(n) }; }),
      largestExpenses: p.big,
      goals: goals().map(function (g) { return { name: g.name, target: g.target, saved: g.saved || 0 }; }),
      debts: (read('trackmyfin_debts', []) || []).map(function (d) { return { name: d.name, balance: d.balance, ratePercent: d.rate || 0, paidSoFar: pays.filter(function (x) { return x.debtId === d.id; }).reduce(function (s, x) { return s + x.amount; }, 0) }; }),
      debtMonthlyBudget: parseFloat(read('trackmyfin_debt_budget', 0)) || 0,
      debtTargetDate: read('trackmyfin_debt_target', '') || '',
      statedMonthlyIncome: prof.income > 0 ? Math.round(prof.income) : 0,
      mainGoal: prof.goal && prof.goal !== 'Not specified' ? String(prof.goal).slice(0, 80) : ''
    };
  }
  function pace() {                       // category most likely to overshoot at the current pace
    var p = period(), n = new Date(), day = n.getDate(), dim = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate(), best = null;
    ctxFull().categories.forEach(function (c) {
      if (!c.monthlyLimit || !c.spent) return;
      var proj = c.spent / day * dim, over = proj - c.monthlyLimit, pct = c.spent / c.monthlyLimit * 100;
      if (!best || over > best.over) best = { name: c.name, over: over, pct: pct, limit: c.monthlyLimit };
    });
    return { best: best, day: day, dim: dim, p: p };
  }

  /* ---------------- permissions: what Fin may send, and just-in-time consent ---------------- */
  var AREA_LABEL = { transactions: 'transaction', budgets: 'budget', debts: 'debt', goals: 'goal' };
  function ctxFiltered(once) {                                    // only what the user has allowed (or allowed once) leaves the browser
    var c = ctxFull(), p = T.perms(), o = once || {}, ok = function (k) { return !!(p[k] || o[k]); };
    if (!ok('transactions')) { delete c.income; delete c.spending; delete c.available; delete c.largestExpenses; c.categories = c.categories.map(function (x) { return { name: x.name, monthlyLimit: x.monthlyLimit }; }); }
    if (!ok('budgets')) c.categories = c.categories.map(function (x) { return { name: x.name, spent: x.spent }; });
    else c.events = (read('trackmyfin_events', []) || []).map(function (e) { return { name: e.name, date: e.date, budget: e.budget, spent: (e.items || []).reduce(function (s, x) { return s + x.amount; }, 0) }; });
    if (!ok('transactions')) delete c.statedMonthlyIncome;   // income is a financial figure: same switch as transactions
    if (!ok('goals')) delete c.mainGoal;
    if (!ok('debts')) { c.debts = []; delete c.debtMonthlyBudget; delete c.debtTargetDate; }
    if (!ok('goals')) c.goals = [];
    c.allowedAreas = Object.keys(AREA_LABEL).filter(ok);
    if (p.memory && p.store) c.earlierConversation = chat.filter(function (m) { return !m.consent; }).slice(-30, -10).map(function (m) { return { role: m.role, content: m.content }; });
    return c;
  }
  function needed(q) {
    var t = q.toLowerCase(), n = [];
    if (/\bdebts?\b|\bowe|interest|pay ?off|payoff|avalanche|snowball|credit card|loan|debt-free/.test(t)) n.push('debts');
    if (/goal|saving|\bsave\b|emergency fund|milestone|toward/.test(t)) n.push('goals');
    if (/budget|limit|overspen|rebalanc|afford|safe to spend|category|birthday|event/.test(t)) n.push('budgets');
    if (/\bspen[dt]|transaction|income|available|expens|groceries|where.*money|recorded|this (month|week)/.test(t)) n.push('transactions');
    return n;
  }
  function addConsent(q, areas) {
    var names = areas.map(function (a) { return AREA_LABEL[a]; }), txt = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    chat.push({ role: 'assistant', content: 'I can help, but I currently don\u2019t have permission to view your ' + txt + ' information.', src: 'ai', consent: { q: q, areas: areas } }); persist(); renderMsgs();
  }
  function onConsent(e) {
    var b = e.target.closest('[data-consent]'); if (!b) return;
    var row = b.closest('[data-mi]'), m = chat[+row.dataset.mi]; if (!m || !m.consent || m.consent.done) return;
    var ch = b.dataset.consent, q = m.consent.q, areas = m.consent.areas; m.consent.done = ch; persist(); renderMsgs();
    if (ch === 'once') { var once = {}; areas.forEach(function (a) { once[a] = true; }); send(q, { resend: true, once: once, skipConsent: true }); }
    else if (ch === 'always') { var patch = {}; areas.forEach(function (a) { patch[a] = true; }); T.setPerms(patch); T.addFeed({ key: 'sec:fin-allow:' + new Date().toISOString().slice(0, 13), type: 'security', title: 'Fin access allowed', body: 'You allowed Fin to use your <b>' + areas.map(function (a) { return AREA_LABEL[a]; }).join(', ') + '</b> information.', why: 'You chose \u201CAlways allow\u201D in a Fin conversation.', actions: [{ label: 'Review permissions', href: 'privacy.html', primary: true }] }); send(q, { resend: true, skipConsent: true }); }
    else addMsg('assistant', 'No problem. I won\u2019t use that information. You can change what I can see any time in Settings \u2192 Privacy & Fin.', 'ai');
  }

  /* ---------------- offline answers (used when the AI server is unreachable) ---------------- */
  function localAnswer(q) {
    var c = ctxFull(), t = q.toLowerCase(), g = topGoal(), ps = pace();
    if (!c.income && c.statedMonthlyIncome > 0 && /50.?30|split|plan|budget|how much.*(save|spend)|save|afford/.test(t)) {
      var inc = c.statedMonthlyIncome;
      return 'You told me you bring in about ' + money(inc) + ' a month, and I can\u2019t see any recorded transactions yet. As a starting guide (a suggestion, not your data): about ' + money(inc * 0.5) + ' for essentials, ' + money(inc * 0.3) + ' for lifestyle and ' + money(inc * 0.2) + ' toward savings or debt.' + (c.mainGoal ? ' Since your main goal is \u201C' + c.mainGoal + '\u201D, the last part is where I\u2019d start.' : '') + ' Add a few transactions and I\u2019ll use your real numbers.';
    }
    var cats = c.categories.filter(function (x) { return x.monthlyLimit > 0; }).map(function (x) { return { n: x.name, pct: x.spent / x.monthlyLimit * 100, s: x.spent, l: x.monthlyLimit }; }).sort(function (a, b) { return b.pct - a.pct; });
    if (/overspen|rebalanc|too much|reduce|cut/.test(t)) {
      if (!cats.length) return 'I can\u2019t see any category limits yet. Set a monthly limit for each category on the Budget page and I\u2019ll show you where you\u2019re drifting.';
      var a = cats[0]; return a.n + ' is your busiest category: ' + money(a.s) + ' of its ' + money(a.l) + ' limit (' + Math.round(a.pct) + '%). ' + (a.pct >= 100 ? 'It has passed its limit, so a small move from a category with room could rebalance things.' : 'It\u2019s worth watching, but you still have room.') + (cats[cats.length - 1].pct < 50 ? ' ' + cats[cats.length - 1].n + ' has the most room left if you want to shift a little.' : '');
    }
    if (/afford|dinner|treat|spend on/.test(t)) {
      var n = new Date(), left = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() - n.getDate() + 1;
      return 'After recorded spending you have ' + money(c.available) + ' available for ' + c.period + '. ' + (c.available > 0 ? 'That\u2019s roughly ' + money(c.available / left) + ' a day for the rest of the month, so a modest treat looks comfortable as long as your category limits still have room.' : 'You\u2019re currently ahead of income, so I\u2019d hold off on extras and look at your biggest category first.');
    }
    if (/debt|pay first|avalanche|payoff|pay off|debt-free/.test(t)) {
      if (!c.debts.length) return 'I can\u2019t see any debts yet. Add them on the Debt page and I\u2019ll help you plan the order and the monthly amount.';
      var d = c.debts.slice().sort(function (x, y) { return y.ratePercent - x.ratePercent; })[0];
      return 'With the avalanche method you pay the highest interest first, which is ' + d.name + ' at ' + d.ratePercent + '% (' + money(d.balance) + ' left). Pay the minimum on the others and put everything extra there.' + (c.debtTargetDate ? ' You\u2019ve set a target of ' + c.debtTargetDate + ' on the Debt page, which shows the monthly amount that needs.' : ' Pick a debt-free date on the Debt page and I can work out the monthly amount you\u2019d need.');
    }
    if (/goal|save|saving|safely|flexible|move/.test(t)) {
      if (!g) return 'You don\u2019t have a savings goal yet. Name one on Overview or Budget and I\u2019ll help you decide how much to put aside each month.';
      var left2 = Math.max(g.target - g.saved, 0), pc = Math.round(g.saved / g.target * 100);
      return g.name + ' is ' + pc + '% there (' + money(g.saved) + ' of ' + money(g.target) + '). ' + (c.available > 0 ? 'With ' + money(c.available) + ' available, moving about ' + money(Math.min(left2, c.available * 0.25)) + ' toward it keeps a healthy cushion for everything else.' : 'This month is tight, so a small amount, even R50, keeps the habit going.');
    }
    if (/focus|week|next|plan/.test(t)) {
      if (ps.best && ps.best.over > 0) return 'This week I\u2019d keep an eye on ' + ps.best.name + '. At the current pace it may pass its limit by about ' + money(ps.best.over) + ', so a smaller weekly target there would help.';
      return c.available > 0 ? 'You\u2019re in a steady place. A good focus this week is to review any transactions flagged for review and move a small amount toward ' + (g ? g.name : 'a savings goal') + '.' : 'A good focus this week is your biggest spending category. Small trims there help the most.';
    }
    var top = Object.keys(period().byCat).sort(function (a, b) { return period().byCat[b] - period().byCat[a]; })[0];
    return 'For ' + c.period + ' you brought in ' + money(c.income) + ' and spent ' + money(c.spending) + ', leaving ' + money(c.available) + '.' + (top ? ' Most of your spending went on ' + top + '.' : '') + ' Ask me about your budget, goals or debts and I\u2019ll go deeper.';
  }

  /* ---------------- floating orb + drawer ---------------- */
  var CHIPS = {
    index: ['What should I focus on this week?', 'Can I safely save more?', 'Explain my spending'],
    budget: ['Where am I overspending?', 'Help me rebalance my budget', 'Can I afford dinner out?'],
    debt: ['Which debt should I pay first?', 'What if I add R500 a month?', 'Build me a payoff plan'],
    reports: ['Explain this month in plain words', 'What improved this month?', 'What should I do next month?'],
    settings: ['How does Fin use my data?', 'What can you help me with?'],
    notifications: ['Why did I get these notifications?', 'What should I act on first?'],
    privacy: ['How does Fin use my data?', 'What can you see right now?']
  };
  var KEY = 'tmf_fin_chat', chat = [], busy = false, orb, panel, msgs, input;
  try { chat = JSON.parse(ssGet(KEY) || '[]') || []; } catch (e) { chat = []; }
  if (!chat.length && T.perms().store) chat = read('trackmyfin_fin_history', []) || [];
  var persist = function () { try { sessionStorage.setItem(KEY, JSON.stringify(chat.slice(-30))); } catch (e) {} if (T.perms().store) { try { localStorage.setItem('trackmyfin_fin_history', JSON.stringify(chat.slice(-100))); } catch (e) {} } };
  var fmtText = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); };

  function renderMsgs() {
    var h = chat.map(function (m) {
      if (m.role === 'user') return '<div class="fin-msg me"><div class="bub">' + esc(m.content) + '</div></div>';
      return '<div class="fin-msg fin" data-mi="' + chat.indexOf(m) + '">' + avatar('xs') + '<div class="bub">' + fmtText(m.content) + (m.consent && !m.consent.done ? '<div class="fin-consent"><button data-consent="once">Allow once</button><button data-consent="always">Always allow</button><button data-consent="no">Not now</button></div>' : '') + (m.src === 'offline' ? (DEBUG ? '<small class="src">Answered from your saved figures \u2014 my AI connection is unavailable right now' + (m.why ? ' (' + esc(m.why) + ')' : '') + '. <a href="' + FIN_URL + '?test=1" target="_blank" rel="noopener">Run a connection check</a></small>' : '<small class="src">Answered from your saved figures.</small>') : '') + '</div></div>';
    }).join('');
    if (busy) h += '<div class="fin-msg fin">' + avatar('xs') + '<div class="bub typing" aria-label="Fin is thinking"><span></span><span></span><span></span><em>Fin is thinking\u2026</em></div></div>';
    msgs.innerHTML = h; msgs.scrollTop = msgs.scrollHeight;
  }
  function addMsg(role, text, src) { chat.push({ role: role, content: text, src: src }); persist(); renderMsgs(); }
  async function send(text, opts) {
    opts = opts || {};
    text = (text || '').trim(); if (!text || busy) return;
    if (!opts.resend) addMsg('user', text);
    if (!opts.skipConsent) { var pp = T.perms(), miss = needed(text).filter(function (k) { return !pp[k] && !(opts.once && opts.once[k]); }); if (miss.length) { addConsent(text, miss); return; } }
    busy = true; renderMsgs();
    var why = '';
    try {
      var ctrl = new AbortController(), to = setTimeout(function () { ctrl.abort(); }, 25000);
      var r = await fetch(FIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ messages: chat.filter(function (m) { return !m.consent; }).slice(-10).map(function (m) { return { role: m.role, content: m.content }; }), context: ctxFiltered(opts.once), page: LABEL }) });
      clearTimeout(to);
      if (!r.ok) {
        var eb = null; try { eb = await r.json(); } catch (x) { /* not json */ }
        why = r.status === 404 ? 'the server has no /api/fin (api/fin.js is missing from your deployment)'
          : r.status === 503 && eb && /not configured/i.test(eb.error || '') ? 'the server has no OPENROUTER_API_KEY (add it in Vercel, then redeploy)'
          : eb && eb.hint ? eb.hint
          : 'the server answered ' + r.status + (eb && eb.error ? ' (' + eb.error + ')' : '');
        throw new Error(why);
      }
      var d = await r.json(); if (!d.reply) { why = 'the AI sent an empty reply'; throw new Error(why); }
      busy = false; addMsg('assistant', d.reply, 'ai');
    } catch (e) {
      busy = false;
      if (!why) why = e && e.name === 'AbortError' ? 'the request took longer than 25 seconds' : 'the browser could not reach /api/fin';
      console.warn('[Fin] AI unavailable:', why);
      var fm = { role: 'assistant', content: localAnswer(text), src: 'offline', why: why }; chat.push(fm); persist(); renderMsgs();
    }
  }
  function build() {
    orb = document.createElement('button'); orb.className = 'fin-orb' + (localStorage.getItem('tmf_fin_seen') ? ' compact' : ''); orb.id = 'finOrb';
    orb.setAttribute('aria-label', 'Open Fin, your AI money companion');
    orb.innerHTML = avatar('') + '<i class="fin-dot"></i><span class="fin-label"><b>Ask Fin</b><small>AI money companion</small></span>';
    panel = document.createElement('aside'); panel.className = 'fin-panel'; panel.id = 'finPanel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Fin, your AI money companion');
    panel.innerHTML = '<header class="fin-head">' + avatar('sm') + '<div><strong>Fin</strong><small><i class="fin-dot"></i> AI COMPANION</small></div>' +
      '<button class="icon-btn" id="finClear" aria-label="Start a new conversation" title="New conversation"><i class="fas fa-rotate-right"></i></button>' +
      '<button class="icon-btn" id="finClose" aria-label="Close Fin"><i class="fas fa-xmark"></i></button></header>' +
      '<div class="fin-ctx"><span><i class="fas fa-wand-magic-sparkles"></i> Fin is looking at your ' + LABEL + ' picture</span><button class="link-soft" id="finWhat">What can Fin see?</button></div>' +
      '<p class="fin-see" id="finSee" hidden>Fin can use your recorded income and spending, the monthly income and goal from your profile, budget limits, savings goals and debts. Nothing leaves your browser until you send Fin a message, and then only the figures needed to answer.</p>' +
      '<div class="fin-msgs" id="finMsgs" aria-live="polite"></div>' +
      '<div class="fin-chips" id="finChips"></div>' +
      '<form class="fin-form" id="finForm"><input type="text" id="finInput" placeholder="Ask Fin anything\u2026" autocomplete="off" aria-label="Ask Fin anything"><button class="btn-primary" aria-label="Send"><i class="fas fa-arrow-up"></i></button></form>' +
      '<footer class="fin-foot">Fin offers educational guidance, not professional financial advice.</footer>';
    document.body.appendChild(orb); document.body.appendChild(panel);
    msgs = $('finMsgs'); input = $('finInput'); msgs.addEventListener('click', onConsent);
    $('finChips').innerHTML = (CHIPS[PAGE] || CHIPS.index).map(function (c) { return '<button type="button" data-q="' + escA(c) + '">' + esc(c) + '</button>'; }).join('');
    $('finChips').addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); });
    $('finForm').addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; send(v); });
    $('finClose').addEventListener('click', function () { toggle(false); });
    $('finClear').addEventListener('click', function () { chat = []; persist(); greet(); renderMsgs(); });
    $('finWhat').addEventListener('click', function () { var s = $('finSee'); s.hidden = !s.hidden; });
    orb.addEventListener('click', function () { toggle(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) toggle(false); });
  }
  function greet() { if (!chat.length) { chat.push({ role: 'assistant', content: 'Hi, I\u2019m Fin. I can help you understand your spending, shape a budget, or plan your next money move.', src: 'ai' }); persist(); } }
  function toggle(show, question) {
    panel.hidden = !show; orb.classList.toggle('away', show);
    if (show) { localStorage.setItem('tmf_fin_seen', '1'); orb.classList.add('compact'); greet(); renderMsgs(); setTimeout(function () { input.focus(); }, 60); if (question) send(question); }
    else orb.focus({ preventScroll: true });
  }

  /* ---------------- insight cards ---------------- */
  function cardCore(kind, head, sub, q, why) {
    return '<div class="fin-card-in ' + kind + '">' + avatar(kind === 'big' ? 'lg' : 'sm') + '<div class="fin-copy"><p class="eyebrow">' + (kind === 'big' ? 'Fin\u2019s daily insight' : 'Fin\u2019s note') + ' <span class="ai-badge">AI</span></p>' +
      '<h3>' + esc(head) + '</h3>' + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '<p class="why" hidden>' + esc(why) + '</p></div>' +
      '<div class="fin-acts"><button class="btn-primary" data-ask="' + escA(q) + '">Ask Fin about this</button><button class="link-soft" data-why>Why am I seeing this?</button></div></div>';
  }
  function cardHTML(kind, head, sub, q, why) {
    var id = PAGE + '|' + hashStr(head), dis = read('trackmyfin_fin_dismissed', {}) || {};
    if (dis[id]) return '';                                      // dismissed: stays hidden until the insight changes
    return cardCore(kind, head, sub, q, why).replace('<div class="fin-card-in ' + kind + '">', '<div class="fin-card-in ' + kind + '"><button class="icon-btn fin-x" data-dismiss data-did="' + escA(id) + '" aria-label="Dismiss this insight" title="Dismiss"><i class="fas fa-xmark"></i></button>');
  }
  var WHY_CALC = 'This line is calculated from the transactions, limits and goals saved in your browser. Fin (AI) only reads your data when you ask a question, and what it says is guidance, not an account total.';
  function insights() {
    var el = $('finInsight'), note = $('finNote');
    if (PAGE === 'index' && el) {
      var p = period(), g = topGoal(), over = pace().best, head, sub, q;
      if (!txs().length) { head = 'Add your first transaction and I\u2019ll start spotting patterns.'; sub = 'A few days of activity is enough for me to be useful.'; q = 'What should I track first to get a clear picture of my money?'; }
      else if (p.view === cur() && over && over.pct >= 90) { head = over.name + ' is at ' + Math.round(over.pct) + '% of its limit this month.'; sub = 'I can help you rebalance without making life feel restrictive.'; q = 'My ' + over.name + ' category is at ' + Math.round(over.pct) + '% of its limit. How can I rebalance?'; }
      else {
        head = p.available >= 0 ? 'You have ' + money(p.available) + ' available after recorded spending.' : 'Spending is ' + money(-p.available) + ' ahead of income for ' + p.label + '.';
        sub = g ? 'I can help you decide how much to keep flexible and how much to move toward ' + g.name + '.' : 'Set a savings goal and I can help you decide how much to put aside.';
        q = p.available >= 0 ? 'I have ' + money(p.available) + ' available after recorded spending. How much should I keep flexible, and how much should I move toward ' + (g ? g.name : 'a savings goal') + '?' : 'My spending is ahead of income for ' + p.label + '. What should I look at first?';
      }
      el.innerHTML = cardHTML('big', head, sub, q, WHY_CALC);
      if (txs().length) T.addFeed({ key: 'insight:' + T.todayStr(), type: 'fin', title: 'Fin noticed something', body: esc(head) + (sub ? ' ' + esc(sub) : ''), why: 'Based on the transactions, limits and goals you recorded for ' + p.label + '.', actions: [{ label: 'Ask Fin', ask: q, primary: true }, { label: 'View budget', href: 'budget.html' }] });
    }
    if (!note) return;
    var h, s, qq;
    if (PAGE === 'budget') {
      var ps = pace();
      if (ps.p.view !== cur()) { var cs = ctxFull().categories, lim = 0, used = 0; cs.forEach(function (c) { if (c.monthlyLimit) { lim += c.monthlyLimit; used += c.spent; } }); h = lim ? 'In ' + ps.p.label + ' you used ' + Math.round(used / lim * 100) + '% of your plan.' : 'No limits were set for ' + ps.p.label + '.'; s = 'Switch back to this month to see your current pace.'; qq = 'Looking at ' + ps.p.label + ', what stands out in my budget?'; }
      else if (!ctxFull().categories.some(function (c) { return c.monthlyLimit; })) { h = 'Set a limit for each category and I\u2019ll watch your pace for you.'; s = 'Even rough numbers work. You can change them any time.'; qq = 'Help me create a realistic budget for this month.'; }
      else if (ps.best && ps.best.over > 0) { h = ps.best.name + ' spending is moving faster than usual. At this pace, you may exceed your limit by ' + money(ps.best.over) + '.'; s = 'A smaller weekly target could keep you comfortably inside it.'; qq = 'My ' + ps.best.name + ' spending is moving fast. Help me explore a smaller weekly target.'; }
      else { var cc = ctxFull().categories, l2 = 0, u2 = 0; cc.forEach(function (c) { if (c.monthlyLimit) { l2 += c.monthlyLimit; u2 += c.spent; } }); h = 'You\u2019re keeping a steady pace: ' + Math.round(u2 / l2 * 100) + '% of your plan used with ' + (ps.dim - ps.day) + ' days left.'; s = 'Nice work. I can help you decide what to do with any room left over.'; qq = 'I\u2019m on track with my budget. What should I do with the room I have left?'; }
      note.innerHTML = cardHTML('slim', h, s, qq, WHY_CALC);
    } else if (PAGE === 'debt') {
      var c2 = ctxFull(), b = c2.debtMonthlyBudget;
      if (!c2.debts.length) { h = 'Add a debt and I\u2019ll help you choose where to start.'; s = 'The avalanche method (highest interest first) usually saves the most.'; qq = 'Explain the avalanche strategy.'; }
      else if (!b || typeof calculateTimelineForMethod !== 'function') { h = 'Tell me your monthly payment budget and I\u2019ll estimate your payoff date.'; s = 'You\u2019ll find the box in the coach card on this page.'; qq = 'Build me a payoff plan.'; }
      else {
        var a = calculateTimelineForMethod(b, 'avalanche'), e = calculateTimelineForMethod(b + 500, 'avalanche');
        if (a.error || e.error) { h = 'Your budget looks too low to cover the minimum payments.'; s = 'Let\u2019s find an amount that works.'; qq = 'My debt budget is too low for the minimum payments. What are my options?'; }
        else if (e.months < a.months) { h = 'Adding R500 to your monthly payment could shorten your payoff by about ' + (a.months - e.months) + ' month' + (a.months - e.months === 1 ? '' : 's') + '.'; s = 'It would also save roughly ' + money(a.totalInterest - e.totalInterest) + ' in interest.'; qq = 'What happens if I add R500 per month to my debt payments?'; }
        else { h = 'At ' + money(b) + ' a month you\u2019re set to be debt-free in about ' + T.fmtMonths(a.months) + '.'; s = 'Extra R500 wouldn\u2019t change the timeline much, so a goal might benefit more.'; qq = 'Should I put extra money toward debt or toward a savings goal?'; }
      }
      note.innerHTML = cardHTML('slim', h, s, qq, WHY_CALC);
    } else if (PAGE === 'reports') {
      var mi = $('reportMonth'), ym = mi && mi.value || cur(), pm = (function () { var x = ym.split('-'); return ymOf(new Date(+x[0], +x[1] - 2, 1)); })();
      function tot(k) { var r = { i: 0, e: 0 }; txs().forEach(function (t) { if ((t.date || '').slice(0, 7) !== k) return; if (isInc(t)) r.i += Math.abs(amt(t)); else r.e += Math.abs(amt(t)); }); return r; }
      var c3 = tot(ym), p3 = tot(pm);
      if (!c3.i && !c3.e) { h = 'Nothing recorded for ' + monthName(ym) + ' yet.'; s = 'Add some transactions and I\u2019ll explain the month for you.'; qq = 'What should I record to get a useful monthly report?'; }
      else if (c3.i && p3.i) { var r1 = Math.round((c3.i - c3.e) / c3.i * 100), r0 = Math.round((p3.i - p3.e) / p3.i * 100); h = 'Your savings rate ' + (r1 >= r0 ? 'improved' : 'dipped') + ' to ' + r1 + '% from ' + r0 + '% last month.'; s = r1 >= r0 ? 'That\u2019s worth celebrating. I can point out what helped most.' : 'Not a problem. I can help you spot what changed.'; qq = 'My savings rate went from ' + r0 + '% to ' + r1 + '%. What changed and what should I do next month?'; }
      else { h = 'You kept ' + money(c3.i - c3.e) + ' in ' + monthName(ym) + '.'; s = 'Once you have two months of data I can show how you\u2019re trending.'; qq = 'Explain this month in plain words.'; }
      note.innerHTML = cardHTML('slim', h, s, qq, WHY_CALC);
    }
  }

  /* ---------------- eyes follow the cursor ---------------- */
  var raf = 0, mx = 0, my = 0;
  document.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY; if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      [].forEach.call(document.querySelectorAll('.fin-av'), function (a) {
        var r = a.getBoundingClientRect(); if (!r.width) return;
        var dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220);
        a.style.setProperty('--ex', (dx / d * 2.4 * k).toFixed(2) + 'px'); a.style.setProperty('--ey', (dy / d * 1.8 * k).toFixed(2) + 'px');
      });
    });
  });

  function init() {
    var mo = read('trackmyfin_motion', {}) || {};
    document.body.classList.toggle('no-fin', mo.fin === false);     // Settings toggle works live (CSS hides/shows Fin)
    if (PAGE === 'settings' || PAGE === 'privacy') document.body.classList.add('fin-quiet');
    build(); window.__TMF_FIN = true; console.info('[Track My Fin] Fin is ready');
    try { insights(); } catch (e) { console.warn('Fin insights:', e); }
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-ask]'); if (a) { toggle(true, a.dataset.ask); return; }
      var x = e.target.closest('[data-dismiss]');
      if (x) { var dd = read('trackmyfin_fin_dismissed', {}) || {}; dd[x.dataset.did] = 1; var ks = Object.keys(dd); if (ks.length > 40) delete dd[ks[0]]; localStorage.setItem('trackmyfin_fin_dismissed', JSON.stringify(dd)); var host = x.closest('#finInsight,#finNote'); if (host) host.innerHTML = ''; return; }
      var w = e.target.closest('[data-why]'); if (w) { var y = w.closest('.fin-card-in').querySelector('.why'); y.hidden = !y.hidden; }
    });
    var t; var again = function () { clearTimeout(t); t = setTimeout(insights, 80); };
    ['remainingAmount', 'msText', 'bUsed', 'totalDebt', 'payoffEstimate', 'flowNet', 'noteHeadline'].forEach(function (id) { var e = $(id); if (e) new MutationObserver(again).observe(e, { childList: true, characterData: true, subtree: true }); });
    var rm = $('reportMonth'); if (rm) rm.addEventListener('change', again);
    var bi = $('monthlyDebtBudget'); if (bi) bi.addEventListener('input', again);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();