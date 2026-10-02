# Backend — Ntiyiso Scam Shield

The detection engine, the API that serves it, the data it keeps, and how both are
tested.

> **Status.** Everything described here exists and runs. Section 18 describes
> what would come next, not what is there.

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [Running it](#2-running-it)
3. [Layout](#3-layout)
4. [One engine, two implementations](#4-one-engine-two-implementations)
5. [Signals](#5-signals)
6. [Verdict engine](#6-verdict-engine)
7. [API reference](#7-api-reference)
8. [Data model](#8-data-model)
9. [Privacy](#9-privacy)
10. [Languages](#10-languages)
11. [Inbound: forwarding a message](#11-inbound-forwarding-a-message)
12. [Limits and abuse protection](#12-limits-and-abuse-protection)
13. [Evaluation](#13-evaluation)
14. [Testing](#14-testing)
15. [Configuration](#15-configuration)
16. [Adding a rule](#16-adding-a-rule)
17. [Build plan](#17-build-plan)
18. [Beyond the prototype](#18-beyond-the-prototype)

---

## 1. What this is

A stateless HTTP service that answers one question three ways:

| Endpoint | Asks | Needs |
|---|---|---|
| `POST /check/message` | "Is this message a scam?" | The text |
| `POST /check/link` | "Is this address safe?" | The URL |
| `POST /check/transaction` | "Should I send this money?" | Who, how much, and the stated reason |

It answers with a **verdict**, a **score**, the **reasons** in plain language, and
**what to do next**. It never opens a link, never fetches anything, and never
calls out to a third party. That is a deliberate constraint, not a missing
feature: see section 18.

It also keeps enough state to be useful — check history, a report queue for the
fraud desk, and the account context the payment rules need (have I paid this
person before, have I just been warned about something).

## 2. Running it

Two servers, one contract.

```bash
# No dependencies. Standard library only. This is the one to run.
python -m backend --standalone

# With FastAPI, if you have it. Same routes, same bodies, same errors.
pip install -r backend/requirements.txt
python -m backend

python -m backend --help          # --host --port --standalone --reload
```

Both default to port 8000 and serve the API under `/api/v1`. With FastAPI you
also get interactive docs at `/docs`.

The stdlib server exists because a demo that needs `pip install` is a demo that
fails in a room with bad wifi. Both are checked against the same 54-point
contract test on every run, so neither can quietly drift.

## 3. Layout

```
backend/
├── __main__.py        entry point; prefers FastAPI, falls back to stdlib
├── app.py             the FastAPI application
├── standalone.py      the same API with no dependencies
├── engine/            the detection rules — no HTTP, no storage, pure functions
│   ├── patterns.py    the message rules (regex → weight → critical?)
│   ├── signals.py     link analysis and transaction analysis
│   └── verdict.py     fusion, corroboration, mitigators, result assembly
├── i18n.py            reason, instruction and step text per language
├── config.py          every threshold and list, in one place
├── store.py           SQLite: checks, reports, feedback, demo account context
├── routes/
│   └── whatsapp.py    inbound: check a forwarded message, reply in plain text
├── fixtures/
│   └── cases.json     38 labelled cases, scams and genuine alike
└── requirements.txt   optional; only for the FastAPI path
```

`engine/` imports nothing from the rest of the package. It takes a string, a URL
or a payment and returns a dictionary. That is what makes it straightforward to
run in a test, in the parity harness, or on its own.

## 4. One engine, two implementations

**The rules exist twice.** Once in `shared/js/customer.js`, which the browser
runs, and once in `backend/engine/`, which the API runs.

They are separate transcriptions, because a browser cannot import a Python file
and an API should not need a bundler. Two transcriptions of one specification is
eventually two engines, and "they agree" stops being true the moment somebody
edits one side.

So it is checked rather than assumed. `tools/parity_check.py` runs all 38
fixtures through the browser engine under Node and through the Python engine and
compares verdict, score, confidence, reasons, reason text, instruction, next
steps, highlights, display domains and every policy mitigator. Any difference is
a build failure.

```
cases compared      38
agreements          38
disagreements       0
```

The two engines being interchangeable is what makes the client safe to fall back
to its own when the API is unreachable: a customer sees the same warning either
way.

This is not theoretical. It caught four real defects:

| Found by | Defect |
|---|---|
| Parity | The client decided the verdict on the *unrounded* score, so a true 0.3999 was shown as `0.4` next to **"no warning signs found"**. |
| Parity | An allowlist test compared `lastIndexOf(...)` against an index that is `-1` when the strings are the same length, so `xn--mukuru-3we.com` matched `standardbank.co.za` and was declared official. |
| Parity | A domain matched the allowlist by its last two labels, so the genuine `www.sassa.gov.za` reduced to `gov.za`, matched nothing, and came back **RED** as a subdomain trick. |
| Contract | FastAPI accepted any string as a report status and wrote it to the database; the stdlib server rejected it. |

`RULES_VERSION` (`rules-1.0.1`) is bumped whenever a weight changes, so a verdict
recorded by an older client can be told apart from a current one.

## 5. Signals

A signal is one observation with a weight. Weights are "how much this single
thing is worth on its own", from 0 to 1. They are probabilities of a sort, but
they are chosen by hand and can be argued with — which is the point.

### Message rules

| Code | Weight | Critical | Looks for |
|---|---|---|---|
| `ASKS_FOR_CREDENTIALS` | 0.85 | yes | PIN, OTP, password, "confirm your details" |
| `UPFRONT_FEE` | 0.80 | yes | A fee to release a job, prize, loan or grant |
| `ROMANCE_MONEY_REQUEST` | 0.60 | yes | Money from someone met online |
| `ACCOUNT_THREAT` | 0.50 | no | "Your account is blocked", "verify now" |
| `UNTRACEABLE_PAYMENT` | 0.50 | no | Gift cards, crypto, "to my personal wallet" |
| `BRAND_IMPERSONATION` | 0.45 | no | Claims to be Mukuru, a bank or a government office |
| `SECRECY` | 0.40 | no | "Don't tell anyone", "keep this between us" |
| `PRIZE_OR_REFUND` | 0.35 | no | An unexpected prize or refund |
| `TOO_GOOD_JOB_OFFER` | 0.35 | no | High pay, no experience needed, immediate start |
| `URGENCY` | 0.25 | no | "Today", "right now", "before it's gone" |
| `MOVE_TO_PRIVATE_CHAT` | 0.20 | no | "WhatsApp me", "DM me" |

**Negation is handled before a rule can fire.** "Mukuru will never ask for your
PIN" contains the phrase `ask for your PIN`, and without this it would be a red
warning on the bank's own advice. For negatable rules, the **30 characters before
the match** are checked for `never`, `don't`, `do not`, `will not`, `won't`, `no
one`, and the isiZulu equivalent. The window is anchored at its end, so it only
considers text immediately preceding the sign.

It holds up on the cases that matter:

| Message | Verdict |
|---|---|
| `Mukuru will never ask for your PIN or OTP.` | looks genuine |
| `We will never accept a PIN over the phone.` | looks genuine |
| `Please send me your PIN.` | **high risk** |

It has one known blind spot, and it is on the *safe* side: a denial that quotes
the scam clears the whole sentence, including the quoted part. `It is not true
that they never ask for your PIN` comes back clean, even though the quoted phrase
is the threat. A negation window that reaches further would fix this and would
also start clearing genuine warnings, so the trade is deliberate — and it is the
kind of edge a fixture should grow once there are real messages to test against
rather than more speculation.

### Link signals

| Code | Weight | Looks for |
|---|---|---|
| `IP_ADDRESS_URL` | 0.50 | A bare IP instead of a domain |
| `URL_SHORTENER` | 0.45 | A shortened link we cannot see through |
| `KEYWORD_STUFFING` | 0.30 | "secure-login-verify" style padding |
| `SUSPICIOUS_TLD` | 0.25 | `.xyz`, `.top`, `.click` and 18 others |
| `NOT_HTTPS` | 0.15 | No TLS |

Plus two critical signals that need a brand to compare against:

| Code | Weight | Looks for |
|---|---|---|
| `SUBDOMAIN_TRICK` | 0.70 / 0.80 | `fnb.com.secure-login.xyz` — the real name is not the end of the address |
| `LOOKALIKE_DOMAIN` | 0.70 / 0.80 | `mukuru-secure.top`, or a punycode label like `xn--mukuru-3we.com` |

The lookalike weight is 0.80 rather than 0.70 when punycode is present: a
`xn--` label is a deliberate attempt to look like something it is not, and
merely misspelling a brand is not.

`URL_SHORTENER` is 0.45 — amber — rather than near-zero, and that is a
statement about honesty rather than about risk. **We cannot resolve a shortened
link in this prototype.** So "we cannot see where this goes" is the truthful
answer, and it is what the reason says. Scoring it as clean would tell someone
they are safe on the strength of something we never looked at.

### Transaction signals

| Code | Weight | Looks for |
|---|---|---|
| `RISKY_PURPOSE_FEE` | 0.80 | The stated reason is a fee for a job, visa, prize or loan |
| `RISKY_PURPOSE_UNMET` | 0.60 | The stated reason is someone met online |
| `RECENT_RISKY_CHECK` | 0.50 | A high-risk check in the last 30 minutes, then a payment |
| `RAPID_NEW_RECIPIENTS` | 0.35 | Several sends to new people in a short window |
| `UNUSUAL_AMOUNT` | 0.30 | More than 3× the usual, or over R2,000 to a new person |
| `NEW_RECIPIENT` | 0.15 | Never sent to this person before |

`RECENT_RISKY_CHECK` is the one that catches the actual sequence a scam depends
on: *they read something to you, and then asked for money.* A check on its own is
not suspicious. A check followed immediately by a payment is.

## 6. Verdict engine

`backend/engine/verdict.py`. Five steps.

### 1. Collect

Run every applicable rule.

A **message** check runs the wording rules *and* the link rules over any URLs it
contains — the words and the link often disagree with each other, and a message
asking for a PIN with a perfectly genuine-looking link is still the threat.

A **link** check runs only the link rules. A bare URL has no wording to read, so
running the wording rules over it would find nothing and imply otherwise.

A **transaction** check runs the transaction rules, *and* the wording rules over
the free-text note. "Registration fee for the position" typed into the note field
is the same evidence as the same words pasted into the message box.

### 2. Deduplicate

One signal per code, keeping the first. A message that says "blocked" three
times is not three times as suspicious, and without this a long message would
out-score a short, blatant one purely by repetition.

### 3. Fuse — noisy-OR

```python
score = 1 - Π (1 - weight)      # over the deduplicated signals
```

Independent warning signs accumulate. A single 0.20 signal gives 0.20; two 0.50
signals give 0.75, which is red. The rule is easy to explain to a judge and easy
to reason about: *we are not adding up evidence, we are combining chances.*

### 4. Apply mitigators and check corroboration

| Mitigator | Caps at | When |
|---|---|---|
| `ALLOWLISTED_LINKS` | 0.30 | Every link is an official domain and nothing asked for a credential or a fee |
| `BRAND_MENTION_ONLY` | 0.30 | The only signal is claiming to be a known brand, with no link and nothing else |
| `CORROBORATION_NOT_MET` | 0.74 | Not enough independent evidence to justify red |

`BRAND_MENTION_ONLY` is the one that stops the engine crying wolf. A genuine
Mukuru message says "Mukuru support". A scam says "Mukuru support". Saying so is
evidence of *nothing*; only a link or a request backs the claim up. Without the
cap, the phrase alone produced an amber warning on real bank advice.

Corroboration — the bar red has to clear — is met by **either** of:

- a **critical** signal (asks for a PIN, demands a fee), or
- signals from **two or more categories**, or
- **three or more distinct signals, at least two of them weighing ≥ 0.30**.

The third clause exists because a transaction check only ever produces
transaction signals. Under the first two clauses it could never corroborate
itself, so a payment that tripped three separate transaction rules was capped as
unproven no matter how bad it looked. That was wrong in the dangerous direction.

### 5. Classify

| Score | Verdict | Instruction |
|---|---|---|
| ≥ 0.75 | `high_risk` | "Do not click. Do not reply." |
| ≥ 0.40 | `suspicious` | "Do not act yet. Check directly." |
| below | `looks_genuine` | "No warning signs found. Stay careful." |

`looks_genuine` means *no warning signs found*. It never means *safe*, and the
app never says the word.

Scores are rounded to three places **before** the verdict is decided. The client
used to round after, which is how a 0.3999 could be displayed as `0.4` beside
"no warning signs found" — the number and the message contradicting each other on
the one screen a customer has to trust.

### The result

A real response, from `POST /check/message` for
`"Congratulations! You have been selected for a job. To secure your position you must pay a registration fee of R350 today. WhatsApp me right now, it is urgent."`:

```json
{
  "id": "chk_47c08fdd414947b5",
  "type": "message",
  "status": "complete",
  "verdict": "high_risk",
  "score": 0.922,
  "confidence": 0.9,
  "reasons": ["UPFRONT_FEE", "PRIZE_OR_REFUND", "URGENCY"],
  "reason_text": [
    "It asks you to pay a fee to get the job, the visa or the prize. Real employers and offices do not charge you.",
    "It promises a prize or a refund you were not expecting.",
    "It pushes you to act quickly. Real organisations do not rush you."
  ],
  "instruction": "Do not click. Do not reply.",
  "next_steps": [
    "Do not click the link and do not reply to the message.",
    "Block the sender, then delete the message.",
    "Report it here so other people are warned."
  ],
  "highlights": [
    {"start": 0,   "end": 15,  "code": "PRIZE_OR_REFUND"},
    {"start": 90,  "end": 106, "code": "UPFRONT_FEE"},
    {"start": 122, "end": 130, "code": "MOVE_TO_PRIVATE_CHAT"},
    {"start": 134, "end": 143, "code": "URGENCY"},
    {"start": 151, "end": 157, "code": "URGENCY"}
  ],
  "display_domains": [],
  "learn_more": "fake-job-offers",
  "language": "en",
  "language_reviewed": true,
  "created_at": "2026-10-02T07:37:21Z",
  "rules_version": "rules-1.0.1",
  "analyzed_chars": 158,
  "truncated": false,
  "debug": {
    "signals": [
      {"code": "UPFRONT_FEE", "category": "message", "weight": 0.8, "critical": true,
       "evidence": "registration fee", "span": [90, 106]},
      {"code": "PRIZE_OR_REFUND", "category": "message", "weight": 0.35, "critical": false,
       "evidence": "Congratulations", "span": [0, 15]}
    ],
    "corroboration_met": true,
    "mitigators_applied": []
  }
}
```

`display_domains` is empty because this message had no URL. A message with a
link fills it, and it is the mechanism behind the "show the domain as plain text,
never as a link" rule.

`confidence` is 0.9 when corroboration was met and 0.6 when it was not. It
describes the *evidence*, not the verdict, so a well-supported amber is still
confident about being amber.

`debug` is included on purpose. "Why did it say that?" is the question a customer
asks, and being able to show the arithmetic is the difference between a tool
people trust and a black box they route around.

`evidence` and `span` let the verdict screen highlight the exact phrase — here,
the sixteen characters `registration fee` at offset 90 are what turned this into
a red warning.

### High-risk payments get a pause

A `high_risk` transaction also carries `cooling_off_seconds` (600). The app
offers a ten-minute wait before release, which is long enough to send one
message to someone who knows what is really going on, and short enough that it
does not feel like a punishment.

## 7. API reference

Base path `/api/v1`. JSON in, JSON out. Every request carries
`X-Demo-User`; it defaults to `blessing`.

### Errors

One shape, always:

```json
{ "error": { "code": "INVALID_INPUT", "message": "We could not read that." } }
```

| Status | Code | When |
|---|---|---|
| 400 / 422 | `INVALID_INPUT` | Missing, empty, too long, or out-of-range |
| 404 | `NOT_FOUND` | Unknown check id, or another user's check |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method for a real route |
| 429 | `RATE_LIMITED` | Over the limit; carries `Retry-After: 60` |
| 500 | `INTERNAL_ERROR` | Anything unexpected. No stack trace leaves the process. |

This includes errors raised by the framework. FastAPI's default 404 body is
`{"detail": "Not Found"}`, which the client cannot read — it looks for
`body.error.code`, finds nothing, and reports a generic failure instead of "we
could not find that".

### Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Status, version, rules version, counts |
| `POST` | `/check/message` | `{text, language?}` |
| `POST` | `/check/link` | `{url, language?}` |
| `POST` | `/check/transaction` | see below |
| `POST` | `/report` | `{check_id, note?}` — queue for the fraud desk |
| `POST` | `/feedback` | `{check_id, kind?}` — "this looks wrong" |
| `GET` | `/checks?limit=` | This user's history |
| `GET` | `/checks/{id}` | One check |
| `DELETE` | `/checks` | Delete this user's history |
| `POST` | `/inbound/whatsapp` | A forwarded message; returns a reply to send back |
| `GET` | `/desk/reports?status=&limit=` | The queue |
| `PATCH` | `/desk/reports/{id}` | `{status}` — `new`, `reviewing`, `dismissed`, `actioned` |
| `GET` | `/desk/stats` | Totals across every user |

Purposes for `/check/transaction`: `family`, `bills`, `school_or_rent`,
`buying_goods`, `fee_for_job_or_visa`, `fee_to_claim_prize_or_loan`,
`someone_met_online`, `other`.

```json
{
  "amount": 4500,
  "currency": "ZAR",
  "purpose": "someone_met_online",
  "new_recipient": { "name": "Ana Ferreira", "country": "MZ" },
  "language": "en"
}
```

Transaction **context** — saved recipients and send history — is *not* in the
request. The server sources it from its own store, because a client that can
assert its own history can assert anything.

The desk endpoints have no authorisation. That is stated rather than hidden: the
prototype has one demo user and no identity provider, and pretending otherwise
would be the worse problem.

## 8. Data model

SQLite, WAL mode, one file at `.data/ntiyiso.db`, created on first run.

| Table | Holds |
|---|---|
| `checks` | fingerprint, verdict, score, reasons, masked excerpt, timestamp |
| `reports` | A link to a check, its verdict, domains, note, status |
| `feedback` | A check, and whether it was called correct or a false positive |
| `users` | Demo account: saved recipients, send history |
| `rate_limits` | A fingerprint and a rolling window of request times |

Demo recipients and history are seeded so the payment rules have something to
compare against. Every account in the demo is invented.

## 9. Privacy

The anti-fraud app has to be the most trustworthy app on the phone, so:

- **Links are never opened.** Analysis reads the URL as text. Nothing is fetched.
- **The full message is never stored.** What is stored is a SHA-256 fingerprint
  (for deduplication), the verdict, the reasons, and a **masked excerpt** of up
  to 120 characters with digits replaced, so the customer's own history is
  readable to them. `STORE_MASKED_EXCERPT = False` turns even that off.
- **Deletion is real.** `DELETE /checks` removes the rows and returns how many.
  It does not count them and leave them in place — an endpoint that reports a
  deletion it did not perform is worse than no endpoint, because the customer can
  check.
- **The excerpt is blanked on deletion.** Reports stay, because the fraud desk
  needs the queue, but the readable text goes.
- **No message content in logs.**
- **The WhatsApp inbound logs the sender's number only as a fingerprint.**

## 10. Languages

`en` and `zu` (isiZulu), for the UI and for every reason, instruction and step.

The client asks for `language_reviewed`. For `en` it is `true`. For `zu` it is
`false`, and the response says so. **isiZulu wording in this prototype is
machine-drafted and has not been reviewed by a native speaker.** It must be
before any real use, and flagging it in the payload is more honest than leaving
it in a document nobody reads.

An unknown language falls back to `en` rather than failing.

## 11. Inbound: forwarding a message

`POST /inbound/whatsapp` takes `{message, from, language?}` and returns the full
result plus a `response` object containing a short plain-text `reply` (capped at
320 characters) and the verdict word, ready to send back.

This is the channel the brief's bonus asks for, and it is the one that scales
best: a customer forwards a suspicious message to a number and reads the answer
in the same chat, without installing anything.

It is a webhook endpoint, so in a real deployment it needs a signature check and
a provider sandbox before it faces the internet.

## 12. Limits and abuse protection

| Limit | Value | Why |
|---|---|---|
| Message length | 4,000 characters | Enough for any real message; stops a dump |
| URL length | 2,048 characters | Longer than any real URL |
| Rate limit | 60 requests / 60s per fingerprint | Enough for a person, useless for a script |
| Payment ceiling | none — validated as positive | Set by policy, not the API |

Limits are enforced before the engine runs, so a flood costs a fingerprint and a
counter rather than a regex pass.

## 13. Evaluation

`backend/fixtures/cases.json` — 38 labelled cases: 20 messages, 8 links, 10
transactions. Each carries a label (`scam`, `legitimate`, `suspect`), an expected
verdict, and a note on why it is labelled that way.

```bash
python tools/eval_fixtures.py --verbose
```

```
cases              38
missed             0   (calmer than we said we would ship)
false positives    0   (0 red, 0 amber, on genuine messages)

scam cases         14/19 returned HIGH RISK
genuine cases      16/16 stayed clean
```

**Both numbers are reported, and the second matters more.** A detector that
catches everything is worthless if nobody turns it on. `tools/eval_fixtures.py`
counts a false positive at *any* severity: an amber warning on a genuine message
has still cried wolf, because the customer was told to go and check something
that was fine.

Fourteen of nineteen scams reach red. The other five are amber, which is the
intended behaviour — a genuinely ambiguous message gets a gentle warning, not a
detention. The harness treats under-warning as a miss in both directions rather
than letting a case silently pass because it came back calmer than advertised.

`real-shortener-01` is labelled `suspect`, not `legitimate`, on purpose. We cannot
resolve shorteners; calling that message clean would claim we checked something
we did not.

**These are our own fixtures.** They are a regression guard — they stop a change
from breaking what already worked — and they are not evidence about accuracy in
the field. We do not quote an accuracy figure we have not measured on held-out
real scam traffic, because we have not.

## 14. Testing

```bash
python tools/check_all.py            # everything
python tools/eval_fixtures.py -v     # detection quality
python tools/parity_check.py -v      # the two engines agree
python tools/api_check.py http://127.0.0.1:8000/api/v1
```

`tools/api_check.py` is 54 assertions against a **running** server, not against
the handler functions — because status codes, headers, CORS and the error shape
only exist once HTTP is involved. It runs against both servers in
`tools/check_all.py`.

The suite covers: a scam is red; a genuine message is clean; a genuine government
domain is not called a lookalike; the language parameter changes the wording;
highlights land inside the string; a high-risk payment is paused; one demo user
cannot read another's check; deletion actually deletes; and every documented
error arrives in the one shape the client parses.

## 15. Configuration

Everything adjustable is in `backend/config.py`. Nothing is a magic number in the
logic.

| Name | Default | Meaning |
|---|---|---|
| `HIGH` | 0.75 | Red threshold |
| `SUSPICIOUS` | 0.40 | Amber threshold |
| `CORROBORATION_CAP` | 0.74 | Ceiling when corroboration is not met |
| `ALLOWLIST_CAP` | 0.30 | Ceiling when all links are official |
| `MENTION_ONLY_CAP` | 0.30 | Ceiling when a brand is only claimed |
| `CORROBORATION_COUNT` | 3 | Distinct signals that can corroborate |
| `CORROBORATION_WEIGHT` | 0.30 | How many of them must be substantial |
| `UNUSUAL_AMOUNT_MULTIPLIER` | 3 | Times the customer's usual |
| `NEW_USER_AMOUNT_FLOOR` | 2000 | Rand, for a new recipient |
| `COOLING_OFF_SECONDS` | 600 | Pause offered on a high-risk payment |
| `STORE_MASKED_EXCERPT` | True | Keep a masked excerpt in history |
| `MAX_TEXT_CHARS` | 4000 | Input limit |
| `RATE_LIMIT_REQUESTS` | 60 | Per 60 seconds |

Lists: `ALLOWLIST` (17 brand/domain pairs), `SHORTENERS` (14), `RISKY_TLDS`
(21), `STUFFING` (9).

Environment: `PORT`, `HOST`, `NTIYISO_DB` (database path), `RELOAD`.

## 16. Adding a rule

1. **Add it to `backend/engine/patterns.py`** for a message rule — a code, a
   weight, a `critical` flag, a pattern, and a plain-language sentence.
2. **Add the sentence to `backend/i18n.py`** in both languages.
3. **Mirror it in `build/monolith.html`.** The client engine is generated from
   there, so this is not optional.

   Keep the edit **line-count neutral**. `tools/extract.py` and
   `tools/build_customer_js.py` locate code by line range, and a rule that adds a
   line shifts everything below it. The diff of the monolith should be N lines
   out, N lines in. If it is not, the generators will fail with a patch target
   that looks nothing like the cause.
4. **Add fixtures** — at least one that should fire and one that must not.
5. **Run `check_all.py`.** It runs the fixtures and the parity check, so a
   forgotten mirror step fails the build instead of shipping.

## 17. Build plan

What the team did, in the order that made each step checkable.

1. **Rules first, no HTTP.** `patterns.py` and `verdict.py` as pure functions,
   with fixtures, before any route existed. The engine is the product; the API
   is delivery.
2. **Fixtures before tuning.** Including genuine messages, and counting false
   positives separately. Fixing the detector against a set that contained only
   scams would have made it much worse.
3. **FastAPI app** over the finished engine. Schemas, CORS, one error shape.
4. **The stdlib server**, because a demo that needs `pip install` fails in a room
   with bad wifi.
5. **Parity harness.** Once both engines existed, transcribing a rule into one
   and forgetting the other became a silent, dangerous failure.
6. **Contract tests against a live server**, run against both implementations.
7. **The fixes the fixtures found** — romance requests made critical, punycode
   up-weighted, brand mentions capped, corroboration reachable by count,
   `www.sassa.gov.za` recognised as genuine, and `send R1200 to my personal
   wallet` matched by a regex that had assumed people write "send it to".

## 18. Beyond the prototype

Not built. Each is real work, and each is listed with what it would actually
take.

| Item | What it needs |
|---|---|
| **Redirect resolution** | Fetch each hop behind a guarded fetcher: timeouts, hop limits, no private address ranges, no following of non-HTTP schemes. It is the single biggest blind spot — right now a `bit.ly` link is genuinely unknown, and we say so. |
| **Reputation feeds** | Google Safe Browsing or equivalent. Adds a dependency and a latency cost, and a second thing to explain when it is down. |
| **Domain age** | WHOIS creation date. Cheap, and strong for new-in-account domains. |
| **A classifier** | A small scikit-learn or ONNX model over the reasons, to catch phrasing the regexes miss. Only as a *signal*, never as the verdict — an unexplainable warning is not one people act on. |
| **Red-team corpus** | Fixtures written by people who build these scams, plus real reported messages. Our own fixtures cannot find our own blind spots. |
| **Native-speaker review** | isiZulu, and the other five official languages. Blocking, not optional. |
| **Real authentication** | The `X-Demo-User` header is a stand-in. OAuth against the partner's identity, and real authorisation on the desk endpoints. |
| **Voice and video** | Queued, with pretrained detectors. Out of scope for a hackathon and a separate project. |
| **Queue and workers** | The engine is fast enough to run inline. Media analysis would need a queue, and the honest reason to add one is that async work exists, not that it is fashionable. |
