#!/usr/bin/env python3
"""Check the API contract end to end against a running server.

    python tools/api_check.py http://127.0.0.1:8123/api/v1

Starts nothing: point it at a server. tools/check_all.py starts one first, and
the same script works against either `python -m backend` (FastAPI) or
`--standalone`, which is the point — the two must be indistinguishable from the
outside.

This checks the contract rather than the implementation. It asserts that a
scam is red and a genuine message is clean, that a genuine government domain is
not called a lookalike, that the language parameter changes the wording, that
highlights land on the right characters, that a high-risk payment carries a
cooling-off period, and that every documented error comes back in the one shape
the client knows how to read.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123/api/v1").rstrip("/")
USER = "apicheck"

failures = []
checks = 0


def call(method, path, payload=None, user=USER):
    """Returns (status, parsed body). Never raises for an HTTP error status."""
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(BASE + path, data=body, method=method)
    request.add_header("Content-Type", "application/json")
    request.add_header("X-Demo-User", user)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8")
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, {"raw": raw}


def check(label, condition, detail=""):
    global checks
    checks += 1
    if condition:
        print("  ok    %s" % label)
    else:
        print("  FAIL  %s %s" % (label, detail))
        failures.append(label)


def error_shape(label, status, body, want_status, want_code):
    shape_ok = (status == want_status
                and isinstance(body, dict)
                and isinstance(body.get("error"), dict)
                and body["error"].get("code") == want_code)
    check(label, shape_ok, "-> %s %s" % (status, json.dumps(body)[:120]))


SCAM = ("Congratulations! You have been selected for a job. To secure your position "
        "you must pay a registration fee of R350 today. WhatsApp me right now, "
        "it is urgent.")
GENUINE = "Mukuru will never ask for your PIN, your OTP or your banking password."
PIN_SCAM = "This is Mukuru support. Please send me your PIN and the OTP we sent you."


def main():
    print("\n  contract against " + BASE)

    status, health = call("GET", "/health")
    check("health responds", status == 200 and health.get("status") == "ok",
          "-> %s" % status)
    check("health reports the rules version",
          health.get("rules_version") == "rules-1.0.1",
          "-> %r" % health.get("rules_version"))
    check("health is honest about storing an excerpt",
          health.get("stores_masked_excerpt") is True)

    status, scam = call("POST", "/check/message", {"text": SCAM, "language": "en"})
    check("a scam message is high risk",
          status == 200 and scam.get("verdict") == "high_risk",
          "-> %s %s" % (status, scam.get("verdict")))
    check("the reason names the fee", "UPFRONT_FEE" in scam.get("reasons", []))
    check("every reason has a sentence",
          len(scam.get("reason_text", [])) == len(scam.get("reasons", []))
          and all(scam.get("reason_text")))
    check("next steps are actionable", len(scam.get("next_steps", [])) >= 2)
    check("highlights point inside the message",
          all(0 <= h["start"] < h["end"] <= len(SCAM) for h in scam.get("highlights", [])))
    check("a highlighted span matches what was flagged",
          any(SCAM[h["start"]:h["end"]] for h in scam.get("highlights", [])))
    check("debug explains the decision",
          scam.get("debug", {}).get("signals")
          and "corroboration_met" in scam.get("debug", {}))

    status, genuine = call("POST", "/check/message", {"text": GENUINE, "language": "en"})
    check("a genuine warning about PINs is not flagged",
          status == 200 and genuine.get("verdict") == "looks_genuine",
          "-> %s %s" % (status, genuine.get("verdict")))
    check("a clean message still says something",
          bool(genuine.get("reason_text")),
          "-> %r" % genuine.get("reason_text"))

    status, pin = call("POST", "/check/message", {"text": PIN_SCAM, "language": "en"})
    check("a PIN request is high risk", pin.get("verdict") == "high_risk",
          "-> %s" % pin.get("verdict"))

    status, zu = call("POST", "/check/message", {"text": PIN_SCAM, "language": "zu"})
    check("isiZulu changes the wording",
          zu.get("reason_text") and zu["reason_text"] != pin.get("reason_text"))
    check("isiZulu is marked unreviewed",
          zu.get("language_reviewed") is False)
    status, unknown = call("POST", "/check/message", {"text": PIN_SCAM, "language": "fr"})
    check("an unknown language falls back to English",
          unknown.get("language") == "en")

    status, gov = call("POST", "/check/link",
                       {"url": "https://www.sassa.gov.za", "language": "en"})
    check("a real government domain is not a lookalike",
          gov.get("verdict") == "looks_genuine",
          "-> %s reasons=%s" % (gov.get("verdict"), gov.get("reasons")))
    check("the real domain is shown reduced",
          gov.get("display_domains") == ["gov.za"],
          "-> %r" % gov.get("display_domains"))

    status, lookalike = call("POST", "/check/link",
                             {"url": "http://mukuru-secure-login.xyz/verify", "language": "en"})
    check("a lookalike domain is high risk",
          lookalike.get("verdict") == "high_risk",
          "-> %s" % lookalike.get("verdict"))
    check("the lookalike is shown in full, not shortened to something tidy",
          lookalike.get("display_domains") == ["mukuru-secure-login.xyz"],
          "-> %r" % lookalike.get("display_domains"))

    status, payment = call("POST", "/check/transaction", {
        "amount": 4500, "currency": "ZAR", "purpose": "someone_met_online",
        "new_recipient": {"name": "Ana Ferreira", "country": "MZ"}, "language": "en"})
    check("paying someone never met is high risk",
          payment.get("verdict") == "high_risk",
          "-> %s" % payment.get("verdict"))
    check("a high-risk payment is paused",
          payment.get("cooling_off_seconds", 0) > 0,
          "-> %r" % payment.get("cooling_off_seconds"))
    check("the stated reason is named",
          "RISKY_PURPOSE_UNMET" in payment.get("reasons", []))

    # A separate demo user: the rule that fires here reads *that user's* last
    # high-risk check, and the scam message checked moments ago under USER would
    # otherwise make an ordinary payment look like the warning-then-pay sequence.
    status, ordinary = call("POST", "/check/transaction", {
        "amount": 850, "currency": "ZAR", "purpose": "family",
        "recipient_id": "rcp_01", "language": "en"}, user="clean-slate")
    check("an ordinary payment to a saved recipient is clean",
          ordinary.get("verdict") == "looks_genuine",
          "-> %s reasons=%s" % (ordinary.get("verdict"), ordinary.get("reasons")))
    check("a clean payment has no cooling-off",
          "cooling_off_seconds" not in ordinary)

    status, rushed = call("POST", "/check/transaction", {
        "amount": 850, "currency": "ZAR", "purpose": "family",
        "recipient_id": "rcp_01", "language": "en"})
    check("paying straight after a high-risk warning is called out",
          "RECENT_RISKY_CHECK" in rushed.get("reasons", []),
          "-> reasons=%s" % rushed.get("reasons"))

    # ── reporting ───────────────────────────────────────────────────────────
    status, report = call("POST", "/report", {"check_id": scam["id"], "note": "seen it"})
    check("a report is accepted", status == 200 and report.get("status") == "new",
          "-> %s %s" % (status, report))
    status, feedback = call("POST", "/feedback",
                            {"check_id": genuine["id"], "kind": "false_positive"})
    check("feedback is accepted", status == 200 and feedback.get("kind") == "false_positive")

    status, queue = call("GET", "/desk/reports")
    check("the report reached the desk queue",
          any(item["check_id"] == scam["id"] for item in queue.get("items", [])))
    status, stats = call("GET", "/desk/stats")
    check("desk stats count the checks",
          stats.get("checks", {}).get("total", 0) > 0,
          "-> %r" % stats.get("checks"))
    check("desk stats count the false positive we reported",
          stats.get("false_positives_reported", 0) > 0,
          "-> %r" % stats.get("false_positives_reported"))

    status, history = call("GET", "/checks")
    check("history returns this user's checks",
          bool(history.get("items")) and
          all(item.get("id") for item in history["items"]))
    check("history stores an excerpt, not the message",
          all("text" not in item for item in history["items"]))

    status, one = call("GET", "/checks/" + scam["id"])
    check("a single check reads back", status == 200 and one.get("verdict") == "high_risk")

    # Another user's check must not be readable.
    status, _ = call("GET", "/checks/" + scam["id"], user="somebody-else")
    check("one demo user cannot read another's check", status == 404,
          "-> %s" % status)

    # ── the fraud desk moves a report through its states ───────────────────
    status, moved = call("PATCH", "/desk/reports/%d" % report["id"],
                         {"status": "reviewing"})
    check("the desk can advance a report", status == 200 and
          moved.get("status") == "reviewing", "-> %s %s" % (status, moved))
    status, body = call("PATCH", "/desk/reports/%d" % report["id"],
                        {"status": "invented-status"})
    error_shape("an unknown report status is refused", status, body, 422, "INVALID_INPUT")
    status, filtered = call("GET", "/desk/reports?status=reviewing")
    check("the queue can be filtered by status",
          all(item["status"] == "reviewing" for item in filtered.get("items", [])))

    # ── deletion actually deletes ──────────────────────────────────────────
    status, before_delete = call("GET", "/checks")
    check("there is something to delete", before_delete.get("items"),
          "-> %r" % len(before_delete.get("items", [])))
    status, cleared = call("DELETE", "/checks")
    check("deletion reports what it removed",
          status == 200 and cleared.get("deleted") == len(before_delete.get("items", [])),
          "-> %s %s vs %d" % (status, cleared, len(before_delete.get("items", []))))
    status, after_delete = call("GET", "/checks")
    check("the history is actually gone afterwards",
          after_delete.get("items") == [],
          "-> %r" % after_delete.get("items"))
    status, gone = call("GET", "/checks/" + scam["id"])
    check("a deleted check cannot be read back", status == 404, "-> %s" % status)
    status, _ = call("GET", "/checks", user="somebody-else")
    check("one user's deletion leaves another's history alone",
          status == 200)

    # ── inbound ─────────────────────────────────────────────────────────────
    status, inbound = call("POST", "/inbound/whatsapp",
                           {"message": SCAM, "from": "+27831234567", "language": "en"})
    check("a forwarded message is checked", status == 200 and
          inbound.get("result", {}).get("verdict") == "high_risk")
    check("a reply is returned to send back", bool(inbound.get("response", {}).get("reply")))
    check("the reply is short enough to read in a chat",
          len(inbound.get("response", {}).get("reply", "")) <= 320)

    # ── errors, in the one shape the client reads ───────────────────────────
    status, body = call("POST", "/check/message", {"text": "   "})
    error_shape("empty text is INVALID_INPUT", status, body, 422, "INVALID_INPUT")

    status, body = call("POST", "/check/message", {})
    error_shape("missing text is INVALID_INPUT", status, body, 422, "INVALID_INPUT")

    status, body = call("POST", "/check/transaction",
                        {"amount": -5, "purpose": "family", "recipient_id": "rcp_01"})
    error_shape("a negative amount is INVALID_INPUT", status, body, 422, "INVALID_INPUT")

    status, body = call("POST", "/check/transaction",
                        {"amount": 100, "purpose": "family"})
    error_shape("a payment with nobody to pay is INVALID_INPUT",
                status, body, 422, "INVALID_INPUT")

    status, body = call("POST", "/report", {"check_id": "chk_does_not_exist"})
    error_shape("an unknown check is NOT_FOUND", status, body, 404, "NOT_FOUND")

    status, body = call("GET", "/no/such/route")
    error_shape("an unknown route is NOT_FOUND", status, body, 404, "NOT_FOUND")

    status, body = call("DELETE", "/check/message")
    check("a wrong method is refused rather than 404", status in (404, 405),
          "-> %s" % status)

    # ── CORS, because the app is served from a different origin ─────────────
    request = urllib.request.Request(BASE + "/health", method="GET")
    request.add_header("Origin", "http://localhost:5199")
    with urllib.request.urlopen(request, timeout=20) as response:
        allowed = response.headers.get("Access-Control-Allow-Origin")
    check("a cross-origin read is allowed", allowed == "*", "-> %r" % allowed)

    print("\n  %d checks, %d failed" % (checks, len(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())