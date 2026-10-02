"""Fusion: signals in, one verdict out.

Everything before this module produces *signals* — independent reasons to be
careful, each with a weight. This module is the only place a number is
produced, and it is where the false-alarm policy lives.

The two policies are what separate this from a weighted average:

**Noisy-OR, not addition.**  ``score = 1 - Π(1 - w_i)``.  Independent warning
signs accumulate, but the score can never exceed 1 and a long list of weak signs
cannot add up to a red warning on its own.

**Corroboration.**  A red warning needs either one *critical* sign — something
that is essentially never legitimate, such as asking for a PIN or demanding a
fee for a job — or evidence from two or more categories.  A message that trips
one weak message rule and nothing else is capped at the top of amber instead of
reading red.  This is the mechanism that stops crying wolf.

**Mitigators** run afterwards and can only lower the score.  A message whose
links are all on the official-domain allowlist, with no credential or fee
request, is capped low: a genuine Mukuru message may well be a bit urgent.

The order matters.  Mitigators are applied *before* the corroboration cap, so a
mitigated message that would still read high gets capped by corroboration too.
"""

import math
import time
import uuid

from .. import config
from .. import i18n
from .. import RULES_VERSION


def js_round(value, digits=0):
    """Round the way JavaScript's Math.round does.

    `Math.round(x)` rounds to nearest with ties going towards +Infinity.
    Python's built-in `round` uses banker's rounding, so `round(2.5)` is 2 here
    and 3 in the browser. The two engines must agree exactly or the parity
    harness is worthless, so scores are rounded this way.
    """
    factor = 10 ** digits
    return math.floor(value * factor + 0.5) / factor


def _dedupe(signals):
    """First occurrence of each reason code wins, order preserved."""
    seen = set()
    unique = []
    for signal in signals:
        if signal.code in seen:
            continue
        seen.add(signal.code)
        unique.append(signal)
    return unique


#: Public alias. `backend.services` needs the same rule to produce a per-category
#: score that agrees with this module's, and re-implementing it there is how the
#: two would drift. Python-only: the browser bundle never calls this.
dedupe = _dedupe


def fuse(signals):
    """Combine signals into a score, a verdict and the reasons for the policy.

    Returns a dict with `score`, `verdict`, `corroboration_met`, `mitigators`
    and the deduplicated `unique` signals actually used.
    """
    unique = _dedupe(signals)

    # Noisy-OR over the distinct reasons.
    remaining = 1.0
    for signal in unique:
        remaining *= (1.0 - signal.weight)
    score = 1.0 - remaining

    mitigators = []

    link_signals = [s for s in unique if s.category == "link"]
    has_critical = any(s.critical for s in unique)
    # "Clean" means no link signal of real substance. NOT_HTTPS is excluded
    # because plenty of small genuine sites are still on http, and counting it
    # would stop the allowlist cap from ever applying.
    links_clean = not any(s.weight >= 0.20 and s.code != "NOT_HTTPS"
                          for s in link_signals)

    if link_signals and links_clean and not has_critical:
        score = min(score, config.ALLOWLIST_CAP)
        mitigators.append("ALLOWLISTED_LINKS")

    # A message that only *says* it is from a bank proves nothing: genuine
    # messages from those banks say the same words. Claiming an identity is
    # evidence only when something else backs it up, so a bare brand mention
    # never reaches amber on its own.
    only_brand = unique and all(s.code == "BRAND_IMPERSONATION" for s in unique)
    if only_brand and not link_signals:
        score = min(score, config.MENTION_ONLY_CAP)
        mitigators.append("BRAND_MENTION_ONLY")

    categories = {s.category for s in unique}
    # Corroboration means two *independent* reasons. Two categories is one way
    # to get there; another is several distinct signals from a single category,
    # because a transaction check can only ever produce transaction signals and
    # would otherwise never be able to corroborate itself.
    heavy = sum(1 for s in unique if s.weight >= config.CORROBORATION_WEIGHT)
    corroborated_by_count = (len(unique) >= config.CORROBORATION_COUNT and heavy >= 2)
    corroboration_met = has_critical or len(categories) >= 2 or corroborated_by_count

    if score >= config.HIGH and not corroboration_met:
        score = config.CORROBORATION_CAP
        mitigators.append("CORROBORATION_NOT_MET")

    score = js_round(score, 3)
    if score >= config.HIGH:
        verdict = "high_risk"
    elif score >= config.SUSPICIOUS:
        verdict = "suspicious"
    else:
        verdict = "looks_genuine"

    return {
        "score": score,
        "verdict": verdict,
        "corroboration_met": corroboration_met,
        "mitigators": mitigators,
        "unique": unique,
    }


