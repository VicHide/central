import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .catalog import Catalog, CatalogError
from .config import DATASET_PATH, DOWNLOAD_DIR, DATABASE_PATH
from .database import DownloadDatabase
from .downloader import DownloadBlocked, ImageDownloader
from .frame_jobs import FrameAnalysisService


HOST = "127.0.0.1"
PORT = 8765
PAGE_SIZE = 30


def safe_name(value: str) -> str:
    invalid = '<>:"/\\|?*'
    cleaned = "".join("_" if char in invalid else char for char in value)
    return cleaned.strip().rstrip(".")


class QueueService:
    def __init__(self):
        self.catalog = Catalog(DATASET_PATH)
        self.anime = self.catalog.load()
        self.by_id = {item.id: item for item in self.anime}
        self.database = DownloadDatabase(DATABASE_PATH)
        self.items = []
        self.lock = threading.RLock()
        self.pause_event = threading.Event()
        self.cancel_event = threading.Event()
        self.active = False
        self.worker = None
        self.current_key = None
        self.last_error = None
        self.last_summary = None
        self.logs = []

    def log_event(self, message: str, level: str = "info"):
        self.logs.append({"time": time.time(), "level": level, "message": message})
        if len(self.logs) > 300:
            del self.logs[:-300]

    def catalog_page(self, query: str, page: int):
        matches = [
            item for item in self.anime
            if query.casefold() in item.title.casefold()
        ]
        start = max(0, page) * PAGE_SIZE
        return {
            "items": [
                {
                    "id": item.id,
                    "title": item.title,
                    "episodes": len(item.episodes),
                    "downloadable": sum(ep.download_image_count > 0 for ep in item.episodes),
                }
                for item in matches[start:start + PAGE_SIZE]
            ],
            "total": len(matches),
            "page": max(0, page),
            "page_size": PAGE_SIZE,
        }

    def episodes(self, anime_id: int):
        anime = self.by_id.get(anime_id)
        if anime is None:
            raise ValueError("Anime não encontrado no catálogo.")
        return {
            "anime": {"id": anime.id, "title": anime.title},
            "episodes": [
                {
                    "number": ep.number,
                    "title": ep.title,
                    "source": ep.source,
                    "image_count": ep.download_image_count,
                    "available": ep.download_image_count > 0,
                    "registered": self.database.get_episode_summary(anime.id, ep.number),
                }
                for ep in anime.episodes
            ],
        }

    def add(self, anime_id: int, episode_number: str):
        with self.lock:
            if self.active:
                raise RuntimeError("A fila está em andamento. Aguarde para adicionar episódios.")
            anime = self.by_id.get(anime_id)
            if anime is None:
                raise ValueError("Anime não encontrado no catálogo.")
            episode = next((ep for ep in anime.episodes if ep.number == str(episode_number)), None)
            if episode is None:
                raise ValueError("Episódio não encontrado.")
            if episode.download_image_count <= 0:
                raise ValueError("Este episódio não possui IDs disponíveis para download.")

            key = f"{anime.id}:{episode.number}"
            existing = next((item for item in self.items if item["key"] == key), None)
            if existing:
                return self.snapshot()

            folder = DOWNLOAD_DIR / safe_name(anime.title)
            self.items.append({
                "key": key,
                "anime_id": anime.id,
                "anime_title": anime.title,
                "episode_number": episode.number,
                "episode_title": episode.title,
                "image_count": episode.download_image_count,
                "processed": 0,
                "downloaded": 0,
                "skipped": 0,
                "errors": 0,
                "status": "waiting",
                "current_image_id": None,
                "folder": str(folder),
            })
            self.log_event(f"Episódio adicionado: {anime.title} · {episode.title}.", "success")
            return self.snapshot()

    def remove(self, key: str):
        with self.lock:
            if self.active:
                raise RuntimeError("Pause ou encerre a fila antes de remover episódios.")
            item = next((entry for entry in self.items if entry["key"] == key), None)
            if item is None:
                raise ValueError("Episódio não encontrado na fila.")
            if item["status"] != "waiting":
                raise ValueError("Só é possível remover episódios que ainda aguardam.")
            self.items.remove(item)
            self.log_event(f"Removido da fila: {item['anime_title']} · {item['episode_title']}.", "warning")
            return self.snapshot()

    def move(self, key: str, direction: str):
        with self.lock:
            if self.active:
                raise RuntimeError("Pause ou encerre a fila antes de reordenar episódios.")
            indexes = [i for i, item in enumerate(self.items) if item["status"] == "waiting"]
            current = next((i for i in indexes if self.items[i]["key"] == key), None)
            if current is None:
                raise ValueError("Episódio aguardando não encontrado.")
            position = indexes.index(current)
            target_position = position - 1 if direction == "up" else position + 1
            if target_position < 0 or target_position >= len(indexes):
                return self.snapshot()
            target = indexes[target_position]
            self.items[current], self.items[target] = self.items[target], self.items[current]
            moved = self.items[target]
            self.log_event(f"Ordem atualizada: {moved['anime_title']} · {moved['episode_title']}.", "info")
            return self.snapshot()

    def snapshot(self):
        with self.lock:
            items = [{k: v for k, v in item.items() if k != "folder"} for item in self.items]
            totals = {
                "episodes": len(items),
                "images": sum(item["image_count"] for item in items),
                "downloaded": sum(item["downloaded"] for item in items),
                "skipped": sum(item["skipped"] for item in items),
                "errors": sum(item["errors"] for item in items),
                "processed": sum(item["processed"] for item in items),
            }
            state = "paused" if self.active and self.pause_event.is_set() else "running" if self.active else "idle"
            return {
                "active": self.active,
                "paused": state == "paused",
                "state": state,
                "current_key": self.current_key,
                "items": items,
                "totals": totals,
                "last_error": self.last_error,
                "last_summary": self.last_summary,
                "logs": self.logs[-100:],
                "project_root": str(Path(__file__).resolve().parents[1]),
                "download_dir": str(DOWNLOAD_DIR.resolve()),
            }

    def start(self):
        with self.lock:
            if self.active:
                raise RuntimeError("A fila já está em andamento.")
            pending = [item for item in self.items if item["status"] == "waiting"]
            if not pending:
                raise ValueError("Não há episódios aguardando na fila.")
            self.cancel_event.clear()
            self.pause_event.clear()
            self.active = True
            self.log_event(f"Fila iniciada com {len(pending)} episódio(s).", "success")
            self.last_error = None
            self.last_summary = None
            self.worker = threading.Thread(target=self._run, args=(pending,), daemon=True)
            self.worker.start()
            return self.snapshot()

    def pause(self):
        with self.lock:
            if not self.active:
                raise RuntimeError("Não existe uma fila em andamento.")
            self.pause_event.set()
            self.log_event("Fila pausada pelo usuário.", "warning")
            return self.snapshot()

    def resume(self):
        with self.lock:
            if not self.active:
                raise RuntimeError("Não existe uma fila pausada.")
            self.pause_event.clear()
            self.log_event("Fila retomada.", "success")
            return self.snapshot()

    def clear(self):
        with self.lock:
            if self.active and not self.pause_event.is_set():
                raise RuntimeError("Pause a fila antes de limpá-la.")

            worker = None
            if self.active:
                self.cancel_event.set()
                self.pause_event.clear()
                worker = self.worker

        # Aguarda o download atual terminar sem manter o lock.
        if worker and worker.is_alive():
            worker.join()

        with self.lock:
            removed_count = len(self.items)
            self.items.clear()
            self.log_event(f"Fila limpa: {removed_count} episódio(s) removido(s).", "warning")
            self.current_key = None
            self.last_error = None
            self.last_summary = None
            self.cancel_event.clear()
            return self.snapshot()

    def _wait_if_paused(self):
        while self.pause_event.is_set() and not self.cancel_event.is_set():
            time.sleep(0.2)
        return self.cancel_event.is_set()

    def _run(self, pending):
        downloader = ImageDownloader(self.database)
        blocked = False
        try:
            for item in pending:
                if self._wait_if_paused():
                    break

                with self.lock:
                    self.current_key = item["key"]
                    item["status"] = "running"
                anime = self.by_id[item["anime_id"]]
                episode = next(ep for ep in anime.episodes if ep.number == item["episode_number"])
                folder = Path(item["folder"])
                folder.mkdir(parents=True, exist_ok=True)

                for image_id in episode.iter_download_ids():
                    if self._wait_if_paused():
                        break

                    result = downloader.download_one(
                        image_id=image_id,
                        anime_id=anime.id,
                        episode_number=episode.number,
                        destination=folder / f"{image_id}.jpg",
                    )
                    with self.lock:
                        item["processed"] += 1
                        item["current_image_id"] = image_id
                        if result.status == "downloaded":
                            item["downloaded"] += 1
                            self.log_event(f"Imagem {image_id} baixada · {item['anime_title']} · {item['episode_title']}.", "success")
                        elif result.status == "skipped":
                            item["skipped"] += 1
                        else:
                            item["errors"] += 1
                            self.log_event(f"Falha na imagem {image_id} · {item['anime_title']} · {item['episode_title']}.", "error")

                    if self.cancel_event.is_set():
                        break

                    if item["processed"] < item["image_count"]:
                        if self.pause_event.wait(1.5):
                            self._wait_if_paused()

                if self.cancel_event.is_set():
                    break

                with self.lock:
                    item["status"] = "completed"
                    item["current_image_id"] = None

            self._wait_if_paused()
        except DownloadBlocked as exc:
            blocked = True
            with self.lock:
                current = next((x for x in self.items if x["key"] == self.current_key), None)
                if current:
                    current["status"] = "blocked"
                    current["current_image_id"] = None
                self.last_error = str(exc)
            self.log_event(f"Bloqueio do servidor: {exc}", "error")
        except Exception as exc:
            with self.lock:
                current = next((x for x in self.items if x["key"] == self.current_key), None)
                if current:
                    current["status"] = "error"
                self.last_error = str(exc)
                self.log_event(f"Erro na fila: {exc}", "error")
        finally:
            with self.lock:
                self.active = False
                self.pause_event.clear()
                self.current_key = None
                totals = self.snapshot()["totals"]
                result = "blocked" if blocked else "error" if self.last_error else "completed"
                self.last_summary = {**totals, "result": result}
                self.log_event(f"Fila finalizada: {totals['downloaded']} baixadas, {totals['skipped']} existentes e {totals['errors']} erros.", "error" if result != "completed" else "success")


