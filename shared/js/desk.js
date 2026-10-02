/* Ntiyiso - fraud-desk shared runtime.
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


/* ══ data ══ */
const CALLS = [
{id:'C-1042',agent:'Mapaseka Moloi',phone:'+27 82 491 4471',tier:'Private Wealth',intent:'International wire authorisation',amount:86500,duration:372,score:94,history:[22,34,48,62,75,84,91,94],city:'Johannesburg (Sandton)',province:'Gauteng',lat:-26.1076,lng:28.0567,tower:'JHB-SANDTON-TX04',carrier:'Vodacom SA',ip:'196.25.1.14'},
{id:'C-1043',agent:'Thabo Khumalo',phone:'+27 71 823 2088',tier:'Corporate Treasury',intent:'Beneficiary change + release',amount:240000,duration:707,score:78,history:[38,45,52,60,68,71,74,78],city:'Pretoria (Centurion)',province:'Gauteng',lat:-25.8603,lng:28.1895,tower:'PTA-CENT-TX11',carrier:'MTN SA',ip:'196.26.8.22'},
{id:'C-1051',agent:'Priya Naidoo',phone:'+27 84 902 6310',tier:'Commercial Banking',intent:'Payment limit uplift',amount:45000,duration:185,score:54,history:[28,36,34,46,43,50,48,54],city:'Durban (Umhlanga)',province:'KwaZulu-Natal',lat:-29.8587,lng:31.0218,tower:'DBN-UMH-TX02',carrier:'Vodacom SA',ip:'196.21.4.5'},
{id:'C-1044',agent:'Johan van Wyk',phone:'+27 83 714 9024',tier:'Retail Premier',intent:'Card unlock & PIN reset',amount:12500,duration:506,score:42,history:[25,32,29,39,36,42,39,42],city:'Cape Town (Foreshore)',province:'Western Cape',lat:-33.9249,lng:18.4241,tower:'CPT-FSH-TX08',carrier:'Telkom Mobile',ip:'196.30.2.19'},
{id:'C-1059',agent:'Anele Dlamini',phone:'+27 76 345 1157',tier:'Retail Premier',intent:'Address verification',amount:8200,duration:118,score:28,history:[20,24,22,28,25,30,27,28],city:'Gqeberha',province:'Eastern Cape',lat:-33.9608,lng:25.6022,tower:'PLZ-SUM-TX01',carrier:'MTN SA',ip:'196.15.7.8'},
{id:'C-1036',agent:'Fatima Isaacs',phone:'+27 72 884 7743',tier:'Private Wealth',intent:'Investment instruction',amount:150000,duration:849,score:18,history:[16,19,17,22,18,20,18,18],city:'Bloemfontein',province:'Free State',lat:-29.0852,lng:26.1596,tower:'BFN-UNV-TX03',carrier:'Vodacom SA',ip:'196.14.9.11'},
{id:'C-1063',agent:'Sipho Ngcobo',phone:'+27 79 112 5518',tier:'Commercial Banking',intent:'Statement dispute',amount:32000,duration:47,score:12,history:[10,14,12,15,13,14,12,12],city:'Polokwane',province:'Limpopo',lat:-23.9045,lng:29.4688,tower:'PLK-CBD-TX05',carrier:'Cell C',ip:'196.12.3.4'},
{id:'C-1028',agent:'Claire Botha',phone:'+27 81 556 3392',tier:'Corporate Treasury',intent:'FX forward confirmation',amount:520000,duration:1173,score:6,history:[9,8,10,7,8,7,8,6],city:'Stellenbosch',province:'Western Cape',lat:-33.9321,lng:18.8602,tower:'STB-TECH-TX07',carrier:'MTN SA',ip:'196.29.1.50'}
];
const VECTORS = [
{key:'glottal',name:'Glottal pulse continuity',unit:'match',gain:1.04},
{key:'breath', name:'Biological respiratory pauses',unit:'absent',gain:1.02},
{key:'jitter', name:'Pitch micro-tremor (jitter)',unit:'rigid',gain:0.99},
{key:'vocoder',name:'Neural vocoder artefacts',unit:'match',gain:0.93}
];
const VIDEO_VECTORS = [
{key:'lipsync',name:'Lip-sync mismatch',unit:'gap',gain:1.05},
{key:'micro', name:'Missing micro-expressions',unit:'absent',gain:1.00},
{key:'boundary',name:'Face boundary artefacts',unit:'match',gain:0.98},
{key:'blink', name:'Blink & eye-reflection anomaly',unit:'rigid',gain:0.95}
];
const REGIONS = [
{name:'Gauteng · JHB / Sandton / Centurion',v:64,c:'#E0554F'},
{name:'Western Cape · Cape Town Foreshore',v:22,c:'#DFA443'},
{name:'KwaZulu-Natal · Durban Umhlanga',v:14,c:'#6FB28C'}
];
const FRAUD_YEARS = [{y:'2021',v:0.9},{y:'2022',v:1.2},{y:'2023',v:1.6},{y:'2024',v:1.9},{y:'2025',v:2.4}];
const TICKER_MSGS = [
'Session C-1042 escalated to the Fraud Desk · forensic packet attached',
'Model refresh complete · benchmark weights re-loaded',
'Sandton cluster: three sessions sharing one vocoder fingerprint',
'POPIA audit log sealed · zero audio retained',
'Carrier sweep: Vodacom SA trunk latency nominal',
'Biometric step-up accepted on C-1036 · caller verified'
];

/* ══ util + state ══ */
const C = {threat:'#E0554F', review:'#DFA443', verified:'#6FB28C', neutral:'#645D52', bone:'#ECE5D8', ink:'#0D0C0B'};
const $ = id => document.getElementById(id) || NULL_EL;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const NBSP = '\u202F';
function num(v,dec){
const s = Math.abs(v).toFixed(dec).split('.');
const i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
return (v<0?'−':'') + (dec ? i+','+s[1] : i);
}
const zar  = n => 'R'+NBSP+num(n,2);
const zarM = n => 'R'+NBSP+num(n,1)+NBSP+'m';
const initials = n => n.split(' ').filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const riskOf = s => s>=70 ? 'high' : s>=35 ? 'med' : 'low';
const riskColor = s => s>=70 ? C.threat : s>=35 ? C.review : C.verified;
const state = {
tab:'home', active:CALLS[0], radarSel:CALLS[0], radarMode:'hybrid',
modality:'voice', vectors:VECTORS,
score:94, target:94, spline:[22,34,48,62,75,84,91,94],
live:false, sourceKind:null, sweep:0, beacon:0, elapsed:372,
metrics:{f0:0,jit:0,shim:0,hf:0,br:0}, pitchHist:[],
vLive:false, vKind:null, vT:0, vMetrics:{blink:0,lipsync:0,micro:0,boundary:0,gaze:0},
micStream:null, micSource:null, nodes:[], master:null, hideBanner:false,
escEnd:0, escFired:false,
diverted:false, dismissed:false, verified:false, liveOnDevice:null, camStream:null
};
const hero = {prog:0, statsDone:false};

/* ══ toasts ══ */
const KIND_LABEL = {info:'Notice', bad:'Threat desk', ok:'Verified'};
function toast(msg, kind){
kind = kind || 'info';
const col = kind==='bad' ? C.threat : kind==='ok' ? C.verified : C.review;
const box = document.getElementById('deskToasts') || toastHost();
const el = document.createElement('div');
el.className='toast'; el.style.setProperty('--tc',col);
const wrap=document.createElement('div');
const head=document.createElement('em'); head.textContent=KIND_LABEL[kind]||'Notice';
const body=document.createElement('span'); body.textContent=msg;
wrap.appendChild(head); wrap.appendChild(body); el.appendChild(wrap);
box.appendChild(el);
while(box.children.length>4) box.firstChild.remove();
setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(),280); }, 4000);
}

/* ══ audio engine ══ */
let audioCtx=null, analyser=null, noiseBuf=null;
const freqData = new Uint8Array(512);
const timeData = new Uint8Array(512);
function getCtx(){
if(!audioCtx){
audioCtx = new (window.AudioContext||window.webkitAudioContext)();
analyser = audioCtx.createAnalyser();
analyser.fftSize = 1024;
analyser.smoothingTimeConstant = 0.62;
analyser.connect(audioCtx.destination);
const len = audioCtx.sampleRate*2;
noiseBuf = audioCtx.createBuffer(1,len,audioCtx.sampleRate);
const d = noiseBuf.getChannelData(0);
for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
}
if(audioCtx.state==='suspended') audioCtx.resume();
return audioCtx;
}
const PHRASE = [
{f1:520,f2:1620,d:0.21},{f1:660,f2:1180,d:0.16},{f1:760,f2:1180,d:0.25},{f1:600,f2:1000,d:0.20},
{f1:340,f2:2120,d:0.13},{f1:730,f2:1090,d:0.21},{f1:560,f2:1760,d:0.19},{f1:400,f2:2020,d:0.17},
{f1:620,f2:1100,d:0.15},{f1:800,f2:1300,d:0.25},{f1:600,f2:900,d:0.21},{f1:400,f2:2120,d:0.19},
{f1:620,f2:1150,d:0.15},{f1:500,f2:1520,d:0.29},{f1:650,f2:1100,d:0.23},{f1:500,f2:1900,d:0.25},
{f1:730,f2:1090,d:0.23},{f1:600,f2:1000,d:0.21},{f1:620,f2:1200,d:0.17},{f1:520,f2:1720,d:0.19},{f1:700,f2:1100,d:0.30}
];
function setSource(label,color){ const el=$('sourceState'); el.textContent=label; el.style.color=color; }
function stopAudio(){
state.nodes.forEach(n=>{ try{ n.stop && n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} });
state.nodes=[];
if(state.master){ try{ state.master.disconnect(); }catch(e){} state.master=null; }
if(state.micStream){
state.micStream.getTracks().forEach(t=>t.stop());
state.micStream=null; state.micSource=null;
$('btnMic').classList.remove('btn-threat'); $('btnMic').textContent='Mic';
}
state.live=false; state.sourceKind=null;
setSource('STANDBY', C.neutral);
$('figState').textContent='idle';
}
function playUtterance(kind){
stopAudio();
const ctx=getCtx();
const t0=ctx.currentTime+0.06;
const total=PHRASE.reduce((a,s)=>a+s.d,0)+0.35;
const master=ctx.createGain(); master.gain.setValueAtTime(0.0001,t0); state.master=master;
const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=210;
const lp=ctx.createBiquadFilter(); lp.type='lowpass';
lp.frequency.value = kind==='cloned' ? 3180 : 3620; lp.Q.value=0.6;
const tilt=ctx.createBiquadFilter(); tilt.type='peaking'; tilt.frequency.value=1100; tilt.gain.value=3; tilt.Q.value=0.9;
const osc=ctx.createOscillator(); osc.type='sawtooth';
const bp1=ctx.createBiquadFilter(); bp1.type='bandpass'; bp1.Q.value = kind==='cloned'?15:8.5;
const bp2=ctx.createBiquadFilter(); bp2.type='bandpass'; bp2.Q.value = kind==='cloned'?15:9.5;
const bp3=ctx.createBiquadFilter(); bp3.type='bandpass'; bp3.Q.value = kind==='cloned'?18:11;
const g1=ctx.createGain(); g1.gain.value=1.0;
const g2=ctx.createGain(); g2.gain.value=0.62;
const g3=ctx.createGain(); g3.gain.value=0.34;
osc.connect(bp1); bp1.connect(g1);
osc.connect(bp2); bp2.connect(g2);
osc.connect(bp3); bp3.connect(g3);
[g1,g2,g3].forEach(g=>g.connect(hp));
hp.connect(tilt); tilt.connect(lp); lp.connect(master); master.connect(analyser);
if(kind==='real'){
const N=160, curve=new Float32Array(N); let p=128;
for(let i=0;i<N;i++){
const t=i/N;
const prosody=Math.sin(t*Math.PI*2.1)*9+Math.sin(t*Math.PI*7.3)*3.2;
const tremor=(Math.random()-0.5)*3.4;
p=clamp(p+(128+prosody-p)*0.22+tremor,104,158);
curve[i]=p;
}
osc.frequency.setValueCurveAtTime(curve,t0,total);
} else {
osc.frequency.setValueAtTime(112.0,t0);
for(let s=0;s<total;s+=0.4) osc.frequency.setValueAtTime(112.0+(Math.round((Math.random()-0.5)*4))*0.75,t0+s);
const ghost=ctx.createOscillator(); ghost.type='sawtooth'; ghost.frequency.setValueAtTime(115.4,t0);
const gg=ctx.createGain(); gg.gain.value=0.22;
ghost.connect(gg); gg.connect(hp); ghost.start(t0); ghost.stop(t0+total); state.nodes.push(ghost);
}
let t=t0;
master.gain.setValueAtTime(0.0001,t0);
PHRASE.forEach((s,i)=>{
const nx=PHRASE[i+1]||s;
bp1.frequency.setValueAtTime(s.f1,t); bp1.frequency.linearRampToValueAtTime(nx.f1,t+s.d);
bp2.frequency.setValueAtTime(s.f2,t); bp2.frequency.linearRampToValueAtTime(nx.f2,t+s.d);
bp3.frequency.setValueAtTime(s.f2*1.55,t); bp3.frequency.linearRampToValueAtTime(nx.f2*1.55,t+s.d);
const amp = kind==='cloned' ? 0.30 : 0.22+Math.random()*0.13;
master.gain.linearRampToValueAtTime(amp,t+0.026);
master.gain.setValueAtTime(amp,t+s.d*0.72);
master.gain.linearRampToValueAtTime(0.004,t+s.d);
t+=s.d;
});
master.gain.linearRampToValueAtTime(0.0001,t0+total);
const addNoise=(at,dur,gain,freq,q)=>{
const src=ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
const bf=ctx.createBiquadFilter(); bf.type='bandpass'; bf.frequency.value=freq; bf.Q.value=q;
const ng=ctx.createGain();
ng.gain.setValueAtTime(0.0001,at);
ng.gain.linearRampToValueAtTime(gain,at+dur*0.35);
ng.gain.linearRampToValueAtTime(0.0001,at+dur);
src.connect(bf); bf.connect(ng); ng.connect(master);
src.start(at); src.stop(at+dur+0.02); state.nodes.push(src);
};
if(kind==='real'){
addNoise(t0-0.02,0.26,0.055,1250,0.7);
addNoise(t0+2.05,0.30,0.062,1050,0.6);
addNoise(t0+3.55,0.24,0.048,1400,0.7);
let tt=t0; PHRASE.forEach(s=>{ if(Math.random()>0.42) addNoise(tt,0.05,0.030+Math.random()*0.02,3000+Math.random()*700,1.4); tt+=s.d; });
} else {
let tt=t0; PHRASE.forEach(s=>{ if(Math.random()>0.72) addNoise(tt,0.035,0.020,3200,2.0); tt+=s.d; });
}
osc.start(t0); osc.stop(t0+total+0.05); state.nodes.push(osc);
state.live=true; state.sourceKind=kind;
setSource(kind==='cloned'?'CLONED FORMANT SYNTH':'AUTHENTIC HUMAN VOICE', kind==='cloned'?C.threat:C.verified);
$('spectMode').textContent = kind==='cloned' ? 'Adversarial vocoder stream' : 'Biological voice stream';
$('figState').textContent = kind==='cloned' ? 'attack stream' : 'genuine stream';
const btn = kind==='cloned' ? $('btnCloned') : $('btnReal');
btn.disabled=true;
setTimeout(()=>{
btn.disabled=false;
if(state.sourceKind===kind){
stopAudio();
toast(kind==='cloned'
? 'Cloned stream complete — zero breath events, rigid F0 pinned at 112 Hz.'
: 'Authentic stream complete — natural jitter and respiratory pauses present.', kind==='cloned'?'bad':'ok');
}
}, total*1000+180);
}

