"""Tunable constants shared by every part of the API.

Transcribed from the "A1 · CONFIG" block of build/extracted/customer.js. These
are duplicated rather than imported because the browser cannot read a Python
file; `tools/eval_fixtures.py` asserts the two copies still agree.
"""

# ── service ──────────────────────────────────────────────────────────────────

#: The demo user the web app identifies itself with (X-Demo-User).
DEMO_USER = "blessing"

#: Longest message we will analyse. Matches CONFIG.maxTextChars on the client.
MAX_TEXT_CHARS = 4000

#: Longest single URL we will analyse.
MAX_URL_CHARS = 2048

#: Free checks allowed per demo user per rolling window. The web app surfaces
#: the 429 as `error.rate` ("Too many checks just now").
RATE_LIMIT_REQUESTS = 60
RATE_LIMIT_WINDOW_SECONDS = 60

#: The prototype stores a masked excerpt so the customer's own history reads
#: back. Set to False to keep only the fingerprint (see docs/BACKEND.md).
STORE_MASKED_EXCERPT = True

#: Maximum characters of masked excerpt retained per check.
EXCERPT_MAX_CHARS = 120


# ── verdict thresholds ──────────────────────────────────────────────────────

#: At or above this fused score the verdict is HIGH RISK.
HIGH = 0.75

#: At or above this fused score (but below HIGH) the verdict is SUSPICIOUS.
SUSPICIOUS = 0.40

#: Ceiling applied when the score would be HIGH but corroboration failed: the
#: customer saw strong signs, but all from one category. Downgrades a red
#: warning to the top of amber rather than dropping it.
CORROBORATION_CAP = 0.74

#: Ceiling applied when every link in the message is on the official-domain
#: allowlist and nothing asked for a credential or a fee.
ALLOWLIST_CAP = 0.30

#: Ceiling applied when a message's only sign is claiming to be a known brand.
#: Genuine messages from those brands say the same words, so the claim alone
#: cannot clear the amber threshold.
MENTION_ONLY_CAP = 0.30

#: Corroboration can also be reached by count: this many distinct signals, of
#: which at least this many must carry real weight. A transaction check produces
#: only transaction signals, so without this it could never corroborate itself.
CORROBORATION_COUNT = 3
CORROBORATION_WEIGHT = 0.30

#: An amount this many times the customer's median is "unusual".
UNUSUAL_AMOUNT_MULTIPLIER = 3

#: With too little history to compute a median, an amount above this is unusual.
NEW_USER_AMOUNT_FLOOR = 2000

#: Seconds of enforced pause returned on a high-risk transaction.
COOLING_OFF_SECONDS = 600


# ── official domains ────────────────────────────────────────────────────────
# Brands whose real web address we know. A link on one of these is not treated
# as a phishing domain; it can still be flagged for asking for a PIN.

ALLOWLIST = [
    ("Mukuru", "mukuru.com"),
    ("Mukuru", "mukuru.co.za"),
    ("Capitec", "capitec.co.za"),
    ("FNB", "fnb.co.za"),
    ("Standard Bank", "standardbank.co.za"),
    ("Absa", "absa.co.za"),
    ("Nedbank", "nedbank.co.za"),
    ("TymeBank", "tymebank.co.za"),
    ("African Bank", "africanbank.co.za"),
    ("SASSA", "sassa.gov.za"),
    ("SARS", "sars.gov.za"),
    ("Home Affairs", "dha.gov.za"),
    ("SAPS", "saps.gov.za"),
    ("WhatsApp", "whatsapp.com"),
    ("Vodacom", "vodacom.co.za"),
    ("MTN", "mtn.co.za"),
    ("Telkom", "telkom.co.za"),
]

#: Link shorteners. Not a scam on their own — they hide the destination, which
#: is the problem — so they contribute a small weight.
SHORTENERS = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
    "cutt.ly", "rb.gy", "shorturl.at", "rebrand.ly", "t.ly", "tiny.cc", "bit.do",
]

#: Top-level domains that are cheap and heavily abused.
RISKY_TLDS = [
    "xyz", "top", "click", "link", "work", "loan", "gq", "cf", "tk", "ml", "ga",
    "zip", "mov", "rest", "quest", "buzz", "monster", "sbs", "cam", "online",
    "site",
]

#: Words that appear in genuine branding but are padding when a scammer builds a
#: domain out of them.
STUFFING = [
    "secure", "login", "verify", "verification", "rewards", "bonus", "claim",
    "update", "account",
]