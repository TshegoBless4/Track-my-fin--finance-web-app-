
(function () {
  'use strict';
  var T = window.TMF, list = document.getElementById('nList'); if (!T || !list) return;
  var $ = function (id) { return document.getElementById(id); }, esc = T.esc, escA = T.escA, FOLD = 'trackmyfin_ui_collapsed';
  var TYPES = { fin: ['fa-robot', 'Fin'], budget: ['fa-wallet', 'Budget'], goals: ['fa-bullseye', 'Goals'], payments: ['fa-credit-card', 'Payments'], reports: ['fa-chart-line', 'Reports'], security: ['fa-shield-halved', 'Security'] };
  var FILTERS = [['all', 'All'], ['fin', 'Fin'], ['budget', 'Budget'], ['payments', 'Payments'], ['goals', 'Goals'], ['security', 'Security']];
  var filter = 'all';
  var match = function (it) { return filter === 'all' || it.type === filter || (filter === 'fin' && it.type === 'reports'); };
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000), d = new Date(ts), n = new Date(); n.setHours(0, 0, 0, 0);
    if (m < 1) return 'Just now'; if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago'); if (ts >= n.getTime()) { var h = Math.floor(m / 60); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
    if (ts >= n.getTime() - 864e5) return 'Yesterday'; if (ts >= n.getTime() - 6 * 864e5) return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    return d.getDate() + ' ' + T.MONTHS[d.getMonth()];
  }
  function group(ts) { var n = new Date(); n.setHours(0, 0, 0, 0); return ts >= n.getTime() ? 'Today' : ts >= n.getTime() - 6 * 864e5 ? 'This week' : 'Earlier'; }
  var feed = function () { return T.feedGet(); };
  var save = function (f) { T.feedSet(f); };
  var fold = function () { return T.read(FOLD, {}) || {}; };

  function upcoming() {
    var n = 0; (T.read('trackmyfin_debts', []) || []).forEach(function (d) { var i = T.dueInfo(d); if (i && i.days <= 14) n++; });
    (T.read('trackmyfin_events', []) || []).forEach(function (e) { var d = Math.round((new Date(e.date + 'T00:00:00') - new Date(new Date().setHours(0, 0, 0, 0))) / 864e5); if (d >= 0 && d <= 14) n++; });
    return n;
  }
  function item(it) {
    var t = TYPES[it.type] || TYPES.fin, open = it.open === undefined ? !it.read : it.open;
    var acts = (it.actions || []).map(function (a) { return a.ask ? '<button class="nf-btn ' + (a.primary ? 'p' : '') + '" data-ask="' + escA(a.ask) + '">' + esc(a.label) + '</button>' : '<a class="nf-btn ' + (a.primary ? 'p' : '') + '" href="' + escA(a.href) + '">' + esc(a.label) + '</a>'; }).join('');
    return '<article class="nf-item t-' + it.type + (it.read ? '' : ' unread') + (it.seen ? '' : ' new') + '" data-id="' + it.id + '"><div class="nf-ico"><i class="fas ' + t[0] + '"></i></div><div class="nf-main">' +
      '<div class="nf-top"><h4>' + esc(it.title) + '</h4><span class="nf-time">' + ago(it.ts) + '</span>' + (it.read ? '' : '<span class="nf-dot" title="Unread"></span>') + '<button class="goal-chev" data-act="toggle" aria-expanded="' + open + '" aria-label="' + (open ? 'Collapse' : 'Expand') + ' notification"><i class="fas fa-chevron-' + (open ? 'up' : 'down') + '"></i></button></div>' +
      (open ? '<div class="nf-body"><p>' + it.body + '</p>' + (it.why ? '<p class="nf-why"><i class="fas fa-circle-info"></i> ' + esc(it.why) + '</p>' : '') + '<p class="nf-label">' + t[1] + '</p><div class="nf-acts">' + acts + '<button class="nf-btn" data-act="' + (it.read ? 'unread' : 'read') + '">' + (it.read ? 'Mark as unread' : 'Mark as read') + '</button><button class="nf-btn quiet" data-act="dismiss">Dismiss</button></div></div>' : '') + '</div></article>';
  }
  function render() {
    var all = feed(), shown = all.filter(match), f = fold(), unread = all.filter(function (x) { return !x.read; });
    $('nUnread').textContent = unread.length; $('nUpcoming').textContent = upcoming(); $('nFin').textContent = unread.filter(function (x) { return x.type === 'fin' || x.type === 'reports'; }).length;
    $('nCount').textContent = shown.length + (shown.length === 1 ? ' update' : ' updates');
    $('nFilters').innerHTML = FILTERS.map(function (x) { return '<button role="tab" class="' + (filter === x[0] ? 'on' : '') + '" data-f="' + x[0] + '" aria-selected="' + (filter === x[0]) + '">' + x[1] + '</button>'; }).join('');
    if (!shown.length) { list.innerHTML = '<div class="empty-state"><i class="far fa-bell"></i> You&rsquo;re all caught up. New updates from Fin will appear here.</div>'; T.updateBadge(); return; }
    var h = '', groups = ['Today', 'This week', 'Earlier'];
    groups.forEach(function (g) {
      var its = shown.filter(function (x) { return group(x.ts) === g; }); if (!its.length) return;
      var shut = !!f['nf-' + g];
      h += '<div class="nf-group' + (shut ? ' is-shut' : '') + '"><button class="nf-gh" data-group="' + g + '" aria-expanded="' + (!shut) + '"><span>' + g + '</span><small>' + its.length + '</small><i class="fas fa-chevron-' + (shut ? 'down' : 'up') + '"></i></button>' + (shut ? '' : its.map(item).join('')) + '</div>';
    });
    list.innerHTML = h;
    var f2 = all.map(function (x) { if (!x.seen) x.seen = true; return x; }); save(f2);    // the entrance animation plays once
    T.updateBadge();
  }
  function upd(id, fn) { var f = feed(); f.forEach(function (x) { if (String(x.id) === String(id)) fn(x); }); save(f); render(); }
  list.addEventListener('click', function (e) {
    var g = e.target.closest('[data-group]'); if (g) { var m = fold(); m['nf-' + g.dataset.group] = !m['nf-' + g.dataset.group]; if (!m['nf-' + g.dataset.group]) delete m['nf-' + g.dataset.group]; T.write(FOLD, m); render(); return; }
    var b = e.target.closest('[data-act]'); if (!b) return; var id = b.closest('.nf-item').dataset.id, a = b.dataset.act;
    if (a === 'toggle') upd(id, function (x) { x.open = !(x.open === undefined ? !x.read : x.open); });
    else if (a === 'read') upd(id, function (x) { x.read = true; x.open = false; });
    else if (a === 'unread') upd(id, function (x) { x.read = false; x.open = true; });
    else if (a === 'dismiss') { save(feed().filter(function (x) { return String(x.id) !== String(id); })); render(); }
  });
  $('nFilters').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; render(); } });
  $('markAll').addEventListener('click', function () { var f = feed(); f.forEach(function (x) { x.read = true; x.open = false; }); save(f); render(); T.toast('All caught up', 'success'); });
  $('nFoldAll').addEventListener('click', function () {
    var f = feed(), anyOpen = f.some(function (x) { return x.open === undefined ? !x.read : x.open; }); f.forEach(function (x) { x.open = !anyOpen; }); save(f); $('nFoldAll').textContent = anyOpen ? 'Expand all' : 'Collapse all'; render();
  });
  render();
})();