/* ══ video engine ══ */
function stopVideo(){
state.vLive=false; state.vKind=null; state.vT=0;
const bf=$('btnVideoFake'), br=$('btnVideoReal');
if(bf) bf.disabled=false; if(br) br.disabled=false;
$('figStateV').textContent='idle';
}
function playVideo(kind){
stopAudio(); stopVideo();
state.modality='video';
state.vLive=true; state.vKind=kind; state.vT=0;
setSource(kind==='fake'?'DEEPFAKE FACE SYNTH':'AUTHENTIC FACE TRACK', kind==='fake'?C.threat:C.verified);
$('videoMode').textContent = kind==='fake' ? 'Deepfake video stream' : 'Biological face stream';
$('figStateV').textContent = kind==='fake' ? 'deepfake stream' : 'genuine stream';
state.target = kind==='fake' ? 96 : 9;
state.spline = kind==='fake' ? [34,52,70,84,92,96] : [14,12,11,10,9,9];
state.hideBanner = kind==='real';
const btn = kind==='fake' ? $('btnVideoFake') : $('btnVideoReal');
btn.disabled=true;
toast(kind==='fake'
? 'Streaming deepfake video — no micro-expressions, lip-sync drifting, face-boundary artefacts.'
: 'Streaming authentic video — natural blinks and micro-expressions present.', kind==='fake'?'bad':'ok');
setTimeout(()=>{
btn.disabled=false;
if(state.vKind===kind){
stopVideo();
toast(kind==='fake' ? 'Deepfake video confirmed — synthetic face signature locked.' : 'Authentic video complete — biological face behaviour consistent.', kind==='fake'?'bad':'ok');
}
}, 7000);
}
function setModality(m){
if(state.modality===m) return;
state.modality=m;
state.vectors = m==='video' ? VIDEO_VECTORS : VECTORS;
stopAudio(); stopVideo();
state.target=0; state.spline=[0,0]; state.hideBanner=true;
$('threatBanner').classList.remove('show');
$('voiceCtrl').style.display = m==='voice' ? '' : 'none';
$('videoCtrl').style.display = m==='video' ? '' : 'none';
$('voiceEvidence').style.display = m==='voice' ? '' : 'none';
$('videoEvidence').style.display = m==='video' ? '' : 'none';
$('spectMode').textContent='Telephony narrowband';
$('videoMode').textContent='Deepfake video stream';
buildVectors(); updateVectors();
DESK_ROOT.querySelectorAll('#modesToggle button').forEach(b=>b.classList.toggle('on', b.dataset.mode===m));
}
function renderVideo(time){
const cv=$('videoCanvas'); if(!cv) return;
const {w,h,ctx}=fitScaled(cv);
ctx.clearRect(0,0,w,h);
ctx.fillStyle='#0B0A09'; ctx.fillRect(0,0,w,h);
const cam=$('liveCam');
if(cam && cam.readyState>=2 && cam.videoWidth){
const vw=cam.videoWidth, vh=cam.videoHeight, sc=Math.max(w/vw,h/vh), dw=vw*sc, dh=vh*sc;
ctx.save(); ctx.globalAlpha=.92; ctx.translate(w,0); ctx.scale(-1,1);
ctx.drawImage(cam,(w-dw)/2,(h-dh)/2,dw,dh); ctx.restore();
}
const cx=w/2, cy=h*0.52, R=Math.min(w,h)*0.36;
state.vT += 0.016;
const fake = state.vKind==='fake';
const t = state.vT;
ctx.strokeStyle='rgba(236,229,216,.04)'; ctx.lineWidth=1;
for(let i=1;i<6;i++){ const y=h*i/6; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
for(let i=1;i<8;i++){ const x=w*i/8; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
ctx.beginPath();
ctx.ellipse(cx, cy, R*0.86, R*1.06, 0, 0, Math.PI*2);
ctx.strokeStyle = fake ? 'rgba(236,229,216,.26)' : 'rgba(236,229,216,.5)';
ctx.lineWidth=1.2; ctx.stroke();
ctx.beginPath();
ctx.moveTo(cx-R*0.30, cy+R*0.95); ctx.lineTo(cx+R*0.30, cy+R*0.95);
ctx.strokeStyle='rgba(236,229,216,.16)'; ctx.stroke();
const jit = fake ? (Math.random()-0.5)*3.4 : (Math.random()-0.5)*0.7;
const col = fake ? 'rgba(224,85,79,.85)' : 'rgba(111,178,140,.75)';
const col2 = fake ? 'rgba(224,85,79,.5)' : 'rgba(236,229,216,.5)';
const px=(u)=>cx+(u-0.5)*R*1.6 + jit;
const py=(v)=>cy+(v-0.5)*R*2.0 + (fake?(Math.random()-0.5)*2.4:0);
const dot=(u,v,r,color)=>{ ctx.beginPath(); ctx.arc(px(u),py(v),r,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); };
[[.34,.30],[.66,.30],[.30,.38],[.70,.38],[.28,.46],[.72,.46],[.40,.42],[.60,.42],[.36,.52],[.64,.52],[.42,.56],[.58,.56],[.50,.64],[.44,.72],[.56,.72],[.30,.58],[.70,.58],[.26,.66],[.74,.66]].forEach(p=>dot(p[0],p[1],1.6,col2));
dot(.36,.315,1.4,col2); dot(.64,.315,1.4,col2); dot(.50,.52,1.6,col2);
const blinkNow = !fake && Math.sin(t*1.9)>0.985;
[-1,1].forEach(side=>{
const ex = cx + side*R*0.34, ey = cy - R*0.18, ew = R*0.075;
if(blinkNow || fake){
ctx.beginPath(); ctx.moveTo(ex-ew*0.9, ey); ctx.lineTo(ex+ew*0.9, ey);
ctx.strokeStyle=col; ctx.lineWidth=1.4; ctx.stroke();
} else {
ctx.beginPath(); ctx.ellipse(ex, ey, ew*0.9, ew*0.55, 0, 0, Math.PI*2);
ctx.strokeStyle=col; ctx.lineWidth=1.4; ctx.stroke();
ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI*2); ctx.fillStyle=col; ctx.fill();
}
});
const moff = fake ? Math.sin(t*7)*R*0.06 : Math.sin(t*3.2)*R*0.012;
ctx.beginPath();
ctx.moveTo(cx-R*0.16, cy+R*0.36+moff);
ctx.quadraticCurveTo(cx, cy+R*0.36 - (fake?R*0.08:R*0.03) + moff*0.5, cx+R*0.16, cy+R*0.36+moff);
ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.stroke();
if(fake){
for(let i=0;i<7;i++){
const a0 = Math.PI*0.78 + i*0.09 + Math.sin(t*3+i)*0.02;
ctx.beginPath(); ctx.arc(cx, cy+R*0.02, R*0.95, a0, a0+0.07);
ctx.strokeStyle='rgba(224,85,79,'+(0.25+Math.random()*0.5).toFixed(2)+')';
ctx.lineWidth=1.6; ctx.stroke();
}
if(Math.sin(t*1.1)>0.9){
const gy=cy+(Math.random()-0.5)*R*1.6;
ctx.fillStyle='rgba(224,85,79,.06)'; ctx.fillRect(0,gy,w,2+Math.random()*6);
}
}
const sy=((t*0.25)%1)*h;
ctx.fillStyle='rgba(236,229,216,.06)'; ctx.fillRect(0,sy,w,1.5);
ctx.fillStyle='rgba(236,229,216,.18)'; ctx.fillRect(0,sy-1,w,1);
}
function renderVideoMetrics(){
const fake = state.vKind==='fake';
const target = state.vLive ? {
blink: fake ? 0.4 : 16+Math.round(Math.random()*2),
lipsync: fake ? 38+Math.round(Math.random()*5) : 96+Math.round(Math.random()*2),
micro: fake ? 0 : 21+Math.round(Math.random()*3),
boundary: fake ? 5.2+Math.random()*1.2 : 0.2+Math.random()*0.3,
gaze: fake ? 52+Math.round(Math.random()*8) : 97+Math.round(Math.random()*2)
} : {blink:0,lipsync:0,micro:0,boundary:0,gaze:0};
const M=state.vMetrics;
M.blink=lerp(M.blink,target.blink,0.18); M.lipsync=lerp(M.lipsync,target.lipsync,0.18);
M.micro=lerp(M.micro,target.micro,0.18); M.boundary=lerp(M.boundary,target.boundary,0.18); M.gaze=lerp(M.gaze,target.gaze,0.18);
const set=(id,barId,html,pct,bad)=>{
const el=$(id); el.innerHTML=html; el.classList.toggle('bad',!!bad);
const b=$(barId); b.style.width=clamp(pct,0,100)+'%'; b.style.background=bad?C.threat:C.neutral;
};
set('vBlink','vbBlink', Math.round(M.blink)+'<em>/min</em>', M.blink/20*100, M.blink<1&&state.vLive);
set('vLipsync','vbLipsync', Math.round(M.lipsync)+'<em>%</em>', M.lipsync, M.lipsync<60&&state.vLive);
set('vMicro','vbMicro', Math.round(M.micro)+'<em>/min</em>', M.micro/24*100, M.micro<1&&state.vLive);
set('vBoundary','vbBoundary', M.boundary.toFixed(1)+'<em>err</em>', M.boundary/7*100, M.boundary>3&&state.vLive);
set('vGaze','vbGaze', Math.round(M.gaze)+'<em>%</em>', M.gaze, M.gaze<60&&state.vLive);
}

/* ══ overview render ══ */
function renderHome(){
const now=new Date();
const sast=new Date(now.getTime()+(now.getTimezoneOffset()*60000)+(2*3600000));
const h=sast.getHours();
const greet = h<12 ? 'Good morning' : h<17 ? 'Good afternoon' : 'Good evening';
const firstName = String(($('chipUser') && $('chipUser').textContent) || 'Mapaseka').split(' ')[0];
$('homeGreeting').textContent=greet+', '+firstName+'.';
const flagged=CALLS.filter(c=>c.score>=70).length;
const review=CALLS.filter(c=>c.score>=35&&c.score<70).length;
$('hStatMonitored').textContent=String(CALLS.length);
$('hStatFlagged').textContent=String(flagged);
$('hStatStepups').textContent=String(Math.max(2,flagged+1));
const top = CALLS.slice().sort((a,b)=>b.score-a.score)[0];
$('homeSub').textContent = flagged>0
? flagged+' call'+(flagged>1?'s':'')+' flagged synthetic right now — the highest is '+top.id+' at '+top.score+'. Open a call to see its evidence, or watch a live attack replay.'
: 'No synthetic calls right now. Everything is nominal.';
$('homeAttnMeta').textContent=flagged+' critical · '+review+' review';
const list=CALLS.slice().sort((a,b)=>b.score-a.score).slice(0,3);
const box=$('homeAttnList'); box.innerHTML='';
list.forEach(c=>{
const col=riskColor(c.score);
const label=c.score>=70?'Synthetic':c.score>=35?'Review':'Verified';
const row=document.createElement('div'); row.className='hrow';
row.innerHTML=
'<div class="mini-av">'+initials(c.agent)+'</div>'+
'<div style="min-width:0"><div class="id">'+c.id+' · '+zar(c.amount)+'</div><div class="why">'+c.intent+'</div></div>'+
'<span class="lvl" style="color:'+col+'"><u></u>'+label+'</span>'+
'<span class="num" style="color:'+col+'">'+c.score+'</span>'+
'<span class="go2">OPEN →</span>';
row.addEventListener('click',()=>loadSession(c));
box.appendChild(row);
});
}

/* ══ risk model ══ */
function applyRisk(){
const s=Math.round(state.score);
const pct=clamp(s,0,100);
/* MERGE NOTE · data-risk used to sit on <body>; <body> is now shared. */
document.documentElement.dataset.risk = (state.live||s>0) ? riskOf(s) : 'idle';
$('scoreValue').textContent=s;
$('trajCurrent').textContent=s+' / 100';
$('arcValue').setAttribute('stroke-dashoffset', String(100-pct));
const p=polar(150,150,112,pct/100);
$('arcDot').setAttribute('cx',p.x.toFixed(2)); $('arcDot').setAttribute('cy',p.y.toFixed(2));
$('needleLine').setAttribute('x2',p.x.toFixed(2)); $('needleLine').setAttribute('y2',p.y.toFixed(2));
const vid = state.modality==='video';
const tag=$('verdictTag'), sub=$('verdictSub'), chip=$('statusTag');
if(s>=70){
if(vid){
tag.textContent='Deepfake video'; chip.textContent='Deepfake call';
sub.textContent='Synthetic face signature locked. Lip-sync is drifting and micro-expressions are absent — end the call and do not authorise.';
$('recTitle').textContent='Recommended action · block';
$('recText').textContent='End the video call, push a live face step-up challenge and open a fraud case with the facial forensic packet attached.';
} else {
tag.textContent='Synthetic forgery'; chip.textContent='Synthetic attack';
sub.textContent='Neural vocoder signature locked. Do not release funds — challenge the caller now.';
$('recTitle').textContent='Recommended action · block';
$('recText').textContent='Suspend the transfer, push an in-app biometric step-up challenge and open a fraud case with the acoustic forensic packet attached.';
}
} else if(s>=35){
tag.textContent='Anomalous · review'; chip.textContent='Manual review';
sub.textContent='Partial artefacts present. Ask a knowledge-only question and re-score before proceeding.';
$('recTitle').textContent='Recommended action · verify';
$('recText').textContent='Keep the caller on the line, run a step-up knowledge check and watch the trajectory for 30 seconds before authorising.';
} else {
if(vid){
tag.textContent='Verified authentic'; chip.textContent='Verified caller';
sub.textContent='Biological face behaviour consistent — natural blinks, micro-expressions and stable gaze. The authorisation flow may continue.';
$('recTitle').textContent='Recommended action · proceed';
$('recText').textContent='Continue with the standard authorisation flow. Continuous monitoring stays armed for the remainder of the call.';
} else {
tag.textContent='Verified authentic'; chip.textContent='Verified caller';
sub.textContent='Biological vocal-tract behaviour consistent. The standard authorisation flow may continue.';
$('recTitle').textContent='Recommended action · proceed';
$('recText').textContent='Continue with the standard authorisation flow. Continuous monitoring stays armed for the remainder of the call.';
}
}
if(state.diverted){
chip.textContent='Diverted · Fraud unit';
$('recTitle').textContent='Case opened · Fraud Unit';
$('recText').textContent='Forensic packet attached and routed to the fraud desk queue. Step-up challenge outstanding.';
} else if(state.dismissed){
chip.textContent='Monitoring';
$('recTitle').textContent='Alert dismissed · monitoring armed';
$('recText').textContent='Alert cleared for this session. Continuous scoring stays on for the rest of the call.';
} else if(state.verified){
chip.textContent='Verified by step-up';
tag.textContent='Step-up passed · verified';
}
const show = s>=70 && !state.hideBanner;
const ribbon=$('threatBanner');
if(show && !ribbon.classList.contains('show')){ ribbon.classList.add('show'); armEscalation(); beep(); }
else if(!show && ribbon.classList.contains('show')) ribbon.classList.remove('show');
if(show){
$('bannerConf').textContent=s+'% confidence';
$('bannerTitle').textContent = vid ? 'Deepfake video detected' : 'Synthetic voice detected';
$('bannerBody').textContent = vid ? 'synthetic face signature on a video authorisation call' : 'neural vocoder signature on a high-value wire authorisation';
}
const threats=CALLS.filter(c=>c.score>=70).length;
$('threatCount').textContent=String(threats);
DESK_ROOT.querySelectorAll('#pipeSteps li').forEach(li=>li.classList.toggle('hot', state.live||state.vLive));
}
function armEscalation(){ state.escEnd=performance.now()+30000; state.escFired=false; }
function tickEscalation(now){
const ribbon=$('threatBanner');
if(!ribbon.classList.contains('show')) return;
if(!settings.autoEsc){ $('rbFill').style.width='100%'; $('rbTimer').textContent='AUTO-ESCALATION OFF'; return; }
if(!state.escEnd) armEscalation();
const remain=clamp((state.escEnd-now)/30000,0,1);
$('rbFill').style.width=(remain*100)+'%';
$('rbTimer').textContent='ESCALATES IN '+Math.ceil(remain*30)+'s';
if(remain<=0 && !state.escFired){
state.escFired=true;
toast('Auto-escalation fired — '+state.active.id+' routed to the Fraud Desk with its forensic packet.','bad');
armEscalation();
}
}

/* ══ explainability vectors ══ */
function buildVectors(){
const box=$('vectorList'); box.innerHTML='';
state.vectors.forEach(v=>{
const d=document.createElement('div'); d.className='vec'; d.dataset.key=v.key;
const top=document.createElement('div'); top.className='vec-top';
const nm=document.createElement('span'); nm.textContent=v.name;
const val=document.createElement('b'); val.textContent='0%';
top.appendChild(nm); top.appendChild(val);
const bar=document.createElement('div'); bar.className='vbar';
const fill=document.createElement('i'); bar.appendChild(fill);
d.appendChild(top); d.appendChild(bar); box.appendChild(d);
});
}
function updateVectors(){
let flagged=0;
state.vectors.forEach(v=>{
const card=DESK_ROOT.querySelector('.vec[data-key="'+v.key+'"]'); if(!card) return;
const val=Math.round(clamp(state.score*v.gain+(Math.random()-0.5)*3.4,2,99));
const col=riskColor(val);
card.classList.toggle('flag', val>=70);
card.classList.toggle('watch', val>=35&&val<70);
if(val>=70) flagged++;
const b=card.querySelector('b'); b.textContent=val+'% '+v.unit; b.style.color = val>=35 ? col : C.neutral;
const f=card.querySelector('i'); f.style.width=val+'%'; f.style.background=col;
});
$('vectorCount').textContent=flagged+' / 4 FLAGGED';
}

/* ══ risk dial ══ */
function polar(cx,cy,r,t){ const a=Math.PI*(1-t); return {x:cx+r*Math.cos(a), y:cy-r*Math.sin(a)}; }
function arcPath(cx,cy,r,t0,t1){
const a=polar(cx,cy,r,t0), b=polar(cx,cy,r,t1);
return 'M '+a.x.toFixed(2)+' '+a.y.toFixed(2)+' A '+r+' '+r+' 0 '+((t1-t0)>0.5?1:0)+' 1 '+b.x.toFixed(2)+' '+b.y.toFixed(2);
}
function buildGauge(){
const CX=150, CY=150, R=112, NS='http://www.w3.org/2000/svg';
$('arcTrack').setAttribute('d',arcPath(CX,CY,R,0,1));
$('arcValue').setAttribute('d',arcPath(CX,CY,R,0,1));
const zb=$('zoneBands'); zb.innerHTML='';
[[0,.35,'rgba(111,178,140,.5)'],[.35,.70,'rgba(223,164,67,.45)'],[.70,1,'rgba(224,85,79,.55)']].forEach(z=>{
const p=document.createElementNS(NS,'path');
p.setAttribute('d',arcPath(CX,CY,R+14,z[0],z[1]));
p.setAttribute('fill','none'); p.setAttribute('stroke',z[2]); p.setAttribute('stroke-width','2');
zb.appendChild(p);
});
const tk=$('ticks'); tk.innerHTML='';
for(let i=0;i<=20;i++){
const t=i/20, major=i%5===0;
const a=polar(CX,CY,R+(major?-14:-11),t), b=polar(CX,CY,R-7,t);
const l=document.createElementNS(NS,'line');
l.setAttribute('x1',a.x.toFixed(2)); l.setAttribute('y1',a.y.toFixed(2));
l.setAttribute('x2',b.x.toFixed(2)); l.setAttribute('y2',b.y.toFixed(2));
l.setAttribute('stroke', major?'rgba(236,229,216,.36)':'rgba(236,229,216,.14)');
l.setAttribute('stroke-width', major?'1.3':'1');
tk.appendChild(l);
if(major){
const lp=polar(CX,CY,R+26,t);
const tx=document.createElementNS(NS,'text');
tx.setAttribute('x',lp.x.toFixed(2)); tx.setAttribute('y',(lp.y+3).toFixed(2));
tx.setAttribute('text-anchor','middle'); tx.setAttribute('fill','#645D52');
tx.setAttribute('font-size','8.5'); tx.setAttribute('font-family',"'IBM Plex Mono',monospace");
tx.textContent=String(t*100); tk.appendChild(tx);
}
}
}

/* ══ canvas sizing ══ */
function fitRaw(cv){
const dpr=Math.min(window.devicePixelRatio||1,2), r=cv.getBoundingClientRect();
const w=Math.max(2,Math.round(r.width*dpr)), h=Math.max(2,Math.round(r.height*dpr));
if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; }
return {w,h,dpr,cssW:r.width,ctx:cv.getContext('2d')};
}
function fitScaled(cv){
const dpr=Math.min(window.devicePixelRatio||1,2), r=cv.getBoundingClientRect();
const w=Math.max(2,r.width), h=Math.max(2,r.height);
const pw=Math.round(w*dpr), ph=Math.round(h*dpr);
if(cv.width!==pw||cv.height!==ph){ cv.width=pw; cv.height=ph; }
const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
return {w,h,dpr,ctx};
}

