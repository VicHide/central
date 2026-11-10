import threading
from pathlib import Path

from .config import DOWNLOAD_DIR
from .frame_selector import FrameSelector


class FrameAnalysisService:
    def __init__(self):
        self.lock = threading.RLock()
        self.worker = None
        self.state = {
            "status": "idle",
            "anime": None,
            "total": 0,
            "processed": 0,
            "progress": 0,
            "selected": [],
            "discarded": [],
            "deleted_count": 0,
            "error": None,
        }

    def _folder(self, anime):
        if not isinstance(anime, str) or not anime.strip() or anime in {".", ".."}:
            raise ValueError("Selecione uma pasta válida do acervo.")
        if "/" in anime or "\\" in anime:
            raise ValueError("Nome de pasta inválido.")

        root = DOWNLOAD_DIR.resolve()
        folder = (root / anime).resolve()
        if not folder.is_relative_to(root) or not folder.is_dir():
            raise ValueError("A pasta selecionada não existe no acervo.")
        return folder

    def snapshot(self):
        with self.lock:
            return dict(self.state)

    def start(self, anime, threshold=4):
        folder = self._folder(anime)
        try:
            threshold = int(threshold)
        except (TypeError, ValueError):
            raise ValueError("Sensibilidade inválida.")
        if threshold < 0 or threshold > 16:
            raise ValueError("A sensibilidade deve ficar entre 0 e 16.")

        with self.lock:
            if self.state["status"] == "running":
                raise RuntimeError("Já existe uma análise em andamento.")

            images = FrameSelector.get_images(folder)
            if not images:
                raise ValueError("Essa pasta não contém imagens compatíveis.")

            self.state = {
                "status": "running",
                "anime": anime,
                "total": len(images),
                "processed": 0,
                "progress": 0,
                "selected": [],
                "discarded": [],
                "deleted_count": 0,
                "error": None,
            }
            self.worker = threading.Thread(
                target=self._run,
                args=(folder, images, threshold),
                daemon=True,
            )
            self.worker.start()
            return dict(self.state)

    def _run(self, folder, images, threshold):
        try:
            selector = FrameSelector(threshold=threshold)

            def update_progress(processed, total):
                with self.lock:
                    self.state["processed"] = processed
                    self.state["progress"] = round(processed / max(1, total) * 100)

            result = selector.select(images, mode="best", progress_callback=update_progress)
            with self.lock:
                self.state.update({
                    "status": "completed",
                    "processed": result.total,
                    "progress": 100,
                    "selected": [path.name for path in result.selected],
                    "discarded": [path.name for path in result.discarded],
                })
        except Exception as exc:
            with self.lock:
                self.state.update({"status": "error", "error": str(exc)})

    def delete_discarded(self, anime, confirmed):
        if confirmed is not True:
            raise ValueError("A exclusão precisa ser confirmada.")
        folder = self._folder(anime)

        with self.lock:
            if self.state["status"] != "completed" or self.state["anime"] != anime:
                raise RuntimeError("Faça uma análise concluída dessa pasta antes de excluir.")
            discarded = list(self.state["discarded"])
            selected = set(self.state["selected"])

        deleted = []
        for name in discarded:
            if not isinstance(name, str) or name in selected or Path(name).name != name:
                continue
            target = (folder / name).resolve()
            if target.parent != folder or not target.is_file():
                continue
            target.unlink()
            deleted.append(name)

        with self.lock:
            self.state["discarded"] = []
            self.state["deleted_count"] += len(deleted)
            self.state["total"] = len(self.state["selected"])
            self.state["processed"] = self.state["total"]
            self.state["progress"] = 100
            return {
                **dict(self.state),
                "deleted": len(deleted),
            }
