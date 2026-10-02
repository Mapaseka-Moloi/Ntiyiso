#!/usr/bin/env node
/** One-off: print the full stack of every uncaught error on one page. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:5199').replace(/\/+$/, '');
const ROUTE = process.argv[3] || '/app/check';
const SEEDS = {
  none: {},
  customer: { 'ntiyiso.session.v1': { role: 'customer', name: 'Test User', email: 't@e.com' } },
  staff: { 'ntiyiso.session.v1': { role: 'staff', name: 'Sibongile Dlamini', email: 's@mukuru.com' } },
};
const SEED = SEEDS[process.argv[4] || 'none'] || SEEDS.none;
const PORT = 9333;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'ntiyiso-diag-'));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

try {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('--- uncaught exception ---');
      console.log(d.exception?.description || d.text);
      console.log('frames:');
      for (const f of d.stackTrace?.callFrames || []) {
        console.log(`  ${f.functionName || '(anonymous)'}  ${f.url}:${f.lineNumber + 1}`);
      }
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      console.log('--- console.error ---');
      console.log(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });
  const send = (method, params = {}) => {
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise((r) => pending.set(n, r));
  };

  await send('Runtime.enable');
  await send('Page.enable');
  if (Object.keys(SEED).length) {
    const calls = Object.entries(SEED)
      .map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`)
      .join('');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.clear();${calls}}catch(e){}`,
    });
  }
  console.log(`GET ${BASE}${ROUTE}  seed=${JSON.stringify(SEED)}`);
  await send('Page.navigate', { url: BASE + ROUTE });
  await sleep(1600);
  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      path: location.pathname,
      title: document.title,
      stored: localStorage.getItem('ntiyiso.session.v1'),
      nodes: document.querySelectorAll('main .view.on, .auth, #custScreen').length
    })`,
    returnByValue: true,
  });
  console.log('final: ' + probe.result.value);
  ws.close();
} finally {
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp */ }
}