/* ══ spectrogram ══ */
const LUT=[];
(function(){
const stops=[[0,11,10,9],[40,42,37,32],[80,74,66,58],[120,110,98,86],[160,150,136,122],[200,192,179,164],[230,224,214,198],[255,244,238,226]];
for(let i=0;i<256;i++){
let s=0; while(s<stops.length-2 && i>stops[s+1][0]) s++;
const a=stops[s], b=stops[s+1], f=clamp((i-a[0])/((b[0]-a[0])||1),0,1);
LUT.push('rgb('+Math.round(a[1]+(b[1]-a[1])*f)+','+Math.round(a[2]+(b[2]-a[2])*f)+','+Math.round(a[3]+(b[3]-a[3])*f)+')');
}
})();
function renderSpectrogram(time){
const cv=$('spectCanvas');
const {w,h,dpr,cssW,ctx}=fitRaw(cv);
const SCROLL=Math.max(1,Math.round(cssW*dpr/1500));
ctx.drawImage(cv,-SCROLL,0);
ctx.fillStyle='#0B0A09'; ctx.fillRect(w-SCROLL,0,SCROLL,h);
const nyq = audioCtx ? audioCtx.sampleRate/2 : 22050;
const bins = analyser ? analyser.frequencyBinCount : 512;
const maxBin = clamp(Math.floor((4000/nyq)*bins),10,bins-1);
if(state.live && analyser) analyser.getByteFrequencyData(freqData);
for(let y=0;y<h;y++){
const ratio=1-y/h;
const bi=clamp(Math.floor(ratio*maxBin),0,bins-1);
let v;
if(state.live && analyser){ v=freqData[bi]*(1+ratio*1.85); }
else { v=4+Math.sin(y*0.045+time*0.0016)*2.2+Math.random()*6+(state.score>55?Math.random()*9:0); }
ctx.fillStyle=LUT[clamp(Math.floor(v),0,255)];
ctx.fillRect(w-SCROLL,y,SCROLL,1);
}
if(state.score>=70){
ctx.fillStyle='rgba(224,85,79,.16)'; ctx.fillRect(w-SCROLL,0,SCROLL,h);
ctx.fillStyle=C.threat; ctx.fillRect(w-SCROLL,0,SCROLL,Math.max(2,Math.round(2*dpr)));
}
ctx.fillStyle='rgba(236,229,216,.5)';
ctx.fillRect(w-Math.max(1,Math.round(dpr)),0,Math.max(1,Math.round(dpr)),h);
ctx.strokeStyle='rgba(236,229,216,.045)'; ctx.lineWidth=dpr;
for(let k=1;k<4;k++){ const y=h*(1-k/4); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
const winSec=Math.round(w/(SCROLL*60));
$('bufferLabel').textContent='1024-pt FFT · 0–4000 Hz · '+winSec+' s rolling buffer';
}

/* ══ oscilloscope ══ */
function renderOscilloscope(){
const cv=$('oscCanvas');
const {w,h,ctx}=fitScaled(cv);
ctx.clearRect(0,0,w,h);
ctx.strokeStyle='rgba(236,229,216,.05)'; ctx.lineWidth=1;
for(let i=1;i<8;i++){ const x=w*i/8; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
ctx.setLineDash([3,4]); ctx.strokeStyle='rgba(236,229,216,.09)';
ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke(); ctx.setLineDash([]);
if(state.live && analyser) analyser.getByteTimeDomainData(timeData);
const N=220, col=C.bone, pts=[];
for(let i=0;i<N;i++){
let v;
if(state.live && analyser){ const idx=Math.floor(i/N*timeData.length); v=(timeData[idx]-128)/128; }
else v=(Math.random()-0.5)*0.03+Math.sin(i*0.11+performance.now()*0.0022)*0.018;
pts.push({x:i/(N-1)*w, y:h/2-v*h*0.44});
}
ctx.beginPath(); ctx.moveTo(pts[0].x,h/2);
pts.forEach(p=>ctx.lineTo(p.x,p.y));
ctx.lineTo(pts[pts.length-1].x,h/2); ctx.closePath();
ctx.fillStyle='rgba(236,229,216,.06)'; ctx.fill();
ctx.beginPath();
pts.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
ctx.strokeStyle=col; ctx.lineWidth=1.2; ctx.lineJoin='round';
ctx.stroke();
let sum=0;
if(state.live && analyser){ for(let i=0;i<timeData.length;i++){ const v=(timeData[i]-128)/128; sum+=v*v; } }
else sum=0.0012*timeData.length;
const rms=Math.sqrt(sum/(timeData.length||1));
const db = rms>0.0005 ? 20*Math.log10(rms) : -99;
$('levelFill').style.width=clamp(rms*320,0,100)+'%';
$('levelDb').textContent=(db<=-90?'−∞':db.toFixed(1))+' dBFS';
}

/* ══ acoustic metrics ══ */
function renderMetrics(){
const nyq = audioCtx ? audioCtx.sampleRate/2 : 22050;
const bins = analyser ? analyser.frequencyBinCount : 512;
let f0=0, hf=0, tot=1;
if(state.live && analyser){
analyser.getByteFrequencyData(freqData);
const lo=Math.floor(70/nyq*bins), hi=Math.floor(420/nyq*bins);
let best=-1, bi=lo;
for(let i=lo;i<=hi;i++){ if(freqData[i]>best){ best=freqData[i]; bi=i; } }
f0=bi*nyq/bins;
const k2=Math.floor(2000/nyq*bins); tot=0;
for(let i=0;i<bins;i++){ tot+=freqData[i]; if(i>=k2) hf+=freqData[i]; }
}
state.pitchHist.push(f0); if(state.pitchHist.length>28) state.pitchHist.shift();
let jit=0;
if(state.pitchHist.length>4 && state.live){
const m=state.pitchHist.reduce((a,b)=>a+b,0)/state.pitchHist.length;
const sd=Math.sqrt(state.pitchHist.reduce((a,b)=>a+(b-m)*(b-m),0)/state.pitchHist.length);
jit = m>0 ? (sd/m)*100 : 0;
}
const shim = state.live ? clamp(state.score*0.02+Math.random()*0.35,0,6) : 0;
const hfPct = tot>0 ? (hf/tot)*100 : 0;
const breath = state.sourceKind==='real' ? 7+Math.round(Math.random()*2)
: state.sourceKind==='cloned' ? 0
: state.live ? 5 : 0;
const M=state.metrics;
M.f0=lerp(M.f0,f0,0.22); M.jit=lerp(M.jit,jit,0.16); M.shim=lerp(M.shim,shim,0.16);
M.hf=lerp(M.hf,hfPct,0.16); M.br=lerp(M.br,breath,0.2);
const set=(id,barId,html,pct,bad)=>{
const el=$(id); el.innerHTML=html; el.classList.toggle('bad',!!bad);
const b=$(barId); b.style.width=clamp(pct,0,100)+'%'; b.style.background=bad?C.threat:C.neutral;
};
set('mF0','bF0', Math.round(M.f0)+'<em>Hz</em>', M.f0/220*100, false);
set('mJit','bJit', M.jit.toFixed(2)+'<em>%</em>', M.jit*22, M.jit<0.35&&state.live);
set('mShim','bShim', M.shim.toFixed(1)+'<em>dB</em>', M.shim*16, false);
set('mHf','bHf', Math.round(M.hf)+'<em>%</em>', M.hf*3.2, M.hf<4&&state.live);
set('mBr','bBr', Math.round(M.br)+'<em>/min</em>', M.br*9, M.br<1&&state.live);
}

/* ══ risk trajectory ══ */
function renderSpline(){
const cv=$('splineCanvas');
const {w,h,ctx}=fitScaled(cv);
ctx.clearRect(0,0,w,h);
const pts=state.spline; if(pts.length<2) return;
const y70=h-0.70*(h-8)-4;
ctx.setLineDash([2,3]); ctx.strokeStyle='rgba(224,85,79,.4)'; ctx.lineWidth=1;
ctx.beginPath(); ctx.moveTo(0,y70); ctx.lineTo(w,y70); ctx.stroke(); ctx.setLineDash([]);
ctx.fillStyle='rgba(224,85,79,.7)'; ctx.font="400 8px 'IBM Plex Mono',monospace";
ctx.fillText('THRESHOLD 70',2,y70-4);
const X=i=>i/(pts.length-1)*w, Y=v=>h-(v/100)*(h-8)-4;
const col=riskColor(state.score);
ctx.beginPath(); ctx.moveTo(X(0),Y(pts[0]));
for(let i=1;i<pts.length;i++){
const xc=(X(i-1)+X(i))/2, yc=(Y(pts[i-1])+Y(pts[i]))/2;
ctx.quadraticCurveTo(X(i-1),Y(pts[i-1]),xc,yc);
}
const last={x:X(pts.length-1),y:Y(pts[pts.length-1])};
ctx.lineTo(last.x,last.y); ctx.lineTo(last.x,h); ctx.lineTo(0,h); ctx.closePath();
const g=ctx.createLinearGradient(0,0,0,h);
g.addColorStop(0,col+'33'); g.addColorStop(1,col+'00');
ctx.fillStyle=g; ctx.fill();
ctx.beginPath(); ctx.moveTo(X(0),Y(pts[0]));
for(let i=1;i<pts.length;i++){
const xc=(X(i-1)+X(i))/2, yc=(Y(pts[i-1])+Y(pts[i]))/2;
ctx.quadraticCurveTo(X(i-1),Y(pts[i-1]),xc,yc);
}
ctx.lineTo(last.x,last.y);
ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
ctx.beginPath(); ctx.arc(last.x-1.5,last.y,3.4,0,Math.PI*2); ctx.fillStyle=col; ctx.fill();
ctx.beginPath(); ctx.arc(last.x-1.5,last.y,1.4,0,Math.PI*2); ctx.fillStyle='#151412'; ctx.fill();
}

/* ══ fraud chart ══ */
function renderFraudChart(){
const cv=$('fraudChart'); if(!cv) return;
const {w,h,ctx}=fitScaled(cv);
ctx.clearRect(0,0,w,h);
const padL=26,padR=6,padT=16,padB=22,maxV=2.8;
const pw=w-padL-padR, ph=h-padT-padB;
const ease=1-Math.pow(1-clamp(hero.prog,0,1),3);
ctx.font="400 8.5px 'IBM Plex Mono',monospace";
for(let v=0;v<=2;v++){
const y=padT+ph-(v/maxV)*ph;
ctx.strokeStyle='rgba(236,229,216,.09)'; ctx.lineWidth=1;
ctx.beginPath(); ctx.moveTo(padL,y+.5); ctx.lineTo(w-padR,y+.5); ctx.stroke();
ctx.fillStyle='#645D52'; ctx.textAlign='right'; ctx.fillText(String(v),padL-7,y+3);
}
ctx.strokeStyle='rgba(236,229,216,.26)';
ctx.beginPath(); ctx.moveTo(padL,padT+ph+.5); ctx.lineTo(w-padR,padT+ph+.5); ctx.stroke();
const n=FRAUD_YEARS.length, slot=pw/n, bw=Math.min(38,slot*0.44);
FRAUD_YEARS.forEach((d,i)=>{
const cx=padL+slot*i+slot/2, bh=(d.v/maxV)*ph*ease, last=i===n-1;
ctx.fillStyle= last ? '#ECE5D8' : 'rgba(236,229,216,.32)';
ctx.fillRect(cx-bw/2, padT+ph-bh, bw, bh);
ctx.textAlign='center';
ctx.fillStyle= last ? '#ECE5D8' : '#A69C8C';
ctx.font=(last?"500 ":"400 ")+"9.5px 'IBM Plex Mono',monospace";
ctx.fillText(d.v.toFixed(1).replace('.',','), cx, padT+ph-bh-6);
ctx.fillStyle='#645D52'; ctx.font="400 8.5px 'IBM Plex Mono',monospace";
ctx.fillText(d.y, cx, padT+ph+14);
});
ctx.textAlign='left';
}

/* ══ geo projection ══ */
const MAP={minLat:-35.6,maxLat:-21.4,minLng:15.4,maxLng:33.6};
const SA_POLY=[
[-28.6,16.5],[-30.1,17.1],[-31.6,18.2],[-32.8,18.9],[-33.9,18.4],[-34.4,19.2],[-34.8,20.1],
[-34.4,21.4],[-34.1,22.2],[-33.9,23.6],[-33.7,25.2],[-33.0,27.0],[-31.5,29.4],[-29.9,31.0],
[-28.4,32.4],[-26.9,32.9],[-25.9,31.9],[-25.3,31.3],[-24.5,31.6],[-23.6,31.2],[-22.7,31.2],
[-22.1,29.4],[-22.8,28.6],[-23.4,27.4],[-24.0,26.2],[-24.7,25.3],[-25.0,24.0],[-25.8,22.0],
[-27.0,20.3],[-28.6,16.5]
];
const LESOTHO=[[-29.0,28.0],[-28.6,28.9],[-29.3,29.4],[-30.2,28.9],[-30.4,27.9],[-29.6,27.6]];
const METROS=[
{n:'Johannesburg',lat:-26.2041,lng:28.0473},{n:'Pretoria',lat:-25.7479,lng:28.2293},
{n:'Cape Town',lat:-33.9249,lng:18.4241},{n:'Durban',lat:-29.8587,lng:31.0218},
{n:'Gqeberha',lat:-33.9608,lng:25.6022},{n:'Bloemfontein',lat:-29.0852,lng:26.1596},
{n:'Polokwane',lat:-23.9045,lng:29.4688}
];
function proj(lat,lng,w,h,pad){
pad=pad||30;
return {x: pad + ((lng-MAP.minLng)/(MAP.maxLng-MAP.minLng))*(w-pad*2),
y: pad + ((MAP.maxLat-lat)/(MAP.maxLat-MAP.minLat))*(h-pad*2)};
}
function poly(ctx,pts,w,h){
ctx.beginPath();
pts.forEach((p,i)=>{ const q=proj(p[0],p[1],w,h); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); });
ctx.closePath();
}

/* ══ threat radar ══ */
let radarHover=null;
function renderRadar(){
const cv=$('radarCanvas'); if(!cv) return;
const {w,h,ctx}=fitScaled(cv);
ctx.clearRect(0,0,w,h);
ctx.fillStyle='#14120F'; ctx.fillRect(0,0,w,h);
ctx.strokeStyle='rgba(236,229,216,.05)'; ctx.lineWidth=1;
for(let lng=16;lng<=33;lng+=2){ const a=proj(0,lng,w,h); ctx.beginPath(); ctx.moveTo(a.x,0); ctx.lineTo(a.x,h); ctx.stroke(); }
for(let lat=-34;lat<=-22;lat+=2){ const a=proj(lat,0,w,h); ctx.beginPath(); ctx.moveTo(0,a.y); ctx.lineTo(w,a.y); ctx.stroke(); }
ctx.font="400 8px 'IBM Plex Mono',monospace"; ctx.fillStyle='rgba(236,229,216,.28)';
for(let lng=20;lng<=30;lng+=5){ const a=proj(MAP.minLat+0.6,lng,w,h); ctx.fillText(lng+'°E',a.x-9,a.y); }
for(let lat=-30;lat<=-20;lat+=5){ const a=proj(lat,MAP.minLng+0.7,w,h); ctx.fillText(Math.abs(lat)+'°S',a.x,a.y-4); }
ctx.fillStyle='rgba(236,229,216,.18)'; ctx.font="400 8.4px 'IBM Plex Mono',monospace";
const at=proj(-32.6,16.7,w,h), io=proj(-33.4,29.8,w,h);
ctx.fillText('ATLANTIC OCEAN',at.x,at.y);
ctx.fillText('INDIAN OCEAN',io.x-48,io.y+14);
poly(ctx,SA_POLY,w,h);
ctx.fillStyle='#1F1C18'; ctx.fill();
ctx.strokeStyle='rgba(236,229,216,.30)'; ctx.lineWidth=1.2; ctx.stroke();
poly(ctx,LESOTHO,w,h);
ctx.fillStyle='#14120F'; ctx.fill();
ctx.strokeStyle='rgba(236,229,216,.24)'; ctx.lineWidth=1; ctx.stroke();
ctx.fillStyle='rgba(236,229,216,.3)'; ctx.font="400 7px 'IBM Plex Mono',monospace";
const ls=proj(-29.4,28.4,w,h); ctx.fillText('LS',ls.x-4,ls.y);
ctx.fillStyle='rgba(236,229,216,.38)'; ctx.font="400 8.4px 'IBM Plex Mono',monospace";
METROS.forEach(m=>{
const p=proj(m.lat,m.lng,w,h);
ctx.beginPath(); ctx.arc(p.x,p.y,1.5,0,Math.PI*2); ctx.fill();
ctx.fillText(m.n.toUpperCase(),p.x+6,p.y+3);
});
if(state.radarMode==='heat'||state.radarMode==='hybrid'){
const off=document.createElement('canvas');
off.width=Math.max(2,Math.round(w)); off.height=Math.max(2,Math.round(h));
const oc=off.getContext('2d');
CALLS.forEach(c=>{
const p=proj(c.lat,c.lng,w,h), it=c.score/100, R=32+it*30;
const base = c.score>=70 ? '224,85,79' : c.score>=35 ? '223,164,67' : '111,178,140';
const g=oc.createRadialGradient(p.x,p.y,0,p.x,p.y,R);
g.addColorStop(0,'rgba('+base+','+(0.40*it+0.05).toFixed(3)+')');
g.addColorStop(0.5,'rgba('+base+','+(0.15*it).toFixed(3)+')');
g.addColorStop(1,'rgba('+base+',0)');
oc.fillStyle=g; oc.beginPath(); oc.arc(p.x,p.y,R,0,Math.PI*2); oc.fill();
});
ctx.drawImage(off,0,0,w,h);
}
if(state.radarMode==='towers'||state.radarMode==='hybrid'){
CALLS.forEach(c=>{
const p=proj(c.lat,c.lng,w,h), col=riskColor(c.score);
const sel=state.radarSel.id===c.id, hov=radarHover===c.id;
if(c.score>=70){
const R=8+((Math.sin(state.beacon*2+c.lat)+1)/2)*13;
ctx.beginPath(); ctx.arc(p.x,p.y,R,0,Math.PI*2);
ctx.strokeStyle='rgba(224,85,79,'+clamp(0.5-(R-8)/30,0.05,0.5).toFixed(3)+')';
ctx.lineWidth=1; ctx.stroke();
}
if(sel||hov){
ctx.beginPath(); ctx.arc(p.x,p.y,12,0,Math.PI*2);
ctx.strokeStyle= sel?'rgba(236,229,216,.95)':'rgba(236,229,216,.38)';
ctx.lineWidth= sel?1.4:1; ctx.stroke();
ctx.beginPath();
ctx.moveTo(p.x-18,p.y); ctx.lineTo(p.x-14,p.y);
ctx.moveTo(p.x+14,p.y); ctx.lineTo(p.x+18,p.y);
ctx.moveTo(p.x,p.y-18); ctx.lineTo(p.x,p.y-14);
ctx.moveTo(p.x,p.y+14); ctx.lineTo(p.x,p.y+18);
ctx.strokeStyle='rgba(236,229,216,.4)'; ctx.lineWidth=1; ctx.stroke();
}
ctx.beginPath(); ctx.arc(p.x,p.y,sel?5.2:4.2,0,Math.PI*2);
ctx.fillStyle=col; ctx.fill();
ctx.strokeStyle='#14120F'; ctx.lineWidth=1.3; ctx.stroke();
const lbl=c.id+' · '+c.score;
ctx.font="500 8.4px 'IBM Plex Mono',monospace";
const tw=ctx.measureText(lbl).width;
ctx.fillStyle= sel ? C.bone : 'rgba(21,20,18,.94)';
ctx.fillRect(p.x+9,p.y-14,tw+9,13);
ctx.strokeStyle= sel ? C.bone : 'rgba(236,229,216,.2)'; ctx.lineWidth=1;
ctx.strokeRect(p.x+9.5,p.y-13.5,tw+8,12);
ctx.fillStyle= sel ? C.ink : C.bone;
ctx.fillText(lbl,p.x+13.5,p.y-4.5);
});
}
const sx=(state.sweep%1)*w;
const sg=ctx.createLinearGradient(sx-80,0,sx,0);
sg.addColorStop(0,'rgba(236,229,216,0)'); sg.addColorStop(1,'rgba(236,229,216,.06)');
ctx.fillStyle=sg; ctx.fillRect(sx-80,0,80,h);
ctx.fillStyle='rgba(236,229,216,.26)'; ctx.fillRect(sx,0,1,h);
$('sweepPct').textContent=Math.round((state.sweep%1)*100)+'%';
}

/* ══ station panel ══ */
function updateStation(c){
$('stationName').textContent=c.id+' · '+c.city.split('(')[0].trim();
const sc=$('stationScore'); sc.textContent='RISK '+c.score; sc.style.color=riskColor(c.score);
$('stCity').textContent=c.city; $('stProvince').textContent=c.province;
$('stTower').textContent=c.tower; $('stCarrier').textContent=c.carrier;
$('stIp').textContent=c.ip; $('stIntent').textContent=c.intent;
const amt=$('stAmount'); amt.textContent=zar(c.amount); amt.style.color=riskColor(c.score);
}

/* ══ session queue ══ */
function renderQueue(){
const body=$('queueBody');
const q=($('queueFilter').value||'').toLowerCase();
const sort=$('queueSort').value;
let list=CALLS.filter(c=> c.id.toLowerCase().includes(q)||c.agent.toLowerCase().includes(q)||c.phone.includes(q)||c.city.toLowerCase().includes(q));
if(sort==='risk-desc') list.sort((a,b)=>b.score-a.score);
if(sort==='risk-asc')  list.sort((a,b)=>a.score-b.score);
if(sort==='amount')    list.sort((a,b)=>b.amount-a.amount);
if(sort==='duration')  list.sort((a,b)=>b.duration-a.duration);
if(sort==='agent')     list.sort((a,b)=>a.agent.localeCompare(b.agent));
body.innerHTML='';
if(!list.length){
body.innerHTML='<tr><td colspan="8" class="empty">No sessions match that filter.</td></tr>';
$('queueMeta').textContent='0 SESSIONS';
return;
}
list.forEach(c=>{
const col=riskColor(c.score);
const label=c.score>=70?'Synthetic':c.score>=35?'Review':'Verified';
const tr=document.createElement('tr');
if(c.score>=70) tr.className='hot';
tr.innerHTML=
'<td><div class="cell-id"><div class="mini-av">'+initials(c.agent)+'</div>'+
'<div><div class="n">'+c.id+(c.diverted?' <span class="dbadge">DIVERTED</span>':'')+'</div><div class="s">'+c.intent+'</div></div></div></td>'+
'<td><div style="color:var(--bone);font-weight:500">'+c.agent+'</div><div style="font-size:10.4px;color:var(--graphite);margin-top:2px">'+c.tier+'</div></td>'+
'<td class="mono" style="font-size:11.2px;color:var(--stone)">'+c.phone+'</td>'+
'<td class="mono" style="font-size:11.2px;color:var(--graphite)">'+Math.floor(c.duration/60)+'m '+(c.duration%60)+'s</td>'+
'<td><span class="lvl" style="color:'+col+'"><u></u>'+label+'</span></td>'+
'<td><canvas class="spark" width="220" height="48" style="width:110px;height:24px"></canvas></td>'+
'<td><div class="risk-cell"><div class="mini"><i style="width:'+c.score+'%;background:'+col+'"></i></div>'+
'<span class="num" style="color:'+col+'">'+c.score+'</span></div></td>'+
'<td><span class="go">INSPECT →</span></td>';
tr.addEventListener('click',()=>loadSession(c));
body.appendChild(tr);
drawSpark(tr.querySelector('canvas.spark'), c.history, col);
});
const crit=CALLS.filter(c=>c.score>=70).length;
const rev=CALLS.filter(c=>c.score>=35&&c.score<70).length;
$('queueMeta').textContent=list.length+' SESSIONS · '+crit+' CRITICAL · '+rev+' REVIEW';
}
function drawSpark(cv,hist,col){
const ctx=cv.getContext('2d');
ctx.setTransform(2,0,0,2,0,0);
const w=110,h=24;
ctx.clearRect(0,0,w,h);
const step=w/(hist.length-1);
const Y=v=>h-2-(v/100)*(h-6);
ctx.beginPath();
hist.forEach((v,i)=>{ const x=i*step; i?ctx.lineTo(x,Y(v)):ctx.moveTo(x,Y(v)); });
ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath();
ctx.fillStyle=col+'22'; ctx.fill();
ctx.beginPath();
hist.forEach((v,i)=>{ const x=i*step; i?ctx.lineTo(x,Y(v)):ctx.moveTo(x,Y(v)); });
ctx.strokeStyle=col; ctx.lineWidth=1.3; ctx.lineJoin='round'; ctx.stroke();
ctx.beginPath(); ctx.arc(w-1.5,Y(hist[hist.length-1]),1.8,0,Math.PI*2);
ctx.fillStyle=col; ctx.fill();
}
function animateRegions(){
const box=$('regionList');
if(!box.children.length){
box.innerHTML=REGIONS.map(r=>
'<div class="dist-row"><div class="t"><span>'+r.name+'</span><b>'+r.v+'%</b></div>'+
'<div class="track"><i data-v="'+r.v+'" style="background:'+r.c+'"></i></div></div>').join('');
}
requestAnimationFrame(()=>box.querySelectorAll('.track i').forEach(i=>i.style.width=i.dataset.v+'%'));
const cb=$('carrierList');
const agg={};
CALLS.forEach(c=>{ agg[c.carrier]=agg[c.carrier]||{sum:0,n:0}; agg[c.carrier].sum+=c.score; agg[c.carrier].n++; });
const arr=Object.entries(agg).map(([k,v])=>[k,v.sum/v.n]).sort((a,b)=>b[1]-a[1]);
const max=Math.max.apply(null,arr.map(a=>a[1]))||1;
cb.innerHTML=arr.map(([n,v])=>{
const col=riskColor(v);
return '<div class="dist-row"><div class="t"><span>'+n+'</span><b>'+v.toFixed(0)+' avg risk · '+
CALLS.filter(c=>c.carrier===n).length+' sessions</b></div>'+
'<div class="track"><i data-v="'+Math.round(v/max*100)+'" style="background:'+col+'"></i></div></div>';
}).join('');
requestAnimationFrame(()=>cb.querySelectorAll('.track i').forEach(i=>i.style.width=i.dataset.v+'%'));
}

/* ══ session loading ══ */
function loadSession(c){
resetActions();
state.active=c; state.radarSel=c; state.target=c.score; state.hideBanner=false;
state.spline=c.history.slice(); state.elapsed=c.duration;
$('sessionId').textContent=c.id;
$('callerPhone').textContent=c.phone;
$('callerCarrier').textContent=c.carrier;
$('callerTower').textContent=c.tower;
$('tierVal').textContent=c.tier;
$('agentVal').textContent=c.agent;
$('intentVal').textContent=c.intent;
$('wireVal').textContent=zar(c.amount);
$('ctxSession').textContent=c.id+' · '+c.intent;
$('targetUtterance').textContent = c.id==='C-1042'
? 'Good afternoon, I am calling to authorise the eighty-six thousand five hundred rand transfer to my registered account.'
: 'Good day, this is the registered customer confirming the '+c.intent.toLowerCase()+' on my profile.';
setModality('voice'); updateStation(c); applyRisk(); updateVectors();
saveDesk();
if(currentView() !== 'live'){ go('live'); return; }
toast('Loaded '+c.id+' ('+c.phone+') into the live cockpit.', c.score>=70?'bad':'info');
}

/* ══ controls ══ */
$('btnCloned').addEventListener('click',()=>{
playUtterance('cloned');
state.target=94; state.spline=[30,48,66,80,90,94]; state.hideBanner=false;
toast('Streaming cloned voice — rigid F0, no respiratory pauses.','bad');
});
$('btnReal').addEventListener('click',()=>{
playUtterance('real');
state.target=11; state.spline=[16,14,13,12,11,11]; state.hideBanner=true;
toast('Streaming authentic voice — biological jitter and breath present.','ok');
});
$('btnMic').addEventListener('click',async ()=>{
if(state.micStream){ stopAudio(); toast('Microphone stream disconnected.'); return; }
try{
stopAudio();
const ctx=getCtx();
const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false}});
state.micStream=stream;
state.micSource=ctx.createMediaStreamSource(stream);
state.micSource.connect(analyser);
state.live=true; state.sourceKind='mic';
setSource('LIVE MIC STREAM', C.verified);
$('spectMode').textContent='Local microphone capture';
$('figState').textContent='mic capture';
$('btnMic').classList.add('btn-threat'); $('btnMic').textContent='Stop';
state.target=18; state.spline=[22,20,19,18,18,17]; state.hideBanner=true;
toast('Live microphone connected to the acoustic analyser.','ok');
}catch(e){ toast('Microphone unavailable or permission denied.','bad'); }
});
$('btnUpload').addEventListener('click',()=>$('fileInput').click());
$('fileInput').addEventListener('change',async e=>{
const f=e.target.files[0]; if(!f) return;
stopAudio();
setSource('FILE · '+f.name.slice(0,16).toUpperCase(), C.review);
$('spectMode').textContent='Analysing upload…';
$('figState').textContent='analysing';
toast('Extracting acoustic features from '+f.name+'…');
const r = await analyzeAudioFile(f);
try{
const ctx=getCtx();
const buf=await ctx.decodeAudioData(await f.arrayBuffer());
const src=ctx.createBufferSource(); src.buffer=buf;
const g=ctx.createGain(); g.gain.value=0.85;
src.connect(g); g.connect(analyser); src.start();
state.nodes.push(src); state.master=g; state.live=true; state.sourceKind='file';
src.onended=()=>{ if(state.sourceKind==='file') stopAudio(); };
}catch(err){}
state.target=r.score; state.spline=[Math.max(1,r.score-10), r.score-5, r.score]; state.hideBanner=r.score<70;
$('spectMode').textContent='Uploaded · on-device analysis';
$('figState').textContent='scored';
const kind = r.score>=70?'bad':(r.score>=35?'info':'ok');
toast('Score '+r.score+'/100 — F0 '+Math.round(r.f0)+' Hz · jitter '+r.jitter.toFixed(2)+'% · shimmer '+r.shimmer.toFixed(1)+' · breath gaps '+r.breath+'. On-device feature extraction.', kind);
e.target.value='';
});
$('btnReset').addEventListener('click',()=>{
stopAudio();
stopVideo();
resetActions();
state.target=0; state.spline=[0,0]; state.hideBanner=true;
state.metrics={f0:0,jit:0,shim:0,hf:0,br:0}; state.pitchHist=[];
state.vMetrics={blink:0,lipsync:0,micro:0,boundary:0,gaze:0};
$('spectMode').textContent='Telephony narrowband';
$('videoMode').textContent='Deepfake video stream';
toast('Analyser reset to idle — awaiting media.');
});
$('btnBiometric').addEventListener('click', openLiveness);
function resetActions(){
state.diverted=false; state.dismissed=false; state.verified=false;
const f=$('btnFraud'); if(f){ f.disabled=false; f.textContent='Divert to fraud unit'; }
const d=$('btnDismiss'); if(d){ d.disabled=false; d.textContent='Dismiss alert'; }
const rec=DESK_ROOT.querySelector('.rec'); if(rec) rec.style.borderLeftColor='';
}
$('btnFraud').addEventListener('click',()=>{
state.diverted=true; state.dismissed=false; state.hideBanner=true;
$('threatBanner').classList.remove('show');
if(state.active) state.active.diverted=true;
const f=$('btnFraud'); f.textContent='Diverted ✓'; f.disabled=true;
const d=$('btnDismiss'); if(d){ d.disabled=false; d.textContent='Dismiss alert'; }
const rec=DESK_ROOT.querySelector('.rec'); if(rec) rec.style.borderLeftColor='var(--uncertain)';
renderQueue();
toast('Case opened — '+state.active.id+' routed to the Fraud Unit with its forensic packet.','bad');
});
$('btnDismiss').addEventListener('click',()=>{
state.dismissed=true; state.hideBanner=true;
$('threatBanner').classList.remove('show');
const d=$('btnDismiss'); d.textContent='Dismissed ✓'; d.disabled=true;
const rec=DESK_ROOT.querySelector('.rec'); if(rec) rec.style.borderLeftColor='var(--graphite)';
toast('Alert dismissed — the call stays under continuous scoring.','info');
});
$('btnInspect').addEventListener('click',()=>loadSession(state.radarSel));
$('ctxBack').addEventListener('click',()=>go('home'));
$('btnHomeLive').addEventListener('click',()=>{
saveDesk(); go('live');
setModality('voice');
setTimeout(()=>{ state.target=94; state.hideBanner=false; state.spline=[30,48,66,80,90,94]; playUtterance('cloned'); },320);
});
$('btnSettings').addEventListener('click', openSettings);

