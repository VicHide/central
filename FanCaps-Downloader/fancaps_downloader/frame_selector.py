
from dataclasses import dataclass
from pathlib import Path

import imagehash
from PIL import Image, ImageOps


SUPPORTED_FORMATS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
}


@dataclass
class FrameSelectionResult:
    selected: list[Path]
    discarded: list[Path]
    total: int

    @property
    def selected_count(self) -> int:
        return len(self.selected)

    @property
    def discarded_count(self) -> int:
        return len(self.discarded)


class FrameSelector:
    def __init__(self, threshold: int = 4):
        self.threshold = max(0, threshold)

    @staticmethod
    def get_images(directory: Path) -> list[Path]:
        if not directory.exists():
            return []

        return sorted(
            [
                path
                for path in directory.iterdir()
                if path.is_file()
                and path.suffix.lower() in SUPPORTED_FORMATS
            ],
            key=lambda path: path.name.casefold()
        )

    @staticmethod
    def calculate_hash(path: Path):
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGB")
            return imagehash.phash(image)

    def select(
        self,
        images: list[Path],
        mode: str = "best",
        interval: int = 3,
    ) -> FrameSelectionResult:

        images = list(images)
        total = len(images)

        if mode == "all":
            return FrameSelectionResult(
                selected=images,
                discarded=[],
                total=total,
            )

        if mode == "interval":
            interval = max(1, interval)

            selected = images[::interval]
            selected_set = set(selected)

            discarded = [
                path for path in images
                if path not in selected_set
            ]

            return FrameSelectionResult(
                selected=selected,
                discarded=discarded,
                total=total,
            )

        if mode != "best":
            raise ValueError(
                f"Modo de seleção inválido: {mode}"
            )

        selected = []
        discarded = []
        previous_hash = None

        for path in images:
            try:
                current_hash = self.calculate_hash(path)

            except (OSError, ValueError):
                # Preserva imagens que não puderam ser analisadas.
                selected.append(path)
                previous_hash = None
                continue

            if previous_hash is None:
                selected.append(path)
                previous_hash = current_hash
                continue

            distance = previous_hash - current_hash

            if distance <= self.threshold:
                discarded.append(path)
            else:
                selected.append(path)
                previous_hash = current_hash

        return FrameSelectionResult(
            selected=selected,
            discarded=discarded,
            total=total,
        )
