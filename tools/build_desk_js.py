#!/usr/bin/env python3
"""Assemble shared/js/desk.js from build/extracted/desk.js.

The fraud-desk console used to be one page with five views swapped by a hash
router. Each view is now its own document, so the shared half keeps only the
data model, the detection/risk engine, the canvas painters and the storage
helpers; the per-view wiring lives in desk/<view>/script.js.

Verbatim slices are concatenated (no retyping) and only patched where the code
assumed the full single-file DOM.
"""

import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "build", "extracted", "desk.js")

# 1-indexed inclusive ranges of desk.js, in emission order.
RANGES = [
    (7, 42, "data"),
    (44, 70, "util + state"),
    (72, 86, "toasts"),
    (88, 214, "audio engine"),
    (216, 348, "video engine"),
    (360, 392, "overview render"),
    (394, 476, "risk model"),
    (478, 504, "explainability vectors"),
    (506, 541, "risk dial"),
    (543, 556, "canvas sizing"),
    (558, 596, "spectrogram"),
    (598, 629, "oscilloscope"),
    (631, 668, "acoustic metrics"),
    (670, 701, "risk trajectory"),
    (703, 732, "fraud chart"),
    (734, 758, "geo projection"),
    (759, 845, "threat radar"),
    (877, 884, "station panel"),
    (886, 963, "session queue"),
    (965, 983, "session loading"),
    (985, 1120, "controls"),
    (1122, 1197, "on-device analysis"),
    (1198, 1220, "case-study wiring"),
    (1240, 1344, "live ingest"),
    (1347, 1350, "chain-of-custody hash"),
    (1373, 1421, "liveness step-up"),
    (1423, 1436, "liveness close"),
    (1442, 1459, "desk preferences"),
    (1471, 1512, "accounts + session"),
    (1532, 1631, "desk sign-in"),
    (1650, 1686, "business model"),
]

# ── the null object ────────────────────────────────────────────────────────
# Every desk page ships only the markup it needs, so the single-file DOM is no
# longer there to lean on. Rather than guarding several hundred call sites, `$`
# returns this stand-in for a missing node: property writes land on it and are
# discarded, method calls are no-ops, queries return empty lists. Canvas
# painters reach real 2D contexts through `ctx()` which does return null.
HEADER = '''/* Ntiyiso - fraud-desk shared runtime.
 *
 * Everything the five desk pages have in common: session data, the acoustic and
 * video analysis engines, the risk/score model, the canvas painters and the
 * storage helpers. Loaded by every page under /desk/* before that page's
 * script.js. Exposed as window.Desk - it touches no DOM at load time.
 */
"use strict";
(function(global){
const NT = global.NT || (global.NT = {});

/* ── missing-node stand-in ──────────────────────────────────────────────────
   A page ships only its own view's markup, so most of these lookups miss. The
   stand-in keeps the shared painters and formatters free of existence checks:
   writes go nowhere, calls do nothing, queries come back empty. `has()` is
   there for the rare branch that genuinely has to behave differently. */
const NULL_CTX = {
  canvas:null, font:'', fillStyle:'', strokeStyle:'', lineWidth:1, lineJoin:'',
  lineCap:'', globalAlpha:1, textAlign:'left', textBaseline:'alphabetic',
  imageSmoothingEnabled:true,
  canvas_placeholder:true,
  clearRect:noop, fillRect:noop, strokeRect:noop, beginPath:noop, closePath:noop,
  moveTo:noop, lineTo:noop, arc:noop, arcTo:noop, rect:noop, quadraticCurveTo:noop,
  bezierCurveTo:noop, fill:noop, stroke:noop, clip:noop, save:noop, restore:noop,
  translate:noop, rotate:noop, scale:noop, setTransform:noop, resetTransform:noop,
  setLineDash:noop, getLineDash:function(){ return []; }, fillText:noop, strokeText:noop,
  drawImage:noop, putImageData:noop,
  measureText:function(){ return { width:0 }; },
  createLinearGradient:function(){ return { addColorStop:noop }; },
  createRadialGradient:function(){ return { addColorStop:noop }; },
  createPattern:function(){ return null; },
  getImageData:function(){ return { data:new Uint8ClampedArray(4), width:1, height:1 }; },
  createImageData:function(){ return { data:new Uint8ClampedArray(4), width:1, height:1 }; }
};
function noop(){}

const NULL_EL = {
  style:newStyle(), dataset:{}, tagName:'DIV', id:'', value:'', checked:false,
  disabled:false, textContent:'', innerHTML:'', srcObject:null, files:[],
  children:[], childNodes:[], options:[], firstChild:null, parentNode:null,
  addEventListener:noop, removeEventListener:noop, dispatchEvent:noop,
  appendChild:function(c){ return c; }, removeChild:function(c){ return c; },
  insertBefore:function(c){ return c; }, replaceChild:function(c){ return c; },
  remove:noop, closest:function(){ return NULL_EL; }, matches:function(){ return false; },
  focus:noop, blur:noop, click:noop, scrollIntoView:noop, scrollTo:noop,
  setAttribute:noop, removeAttribute:noop, getAttribute:function(){ return null; },
  hasAttribute:function(){ return false; }, querySelector:function(){ return NULL_EL; },
  querySelectorAll:function(){ return []; },
  getBoundingClientRect:function(){ return {left:0,top:0,right:0,bottom:0,width:0,height:0}; },
  getContext:function(){ return NULL_CTX; }, play:noop, pause:noop, load:noop,
  classList:newClassList(), className:'', href:'', src:'', type:'', name:'',
  selectedIndex:-1, open:false, start:0, duration:0, currentTime:0, paused:true
};
/* Every desk page is a subset of the whole console, so shared code reaches for
   nodes that only exist on a sibling page. classList has to be a no-op rather
   than undefined, or the first `.classList.contains()` on a missing node takes
   the whole bundle down with it. */
function newClassList(){
  return {
    add:noop, remove:noop, toggle:function(){ return false; },
    contains:function(){ return false; }, replace:noop, item:function(){ return null; },
    length:0, value:''
  };
}
function newStyle(){
  const s = {};
  ['width','height','opacity','transform','display','top','left','right','bottom',
   'zIndex','cursor','overflow','background','color','borderColor','fontSize',
   'pointerEvents'].forEach(function(k){ s[k] = ''; });
  s.setProperty = function(k,v){ s[k] = v; };
  s.getPropertyValue = function(k){ return s[k]; };
  s.removeProperty = function(k){ s[k] = ''; };
  return s;
}

const has = id => !!document.getElementById(id);

/* The single-file build wrapped all of this in #deskRoot. There is no wrapper
   now - every page is the document - but the name is kept so the verbatim
   slices below read the same as they did before. */
const DESK_ROOT = document;
'''

