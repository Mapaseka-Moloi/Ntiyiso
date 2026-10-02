#!/usr/bin/env python3
"""Evaluate the verdict engine against the labelled fixture set.

    python tools/eval_fixtures.py           # report
    python tools/eval_fixtures.py --strict  # non-zero exit on any miss

Two numbers matter, and the second one matters more:

**Missed scams** are the failure that costs someone money.

**False positives** are the failure that costs us the right to warn anyone. A
detector that flags everything scores well on the first number and is worthless
in the field, because a warning people have learned to ignore protects nobody.
That is why the fixture set in backend/fixtures/cases.json contains genuine
messages, and why several of them are deliberately hard: they mention PINs, use
genuine urgency, or sit on a real brand's domain. Those entries are what catch
a regression.

Each case declares a label (what a human concluded) and an expect (the minimum
verdict we are willing to ship). A miss is either:

* `missed`   - expect was at least high_risk, we returned something calmer
* `noisy`    - we returned high_risk on a case labelled legitimate or suspect

`--verbose` prints every case with its reasons, which is what you want when a
rule changes and you need to see which signal moved.
"""

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend import engine  # noqa: E402
from backend.store import Store  # noqa: E402

FIXTURES = os.path.join(ROOT, "backend", "fixtures", "cases.json")

#: Ordering of severity, so "at least" comparisons work.
SEVERITY = {"looks_genuine": 0, "suspicious": 1, "high_risk": 2}

#: A minute, because the transaction rules look at a rolling hour.
FIXED_NOW = 1_772_000_000.0


def load(path=FIXTURES):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _epoch(minutes_ago):
    return FIXED_NOW - minutes_ago * 60


def _iso(epoch):
    import time
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def demo_context(case):
    """Recipients and history for a transaction case."""
    recipients = [
        {"id": "rcp_01", "name": "Tendai Moyo", "country": "ZW"},
        {"id": "rcp_02", "name": "Mama Chido", "country": "ZW"},
        {"id": "rcp_03", "name": "Joseph Banda", "country": "MW"},
    ]
    base = 6 * 24 * 60          # oldest demo send, six days back
    history = [
        {"recipient_id": "rcp_02", "amount": 800, "created_at": _iso(FIXED_NOW - base * 60)},
        {"recipient_id": "rcp_01", "amount": 1200, "created_at": _iso(FIXED_NOW - 4 * 24 * 3600)},
        {"recipient_id": "rcp_02", "amount": 950, "created_at": _iso(FIXED_NOW - 3 * 24 * 3600)},
        {"recipient_id": "rcp_03", "amount": 1100, "created_at": _iso(FIXED_NOW - 2 * 24 * 3600)},
        {"recipient_id": "rcp_01", "amount": 750, "created_at": _iso(FIXED_NOW - 24 * 3600)},
    ]
    context = {"recipients": recipients, "history": history, "lastRiskyCheckAt": None}

    risky = case.get("context_last_risky_check")
    if risky:
        # "N minutes ago" / "N hours ago" / "just now"
        text = str(risky).lower()
        amount, unit = 0, "minutes"
        words = text.split()
        for i, word in enumerate(words):
            if word.isdigit():
                amount = int(word)
                unit = words[i + 1].rstrip("s") if i + 1 < len(words) else "minutes"
        minutes = amount * (60 if unit.startswith("hour") else 1)
        context["lastRiskyCheckAt"] = _iso(_epoch(minutes))

    for i in range(case.get("context_extra_new_sends", 0)):
        history.append({
            "recipient_id": "rcp_new_%d" % i,
            "amount": 500,
            "created_at": _iso(FIXED_NOW - (10 + i) * 60),
        })
    return context


def run_case(case, kind):
    """One fixture through the engine. Returns (actual, result)."""
    if kind == "message":
        result = engine.check_message(case["text"], lang="en", now=FIXED_NOW)
    elif kind == "link":
        result = engine.check_link(case["url"], lang="en", now=FIXED_NOW)
    else:
        result = engine.check_transaction(case["payment"], context=demo_context(case),
                                          lang="en", now=FIXED_NOW)
    return result["verdict"], result


