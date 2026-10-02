import re

RULES = [
    {
        "name": "credentials",
        "points": 40,
        "pattern": r"\b(pin|otp|one[- ]time (pin|password)|password|cvv|card number|verification code|id number)\b",
        "reason": "Asks for a PIN, password, OTP or personal details. Mukuru never asks for these.",
    },
    {
        "name": "urgency",
        "points": 15,
        "pattern": r"\b(urgent|immediately|right now|within \d+ (hours?|minutes?)|last chance|expires? (today|soon)|act now)\b",
        "reason": "Uses pressure and urgency to rush you.",
    },
    {
        "name": "prize",
        "points": 25,
        "pattern": r"\b(you('ve| have)? won|winner|prize|reward|free money|bonus|claim your)\b",
        "reason": "Offers a prize or reward you didn't ask for.",
    },
    {
        "name": "upfront_payment",
        "points": 25,
        "pattern": r"\b(pay|send|deposit|transfer)\b.{0,30}\b(fee|first|upfront|to (claim|release|unlock))\b",
        "reason": "Asks you to pay a fee first to receive money or goods.",
    },
    {
        "name": "account_threat",
        "points": 20,
        "pattern": r"\b(account|wallet).{0,30}\b(suspended|blocked|locked|closed|frozen|restricted)\b",
        "reason": "Threatens to suspend or close your account.",
    },
    {
        "name": "secrecy",
        "points": 15,
        "pattern": r"\b(don'?t tell|keep this (secret|between us)|do not share this with)\b",
        "reason": "Asks you to keep it secret.",
    },
    {
        "name": "click_link",
        "points": 10,
        "pattern": r"\b(click|tap|open|visit)\b.{0,25}\b(link|here|below)\b",
        "reason": "Pushes you to click a link.",
    },
]


def analyze_message(text: str) -> dict:
    lowered = text.lower()
    reasons = []
    score = 0

    for rule in RULES:
        if re.search(rule["pattern"], lowered):
            score += rule["points"]
            reasons.append(rule["reason"])

    mentions_mukuru = "mukuru" in lowered

    # Impersonation matters most when Mukuru is named alongside another red flag
    if mentions_mukuru and score > 0:
        score += 10
        reasons.append("Claims to be Mukuru. Check it through the official app or support line.")

    return {
        "score": min(score, 100),
        "reasons": reasons,
        "mentions_mukuru": mentions_mukuru,
    }