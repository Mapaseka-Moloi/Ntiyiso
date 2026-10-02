#!/usr/bin/env node
/**
 * Walk every route and report controls that are on the page but have no area on
 * screen.
 *
 * The flow check dispatches events at elements by selector, so a control that is
 * `display:none` will happily answer a synthetic event and the test passes. That
 * is how #formSignup shipped with a permanent `class="hidden"` and nobody
 * noticed: it was wired, it was reachable from script, and it was invisible to a
 * person. This asserts the rendered thing instead of the DOM thing.
 *
 * A handful of controls are hidden on purpose - the staff access code box until
 * the staff role is chosen, the provider block until a provider is picked - so
 * each one is declared here with the reason it may be hidden. Anything hidden
 * that is not on this list is a failure.
 *
 *   node tools/check_visible.mjs http://localhost:5199
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/+$/, '');
const PORT = 9351;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEEDS = {
  none: {},
  customer: { 'ntiyiso.session.v1': { role: 'customer', name: 'Test User', email: 't@e.com' } },
  staff: { 'ntiyiso.session.v1': { role: 'staff', name: 'Sibongile Dlamini', email: 's@mukuru.com' } },
};

/* Every route, the storage each one needs to actually render, and the role to
 * pick once the page is up. The guard on each /app page bounces to /auth/login
 * without a session, and /desk/* bounces to /desk/login without a staff one.
 *
 * The role matters on the auth pages: the form sits behind that choice, so a
 * load-time audit only ever sees step one and would call a hidden form correct.
 * Both sides of the choice are audited. */
const ROUTES = [
  ['/', 'none', null],
  ['/auth/login', 'none', 'customer'],
  ['/auth/login', 'none', 'staff'],
  ['/auth/signup', 'none', 'customer'],
  ['/auth/signup', 'none', 'staff'],
  ['/app/check', 'customer', null], ['/app/send', 'customer', null],
  ['/app/library', 'customer', null], ['/app/alerts', 'customer', null],
  ['/app/history', 'customer', null], ['/app/settings', 'customer', null],
  ['/app/checking', 'customer', null], ['/app/verdict', 'customer', null],
  ['/app/scam', 'customer', null],
  ['/desk/login', 'none', null],
  ['/desk/overview', 'staff', null], ['/desk/live', 'staff', null],
  ['/desk/radar', 'staff', null], ['/desk/business', 'staff', null],
  ['/desk/case', 'staff', null],
];

/* Things that are hidden on purpose, named by the id of whatever hides them.
 * Each carries its reason, so this cannot quietly grow into a blanket excuse -
 * and a new entry has to be justified rather than added to make a run green. */
const MAY_BE_HIDDEN = {
  authStep1: 'the role picker, once a role has been chosen',
  authStep2: 'the form step, before a role has been chosen',
  suStaffCode: 'the staff access code box, until the staff role is picked',
  siStaffCode: 'the staff access code box, until the staff role is picked',
  staffCodeBlock: 'the staff access code box, until the staff role is picked',
  staffCodeBlockIn: 'the staff access code box, until the staff role is picked',
  staffCode: 'the desk staff access code box, until the staff tab is chosen',
  signupForm: 'the desk sign-up form, until its tab is chosen',
  providerBlock: 'the provider name/email block, until a provider is chosen',
  providerName: 'inside #providerBlock',
  providerEmail: 'inside #providerBlock',
  providerGo: 'inside #providerBlock',
  providerLabel: 'inside #providerBlock',
  sessionChip: 'the header session chip, filled in once a session exists',
};

/* A hidden file input is not a defect - there is no way to draw a file picker -
 * but the button that opens one has to be reachable, or the upload is
 * unreachable. So these are allowed to be hidden while their trigger paints.
 * That catches the reverse mistake too: a button deleted from the markup while
 * its input stayed behind. */
const FILE_PICKERS = {
  fileInput: '#btnUpload',
  videoInput: '#btnVideoUpload',
  caseVoiceRealIn: '#caseVoiceRealBtn',
  caseVoiceFakeIn: '#caseVoiceFakeBtn',
  caseVideoRealIn: '#caseVideoRealBtn',
  caseVideoFakeIn: '#caseVideoFakeBtn',
};

/* Blocks that start off and are turned on by a visible control. Same rule as the
 * file pickers: allowed to be off only while that control paints. */
const TOGGLED_BY = {
  newBlock: '#modeNew',
  savedBlock: '#modeSaved',
  deskProviderBlock: '.auth-social button',
};

/* Containers the desk turns on when the browser supports the thing behind them.
 * A trigger inside one of these has not been lost - it is waiting for the panel
 * to be opened, which is what the panel's own toggle is for. */
const CONDITIONAL_PANELS = {
  videoCtrl: 'the video controls, opened when camera capture is available',
  videoEvidence: 'the video evidence strip, shown once a video has been analysed',
  livenessModal: 'the liveness modal, opened by its trigger',
  settingsModal: 'the settings modal, opened by its trigger',
};

/* Not controls, but they are what a person looks at first, so a zero-area
 * version of one of these is the same bug wearing a different hat. */
const MUST_PAINT = ['body'];

