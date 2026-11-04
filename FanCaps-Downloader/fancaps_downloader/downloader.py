
from dataclasses import dataclass
from pathlib import Path

import requests

from .config import IMAGE_BASE_URL
from .database import DownloadDatabase


class DownloadBlocked(Exception):
    pass


@dataclass
class DownloadResult:
    status: str
    message: str
    path: Path | None = None


class ImageDownloader:
    def __init__(self, database: DownloadDatabase, timeout: int = 20):
        self.database = database
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "FanCapsDownloader/1.0 (respectful client)"
        })

    def download_one(
        self,
        image_id: int,
        anime_id: int,
        episode_number: str,
        destination: Path
    ) -> DownloadResult:

        destination.parent.mkdir(parents=True, exist_ok=True)

        if destination.exists() and destination.stat().st_size > 0:
            self.database.set_status(
                image_id, anime_id, episode_number, "downloaded", str(destination)
            )
            return DownloadResult("skipped", "Arquivo já existe.", destination)

        url = f"{IMAGE_BASE_URL}/{image_id}.jpg"

        try:
            response = self.session.get(url, timeout=self.timeout)
        except requests.RequestException as exc:
            self.database.set_status(
                image_id, anime_id, episode_number, "error"
            )
            return DownloadResult("error", str(exc))

        content_type = response.headers.get("Content-Type", "").lower()
        body_start = response.content[:500].lower()

        if response.status_code in (403, 429) or b"error 1015" in body_start:
            self.database.set_status(
                image_id, anime_id, episode_number, "blocked"
            )
            raise DownloadBlocked(
                f"Servidor recusou a requisição (HTTP {response.status_code}). "
                "A fila foi interrompida; aguarde e respeite o bloqueio."
            )

        if response.status_code != 200:
            self.database.set_status(
                image_id, anime_id, episode_number, "error"
            )
            return DownloadResult("error", f"HTTP {response.status_code}")

        if "image/" not in content_type:
            self.database.set_status(
                image_id, anime_id, episode_number, "error"
            )
            return DownloadResult(
                "error", "Resposta não parece ser uma imagem."
            )

        temp_path = destination.with_suffix(destination.suffix + ".part")

        try:
            temp_path.write_bytes(response.content)
            temp_path.replace(destination)
        except OSError as exc:
            temp_path.unlink(missing_ok=True)
            self.database.set_status(
                image_id, anime_id, episode_number, "error"
            )
            return DownloadResult("error", str(exc))

        self.database.set_status(
            image_id, anime_id, episode_number, "downloaded", str(destination)
        )

        return DownloadResult(
            "downloaded", "Download concluído.", destination
        )
