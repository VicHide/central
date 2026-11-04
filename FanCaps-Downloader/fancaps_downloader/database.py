
import sqlite3
from pathlib import Path


class DownloadDatabase:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _initialize(self):
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS downloads (
                    image_id INTEGER PRIMARY KEY,
                    anime_id INTEGER NOT NULL,
                    episode_number TEXT NOT NULL,
                    status TEXT NOT NULL,
                    file_path TEXT,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def set_status(
        self,
        image_id: int,
        anime_id: int,
        episode_number: str,
        status: str,
        file_path: str | None = None
    ):
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO downloads (
                    image_id, anime_id, episode_number,
                    status, file_path, updated_at
                )
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(image_id) DO UPDATE SET
                    anime_id = excluded.anime_id,
                    episode_number = excluded.episode_number,
                    status = excluded.status,
                    file_path = excluded.file_path,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (image_id, anime_id, episode_number, status, file_path),
            )

    def count_status(self, status: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM downloads WHERE status = ?",
                (status,)
            ).fetchone()
            return int(row[0])

    def get_summary(self, anime_id: int) -> dict:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT status, COUNT(*)
                FROM downloads
                WHERE anime_id = ?
                GROUP BY status
                """,
                (anime_id,)
            ).fetchall()

        return {
            status: count
            for status, count in rows
        }

    def get_episode_summary(
        self,
        anime_id: int,
        episode_number: str
    ) -> dict:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT status, COUNT(*)
                FROM downloads
                WHERE anime_id = ? AND episode_number = ?
                GROUP BY status
                """,
                (anime_id, str(episode_number))
            ).fetchall()

        return {
            status: count
            for status, count in rows
        }

    def get_recent(self, limit: int = 100) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT image_id, anime_id, episode_number,
                       status, file_path, updated_at
                FROM downloads
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (max(1, limit),)
            ).fetchall()

        return [
            {
                "image_id": row[0],
                "anime_id": row[1],
                "episode_number": row[2],
                "status": row[3],
                "file_path": row[4],
                "updated_at": row[5],
            }
            for row in rows
        ]
