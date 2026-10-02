def calculate_risk(message_analysis, url_analysis=None, deepfake_analysis=None):
    parts = [message_analysis or {}, url_analysis or {}, deepfake_analysis or {}]

    score = min(sum(p.get("score", 0) for p in parts), 100)

    reasons = []
    for p in parts:
        reasons.extend(p.get("reasons", []))

    if score >= 60:
        level = "HIGH"
        action = (
            "Do not reply, click links or send money. Contact Mukuru yourself through "
            "the official app or the number on their website, then block and report the sender."
        )
    elif score >= 30:
        level = "MEDIUM"
        action = "Be careful. Verify with Mukuru through official channels before doing anything."
    else:
        level = "LOW"
        action = "No major scam signs found, but never share your PIN or send money you're unsure about."

    return {
        "risk_level": level,
        "risk_score": score,
        "reasons": reasons,
        "recommended_action": action,
    }