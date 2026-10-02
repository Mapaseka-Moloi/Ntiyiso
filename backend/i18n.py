"""Plain-language explanations.

The API returns reasons and next steps already written out, because the one
thing an anti-fraud product cannot do is return a score and make the customer
work out what it means. Every verdict carries a sentence a person can act on.

Transcribed from the "A3 · i18n" block of build/extracted/customer.js. Only the
keys the server needs are here — the screen chrome stays on the client. A missing
translation falls back to English rather than returning a raw reason code.
"""

# ── why we say this ─────────────────────────────────────────────────────────

REASONS_EN = {
    "ASKS_FOR_CREDENTIALS":
        "It asks for your PIN, OTP or password. Your bank and Mukuru will never "
        "ask for those.",
    "UPFRONT_FEE":
        "It asks you to pay a fee to get the job, the visa or the prize. Real "
        "employers and offices do not charge you.",
    "ACCOUNT_THREAT":
        "It says your account will be blocked or closed unless you act. That is "
        "pressure, not a real notice.",
    "ROMANCE_MONEY_REQUEST":
        "It mixes an emotional story with a request for money. That pattern is "
        "common in romance scams.",
    "UNTRACEABLE_PAYMENT":
        "It wants payment in a way you cannot reverse — gift cards, crypto or a "
        "personal wallet.",
    "BRAND_IMPERSONATION":
        "It claims to be a bank, Mukuru or a government office, but the sender "
        "or the link is not theirs.",
    "SECRECY":
        "It asks you to keep this secret. Real companies never ask for that.",
    "PRIZE_OR_REFUND":
        "It promises a prize or a refund you were not expecting.",
    "TOO_GOOD_JOB_OFFER":
        "The pay and the conditions sound too good to be true, and there is no "
        "proper interview.",
    "URGENCY":
        "It pushes you to act quickly. Real organisations do not rush you.",
    "MOVE_TO_PRIVATE_CHAT":
        "It wants to move the conversation to WhatsApp, Telegram or a personal "
        "number.",
    "LOOKALIKE_DOMAIN":
        "The website address is close to a real one, but it is not the real "
        "address.",
    "SUBDOMAIN_TRICK":
        "A real company name has been tucked inside a longer address to make it "
        "look official.",
    "IP_ADDRESS_URL":
        "The link goes to a number address, not to a company website.",
    "NEWLY_REGISTERED_DOMAIN":
        "This website was registered very recently.",
    "KEYWORD_STUFFING":
        'The address is padded with words like "secure", "login" or "verify" '
        "that real companies do not use.",
    "SUSPICIOUS_TLD":
        "Addresses ending like this are cheap and are often used for scams.",
    "URL_SHORTENER":
        "The real address is hidden behind a short link, so we cannot see where "
        "it goes. Check it another way before you trust it.",
    "NOT_HTTPS":
        "This website does not use a secure connection.",
    "SAFE_BROWSING_HIT":
        "This link has been reported as unsafe.",
    "RISKY_PURPOSE_FEE":
        "You said this is a fee for a job, a visa or a prize. Those fees are the "
        "scam.",
    "RISKY_PURPOSE_UNMET":
        "You have not met this person in real life. That is how romance and "
        "investment scams work.",
    "RECENT_RISKY_CHECK":
        "You checked a risky message shortly before this payment. Scammers rush "
        "you from the message straight to the payment.",
    "RAPID_NEW_RECIPIENTS":
        "You have sent to several new people in a short time. That can be a "
        "sign of being pushed.",
    "UNUSUAL_AMOUNT":
        "This is much more than you usually send.",
    "NEW_RECIPIENT":
        "You have not sent money to this person before.",
    "NOT_ENOUGH_INFORMATION":
        "There is not enough here for us to judge. Be careful, and check "
        "through an official number you already have.",
    "NO_SIGNAL":
        "We found no warning signs in this one.",
}

REASONS_ZU = {
    "ASKS_FOR_CREDENTIALS":
        "Icela i-PIN, i-OTP noma iphasiwedi yakho. Ibhange lakho ne-Mukuru "
        "abasoze bakucele lokho.",
    "UPFRONT_FEE":
        "Icela ukuthi ukhokhe imali ukuze uthole umsebenzi noma umklomelo. "
        "Abaqashi bangempela abakukhokhisi.",
    "URGENCY":
        "Ikugcizelela ukuthi wenze ngokushesha. Izinhlangano zangempela azenzi "
        "lokho.",
    "SECRECY":
        "Icela ukuthi ugcine lokhu kuyimfihlo. Izinkampani zangempela azenzi "
        "lokho.",
    "PRIZE_OR_REFUND":
        "Ithembisa umklomelo noma imali ebuyiselwayo ongayilindelanga.",
    "NEW_RECIPIENT":
        "Awukaze uthumele imali kulo muntu.",
    "UNUSUAL_AMOUNT":
        "Lokhu kukhulu kakhulu kunalokho ojwayele ukukuthumela.",
    "NOT_ENOUGH_INFORMATION":
        "Akukho okwanele lapha ukuze sahlulele. Qaphela, futhi uqinisekise "
        "ngenombolo esemthethweni onayo.",
    "NO_SIGNAL":
        "Asitholanga zimpawu eziyingozi kulokhu.",
}

REASONS = {"en": REASONS_EN, "zu": REASONS_ZU}

#: The languages the API can answer in. Matches LANGS on the client.
LANGS = ("en", "zu")