$('btnVideoFake').addEventListener('click',()=>playVideo('fake'));
$('btnVideoReal').addEventListener('click',()=>playVideo('real'));
DESK_ROOT.querySelectorAll('#modesToggle button').forEach(b=>b.addEventListener('click',()=>setModality(b.dataset.mode)));
$('btnHomeVideo').addEventListener('click',()=>{
saveDesk(); go('live');
setModality('video');
setTimeout(()=>playVideo('fake'),300);
});
$('queueFilter').addEventListener('input',renderQueue);
$('queueSort').addEventListener('change',renderQueue);
DESK_ROOT.querySelectorAll('#radarModes button').forEach(b=>{
b.addEventListener('click',()=>{
DESK_ROOT.querySelectorAll('#radarModes button').forEach(x=>x.classList.remove('on'));
b.classList.add('on'); state.radarMode=b.dataset.mode;
toast('Radar layer · '+b.textContent.trim()+'.'); renderRadar();
});
});
$('btnRunNumbers').addEventListener('click',()=>{
go('business' + '#exposure');
});
$('btnSeeLive').addEventListener('click',()=>{
saveDesk(); go('live');
setModality('voice');
setTimeout(()=>{ state.target=94; state.hideBanner=false; state.spline=[30,48,66,80,90,94]; playUtterance('cloned'); },320);
});

