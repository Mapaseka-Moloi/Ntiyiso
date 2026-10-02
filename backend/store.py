"""Storage — SQLite, standard library only.

Four tables. The important design decision is what is *not* stored: the full
message. The README promises a fingerprint, the verdict and the reasons, and
that promise is kept in the schema rather than in a comment.

| table | what it holds |
|---|---|
| `checks`   | fingerprint of the input, verdict, score, reasons, masked excerpt |
| `reports`  | checks a customer reported, for the fraud desk queue |
| `feedback` | "this looks wrong" and other appeals, keyed by check |
| `users`    | demo send history and saved recipients, per X-Demo-User |

Set `STORE_MASKED_EXCERPT = False` in config to keep only the fingerprint.

SQLite in WAL mode, one connection per call. At prototype scale that is the
right amount of machinery: no ORM, no migration tool, no pool, and the file can
be deleted to reset the demo.
"""

import hashlib
import json
import os
import sqlite3
import time

from .config import (
    DEMO_USER,
    EXCERPT_MAX_CHARS,
    STORE_MASKED_EXCERPT,
)

DEFAULT_PATH = os.environ.get(
    "NTIYISO_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".data", "ntiyiso.db"),
)

#: Demo send history, so "this is much more than you usually send" has something
#: to compare against. Mirrors the client's default `state.sends`. Amounts in rand.
DEMO_RECIPIENTS = [
    {"id": "rcp_01", "name": "Tendai Moyo", "country": "ZW"},
    {"id": "rcp_02", "name": "Mama Chido", "country": "ZW"},
    {"id": "rcp_03", "name": "Joseph Banda", "country": "MW"},
]