FOOTER = '''
/* ── routing ───────────────────────────────────────────────────────────────
   The desk is five documents, not one page with a router. */
const VIEWS = {
  home:'/desk/overview', live:'/desk/live', queue:'/desk/radar',
  business:'/desk/business', case:'/desk/case'
};
const VIEW_LABEL = {
  home:'Overview', live:'Live cockpit', queue:'Threat radar',
  business:'Business case', case:'Case study'
};
function go(view, extra){
  const path = VIEWS[view] || VIEWS.home;
  location.href = path + (extra || '');
  return false;
}
function currentView(){
  const p = location.pathname.replace(/\\/+$/,'');
  for(const k in VIEWS) if(p === VIEWS[k] || p === '/desk/' + k) return k;
  return '';
}

/* ── cross-page desk state ────────────────────────────────────────────────
   Which session the operator drilled into, the radar selection and the live
   risk trajectory all have to survive a navigation. */
const DESK_KEY = 'ntiyiso.desk.v1';
let deskState = lsGet(DESK_KEY, {});
function saveDesk(){
  deskState = {
    session: state.active ? state.active.id : null,
    radar: state.radarSel ? state.radarSel.id : null,
    radarMode: state.radarMode,
    spline: state.spline.slice(-32),
    target: state.target,
    diverted: state.diverted,
    dismissed: state.dismissed
  };
  lsSet(DESK_KEY, deskState);
}
function sessionById(id){
  return CALLS.filter(c=>c.id === id)[0] || CALLS[0];
}
function restoreDesk(){
  if(deskState.radarMode) state.radarMode = deskState.radarMode;
  if(Array.isArray(deskState.spline) && deskState.spline.length > 1) state.spline = deskState.spline.slice();
  if(typeof deskState.target === 'number') state.target = deskState.target;
  state.active = sessionById(deskState.session);
  state.radarSel = sessionById(deskState.radar);
  state.score = state.active.score;
  state.diverted = !!deskState.diverted;
  state.dismissed = !!deskState.dismissed;
  return state.active;
}

/* ── session guard ────────────────────────────────────────────────────────
   Every desk page except /desk/login requires a staff session. */
function requireStaff(){
  const s = currentSession();
  if(s && s.role !== 'customer'){ setUserUI(s.name); return s; }
  location.replace('/desk/login');
  return null;
}
function signOutDesk(){
  endSession();
  location.href = '/auth/login';
}

/* ── shared chrome wiring ─────────────────────────────────────────────────
   The header and the left rail are identical on all five pages, so their
   wiring is shared too. */
function wireChrome(){
  document.querySelectorAll('nav#navTabs a').forEach(a=>{
    if(a.dataset.view === currentView()) a.classList.add('on');
  });
  const b = $('chipSignOut'); if(b) b.addEventListener('click', signOutDesk);
  const lo = $('btnLogout');
  if(lo) lo.addEventListener('click', function(e){ e.preventDefault(); signOutDesk(); });
  $('btnSettings').addEventListener('click', openSettings);
  const pk = $('btnPacket'); if(pk) pk.addEventListener('click', exportPacket);
  document.querySelectorAll('#modeToggle button').forEach(function(b){
    b.addEventListener('click', function(){ setMode(b.dataset.mode); });
  });
  if(live.mode === 'live') setMode('live');
  setUserUI(currentSession() ? currentSession().name : '');
}

/* ── modal + preference chrome ──────────────────────────────────────────── */
function wireSettings(){
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsBackdrop').addEventListener('click', closeSettings);
  $('settingsSave').addEventListener('click', function(){
    settings.autoEsc = $('setAutoEsc').checked;
    settings.review = $('setReview').checked;
    settings.sound = $('setSound').checked;
    try{ localStorage.setItem('ntiyiso.settings', JSON.stringify(settings)); }catch(e){}
    closeSettings();
    toast('Settings saved.','ok');
  });
}
function wireLiveness(){
  $('livenessCam').addEventListener('change', function(e){ startCam(e.target.value); });
  $('livenessPass').addEventListener('click', function(){ closeLiveness(true); });
  $('livenessFail').addEventListener('click', function(){ closeLiveness(false); });
  $('livenessClose').addEventListener('click', function(){ closeLiveness(false); });
  $('livenessBackdrop').addEventListener('click', function(){ closeLiveness(false); });
}

/* ── forensic packet ─────────────────────────────────────────────────────
   Was an inline click handler on the cockpit. */
async function exportPacket(){
  const vectors=[];
  document.querySelectorAll('#vectorList .vec').forEach(function(c){
    const b=c.querySelector('b');
    vectors.push({signal:c.dataset.key, value:b?b.textContent:''});
  });
  const p = {
    product:'Ntiyiso', version:'4.1',
    session:state.active.id, phone:state.active.phone, agent:state.active.agent,
    intent:state.active.intent, amount:state.active.amount,
    modality:state.modality, verdict:has('verdictTag')?$('verdictTag').textContent:'unknown',
    risk:Math.round(state.score), risk_label: state.score>=70?'synthetic':(state.score>=35?'review':'verified'),
    vectors:vectors,
    features:{f0:Math.round(state.metrics.f0), jitter:+state.metrics.jit.toFixed(2),
      shimmer:+state.metrics.shim.toFixed(1), hf:Math.round(state.metrics.hf), breath:Math.round(state.metrics.br)},
    generated_at:new Date().toISOString(), timezone:'SAST',
    chain_of_custody:null,
    disclaimer:'On-device feature-extraction verdict - model benchmark pending. Not a certified forensic finding.'
  };
  p.chain_of_custody = await sha256(JSON.stringify({session:p.session, risk:p.risk, vectors:p.vectors, at:p.generated_at}));
  const blob = new Blob([JSON.stringify(p,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ntiyiso-forensic-'+state.active.id+'.json'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  toast('Forensic packet exported - chain-of-custody '+String(p.chain_of_custody).slice(0,10)+'…','ok');
}

/* ── clocks, trajectory feed and ticker ─────────────────────────────────── */
function fmtDur(s){ return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function startClocks(){
  setInterval(function(){
    const now=new Date();
    const sast=new Date(now.getTime()+(now.getTimezoneOffset()*60000)+(2*3600000));
    const t=sast.toTimeString().slice(0,8);
    $('chipClock').innerHTML=t+'<span>SAST</span>';
    $('radarClock').textContent='· '+t;
    state.elapsed++;
    $('durationVal').textContent=fmtDur(state.elapsed);
    const lat=132+Math.round(Math.random()*14);
    $('chipLatency').textContent=lat+' ms';
    $('pipeLatency').textContent=lat+' ms';
  },1000);
  setInterval(function(){
    const noise=(Math.random()-0.5)*(state.live?4.5:2.2);
    state.spline.push(clamp(state.score+noise,0,100));
    if(state.spline.length>32) state.spline.shift();
    saveDesk();
  },1000);
  setInterval(updateVectors,900);
}
function startTicker(){
  const el = $('tickerText');
  el.textContent = TICKER_MSGS[0];
  let tickIdx = 0;
  setInterval(function(){
    el.style.opacity='0'; el.style.transform='translateY(4px)';
    setTimeout(function(){
      tickIdx=(tickIdx+1)%TICKER_MSGS.length;
      el.textContent=TICKER_MSGS[tickIdx];
      el.style.opacity='1'; el.style.transform='none';
    },400);
  },4800);
}

/* ── the animation loop, one view at a time ───────────────────────────────
   The single-file loop branched on state.tab every frame. Each page now runs
   only its own branch. */
function startLoop(view){
  let last=0;
  function loop(t){
    const dt=Math.min(60,t-last); last=t;
    state.score=lerp(state.score,state.target,0.10);
    state.beacon+=dt*0.0022;
    state.sweep=(state.sweep+dt*0.00009)%1;
    applyRisk();
    if(view==='live'){
      tickEscalation(t);
      if(state.modality==='video'){ renderVideo(t); renderVideoMetrics(); }
      else { renderSpectrogram(t); renderOscilloscope(); renderMetrics(); }
      renderSpline();
      if(live.mode==='live'){
        live.tick=(live.tick||0)+dt;
        if(live.tick>400){
          live.tick=0;
          if(state.liveOnDevice==='voice') state.target=scoreFromMetrics();
          else if(state.liveOnDevice==='video') state.target=scoreFromFrame();
          else state.target=clamp(Math.round(42+34*Math.sin(t/1500)),8,94);
        }
      }
    }
    if(view==='queue') renderRadar();
    if(view==='business'){ if(hero.prog<1) hero.prog=Math.min(1,hero.prog+dt/900); renderFraudChart(); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/* ── customer hand-off ────────────────────────────────────────────────────
   Signing in as a customer from the desk lands in the customer app. */
function handOff(kind){
  authNote('Taking you to the customer app…');
  location.href = '/app/check';
}

/* ── keyboard shortcuts ─────────────────────────────────────────────────── */
const KEYS = { '1':'home', '2':'live', '3':'queue', '4':'business', '5':'case' };
function wireKeys(extra){
  addEventListener('keydown', function(e){
    if(e.target && (e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')) return;
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    const k=e.key.toLowerCase();
    if(KEYS[k]){ go(KEYS[k]); return; }
    if(k==='l'){ setMode(live.mode==='live'?'demo':'live'); return; }
    if(extra) extra(k);
  });
}
/* The media keys only mean something on the cockpit, so each page passes its
   own handler in and the shared listener stays view-agnostic. */
const MEDIA_KEYS = {
  live: function(k){
    if(k==='a') $('btnCloned').click();
    if(k==='g') $('btnReal').click();
    if(k==='m') $('btnMic').click();
  }
};

/* ── page boot ──────────────────────────────────────────────────────────
   Every console page opens the same way: refuse the page without a staff
   session, put back the session the operator was last in, wire the chrome,
   then let the page do its own first render. startDesk() is the entry point. */
function startDesk(){
  const s = requireStaff();
  if(!s) return null;
  restoreDesk();
  buildGauge();
  buildVectors();
  applyRisk();
  return s;
}

/* ── public API ────────────────────────────────────────────────────────── */
NT.desk = {
  CALLS:CALLS, VECTORS:VECTORS, VIDEO_VECTORS:VIDEO_VECTORS, REGIONS:REGIONS,
  FRAUD_YEARS:FRAUD_YEARS, TICKER_MSGS:TICKER_MSGS, C:C,
  state:state, hero:hero, settings:settings, live:live,
  keys:{accounts:ACCOUNTS_KEY, session:SESSION_KEY},
  VIEWS:VIEWS, VIEW_LABEL:VIEW_LABEL,
  clamp:clamp, lerp:lerp, num:num, zar:zar, zarM:zarM, initials:initials,
  riskOf:riskOf, riskColor:riskColor, fmtDur:fmtDur, polar:polar, arcPath:arcPath,
  $:$, has:has, NULL_EL:NULL_EL, NULL_CTX:NULL_CTX,
  toast:toast, beep:beep,
  getCtx:getCtx, stopAudio:stopAudio, playUtterance:playUtterance, setSource:setSource,
  stopVideo:stopVideo, playVideo:playVideo, setModality:setModality,
  renderVideo:renderVideo, renderVideoMetrics:renderVideoMetrics,
  renderSpectrogram:renderSpectrogram, renderOscilloscope:renderOscilloscope,
  renderMetrics:renderMetrics, renderSpline:renderSpline,
  renderHome:renderHome, applyRisk:applyRisk, tickEscalation:tickEscalation,
  armEscalation:armEscalation, buildVectors:buildVectors, updateVectors:updateVectors,
  buildGauge:buildGauge, fitScaled:fitScaled, fitRaw:fitRaw,
  renderFraudChart:renderFraudChart, renderRadar:renderRadar,
  proj:proj, updateStation:updateStation, renderQueue:renderQueue,
  drawSpark:drawSpark, animateRegions:animateRegions, loadSession:loadSession,
  radarHover:function(){ return radarHover; }, setRadarHover:function(v){ radarHover = v; },
  analyzeAudioFile:analyzeAudioFile, analyzeVideoFile:analyzeVideoFile,
  wireCaseAudio:wireCaseAudio, wireCaseVideo:wireCaseVideo,
  setMode:setMode, connectLive:connectLive, disconnectLive:disconnectLive,
  startLiveCapture:startLiveCapture, stopLiveCapture:stopLiveCapture,
  scoreFromMetrics:scoreFromMetrics, scoreFromFrame:scoreFromFrame, applyFlags:applyFlags,
  sha256:sha256, exportPacket:exportPacket,
  pickBuiltin:pickBuiltin, enumerateCams:enumerateCams, startCam:startCam,
  stopCam:stopCam, openLiveness:openLiveness, closeLiveness:closeLiveness,
  openSettings:openSettings, closeSettings:closeSettings,
  wireSettings:wireSettings, wireLiveness:wireLiveness, wireChrome:wireChrome, wireKeys:wireKeys,
  countUp:countUp, animateHeroStats:animateHeroStats, sim:sim, updateSim:updateSim,
  startClocks:startClocks, startTicker:startTicker, startLoop:startLoop,
  startDesk:startDesk, MEDIA_KEYS:MEDIA_KEYS,
  go:go, currentView:currentView,
  saveDesk:saveDesk, restoreDesk:restoreDesk, sessionById:sessionById,
  lsGet:lsGet, lsSet:lsSet, allAccounts:allAccounts, findAccount:findAccount,
  obfuscate:obfuscate, currentSession:currentSession, startSession:startSession,
  endSession:endSession, authNote:authNote, setUserUI:setUserUI,
  enterApp:enterApp, setRole:setRole, authRole:function(){ return authRole; },
  setAuthRole:function(r){ authRole = r; },
  requireStaff:requireStaff, signOutDesk:signOutDesk, handOff:handOff
};
})(window);
'''


