"""The detection rules.

A transcription of the message-rule table, the negation guard and the URL
finder from the "A4 · ENGINE" block of build/extracted/customer.js. Keep the two
in step: `tools/eval_fixtures.py` runs both engines over the labelled fixture set
and fails if a verdict differs.

Weights are on a 0-1 scale and are combined with noisy-OR (see `verdict.fuse`),
so they are probabilities of "this is a reason to be careful", not percentages.
`critical` marks a sign that on its own justifies a red warning; `negatable`
marks a sign that means the opposite when it is preceded by a negation, which is
what stops "Mukuru will never ask for your PIN" from being flagged.
"""

import re


class MessageRule:
    """One weighted phrase pattern."""

    __slots__ = ("code", "weight", "critical", "negatable", "re")

    def __init__(self, code, weight, critical=False, negatable=False, pattern=None):
        self.code = code
        self.weight = weight
        self.critical = critical
        self.negatable = negatable
        self.re = re.compile(pattern, re.IGNORECASE)

    def __repr__(self):  # pragma: no cover - debugging aid
        return "<MessageRule %s w=%s critical=%s>" % (self.code, self.weight, self.critical)


# Order is not significant for the verdict (signals are deduped by code and then
# ranked by weight) but it is kept identical to the source for easy diffing.
MESSAGE_RULES = [
    MessageRule(
        "ASKS_FOR_CREDENTIALS", 0.85, critical=True, negatable=True,
        pattern=r"\b(?:send|share|give|confirm|enter|provide|reply with|tell me)\s+"
                r"(?:me\s+)?(?:your\s+|the\s+)?"
                r"(?:pin|otp|one[- ]time\s+pin|password|passcode|card\s+number|cvv|full\s+card)\b"
                r"|\b(?:pin|otp|password)\s+(?:yakho|yenu)\b",
    ),
    MessageRule(
        "UPFRONT_FEE", 0.80, critical=True,
        pattern=r"\b(?:registration|processing|admin|application|clearance|release|"
                r"handling|customs|training|uniform|activation)\s+fee\b"
                r"|\bpay\s+(?:a\s+)?(?:small\s+)?(?:fee|deposit)\b"
                r"|\bfee\s+to\s+(?:start|begin|secure|release|claim|get)\b",
    ),
    MessageRule(
        "ACCOUNT_THREAT", 0.50,
        pattern=r"\b(?:account|profile|card|sim)\s+(?:will\s+be|has\s+been|is)\s+"
                r"(?:blocked|suspended|closed|frozen|deactivated)\b"
                r"|\b(?:verify|confirm|update)\s+(?:your\s+)?(?:account|details|information)\s+"
                r"(?:now|immediately|within)\b"
                r"|\blose\s+access\b",
    ),
    MessageRule(
        "ROMANCE_MONEY_REQUEST", 0.60, critical=True,
        pattern=r"\b(?:i\s+love\s+you|my\s+(?:dear|love|darling))\b[\s\S]{0,120}"
                r"\b(?:money|send|cash|help\s+me\s+pay)\b"
                r"|\b(?:hospital|emergency|visa|ticket|clearance)\b[\s\S]{0,60}"
                r"\b(?:send|need)\b[\s\S]{0,20}\bmoney\b",
    ),
    MessageRule(
        "UNTRACEABLE_PAYMENT", 0.50,
        pattern=r"\b(?:gift\s+cards?|itunes\s+cards?|google\s+play\s+cards?|bitcoin|"
                r"crypto|usdt|btc)\b"
                # The amount may sit between "send" and "to", because that is how
                # people write it: "send R1200 to my personal wallet".
                r"|\bsend\s+(?:it\s+)?(?:r\s?\d[\d\s,.]*\s+)?to\s+"
                r"(?:my\s+)?(?:personal\s+)?(?:wallet|number)\b",
    ),
    MessageRule(
        "BRAND_IMPERSONATION", 0.45,
        pattern=r"\b(?:mukuru|capitec|fnb|first\s+national|standard\s+bank|absa|nedbank|"
                r"tymebank|sassa|sars|home\s+affairs|saps|paypal)\b[\s\S]{0,40}"
                r"\b(?:team|support|security|department|official|helpdesk)\b",
    ),
    MessageRule(
        "SECRECY", 0.40,
        pattern=r"\b(?:do\s?n[o']?t|never|must\s+not|ungaze)\s+tell\s+"
                r"(?:anyone|anybody|your\s+family)\b"
                r"|\bkeep\s+(?:this|it)\s+(?:a\s+)?(?:secret|between\s+us|quiet)\b"
                r"|\bdo\s?n[o']?t\s+discuss\b",
    ),
    MessageRule(
        "PRIZE_OR_REFUND", 0.35,
        pattern=r"\b(?:you(?:'ve|\s+have)?\s+won|you\s+are\s+a\s+winner|congratulations|"
                r"congrats)\b"
                r"|\b(?:claim|collect)\s+(?:your\s+)?(?:prize|reward|winnings|refund)\b"
                r"|\blucky\s+draw\b",
    ),
    MessageRule(
        "TOO_GOOD_JOB_OFFER", 0.35,
        pattern=r"\bno\s+(?:interview|experience|cv|qualifications?)\s+"
                r"(?:needed|required)\b"
                r"|\bearn\s+(?:up\s+to\s+)?r\s?\d[\d\s,.]*\s*(?:per|\/)\s*"
                r"(?:day|week|month)\b"
                r"|\bwork\s+from\s+home\b[\s\S]{0,60}\b(?:r\s?\d|earn|salary)\b",
    ),
    MessageRule(
        "URGENCY", 0.25,
        pattern=r"\b(?:urgent|urgently|act\s+now|immediately|right\s+now|"
                r"within\s+\d+\s*(?:minutes?|hours?)|last\s+chance|final\s+warning|"
                r"expires?\s+(?:today|soon)|limited\s+time)\b",
    ),
    MessageRule(
        "MOVE_TO_PRIVATE_CHAT", 0.20,
        pattern=r"\b(?:whats\s?app|whatsapp|telegram|dm\s+me|inbox\s+me)\b"
                r"|\b(?:chat|talk|message)\s+(?:me\s+)?(?:on|via|through)\s+"
                r"(?:my\s+)?(?:private|personal)\b",
    ),
]

