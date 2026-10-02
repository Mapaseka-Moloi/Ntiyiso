"""The Ntiyiso detection engine — pure standard library, no I/O.

The three entry points are the three things a customer can ask about:

    check_message(text, lang)        a pasted message or a message with a link
    check_link(url, lang)            a bare link on its own
    check_transaction(payment, ...)  a payment described before it is released

Each returns the verdict document described in docs/BACKEND.md. Nothing in this
package imports the database, the HTTP layer or the clock, so the fixture harness
can run it directly and get the same answer the API gives.
"""

import time

from ..config import MAX_TEXT_CHARS, MAX_URL_CHARS
from . import verdict as _verdict
from .signals import (
    Signal,
    collect_link_signals,
    collect_message_signals,
    collect_transaction_signals,
    display_domain,
    iter_urls,
    read_link,
    urls_in,
)
from .verdict import assemble, fuse, js_round

__all__ = [
    "check_message", "check_link", "check_transaction",
    "collect_message_signals", "collect_link_signals", "collect_transaction_signals",
    "display_domain", "iter_urls", "read_link", "urls_in",
    "fuse", "assemble", "js_round", "Signal",
]


def check_message(text, lang="en", now=None):
    """Analyse a pasted message.

    Any links inside it are analysed too. A message is the common case and the
    dangerous one: the words and the link often disagree with each other, and a
    message asking for a PIN with a perfectly genuine-looking link is still the
    threat.

    Text longer than `MAX_TEXT_CHARS` is truncated rather than rejected. A
    pasted forward can be enormous and the warning signs are rarely at the end.
    """
    if text is None:
        text = ""
    trimmed = str(text).strip()[:MAX_TEXT_CHARS]
    urls = iter_urls(trimmed)
    signals = collect_message_signals(trimmed) + collect_link_signals(urls)
    return assemble(
        "message", signals, lang=lang,
        extras={"display_domains": [display_domain(u) for u in urls],
                "analyzed_chars": len(trimmed),
                "truncated": len(str(text).strip()) > MAX_TEXT_CHARS},
        now=now,
    )


def check_link(url, lang="en", now=None):
    """Analyse a link on its own.

    Reached when the customer pastes a bare URL with no surrounding text. The
    wording rules do not run, because there is no wording — only the address.
    """
    raw = (url or "").strip()[:MAX_URL_CHARS]
    signals = collect_link_signals([raw])
    return assemble(
        "link", signals, lang=lang,
        extras={"display_domains": [display_domain(raw)]},
        now=now,
    )


def check_transaction(payment, context=None, lang="en", now=None):
    """Analyse a payment described before it is released.

    `payment` is what the customer told us on the send screen: amount, currency,
    purpose, and either a saved `recipient_id` or a `new_recipient`. `context`
    is their history: prior sends, saved recipients and when they last checked
    something risky.

    Any free-text they pasted into the note field is run through the message
    rules as well. "Registration fee for the position" in the note is the same
    sentence as the same sentence in a message, and should be caught.
    """
    payment = payment or {}
    context = context or {}
    lang = lang or payment.get("language") or "en"
    now = time.time() if now is None else now

    signals = collect_transaction_signals(payment, context, now)

    note = payment.get("note")
    if note:
        signals += collect_message_signals(str(note)[:MAX_TEXT_CHARS])

    return assemble("transaction", signals, lang=lang, extras={}, now=now)