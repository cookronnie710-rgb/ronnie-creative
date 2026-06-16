import sqlite3
from datetime import datetime
from pathlib import Path


class Tracker:
    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS applications (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id      TEXT    NOT NULL,
                    company     TEXT,
                    title       TEXT,
                    contact_email TEXT,
                    status      TEXT,
                    cover_letter TEXT,
                    msg_id      TEXT,
                    error       TEXT,
                    sent_at     TEXT
                )
            """)

    def already_sent(self, job_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM applications WHERE job_id = ? AND status = 'sent'",
                (str(job_id),),
            ).fetchone()
            return row is not None

    def log(
        self,
        job: dict,
        *,
        status: str,
        cover_letter: str = "",
        msg_id: str | None = None,
        error: str | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO applications
                    (job_id, company, title, contact_email, status, cover_letter, msg_id, error, sent_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(job["id"]),
                    job.get("company"),
                    job.get("title"),
                    job.get("contact_email"),
                    status,
                    cover_letter,
                    msg_id,
                    error,
                    datetime.utcnow().isoformat(),
                ),
            )

    def get_stats(self) -> dict[str, int]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) as cnt FROM applications GROUP BY status"
            ).fetchall()
            return {r["status"]: r["cnt"] for r in rows}

    def get_recent(self, n: int = 20) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM applications ORDER BY sent_at DESC LIMIT ?", (n,)
            ).fetchall()
            return [dict(r) for r in rows]

    def export_csv(self, path: str) -> None:
        import csv
        rows = self.get_recent(n=999999)
        if not rows:
            return
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