def classify(label, expected, actual):
    """One of ok, missed, noisy.

    `expect` is enforced in both directions. An earlier version only failed a
    case when the label was `legitimate`, which quietly hid two real problems:
    a bare shortener and a warning-then-pay sequence both came back calmer than
    we said we would ship them. Amber is a warning too — on a genuine message
    it is crying wolf just as much as red.
    """
    want = SEVERITY[expected]
    got = SEVERITY[actual]
    if got < want:
        return "missed"
    if got > want and label == "legitimate":
        return "noisy"
    return "ok"


def evaluate(path=FIXTURES, verbose=False):
    data = load(path)
    rows = []
    for kind in ("message", "link", "transaction"):
        for case in data.get(kind, []):
            actual, result = run_case(case, kind)
            status = classify(case["label"], case["expect"], actual)
            rows.append({
                "kind": kind, "id": case["id"], "label": case["label"],
                "expect": case["expect"], "actual": actual, "status": status,
                "score": result["score"], "reasons": result["reasons"],
                "why": case.get("why", ""),
                "mitigators": result["debug"]["mitigators_applied"],
            })
    return rows


def render(rows, verbose=False):
    icons = {"ok": "  ok  ", "missed": " MISS ", "noisy": " NOISY"}
    if verbose:
        width = max(len(r["id"]) for r in rows) + 2
        print("%-9s %-*s %-12s %-12s %5s  %s"
              % ("kind", width, "id", "expected", "actual", "score", "reasons"))
        print("-" * 100)
        for r in rows:
            print("%-9s %-*s %-12s %-12s %5.2f  %s"
                  % (r["kind"], width, r["id"], r["expect"], r["actual"], r["score"],
                     ", ".join(r["reasons"]) or "-"))
            if r["mitigators"]:
                print("%s%s  mitigators: %s" % (" " * 10, " " * width,
                                                ", ".join(r["mitigators"])))
        print()

    total = len(rows)
    missed = [r for r in rows if r["status"] == "missed"]
    noisy = [r for r in rows if r["status"] == "noisy"]

    scam_rows = [r for r in rows if r["label"] == "scam"]
    legit_rows = [r for r in rows if r["label"] == "legitimate"]
    caught = [r for r in scam_rows if SEVERITY[r["actual"]] >= SEVERITY["high_risk"]]
    # Counted at any severity. A genuine message that comes back amber has still
    # cried wolf — the customer is told to go and check something that is fine.
    false_pos = [r for r in legit_rows if r["actual"] != "looks_genuine"]
    red_pos = [r for r in legit_rows if r["actual"] == "high_risk"]

    print("=" * 64)
    print("  Ntiyiso verdict engine - fixture evaluation")
    print("=" * 64)
    print("  cases              %d" % total)
    print("  missed             %d   (calmer than we said we would ship)"
          % len(missed))
    print("  false positives    %d   (%d red, %d amber, on genuine messages)"
          % (len(false_pos), len(red_pos), len(false_pos) - len(red_pos)))
    print()
    if scam_rows:
        print("  scam cases         %d/%d returned HIGH RISK"
              % (len(caught), len(scam_rows)))
    if legit_rows:
        print("  genuine cases      %d/%d stayed clean"
              % (len(legit_rows) - len(false_pos), len(legit_rows)))
    print()
    print("  " + ("all cases met their expected verdict"
                  if not missed and not noisy else
                  "%d case(s) did not meet expectations" % (len(missed) + len(noisy))))

    for r in missed + noisy:
        print()
        print("  [%s] %s (%s)" % (icons[r["status"]].strip(), r["id"], r["kind"]))
        print("    expected %s, got %s (score %.2f)" % (r["expect"], r["actual"], r["score"]))
        print("    %s" % r["why"])
        print("    reasons: %s" % (", ".join(r["reasons"]) or "none"))

    print()
    print("  Note: this set is written by the team and is not representative of")
    print("  real scam traffic. Treat these numbers as a regression guard, not as")
    print("  a claim about accuracy in the field.")
    return len(missed) + len(noisy)


def main():
    parser = argparse.ArgumentParser(description="Evaluate the verdict engine.")
    parser.add_argument("--fixtures", default=FIXTURES)
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--strict", action="store_true",
                        help="exit non-zero if any case misses")
    args = parser.parse_args()

    rows = evaluate(args.fixtures, verbose=args.verbose)
    failures = render(rows, verbose=args.verbose)
    return 1 if (args.strict and failures) else 0


if __name__ == "__main__":
    sys.exit(main())