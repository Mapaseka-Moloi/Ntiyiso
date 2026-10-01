#!/usr/bin/env python3
"""Assemble shared/js/customer.js from build/extracted/customer.js.

Concatenates the library sections verbatim (config, i18n, engine, API, state,
alerts, helpers, scam library, screens, wiring, auth) so no code is retyped, and
writes the IIFE header plus the routing/checks-flow glue that the page boundary
now requires.

Re-run after re-running tools/extract.py, then `node --check shared/js/customer.js`.
"""

import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "build", "extracted", "customer.js")

# 1-indexed inclusive ranges of the library, in emission order.
RANGES = [
    (3, 28, "config"),
    (29, 77, "icons"),
    (78, 321, "i18n"),
    (322, 564, "engine"),
    (565, 620, "api"),
    (621, 717, "state"),
    (718, 742, "alerts"),
    (743, 803, "helpers"),
    (804, 860, "scam library"),
    (861, 1147, "customer screens"),
    (1669, 1694, "history helpers"),
    (1755, 1939, "screen wiring"),
    # showAuth() and the original setAuthMode() are deliberately not carried
    # across: both were the single-page router's job. Their replacement lives in
    # the footer. The two variables they share are, because everything else in
    # the auth flow reads them.
    (2109, 2109, "auth state"),
    (2136, 2138, "auth note"),
    (2143, 2158, "role picker"),
    (2193, 2199, "shared payload"),
    (2217, 2248, "auth forms"),
    (2249, 2291, "provider block"),
]

# Route name -> clean URL. Every /app/* document serves exactly one screen; the
# page script asks Cust.mountScreen() for it and links are root-absolute.
ROUTES = [
    ("check",    "/app/check",    ""),
    ("send",     "/app/send",     ""),
    ("library",  "/app/library",  ""),
    ("alerts",   "/app/alerts",   ""),
    ("checking", "/app/checking", "?kind=message"),
    ("verdict",  "/app/verdict",  ""),
    ("history",  "/app/history",  ""),
    ("settings", "/app/settings", ""),
    ("scam",     "/app/scam",     "?slug="),
]

HEADER = '''/* Ntiyiso - customer app library.
 *
 * Everything the customer pages share: configuration, icons, translations, the
 * detection engine, the API client, state, alerts, formatting helpers, the nine
 * screens and their wiring, and the auth flow.
 *
 * Loaded by every page under /auth/* and /app/* before that page's script.js.
 * Exposed as window.NT.cust (aliased window.Cust). The only DOM work done at
 * load time is applyDocument(), so it is safe on any page.
 */
"use strict";
(function(global){
var NT = global.NT || (global.NT = {});
'''