/* ══ on-device analysis ══ */
async function analyzeAudioFile(file){
const ctx=new (window.AudioContext||window.webkitAudioContext)();
let buf;
try{ buf=await ctx.decodeAudioData(await file.arrayBuffer()); }
catch(e){ return {score:0,f0:0,jitter:0,shimmer:0,breath:0,err:true}; }
const ch=buf.getChannelData(0), sr=buf.sampleRate, target=8000, step=sr/target;
const L=Math.floor(ch.length/step), pcm=new Float32Array(L);
for(let i=0;i<L;i++) pcm[i]=ch[Math.min(ch.length-1,Math.round(i*step))];
const frame=240, hop=120, f0s=[], rmss=[];
for(let s=0;s+frame<=L;s+=hop){
let rms=0; for(let i=s;i<s+frame;i++) rms+=pcm[i]*pcm[i]; rms=Math.sqrt(rms/frame);
let bestLag=0,bestR=-1;
for(let lag=20;lag<200;lag++){
let num=0,d1=0,d2=0;
for(let i=0;i<frame-lag;i++){ const a=pcm[s+i],b=pcm[s+i+lag]; num+=a*b; d1+=a*a; d2+=b*b; }
const r=(d1>0&&d2>0)?num/Math.sqrt(d1*d2):0;
if(r>bestR){bestR=r;bestLag=lag;}
}
if(rms>0.008 && bestR>0.5) f0s.push(target/bestLag);
rmss.push(rms);
}
if(f0s.length<3) return {score:30,f0:0,jitter:0,shimmer:0,breath:0,note:'too little voiced speech'};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const mF0=mean(f0s), sdF0=Math.sqrt(mean(f0s.map(v=>(v-mF0)*(v-mF0))));
const jitter=mF0>0?(sdF0/mF0)*100:0;
const mRms=mean(rmss), sdRms=Math.sqrt(mean(rmss.map(v=>(v-mRms)*(v-mRms))));
const shimmer=mRms>0?(sdRms/mRms)*100:0;
let gaps=0,inGap=false;
for(let i=0;i<rmss.length;i++){ if(rmss[i]<0.006){ if(!inGap){inGap=true;gaps++;} } else inGap=false; }
let s=0;
if(jitter<0.35) s+=30; else if(jitter<0.7) s+=15; else s+=4;
if(shimmer<1.5) s+=22; else if(shimmer<3.5) s+=12; else s+=3;
if(gaps<3) s+=26; else if(gaps<6) s+=12; else s+=3;
s=clamp(s,3,96);
return {score:Math.round(s), f0:mF0, jitter, shimmer, breath:gaps, note:''};
}
async function analyzeVideoFile(file){
const url=URL.createObjectURL(file);
const v=document.createElement('video'); v.muted=true; v.playsInline=true; v.preload='auto'; v.src=url;
await new Promise((res,rej)=>{ v.onloadedmetadata=res; v.onerror=rej; });
const W=128,H=72, c=document.createElement('canvas'); c.width=W; c.height=H;
const cx=c.getContext('2d',{willReadFrequently:true});
const dur=v.duration||5, N=20, frames=[];
for(let i=0;i<N;i++){
v.currentTime=Math.max(0,Math.min(dur-0.05,(i/(N-1))*dur));
await new Promise(r=>{ v.onseeked=r; });
cx.drawImage(v,0,0,W,H);
frames.push(new Uint8ClampedArray(cx.getImageData(0,0,W,H).data));
}
URL.revokeObjectURL(url);
let motion=0,edgeSum=0,varSum=0,prevLum=null;
for(const d of frames){
const n=W*H; let lum=0;
for(let i=0;i<n;i++){ lum+=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]; }
lum/=n;
let varA=0,edge=0;
for(let i=0;i<n;i++){ const y=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]; varA+=(y-lum)*(y-lum); }
varA/=n;
for(let yy=0;yy<H;yy++) for(let x=1;x<W;x++){
const a=(d[(yy*W+x)*4]+d[(yy*W+x)*4+1]+d[(yy*W+x)*4+2])/3;
const b=(d[(yy*W+x-1)*4]+d[(yy*W+x-1)*4+1]+d[(yy*W+x-1)*4+2])/3;
edge+=Math.abs(a-b);
}
edge/=(W*H); edgeSum+=edge; varSum+=varA;
if(prevLum!==null) motion+=Math.abs(lum-prevLum);
prevLum=lum;
}
const fn=Math.max(1,frames.length);
const mEdge=edgeSum/fn, mVar=varSum/fn, mMotion=motion/Math.max(1,frames.length-1);
let s=0;
if(mMotion<2.5) s+=28; else if(mMotion<5) s+=14; else s+=3;
if(mEdge<28) s+=24; else if(mEdge<45) s+=12; else s+=3;
if(mVar<220) s+=22; else if(mVar<520) s+=11; else s+=3;
s=clamp(s,3,96);
return {score:Math.round(s), motion:mMotion, edge:mEdge, variance:mVar, frames:frames.length};
}