#: Applied to the 30 characters before a match, when the rule is negatable.
#: Anchored at the end so it only considers text immediately preceding the sign.
NEGATION = re.compile(
    r"\b(?:never|do\s?n[o']?t|will\s+not|won't|no\s+one|we\s+never|ungaze)\b[\s\S]{0,24}$",
    re.IGNORECASE,
)

#: Finds links in free text. The alternation order matters: the more specific
#: South African endings must precede the bare `za`/`com` so the whole suffix is
#: consumed as one label. Group 1 is the match itself; everything else is
#: non-capturing.
URL_RE = re.compile(
    r"\b((?:https?://|www\.)[^\s<>\"')\]]+"
    r"|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\."
    r"(?:co\.za|org\.za|gov\.za|net\.za|com|net|org|io|xyz|top|click|link|info|"
    r"biz|site|online|za)(?:/[^\s<>\"')\]]*)?)",
    re.IGNORECASE,
)

#: Trailing punctuation that is almost always sentence punctuation rather than
#: part of the address.
_TRAILING = ".,;:)]"


def iter_urls(text):
    """Yield each distinct link in `text`, in order of first appearance.

    A trailing full stop or bracket is trimmed rather than treated as part of
    the address, because "visit https://x.co.za." should yield the same link as
    "visit https://x.co.za".
    """
    seen = []
    for match in URL_RE.finditer(text or ""):
        url = match.group(1)
        while url and url[-1] in _TRAILING:
            url = url[:-1]
        if url and url not in seen:
            seen.append(url)
    return seen