#: Languages a native speaker has checked. Surfaced as `reviewed` in the
#: response so the app can show its "not yet reviewed" notice honestly.
REVIEWED_LANGS = ("en",)


# ── what to do about it ─────────────────────────────────────────────────────

INSTRUCTIONS_EN = {
    "high_risk": "Do not click. Do not reply.",
    "suspicious":
        "Do not act yet. Check directly with the company or person, using a "
        "number you already trust.",
    "looks_genuine":
        "No warning signs found. Stay careful with money requests.",
    "high_risk_payment": "Pause. Do not send yet.",
}

INSTRUCTIONS_ZU = {
    "high_risk": "Ungacindi. Ungaphenduli.",
    "suspicious":
        "Ungenzi lutho okwamanje. Qinisekisa ngqo nenkampani noma umuntu, "
        "usebenzisa inombolo oyithembayo.",
    "looks_genuine": "Asitholanga zimpawu eziyingozi. Qaphela uma kucelwa imali.",
    "high_risk_payment": "Misa. Ungathumeli okwamanje.",
}

INSTRUCTIONS = {"en": INSTRUCTIONS_EN, "zu": INSTRUCTIONS_ZU}

# ── next steps ──────────────────────────────────────────────────────────────
# Keyed by "<kind>.<verdict>.<n>" where kind is message or transaction. Amber
# gets two steps and red gets three, because red has more to undo.

STEPS_EN = {
    "msg.high": [
        "Do not click the link and do not reply to the message.",
        "Block the sender, then delete the message.",
        "Report it here so other people are warned.",
    ],
    "msg.mid": [
        "Phone the company or person on a number you already have, not one "
        "from the message.",
        "Ask someone you trust before you act on it.",
    ],
    "pay.high": [
        "Do not send this payment yet.",
        "Phone the person or company on a number you already trust and confirm "
        "it is really them.",
        "If anyone asked you to keep this payment secret, that is a warning "
        "sign on its own.",
    ],
    "pay.mid": [
        "Check with the person directly before you send.",
        "Send a small test amount first if you are unsure.",
    ],
    "genuine": [
        "Nothing looks wrong here. Carry on, but stay careful with money "
        "requests.",
        "If anything changes, or you feel rushed, check again.",
    ],
}

STEPS_ZU = {
    "msg.high": [
        "Ungacindi isixhumanisi futhi ungaphenduli umyalezo.",
        "Vimba umthumeli, bese ususa umyalezo.",
        "Bika lapha ukuze abanye abantu baze bab warned.",
    ],
    "msg.mid": [
        "Shayela inkampani noma umuntu ezinombolo obekhona, hhayi enayo kumyalezo.",
        "Buza othile omethembayo ngaphambi kokwenza into.",
    ],
    "pay.high": [
        "Ungathumeli le nkokhelo yet.",
        "Shayela umuntu noma inkampani ezinombolo oyithembayo uqinisekise ukuthi ngempela nguye.",
        "Uma umuntu ekuphezzle ukuthi ungaze ungasho lolokhu, yiluphawu lokuzwa.",
    ],
    "pay.mid": [
        "Qinisekisa nomuntu ngqo ngaphambi kokuthumela.",
        "Thumela inani elincane lokuhlola uma ungaqiniseki.",
    ],
    "genuine": [
        "Akukho okubukeka okungalokuthe. Qhubeka, kodwa qaphela uma kucelwa imali.",
        "Uma kushintsha, noma uzizwa uyasheshi, hlola futhi.",
    ],
}

STEPS = {"en": STEPS_EN, "zu": STEPS_ZU}

VERDICT_WORDS = {
    "en": {
        "high_risk": "HIGH RISK",
        "suspicious": "SUSPICIOUS",
        "looks_genuine": "LOOKS GENUINE",
    },
    "zu": {
        "high_risk": "INGOZI ENKULU",
        "suspicious": "KUYASOLISA",
        "looks_genuine": "KUBONAKALA KUYIQINISO",
    },
}


def normalise_lang(lang):
    """Accept 'zu', 'zu-ZA', 'ZU' and fall back to English."""
    if not lang:
        return "en"
    code = str(lang).strip().lower().replace("_", "-").split("-")[0]
    return code if code in LANGS else "en"


def is_reviewed(lang):
    return normalise_lang(lang) in REVIEWED_LANGS


def reason_text(code, lang="en"):
    """The sentence explaining a reason code, in `lang`."""
    lang = normalise_lang(lang)
    return REASONS.get(lang, {}).get(code) or REASONS_EN.get(code) or code


def instruction_for(verdict, kind, lang="en"):
    """The one-line instruction shown under the verdict."""
    lang = normalise_lang(lang)
    if kind == "transaction" and verdict == "high_risk":
        key = "high_risk_payment"
    else:
        key = verdict
    return INSTRUCTIONS.get(lang, {}).get(key) or INSTRUCTIONS_EN.get(key, "")


def next_steps(verdict, kind, lang="en"):
    """Two or three concrete actions, ordered by what to do first."""
    lang = normalise_lang(lang)
    if verdict == "looks_genuine":
        key = "genuine"
    elif kind == "transaction":
        key = "pay.high" if verdict == "high_risk" else "pay.mid"
    else:
        key = "msg.high" if verdict == "high_risk" else "msg.mid"
    return list(STEPS.get(lang, {}).get(key) or STEPS_EN[key])


def verdict_word(verdict, lang="en"):
    lang = normalise_lang(lang)
    return VERDICT_WORDS.get(lang, {}).get(verdict) or VERDICT_WORDS["en"].get(verdict, verdict)