"""Compatibility layer for the WhatsApp shield.

**These modules are adapters, not a second engine.**

They arrived with the WhatsApp shield (`whatsapp.html`, `backend/main.py`), and
their function names, argument shapes and return keys are what that page - and any
other caller of `POST /check-message` - already depends on. That contract is kept
exactly as it was.

What changed is where the answer comes from. `url_checker` used to be a stub that
never looked at the text, so the shield page reported every link as clean.
`message_analyzer` used to add rule points together, which let one repeated word
reach red on its own. All three now delegate to `backend.engine` - the same rules
the browser runs, and the same ones checked against 38 labelled fixtures - so the
shield page and the app cannot give a customer two different answers about the
same message.

Kept deliberately: every key these functions have ever returned. Adding to a
response is safe; removing one breaks a page that is already written against it.
"""

from .message_analyzer import analyze_message
from .risk_engine import calculate_risk
from .url_checker import analyze_urls

__all__ = ["analyze_message", "analyze_urls", "calculate_risk"]
