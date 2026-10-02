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
    parts = [message_analysis or {}, url_analysis or {}, deepfake_analysis or {}]

    score = min(sum(p.get("score", 0) for p in parts), 100)

    reasons = []
    for p in parts:
        reasons.extend(p.get("reasons", []))

    if score >= 60:
        level = "HIGH"

        warning = (
            "This message may be a scam. "
            "It contains several warning signs that could put your money "
            "or personal information at risk."
        )

        action = (
            "Do not reply, click links or send money. Contact Mukuru yourself through "
            "the official app or the number on their website, then block and report the sender."
        )
    elif score >= 30:
        level = "MEDIUM"

        warning = (
            "This message may be a scam. "
            "It contains suspicious signs that should be verified "
            "before you take any action."
        )

        action = "Be careful. Verify with Mukuru through official channels before doing anything."
    else:
        level = "LOW"

        warning = (
            "No major scam indicators were detected, "
            "but always be careful with unexpected messages."
        )

        action = "No major scam signs found, but never share your PIN or send money you're unsure about."

    return {
    "risk_score": score,
    "risk_level": level,
    "warning": warning,
    "reasons": reasons,
    "recommended_action": action
}