def pick_reasons(unique, limit=3):
    """The reasons to show: critical first, then heaviest.

    Capped at three on purpose. A verdict with nine reasons is a verdict nobody
    reads, and the top three are the ones that change what the person does.
    """
    ranked = sorted(unique, key=lambda s: (0 if s.critical else 1, -s.weight))
    return ranked[:limit]


def build_highlights(raw_signals):
    """Character spans to mark up in the original text.

    Built from the raw signal list rather than the deduplicated one, so a phrase
    that trips two rules is still marked once by the client. Overlaps are
    resolved at render time by the client's `renderHighlighted`.
    """
    marks = []
    for signal in raw_signals:
        if signal.span:
            start, end = signal.span
            marks.append({"start": start, "end": end, "code": signal.code})
    marks.sort(key=lambda m: m["start"])
    return marks


#: Which library entry explains which reason. First match wins, so the order is
#: the priority order: the most specific pattern is the most useful guide.
def learn_more_for(signals):
    codes = {s.code for s in signals}
    if codes & {"UPFRONT_FEE", "TOO_GOOD_JOB_OFFER"}:
        return "fake-job-offers"
    if codes & {"ASKS_FOR_CREDENTIALS", "ACCOUNT_THREAT"}:
        return "verify-your-account"
    if codes & {"ROMANCE_MONEY_REQUEST", "RISKY_PURPOSE_UNMET"}:
        return "romance-scams"
    if "PRIZE_OR_REFUND" in codes:
        return "prize-and-refund-scams"
    if codes & {"LOOKALIKE_DOMAIN", "SUBDOMAIN_TRICK"}:
        return "fake-links"
    return None


def assemble(kind, signals, lang="en", extras=None, offline=False, now=None):
    """Build the response body from raw signals.

    The shape here is the API contract. The client renders exactly these keys,
    so adding one is safe and removing or renaming one is a breaking change.
    """
    fusion = fuse(signals)
    picked = pick_reasons(fusion["unique"], 3)
    lang = i18n.normalise_lang(lang)

    if picked:
        reasons = [s.code for s in picked]
        reason_text = [i18n.reason_text(s.code, lang) for s in picked]
    else:
        # Nothing found is itself a statement. Returning an empty list would
        # leave the screen with a score and no sentence, which reads as a bug.
        reasons = []
        reason_text = [i18n.reason_text("NO_SIGNAL", lang)]

    created_at = time.strftime(
        "%Y-%m-%dT%H:%M:%SZ", time.gmtime(now if now is not None else time.time()))

    result = {
        "id": "chk_" + uuid.uuid4().hex[:16],
        "type": kind,
        "status": "complete",
        "verdict": fusion["verdict"],
        "score": fusion["score"],
        # Confidence describes how well evidenced the verdict is, not how
        # likely a scam is: 0.9 when corroboration held, 0.6 when it did not.
        "confidence": 0.9 if fusion["corroboration_met"] else 0.6,
        "reasons": reasons,
        "reason_text": reason_text,
        "instruction": i18n.instruction_for(fusion["verdict"], kind, lang),
        "next_steps": i18n.next_steps(fusion["verdict"], kind, lang),
        "highlights": build_highlights(signals) if kind == "message" else [],
        "display_domains": [],
        "learn_more": learn_more_for(signals),
        "language": lang,
        "language_reviewed": i18n.is_reviewed(lang),
        "created_at": created_at,
        # Recorded on every result so a verdict can be traced to the exact set
        # of weights that produced it after the rules are tuned.
        "rules_version": RULES_VERSION,
    }

    if kind == "transaction" and fusion["verdict"] == "high_risk":
        result["cooling_off_seconds"] = config.COOLING_OFF_SECONDS

    if extras:
        for key, value in extras.items():
            result[key] = value

    # debug is what the desk and the judges ask about: which rules fired, and
    # which policy decision changed the score.
    result["debug"] = {
        "signals": [s.as_dict() for s in signals],
        "corroboration_met": fusion["corroboration_met"],
        "mitigators_applied": fusion["mitigators"],
        "categories": sorted({s.category for s in fusion["unique"]}),
        "offline": bool(offline),
    }
    return result