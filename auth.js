
(function () {
  'use strict';
  var LS = window.localStorage, SS = window.sessionStorage;
  var K = { acc: 'tmf_accounts', active: 'tmf_active', sess: 'tmf_session', fails: 'tmf_fails' };
  var ITER = 150000;
  var j = function (s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
  var accounts = function () { return j(LS.getItem(K.acc), {}); };
  var saveAccounts = function (a) { LS.setItem(K.acc, JSON.stringify(a)); };
  var idOf = function (email) { return String(email || '').trim().toLowerCase(); };
  var vk = function (id) { return 'tmf_vault_' + id; };
  var page = function () { return (location.pathname.split('/').pop() || 'index.html') + location.search; };

  /* ---------- crypto ---------- */
  function b64(buf) { var s = ''; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function hash(secret, saltB64, iter) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error('This browser cannot secure passwords here. Open the site over https.'));
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter || ITER, hash: 'SHA-256' }, k, 256);
    }).then(b64);
  }
  function newSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }
  function same(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  function makeCode() {
    var al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(16)), s = '';
    for (var i = 0; i < 16; i++) { s += al[r[i] % al.length]; if (i % 4 === 3 && i < 15) s += '-'; }
    return s;
  }
  var cleanCode = function (c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };

  /* ---------- per-account data ---------- */
  function dataKeys() { var o = []; for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (/^trackmyfin_/.test(k) || k === 'lastGeneratedReport') o.push(k); } return o; }
  function dump() { var o = {}; dataKeys().forEach(function (k) { o[k] = LS.getItem(k); }); return o; }
  function clearLive() { dataKeys().forEach(function (k) { LS.removeItem(k); }); try { ['tmf_fin_chat', 'tmf_fin_seen', 'tmf_view', 'tmf_view_budget'].forEach(function (k) { SS.removeItem(k); }); } catch (e) {} LS.removeItem('tmf_fin_seen'); }
  function restore(o) { Object.keys(o || {}).forEach(function (k) { try { LS.setItem(k, o[k]); } catch (e) {} }); }
  function stash(id) { if (id) LS.setItem(vk(id), JSON.stringify(dump())); }
  // Make the live data belong to `id`. adopt: the very first account takes over data already in this browser.
  function activate(id, adopt) {
    var active = LS.getItem(K.active) || '';
    if (active === id) return;
    if (active) stash(active);
    else if (!adopt && dataKeys().length) LS.setItem('tmf_vault_orphan', JSON.stringify(dump()));
    if (!(adopt && !active)) { clearLive(); restore(j(LS.getItem(vk(id)), {})); LS.removeItem(vk(id)); }
    LS.setItem(K.active, id);
  }

  /* ---------- session ---------- */
  function session() { var s = j(SS.getItem(K.sess), null) || j(LS.getItem(K.sess), null); if (!s) return null; var a = accounts()[s.id]; if (!a) return null; if ((LS.getItem(K.active) || '') !== s.id) return null; return { id: s.id, name: a.name, email: a.email }; }
  function startSession(id, remember) { SS.removeItem(K.sess); LS.removeItem(K.sess); (remember ? LS : SS).setItem(K.sess, JSON.stringify({ id: id, t: Date.now() })); }
  function endSession() { SS.removeItem(K.sess); LS.removeItem(K.sess); }

  /* ---------- failed-attempt limiter ---------- */
  function lockLeft(id) { var f = j(LS.getItem(K.fails), {})[id]; return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
  function fail(id) { var all = j(LS.getItem(K.fails), {}), f = all[id] || { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = Date.now() + 30000; f.n = 0; } all[id] = f; LS.setItem(K.fails, JSON.stringify(all)); }
  function ok(id) { var all = j(LS.getItem(K.fails), {}); delete all[id]; LS.setItem(K.fails, JSON.stringify(all)); }

  /* ---------- password rules ---------- */
  var COMMON = /^(password|passw0rd|12345678|123456789|qwerty123|iloveyou|letmein1|welcome1|admin123|trackmyfin)/i;
  function strength(pw, name, email) {
    pw = pw || ''; var low = pw.toLowerCase(), local = idOf(email).split('@')[0];
    var checks = {
      len: pw.length >= 8,
      mix: /[a-z]/i.test(pw) && /\d/.test(pw),
      own: !!pw && !(local && local.length > 2 && low.indexOf(local) >= 0) && !(name && String(name).trim().length > 2 && low.indexOf(String(name).trim().toLowerCase().split(/\s+/)[0]) >= 0)
    };
    var score = 0; if (checks.len) score++; if (pw.length >= 12) score++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++; if (/\d/.test(pw)) score++; if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (!checks.own) score = Math.min(score, 2); if (COMMON.test(pw)) score = 0;
    var level = !pw ? 0 : !checks.len || score <= 1 ? 1 : score <= 3 ? 2 : 3;
    return { level: level, label: ['', 'Weak', 'Okay', 'Strong'][level], checks: checks, valid: checks.len && !COMMON.test(pw) };
  }

  /* ---------- actions ---------- */
  function signUp(o) {
    var id = idOf(o.email), all = accounts();
    if (all[id]) return Promise.reject(new Error('An account with this email already exists on this device. Try signing in.'));
    var first = !Object.keys(all).length, salt = newSalt(), rsalt = newSalt(), code = makeCode();
    return Promise.all([hash(o.password, salt), hash(cleanCode(code), rsalt)]).then(function (h) {
      all = accounts();
      all[id] = { name: o.name.trim(), email: String(o.email).trim(), salt: salt, hash: h[0], iter: ITER, rsalt: rsalt, rhash: h[1], created: new Date().toISOString() };
      saveAccounts(all); activate(id, first);
      var p = j(LS.getItem('trackmyfin_profile'), null) || {};
      p.name = o.name.trim(); p.updatedAt = new Date().toISOString().split('T')[0];
      if (o.income > 0) p.income = o.income; else if (p.income == null) p.income = 0;
      if (o.goal) p.goal = o.goal; else if (!p.goal) p.goal = 'Not specified';
      if (!p.occupation) p.occupation = 'Not specified';
      LS.setItem('trackmyfin_profile', JSON.stringify(p)); LS.setItem('trackmyfin_email', String(o.email).trim()); LS.setItem('trackmyfin_currency', o.currency || 'ZAR');
      startSession(id, !!o.remember);
      return { code: code };
    });
  }
  function signIn(email, pw, remember) {
    var id = idOf(email), a = accounts()[id], left = lockLeft(id);
    if (left) return Promise.reject(new Error('Too many attempts. Please wait ' + left + ' seconds and try again.'));
    var bad = new Error('That email and password do not match. Check them and try again.');
    if (!a) { return hash(pw || 'x', newSalt()).then(function () { throw bad; }); } // same timing whether or not the email exists
    return hash(pw, a.salt, a.iter).then(function (h) {
      if (!same(h, a.hash)) { fail(id); throw bad; }
      ok(id); activate(id, false); startSession(id, !!remember); return { name: a.name };
    });
  }
  function resetPassword(email, code, newPw) {
    var id = idOf(email), a = accounts()[id], bad = new Error('That email and recovery code do not match.'), left = lockLeft(id);
    if (left) return Promise.reject(new Error('Too many attempts. Please wait ' + left + ' seconds and try again.'));
    if (!strength(newPw, a && a.name, email).valid) return Promise.reject(new Error('Choose a new password with at least 8 characters.'));
    if (!a) return hash('x', newSalt()).then(function () { throw bad; });
    return hash(cleanCode(code), a.rsalt, a.iter).then(function (h) {
      if (!same(h, a.rhash)) { fail(id); throw bad; }
      var salt = newSalt(), rsalt = newSalt(), nc = makeCode();
      return Promise.all([hash(newPw, salt), hash(cleanCode(nc), rsalt)]).then(function (n) {
        var all = accounts(); Object.assign(all[id], { salt: salt, hash: n[0], rsalt: rsalt, rhash: n[1], iter: ITER }); saveAccounts(all);
        ok(id); activate(id, false); startSession(id, false); return { code: nc };
      });
    });
  }
  function changePassword(oldPw, newPw) {
    var s = session(); if (!s) return Promise.reject(new Error('Please sign in again.'));
    var a = accounts()[s.id];
    if (!strength(newPw, a.name, a.email).valid) return Promise.reject(new Error('Choose a new password with at least 8 characters.'));
    return hash(oldPw, a.salt, a.iter).then(function (h) {
      if (!same(h, a.hash)) throw new Error('Your current password is not right.');
      var salt = newSalt(); return hash(newPw, salt).then(function (n) { var all = accounts(); Object.assign(all[s.id], { salt: salt, hash: n, iter: ITER }); saveAccounts(all); });
    });
  }
  function signOut() {
    var s = session(); if (s) { stash(s.id); clearLive(); LS.setItem(K.active, ''); }
    endSession(); try { SS.removeItem('tmf_splash'); } catch (e) {} location.href = 'splash.html';
  }
  function deleteAccountRecord() { // data keys are removed by the Privacy page; this removes the login itself
    var s = session(), id = s ? s.id : (LS.getItem(K.active) || ''); if (!id) return;
    var all = accounts(); delete all[id]; saveAccounts(all); LS.removeItem(vk(id)); LS.setItem(K.active, ''); endSession();
  }

  var api = { session: session, accounts: accounts, strength: strength, signUp: signUp, signIn: signIn, signOut: signOut, resetPassword: resetPassword, changePassword: changePassword, deleteAccountRecord: deleteAccountRecord, hasAccounts: function () { return Object.keys(accounts()).length > 0; } };
  window.TMFAuth = api;

  /* ---------- gate: every app page needs a signed-in account ---------- */
  if (window.TMF_AUTH_PAGE) return;
  var me = session();
  if (!me) {
    window.__tmfGated = true;
    try { location.replace(SS.getItem('tmf_splash') ? 'account.html?next=' + encodeURIComponent(page()) : 'splash.html'); } catch (e) {}
    return;
  }
  // coming back after the browser or tab was closed: play the intro again before the app
  try { if (!SS.getItem('tmf_splash')) { window.__tmfGated = true; location.replace('splash.html'); return; } } catch (e) {}
  window.addEventListener('storage', function (e) { if (e.key === K.active || e.key === K.acc) location.reload(); });

  /* ---------- profile menu on the top-right avatar ---------- */
  var css = document.createElement('style');
  css.textContent = '.acct-menu{position:fixed;z-index:200;width:280px;max-width:calc(100vw - 24px);padding:10px;border-radius:22px;background:rgba(255,250,252,.97);border:1px solid rgba(112,84,134,.16);box-shadow:0 22px 60px rgba(80,50,110,.22);font-family:var(--font-body,"DM Sans",system-ui,sans-serif);animation:acctIn .16s ease}@keyframes acctIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}.acct-menu .who{display:flex;gap:12px;align-items:center;padding:10px 10px 12px;border-bottom:1px solid rgba(112,84,134,.12);margin-bottom:6px}.acct-menu .who .av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#8a78b0,#d98f9c);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;flex:none}.acct-menu .who b{display:block;color:#3b2f46;font-size:14px;line-height:1.25}.acct-menu .who small{display:block;color:#76697f;font-size:12px;word-break:break-all}.acct-menu a,.acct-menu button{display:flex;gap:10px;align-items:center;width:100%;padding:11px 12px;border:0;background:none;border-radius:14px;color:#3b2f46;font:600 13.5px var(--font-body,"DM Sans",sans-serif);text-decoration:none;cursor:pointer;text-align:left}.acct-menu a:hover,.acct-menu button:hover,.acct-menu a:focus-visible,.acct-menu button:focus-visible{background:rgba(123,106,159,.12);outline:none}.acct-menu svg{width:17px;height:17px;flex:none;stroke:#7b6a9f;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.acct-menu .out{color:#b0524c}.acct-menu .out svg{stroke:#b0524c}';
  document.head.appendChild(css);
  var ic = {
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>'
  };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ini = function (n) { return (n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('') || 'TM'; };
  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } var c = document.querySelector('.user-chip'); if (c) c.setAttribute('aria-expanded', 'false'); }
  function openMenu(chip) {
    closeMenu(); var s = session() || me, r = chip.getBoundingClientRect();
    menu = document.createElement('div'); menu.className = 'acct-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = '<div class="who"><span class="av">' + esc(ini(s.name)) + '</span><div><b>' + esc(s.name) + '</b><small>' + esc(s.email) + '</small></div></div>' +
      '<a role="menuitem" href="settings.html#profile">' + ic.user + 'Profile &amp; settings</a>' +
      '<a role="menuitem" href="settings.html#account">' + ic.shield + 'Account security</a>' +
      '<a role="menuitem" href="account.html?preview=1&back=' + encodeURIComponent(page()) + '">' + ic.eye + 'Preview sign in</a>' +
      '<button role="menuitem" type="button" class="out" data-out>' + ic.out + 'Sign out</button>';
    document.body.appendChild(menu);
    menu.style.top = Math.round(r.bottom + 10) + 'px'; menu.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
    chip.setAttribute('aria-expanded', 'true');
    menu.querySelector('[data-out]').addEventListener('click', signOut);
    var f = menu.querySelector('a'); if (f) f.focus();
  }
  document.addEventListener('DOMContentLoaded', function () {
    var chip = document.querySelector('.user-chip');
    if (chip) {
      chip.setAttribute('aria-haspopup', 'menu'); chip.setAttribute('aria-expanded', 'false'); chip.title = 'Account';
      chip.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); menu ? closeMenu() : openMenu(chip); });
    }
    document.addEventListener('click', function (e) { if (menu && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', closeMenu);

    /* Settings > Account & security */
    var box = document.getElementById('acctSec'); if (!box) return;
    var s = session() || me, $ = function (id) { return document.getElementById(id); };
    $('acctName').textContent = s.name; $('acctEmail').textContent = s.email;
    var made = accounts()[s.id]; if (made && made.created) $('acctSince').textContent = new Date(made.created).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
    $('acctPreview').href = 'account.html?preview=1&back=' + encodeURIComponent(page());
    $('acctOut').addEventListener('click', signOut);
    var form = $('pwForm'), msg = $('pwMsg');
    $('pwToggle').addEventListener('click', function () { form.hidden = !form.hidden; if (!form.hidden) $('pwOld').focus(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg.className = 'acct-msg'; msg.textContent = '';
      changePassword($('pwOld').value, $('pwNew').value).then(function () { form.reset(); form.hidden = true; if (window.TMF && TMF.toast) TMF.toast('Password updated', 'success'); else { msg.textContent = 'Password updated.'; } })
        .catch(function (err) { msg.className = 'acct-msg bad'; msg.textContent = err.message; });
    });
  });
})();