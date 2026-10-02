import json
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1].rstrip("/")
SHIELD = BASE  # /check-message sits at the root, not under /api/v1

MESSAGES = [
    ("job fee scam",
     "Congratulations! You have been selected for a job. To secure your position "
     "you must pay a registration fee of R350 today. WhatsApp me right now."),
    ("phishing link",
     "Please confirm your details at http://mukuru-secure-login.xyz/verify now"),
    ("genuine confirmation",
     "Hi, your Mukuru payment of R450 to Ana has been received. "
     "We will never ask for your PIN."),
    ("genuine gov link",
     "Check your grant status at https://www.sassa.gov.za/grant"),
    ("repeated urgency only",
     "urgent urgent urgent urgent urgent urgent"),
]

failures = 0


def check(label, ok, detail=""):
    global failures
    print("  %-58s %s%s" % (label, "ok" if ok else "FAIL", ("  " + detail) if detail and not ok else ""))
    if not ok:
        failures += 1


def post(path, payload):
    request = urllib.request.Request(
        BASE + path if path.startswith("/") else SHIELD + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


print("shield endpoint at %s/check-message" % SHIELD)

for label, text in MESSAGES:
    status, body = post("/check-message", {"message": text})
    risk = body.get("risk", {})

    check("%s: 200" % label, status == 200, "-> %s %s" % (status, body))
    check("%s: the four keys the page reads are present" % label,
          all(k in risk for k in ("risk_level", "risk_score", "reasons",
                                  "recommended_action")),
          "-> %s" % sorted(risk))
    check("%s: risk_level is one of HIGH/MEDIUM/LOW" % label,
          risk.get("risk_level") in ("HIGH", "MEDIUM", "LOW"),
          "-> %r" % risk.get("risk_level"))
    check("%s: risk_score is an int 0-100" % label,
          isinstance(risk.get("risk_score"), int)
          and 0 <= risk["risk_score"] <= 100,
          "-> %r" % risk.get("risk_score"))
    check("%s: the message is echoed back" % label,
          body.get("message") == text)
    check("%s: message_analysis and url_analysis are present" % label,
          "score" in body.get("message_analysis", {})
          and "urls" in body.get("url_analysis", {}))

# The stub is the whole point: a message with a link used to come back link-clean.
_, phishing = post("/check-message", {
    "message": "Please confirm your details at http://mukuru-secure-login.xyz/verify now"})
check("a link in the text is actually found now",
      phishing["url_analysis"]["urls"] == ["http://mukuru-secure-login.xyz/verify"],
      "-> %r" % phishing["url_analysis"]["urls"])
check("that link is scored, not ignored", phishing["url_analysis"]["score"] > 0)
check("a lookalike link reaches HIGH", phishing["risk"]["risk_level"] == "HIGH",
      "-> %r" % phishing["risk"]["risk_level"])

_, genuine = post("/check-message", {
    "message": "Check your grant status at https://www.sassa.gov.za/grant"})
check("an official government link is not called a lookalike",
      genuine["url_analysis"]["score"] == 0
      and genuine["risk"]["risk_level"] == "LOW",
      "-> %s / %s" % (genuine["url_analysis"]["score"],
                      genuine["risk"]["risk_level"]))

_, repeated = post("/check-message", {
    "message": "urgent urgent urgent urgent urgent urgent"})
check("repeating one weak signal does not reach red",
      repeated["risk"]["risk_level"] == "LOW",
      "-> %s" % repeated["risk"]["risk_level"])

# The page's own contract, verified exactly as it is written in whatsapp.html.
_, result = post("/check-message", {
    "message": "Congratulations! You have been selected for a job. To secure "
               "your position you must pay a registration fee of R350 today. "
               "WhatsApp me right now, it is urgent."})
check("the job-fee scam is HIGH with a score and an action",
      result["risk"]["risk_level"] == "HIGH"
      and result["risk"]["risk_score"] > 0
      and bool(result["risk"]["recommended_action"]))

status, body = post("/check-message", {"message": "   "})
check("an empty message is refused in the documented error shape",
      status == 422 and body.get("error", {}).get("code") == "INVALID_INPUT",
      "-> %s %s" % (status, body))

status, body = post("/check-message", {})
check("a missing message is refused too", status == 422,
      "-> %s %s" % (status, body))

print("\n%s" % ("all shield checks passed" if not failures
                else "%d shield checks failed" % failures))
sys.exit(1 if failures else 0)
