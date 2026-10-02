"""The API without FastAPI.

Same routes, same responses, same status codes as `backend/app.py` — served by
`http.server` from the standard library alone.

This exists because a demo is a bad time to discover that the venue wifi blocks
the package index, or that the laptop has no pip. `python -m backend` uses
FastAPI when it is installed and falls back to this when it is not, so the
backend deliverable can always be started on a machine that has never seen a
`requirements.txt`.

What is given up: OpenAPI docs, and Pydantic's coercion of odd input. The
request validation here is explicit and stricter than the schema's, not looser,
but it only covers the fields the client actually sends.
"""

import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from . import RULES_VERSION, __version__
from . import engine
from . import i18n
from .config import (
    DEMO_USER,
    MAX_TEXT_CHARS,
    MAX_URL_CHARS,
    STORE_MASKED_EXCERPT,
)
from .routes import whatsapp
from .store import default_store

API_PREFIX = "/api/v1"

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, X-Demo-User",
    "Access-Control-Max-Age": "600",
}

VALID_PURPOSES = {
    "family", "bills", "school_or_rent", "buying_goods",
    "fee_for_job_or_visa", "fee_to_claim_prize_or_loan", "someone_met_online",
    "other",
}


class HttpError(Exception):
    def __init__(self, code, status, message=None):
        super().__init__(code)
        self.code = code
        self.status = status
        self.message = message or code

    def body(self):
        return {"error": {"code": self.code, "message": self.message}}


def _whatsapp(store, user, body, query):
    """Forwarded chat message in, verdict and a short reply out."""
    return whatsapp.handle(store, user, body, query)


def _shield_check(store, user, body, query):
    """The WhatsApp shield page's own route.

    No store and no user: the page sends a message and wants a grade back. It is
    here as well as in the FastAPI app because both implementations are held to
    one contract, and a route on only one of them is a route that quietly rots.
    """
    return whatsapp.shield_check(body)


def _require(body, field):
    value = body.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        raise HttpError("INVALID_INPUT", 422, "We could not read that.")
    return value


def _as_number(value, field):
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise HttpError("INVALID_INPUT", 422, "We could not read the amount.")
    if amount != amount or amount in (float("inf"), float("-inf")):
        raise HttpError("INVALID_INPUT", 422, "We could not read the amount.")
    return amount


# ── route handlers ─────────────────────────────────────────────────────────
# Each returns (status, body). Raising HttpError produces the same error shape
# FastAPI produces, so the client cannot tell which server answered.

