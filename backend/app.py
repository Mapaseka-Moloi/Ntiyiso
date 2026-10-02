"""FastAPI application.

One file, one router per concern, and a documented schema for every request and
response. This is the deliverable the brief asks for: a backend that holds the
core logic and data, separate from the frontend, with a stable contract.

The API is deliberately an *upgrade* rather than a dependency. Every endpoint
returns the same verdict document the browser computes for itself, so the app is
fully functional when this service is not running — which is what lets the demo
survive a dead laptop or a locked-down venue wifi.

Mount with:

    uvicorn backend.app:app --port 8000

See backend/standalone.py for a zero-dependency server with the same contract.
"""

import os
import time
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import RULES_VERSION, __version__
from . import engine
from .config import DEMO_USER, MAX_TEXT_CHARS, MAX_URL_CHARS, STORE_MASKED_EXCERPT
from .store import default_store

API_PREFIX = "/api/v1"

app = FastAPI(
    title="Ntiyiso Scam Shield API",
    version=__version__,
    description=(
        "Scam detection for people who send money. Checks a pasted message, a "
        "link, or a payment described before it is released, and returns a "
        "plain verdict with reasons and next steps.\n\n"
        "All Mukuru account and transaction data in this service is simulated. "
        "No Mukuru system is accessed."
    ),
    contact={"name": "Ntiyiso — WeThinkCode_ SheHacks Challenge C"},
)

# The web app is served from a different origin during development (localhost:5173)
# and from wherever it is hosted in production, so CORS is open by design for a
# read-mostly, unauthenticated prototype. Tighten before any real launch.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


# ── errors ─────────────────────────────────────────────────────────────────
# The client maps these codes to a message the customer sees, so they are part
# of the contract rather than an implementation detail. See errorMessage() in
# shared/js/customer.js.
#
# The wire shape is {"error": {"code": ..., "message": ...}}, which is what
# apiRequest() reads: (body && body.error && body.error.code). FastAPI's default
# would nest that under "detail", so the handler below flattens it.

class ApiError(HTTPException):
    def __init__(self, code, status, message=None):
        super().__init__(status_code=status, detail={"code": code,
                                                      "message": message or code})


@app.exception_handler(ApiError)
async def _api_error_handler(request, exc: ApiError):
    return JSONResponse(status_code=exc.status_code,
                        content={"error": exc.detail},
                        headers={"Retry-After": "60"} if exc.status_code == 429 else None)


@app.exception_handler(RequestValidationError)
async def _validation_handler(request, exc: RequestValidationError):
    """Pydantic's 422 is turned into the same shape, so the client reads one
    format for every failure. A malformed amount is INVALID_INPUT, not a 500."""
    return JSONResponse(status_code=422,
                        content={"error": {"code": "INVALID_INPUT",
                                           "message": "We could not read that."}})