/* ══ case-study wiring ══ */
function wireCaseAudio(btnId,inId,scoreId){
$(btnId).addEventListener('click',()=>$(inId).click());
$(inId).addEventListener('change',async e=>{
const f=e.target.files[0]; if(!f) return;
const el=$(scoreId); el.textContent='…'; el.style.color='var(--stone)';
const r=await analyzeAudioFile(f);
if(r.err){ el.textContent='err'; toast('Could not decode that audio.','bad'); e.target.value=''; return; }
el.textContent=String(r.score); el.style.color=riskColor(r.score);
toast('Voice score '+r.score+'/100 — F0 '+Math.round(r.f0)+' Hz · jitter '+r.jitter.toFixed(2)+'% · breath gaps '+r.breath+'.', r.score>=70?'bad':(r.score>=35?'info':'ok'));
e.target.value='';
});
}
function wireCaseVideo(btnId,inId,scoreId){
$(btnId).addEventListener('click',()=>$(inId).click());
$(inId).addEventListener('change',async e=>{
const f=e.target.files[0]; if(!f) return;
const el=$(scoreId); el.textContent='…'; el.style.color='var(--stone)';
const r=await analyzeVideoFile(f);
el.textContent=String(r.score); el.style.color=riskColor(r.score);
toast('Video score '+r.score+'/100 — motion '+r.motion.toFixed(1)+' · edge '+r.edge.toFixed(1)+' · variance '+r.variance.toFixed(0)+'.', r.score>=70?'bad':(r.score>=35?'info':'ok'));
e.target.value='';
});
}