FOOTER = r'''
/* ══ cross-page transient state ═════════════════════════════════════════
   A check now runs across three page loads (check -> checking -> verdict), so
   the text being checked and the in-flight result live in sessionStorage
   rather than a module variable. */
var TRANSIENT_KEY = 'ntiyiso.transient.v1';
function readTransient(){
  try{ return JSON.parse(sessionStorage.getItem(TRANSIENT_KEY) || '{}'); }
  catch(e){ return {}; }
}
function writeTransient(patch){
  var next = readTransient();
  for(var k in patch) if(patch.hasOwnProperty(k)) next[k] = patch[k];
  try{ sessionStorage.setItem(TRANSIENT_KEY, JSON.stringify(next)); }catch(e){}
  return next;
}
function dropTransient(key){
  var next = readTransient();
  delete next[key];
  try{ sessionStorage.setItem(TRANSIENT_KEY, JSON.stringify(next)); }catch(e){}
}

/* Passwords are only ever base64-obfuscated: this is a device-local prototype
   with no Mukuru authentication behind it. Kept in one place so both auth
   pages and the desk agree on the encoding. */
function obfuscate(p){
  try{ return btoa(unescape(encodeURIComponent(String(p)))); }
  catch(e){ return 'len' + String(p).length + ':' + String(p); }
}

/* ══ routing ════════════════════════════════════════════════════════════
   Screens are real URLs now, so a "route change" is a navigation. Everything
   in here is root-absolute and therefore works from any depth. */
var ROUTES = {
  check:    { path:'/app/check',    render:function(){ return CUST.check(); } },
  send:     { path:'/app/send',     render:function(){ return CUST.send(); } },
  library:  { path:'/app/library',  render:function(){ return CUST.library(); } },
  alerts:   { path:'/app/alerts',   render:function(){ return CUST.alerts(); } },
  checking: { path:'/app/checking', render:function(p){ return CUST.checking(p.get('kind') || 'message'); } },
  verdict:  { path:'/app/verdict',  render:function(){ return CUST.verdict(); } },
  history:  { path:'/app/history',  render:function(){ return CUST.history(); } },
  settings: { path:'/app/settings', render:function(){ return CUST.settings(); } },
  scam:     { path:'/app/scam',     render:function(p){ return CUST.scam(p.get('slug') || ''); } }
};
function pathFor(name, params){
  var def = ROUTES[name];
  if(!def) return '/app/check';
  var q = params ? '?' + new URLSearchParams(params).toString() : '';
  return def.path + q;
}
function go(path){ location.href = path; return false; }
function reload(){ location.reload(); }
function goCustomer(name, params){ go(pathFor(name, params)); }
function query(){ return new URLSearchParams(location.search); }

/* ══ session ═══════════════════════════════════════════════════════════
   Guards a page that needs a signed-in customer. Returns the session, or null
   after bouncing to sign-in - callers must check the return value. The page we
   were refused is remembered so sign-in can send us back there. */
var BOUNCE_KEY = 'session.bounce';
function requireSession(){
  var s = state.session;
  if(s && s.role === 'customer') return s;
  write(BOUNCE_KEY, location.pathname + location.search);
  go('/auth/login');
  return null;
}
function signOut(){
  endSession();
  writeTransient({ current:null, currentText:'', pending:null });
  go('/auth/login');
}

/* ══ the checked result, shared between /app/checking and /app/verdict ══ */
function setCurrent(result, text){
  state.current = result;
  state.currentText = text || '';
  writeTransient({ current:result, currentText:state.currentText });
}
function getCurrent(){
  return state.current || readTransient().current || null;
}
function getCurrentText(){
  return state.currentText || readTransient().currentText || '';
}
function clearCurrent(){
  state.current = null; state.currentText = '';
  dropTransient('current'); dropTransient('currentText');
}
/* state.current is deliberately not in localStorage, so a fresh page load on
   /app/verdict has to be handed the result the checking page left behind. */
function hydrateCurrent(){
  var tr = readTransient();
  if(!state.current && tr.current){
    state.current = tr.current;
    state.currentText = tr.currentText || '';
  }
  return state.current;
}

/* ══ check flow ═════════════════════════════════════════════════════════
   beginCheck hands the work to /app/checking, which runs it and then moves to
   /app/verdict. Everything the work needs crosses the boundary in sessionStorage
   because the work itself is a function and cannot. */
function beginCheck(kind, sourceText, payload){
  writeTransient({ pending:{ kind:kind, text:sourceText || '', payload:payload || null } });
  go('/app/checking?kind=' + encodeURIComponent(kind));
}
function pendingCheck(){
  var p = readTransient().pending;
  if(!p || !p.kind){ go('/app/check'); return null; }
  return p;
}
function checkWork(kind, text, payload){
  if(kind === 'transaction') return checkTransaction(payload && payload.input, payload && payload.ctx);
  var urls = extractUrls(text || '');
  if(urls.length === 1 && text === urls[0]) return checkLink(text);
  return checkMessage(text);
}
function timeToVerdict(kind){
  var started = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return function(){
    try{
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var list = JSON.parse(sessionStorage.getItem('ntiyiso.ttv') || '[]');
      list.push({ kind:kind, ms:Math.round(now - started) });
      sessionStorage.setItem('ntiyiso.ttv', JSON.stringify(list.slice(-25)));
    }catch(e){}
  };
}
function runPendingCheck(pending){
  dropTransient('pending');
  var mark = timeToVerdict(pending.kind);
  return checkWork(pending.kind, pending.text, pending.payload).then(function(result){
    recordCheck(result, pending.text);
    mark();
    go('/app/verdict');
  }).catch(function(err){
    toast(errorMessage(err), 'bad');
    go(pending.kind === 'transaction' ? '/app/send' : '/app/check');
  });
}

/* ══ mounting a screen ══════════════════════════════════════════════════
   One screen per document. mountScreen() is what renderCustomer() used to be:
   fill the host, translate the i18n hooks, wire the controls, refresh the tab
   chrome. currentScreen is remembered so a re-render (after reporting, after a
   language change) knows where it is. */
var currentScreen = '';
function mountScreen(name, params){
  var host = document.getElementById('custScreen');
  if(!host) return;
  var def = ROUTES[name] || ROUTES.check;
  currentScreen = ROUTES[name] ? name : 'check';
  hydrateCurrent();
  host.innerHTML = def.render(params || query());
  fillI18n(custRoot());
  wireScreen(host, currentScreen);
  renderAlertDot();
  window.scrollTo(0, 0);
  if(state.settings.readAloud && currentScreen === 'verdict'){
    var r = state.current;
    if(r) setTimeout(function(){
      speak(verdictWord(r.verdict) + '. ' + r.instruction + '. ' + r.reason_text.join('. '));
    }, 350);
  }
}
function renderCustomer(){ mountScreen(currentScreen); }

/* ══ auth ═══════════════════════════════════════════════════════════════
   /auth/login and /auth/signup are two documents sharing one flow, so setAuthMode
   only clears the note: the page itself is the mode. */
function setAuthMode(mode){
  authMode = mode;
  var note = document.getElementById('authNote');
  if(note) note.innerHTML = '';
}
/* Wired by both auth pages: role picker, the back button, whichever form is on
   the document, and the provider block. */
function wireAuthShell(mode){
  setAuthMode(mode);
  $('rolePicker').querySelectorAll('[data-role]').forEach(function(b){
    b.addEventListener('click', function(){ pickRole(b.getAttribute('data-role')); });
  });
  $('authBack').addEventListener('click', function(){
    $('authStep2').classList.add('hidden');
    $('authStep1').classList.remove('hidden');
    $('authTitle').textContent = t('auth.welcome');
    $('authSub').textContent = t('auth.who');
  });
  wireAuthForms();
  wireProviderBlock();
  var sn = $('authStorage');
  if(sn) sn.innerHTML = storageNotice();
  fillI18n(custRoot());
}
/* After a successful sign-in or sign-up. Staff land on the desk's own sign-in
   page; a customer goes back to whichever /app page bounced them here. */
function enterApp(){
  if(state.role === 'staff'){ go('/desk/login'); return; }
  var bounce = read(BOUNCE_KEY, '');
  if(bounce.indexOf('/app/') === 0) write(BOUNCE_KEY, '');
  go(bounce.indexOf('/app/') === 0 ? bounce : '/app/check');
}

/* ══ page guards ═════════════════════════════════════════════════════════
   Every /app/* page boots the same way: load state, apply the text/theme
   preferences, refuse to render without a session, then mount one screen.
   startApp() is what the nine page scripts call. */
function startApp(name, params){
  loadState();
  loadAlerts();
  applyDocument();
  if(!requireSession()) return null;
  fillI18n(custRoot());
  var exit = document.getElementById('custExit');
  if(exit) exit.addEventListener('click', function(){ signOut(); });
  mountScreen(name, params);
  return name;
}
function has(id){ return !!document.getElementById(id); }

/* ══ public API ═════════════════════════════════════════════════════════ */
NT.store = {
  read: read, write: write, storageOk: STORAGE_OK, storageNotice: storageNotice,
  keys: { customer:CUST_KEY, accounts:ACCOUNTS_KEY, session:SESSION_KEY, alerts:ALERTS_KEY }
};

NT.cust = {
  CONFIG:CONFIG, RULES:RULES, DEFAULT_SETTINGS:DEFAULT_SETTINGS, LANGS:LANGS,
  SCAMS:SCAMS, REASONS:REASONS,
  t:t, reasonText:reasonText, isReviewed:isReviewed,
  svg:svg, SCAM_ICON:SCAM_ICON, ICON:ICON,
  esc:esc, money:money, initials:initials, timeAgo:timeAgo,
  toneOf:toneOf, verdictWord:verdictWord, verdictIconName:verdictIconName,
  scamBySlug:scamBySlug, isReviewedLang:isReviewed,
  extractUrls:extractUrls, displayDomain:displayDomain,
  checkMessage:checkMessage, checkLink:checkLink, checkTransaction:checkTransaction,
  errorMessage:errorMessage, apiReport:apiReport, apiFeedback:apiFeedback,
  state:state, connection:function(){ return connection; },
  loadState:loadState, saveState:saveState,
  loadAlerts:loadAlerts, saveAlerts:saveAlerts,
  pushAlert:pushAlert, alertsFor:alertsFor, unreadCount:unreadCount,
  markAlertsRead:markAlertsRead, renderAlertDot:renderAlertDot,
  findHistory:findHistory, recordCheck:recordCheck, markEntry:markEntry,
  renderHighlighted:renderHighlighted, storageNotice:storageNotice,
  sharedPayload:sharedPayload, read:read, write:write,
  accounts:accounts, saveAccounts:saveAccounts, findAccount:findAccount,
  normalisePhone:normalisePhone, obfuscate:obfuscate,
  startSession:startSession, endSession:endSession,
  session:function(){ return state.session; },
  applyDocument:applyDocument, custRoot:custRoot,
  fillI18n:fillI18n, toast:toast,
  speak:speak, stopSpeaking:stopSpeaking, isSpeaking:isSpeaking,
  speechAvailable:speechAvailable,
  newId:newId, maskExcerpt:maskExcerpt, apiBase:apiBase,
  SCREEN:CUST, ROUTES:ROUTES, pathFor:pathFor, go:go, reload:reload,
  goCustomer:goCustomer, query:query,
  requireSession:requireSession, signOut:signOut, startApp:startApp, has:has,
  mountScreen:mountScreen, renderCustomer:renderCustomer,
  wireCheck:wireCheck, wireSend:wireSend, wireVerdict:wireVerdict,
  wireHistoryScreen:wireHistoryScreen, wireAlertsScreen:wireAlertsScreen,
  wireScamDetail:wireScamDetail, wireCustomerSettings:wireCustomerSettings,
  beginCheck:beginCheck, pendingCheck:pendingCheck, checkWork:checkWork,
  runPendingCheck:runPendingCheck, timeToVerdict:timeToVerdict,
  setCurrent:setCurrent, getCurrent:getCurrent, getCurrentText:getCurrentText,
  clearCurrent:clearCurrent, hydrateCurrent:hydrateCurrent,
  readTransient:readTransient, writeTransient:writeTransient, dropTransient:dropTransient,
  authRole:function(){ return authRole; }, setAuthMode:setAuthMode,
  authFail:authFail, pickRole:pickRole, wireAuthShell:wireAuthShell,
  wireAuthForms:wireAuthForms, wireProviderBlock:wireProviderBlock,
  enterApp:enterApp
};
})(window);
'''

