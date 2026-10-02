"""Turning an input into signals.

A signal is one reason to be careful, with a weight, a category, and — for
message rules — the exact character span that triggered it so the verdict screen
can highlight it. Three collectors produce them:

* :func:`collect_message_signals` — the phrase rules
* :func:`collect_link_signals`    — what the links point at
* :func:`collect_transaction_signals` — who is being paid, how much, and why

Each returns a list of :class:`Signal`. None of them decide a verdict; that is
`verdict.fuse`, which is the only place risk becomes a number.
"""

import re
from urllib.parse import urlsplit

from ..config import (
    ALLOWLIST,
    NEW_USER_AMOUNT_FLOOR,
    RISKY_TLDS,
    SHORTENERS,
    STUFFING,
    UNUSUAL_AMOUNT_MULTIPLIER,
)
from .patterns import MESSAGE_RULES, NEGATION, iter_urls

_IP_HOST = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


class Signal:
    """One reason to be careful.

    `span` is a `(start, end)` pair into the original text and is `None` for
    link and transaction signals, which have no phrase to highlight.
    """

    __slots__ = ("code", "category", "weight", "critical", "evidence", "span")

    def __init__(self, code, category, weight, critical=False, evidence=None, span=None):
        self.code = code
        self.category = category
        self.weight = float(weight)
        self.critical = bool(critical)
        self.evidence = evidence
        self.span = span

    def as_dict(self):
        return {
            "code": self.code,
            "category": self.category,
            "weight": round(self.weight, 3),
            "critical": self.critical,
            "evidence": self.evidence,
            "span": list(self.span) if self.span else None,
        }

    def __repr__(self):  # pragma: no cover - debugging aid
        return "<Signal %s w=%s %s>" % (self.code, self.weight, self.category)


# ── messages ────────────────────────────────────────────────────────────────

def collect_message_signals(text):
    """Every phrase rule that matches `text`, with its span.

    A negatable rule whose match is preceded closely by a negation is dropped.
    That is what keeps a genuine "we will never ask for your PIN" notice from
    being treated as a credential request — the most common false alarm in this
    domain, and the one the demo leans on.
    """
    signals = []
    for rule in MESSAGE_RULES:
        for match in rule.re.finditer(text):
            phrase = match.group(0)
            if not phrase:
                continue
            start = match.start()
            if rule.negatable:
                before = text[max(0, start - 30):start]
                if NEGATION.search(before):
                    continue
            signals.append(Signal(
                code=rule.code,
                category="message",
                weight=rule.weight,
                critical=rule.critical,
                evidence=phrase,
                span=(start, start + len(phrase)),
            ))
    return signals


# ── links ───────────────────────────────────────────────────────────────────

def display_domain(raw):
    """The domain shown to a person, reduced to its last two labels.

    `fnb.com.secure-login.xyz` reads as `secure-login.xyz`, which is the point:
    the address is shown as plain text so it can be read, and never as a
    tappable link.
    """
    href = str(raw or "").strip()
    if not re.match(r"^https?://", href, re.IGNORECASE):
        href = "http://" + href
    try:
        host = (urlsplit(href).hostname or "").lower()
    except ValueError:
        return raw
    if not host:
        return raw
    if _IP_HOST.match(host):
        return host
    return ".".join(host.split(".")[-2:])


def read_link(raw):
    """Structural facts about one link. Returns ``None`` if it will not parse.

    The interesting fields are `official_brand` (is this genuinely that
    company's site?) and `impersonated_brand` (is a real company name buried
    inside a domain this company does not own?).
    """
    href = str(raw or "").strip()
    if not re.match(r"^https?://", href, re.IGNORECASE):
        href = "http://" + href
    try:
        parts = urlsplit(href)
    except ValueError:
        return None
    host = (parts.hostname or "").lower()
    if not host:
        return None

    labels = host.split(".")
    registrable = ".".join(labels[-2:])
    official = None
    # Suffix-match the allowlist against the whole host rather than comparing
    # the last two labels. `www.sassa.gov.za` reduces to `gov.za`, which matches
    # no allowlist entry, so the genuine SASSA address was being read as a
    # subdomain trick — a red warning on a real government site.
    for brand, domain in ALLOWLIST:
        if host == domain or host.endswith("." + domain):
            official = brand

    impersonated = None
    if not official:
        squashed = re.sub(r"[^a-z0-9]", "", host)
        for brand, domain in ALLOWLIST:
            bare = domain.split(".")[0]
            # Kept at four characters to match the client exactly: three-letter
            # brands like "fnb" are too short to match on by coincidence, and
            # matching them produced false positives on unrelated domains.
            if len(bare) < 4:
                continue
            in_sub = any(
                re.sub(r"[^a-z0-9]", "", label) == bare
                for label in labels[:-2]
            )
            if in_sub or bare in squashed:
                impersonated = brand
                break

    return {
        "raw": raw,
        "host": host,
        "registrable": registrable,
        "official_brand": official,
        "impersonated_brand": impersonated,
        "is_ip": bool(_IP_HOST.match(host)),
        "is_shortener": any(host == s or host.endswith("." + s) for s in SHORTENERS),
        "suspicious_tld": labels[-1] in RISKY_TLDS and not official,
        # A real name in a *sub*domain of an unrelated registrable domain:
        # mukuru.com.release-funds.top. A bare lookalike (mukuru-secure.xyz) is
        # not a subdomain trick, just a fake domain.
        "subdomain_trick": bool(impersonated) and len(labels) > 2,
        "keyword_stuffing": any(word in host for word in STUFFING),
        "https": parts.scheme == "https",
        "punycode": any(label.startswith("xn--") for label in labels),
    }