PATCHES = [
    # The desk root wrapper is gone: every page is the document now.
    ("""DESK_ROOT.dataset.risk =""", """document.documentElement.dataset.risk ="""),
    ("""DESK_ROOT.appendChild(v); }""", """document.body.appendChild(v); }"""),
    # Lookups must tolerate the markup this page does not ship.
    ("""const $ = id => document.getElementById(id);""",
     """const $ = id => document.getElementById(id) || NULL_EL;"""),
    # Toasts live in the shared chrome, but fall back to a host we create.
    ("""const box = $('deskToasts');
const el = document.createElement('div');""",
     """const box = document.getElementById('deskToasts') || toastHost();
const el = document.createElement('div');"""),
    # loadSession ran in-page and switched the view; now it is a navigation.
    ("""setModality('voice'); updateStation(c); applyRisk(); updateVectors(); switchTab('live');
toast('Loaded '+c.id+' ('+c.phone+') into the live cockpit.', c.score>=70?'bad':'info');""",
     """setModality('voice'); updateStation(c); applyRisk(); updateVectors();
saveDesk();
if(currentView() !== 'live'){ go('live'); return; }
toast('Loaded '+c.id+' ('+c.phone+') into the live cockpit.', c.score>=70?'bad':'info');"""),
    # -- the control panel: a view switch is a navigation now ---------------
    ("""$('ctxBack').addEventListener('click',()=>switchTab('home'));""",
     """$('ctxBack').addEventListener('click',()=>go('home'));"""),
    ("""$('btnHomeLive').addEventListener('click',()=>{
switchTab('live');""",
     """$('btnHomeLive').addEventListener('click',()=>{
saveDesk(); go('live');"""),
    ("""$('btnHomeVideo').addEventListener('click',()=>{
switchTab('live');""",
     """$('btnHomeVideo').addEventListener('click',()=>{
saveDesk(); go('live');"""),
    ("""$('btnSeeLive').addEventListener('click',()=>{
switchTab('live');""",
     """$('btnSeeLive').addEventListener('click',()=>{
saveDesk(); go('live');"""),
    ("""$('btnRunNumbers').addEventListener('click',()=>{
switchTab('business');
setTimeout(()=>$('simPanel').scrollIntoView({behavior:'smooth',block:'center'}),140);
});""",
     """$('btnRunNumbers').addEventListener('click',()=>{
go('business' + '#exposure');
});"""),
    # Signing out is handled by wireChrome() on every desk page.
    ("""$('btnLogout').addEventListener('click',()=>{ $('loginScreen').classList.remove('hide'); toast('Signed out.'); });""",
     """"""),
    # The old global shortcut handler switched views in place; wireKeys() does
    # it with a navigation now, and each page adds its own extra keys.
    ("""addEventListener('keydown',e=>{
if(!deskVisible) return;                     /* MERGE NOTE · only when the desk is on screen */
if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
const k=e.key.toLowerCase();
if(k==='1') switchTab('home');
if(k==='2') switchTab('live');
if(k==='3') switchTab('queue');
if(k==='4') switchTab('business');
if(k==='a') $('btnCloned').click();
if(k==='g') $('btnReal').click();
if(k==='m') $('btnMic').click();
if(k==='l') setMode(live.mode==='live'?'demo':'live');
});
""",
     """"""),
]

