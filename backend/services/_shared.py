"""Shared helpers for the `/check-message` compatibility layer.

These exist so `message_analyzer`, `url_checker` and `risk_engine` cannot drift
apart from the engine they delegate to, and so none of them decides anything on
its own.
"""

from ..engine import Signal
from ..engine.verdict import dedupe, fuse


def noisy_or(signals):
    """Combine weights the way the engine does: 1 - the product of the misses.

    A partial score for one category, before any policy is applied. Used only to
    fill in the `score` field of a single category's response; the verdict is
    never derived from it.

    Deduplicates first, exactly as the engine does. Without that a message
    containing the word "urgent" six times reported 82 on its own - which is the
    original "add up the rule points" flaw coming straight back in through a
    different door.
    """
    remaining = 1.0
    for signal in dedupe(list(signals)):
        remaining *= (1.0 - signal.weight)
    return 1.0 - remaining


def rebuild(analysis):
    """Rebuild `Signal` objects from an analysis dict.

    The analyses travel between the three functions as plain JSON-compatible
    dicts, because they are also part of an HTTP response. The policy needs the
    real objects back, so they are reconstructed here.

    Returns an empty list for a dict that carries no signals, which is what a
    caller written against the older shape - one that only returned a score -
    will produce. `risk_engine` handles that case separately.
    """
    out = []
    for raw in (analysis or {}).get("signals") or []:
        try:
            span = raw.get("span")
            out.append(Signal(
                raw["code"],
                raw["category"],
                raw["weight"],
                critical=raw.get("critical", False),
                evidence=raw.get("evidence"),
                span=tuple(span) if span else None,
            ))
        except (KeyError, TypeError, ValueError):
            # A signal we cannot read back is one we cannot weigh. Dropping it
            # costs a little evidence; guessing at it would cost correctness.
            continue
    return out


def decide(signals):
    """The one place a verdict is decided: the engine's own `fuse`.

    Every response this package produces, including the shield page's, comes
    through here, which is why it cannot disagree with the app.
    """
    return fuse(list(signals))


def sentences(signals):
    """One plain-language sentence per distinct signal, in the order found."""
    from ..i18n import reason_text

    out = []
    for signal in signals:
        sentence = reason_text(signal.code, "en")
        # A bare rule code is not something to show a customer, so a signal with
        # no sentence of its own contributes nothing rather than leaking a code.
        if sentence and sentence not in out:
            out.append(sentence)
    return out