frame_service = FrameAnalysisService()

try:
    service = QueueService()
    startup_error = None
except Exception as exc:
    service = None
    startup_error = str(exc)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 100_000:
            raise ValueError("Corpo da requisição muito grande.")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/health":
            return self.send_json({"ok": True, "catalog_ready": service is not None, "error": startup_error, "project_root": str(Path(__file__).resolve().parents[1]), "download_dir": str(DOWNLOAD_DIR.resolve())})
        if parsed.path == "/frames":
            return self.send_json(frame_service.snapshot())
        if service is None:
            return self.send_json({"erro": startup_error or "Serviço indisponível."}, 503)
        try:
            if parsed.path == "/catalog":
                return self.send_json(service.catalog_page(query.get("q", [""])[0], int(query.get("page", ["0"])[0])))
            if parsed.path == "/episodes":
                return self.send_json(service.episodes(int(query.get("anime_id", ["0"])[0])))
            if parsed.path == "/queue":
                return self.send_json(service.snapshot())
            return self.send_json({"erro": "Rota não encontrada."}, 404)
        except (ValueError, TypeError) as exc:
            return self.send_json({"erro": str(exc)}, 400)

    def do_POST(self):
        if self.path == "/frames/analyze":
            try:
                body = self.read_json()
                return self.send_json(frame_service.start(body.get("anime"), body.get("threshold", 4)))
            except RuntimeError as exc:
                return self.send_json({"erro": str(exc)}, 409)
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                return self.send_json({"erro": str(exc)}, 400)
        if self.path == "/frames/delete":
            try:
                body = self.read_json()
                return self.send_json(frame_service.delete_discarded(body.get("anime"), body.get("confirmed") is True))
            except RuntimeError as exc:
                return self.send_json({"erro": str(exc)}, 409)
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                return self.send_json({"erro": str(exc)}, 400)
        if service is None:
            return self.send_json({"erro": startup_error or "Serviço indisponível."}, 503)
        try:
            if self.path == "/queue":
                body = self.read_json()
                result = service.add(int(body.get("anime_id", 0)), str(body.get("episode_number", "")))
            elif self.path == "/start":
                result = service.start()
            elif self.path == "/pause":
                result = service.pause()
            elif self.path == "/resume":
                result = service.resume()
            elif self.path == "/clear":
                result = service.clear()
            else:
                return self.send_json({"erro": "Rota não encontrada."}, 404)
            return self.send_json(result)
        except RuntimeError as exc:
            return self.send_json({"erro": str(exc)}, 409)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return self.send_json({"erro": str(exc)}, 400)


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"FanCaps API disponível em http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