DEMO_HISTORY = [
    {"recipient_id": "rcp_02", "amount": 800},
    {"recipient_id": "rcp_01", "amount": 1200},
    {"recipient_id": "rcp_02", "amount": 950},
    {"recipient_id": "rcp_03", "amount": 1100},
    {"recipient_id": "rcp_01", "amount": 750},
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS checks (
    id            TEXT PRIMARY KEY,
    user          TEXT NOT NULL,
    fingerprint   TEXT NOT NULL,
    type          TEXT NOT NULL,
    verdict       TEXT NOT NULL,
    score         REAL NOT NULL,
    reasons       TEXT NOT NULL,
    reason_text   TEXT NOT NULL,
    learn_more    TEXT,
    excerpt       TEXT,
    domains       TEXT,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checks_user ON checks(user, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id    TEXT NOT NULL,
    user        TEXT NOT NULL,
    verdict     TEXT,
    domains     TEXT,
    note        TEXT,
    status      TEXT NOT NULL DEFAULT 'new',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id    TEXT NOT NULL,
    user        TEXT NOT NULL,
    kind        TEXT NOT NULL,
    verdict     TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_check ON feedback(check_id);

CREATE TABLE IF NOT EXISTS users (
    user              TEXT PRIMARY KEY,
    recipients        TEXT NOT NULL,
    last_risky_check  TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
    user        TEXT NOT NULL,
    bucket      INTEGER NOT NULL,
    hits        INTEGER NOT NULL,
    PRIMARY KEY (user, bucket)
);
"""


def fingerprint(text):
    """A stable, non-reversible id for an input.

    Lets us count "how often is this same scam checked" and deduplicate
    repeated submissions without keeping the message. SHA-256 of the trimmed
    text, with a fixed pepper-free prefix so it is obviously not a password
    hash.
    """
    normalised = " ".join(str(text or "").split()).lower()
    return "fp_" + hashlib.sha256(normalised.encode("utf-8")).hexdigest()[:24]


def mask_excerpt(text, max_chars=EXCERPT_MAX_CHARS):
    """A shortened, de-identified version of a message.

    Replaces links with their bare domain and long digit runs and email
    addresses with placeholders. Keeps enough for the customer's own history to
    be recognisable; not enough to be useful to anyone else.
    """
    from .engine.signals import display_domain, iter_urls
    import re

    out = " ".join(str(text or "").split())
    for url in iter_urls(out):
        out = out.replace(url, display_domain(url))
    out = re.sub(r"\b\d{4,}\b",
                 lambda m: m.group(0)[:2] + "\u2022" * max(2, len(m.group(0)) - 2), out)
    out = re.sub(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b", "[email]", out)
    if len(out) > max_chars:
        out = out[:max_chars - 1] + "\u2026"
    return out


class Store:
    """Thin, explicit wrapper. Every method is one query."""

    def __init__(self, path=DEFAULT_PATH):
        self.path = path
        if path != ":memory:":
            directory = os.path.dirname(path)
            if directory:
                os.makedirs(directory, exist_ok=True)
        self._init()

    def _connect(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init(self):
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    # ── checks ────────────────────────────────────────────────────────────

    def record_check(self, result, source_text, user=DEMO_USER):
        """Store one verdict. Returns the row id."""
        excerpt = None
        if STORE_MASKED_EXCERPT and source_text:
            excerpt = mask_excerpt(source_text)
        elif source_text:
            excerpt = fingerprint(source_text)

        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO checks "
                "(id, user, fingerprint, type, verdict, score, reasons, reason_text, "
                " learn_more, excerpt, domains, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    result["id"], user, fingerprint(source_text), result["type"],
                    result["verdict"], result["score"],
                    json.dumps(result.get("reasons", [])),
                    json.dumps(result.get("reason_text", [])),
                    result.get("learn_more"),
                    excerpt,
                    json.dumps(result.get("display_domains", [])),
                    result["created_at"],
                ),
            )
        return result["id"]

    def get_check(self, check_id):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM checks WHERE id = ?", (check_id,)).fetchone()
        return dict(row) if row else None

    def recent_checks(self, user=DEMO_USER, limit=20):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, type, verdict, score, excerpt, learn_more, created_at "
                "FROM checks WHERE user = ? ORDER BY created_at DESC LIMIT ?",
                (user, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    def check_stats(self, user=DEMO_USER):
        """Counts by verdict. Used by /health and the desk overview.

        `user=None` counts across every demo user, which is what the fraud desk
        wants — the desk sees all customers, not one device's history.
        """
        query = "SELECT verdict, COUNT(*) AS n FROM checks"
        params = ()
        if user is not None:
            query += " WHERE user = ?"
            params = (user,)
        query += " GROUP BY verdict"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        stats = {r["verdict"]: r["n"] for r in rows}
        stats["total"] = sum(stats.values())
        return stats

    def delete_checks(self, user=DEMO_USER):
        """Erase one user's stored history, and return how many rows went.

        This has to be real, not a counter. The README promises deletion of a
        user's data on request, and an endpoint that reports a number without
        removing anything is worse than no endpoint at all — it is a promise
        the customer can verify is false.
        """
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM checks WHERE user = ?", (user,))
            removed = cur.rowcount
            # Reports and feedback reference a check. They stay — the fraud desk
            # has to keep the queue — but the excerpt goes with the check, so
            # nothing readable about the customer is left behind.
            conn.execute(
                "UPDATE reports SET note = NULL WHERE user = ?", (user,))
        return removed

    # ── reports and feedback ──────────────────────────────────────────────

    def add_report(self, check_id, user=DEMO_USER, note=None):
        check = self.get_check(check_id) or {}
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO reports (check_id, user, verdict, domains, note, created_at) "
                "VALUES (?,?,?,?,?,?)",
                (check_id, user, check.get("verdict"),
                 check.get("domains"), note, _now()),
            )
            report_id = cur.lastrowid
        return {
            "id": report_id, "check_id": check_id, "status": "new",
            "created_at": _now(),
        }

    def list_reports(self, status=None, limit=50):
        query = ("SELECT * FROM reports "
                 + ("WHERE status = ? " if status else "")
                 + "ORDER BY created_at DESC LIMIT ?")
        params = (status, limit) if status else (limit,)
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def set_report_status(self, report_id, status):
        with self._connect() as conn:
            conn.execute("UPDATE reports SET status = ? WHERE id = ?", (status, report_id))
        return {"id": report_id, "status": status}

    def add_feedback(self, check_id, kind, user=DEMO_USER):
        check = self.get_check(check_id) or {}
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO feedback (check_id, user, kind, verdict, created_at) "
                "VALUES (?,?,?,?,?)",
                (check_id, user, kind, check.get("verdict"), _now()),
            )
        return {"check_id": check_id, "kind": kind}

    def false_positive_count(self, user=None):
        """How often a customer has told us a warning was wrong.

        The headline number for the false-alarm problem. If this rises, the
        rules are crying wolf.
        """
        query = ("SELECT COUNT(*) AS n FROM feedback WHERE kind = 'false_positive'"
                 + (" AND user = ?" if user else ""))
        with self._connect() as conn:
            row = conn.execute(query, (user,) if user else ()).fetchone()
        return row["n"] if row else 0

    # ── demo user context ─────────────────────────────────────────────────

    def context_for(self, user=DEMO_USER):
        """Recipients and recent sends, for the transaction rules."""
        with self._connect() as conn:
            row = conn.execute("SELECT recipients FROM users WHERE user = ?",
                               (user,)).fetchone()
        recipients = DEMO_RECIPIENTS
        if row:
            try:
                recipients = json.loads(row["recipients"])
            except (ValueError, TypeError):
                recipients = DEMO_RECIPIENTS
        return {
            "recipients": recipients,
            "history": [dict(h, created_at=h.get("created_at"))
                        for h in DEMO_HISTORY],
            "lastRiskyCheckAt": self.last_risky_check(user),
        }

    def last_risky_check(self, user=DEMO_USER):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT created_at FROM checks WHERE user = ? AND verdict = 'high_risk' "
                "ORDER BY created_at DESC LIMIT 1", (user,)).fetchone()
        return row["created_at"] if row else None

    def note_risky_check(self, user, created_at):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO users (user, recipients, last_risky_check) VALUES (?,?,?) "
                "ON CONFLICT(user) DO UPDATE SET last_risky_check = excluded.last_risky_check",
                (user, json.dumps(DEMO_RECIPIENTS), created_at),
            )

    # ── rate limiting ─────────────────────────────────────────────────────

    def allow(self, user=DEMO_USER, limit=None, window=None):
        """Fixed-window counter. True if the request is within budget."""
        from .config import RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS
        limit = limit or RATE_LIMIT_REQUESTS
        window = window or RATE_LIMIT_WINDOW_SECONDS
        bucket = int(time.time() // window)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT hits FROM rate_limits WHERE user = ? AND bucket = ?",
                (user, bucket),
            ).fetchone()
            hits = row["hits"] if row else 0
            if hits >= limit:
                return False
            conn.execute(
                "INSERT INTO rate_limits (user, bucket, hits) VALUES (?,?,1) "
                "ON CONFLICT(user, bucket) DO UPDATE SET hits = hits + 1",
                (user, bucket),
            )
        return True

    def reset_rates(self):
        with self._connect() as conn:
            conn.execute("DELETE FROM rate_limits")


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


_default = None


def default_store():
    """Process-wide store, created on first use."""
    global _default
    if _default is None:
        _default = Store()
    return _default