/* ══ live ingest ══ */
const STREAM_URL = 'ws://' + (location.hostname || 'localhost') + ':8000/stream';
const live = {mode:'demo', ws:null, timer:null, stream:null, tick:0};
function setMode(mode){
live.mode = mode;
DESK_ROOT.querySelectorAll('#modeToggle button').forEach(b=>b.classList.toggle('on', b.dataset.mode===mode));
if(mode==='live'){ connectLive(); }
else { disconnectLive(); stopLiveCapture(); $('connDot').style.background='var(--genuine)'; $('connText').textContent='Local mode'; }
}
function connectLive(){
disconnectLive(); stopLiveCapture();
$('connDot').style.background='var(--uncertain)'; $('connText').textContent='Connecting…';
let settled=false;
let ws=null;
try{ ws = new WebSocket(STREAM_URL); }catch(e){ startLiveCapture(); return; }
live.ws = ws;
live.timer = setTimeout(()=>{ if(!settled){ settled=true; try{ ws.close(); }catch(e){} live.ws=null; startLiveCapture(); } }, 2000);
ws.onopen = ()=>{ settled=true; clearTimeout(live.timer); $('connDot').style.background='var(--genuine)'; $('connText').textContent='Live · backend'; toast('Live backend connected — streaming scores.','ok'); };
ws.onmessage = ev=>{
try{
const m = JSON.parse(ev.data);
if(typeof m.score==='number'){
const s = clamp(Math.round(m.score*100),0,100);
state.target = s;
state.spline.push(s); if(state.spline.length>32) state.spline.shift();
if(m.latency_ms!=null){ $('chipLatency').textContent=m.latency_ms+' ms'; $('pipeLatency').textContent=m.latency_ms+' ms'; }
if(Array.isArray(m.flags)) applyFlags(m.flags);
}
}catch(e){}
};
ws.onerror = ()=>{ if(!settled){ settled=true; clearTimeout(live.timer); live.ws=null; startLiveCapture(); } };
ws.onclose = ()=>{ if(!settled){ settled=true; clearTimeout(live.timer); live.ws=null; startLiveCapture(); } };
}
function startLiveCapture(){
if(live.mode!=='live' || live.stream) return;
const isVideo = state.modality==='video';
const want = isVideo ? {video:true} : {audio:{echoCancellation:false,noiseSuppression:false}};
if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ startSimulatedLive('No capture device'); return; }
navigator.mediaDevices.getUserMedia(want).then(stream=>{
live.stream = stream;
if(isVideo){
let v=$('liveCam');
if(!v){ v=document.createElement('video'); v.id='liveCam'; v.autoplay=true; v.muted=true; v.playsInline=true; v.style.display='none'; document.body.appendChild(v); }
v.srcObject = stream;
state.camStream = stream; state.liveOnDevice = 'video';
$('videoMode').textContent='Live on-device camera'; $('figStateV').textContent='live capture';
$('connText').textContent='Live · on-device camera';
} else {
stopAudio();
const ctx=getCtx();
state.micSource = ctx.createMediaStreamSource(stream);
state.micSource.connect(analyser);
state.live=true; state.sourceKind='live'; state.liveOnDevice='voice';
setSource('LIVE MIC · ON-DEVICE', C.verified);
$('spectMode').textContent='Live on-device capture'; $('figState').textContent='live capture';
$('connText').textContent='Live · on-device mic';
}
$('connDot').style.background='var(--genuine)';
toast('Live capture started on this device — no backend needed.','ok');
}).catch(()=>{ startSimulatedLive(isVideo?'Camera blocked':'Microphone blocked'); });
}
function startSimulatedLive(why){
if(live.mode!=='live') return;
state.liveOnDevice='sim';
$('connDot').style.background='var(--uncertain)';
$('connText').textContent='Live · simulated stream';
toast((why?why+' — ':'')+'running a simulated live stream.','info');
}
function stopLiveCapture(){
if(live.stream){ live.stream.getTracks().forEach(t=>t.stop()); live.stream=null; }
state.liveOnDevice=null;
if(state.camStream) state.camStream=null;
const v=$('liveCam'); if(v) v.srcObject=null;
}
function scoreFromMetrics(){
const M=state.metrics;
let s=0;
if(M.jit<0.35) s+=30; else if(M.jit<0.7) s+=15; else s+=4;
if(M.shim<1.5) s+=22; else if(M.shim<3.5) s+=12; else s+=3;
if(M.br<3) s+=26; else if(M.br<6) s+=12; else s+=3;
return clamp(Math.round(s),4,96);
}
function scoreFromFrame(){
const cv=$('videoCanvas'); if(!cv) return 50;
try{
const c=document.createElement('canvas'); c.width=48; c.height=27;
const x=c.getContext('2d',{willReadFrequently:true});
x.drawImage(cv,0,0,48,27);
const d=x.getImageData(0,0,48,27).data, n=48*27;
let lum=0;
for(let i=0;i<n;i++) lum += 0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];
lum/=n;
let v=0;
for(let i=0;i<n;i++){ const y=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]; v+=(y-lum)*(y-lum); }
v/=n;
return clamp(v<180 ? 70 : v<420 ? 48 : 26, 8, 92);
}catch(e){ return 50; }
}
function applyFlags(flags){
const map={'pitch_stability':'jitter','no_breath':'breath','vocoder':'vocoder','lipsync':'lipsync','micro':'micro','boundary':'boundary','blink':'blink'};
flags.forEach(f=>{ const k=map[f]; if(!k) return; const card=DESK_ROOT.querySelector('.vec[data-key="'+k+'"]'); if(card){ card.classList.add('flag'); const b=card.querySelector('b'); if(b) b.textContent='flagged'; } });
}
function disconnectLive(){
if(live.timer){ clearTimeout(live.timer); live.timer=null; }
if(live.ws){ try{ live.ws.onclose=null; live.ws.onerror=null; live.ws.close(); }catch(e){} live.ws=null; }
}

