"""WhatsApp intake — check a message from a chat app.

Two contracts live in this file because two different callers need this and
neither should have to care about the other.

**1. `POST /api/v1/inbound/whatsapp`** — the forward-to-a-number route.

The phone cannot hand us an SMS: no web app can read another app's messages, and
asking for that permission is both unavailable on the web and alarming to a
customer. So the message comes in the way a person can always give it:

* **Paste** — copy the message, open Ntiyiso, tap Paste.
* **Share** — the phone's own share sheet, "Ntiyiso → Check". The link carries
  the text in the URL fragment, which browsers do not send to a server.
* **Forward to a number** — the route modelled here.

A gateway receives the message, calls this endpoint, and gets back a verdict plus
a ready-to-send reply. The customer never has to install anything, which is the
point — the people most likely to be targeted are the least likely to install an
app.

The reply is deliberately short. A wall of text in a chat window gets skimmed and
skipped; three lines get read. It leads with the verdict word, then the single
most important action, then where to read more.

**2. `POST /check-message`** — the shield page's route.

`whatsapp.html` and `backend/main.py` were committed before the rest of the API
existed, and call this exact path with `{message}`. The response shape is kept
byte-for-byte compatible so that page keeps working untouched. The work is done by
`backend.services`, which is an adapter over the same engine as everything else.

No signature verification is implemented, because there is no real gateway and
no real number. `docs/BACKEND.md` says exactly what a deployment must add before
this is exposed to anyone.
"""

from .. import engine
from ..i18n import instruction_for, reason_text, verdict_word
from ..services import analyze_message, analyze_urls, calculate_risk

#: The number customers forward to. Simulated: 27 000 000 000 is not a valid
#: South African mobile prefix, so nothing can accidentally reach a real person.
DEMO_NUMBER = "+27000000000"

#: The reply is capped so it stays readable in a chat bubble.
MAX_REPLY_CHARS = 320

#: Per-language reply templates. {verdict} {instruction} {reason} {steps} {link}
REPLY_TEMPLATES = {
    "en": (
        "Ntiyiso check: {verdict}\n"
        "{instruction}\n"
        "{reasons}\n"
        "{steps}"
    ),
    "zu": (
        "Ukuhlelo kwe-Ntiyiso: {verdict}\n"
        "{instruction}\n"
        "{reasons}\n"
        "{steps}"
    ),
}

#: Deliberately short, one action only. This is the whole reason the forward
#: route is worth building separately from the app.
FIRST_STEPS = {
    "en": {
        "high_risk": "1. Do not click or reply. Block the sender.",
        "suspicious": "1. Check with them on a number you already have.",
        "looks_genuine": "1. Nothing looks wrong. Stay careful with money requests.",
    },
    "zu": {
        "high_risk": "1. Ungcindi futhi ungaphenduli. Vimba umthumeli.",
        "suspicious": "1. Qinisekisa naye enombolo oyithembayo.",
        "looks_genuine": "1. Akukho okubukeka okungalokuthe. Qaphela imali.",
    },
}

#: Where the full explanation lives. In a real deployment this is the customer's
#: own link, so the reply never has to carry the whole verdict.
DETAIL_LINK = "https://ntiyiso.app/verdict/{check_id}"


def build_reply(result, lang="en"):
    """The message Ntiyiso sends back into the chat.

    Kept to the verdict, one instruction, at most one reason, and one action.
    Everything else is one tap away in the app, where there is room for it.
    """
    verdict = result["verdict"]
    word = verdict_word(verdict, lang)
    instruction = instruction_for(verdict, result.get("type", "message"), lang)
    reasons = result.get("reason_text") or []
    # One reason, not three. In a chat window the first reason is the one that
    # changes behaviour; the rest are available in the app.
    top_reason = reasons[0] if reasons else ""
    step = FIRST_STEPS.get(lang, FIRST_STEPS["en"])[verdict]

    lines = [
        REPLY_TEMPLATES.get(lang, REPLY_TEMPLATES["en"]).format(
            verdict=word,
            instruction=instruction,
            reasons=top_reason,
            steps=step,
        ).rstrip()
    ]

    reply = "\n".join(lines)
    if len(reply) > MAX_REPLY_CHARS:
        reply = reply[:MAX_REPLY_CHARS - 1].rstrip() + "\u2026"

    return {
        "reply": reply,
        "verdict": verdict,
        "verdict_word": word,
        "score": result.get("score"),
        "check_id": result.get("id"),
        "detail_link": DETAIL_LINK.format(check_id=result.get("id", "")),
        "block_sender_recommended": verdict == "high_risk",
        "language": result.get("language", lang),
    }


