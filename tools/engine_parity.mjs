#!/usr/bin/env node
/**
 * Run the browser engine under Node and print verdicts as JSON.
 *
 * The parity harness (tools/eval_fixtures.py) shells out to this. The point is
 * that the rules live in two places — the browser bundle and the Python engine —
 * and that "same rules, same answer" is a checkable claim rather than a hope.
 *
 * `shared/js/customer.js` is written for a browser, so this provides just enough
 * of a browser for it to load: a window, a document whose elements come back
 * inert, and storage. Nothing is rendered and nothing is fetched — `fetch` is
 * deliberately rejected so the engine's own offline path runs, which is the same
 * code path the app uses when the API is unreachable.
 *
 * Usage:  node tools/engine_parity.mjs < cases.json
 *         (reads {"kind","input",...} lines on stdin, writes one JSON per line)
 */
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, '..', 'shared', 'js', 'customer.js');

// ── a browser, roughly ───────────────────────────────────────────────────────
const noop = () => {};
function makeElement(id = '') {
  const element = {
    id,
    dataset: {},
    style: {},
    children: [],
    attributes: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop,
    getAttribute: () => null,
    removeAttribute: noop,
    appendChild(child) { this.children.push(child); return child; },
    removeChild: noop,
    insertAdjacentHTML: noop,
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: noop,
    blur: noop,
    scrollIntoView: noop,
    click: noop,
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
  };
  return element;
}

const elements = new Map();
const documentStub = {
  readyState: 'complete',
  documentElement: makeElement('html'),
  body: makeElement('body'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => makeElement(tag),
  addEventListener: noop,
  removeEventListener: noop,
};

const storageStub = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
};

// Some of these are getter-only globals on modern Node (navigator in
// particular), so plain assignment is not enough — define them instead.
function define(name, value) {
  Object.defineProperty(globalThis, name, {
    value, writable: true, configurable: true, enumerable: false,
  });
}

define('window', globalThis);
define('document', documentStub);
define('localStorage', storageStub());
define('sessionStorage', storageStub());
define('navigator', { language: 'en-ZA', languages: ['en-ZA'], userAgent: 'node', onLine: true });
define('location', { origin: 'http://localhost', href: 'http://localhost/app/check', pathname: '/app/check' });
define('history', { pushState: noop, replaceState: noop, back: noop });
define('matchMedia', () => ({ matches: false, addEventListener: noop, removeEventListener: noop }));
define('addEventListener', noop);
define('removeEventListener', noop);
define('requestAnimationFrame', (fn) => setTimeout(fn, 0));
define('cancelAnimationFrame', clearTimeout);
define('getComputedStyle', () => ({ getPropertyValue: () => '' }));
define('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
define('MutationObserver', class { observe() {} disconnect() {} });

// Force the engine's own path: any fetch rejects, which is exactly how the app
// behaves offline. checkMessage() catches it and falls back internally.
define('fetch', () => Promise.reject(new Error('offline: parity harness')));

// Pin the clock. The transaction rules look at a rolling hour of send history,
// so without this the browser engine would answer "is this within the last
// hour?" about real time while the Python engine answers it about the fixture's
// fixed now — and the two would disagree for reasons that have nothing to do
// with the rules. ISO timestamps in the input are still parsed normally;
// only "what time is it" is fixed.
if (process.env.NTIYISO_FIXED_NOW_MS) {
  const fixed = Number(process.env.NTIYISO_FIXED_NOW_MS);
  Date.now = () => fixed;
}

eval(readFileSync(BUNDLE, 'utf8'));

const cust = globalThis.window.NT && globalThis.window.NT.cust;
if (!cust) {
  console.error('parity: the bundle did not expose window.NT.cust');
  process.exit(2);
}

// ── run the requests on stdin ────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  const text = line.trim();
  if (!text) return;
  const job = JSON.parse(text);
  const { kind, id } = job;
  let result;
  try {
    if (kind === 'message') {
      result = await cust.checkMessage(job.text, job.language || 'en');
    } else if (kind === 'link') {
      result = await cust.checkLink(job.url, job.language || 'en');
    } else if (kind === 'transaction') {
      result = await cust.checkTransaction(job.payment, job.context || {});
    } else {
      throw new Error(`unknown kind ${kind}`);
    }
  } catch (error) {
    console.log(JSON.stringify({ id, error: String(error && error.message || error) }));
    return;
  }
  // Only the fields both engines are meant to agree on. Ids and timestamps are
  // generated independently and are excluded by design.
  console.log(JSON.stringify({
    id,
    verdict: result.verdict,
    score: result.score,
    confidence: result.confidence,
    reasons: result.reasons,
    reason_text: result.reason_text,
    instruction: result.instruction,
    next_steps: result.next_steps,
    highlights: result.highlights,
    display_domains: result.display_domains,
    learn_more: result.learn_more,
    language: result.language,
    cooling_off_seconds: result.cooling_off_seconds === undefined ? null : result.cooling_off_seconds,
    debug: {
      codes: (result.debug.signals || []).map((s) => s.code),
      corroboration_met: result.debug.corroboration_met,
      mitigators_applied: result.debug.mitigators_applied,
    },
  }));
});

rl.on('close', () => process.exit(0));