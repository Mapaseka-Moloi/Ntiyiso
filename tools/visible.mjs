#!/usr/bin/env node
/**
 * Report what is actually visible on a page, not just what is in the DOM.
 *
 * The flow check dispatches submit events straight onto form elements, so it
 * happily passes a form that is on the page and invisible. A person cannot do
 * that. This walks the rendered boxes instead: anything present in the DOM but
 * with no area on screen is listed, which is how a `class="hidden"` that never
 * gets taken off presents itself.
 *
 *   node tools/visible.mjs http://localhost:5199 /auth/signup [none|customer|staff] [customer|staff]
 *
 * The fourth argument seeds storage. The optional fifth clicks a role button in
 * `#rolePicker` before auditing, because on the auth pages the form is behind
 * that choice and "present but not visible" means something different on each
 * side of it.
 *   node tools/visible.mjs http://localhost:5199 /auth/login  none
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/+$/, '');
const ROUTE = process.argv[3] || '/auth/signup';
const SEED = process.argv[4] || 'none';
const PICK_ROLE = process.argv[5] || '';
const PORT = 9344;
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

const profile = mkdtempSync(join(tmpdir(), 'ntiyiso-vis-'));
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

  const seed = SEEDS[SEED] || {};
  if (Object.keys(seed).length) {
    const calls = Object.entries(seed)
      .map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`)
      .join('');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.clear();${calls}}catch(e){}` });
  }

  await send('Page.navigate', { url: BASE + ROUTE });
  await sleep(1400);

  if (PICK_ROLE) {
    /* Clicked the way a person would, so the handlers that reveal step two have
     * to actually run. */
    const clicked = await evaluate(`
      (() => {
        const btn = document.querySelector('#rolePicker [data-role="' + ${JSON.stringify(PICK_ROLE)} + '"]');
        if(!btn) return false;
        btn.click();
        return true;
      })()
    `);
    if (!clicked) throw new Error(`no role button for "${PICK_ROLE}" on ${ROUTE}`);
    await sleep(500);
  }

  console.log(`\n${BASE}${ROUTE}  (seed: ${SEED}${PICK_ROLE ? `, picked role: ${PICK_ROLE}` : ''})\n`);

  /* What the person actually sees at the top of the page. */
  console.log('== logos and images as rendered ==');
  console.log(JSON.stringify(await evaluate(`
    [...document.querySelectorAll('img')].map(i => {
      const b = i.getBoundingClientRect();
      return { src: i.getAttribute('src'), cls: i.className || '(none)',
               w: Math.round(b.width), h: Math.round(b.height), shown: b.width > 0 && b.height > 0 };
    })
  `), null, 2));

  /* Anything interactive that has no area on screen. */
  console.log('\n== present but not visible ==');
  const hidden = await evaluate(`
    (() => {
      const out = [];
      for (const el of document.querySelectorAll('form, input, button, a, textarea, select, label, [id]')) {
        if (!el.id && !['FORM','INPUT','BUTTON','TEXTAREA','SELECT'].includes(el.tagName)) continue;
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const invisible = (b.width === 0 && b.height === 0) || cs.display === 'none' || cs.visibility === 'hidden';
        if (!invisible) continue;
        /* An element inside a hidden ancestor is reported through that ancestor. */
        let host = el, inHidden = false;
        while (host && host !== document.body) {
          const hcs = getComputedStyle(host);
          if (hcs.display === 'none' || hcs.visibility === 'hidden') { inHidden = true; break; }
          host = host.parentElement;
        }
        out.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          cls: el.className || null,
          text: (el.textContent || '').trim().slice(0, 34) || null,
          hiddenBy: inHidden ? (host.id ? '#' + host.id : host.tagName.toLowerCase()) + (host.className ? '.' + String(host.className).split(' ').join('.') : '') : 'itself'
        });
      }
      return out;
    })()
  `);
  if (!hidden.length) {
    console.log('  nothing hidden');
  } else {
    for (const h of hidden) {
      console.log(`  <${h.tag}${h.id ? ' #' + h.id : ''}${h.cls ? ' class="' + h.cls + '"' : ''}>` +
        `${h.text ? '  "' + h.text + '"' : ''}   hidden by: ${h.hiddenBy}`);
    }
  }

  /* And the reverse: what has real area, in order, as a quick shape summary. */
  console.log('\n== what occupies the page (top level, by area) ==');
  console.log(JSON.stringify(await evaluate(`
    [...document.body.querySelectorAll('*')].filter(el => {
      const b = el.getBoundingClientRect();
      return b.width > 40 && b.height > 12 && b.top < 2000;
    }).slice(0, 14).map(el => {
      const b = el.getBoundingClientRect();
      const label = el.id ? '#' + el.id : (el.className ? '.' + String(el.className).split(' ')[0] : el.tagName.toLowerCase());
      return label + '  ' + Math.round(b.width) + 'x' + Math.round(b.height);
    })
  `), null, 2));

  ws.close();
} finally {
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp */ }
}