@app.exception_handler(StarletteHTTPException)
async def _http_error_handler(request, exc: StarletteHTTPException):
    """Framework-level failures use the same shape as everything else.

    FastAPI's default body is `{"detail": "Not Found"}`, which the client cannot
    read — apiRequest() looks for `body.error.code`, finds nothing, and reports a
    generic failure instead of "we could not find that". An unknown route is a
    normal thing for a mistyped URL to produce, so it has to arrive in the shape
    the app already knows how to show.
    """
    codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED",
             401: "UNAUTHORISED", 403: "FORBIDDEN", 429: "RATE_LIMITED"}
    code = codes.get(exc.status_code, "REQUEST_FAILED")
    return JSONResponse(status_code=exc.status_code,
                        content={"error": {"code": code,
                                           "message": exc.detail if isinstance(exc.detail, str)
                                           else code}},
                        headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def _unhandled(request, exc: Exception):
    """Never leak a stack trace to a phone on a bad network."""
    return JSONResponse(status_code=500,
                        content={"error": {"code": "INTERNAL_ERROR",
                                           "message": "Something went wrong on our side."}})


# ── schemas ────────────────────────────────────────────────────────────────

class MessageRequest(BaseModel):
    text: str = Field(..., description="The pasted message, up to %d characters."
                      % MAX_TEXT_CHARS, max_length=MAX_TEXT_CHARS * 2)
    language: str = Field("en", description="Response language: en or zu.")


class LinkRequest(BaseModel):
    url: str = Field(..., description="A single URL.", max_length=MAX_URL_CHARS * 2)
    language: str = "en"


class NewRecipient(BaseModel):
    name: str = Field(..., max_length=120)
    country: str = Field("ZW", max_length=8)


class TransactionRequest(BaseModel):
    amount: float = Field(..., gt=0, le=10_000_000, description="Amount in rand.")
    currency: str = "ZAR"
    purpose: str = Field("family", description="Stated reason for the payment.")
    recipient_id: str | None = Field(None, description="Saved recipient, if any.")
    new_recipient: NewRecipient | None = None
    note: str | None = Field(None, max_length=MAX_TEXT_CHARS)
    language: str = "en"


class ReportRequest(BaseModel):
    check_id: str
    note: str | None = Field(None, max_length=500)


class FeedbackRequest(BaseModel):
    check_id: str
    kind: str = Field("false_positive",
                      description="false_positive, correct, or reported_by_recipient.")


class ReportStatusRequest(BaseModel):
    # Constrained to the four real states, because the stdlib server validates
    # this and a plain `str` let anything through — including a value that then
    # sat in the desk's queue forever with nothing able to match it. The two
    # servers have to accept exactly the same inputs.
    status: Literal["new", "reviewing", "dismissed", "actioned"] = Field(
        ..., description="new, reviewing, dismissed, actioned.")


# ── dependencies ───────────────────────────────────────────────────────────

def get_store():
    return default_store()


# The inbound route reads the store off app.state rather than through Depends,
# so it is wired up once here instead of at import time in its own module.
app.state.store = default_store()


def current_user(x_demo_user: str | None = Header(None, alias="X-Demo-User")) -> str:
    """Who is asking. The prototype has no real authentication.

    The client sends X-Demo-User so one device's history is not visible to
    another. A real deployment replaces this with a signed session token and
    this function is the only thing that changes.
    """
    return (x_demo_user or DEMO_USER).strip()[:64] or DEMO_USER


def rate_limited(user: str = Depends(current_user),
                 store=Depends(get_store)) -> None:
    if not store.allow(user):
        raise ApiError("RATE_LIMITED", 429,
                       "Too many checks just now. Please wait a moment.")


# ── health ─────────────────────────────────────────────────────────────────

@app.get(API_PREFIX + "/health", tags=["meta"])
def health(store=Depends(get_store)):
    """Liveness plus the rules version and the counts behind them."""
    return {
        "status": "ok",
        "service": "ntiyiso-scam-shield",
        "version": __version__,
        "rules_version": RULES_VERSION,
        "stores_masked_excerpt": STORE_MASKED_EXCERPT,
        "languages": ["en", "zu"],
        "checks": store.check_stats(),
        "false_positives_reported": store.false_positive_count(),
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ── the three checks ───────────────────────────────────────────────────────

@app.post(API_PREFIX + "/check/message", response_model=None, tags=["check"])
def check_message(body: MessageRequest, user: str = Depends(current_user),
                  store=Depends(get_store), _: None = Depends(rate_limited)):
    """Check a pasted message.

    Any links inside it are analysed as well as the wording. Returns the verdict
    document, with `highlights` marking the exact phrases that triggered.
    """
    if not body.text or not body.text.strip():
        raise ApiError("INVALID_INPUT", 422, "There is nothing to check yet.")
    result = engine.check_message(body.text, lang=body.language)
    store.record_check(result, body.text, user=user)
    if result["verdict"] == "high_risk":
        store.note_risky_check(user, result["created_at"])
    return result


@app.post(API_PREFIX + "/check/link", response_model=None, tags=["check"])
def check_link(body: LinkRequest, user: str = Depends(current_user),
               store=Depends(get_store), _: None = Depends(rate_limited)):
    """Check a link on its own, with no message around it."""
    if not body.url or not body.url.strip():
        raise ApiError("INVALID_INPUT", 422, "There is no link to check.")
    result = engine.check_link(body.url, lang=body.language)
    store.record_check(result, body.url, user=user)
    if result["verdict"] == "high_risk":
        store.note_risky_check(user, result["created_at"])
    return result


@app.post(API_PREFIX + "/check/transaction", response_model=None, tags=["check"])
def check_transaction(body: TransactionRequest, user: str = Depends(current_user),
                      store=Depends(get_store), _: None = Depends(rate_limited)):
    """Check a payment before it is released.

    Uses the demo user's simulated send history and saved recipients. A
    high-risk payment returns `cooling_off_seconds`, which the app shows as a
    "take ten minutes" prompt.
    """
    if body.amount <= 0:
        raise ApiError("INVALID_INPUT", 422, "Enter an amount greater than zero.")
    if not body.recipient_id and not body.new_recipient:
        raise ApiError("INVALID_INPUT", 422, "Tell us who you are paying.")

    context = store.context_for(user)
    payment = {
        "amount": body.amount,
        "currency": body.currency,
        "purpose": body.purpose,
        "recipient_id": body.recipient_id,
        "new_recipient": (body.new_recipient.model_dump() if body.new_recipient else None),
        "note": body.note,
    }
    result = engine.check_transaction(payment, context=context, lang=body.language)
    store.record_check(result, body.note or body.purpose, user=user)
    return result


# ── reports, feedback, history ─────────────────────────────────────────────

@app.post(API_PREFIX + "/report", tags=["fraud desk"])
def report(body: ReportRequest, user: str = Depends(current_user),
           store=Depends(get_store)):
    """Report a check as a scam. Lands in the fraud desk queue."""
    if not store.get_check(body.check_id):
        raise ApiError("NOT_FOUND", 404, "We could not find that check.")
    return store.add_report(body.check_id, user=user, note=body.note)


@app.post(API_PREFIX + "/feedback", tags=["fraud desk"])
def feedback(body: FeedbackRequest, user: str = Depends(current_user),
             store=Depends(get_store)):
    """Record "this looks wrong". The counter behind the false-alarm claim."""
    if not store.get_check(body.check_id):
        raise ApiError("NOT_FOUND", 404, "We could not find that check.")
    return store.add_feedback(body.check_id, body.kind, user=user)


@app.get(API_PREFIX + "/checks", tags=["history"])
def list_checks(limit: int = Query(20, ge=1, le=100), user: str = Depends(current_user),
                store=Depends(get_store)):
    """Recent checks for this device."""
    return {"items": store.recent_checks(user=user, limit=limit)}


@app.get(API_PREFIX + "/checks/{check_id}", tags=["history"])
def get_check(check_id: str, user: str = Depends(current_user),
              store=Depends(get_store)):
    row = store.get_check(check_id)
    if not row or row["user"] != user:
        raise ApiError("NOT_FOUND", 404, "We could not find that check.")
    return row


@app.delete(API_PREFIX + "/checks", tags=["history"])
def clear_checks(user: str = Depends(current_user), store=Depends(get_store)):
    """Delete this user's checks. POPIA: deletion on request, not a ticket."""
    removed = store.delete_checks(user=user)
    store.reset_rates()
    return {"deleted": removed, "user": user}


# ── fraud desk queue ───────────────────────────────────────────────────────
# Read by the desk console. Not customer-facing; the prototype has no
# authorisation on it, which is stated plainly rather than hidden.

@app.get(API_PREFIX + "/desk/reports", tags=["fraud desk"])
def desk_reports(status: str | None = None, limit: int = Query(50, ge=1, le=200),
                 store=Depends(get_store)):
    return {"items": store.list_reports(status=status, limit=limit)}


@app.patch(API_PREFIX + "/desk/reports/{report_id}", tags=["fraud desk"])
def desk_set_report_status(report_id: int, body: ReportStatusRequest,
                           store=Depends(get_store)):
    return store.set_report_status(report_id, body.status)


@app.get(API_PREFIX + "/desk/stats", tags=["fraud desk"])
def desk_stats(store=Depends(get_store)):
    """Aggregate numbers for the desk overview.

    Counted across every demo user, not just one: the desk is the whole
    operation, so scoping it to a single device would report zero activity
    whenever nobody happened to be using that device's demo account.
    """
    reports = store.list_reports(limit=1000)
    by_status = {}
    for row in reports:
        by_status[row["status"]] = by_status.get(row["status"], 0) + 1
    return {
        "checks": store.check_stats(user=None),
        "false_positives_reported": store.false_positive_count(),
        "reports_by_status": by_status,
        "rules_version": RULES_VERSION,
    }


# Registered last, once every route above exists, so the inbound handler looks
# for them and finds them.
from .routes import whatsapp as _whatsapp  # noqa: E402

_whatsapp.register(app)


if __name__ == "__main__":  # pragma: no cover
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))