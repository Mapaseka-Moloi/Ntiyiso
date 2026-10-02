"""Wording analysis, delegated to the shared engine.

Kept as its own module because `POST /check-message` calls it separately from the
URL pass, and that split is still the right shape: the wording and the link in a
message are independent evidence, and reporting them apart lets whoever is reading
the result see *which* part looked wrong.

What changed, and why:

The original added rule points together. That has two problems. A long message
can pass 100 by saying "urgent" five times, so repetition alone would reach red.
And it made "says the word urgent" worth the same kind of evidence as "asks for
your PIN", which is not how those two things should weigh against each other.

This now collects the same signals the whole application uses and combines them
the same way. The returned `score` is still 0-100, because that is what this
contract has always returned; the engine thinks in 0-1 and the conversion happens
here so the rules do not have to care.
"""

from ..engine import collect_message_signals
from ._shared import noisy_or, sentences

#: The brand whose impersonation matters most. Still reported, because callers
#: read it to decide whether to mention a specific check to the customer.
PRIMARY_BRAND = "mukuru"


def analyze_message(text: str) -> dict:
    """Score the wording of a message, on its own. Returns 0-100.

    The returned keys are the ones this function has always returned - `score`,
    `reasons`, `mentions_mukuru` - plus `codes` and `signals`, so `risk_engine`
    can re-apply policy over the whole message rather than trusting a partial
    number.
    """
    body = text or ""
    lowered = body.lower()
    signals = collect_message_signals(body)

    return {
        "score": round(noisy_or(signals) * 100),
        "reasons": sentences(signals),
        "mentions_mukuru": PRIMARY_BRAND in lowered,
        "codes": [s.code for s in signals],
        "signals": [s.as_dict() for s in signals],
    }