POST_PATCHES = """
/* ── sign-in role ────────────────────────────────────────────────────────
   The sign-in screen offers two doors: the fraud desk, and the customer app.
   Which one was picked decides where a successful sign-in lands. This replaces
   the verbatim copy of setRole() so that the desk is the default door rather
   than whichever one the customer app happened to leave selected. */
var authRole = 'staff';
function setRole(role){
  authRole = role;
  var pick = $('rolePick');
  if(pick) pick.querySelectorAll('[data-role]').forEach(function(b){
    b.classList.toggle('on', b.dataset.role === role);
  });
  var hint = $('roleHint');
  if(hint) hint.textContent = role === 'customer' ? 'customer access' : 'staff access';
  authNote('');
}

/* The toast host is part of the shared chrome; create it if a page forgot. */
function toastHost(){
  let box = document.getElementById('deskToasts');
  if(!box){
    box = document.createElement('div');
    box.id = 'deskToasts';
    document.body.appendChild(box);
  }
  return box;
}
/* enterApp ran while the desk was a view inside the customer document. */
function enterApp(name, msg){
  setUserUI(name);
  authNote('');
  toast(msg || ('Signed in as ' + name + '.'), 'ok');
  go('home');
}
"""


def apply_patches(text):
    for old, new in PATCHES:
        if old not in text:
            sys.stderr.write("patch target not found:\n" + old[:160] + "\n")
            sys.exit(1)
        text = text.replace(old, new, 1)
    return text


def main():
    with io.open(SRC, encoding="utf-8") as fh:
        lines = fh.read().split("\n")

    out = [HEADER]
    for start, end, label in RANGES:
        out.append("\n/* \u2550\u2550 %s \u2550\u2550 */" % label)
        out.append("\n".join(lines[start - 1:end]))
    out.append(POST_PATCHES)
    out.append(FOOTER)

    body = apply_patches("\n".join(out).lstrip("\n"))
    path = os.path.join(ROOT, "shared", "js", "desk.js")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(body)
    print("wrote shared/js/desk.js (%d bytes)" % len(body))


if __name__ == "__main__":
    main()