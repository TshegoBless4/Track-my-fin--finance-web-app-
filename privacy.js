/* Privacy & Fin centre: permissions, status, data controls */
(function () {
  'use strict';
  var T = window.TMF, $ = function (id) { return document.getElementById(id); }; if (!T || !$('permList')) return;
  var esc = T.esc;
  var AREAS = [
    ['transactions', 'fa-receipt', 'Analyze transactions', 'Lets Fin spot spending patterns and explain where your money went.'],
    ['budgets', 'fa-wallet', 'Analyze budgets', 'Lets Fin compare your spending with the limits and plans you set.'],
    ['debts', 'fa-credit-card', 'Analyze debt information', 'Allows Fin to compare balances and interest rates when discussing payoff strategies.'],
    ['goals', 'fa-bullseye', 'Analyze goals', 'Lets Fin suggest realistic contributions toward your priorities.'],
    ['memory', 'fa-comments', 'Use previous conversations', 'Lets Fin recall earlier chats for more continuous guidance. Needs conversation storage.'],
    ['categorise', 'fa-tags', 'AI categorisation of new transactions', 'Sends transaction descriptions to an AI service to suggest categories. If off, simple keyword rules are used.'],
    ['store', 'fa-database', 'Store Fin conversation history', 'Keeps your chats on this device after you close the tab. Off means chats disappear when the tab closes.'],
    ['analytics', 'fa-chart-line', 'Product analytics', 'Track My Fin collects no analytics today. This stays off unless you ever choose otherwise.']
  ];
  var ACCESS = ['transactions', 'budgets', 'debts', 'goals', 'memory', 'categorise'];
  function render() {
    var P = T.perms(), on = ACCESS.filter(function (k) { return P[k]; }).length, le = (T.read('trackmyfin_privacy', {}) || {}).lastExport;
    $('stAccess').textContent = on ? on + ' of 6 areas' : 'Revoked'; $('stStore').textContent = P.store ? 'Enabled' : 'Disabled'; $('stAnalytics').textContent = P.analytics ? 'On' : 'Off';
    $('stExport').textContent = le ? new Date(le).getDate() + ' ' + T.MONTHS[new Date(le).getMonth()].slice(0, 3) + ' ' + new Date(le).getFullYear() : 'Never';
    $('permList').innerHTML = AREAS.map(function (a) { return '<div class="perm"><span class="ico"><i class="fas ' + a[1] + '"></i></span><div><strong>' + a[2] + '</strong><small>' + a[3] + '</small></div><label class="toggle"><input type="checkbox" data-k="' + a[0] + '"' + (P[a[0]] ? ' checked' : '') + ' aria-label="' + esc(a[2]) + '"><span></span></label></div>'; }).join('');
  }
  var hourKey = function () { var d = new Date(); return d.toISOString().slice(0, 13); };
  function security(title, body, why) { T.addFeed({ key: 'sec:' + title + ':' + hourKey(), type: 'security', title: title, body: body, why: why || 'You changed this in Privacy & Fin.', actions: [{ label: 'Review permissions', href: 'privacy.html', primary: true }] }); }
  $('permList').addEventListener('change', function (e) {
    var i = e.target.closest('[data-k]'); if (!i) return; var k = i.dataset.k, v = i.checked, patch = {}; patch[k] = v;
    if (k === 'memory' && v && !T.perms().store) { patch.store = true; T.toast('Using previous conversations needs conversation storage, so it was turned on too.'); }
    if (k === 'store' && !v) patch.memory = false;
    T.setPerms(patch); render();
    var label = AREAS.filter(function (a) { return a[0] === k; })[0][2];
    T.toast(label + (v ? ' is on' : ' is off'), 'success'); security('Privacy setting changed', '<b>' + esc(label) + '</b> was turned ' + (v ? 'on' : 'off') + '.');
  });

  /* ---------- data helpers ---------- */
  var keys = function () { return Object.keys(localStorage).filter(function (k) { return /^trackmyfin_/.test(k); }); };
  var len = function (k) { var v = T.read(k, []); return Array.isArray(v) ? v.length : 0; };
  function convo() { var h = T.read('trackmyfin_fin_history', []) || [], s = []; try { s = JSON.parse(sessionStorage.getItem('tmf_fin_chat') || '[]') || []; } catch (e) {} return h.length ? h : s; }
  function download(name, obj) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
  function exportAll() {
    var data = {}; keys().forEach(function (k) { if (k === 'trackmyfin_last_updated') return; try { data[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { data[k] = localStorage.getItem(k); } });
    download('trackmyfin_all_data_' + T.todayStr() + '.json', { app: 'Track My Fin', exportedAt: new Date().toISOString(), data: data });
    T.setPerms({ lastExport: Date.now() }); render(); T.toast('Your data was downloaded', 'success'); security('Data exported', 'You downloaded a copy of your Track My Fin data.');
  }
  var RECORDS = ['trackmyfin_data', 'trackmyfin_debts', 'trackmyfin_debt_payments', 'trackmyfin_debt_budget', 'trackmyfin_debt_target', 'trackmyfin_debt_due', 'trackmyfin_budgets', 'trackmyfin_custom_limits', 'trackmyfin_budget_hidden', 'trackmyfin_goals_v2', 'trackmyfin_savings', 'trackmyfin_goals', 'trackmyfin_events'];
  function summary() {
    var c = { tx: len('trackmyfin_data'), d: len('trackmyfin_debts'), p: len('trackmyfin_debt_payments'), g: len('trackmyfin_goals_v2'), e: len('trackmyfin_events') };
    return ['<b>' + c.tx + '</b> transaction' + (c.tx === 1 ? '' : 's'), '<b>' + c.d + '</b> debt' + (c.d === 1 ? '' : 's') + ' and <b>' + c.p + '</b> recorded payment' + (c.p === 1 ? '' : 's'), '<b>' + c.g + '</b> savings goal' + (c.g === 1 ? '' : 's') + ' and <b>' + c.e + '</b> upcoming plan' + (c.e === 1 ? '' : 's'), 'Your budget limits'];
  }
  function askDelete(title, body, list, confirmLabel) {
    return T.dialog({ title: title, body: body, list: list, note: '<b>This cannot be recovered.</b> Your data lives only in this browser, so there is no backup to restore from.', cancelValue: 'cancel',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Download a copy first', value: 'export' }, { label: confirmLabel, value: 'delete', danger: true }] }).then(function (v) { if (v === 'export') { exportAll(); return askDelete(title, body, list, confirmLabel); } return v === 'delete'; });
  }
  function keepSamplesOff() { localStorage.setItem('trackmyfin_sample_loaded', 'true'); }

  $('dlAll').addEventListener('click', exportAll);
  $('dlChat').addEventListener('click', function () { var c = convo(); if (!c.length) { T.toast('There are no Fin conversations to download', 'warning'); return; } download('fin_conversations_' + T.todayStr() + '.json', { app: 'Track My Fin', exportedAt: new Date().toISOString(), messages: c }); T.toast('Conversation history downloaded', 'success'); });
  $('delChat').addEventListener('click', function () {
    var n = convo().length; if (!n) { T.toast('There are no Fin conversations to delete', 'warning'); return; }
    T.confirmDialog({ title: 'Delete your Fin conversations?', body: 'This removes your chat history with Fin.', list: ['<b>' + n + '</b> message' + (n === 1 ? '' : 's')], note: 'Your finances are not touched. This cannot be recovered.', confirm: 'Delete conversations', danger: true }).then(function (ok) {
      if (!ok) return; localStorage.removeItem('trackmyfin_fin_history'); try { sessionStorage.removeItem('tmf_fin_chat'); } catch (e) {} T.toast('Fin conversations deleted', 'success'); security('Conversations deleted', 'Your Fin conversation history was deleted.');
    });
  });
  $('revoke').addEventListener('click', function () {
    T.confirmDialog({ title: 'Revoke Fin\u2019s access?', body: 'Fin will lose access to all of these until you switch them back on:', list: ['Transactions, budgets, debts and goals', 'Previous conversations and conversation storage', 'AI categorisation of new transactions'], note: 'You can switch access back on any time. Nothing is deleted.', confirm: 'Revoke access', danger: true }).then(function (ok) {
      if (!ok) return; T.setPerms({ transactions: false, budgets: false, debts: false, goals: false, memory: false, store: false, categorise: false, analytics: false }); render(); T.toast('Fin\u2019s access was revoked', 'success'); security('Fin access revoked', 'All Fin permissions were turned off.');
    });
  });
  $('delRecords').addEventListener('click', function () {
    askDelete('Delete your financial records?', 'These will be permanently deleted from this browser:', summary(), 'Delete records').then(function (ok) {
      if (!ok) return; RECORDS.forEach(function (k) { localStorage.removeItem(k); }); keepSamplesOff(); T.toast('Financial records deleted', 'success'); security('Financial records deleted', 'Your transactions, debts, budgets, goals and plans were deleted.'); render();
    });
  });
  $('delAccount').addEventListener('click', function () {
    askDelete('Delete your account?', 'Everything Track My Fin stores in this browser will be permanently deleted:', summary().concat(['Your profile, categories, rules and preferences', 'Fin conversations and notifications']), 'Delete everything').then(function (ok) {
      if (!ok) return; keys().forEach(function (k) { localStorage.removeItem(k); }); ['tmf_fin_seen', 'tmf_fin_chat'].forEach(function (k) { localStorage.removeItem(k); try { sessionStorage.removeItem(k); } catch (e) {} });
      try { sessionStorage.clear(); } catch (e) {} keepSamplesOff(); if (window.TMFAuth) TMFAuth.deleteAccountRecord(); location.href = window.TMFAuth ? 'account.html' : 'index.html';
    });
  });
  render();
})();