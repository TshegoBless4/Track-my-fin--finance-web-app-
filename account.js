/* Sign-in / account-creation screen (logic). Uses TMFAuth from auth.js */
(function () {
  'use strict';
  var A = window.TMFAuth, $ = function (id) { return document.getElementById(id); }, qs = new URLSearchParams(location.search);
  var preview = qs.get('preview') === '1';
  var safe = function (u) { return /^[a-z_]+\.html(\?[\w=&%.-]*)?(#[\w-]*)?$/i.test(u || '') && !/^account\.html/i.test(u) ? u : ''; };
  var back = safe(qs.get('back')) || 'settings.html#account', nextUrl = safe(qs.get('next'));
  var me = A.session();

  /* not signed in and the intro has not played this visit: show the splash first (it sends people back here) */
  var splashSeen = false; try { splashSeen = !!sessionStorage.getItem('tmf_splash'); } catch (e) {}
  if (!me && !preview && !splashSeen) { location.replace('splash.html'); return; }

  /* already signed in? go straight on (unless this is the preview) */
  if (me && !preview) { location.replace(nextUrl || 'index.html'); return; }

  var HERO = {
    in: ['Your financial picture is waiting.', 'Sign in securely and continue exactly where you left off.'],
    up: ['Start your calmer money journey.', 'Create one protected account for your budgets, goals, conversations, and progress.'],
    forgot: ['Let’s get you back in.', 'Use your recovery code to choose a new password. Your saved records stay exactly as they were.'],
    code: ['You’re in. One last thing.', 'Keep your recovery code somewhere safe. It is how you get back in if you ever forget your password.']
  };
  var panes = { in: $('paneIn'), up: $('paneUp'), forgot: $('paneForgot'), code: $('paneCode') };
  function show(k) {
    Object.keys(panes).forEach(function (n) { panes[n].hidden = n !== k; });
    $('heroTitle').textContent = HERO[k][0]; $('heroCopy').textContent = HERO[k][1];
    var tab = k === 'up' ? 'up' : 'in';
    $('tabIn').setAttribute('aria-selected', tab === 'in'); $('tabUp').setAttribute('aria-selected', tab === 'up');
    $('tabs').hidden = k === 'forgot' || k === 'code';
    var first = panes[k].querySelector('input:not([type=checkbox]):not([hidden])'); if (first && k !== 'code') setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  var err = function (id, m) { var e = $(id); e.textContent = m || ''; e.hidden = !m; };
  var busy = function (btn, on, txt) { btn.disabled = on; var s = btn.querySelector('span'); if (s) { if (on) { btn.dataset.t = s.textContent; s.textContent = txt || 'Please wait…'; } else if (btn.dataset.t) s.textContent = btn.dataset.t; } };
  var emailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };

  ['input', 'change'].forEach(function (ev) { document.addEventListener(ev, function (e) { var f = e.target.closest && e.target.closest('form'); var r = f && f.querySelector('.err'); if (r) r.hidden = true; }); });
  $('tabIn').addEventListener('click', function () { show('in'); });
  $('tabUp').addEventListener('click', function () { show('up'); $('up1').hidden = false; $('up2').hidden = true; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-eye]'); if (!b) return;
    var i = $(b.getAttribute('data-eye')), t = i.type === 'password'; i.type = t ? 'text' : 'password'; b.setAttribute('aria-label', t ? 'Hide password' : 'Show password');
  });

  /* close button: only when someone is signed in (preview) */
  if (preview && me) {
    $('accClose').hidden = false; $('accClose').addEventListener('click', function () { location.href = back; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') location.href = back; });
    var pb = $('previewBar'); pb.hidden = false; pb.textContent = 'Preview only. You are signed in as ' + me.email + ', and nothing here changes your account.';
    document.title = 'Preview sign in - Track My Fin';
  }

  function done(fresh) {
    var onboarded = false; try { onboarded = !!localStorage.getItem('trackmyfin_onboarded'); } catch (e) {}
    try { sessionStorage.removeItem('tmf_splash'); } catch (e) {} // play the intro after every sign-in
    location.href = onboarded ? (nextUrl || 'index.html') : 'onboarding.html';
  }

  /* sign in */
  $('goForgot').addEventListener('click', function () { $('fgEmail').value = $('inEmail').value; show('forgot'); });
  $('paneIn').addEventListener('submit', function (e) {
    e.preventDefault(); err('inErr');
    if (preview) { err('inErr', 'This is a preview. Sign out from the account menu to try signing in for real.'); return; }
    var em = $('inEmail').value.trim(), pw = $('inPw').value;
    if (!emailOk(em)) return err('inErr', 'Enter the email address you signed up with.');
    if (!pw) return err('inErr', 'Enter your password.');
    var btn = $('inGo'); busy(btn, true, 'Signing in…');
    A.signIn(em, pw, $('inRemember').checked).then(function () { done(false); }).catch(function (x) { busy(btn, false); err('inErr', x.message); $('inPw').select(); });
  });

  /* create account: step 1 */
  var meter = $('meter'), tip = $('pwTip');
  var TIPS = ['Length matters most. A short sentence of unrelated words is strong and easy to remember.', 'Too easy to guess. Add more characters, ideally a few unrelated words.', 'Decent. A longer phrase or a few more characters would make it stronger.', 'Strong. This would take a very long time to guess.'];
  function paint() {
    var s = A.strength($('upPw').value, $('upName').value, $('upEmail').value);
    meter.dataset.l = s.level; $('meterLabel').textContent = s.label; tip.textContent = TIPS[s.level];
    [].forEach.call(document.querySelectorAll('.help li'), function (li) { li.classList.toggle('on', !!$('upPw').value && s.checks[li.dataset.c]); });
    return s;
  }
  ['upPw', 'upName', 'upEmail'].forEach(function (id) { $(id).addEventListener('input', paint); });
  var draft = {};
  $('up1').addEventListener('submit', function (e) {
    e.preventDefault(); err('up1Err');
    var name = $('upName').value.trim(), em = $('upEmail').value.trim(), s = paint();
    if (name.length < 2) return err('up1Err', 'Please enter your full name.');
    if (!emailOk(em)) return err('up1Err', 'Enter a valid email address.');
    if (A.accounts()[em.toLowerCase()]) return err('up1Err', 'An account with this email already exists on this device. Try signing in.');
    if (!s.valid) return err('up1Err', 'Your password needs at least 8 characters, and not a very common one.');
    if (!$('upConsent').checked) return err('up1Err', 'Please confirm you understand your privacy choices to continue.');
    draft = { name: name, email: em, password: $('upPw').value };
    if (preview) { err('up1Err', 'This is a preview, so no account is created.'); return; }
    $('up1').hidden = true; $('up2').hidden = false; $('upInc').focus();
  });

  /* step 2 */
  var goal = '';
  [].forEach.call($('goalChips').children, function (b) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-checked') === 'true';
      [].forEach.call($('goalChips').children, function (o) { o.setAttribute('aria-checked', 'false'); });
      b.setAttribute('aria-checked', on ? 'false' : 'true'); goal = on ? '' : b.textContent; if (!on) $('upGoal').value = '';
    });
  });
  $('upGoal').addEventListener('input', function () { if ($('upGoal').value) { goal = ''; [].forEach.call($('goalChips').children, function (o) { o.setAttribute('aria-checked', 'false'); }); } });
  $('up2Back').addEventListener('click', function () { $('up2').hidden = true; $('up1').hidden = false; });
  var lastCode = '';
  function showCode(code) {
    lastCode = code; $('codeBox').textContent = code; $('codeSaved').checked = false; $('codeGo').disabled = true; show('code');
  }
  $('up2').addEventListener('submit', function (e) {
    e.preventDefault(); err('up2Err');
    var inc = parseFloat($('upInc').value);
    if ($('upInc').value && (!(inc >= 0) || inc > 10000000)) return err('up2Err', 'Enter a monthly income between R0 and R10,000,000, or leave it blank.');
    var btn = $('up2Go'); busy(btn, true, 'Creating your account…');
    A.signUp({ name: draft.name, email: draft.email, password: draft.password, income: inc || 0, currency: $('upCur').value, goal: $('upGoal').value.trim() || goal, remember: true })
      .then(function (r) { draft = {}; showCode(r.code); })
      .catch(function (x) { busy(btn, false); err('up2Err', x.message); });
  });

  /* recovery code screen */
  $('codeSaved').addEventListener('change', function () { $('codeGo').disabled = !$('codeSaved').checked; });
  $('codeCopy').addEventListener('click', function () {
    var b = $('codeCopy'), ok = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy code'; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastCode).then(ok, function () { b.textContent = 'Select the code and copy it'; }); else b.textContent = 'Select the code and copy it';
  });
  $('codeDl').addEventListener('click', function () {
    var s = A.session(), txt = 'Track My Fin recovery code\r\nAccount: ' + (s ? s.email : '') + '\r\nCode: ' + lastCode + '\r\n\r\nKeep this somewhere safe. It lets you reset your password. Anyone with this code and your email can reset your password on this device.\r\n';
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'track-my-fin-recovery-code.txt'; document.body.appendChild(a); a.click(); a.remove();
  });
  $('codeGo').addEventListener('click', function () { done(true); });

  /* forgot password */
  $('fgBack').addEventListener('click', function () { show('in'); });
  $('paneForgot').addEventListener('submit', function (e) {
    e.preventDefault(); err('fgErr');
    var em = $('fgEmail').value.trim(), code = $('fgCode').value, pw = $('fgPw').value;
    if (!emailOk(em)) return err('fgErr', 'Enter your account email.');
    if (code.replace(/[^a-z0-9]/gi, '').length < 16) return err('fgErr', 'Enter the full 16-character recovery code.');
    if (pw.length < 8) return err('fgErr', 'Choose a new password with at least 8 characters.');
    if (preview) return err('fgErr', 'This is a preview, so nothing is reset.');
    var btn = $('fgGo'); busy(btn, true, 'Resetting…');
    A.resetPassword(em, code, pw).then(function (r) { showCode(r.code); }).catch(function (x) { busy(btn, false); err('fgErr', x.message); });
  });

  show(qs.get('tab') === 'create' ? 'up' : 'in');
})();