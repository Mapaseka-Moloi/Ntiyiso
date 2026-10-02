#!/usr/bin/env node
/**
 * Walk the flows that had to change shape when the site was split.
 *
 * The single-file build did everything in one document: a check ran in
 * JavaScript and the verdict appeared on the same page. After the split,
 * /app/check, /app/checking and /app/verdict are three documents and the work
 * in progress has to survive the navigation. That hand-off is the one piece of
 * this restructure that a page-load test cannot prove, so it gets clicked
 * through here.
 *
 *   node serve/server.mjs --port 5199
 *   node tools/flow_check.mjs http://localhost:5199
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/+$/, '');
const PORT = 9223;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const steps = [];
let failed = 0;
function check(ok, label, detail) {
  steps.push({ ok, label, detail });
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        this.errors.push((d.exception?.description || d.text).split('\n')[0]);
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        this.errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(method + ' timed out')); }, 20000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async goto(path) {
    this.errors = [];
    await this.send('Page.navigate', { url: BASE + path });
    /* Wait for the document rather than guessing with a sleep. Every page now
     * registers a service worker on load, and this check runs alongside three
     * other browser scripts, so a fixed 1200ms is a race that wins on an idle
     * laptop and loses under load - and when it loses, the field below is simply
     * not in the DOM yet and the flow is reported as broken. */
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        if (await this.eval('document.readyState') === 'complete') return;
      } catch { /* mid-navigation */ }
      await sleep(100);
    }
  }
  /* Wait for a condition rather than assuming the page got there. */
  async waitFor(expression, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try { if (await this.eval(expression)) return true; } catch { /* mid-navigation */ }
      if (Date.now() > deadline) return false;
      await sleep(100);
    }
  }
  get path() { return this.eval('location.pathname'); }
  /* Set a field the way a person would, so the real submit handler runs. */
  async type(sel, value) {
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return 'missing';
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
  }
  async click(sel) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return 'missing';
      el.click();
      return 'ok';
    })()`);
  }
  /* Does it have any area on screen?
   *
   * A form can be on the document, wired up and answer to a synthetic submit
   * event while being invisible, which is a form nobody can fill in. Every
   * assertion about a control being usable goes through here first.
   */
  async shown(sel) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return 'missing';
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 'display:none';
      if (b.width < 2 || b.height < 2) return 'no area';
      return 'ok';
    })()`);
  }
  /* Click a form's submit button the way a person would. Programmatic clicks
   * fire whether or not the control is on screen, so pair this with shown(). */
  async submit(formSel, btnSel) {
    const state = await this.shown(btnSel);
    if (state !== 'ok') return `button ${btnSel}: ${state}`;
    const clicked = await this.click(btnSel);
    return clicked === 'ok' ? 'ok' : `button ${btnSel}: ${clicked}`;
  }
}

async function newPage() {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const p = new Page(ws);
  await p.send('Runtime.enable');
  await p.send('Page.enable');
  return p;
}

/* Storage is cleared once, here. Doing it on every new document would wipe the
   very state these flows are meant to create, because signing up writes a
   session and then navigates. */
async function resetStorage(p) {
  await p.goto('/auth/login');
  await p.eval('localStorage.clear(); sessionStorage.clear();');
}

