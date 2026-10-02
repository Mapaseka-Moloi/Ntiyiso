#!/usr/bin/env python3
"""Prove the JavaScript engine and the Python engine are the same engine.

    python tools/parity_check.py
    python tools/parity_check.py --verbose

The rules exist twice: once in `shared/js/customer.js` (which the browser runs,
and which keeps working when the API is unreachable) and once in `backend/engine/`
(which the API runs). Every weight, threshold and regex is transcribed rather
than shared, because the browser cannot import a Python file and the API must
not ship a bundler.

Two transcriptions of one specification is, eventually, two engines. The only
way to know they still agree is to run both over the same inputs and compare, so
that is what this does — every case in backend/fixtures/cases.json goes through
the JavaScript engine under Node and through the Python engine, and any
difference in verdict, score, reasons, instruction, steps, highlights or
mitigators is reported.

This runs as part of tools/check_all.py. A disagreement is a build failure, not
a warning: it means a customer would see a different warning depending on whether
their phone happened to reach the server, which is the worst possible bug in a
fraud product.

Two things are deliberately *not* compared:

* `id` and `created_at` — each side generates its own.
* Nothing time-dependent that sits near a boundary. Transaction fixtures pin the
  clock so both engines see the same "now".
"""

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend import engine  # noqa: E402
from tools.eval_fixtures import FIXED_NOW, demo_context  # noqa: E402

HARNESS = os.path.join(ROOT, "tools", "engine_parity.mjs")
FIXTURES = os.path.join(ROOT, "backend", "fixtures", "cases.json")


def jobs_from(fixtures):
    """Every fixture, in the shape the Node harness reads from stdin."""
    with open(fixtures, encoding="utf-8") as fh:
        data = json.load(fh)

    jobs = []
    for case in data.get("message", []):
        jobs.append({"kind": "message", "id": case["id"],
                     "text": case["text"], "language": "en"})
    for case in data.get("link", []):
        jobs.append({"kind": "link", "id": case["id"],
                     "url": case["url"], "language": "en"})
    for case in data.get("transaction", []):
        jobs.append({"kind": "transaction", "id": case["id"],
                     "payment": case["payment"],
                     "context": demo_context(case), "language": "en"})
    return jobs


def run_javascript(jobs):
    """Hand every job to the browser engine and collect what it says."""
    payload = "\n".join(json.dumps(job) for job in jobs) + "\n"
    environment = dict(os.environ)
    environment["NTIYISO_FIXED_NOW_MS"] = str(int(FIXED_NOW * 1000))
    try:
        completed = subprocess.run(
            ["node", HARNESS],
            input=payload, capture_output=True, text=True, timeout=180,
            cwd=ROOT, env=environment,
            # Explicitly UTF-8: the fixtures and the reason text contain em
            # dashes and isiZulu diacritics, and the default on Windows is the
            # ANSI code page, which would silently replace them with U+FFFD and
            # then report a spurious disagreement.
            encoding="utf-8",
        )
    except FileNotFoundError:
        sys.exit("parity: node is not on PATH — cannot run the browser engine")
    except subprocess.TimeoutExpired:
        sys.exit("parity: the Node harness did not finish within 180s")

    if completed.returncode != 0:
        sys.exit("parity: the Node harness exited %d\n%s"
                 % (completed.returncode, completed.stderr.strip()[:2000]))

    results = {}
    for line in completed.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if row.get("error"):
            sys.exit("parity: the browser engine failed on %s: %s"
                     % (row.get("id"), row["error"]))
        results[row["id"]] = row
    return results


def run_python(job):
    if job["kind"] == "message":
        return engine.check_message(job["text"], lang="en", now=FIXED_NOW)
    if job["kind"] == "link":
        return engine.check_link(job["url"], lang="en", now=FIXED_NOW)
    return engine.check_transaction(job["payment"], context=job["context"],
                                    lang="en", now=FIXED_NOW)


def comparable(result):
    """The Python result, reduced to the fields the harness compares."""
    return {
        "verdict": result["verdict"],
        "score": result["score"],
        "confidence": result["confidence"],
        "reasons": result["reasons"],
        "reason_text": result["reason_text"],
        "instruction": result["instruction"],
        "next_steps": result["next_steps"],
        "highlights": result["highlights"],
        "display_domains": result["display_domains"],
        "learn_more": result["learn_more"],
        "language": result["language"],
        "cooling_off_seconds": result.get("cooling_off_seconds"),
        "debug": {
            "codes": [s["code"] for s in result["debug"]["signals"]],
            "corroboration_met": result["debug"]["corroboration_met"],
            "mitigators_applied": result["debug"]["mitigators_applied"],
        },
    }


#: Fields the harness carries for reporting only. `id` is the fixture's own
#: identifier, which each side echoes back but neither computes.
NOT_COMPARED = {"id"}


def compare(js_row, py_row):
    """Field-by-field. Returns a list of human-readable differences."""
    differences = []
    for field, js_value in js_row.items():
        if field in NOT_COMPARED:
            continue
        py_value = py_row.get(field)
        if js_value != py_value:
            differences.append((field, js_value, py_value))
    return differences


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fixtures", default=FIXTURES)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    jobs = jobs_from(args.fixtures)
    js_results = run_javascript(jobs)

    missing = [j["id"] for j in jobs if j["id"] not in js_results]
    if missing:
        sys.exit("parity: the browser engine returned nothing for: %s"
                 % ", ".join(missing))

    disagreements = []
    for job in jobs:
        js_row = js_results[job["id"]]
        py_row = comparable(run_python(job))
        differences = compare(js_row, py_row)
        if differences:
            disagreements.append((job, differences))
        elif args.verbose:
            print("  agree  %-22s %-13s %.2f" % (job["id"], js_row["verdict"], js_row["score"]))

    print("=" * 64)
    print("  JavaScript engine vs Python engine")
    print("=" * 64)
    print("  cases compared      %d" % len(jobs))
    print("  agreements          %d" % (len(jobs) - len(disagreements)))
    print("  disagreements       %d" % len(disagreements))
    print()

    if not disagreements:
        print("  Both engines return the same verdict, score, reasons, instruction,")
        print("  next steps, highlights and policy mitigators for every fixture.")
        print("  A customer sees the same warning whether or not the API is reachable.")
        return 0

    print("  The two engines disagree. A customer would be warned differently")
    print("  depending on whether their phone reached the server. Fix whichever")
    print("  side is wrong, then re-run.")
    print()
    for job, differences in disagreements:
        print("  [%s] %s" % (job["kind"], job["id"]))
        for field, js_value, py_value in differences:
            print("      %-20s js=%s" % (field, json.dumps(js_value, ensure_ascii=False)))
            print("      %-20s py=%s" % ("", json.dumps(py_value, ensure_ascii=False)))
        print()
    return 1


if __name__ == "__main__":
    sys.exit(main())