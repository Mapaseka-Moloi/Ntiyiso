"""The final verdict for the shield page, delegated to the shared engine.

Signature and returned keys are unchanged, because `whatsapp.html` is written
against them and has to keep working.

The original summed the two scores:

    score = min(message_score + url_score, 100)

and cut HIGH at 60, MEDIUM at 30. Two things were wrong with that. Adding is not
combining - two independent 0.5 chances are a 0.75 chance, not a 1.0, so the
page reached red far more readily than the app did. And the thresholds were
invented locally, so the shield page and the app graded the same message
differently.

Both are fixed by delegating: the signals from all the passes go through the same
`fuse` the whole application uses, which applies the same thresholds, the same
mitigators and the same corroboration rule. There is one set of rules in this
repository and this is where the shield page joins it.
"""

from ..i18n import instruction_for
from ._shared import decide, rebuild

#: The shield page's three grades, mapped from the engine's three verdicts.
LEVELS = {
    "high_risk": "HIGH",
    "suspicious": "MEDIUM",
    "looks_genuine": "LOW",
}


def calculate_risk(message_analysis, url_analysis=None, deepfake_analysis=None):
    """Combine the passes into one graded risk. Returns the keys it always has.

    `deepfake_analysis` is accepted and ignored. Voice and video detection is not
    built; it is here because the signature has carried it since the shield was
    first committed, and removing a parameter would break a caller for no gain.
    """
    signals = []
    for analysis in (message_analysis, url_analysis, deepfake_analysis):
        signals.extend(rebuild(analysis))

    fusion = decide(signals)
    verdict = fusion["verdict"]

    # Reasons come from the signals actually used, not from whatever text a
    # caller passed in, so the explanation always matches the number above it.
    from ._shared import sentences
    reasons = sentences(fusion["unique"])

    return {
        "risk_level": LEVELS[verdict],
        "risk_score": round(fusion["score"] * 100),
        "reasons": reasons,
        "recommended_action": instruction_for(verdict, "message", "en"),
        # Additive. The page above ignores all of it; it is here so a caller that
        # wants the graded score can also see what produced it.
        "verdict": verdict,
        "corroboration_met": fusion["corroboration_met"],
        "mitigators_applied": fusion["mitigators"],
    }