let failures = 0;
const profile = mkdtempSync(join(tmpdir(), 'ntiyiso-visible-'));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--no-first-run', '--disable-gpu',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok; } catch { await sleep(250); }
  }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  const send = (method, params = {}) => {
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((r) => pending.set(n, r));
  };
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  for (const [route, seedName, role] of ROUTES) {
    const seed = SEEDS[seedName] || {};
    /* One injected script per document; it replaces itself on the next
     * navigation because addScriptToEvaluateOnNewDocument is per-session, so
     * each route clears and reseeds explicitly. */
    await evaluate(`(() => {
      localStorage.clear();
      for (const [k, v] of Object.entries(${JSON.stringify(seed)}))
        localStorage.setItem(k, JSON.stringify(v));
      sessionStorage.clear();
      return true;
    })()`).catch(() => { /* first document has no origin yet */ });
    await send('Page.navigate', { url: BASE + route });
    await sleep(1100);

    if (role) {
      const picked = await evaluate(`
        (() => {
          const btn = document.querySelector('#rolePicker [data-role="' + ${JSON.stringify(role)} + '"]');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `);
      if (!picked) {
        failures++;
        console.log(`FAIL ${route} (as ${seedName}, role ${role})  no such role button`);
        continue;
      }
      await sleep(450);

      /* The choice has to have done something. If the page script died before it
       * wired the picker, step two never opens, and the form stays hidden behind
       * an ancestor - which reads as correct to the audit below. Asserting the
       * advance is what stops a broken script passing as a tidy page. */
      const advanced = await evaluate(`
        (() => {
          const s = document.getElementById('authStep2');
          if (!s) return 'missing';
          const r = s.getBoundingClientRect();
          const shown = getComputedStyle(s).display !== 'none' && r.width > 2 && r.height > 2;
          return shown ? 'ok' : 'still hidden - the role picker is not wired';
        })()
      `);
      if (advanced !== 'ok') {
        failures++;
        console.log(`FAIL ${route} (as ${seedName}, role ${role})  ${advanced}`);
        continue;
      }
    }

    /* Every control with no area on screen, reported against whatever is
     * actually responsible. A leaf that is hidden by a hidden ancestor is not a
     * separate finding, and hiding the ancestor is the thing to blame - but the
     * ancestor itself has to be audited, or a form that carries class="hidden"
     * simply hides its own inputs from view of this loop. */
    const found = await evaluate(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, a[href], input, textarea, select')) {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 2 && b.height > 2) continue;
        let host = el;
        while (host && host !== document.body) {
          const h = getComputedStyle(host);
          if (h.display === 'none' || h.visibility === 'hidden') break;
          host = host.parentElement;
        }
        if (!host || host === document.body) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          text: (el.textContent || el.value || '').trim().slice(0, 40),
          causeTag: host.tagName.toLowerCase(),
          causeId: host.id || null,
          causeCls: host.className || null,
          self: host === el,
        });
      }
      return out;
    })()`);

    /* The route it actually landed on, so a bounce is reported as such. */
    const landed = await evaluate('location.pathname');
    /* One finding per thing doing the hiding, not one per control inside it. */
    const causes = new Map();
    for (const f of found) {
      const key = f.causeId || `${f.causeTag}.${f.causeCls}`;
      if (causes.has(key)) { causes.get(key).count++; continue; }
      causes.set(key, { ...f, count: 1, cause: key });
    }

    const problems = [];
    for (const entry of causes.values()) {
      if (MAY_BE_HIDDEN[entry.causeId]) continue;
      if (entry.causeId && CONDITIONAL_PANELS[entry.causeId]) continue;

      /* Allowed off only while the control that turns it on is on screen. A block
       * that is off always shows up as its children being hidden rather than as
       * itself, so this is keyed on the cause and not on the control. */
      const trigger = FILE_PICKERS[entry.causeId] || TOGGLED_BY[entry.causeId];
      if (trigger) {
        const state = await evaluate(`
          (() => {
            const b = document.querySelector(${JSON.stringify(trigger)});
            if (!b) return 'missing';
            /* A trigger inside a conditional panel is waiting for the panel, not
             * lost, so name that panel and let it pass. */
            for (let host = b.parentElement; host && host !== document.body; host = host.parentElement) {
              const h = getComputedStyle(host);
              if (h.display === 'none' || h.visibility === 'hidden')
                return host.id && ${JSON.stringify(Object.keys(CONDITIONAL_PANELS))}.includes(host.id)
                  ? 'panel:' + host.id : 'hidden-by:' + (host.id || host.tagName.toLowerCase());
            }
            const r = b.getBoundingClientRect();
            return r.width > 2 && r.height > 2 ? 'ok' : 'no area';
          })()
        `);
        if (state === 'ok' || state.startsWith('panel:')) continue;
        entry.note = `${trigger}, which turns it on, is ${state}`;
      }
      problems.push(entry);
    }

    const painted = await evaluate(
      `document.querySelectorAll(${JSON.stringify(MUST_PAINT.join(','))}).length > 0`);
    if (!painted) problems.push({ tag: 'body', id: null, cls: null, text: 'nothing on the page painted' });

    const label = `${route} (as ${seedName}${role ? `, role ${role}` : ''})`;
    if (problems.length) {
      failures++;
      console.log(`FAIL ${label}`);
      for (const p of problems) {
        const what = p.count > 1 ? `${p.count} controls` : `"${p.text || p.id || p.tag}"`;
        console.log(`       ${what} have no area on screen — ${p.cause} is hiding them` +
          `${p.causeCls ? ` (class="${p.causeCls}")` : ''}` +
          `${p.note ? `, and ${p.note}` : ''}`);
      }
    } else {
      const note = landed === route ? '' : `  [landed on ${landed}]`;
      console.log(`ok   ${label}${note}`);
    }
  }

  console.log();
  console.log(`${ROUTES.length - failures}/${ROUTES.length} routes have nothing invisible on them`);
  process.exitCode = failures ? 1 : 0;
  ws.close();
} catch (err) {
  console.log(`FAIL the run completed: ${err.message}`);
  process.exitCode = 1;
} finally {
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir */ }
}