const profile = mkdtempSync(join(tmpdir(), 'ntiyiso-flow-'));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const p = await newPage();
  await resetStorage(p);

  /* ── 1. sign up, and land in the app ─────────────────────────────────── */
  await p.goto('/auth/signup');
  const atSignup = await p.path;
  check(atSignup === '/auth/signup', 'the sign-up page stays put', atSignup);
  check(await p.eval(`!!document.getElementById('formSignup')`),
    'the sign-up form is on the document');
  check(await p.eval(`(() => {
      const b = document.querySelector('img.lockup').getBoundingClientRect();
      return Math.round(Math.min(b.width, b.height));
    })() >= 100`),
    'the logo is a hero, not an icon', await p.eval(
      `(() => { const b = document.querySelector('img.lockup').getBoundingClientRect();
         return Math.round(b.width) + 'x' + Math.round(b.height); })()`));
  const picked = await p.click('[data-role="customer"]');
  check(picked === 'ok', 'the role picker is on the document', picked);
  await sleep(300);
  /* The form sits behind the role choice. It has to be visible on the far side
   * of it, not merely present - that is what makes it fillable. */
  check(await p.shown('#formSignup') === 'ok',
    'the sign-up form is visible after picking a role', await p.shown('#formSignup'));
  await p.type('#suName', 'Thandi Mokoena');
  await p.type('#suPhone', '0821234567');
  await p.type('#suEmail', 'thandi@example.co.za');
  await p.type('#suPass', 'correct-horse');
  const suBtn = await p.shown('#formSignup button[type="submit"]');
  check(suBtn === 'ok', 'the Create account button is on screen', suBtn);
  await p.submit('#formSignup', '#formSignup button[type="submit"]');
  await sleep(1200);
  check(await p.path === '/app/check', 'sign-up lands on /app/check', await p.path);
  check(
    await p.eval(`!!JSON.parse(localStorage.getItem('ntiyiso.session.v1') || 'null')?.email`),
    'a session was written to storage',
    await p.eval(`document.getElementById('authNote')?.textContent || ''`)
  );

  /* ── 2. run a check across three documents ───────────────────────────── */
  await p.goto('/app/check');
  await p.type('#msgInput', 'Your account is suspended. Send R5000 to this WhatsApp to reactivate: https://wa.me/27123456789');
  const clicked = await p.click('#btnCheck');
  check(clicked === 'ok', 'the check screen is mounted with its button', clicked);
  await sleep(600);
  const landed = await p.path;
  check(landed === '/app/checking' || landed === '/app/verdict',
    'the check hands off to /app/checking or /app/verdict', landed);

  /* /app/checking finishes the work and moves on by itself. */
  if (landed === '/app/checking') {
    for (let i = 0; i < 20 && await p.path !== '/app/verdict'; i++) await sleep(500);
    check(await p.path === '/app/verdict', '/app/checking finishes at /app/verdict', await p.path);
  }
  const verdictText = await p.eval(
    `document.getElementById('verdictWord')?.textContent
     || document.querySelector('#custScreen .verdict .word')?.textContent || ''`);
  check(verdictText.length > 0, 'a verdict is on screen', JSON.stringify(verdictText));

  /* ── 3. the verdict screen is its own document and the tabs are links ── */
  const hrefs = await p.eval(
    `[...document.querySelectorAll('.tabbar a')].map(a => a.getAttribute('href'))`);
  check(hrefs.length === 4 && hrefs.every((h) => h?.startsWith('/app/')),
    'the tab bar is four root-absolute links', JSON.stringify(hrefs));
  await p.eval(`[...document.querySelectorAll('.tabbar a')].find(a => a.getAttribute('href') === '/app/library').click()`);
  await sleep(1200);
  check(await p.path === '/app/library', 'clicking a tab navigates', await p.path);

  /* ── 4. the app bar gear is a link, and the verdict survives a round trip */
  await p.goto('/app/settings');
  const gear = await p.eval(`document.getElementById('custSettings')?.getAttribute('href') || ''`);
  check(gear === '/app/settings', 'the settings gear is a real link', gear);
  const backToVerdict = await p.eval(
    `JSON.parse(sessionStorage.getItem('ntiyiso.transient.v1') || 'null')?.current?.verdict || ''`);
  check(backToVerdict.length > 0, 'the last check is still reachable after navigating', backToVerdict);

  /* ── 5. signing out and signing back in again ───────────────────────── */
  /* Sign-up alone would not catch a login form that cannot be filled in, so the
   * round trip is walked: end the session, then sign in with the account made
   * in step 1. */
  await p.goto('/app/settings');
  check(await p.shown('#custExit') === 'ok',
    'the app bar offers a sign-out', await p.shown('#custExit'));
  await p.click('#custExit');
  await sleep(1200);
  check(await p.path === '/auth/login', 'signing out returns to /auth/login', await p.path);
  await p.click('[data-role="customer"]');
  await sleep(300);
  check(await p.shown('#formSignin') === 'ok',
    'the sign-in form is visible after picking a role', await p.shown('#formSignin'));
  await p.type('#siEmail', 'thandi@example.co.za');
  await p.type('#siPass', 'correct-horse');
  const siBtn = await p.shown('#formSignin button[type="submit"]');
  check(siBtn === 'ok', 'the Sign in button is on screen', siBtn);
  await p.submit('#formSignin', '#formSignin button[type="submit"]');
  await sleep(1200);
  check(await p.path === '/app/check', 'signing in lands on /app/check',
    `${await p.path}${await p.eval(`document.getElementById('authNote')?.textContent || ''`)}`);

  /* ── 6. the fraud desk signs in and walks its rail ───────────────────── */
  await p.goto('/desk/login');
  check(await p.shown('.login-brand .mark img') === 'ok',
    'the desk sign-in shows its brand', await p.shown('.login-brand .mark img'));
  await p.click('#deskAuthTabs button[data-auth="signup"]');
  await sleep(200);
  check(await p.eval(`document.getElementById('signupForm').style.display !== 'none'`),
    'the desk tabs swap to the sign-up form');
  check(await p.shown('#signupForm') === 'ok',
    'the desk sign-up form is visible once its tab is chosen', await p.shown('#signupForm'));
  await p.type('#signupName', 'Sibongile Dlamini');
  await p.type('#signupEmail', 'sibongile@mukuru.com');
  await p.type('#signupPass', 'desk-secret-1');
  await p.type('#signupPass2', 'desk-secret-1');
  const hasCode = await p.eval(`!!document.getElementById('staffCode')`);
  if (hasCode) await p.type('#staffCode', 'MUK-DESK-2026');
  check(await p.submit('#signupForm', '#signupForm button[type="submit"]') === 'ok',
    'the desk Create account button can be pressed');
  await sleep(1200);
  const deskNote = await p.eval(`document.getElementById('deskAuthNote')?.textContent || ''`);
  check(await p.path === '/desk/overview', 'desk sign-up lands on /desk/overview',
    `${await p.path}${deskNote ? ' — ' + deskNote : ''}`);

  const rail = await p.eval(`[...document.querySelectorAll('nav#navTabs a')].map(a => a.getAttribute('href'))`);
  check(rail.length === 5 && rail.every((h) => h?.startsWith('/desk/')),
    'the rail is five root-absolute links', JSON.stringify(rail));
  await p.eval(`[...document.querySelectorAll('nav#navTabs a')].find(a => a.getAttribute('href') === '/desk/live').click()`);
  await sleep(1500);
  check(await p.path === '/desk/live', 'clicking the rail navigates', await p.path);
  check((await p.eval(`document.querySelectorAll('main .view.on').length`)) === 1,
    'the live view is the one showing');

  /* ── 7. no errors anywhere along the way ─────────────────────────────── */
  check(p.errors.length === 0, 'no JavaScript errors during the flows', p.errors.join(' | '));
} catch (err) {
  check(false, 'the run completed', err.message);
} finally {
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir */ }
}

console.log();
console.log(`${steps.length - failed}/${steps.length} flow checks passed`);
process.exit(failed ? 1 : 0);