# Each page only ships the markup it needs, so library helpers that used to
# assume the whole single-file DOM have to tolerate a missing node, and the
# in-document router has to become real navigation. These are the only edits
# made to the verbatim slices.
PATCHES = [
    # toast() writes into #toasts, which only exists on pages that show one.
    ("""function toast(msg, kind){
var el = document.createElement('div');
el.className = 'toast ' + (kind || '');
el.setAttribute('role','status');
el.textContent = msg;
$('toasts').appendChild(el);
setTimeout(function(){ el.remove(); }, 4200);
}""",
     """var toastHost = null;
function toast(msg, kind){
if(!toastHost){
toastHost = document.querySelector('.toasts');
if(!toastHost){
toastHost = document.createElement('div');
toastHost.className = 'toasts';
toastHost.setAttribute('aria-live','polite');
document.body.appendChild(toastHost);
}
}
var el = document.createElement('div');
el.className = 'toast ' + (kind || '');
el.setAttribute('role','status');
el.textContent = msg;
toastHost.appendChild(el);
setTimeout(function(){ el.remove(); }, 4200);
}"""),
    # applyDocument() used to set attributes on a root div every page shares.
    ("""function applyDocument(){
var r = custRoot();
r.setAttribute('data-text', state.settings.text);
r.setAttribute('data-theme', state.settings.theme);
document.documentElement.setAttribute('data-text', state.settings.text);
document.documentElement.setAttribute('data-theme', state.settings.theme);
document.documentElement.lang = state.settings.lang === 'zu' ? 'zu-ZA' : 'en-ZA';
}""",
     """function applyDocument(){
var html = document.documentElement;
html.setAttribute('data-text', state.settings.text);
html.setAttribute('data-theme', state.settings.theme);
html.lang = state.settings.lang === 'zu' ? 'zu-ZA' : 'en-ZA';
}"""),
    # The text/theme tokens live on :root now that each page is its own
    # document, so the old custRoot() lookup is gone.
    ("""function custRoot(){ return document.getElementById('customerRoot'); }""",
     """function custRoot(){ return document.documentElement; }"""),
    # recordCheck wrote state.current for the in-memory router to render; the
    # result now has to survive the hop to /app/verdict as well.
    ("""function recordCheck(result, sourceText){
state.current = result;
state.currentText = sourceText || '';""",
     """function recordCheck(result, sourceText){
state.current = result;
state.currentText = sourceText || '';
setCurrent(result, sourceText);"""),

    # -- in-screen navigation is a real link now, not a scripted tab switch ---
    ("""html += '<button class="notice info" style="display:flex;gap:10px;align-items:center;width:100%;'
+ 'text-align:left;margin-top:16px" data-go="alerts">' + svg('bell','ico-lg')
+ '<span><b>' + unread + ' new alert' + (unread > 1 ? 's' : '') + '</b><br>'
+ '<span class="small">' + esc(t('alerts.from')) + '</span></span></button>';""",
     """html += '<a class="notice info" style="display:flex;gap:10px;align-items:center;width:100%;'
+ 'text-align:left;margin-top:16px" href="' + pathFor('alerts') + '">' + svg('bell','ico-lg')
+ '<span><b>' + unread + ' new alert' + (unread > 1 ? 's' : '') + '</b><br>'
+ '<span class="small">' + esc(t('alerts.from')) + '</span></span></a>';"""),
    ("""+ '<button class="btn outline" data-go="send">' + svg('send') + esc(t('home.send')) + '</button>'
+ '<button class="btn outline" data-go="library">' + svg('book') + esc(t('home.library')) + '</button></div>';""",
     """+ '<a class="btn outline" href="' + pathFor('send') + '">' + svg('send') + esc(t('home.send')) + '</a>'
+ '<a class="btn outline" href="' + pathFor('library') + '">' + svg('book') + esc(t('home.library')) + '</a></div>';"""),
    ("""+ '<button class="btn ghost" style="width:auto;min-height:auto;padding:6px" data-go="history">'
+ esc(t('history.title')) + svg('chevron') + '</button></div>';""",
     """+ '<a class="btn ghost" style="width:auto;min-height:auto;padding:6px" href="' + pathFor('history') + '">'
+ esc(t('history.title')) + svg('chevron') + '</a></div>';"""),
    ("""html += '<button class="notice info" style="display:flex;gap:11px;align-items:center;width:100%;'
+ 'text-align:left;margin-top:16px" data-scam="' + esc(scam.slug) + '">'
+ svg(SCAM_ICON[scam.slug],'ico-lg') + '<span><b>' + esc(t('verdict.learn')) + '</b><br>'
+ '<span class="small">' + esc(scam.title) + '</span></span></button>';""",
     """html += '<a class="notice info" style="display:flex;gap:11px;align-items:center;width:100%;'
+ 'text-align:left;margin-top:16px" href="' + pathFor('scam', { slug:scam.slug }) + '">'
+ svg(SCAM_ICON[scam.slug],'ico-lg') + '<span><b>' + esc(t('verdict.learn')) + '</b><br>'
+ '<span class="small">' + esc(scam.title) + '</span></span></a>';"""),
    ("""html += '<button class="row" data-scam="' + esc(s.slug) + '">'
+ '<span style="width:26px;color:var(--brand)">' + svg(SCAM_ICON[s.slug],'ico-lg') + '</span>'
+ '<span class="grow"><b>' + esc(s.title) + '</b><span>' + esc(s.summary) + '</span></span>'
+ '<span style="color:var(--faint)">' + svg('chevron') + '</span></button>';""",
     """html += '<a class="row" href="' + pathFor('scam', { slug:s.slug }) + '">'
+ '<span style="width:26px;color:var(--brand)">' + svg(SCAM_ICON[s.slug],'ico-lg') + '</span>'
+ '<span class="grow"><b>' + esc(s.title) + '</b><span>' + esc(s.summary) + '</span></span>'
+ '<span style="color:var(--faint)">' + svg('chevron') + '</span></a>';"""),
    ("""var html = '<button class="btn ghost" style="width:auto;padding:6px 0" data-go="library">'
+ svg('back') + esc(t('library.back')) + '</button>'""",
     """var html = '<a class="btn ghost" style="width:auto;padding:6px 0" href="' + pathFor('library') + '">'
+ svg('back') + esc(t('library.back')) + '</a>'"""),
    ("""+ '<button class="btn primary" data-go="check">' + esc(t('tab.check')) + '</button>';""",
     """+ '<a class="btn primary" href="' + pathFor('check') + '">' + esc(t('tab.check')) + '</a>';"""),

    # -- the router: render one screen into the host on the current page -----
    ("""function wireCustomerScreen(){
var screen = $('custScreen');
screen.querySelectorAll('[data-go]').forEach(function(el){
el.addEventListener('click', function(){ goCustomer(el.getAttribute('data-go')); });
});
screen.querySelectorAll('[data-history]').forEach(function(el){
el.addEventListener('click', function(){
var entry = findHistory(el.getAttribute('data-history'));
if(entry && entry.result){
state.current = entry.result; state.currentText = entry.text || '';
goCustomer('verdict');
}
});
});
screen.querySelectorAll('[data-scam]').forEach(function(el){
el.addEventListener('click', function(){ goCustomer('scam', { slug:el.getAttribute('data-scam') }); });
});
if(custRoute === 'check') wireCheck();
if(custRoute === 'send') wireSend();
if(custRoute === 'verdict') wireVerdict();
if(custRoute === 'settings') wireCustomerSettings(screen);
if(custRoute === 'history') wireHistoryScreen();
if(custRoute === 'alerts') wireAlertsScreen();
if(custRoute === 'scam') wireScamDetail();
}""",
     """function wireScreen(screen, name){
screen.querySelectorAll('[data-history]').forEach(function(el){
el.addEventListener('click', function(){
var entry = findHistory(el.getAttribute('data-history'));
if(entry && entry.result){
setCurrent(entry.result, entry.text || '');
goCustomer('verdict');
}
});
});
if(name === 'check') wireCheck();
if(name === 'send') wireSend();
if(name === 'verdict') wireVerdict();
if(name === 'settings') wireCustomerSettings(screen);
if(name === 'history') wireHistoryScreen();
if(name === 'alerts') wireAlertsScreen();
if(name === 'scam') wireScamDetail();
}"""),

    # -- the check flow hands off to /app/checking instead of a route change -
    ("""noteBox(''); pendingText = text;
var urls = extractUrls(text);
var onlyLink = urls.length === 1 && text === urls[0];
startCheck('message', function(){ return onlyLink ? checkLink(text) : checkMessage(text); });""",
     """noteBox('');
beginCheck('message', text);"""),
    ("""if(shared){
input.value = shared; pendingText = shared;
startCheck('message', function(){ return checkMessage(shared); });
}""",
     """if(shared){
input.value = shared;
beginCheck('message', shared);
}"""),
    ("""pendingText = 'Payment of ' + money(amount) + ' · ' + t('purpose.' + input.purpose);
startCheck('transaction', function(){ return checkTransaction(input, ctx); });""",
     """beginCheck('transaction',
'Payment of ' + money(amount) + ' · ' + t('purpose.' + input.purpose),
{ input:input, ctx:ctx });"""),
    ("""$('btnTryExample').addEventListener('click', function(){
var text = $('btnTryExample').getAttribute('data-example');
pendingText = text;
startCheck('message', function(){ return checkMessage(text); });
});""",
     """$('btnTryExample').addEventListener('click', function(){
beginCheck('message', $('btnTryExample').getAttribute('data-example'));
});"""),

    # -- auth: two documents now, so the staff-code field lives on one of them
    ("""$('staffCodeBlock').classList.toggle('hidden', role !== 'staff');
$('staffCodeBlockIn').classList.toggle('hidden', role !== 'staff');""",
     """['staffCodeBlock','staffCodeBlockIn'].forEach(function(id){
var el = document.getElementById(id);
if(el) el.classList.toggle('hidden', role !== 'staff');
});"""),
    # ...and only one of the two forms is on the page, and only on /auth/*.
    # These were statements inside the monolith's boot(), so they are turned
    # into a function that wireAuthShell() calls. Left at the top level they
    # would run on every /app page, where $('formSignup') is null.
    ("""$('formSignup').addEventListener('submit', function(e){""",
     """function wireAuthForms(){
var suForm = $('formSignup');
if(suForm) suForm.addEventListener('submit', function(e){"""),
    ("""$('formSignin').addEventListener('submit', function(e){""",
     """var siForm = $('formSignin');
if(siForm) siForm.addEventListener('submit', function(e){"""),
    ("""toast(t('auth.welcomeBack', { name:acc.name.split(' ')[0] }), 'ok');
enterApp();
});""",
     """toast(t('auth.welcomeBack', { name:acc.name.split(' ')[0] }), 'ok');
enterApp();
});
}"""),

    # -- the provider block is wired by whichever auth page is open ----------
    ("""(function(){
var social = document.querySelector('#authStep2 .social');
if(!social) return;""",
     """function wireProviderBlock(){
var social = document.querySelector('#authStep2 .social');
if(!social) return;"""),
    ("""startSession(acc);
toast(t('auth.withProvider', { provider:provider }) + ' · ' + name, 'ok');
enterApp();
});
})();""",
     """startSession(acc);
toast(t('auth.withProvider', { provider:provider }) + ' · ' + name, 'ok');
enterApp();
});
}"""),
]


def apply_patches(text):
    for old, new in PATCHES:
        if old not in text:
            raise SystemExit("patch target not found:\n" + old[:200])
        text = text.replace(old, new, 1)
    return text


def main():
    with io.open(SRC, encoding="utf-8") as fh:
        lines = fh.read().split("\n")

    out = [HEADER]
    for start, end, label in RANGES:
        out.append("\n/* ══ %s ══ */" % label)
        out.append("\n".join(lines[start - 1:end]))
    out.append(FOOTER)

    path = os.path.join(ROOT, "shared", "js", "customer.js")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    body = apply_patches("\n".join(out).lstrip("\n"))
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(body)
    print("wrote shared/js/customer.js (%d bytes)" % len(body))


if __name__ == "__main__":
    main()