# ── 1. the forward-to-a-number route ─────────────────────────────────────────

def handle(store, user, body, query):
    """Run a check on an inbound chat message. Returns ``(status, body)``.

    Kept free of HTTP and framework types so it can be called straight from a
    test, a queue worker, or the gateway itself.
    """
    from ..standalone import HttpError  # local import keeps the module standalone

    message = (body or {}).get("message") or (body or {}).get("text")
    if not message or not str(message).strip():
        raise HttpError("INVALID_INPUT", 422, "There is nothing to check yet.")

    lang = (body or {}).get("language") or "en"
    sender = (body or {}).get("from") or "unknown"
    if not store.allow(user):
        raise HttpError("RATE_LIMITED", 429, "Too many checks just now.")

    result = engine.check_message(str(message), lang=lang)
    store.record_check(result, str(message), user=user)
    if result["verdict"] == "high_risk":
        store.note_risky_check(user, result["created_at"])

    payload = {
        "from": sender,
        "to": DEMO_NUMBER,
        "result": result,
        "response": build_reply(result, lang),
    }
    return 200, payload


# ── 2. the shield page's route ────────────────────────────────────────────────

def shield_check(body):
    """``POST /check-message`` — the shape ``whatsapp.html`` expects.

    Framework-free and store-free, so both server implementations can serve it
    from the same function and cannot drift apart. Returns ``(status, body)``.

    The four keys under ``risk`` are the ones the page reads and they are
    unchanged. ``result`` is additive: the full engine verdict, so a caller can
    show the same graded score, reasons and next steps as the app does instead of
    only the summary.
    """
    from ..standalone import HttpError

    payload = body or {}
    message = payload.get("message") or payload.get("text")
    if message is None or not str(message).strip():
        raise HttpError("INVALID_INPUT", 422, "We could not read that message.")

    text = str(message)
    lang = payload.get("language") or "en"

    message_analysis = analyze_message(text)
    url_analysis = analyze_urls(text)
    risk = calculate_risk(message_analysis, url_analysis)

    # The authoritative verdict, from the same call the app makes. `risk` above
    # is derived from the same signals, so the two cannot disagree; including it
    # means a caller can stop at `risk` or show the whole thing.
    result = engine.check_message(text, lang=lang)

    return 200, {
        "message": text,
        "message_analysis": message_analysis,
        "url_analysis": url_analysis,
        "risk": risk,
        "result": result,
    }


# ── wiring ────────────────────────────────────────────────────────────────────

def register(app):
    """Attach both routes to a FastAPI app.

    Declared inline rather than with a decorator so the handlers above stay
    importable and testable on their own.
    """
    from fastapi import Body
    from fastapi.responses import JSONResponse

    from ..standalone import HttpError

    @app.post("/api/v1/inbound/whatsapp", tags=["inbound"],
              summary="Check a message forwarded from WhatsApp")
    def inbound_whatsapp(payload: dict = Body(default={})):
        try:
            status, body = handle(app.state.store,
                                  payload.get("user", "blessing"), payload, {})
        except HttpError as exc:
            return JSONResponse(status_code=exc.status, content=exc.body())
        return JSONResponse(status_code=status, content=body)

    @app.post("/check-message", tags=["inbound"],
              summary="Check a message (WhatsApp shield page contract)")
    def shield(payload: dict = Body(default={})):
        try:
            status, body = shield_check(payload)
        except HttpError as exc:
            return JSONResponse(status_code=exc.status, content=exc.body())
        return JSONResponse(status_code=status, content=body)

    return app
