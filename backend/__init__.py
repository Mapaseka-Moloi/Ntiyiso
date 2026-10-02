"""Ntiyiso backend — the API half of Scam Shield.

This package is the server-side counterpart to `shared/js/customer.js`. The web
app calls it at `DEFAULT_API` (`http://localhost:8000/api/v1`) and falls back to
its own copy of the engine when it cannot be reached, so the API is an upgrade
rather than a dependency.

Two rules govern everything here:

1. **The engine is pure stdlib.** `backend/engine/` imports nothing outside the
   standard library and never touches the database, the request or the clock
   except through arguments. That is what lets `tools/eval_fixtures.py` run the
   exact same code the API runs, and what lets the parity harness compare it
   against the JavaScript engine.
2. **The Python engine and the JavaScript engine are one engine.** Every weight,
   threshold and regex here is a transcription of the block in
   `build/extracted/customer.js` marked "A4 · ENGINE". `tools/eval_fixtures.py`
   fails the build if the two ever disagree on a verdict, so drift is a test
   failure rather than a silent behaviour change.

Only `backend/app.py` needs FastAPI, and only `backend/standalone.py` is the
stdlib fallback for machines that have nothing installed. See `backend/README.md`.
"""

__version__ = "1.0.0"

# Mirrors `version` in RULES on the client. Bumped whenever a weight changes, so
# a verdict recorded by an old client can be told apart from a current one.
#
# 1.0.1 — romance-money requests count as critical, punycode homographs carry a
#          lookalike's full weight, a bare brand mention is capped, and
#          corroboration can be reached by signal count as well as by category.
RULES_VERSION = "rules-1.0.1"