/* ══ chain-of-custody hash ══ */
async function sha256(str){
try{ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
catch(e){ return 'sha256-unavailable'; }
}

/* ══ liveness step-up ══ */
let livenessStream=null, livenessTimer=null;
function pickBuiltin(cams){
const bad=/phone|continuity|iphone|ipad|android|link to|virtual|obs|snap/i;
const good=/integrated|built-?in|webcam|hd user|usb|front|internal/i;
let idx=-1;
cams.forEach((c,i)=>{ if(idx<0 && good.test(c.label||'') && !bad.test(c.label||'')) idx=i; });
if(idx<0) cams.forEach((c,i)=>{ if(idx<0 && !bad.test(c.label||'')) idx=i; });
return idx;
}
async function enumerateCams(){
try{
const devs = await navigator.mediaDevices.enumerateDevices();
return devs.filter(d=>d.kind==='videoinput');
}catch(e){ return []; }
}
async function startCam(deviceId){
stopCam();
const sel=$('livenessCam');
if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
sel.innerHTML='<option>No camera available</option>'; return;
}
try{
const stream = await navigator.mediaDevices.getUserMedia(deviceId ? {video:{deviceId:{exact:deviceId}}} : {video:true});
livenessStream = stream;
$('livenessVideo').srcObject = stream;
const cams = await enumerateCams();
sel.innerHTML = cams.map((c,i)=>'<option value="'+c.deviceId+'">'+(c.label||('Camera '+(i+1)))+'</option>').join('') || '<option>Default camera</option>';
if(deviceId){ sel.value = deviceId; }
else {
const idx = pickBuiltin(cams);
if(idx > 0 && cams[idx]){ startCam(cams[idx].deviceId); return; }
if(cams[0]) sel.value = cams[0].deviceId;
}
}catch(e){
sel.innerHTML='<option>Camera blocked — allow access</option>';
}
}
function stopCam(){
if(livenessStream){ livenessStream.getTracks().forEach(t=>t.stop()); livenessStream=null; }
const v=$('livenessVideo'); if(v && v.srcObject){ v.srcObject=null; }
}
function openLiveness(){
$('livenessModal').style.display='flex';
$('livenessChallenge').textContent = 'Say "'+Math.floor(Math.random()*10)+' · '+Math.floor(Math.random()*10)+' · '+Math.floor(Math.random()*10)+'" and blink twice.';
let n=8; $('livenessCount').textContent=String(n);
clearInterval(livenessTimer);
livenessTimer=setInterval(()=>{ n--; $('livenessCount').textContent=String(n); if(n<=0) closeLiveness(false); },1000);
startCam($('livenessCam').value || null);
}

/* ══ liveness close ══ */
function closeLiveness(passed){
clearInterval(livenessTimer);
stopCam();
$('livenessModal').style.display='none';
if(passed){
state.hideBanner=true; $('threatBanner').classList.remove('show');
state.verified=true;
$('verdictTag').textContent='Step-up passed · verified';
$('statusTag').textContent='Verified by step-up';
toast('Liveness step-up passed — caller verified by challenge.','ok');
} else {
toast('Step-up not completed.','info');
}
}

/* ══ desk preferences ══ */
const settings = {autoEsc:true, review:true, sound:true};
(function(){ try{ const s=JSON.parse(localStorage.getItem('ntiyiso.settings')||'{}'); Object.assign(settings,s); }catch(e){} })();
function beep(){
if(!settings.sound) return;
try{
const ctx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
const o=ctx.createOscillator(), g=ctx.createGain();
o.type='square'; o.frequency.value=880; g.gain.value=0.05;
o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.12);
}catch(e){}
}
function openSettings(){
$('setAutoEsc').checked = !!settings.autoEsc;
$('setReview').checked = !!settings.review;
$('setSound').checked = !!settings.sound;
$('settingsModal').style.display='flex';
}
function closeSettings(){ $('settingsModal').style.display='none'; }

/* ══ accounts + session ══ */
var ACCOUNTS_KEY = 'ntiyiso.accounts.v1';
var SESSION_KEY  = 'ntiyiso.session.v1';
var LEGACY_KEY   = 'ntiyiso.account';
function lsGet(key, fb){ try{ var r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; }catch(e){ return fb; } }
function lsSet(key, v){ try{ localStorage.setItem(key, JSON.stringify(v)); }catch(e){} }
function allAccounts(){
var list = lsGet(ACCOUNTS_KEY, null);
if(list) return list;
var legacy = lsGet(LEGACY_KEY, null);
list = [];
if(legacy && legacy.email){
legacy.role = 'staff';
legacy.provider = legacy.provider || 'password';
list.push(legacy);
lsSet(ACCOUNTS_KEY, list);
}
return list;
}
function findAccount(email){
var list = allAccounts(), e = String(email || '').trim().toLowerCase();
for(var i = 0; i < list.length; i++) if(list[i].email === e) return list[i];
return null;
}
function obfuscate(p){
try{ return btoa(unescape(encodeURIComponent(String(p)))); }
catch(e){ return 'len' + String(p).length + ':' + String(p); }
}
function currentSession(){ return lsGet(SESSION_KEY, null); }
function startSession(acc){
lsSet(SESSION_KEY, { role:acc.role || 'staff', name:acc.name, email:acc.email,
phone:acc.phone || '', provider:acc.provider || 'password', since:new Date().toISOString() });
}
function endSession(){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){} }
function authNote(t){ var el = $('deskAuthNote'); if(el) el.textContent = typeof t === 'string' ? t : ''; }
function setUserUI(name){
var parts = String(name || '').split(' ').filter(Boolean);
var ini = ((parts[0] || '?')[0] + ((parts[1] || '')[0] || '')).toUpperCase();
DESK_ROOT.querySelectorAll('.user-av').forEach(function(el){ el.textContent = ini; });
DESK_ROOT.querySelectorAll('.user-card b').forEach(function(el){ el.textContent = name || ''; });
var chip = $('chipUser'); if(chip) chip.textContent = name || '';
var wrap = $('sessionChip'); if(wrap) wrap.style.display = name ? 'flex' : 'none';
}

/* ══ desk sign-in ══ */
(function(){
var pick = $('rolePick');
if(pick) pick.querySelectorAll('[data-role]').forEach(function(b){
b.addEventListener('click', function(){ setRole(b.dataset.role); });
});
})();
/* tabs */
$('deskAuthTabs').querySelectorAll('button').forEach(function(b){
b.addEventListener('click', function(){
var m = b.dataset.auth;
$('deskAuthTabs').querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); });
$('signinForm').style.display = m === 'signin' ? 'flex' : 'none';
$('signupForm').style.display = m === 'signup' ? 'flex' : 'none';
authNote('');
});
});
/* create account */
$('signupForm').addEventListener('submit', function(e){
e.preventDefault();
var name = $('signupName').value.trim();
var email = $('signupEmail').value.trim().toLowerCase();
var p1 = $('signupPass').value, p2 = $('signupPass2').value;
if(!name || !email || !p1){ authNote('Please fill in every field.'); return; }
if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)){ authNote('That email address does not look right.'); return; }
if(p1.length < 6){ authNote('Password must be at least 6 characters.'); return; }
if(p1 !== p2){ authNote('Those passwords do not match.'); return; }
if(findAccount(email)){ authNote('An account with that email already exists. Sign in instead.'); return; }
var acct = { name:name, email:email, phone:'', pass:obfuscate(p1),
provider:'password', role:authRole, created:new Date().toISOString() };
var list = allAccounts(); list.push(acct); lsSet(ACCOUNTS_KEY, list);
startSession(acct);
if(authRole === 'customer'){ handOff('created'); return; }
enterApp(name, 'Account created — welcome, ' + name.split(' ')[0] + '.');
});
/* sign in */
$('signinForm').addEventListener('submit', function(e){
e.preventDefault();
var email = $('loginEmail').value.trim().toLowerCase();
var pass = $('loginPass').value;
var acct = findAccount(email);
if(!acct){
authNote('No account with that email on this device. If you made it earlier, you may have '
+ 'opened the app from a different address — accounts are stored per address.');
return;
}
if(acct.provider === 'password' && acct.pass !== obfuscate(pass)){
authNote('That password is not correct.'); return;
}
acct.role = acct.role || authRole;
authRole = acct.role;
startSession(acct);
if(acct.role === 'customer'){ handOff('welcome'); return; }
enterApp(acct.name, 'Welcome back, ' + acct.name.split(' ')[0] + '.');
});
/* social · MERGE NOTE · ids renamed so they cannot collide with the customer app's */
(function(){
var social = DESK_ROOT.querySelector('.auth-social');
if(!social) return;
var block = document.createElement('div');
block.id = 'deskProviderBlock';
block.style.cssText = 'display:none;margin-top:12px;padding:13px;background:var(--soot);'
+ 'border:1px solid var(--brand-line);border-radius:4px';
block.innerHTML =
'<div class="auth-label" id="deskProviderLabel" style="margin-top:0"></div>'
+ '<input type="text" id="deskProviderName" placeholder="Your full name" style="margin-top:6px" />'
+ '<input type="email" id="deskProviderEmail" placeholder="you@example.co.za" style="margin-top:6px" />'
+ '<button class="btn btn-solid wide" type="button" id="deskProviderGo" style="margin-top:10px">Continue</button>'
+ '<div class="auth-note" style="margin-top:8px">Prototype — no real provider sign-in. '
+ 'Enter the account you want to use and it is created on this device.</div>';
social.parentNode.insertBefore(block, social.nextSibling);
var provider = null;
social.querySelectorAll('.btn').forEach(function(b){
b.addEventListener('click', function(){
provider = b.dataset.social;
block.style.display = 'block';
$('deskProviderLabel').textContent = 'Continue with ' + provider;
$('deskProviderBlock').querySelector('.auth-note').style.color = 'var(--graphite)';
$('deskProviderName').focus();
});
});
$('deskProviderGo').addEventListener('click', function(){
var name = $('deskProviderName').value.trim();
var email = $('deskProviderEmail').value.trim().toLowerCase();
if(!name){ authNote('Please enter your name so we can greet you correctly.'); return; }
if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)){ authNote('Please enter a valid email address.'); return; }
var acct = findAccount(email);
if(!acct){
acct = { name:name, email:email, phone:'', pass:'', provider:provider,
role:authRole, created:new Date().toISOString() };
var list = allAccounts(); list.push(acct); lsSet(ACCOUNTS_KEY, list);
} else {
acct.name = name; acct.provider = provider; acct.role = authRole;
lsSet(ACCOUNTS_KEY, allAccounts());
}
startSession(acct);
authNote('');
if(acct.role === 'customer'){ handOff('social'); return; }
enterApp(acct.name, 'Signed in with ' + provider + ' as ' + acct.name + '.');
});
})();

/* ══ business model ══ */
function countUp(el,to,dur,fmt){
const from=parseFloat(el.dataset.cur||'0'), t0=performance.now();
(function step(now){
const p=clamp((now-t0)/dur,0,1), e=1-Math.pow(1-p,3);
const v=lerp(from,to,e);
el.textContent=fmt(v); el.dataset.cur=String(v);
if(p<1) requestAnimationFrame(step);
})(t0);
}
function animateHeroStats(){
if(hero.statsDone) return; hero.statsDone=true;
countUp($('statUplift'),26,1300,v=>'+'+v.toFixed(0)+'%');
countUp($('statVoice'),2.5,1300,v=>v.toFixed(1).replace('.',',')+'%');
}
const sim={base:2400,share:2.5,intercept:92,cost:6};
function updateSim(){
const voiceLoss=sim.base*sim.share/100;
const prevented=voiceLoss*sim.intercept/100;
const residual=voiceLoss-prevented;
const net=prevented-sim.cost;
const roi=sim.cost>0?net/sim.cost:0;
$('lblBase').textContent='R'+NBSP+num(sim.base,0)+NBSP+'m';
$('lblShare').textContent=sim.share.toFixed(1).replace('.',',')+'% · '+zarM(voiceLoss);
$('lblIntercept').textContent=sim.intercept.toFixed(0)+'%';
$('lblCost').textContent=zarM(sim.cost);
$('lblCost2').textContent=zarM(sim.cost);
$('lblWithout').textContent=zarM(voiceLoss);
$('lblSaved').textContent=zarM(prevented);
$('lblWith').textContent=zarM(residual);
$('lblNet').textContent=zarM(net);
$('roiMultiple').textContent=roi.toFixed(1).replace('.',',')+'×';
const share=voiceLoss>0?prevented/voiceLoss*100:0;
$('segPrevented').style.width=clamp(share,0,100)+'%';
$('segResidual').style.width=clamp(100-share,0,100)+'%';
[['sBase',sim.base,500,5000],['sShare',sim.share,0.5,8],['sIntercept',sim.intercept,70,98],['sCost',sim.cost,1,20]]
.forEach(([id,v,mn,mx])=>$(id).style.setProperty('--pct',((v-mn)/(mx-mn)*100).toFixed(2)+'%'));
}

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
  const p = location.pathname.replace(/\/+$/,'');
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
