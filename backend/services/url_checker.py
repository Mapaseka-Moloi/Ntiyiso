"""Link analysis, delegated to the shared engine.

**This was a stub.** It returned `{"score": 0, "reasons": [], "urls": []}` without
looking at the text at all, so every message containing a link came back
link-clean and the shield page told a customer their phishing URL was fine. That
is the worst possible failure for this product: a confident all-clear on a
malicious link, produced by a function that never ran.

It now extracts the URLs and runs the same link rules as the rest of the
application - lookalike domains, subdomain tricks, punycode, shorteners, keyword
stuffing, missing TLS - and reports which ones it found so the caller can show
them to the customer as plain text.

The keys are unchanged, because the caller already reads them.
"""

from ..engine import collect_link_signals, display_domain, iter_urls
from ._shared import noisy_or, sentences


def analyze_urls(text: str) -> dict:
    """Score the links in a piece of text. Returns 0-100.

    No link in the text is ever fetched or opened. The URL is read as a string and
    that is the whole of the analysis, which is what makes it safe to hand this
    function anything a stranger sent.
    """
    urls = list(iter_urls(text or ""))
    signals = collect_link_signals(urls)

    return {
        "score": round(noisy_or(signals) * 100),
        "reasons": sentences(signals),
        "urls": urls,
        # Display forms, e.g. "mukuru-secure-login.xyz" rather than the full
        # address. The customer needs to recognise the name; the path and query
        # are where a scammer hides the part that does the damage.
        "display_domains": [display_domain(url) for url in urls],
        "codes": [s.code for s in signals],
        "signals": [s.as_dict() for s in signals],
    }
