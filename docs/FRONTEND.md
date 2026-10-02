# Frontend — Ntiyiso Scam Shield

The screens, the verdict UX, and how the app behaves on a cheap phone with a bad
signal.

> **Status.** Everything described here exists and runs.

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [Running it](#2-running-it)
3. [Structure](#3-structure)
4. [Screens](#4-screens)
5. [Verdict screen specification](#5-verdict-screen-specification)
6. [State](#6-state)
7. [Talking to the API](#7-talking-to-the-api)
8. [Accessibility](#8-accessibility)
9. [i18n](#9-i18n)
10. [PWA](#10-pwa)
11. [Design tokens](#11-design-tokens)
12. [Testing](#12-testing)
13. [Rules for changing this](#13-rules-for-changing-this)

---

## 1. What this is

Plain HTML, CSS and JavaScript. No framework, no bundler, no dependencies, no
build step to install anything.

That is not asceticism. The people most likely to be targeted by a remittance
scam are the people with the oldest, cheapest phones, and the brief asks for
something that works on one. A framework earns its place by removing more
complexity than it adds; at this size, on a phone on a weak connection, it does
not.

Everything is a **real document at a clean URL**. `/app/settings` is a file.
There is no client-side router pretending otherwise, so the back button works,
a link can be shared or bookmarked, and a refresh mid-check does not lose the
screen.

## 2. Running it

```bash
node serve/server.mjs            # http://localhost:5173
node serve/server.mjs --port 8080
```

No install step. That is the whole setup.

To run the API alongside it — optional, and the app works without it:

```bash
python -m backend     # http://localhost:8000/api/v1
```

The root `/` is only a front door: it sends you to `/app/check` if this device
has a session, and to `/auth/login` if it does not.

## 3. Structure

```
app/        the nine customer screens
auth/       login/ signup/
desk/       the six fraud-desk screens, plus its own login
shared/
  css/      base, customer, auth, desk
  js/       customer.js, desk.js
assets/     logo and the PWA icons
manifest.webmanifest
sw.js       the service worker
serve/      the dev server
tools/      the generators and the checks
build/      monolith.html — the original single file, the source of truth
```

Every folder under `app/`, `auth/` and `desk/` holds exactly three files:
`index.html`, `styles.css`, `script.js`. Nothing else, so a screen can be read
in one go.

The two shared libraries hold everything more than one screen needs, which is
what keeps the per-screen files small:

| File | Size | Holds |
|---|---|---|
| `shared/js/customer.js` | ~99 kB | Engine, API client, i18n, all nine screens, wiring |
| `shared/js/desk.js` | ~93 kB | The fraud-desk console |
| `shared/css/customer.css` | ~14 kB | Customer design tokens and components |
| `shared/css/desk.css` | ~23 kB | Desk tokens and components |

The whole site is **392 kB of markup, CSS and JavaScript across 57 files** — about
100 kB of it on the customer's check screen. The heaviest single asset is the
fraud desk, which is not the thing being judged on a phone.

### Generated, not hand-edited

`build/monolith.html` is the original merged build, and `tools/` slices it into
everything else:

| Script | Does |
|---|---|
| `extract.py` | slices the monolith into CSS, JS and markup under `build/extracted/` |
| `split_css.py` | writes the shared palettes and per-feature `styles.css` |
| `build_customer_js.py` | writes `shared/js/customer.js` |
| `build_desk_js.py` | writes `shared/js/desk.js` |
| `build_pages.py` | writes all 18 page documents and their `script.js` files |

Every generated file carries a banner saying so. **Edit the tools or the
monolith, never the output.** `python tools/check_all.py --rebuild` regenerates
and re-verifies the lot.

`extract.py` locates each block by a content anchor and verifies the slice
contains known markers before writing it. It used to trust hardcoded line
numbers, and when those went stale the customer bundle was silently truncated at
the end — the failure surfaced much later as a "patch target not found" in a
different script, naming a line that had nothing to do with the cause.

## 4. Screens

### Customer

| Screen | Path | What it does |
|---|---|---|
| Check | `/app/check` | Paste a message or a link. The front door. |
| Check a payment | `/app/send` | Who, how much, and why — before releasing it |
| Checking | `/app/checking` | The in-between state. Its own document, because the wait is real |
| Verdict | `/app/verdict` | The answer |
| Library | `/app/library` | The common scams |
| Scam detail | `/app/scam/{id}` | One scam: how it works, and what to do |
| Alerts | `/app/alerts` | Everything flagged for this account |
| History | `/app/history` | Every check run on this device |
| Settings | `/app/settings` | Language, text size, theme, data |

Four tabs — Check, Payment, Library, Alerts. The two in-the-middle check stages
belong to the Check tab, because leaving and returning mid-check would be
confusing.

### Auth

`/auth/signup` and `/auth/login` are separate documents because they are
different forms, not one form with a toggle. The staff code field exists on one
of them.

### Fraud desk

`/desk/login`, then `/overview` (numbers), `/live` (the feed),
`/radar` (what is spreading), `/business` (patterns by merchant),
`/case/{id}` (one report in full).

The desk is **entirely client-side against simulated data**. It makes no API
calls, and it does not need to: it demonstrates the operational view, and the
API behind it is exercised by `tools/api_check.py` rather than by a demo that
happens to be running.

## 5. Verdict screen specification

This is the screen the whole product exists to produce, so it is specified
rather than left to whoever is editing it next.

### Order, top to bottom

1. **Verdict banner.** Colour, an icon, and the word — `HIGH RISK`,
   `SUSPICIOUS` or `LOOKS GENUINE`. All three, always together. Colour alone
   fails for colour-blind users and in glare.
2. **One sentence.** `instruction`, e.g. *"Do not click. Do not reply."*
3. **Why.** The reasons, each a code plus its plain sentence. Tap any one to
   hear it read aloud.
4. **The message, with the flagged phrases highlighted.** This is the part that
   turns a warning into an understanding. The customer can see *which words*
   triggered it, in their own message.
5. **What to do next.** The numbered `next_steps`.
6. **The domain, as plain text.** Never a link. Never tappable, never
   underlined, never given an `href`.
7. **Actions.** Report, warn a friend, learn more, check again.

### Rules that are not negotiable

- **A suspicious domain is never a link.** It is text. A customer who taps
  through a warning we gave them has been warned and failed anyway.
- **`looks_genuine` says "no warning signs found".** Never "safe", never "this
  is genuine". The engine did not find anything; it did not verify anything.
- **Never blame the customer.** No "you should have known". The person is under
  pressure and the scammer is not.
- **The number and the verdict must agree.** An earlier build rounded the score
  for display but decided the verdict first, so a true 0.3999 was shown as
  `0.4` beside *"no warning signs found"*. Fixed in the engine; the screen must
  never re-derive one from the other.
- **One primary action per screen.** Everything else is secondary.
- **Amber is not an alarm.** It reads as "check first", not "danger". If amber
  felt like red, people would stop noticing red.

### Grading the three verdicts

| Verdict | Colour | Reading |
|---|---|---|
| `high_risk` | Red | Do not click, do not reply, do not pay |
| `suspicious` | Amber | Do not act yet; check directly |
| `looks_genuine` | Green | No warning signs found |

## 6. State

| Where | What | Why |
|---|---|---|
| `localStorage` | Session, settings, scam library read-marks | Survives a restart on the device that matters |
| `sessionStorage` | The text being checked, the in-flight result | A check crosses three page loads; a module variable would be gone by the second one |
| The API | History, reports, feedback, account context | Anything another device should see |

The split between `localStorage` and `sessionStorage` is deliberate. A check that
refreshes must not lose the message. A session that survives the browser closing
should not, because that is how two people end up sharing a device believing they
are both signed in.

## 7. Talking to the API

The client calls `http://localhost:8000/api/v1` by default.

**If the API is not there, the app still works.** `apiRequest()` catches the
failure and returns `NETWORK_UNAVAILABLE`; `checkMessage()` then runs the engine
that is already in the bundle, with the same rules, and marks
`debug.offline: true`.

This is not a degraded mode bolted on afterwards. It is the reason the engine is
in the browser at all, and the reason the parity harness matters: if the two
engines disagreed, the same customer would get a different warning depending on
whether their phone reached a server.

`tools/parity_check.py` runs every fixture through both and fails the build on
any difference in verdict, score, reasons, instruction, steps, highlights or
mitigators.

## 8. Accessibility

- **Colour is never the only signal.** Every verdict pairs colour with an icon
  and a word. Every highlighted phrase is a `<mark>` carrying a `data-sev`
  attribute, so the severity is readable from the markup and not only from the
  paint.
- **Text size**: normal (16px), large (18px), huge (21px). Large is the default,
  because the default was too small.
- **Theme**: light, dark, or follow the system. Set by a `data-theme` attribute
  on `<html>`, so one variable switches the whole document.
- **Voice read-out.** The verdict, the reasons and the next steps can each be
  read aloud where the browser supports it. Somebody who cannot read the screen
  quickly, or at all, still gets the whole answer. The threat model assumes an
  attacker wants someone rushed — read-aloud defeats that.
- **Focus is visible**, and tab order follows the screen.
- **Tap targets** are sized for a thumb, not a cursor.
- **Landmarks and headings** are correct, so a screen reader can navigate.

There is a check for this that is not theoretical:
`tools/check_visible.mjs` measures rendered boxes and reports every control that
is present, wired and permanently `display:none`. It exists because a sign-up
form did exactly that for months — it answered every synthetic event and no
person could ever see it.

## 9. i18n

English and isiZulu, for UI strings and for every reason, instruction and next
step. A check can be run in either, and the warning comes back in that language.

Unknown languages fall back to English rather than failing.

**The isiZulu wording is machine-drafted and has not been reviewed by a native
speaker.** It must be before any real use. This is stated in the README, in
`docs/BACKEND.md`, and in the API response itself, which carries
`language_reviewed: false` for isiZulu. Putting it in the payload means the
limitation travels with the data instead of sitting in a document nobody opens.

## 10. PWA

Installable, and the shell works with no signal.

| File | Does |
|---|---|
| `manifest.webmanifest` | Name, icons, theme colour, shortcuts to Check / Payment / Library |
| `sw.js` | Caches the app shell; **never** caches a verdict |
| `assets/icon-{192,512}.png` | Desktop and iOS |
| `assets/icon-maskable.png` | Android launcher, cropped up to 20% per edge |
| `tools/make_icons.py` | Regenerates them from the logo. Needs Pillow; nothing else does |

Registered from `build_customer_js.py`, so it ships with the bundle. Registration
failure is silent and unlogged: no service-worker support, a `file://` page and an
insecure origin are all ordinary states for a prototype, not errors worth putting
in front of a user.

**The one rule this design turns on: verdicts are never cached.** The shell is
cached; anything under `/api/` goes to the network every time and is never
stored. A remembered *"this looks fine"* is worse than no answer, because the
customer acts on it.

Offline, a check runs the local engine instead — a fresh calculation, not a
recalled one. The scam library works offline, which is the point of it: someone
confronted with a scam at eight at night needs the answer to be there.

Not implemented: an Android share target. It needs a manifest shortcut and
`shareTarget` handling, and it was cut for time.

## 11. Design tokens

CSS custom properties, declared once on `:root` at the top of
`shared/css/customer.css`.

The customer and the desk are **separate documents with separate stylesheets**, so
they do not need scoping to stay out of each other's way: a desk page never
loads `customer.css`. Each defines its own `--brand`, `--high`, `--mid`, `--low`,
and its own dark-mode overrides. They are free to diverge without one breaking
the other.

| Token group | Examples | What it controls |
|---|---|---|
| Brand | `--brand`, `--brand-hi`, `--brand-ink`, `--brand-soft` | Mukuru orange, and the tints of it |
| Ink | `--ink`, `--ink-2`, `--muted`, `--faint` | Text, at four levels of emphasis |
| Surface | `--surface`, `--surface-2`, `--canvas`, `--bar` | Planes and the translucent bar |
| Signal | `--high`, `--mid`, `--low` + `-bg`, `-line` | Red / amber / green, as foreground, background and border |
| Type | `--fs`, `--lh`, `--font`, `--mono` | The scale behind the three text sizes |
| Shape | `--r`, `--r-sm`, `--shadow` | Radius and elevation |
| Space | `--pad`, `--tap`, `--maxw`, `--rail` | Padding, minimum tap target, content width, nav rail |

Two rules, both load-bearing:

- **Signal tokens carry all three parts of a colour** — text, background and
  border. A component that picks its own red cannot go wrong in dark mode, because
  it never chooses one.
- **Never hard-code a colour or a size in a component rule.** A token, or nothing.
  The three text sizes and both themes are one attribute change on `<html>` only
  because of that rule.

`--tap: 52px` is the minimum height of anything you are meant to press, which is
larger than the 44px guideline on purpose: the people using this are often
holding a phone in one hand while holding a bag in the other.

## 12. Testing

```bash
python tools/check_all.py            # everything, in the order that fails fastest
python tools/check_all.py --rebuild  # regenerate first, then check
```

| Check | What it proves |
|---|---|
| every JavaScript file parses | No syntax errors anywhere |
| markup slices | The monolith is still cut where the builder expects |
| page structure | Unique ids, balanced tags, the right current tab, no leftovers |
| the backend imports | The API works with nothing installed |
| the fixtures | Detection quality, with false positives counted |
| parity | The two engines return the same verdict for every fixture |
| the API contract | 54 assertions, against both server implementations |
| every route and asset resolves | Nothing 404s |
| no JavaScript error on any page | Every page runs in a real browser |
| the flows that cross documents | Sign-up, sign-in, running a check, walking the desk |
| nothing a person needs is invisible | No present-but-unreachable controls |

The last three drive headless Chrome over the DevTools protocol, so they need
Chrome or Edge installed and nothing else.

```bash
python tools/check_pages.py
node  tools/browser_check.mjs  http://localhost:5199
node  tools/flow_check.mjs    http://localhost:5199
node  tools/check_visible.mjs http://localhost:5199
node  tools/diag_errors.mjs   http://localhost:5199 /app/check customer
```

`diag_errors.mjs` takes a route and a seed (`none`, `customer`, `staff`) and
prints the full stack of anything that throws — the quickest way to debug a page
that comes up blank.

## 13. Rules for changing this

**Edit the monolith or the tools, never a generated file.** Every page and bundle
carries a banner saying it was generated, and the next person to run the
generators will overwrite your change.

**Keep monolith edits line-count neutral.** `extract.py` and
`build_customer_js.py` find code by line range, so a change that adds a line
shifts everything below it and breaks the build with a confusing error. If you
add a comment inside the monolith, take a line out elsewhere. The reason is
recorded here because it cost an hour to rediscover.

**Add a fixture with every detection change.** `backend/fixtures/cases.json` —
one case that should fire, and one that must not. `check_all.py` runs it, and
`parity_check.py` fails if you changed one engine and not the other.

**Do not make a warning louder without adding a case.** The engine is tuned for
false positives, not catches. A change that makes more things red is a claim that
more scams are caught, and the only evidence for it is a case that was missed
yesterday.

**Run `check_all.py` before committing.** It is fast, and it catches the class of
problem that otherwise reaches a demo.
