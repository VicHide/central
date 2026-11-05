
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Episode:
    number: str
    page_id: int | None
    image_ids: list[int]
    first_image_id: int | None
    last_image_id: int | None
    source: str

    @property
    def complete(self) -> bool:
        return self.source == "explicit" and bool(self.image_ids)

    @property
    def has_interval(self) -> bool:
        return (
            self.first_image_id is not None
            and self.last_image_id is not None
            and self.first_image_id <= self.last_image_id
        )

    @property
    def download_image_count(self) -> int:
        if self.image_ids:
            return len(self.image_ids)

        if self.has_interval:
            return self.last_image_id - self.first_image_id + 1

        return 0

    def iter_download_ids(self):
        if self.image_ids:
            yield from self.image_ids
            return

        if self.has_interval:
            yield from range(
                self.first_image_id,
                self.last_image_id + 1
            )

    @property
    def title(self) -> str:
        if self.number.isdigit():
            return f"Episode {self.number}"

        return self.number


@dataclass
class Anime:
    id: int
    title: str
    episodes: list[Episode]


class CatalogError(Exception):
    pass


class Catalog:
    def __init__(self, json_path: Path):
        self.json_path = json_path
        self.anime: list[Anime] = []

    @staticmethod
    def _optional_int(value: Any) -> int | None:
        if value is None:
            return None

        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def load(self) -> list[Anime]:
        if not self.json_path.exists():
            raise CatalogError(
                f"Dataset não encontrado: {self.json_path}\n"
                "Coloque anime_data.json dentro da pasta data."
            )

        try:
            raw = json.loads(
                self.json_path.read_text(encoding="utf-8")
            )
        except (json.JSONDecodeError, OSError) as exc:
            raise CatalogError(
                f"Não foi possível ler o JSON: {exc}"
            ) from exc

        if not isinstance(raw, list):
            raise CatalogError(
                "Formato inesperado: a raiz do JSON precisa ser uma lista."
            )

        parsed = []

        for item in raw:
            if not isinstance(item, dict):
                continue

            try:
                anime_id = int(item["id"])
                title = str(item["title"])
            except (KeyError, TypeError, ValueError):
                continue

            episodes = []

            for ep in item.get("episodes", []) or []:
                if not isinstance(ep, dict):
                    continue

                raw_ids = ep.get("valid_images_ids")

                clean_ids = []

                if isinstance(raw_ids, list):
                    for value in raw_ids:
                        image_id = self._optional_int(value)

                        if image_id is not None and image_id > 0:
                            clean_ids.append(image_id)

                # Remove duplicatas preservando a ordem.
                clean_ids = list(dict.fromkeys(clean_ids))

                first_image_id = self._optional_int(
                    ep.get("first_image_id")
                )

                last_image_id = self._optional_int(
                    ep.get("last_image_id")
                )

                if clean_ids:
                    source = "explicit"
                elif (
                    first_image_id is not None
                    and last_image_id is not None
                    and first_image_id <= last_image_id
                ):
                    source = "interval"
                else:
                    source = "missing"

                episodes.append(
                    Episode(
                        number=str(
                            ep.get("episode", len(episodes) + 1)
                        ),
                        page_id=self._optional_int(ep.get("id")),
                        image_ids=clean_ids,
                        first_image_id=first_image_id,
                        last_image_id=last_image_id,
                        source=source,
                    )
                )

            parsed.append(
                Anime(
                    id=anime_id,
                    title=title,
                    episodes=episodes,
                )
            )

        self.anime = sorted(
            parsed,
            key=lambda anime: anime.title.casefold()
        )

        return self.anime

    def search(self, query: str) -> list[Anime]:
        q = query.strip().casefold()

        if not q:
            return self.anime

        return [
            anime
            for anime in self.anime
            if q in anime.title.casefold()
        ]