def collect_link_signals(urls):
    """Structural signals for each link."""
    signals = []

    def add(code, weight, critical, host):
        signals.append(Signal(code, "link", weight, critical, evidence=host))

    for raw in urls:
        facts = read_link(raw)
        if not facts:
            continue
        host = facts["host"]
        # A punycode label is a deliberate attempt to look like something it is
        # not, so it carries more weight than an ordinary lookalike. Decided once
        # here rather than added as a second signal: fuse() keeps the first
        # signal per code, so emitting a weaker one first would win.
        lookalike = 0.80 if facts["punycode"] else 0.70
        if facts["impersonated_brand"]:
            add("SUBDOMAIN_TRICK" if facts["subdomain_trick"] else "LOOKALIKE_DOMAIN",
                lookalike, True, host)
        if facts["punycode"]:
            add("LOOKALIKE_DOMAIN", lookalike, True, host)
        if facts["is_ip"]:
            add("IP_ADDRESS_URL", 0.50, False, host)
        if facts["keyword_stuffing"]:
            add("KEYWORD_STUFFING", 0.30, False, host)
        if facts["suspicious_tld"]:
            add("SUSPICIOUS_TLD", 0.25, False, host)
        if facts["is_shortener"]:
            # We cannot resolve a shortener in this prototype, so a hidden
            # destination is honestly amber: not proof, but not clean either.
            add("URL_SHORTENER", 0.45, False, host)
        if not facts["https"]:
            add("NOT_HTTPS", 0.15, False, host)
    return signals


# ── transactions ────────────────────────────────────────────────────────────

def _parse_iso(value):
    """Best-effort ISO-8601 to epoch seconds. Returns None if unreadable."""
    if not value:
        return None
    if isinstance(value, (int, float)):
        return float(value) / 1000.0 if value > 1e11 else float(value)
    try:
        from datetime import datetime
        text = str(value).strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=None).timestamp()
        return parsed.timestamp()
    except (ValueError, TypeError, OverflowError):
        return None


def collect_transaction_signals(payment, context, now):
    """Signals from who is being paid, how much, and the stated reason.

    `now` is epoch seconds and is a parameter rather than a call to the clock so
    that the fixture harness can pin time and get the same answer twice.

    The stated purpose is the strongest signal available: a customer who says
    "this is a fee for a job" has told us the pattern, and no amount of
    reassuring wording changes that.
    """
    signals = []

    def add(code, weight, critical=False):
        signals.append(Signal(code, "transaction", weight, critical))

    purpose = payment.get("purpose")
    if purpose in ("fee_for_job_or_visa", "fee_to_claim_prize_or_loan"):
        add("RISKY_PURPOSE_FEE", 0.80, True)
    if purpose == "someone_met_online":
        add("RISKY_PURPOSE_UNMET", 0.60)

    recipients = context.get("recipients") or []
    history = context.get("history") or []

    amounts = sorted(h.get("amount", 0) for h in history if h.get("amount", 0) > 0)
    amount = payment.get("amount") or 0
    if len(amounts) >= 3:
        median = amounts[len(amounts) // 2]
        if median > 0 and amount > median * UNUSUAL_AMOUNT_MULTIPLIER:
            add("UNUSUAL_AMOUNT", 0.30)
    elif amount > NEW_USER_AMOUNT_FLOOR:
        add("UNUSUAL_AMOUNT", 0.30)

    known_ids = {r.get("id") for r in recipients}
    recipient_id = payment.get("recipient_id")
    known = bool(recipient_id) and recipient_id in known_ids
    if not known and payment.get("new_recipient"):
        add("NEW_RECIPIENT", 0.15)

    # Several sends to people who are not saved recipients, inside an hour, is
    # what being pushed through a scam looks like from the transaction side.
    hour_ago = now - 3600
    rapid = 0
    for row in history:
        stamp = _parse_iso(row.get("created_at"))
        if stamp is not None and stamp > hour_ago and row.get("recipient_id") not in known_ids:
            rapid += 1
    if rapid >= 3:
        add("RAPID_NEW_RECIPIENTS", 0.35)

    # The scam path: a warning, then minutes later a payment. Rushing someone
    # from the message straight to the transfer is the whole attack.
    # Camel case on purpose: this is the key the JavaScript engine reads
    # (ctx.lastRiskyCheckAt) and the one store.context_for() produces.
    last_risky = _parse_iso(context.get("lastRiskyCheckAt"))
    if last_risky is not None:
        minutes = (now - last_risky) / 60.0
        if 0 <= minutes <= 30:
            add("RECENT_RISKY_CHECK", 0.50)

    return signals


def urls_in(text):
    """Public alias so callers do not need to reach into `patterns`."""
    return iter_urls(text)