def health(store, user, body, query):
    return 200, {
        "status": "ok",
        "service": "ntiyiso-scam-shield",
        "server": "standalone",
        "version": __version__,
        "rules_version": RULES_VERSION,
        "stores_masked_excerpt": STORE_MASKED_EXCERPT,
        "languages": list(i18n.LANGS),
        "checks": store.check_stats(),
        "false_positives_reported": store.false_positive_count(),
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def check_message(store, user, body, query):
    text = _require(body, "text")
    if len(text) > MAX_TEXT_CHARS * 2:
        raise HttpError("INVALID_INPUT", 422, "That message is too long.")
    result = engine.check_message(text, lang=body.get("language") or "en")
    store.record_check(result, text, user=user)
    if result["verdict"] == "high_risk":
        store.note_risky_check(user, result["created_at"])
    return 200, result


def check_link(store, user, body, query):
    url = _require(body, "url")
    if len(url) > MAX_URL_CHARS * 2:
        raise HttpError("INVALID_INPUT", 422, "That link is too long.")
    result = engine.check_link(url, lang=body.get("language") or "en")
    store.record_check(result, url, user=user)
    if result["verdict"] == "high_risk":
        store.note_risky_check(user, result["created_at"])
    return 200, result


def check_transaction(store, user, body, query):
    if "amount" not in body:
        raise HttpError("INVALID_INPUT", 422, "Enter an amount greater than zero.")
    amount = _as_number(body.get("amount"), "amount")
    if amount <= 0:
        raise HttpError("INVALID_INPUT", 422, "Enter an amount greater than zero.")
    if amount > 10_000_000:
        raise HttpError("INVALID_INPUT", 422, "That amount is too large to check.")

    purpose = body.get("purpose") or "family"
    if purpose not in VALID_PURPOSES:
        raise HttpError("INVALID_INPUT", 422, "That reason is not one we know.")

    recipient_id = body.get("recipient_id")
    new_recipient = body.get("new_recipient")
    if not recipient_id and not new_recipient:
        raise HttpError("INVALID_INPUT", 422, "Tell us who you are paying.")

    note = body.get("note")
    if note and len(note) > MAX_TEXT_CHARS:
        raise HttpError("INVALID_INPUT", 422, "That note is too long.")

    context = store.context_for(user)
    payment = {
        "amount": amount,
        "currency": body.get("currency") or "ZAR",
        "purpose": purpose,
        "recipient_id": recipient_id,
        "new_recipient": new_recipient if isinstance(new_recipient, dict) else None,
        "note": note,
    }
    result = engine.check_transaction(payment, context=context,
                                      lang=body.get("language") or "en")
    store.record_check(result, note or purpose, user=user)
    return 200, result


def create_report(store, user, body, query):
    check_id = _require(body, "check_id")
    if not store.get_check(check_id):
        raise HttpError("NOT_FOUND", 404, "We could not find that check.")
    note = body.get("note")
    if note and len(note) > 500:
        raise HttpError("INVALID_INPUT", 422, "That note is too long.")
    return 200, store.add_report(check_id, user=user, note=note)


def create_feedback(store, user, body, query):
    check_id = _require(body, "check_id")
    kind = body.get("kind") or "false_positive"
    if not isinstance(kind, str) or not re.match(r"^[a-z_]{2,40}$", kind):
        raise HttpError("INVALID_INPUT", 422, "Unknown feedback kind.")
    if not store.get_check(check_id):
        raise HttpError("NOT_FOUND", 404, "We could not find that check.")
    return 200, store.add_feedback(check_id, kind, user=user)


def list_checks(store, user, body, query):
    limit = _as_number((query.get("limit") or ["20"])[0], "limit")
    limit = max(1, min(100, int(limit)))
    return 200, {"items": store.recent_checks(user=user, limit=limit)}


def get_one_check(store, user, body, query, check_id):
    row = store.get_check(check_id)
    if not row or row["user"] != user:
        raise HttpError("NOT_FOUND", 404, "We could not find that check.")
    return 200, row


def clear_checks(store, user, body, query):
    removed = store.delete_checks(user=user)
    store.reset_rates()
    return 200, {"deleted": removed, "user": user}


def desk_reports(store, user, body, query):
    status = (query.get("status") or [None])[0]
    limit = max(1, min(200, int(_as_number((query.get("limit") or ["50"])[0], "limit"))))
    return 200, {"items": store.list_reports(status=status, limit=limit)}


def desk_report_status(store, user, body, query, report_id):
    status = _require(body, "status")
    if status not in ("new", "reviewing", "dismissed", "actioned"):
        raise HttpError("INVALID_INPUT", 422, "Unknown report status.")
    return 200, store.set_report_status(report_id, status)


def desk_stats(store, user, body, query):
    by_status = {}
    for row in store.list_reports(limit=1000):
        by_status[row["status"]] = by_status.get(row["status"], 0) + 1
    return 200, {
        # user=None: the desk sees the whole operation, not one device.
        "checks": store.check_stats(user=None),
        "false_positives_reported": store.false_positive_count(),
        "reports_by_status": by_status,
        "rules_version": RULES_VERSION,
    }


#: (method, path pattern, handler, needs_body, rate_limited)
#: The pattern is a regex with one optional group for a path parameter.
ROUTES = [
    ("GET", re.compile(r"^/api/v1/health$"), health, False, False),
    ("POST", re.compile(r"^/api/v1/inbound/whatsapp$"), _whatsapp, True, True),
    ("POST", re.compile(r"^/check-message$"), _shield_check, True, True),
    ("POST", re.compile(r"^/api/v1/check/message$"), check_message, True, True),
    ("POST", re.compile(r"^/api/v1/check/link$"), check_link, True, True),
    ("POST", re.compile(r"^/api/v1/check/transaction$"), check_transaction, True, True),
    ("POST", re.compile(r"^/api/v1/report$"), create_report, True, False),
    ("POST", re.compile(r"^/api/v1/feedback$"), create_feedback, True, False),
    ("GET", re.compile(r"^/api/v1/checks$"), list_checks, False, False),
    ("GET", re.compile(r"^/api/v1/checks/([A-Za-z0-9_\-]{1,64})$"), get_one_check, False, False),
    ("DELETE", re.compile(r"^/api/v1/checks$"), clear_checks, False, False),
    ("GET", re.compile(r"^/api/v1/desk/reports$"), desk_reports, False, False),
    ("PATCH", re.compile(r"^/api/v1/desk/reports/(\d{1,12})$"), desk_report_status, True, False),
    ("GET", re.compile(r"^/api/v1/desk/stats$"), desk_stats, False, False),
]

#: Nothing here should ever advertise a framework version that is not present.
OPENAPI_NOTE = (
    "This server is the dependency-free fallback. Install requirements.txt and "
    "run uvicorn backend.app:app for the generated OpenAPI docs."
)


def make_handler(store):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "Ntiyiso/" + __version__
        sys_version = ""

        # ── plumbing ──────────────────────────────────────────────────────
        def log_message(self, fmt, *args):
            if os.environ.get("NTIYISO_VERBOSE"):
                sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

        def _send(self, status, payload, extra_headers=None):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            for key, value in CORS_HEADERS.items():
                self.send_header(key, value)
            for key, value in (extra_headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _user(self):
            raw = self.headers.get("X-Demo-User") or DEMO_USER
            return raw.strip()[:64] or DEMO_USER

        def _read_json(self):
            length = self.headers.get("Content-Length")
            if not length:
                return {}
            try:
                size = int(length)
            except ValueError:
                raise HttpError("INVALID_INPUT", 422, "We could not read that.")
            if size <= 0:
                return {}
            if size > 256 * 1024:
                raise HttpError("INVALID_INPUT", 413, "That is too large to send.")
            raw = self.rfile.read(size)
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                raise HttpError("INVALID_INPUT", 422, "We could not read that.")
            if parsed is None:
                return {}
            if not isinstance(parsed, dict):
                raise HttpError("INVALID_INPUT", 422, "We could not read that.")
            return parsed

        def do_OPTIONS(self):
            self.send_response(204)
            for key, value in CORS_HEADERS.items():
                self.send_header(key, value)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            self._dispatch("GET")

        def do_HEAD(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

        def do_PATCH(self):
            self._dispatch("PATCH")

        def do_DELETE(self):
            self._dispatch("DELETE")

        # ── dispatch ──────────────────────────────────────────────────────
        def _dispatch(self, method):
            parts = urlsplit(self.path)
            path = parts.path.rstrip("/") or "/"
            query = parse_qs(parts.query)
            user = self._user()

            try:
                body = self._read_json() if method in ("POST", "PATCH") else {}
            except HttpError as exc:
                self._send(exc.status, exc.body())
                return

            matched_path = False
            for route_method, pattern, handler, _, limited in ROUTES:
                found = pattern.match(path)
                if not found:
                    continue
                matched_path = True
                if route_method != method:
                    continue
                try:
                    if limited and not store.allow(user):
                        raise HttpError("RATE_LIMITED", 429,
                                        "Too many checks just now. Please wait a moment.")
                    args = [int(g) if g.isdigit() else g for g in found.groups()]
                    status, payload = handler(store, user, body, query, *args)
                except HttpError as exc:
                    headers = {"Retry-After": "60"} if exc.status == 429 else None
                    self._send(exc.status, exc.body(), headers)
                except Exception as exc:                      # noqa: BLE001
                    if os.environ.get("NTIYISO_VERBOSE"):
                        import traceback
                        traceback.print_exc()
                    self._send(500, {"error": {"code": "INTERNAL_ERROR",
                                                "message": "Something went wrong on our side."}})
                else:
                    self._send(status, payload)
                return

            # The path exists but the method does not: 405 is the honest answer.
            if matched_path:
                self._send(405, {"error": {"code": "METHOD_NOT_ALLOWED",
                                           "message": "Not allowed on that route."}},
                           {"Allow": "GET, POST, PATCH, DELETE, OPTIONS"})
                return

            self._send(404, {"error": {"code": "NOT_FOUND",
                                       "message": "No such route." + " " + OPENAPI_NOTE}})

        def handle_one_request(self):
            """A phone losing signal mid-request is normal, not an error.

            Without this the server prints a full traceback every time a client
            hangs up — which on a demo laptop looks like the thing is broken.
            """
            try:
                BaseHTTPRequestHandler.handle_one_request(self)
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
                self.close_connection = True

    return Handler


def run(host="0.0.0.0", port=8000, store=None):
    store = store or default_store()
    server = ThreadingHTTPServer((host, port), make_handler(store))
    server.daemon_threads = True
    print("Ntiyiso API (stdlib) -> http://localhost:%d%s" % (port, API_PREFIX))
    print("Rules %s | demo user %s | docs: %s" % (RULES_VERSION, DEMO_USER, OPENAPI_NOTE))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(run(port=int(os.environ.get("PORT", 8000))))