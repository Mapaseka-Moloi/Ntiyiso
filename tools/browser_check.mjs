#!/usr/bin/env node
/**
 * Run every page in a real browser and report JavaScript errors.
 *
 * The static checks in tools/check_pages.py prove the markup and the links are
 * right; this proves the bundles actually execute. A page whose script throws
 * half way through renders a blank screen and still returns HTTP 200, so the
 * only way to catch it is to run it.
 *
 * Chrome is driven over the DevTools protocol using Node's built-in WebSocket,
 * so there is nothing to install.
 *
 *   chrome --headless --remote-debugging-port=9222
 *   node tools/browser_check.mjs http://localhost:5199
 *
 * The pages are checked in three passes because one localStorage key decides
 * which of the two apps is reachable:
 *   customer session -> the nine /app screens and the root front door
 *   no session       -> the two /auth screens
 *   staff session    -> the six /desk screens
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/+$/, '');
const PORT = 9222;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

if (!CHROME) {
  console.error('no Chrome or Edge found');
  process.exit(2);
}

const SESSION = { role: 'staff', name: 'Sibongile Dlamini', email: 'sibongile@mukuru.com' };

/* Each pass seeds localStorage before any page script runs, then checks the
   pages that should be reachable under that session. A page is listed with the
   path it is expected to finish on when it is meant to bounce, because several
   of these have no session behind them by definition: /app/verdict with nothing
   checked, or /app/checking with nothing pending, would otherwise sit on a
   screen with nothing to show. */
const PASSES = [
  {
    name: 'customer session',
    seed: { 'ntiyiso.session.v1': { ...SESSION, role: 'customer' } },
    pages: [
      ['/', 'the front door', '/app/check'],
      ['/app/check', 'the check screen'],
      ['/app/send', 'the payment screen'],
      ['/app/library', 'the library screen'],
      ['/app/alerts', 'the alerts screen'],
      ['/app/checking', 'the waiting screen', '/app/check'],
      ['/app/verdict', 'the verdict screen', '/app/check'],
      ['/app/history', 'the history screen'],
      ['/app/settings', 'the settings screen'],
      ['/app/scam', 'the scam detail screen'],
    ],
  },
  {
    name: 'no session',
    seed: {},
    pages: [
      ['/auth/login', 'the sign-in form'],
      ['/auth/signup', 'the sign-up form'],
      ['/desk/login', 'the desk sign-in screen'],
      ['/app/check', 'the check screen, bouncing to sign-in', '/auth/login'],
    ],
  },
  {
    name: 'staff session',
    seed: { 'ntiyiso.session.v1': SESSION },
    pages: [
      ['/desk/overview', 'the desk overview'],
      ['/desk/live', 'the live cockpit'],
      ['/desk/radar', 'the threat radar'],
      ['/desk/business', 'the business case'],
      ['/desk/case', 'the case study'],
      ['/desk/login', 'the desk sign-in screen, bouncing to the desk', '/desk/overview'],
    ],
  },
];

/* ── DevTools plumbing ──────────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome did not expose a debugging endpoint');
}

class Tab {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 20000);
    });
  }
  /* Errors worth failing a page over: uncaught exceptions and console.error. */
  errors() {
    const out = [];
    for (const e of this.events) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails;
        out.push(`uncaught: ${d.exception?.description || d.text}`.split('\n')[0]);
      }
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        out.push('console.error: ' + e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
      }
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
        const t = e.params.entry.text;
        /* A failed favicon or source map is noise, not a page defect. */
        if (!/favicon/.test(t)) out.push('log: ' + t.split('\n')[0]);
      }
    }
    return out;
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

async function openTab(url) {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  return { tab: new Tab(ws), id: target.id };
}

async function closeTab(id) {
  await fetch(`http://127.0.0.1:${PORT}/json/close/${id}`);
}

/* localStorage has to be seeded before the first page script runs. The keys
   have to be set one by one: handing localStorage to Object.assign would copy
   the string's character indices, not the entry. */
function seedScript(seed) {
  const calls = Object.entries(seed)
    .map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`)
    .join('\n');
  // Storage is shared by every tab in the profile, so each pass starts from a
  // clean slate or the previous pass's session would leak into it.
  return `try{localStorage.clear();${calls}}catch(e){}`;
}

/* ── the check ──────────────────────────────────────────────────────────── */
/* Did the bundle actually paint something? Each app mounts into a container,
   so an empty container means the script died before rendering. */
const PAINTED = {
  '/app': 'document.getElementById("custScreen")?.childElementCount',
  '/desk': 'document.querySelector("main .view.on")?.childElementCount',
  /* The auth documents open on step one; the form is behind the role picker. */
  '/auth': 'document.getElementById("rolePicker")?.childElementCount',
  '/desk/login': 'document.getElementById("rolePick")?.childElementCount',
};

async function checkPage(route, seed) {
  const { tab, id } = await openTab('about:blank');
  try {
    await tab.send('Runtime.enable');
    await tab.send('Log.enable');
    await tab.send('Page.enable');
    if (Object.keys(seed).length) {
      await tab.send('Page.addScriptToEvaluateOnNewDocument', {
        source: seedScript(seed),
      });
    } else {
      await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript({}) });
    }
    await tab.send('Page.navigate', { url: BASE + route });
    await sleep(1400);

    const where = tab.events.some((e) => e.method === 'Page.navigatedWithinDocument')
      || (await tab.evaluate('location.pathname')) !== route;
    const href = await tab.evaluate('location.pathname');
    const title = await tab.evaluate('document.title');
    const root = Object.keys(PAINTED)
      .sort((a, b) => b.length - a.length)
      .find((k) => route.startsWith(k));
    const painted = root ? await tab.evaluate(PAINTED[root]) : null;
    const errors = tab.errors();

    return { route, href, title, painted, errors, redirected: where };
  } finally {
    tab.close();
    await closeTab(id);
  }
}

/* ── main ───────────────────────────────────────────────────────────────── */
const profile = mkdtempSync(join(tmpdir(), 'ntiyiso-chrome-'));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

let failures = [];
try {
  await cdpUrl();
  for (const pass of PASSES) {
    console.log(`\n== ${pass.name} ==`);
    for (const [route, what, expect] of pass.pages) {
      const r = await checkPage(route, pass.seed);
      const notes = [];
      if (r.redirected) {
        if (expect && r.href === expect) {
          notes.push(`bounced to ${r.href} as intended`);
        } else {
          notes.push(`ended up on ${r.href}`);
        }
      }
      const bounced = r.redirected && expect && r.href === expect;
      /* A bounce means the paint container of the page you asked for is not on
         screen any more, so only check the paint when the page was meant to
         stay where it is. */
      if (!bounced && r.painted !== null && !(r.painted > 0)) notes.push('nothing rendered');
      const bad = r.errors.length > 0 || (r.redirected && !bounced)
        || (!bounced && r.painted !== null && !(r.painted > 0));
      if (bad) failures.push(`${route}: ${[...r.errors, ...notes].join(' | ')}`);
      console.log(
        `${bad ? 'FAIL' : 'ok  '} ${route.padEnd(16)} ${String(r.painted ?? '-').padStart(4)} nodes  ` +
        `${r.title.slice(0, 38).padEnd(38)} ${what}${notes.length ? '  (' + notes.join('; ') + ')' : ''}`
      );
      for (const e of r.errors) console.log(`       ${e}`);
    }
  }
} catch (err) {
  console.error(err.message);
  failures.push(String(err.message));
} finally {
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir */ }
}

console.log();
if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('every page rendered with no JavaScript errors');
