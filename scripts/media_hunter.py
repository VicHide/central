#!/usr/bin/env python3
"""
Buscador e downloader gratuito de mídias por cena (sem API paga).
- Imagens: DuckDuckGo Images (se instalado) + fallback Wallhaven API (anime/games HD).
- Vídeos/Clipes: yt-dlp (ytsearch / URL direta YouTube ou Twitch) + ffmpeg recorte por trecho.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
}


def search_images_ddg(query: str, limit: int) -> list[dict]:
    try:
        from ddgs import DDGS  # type: ignore
    except Exception:
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except Exception:
            return []

    items: list[dict] = []
    try:
        with DDGS() as ddgs:
            for row in ddgs.images(query, max_results=limit, safesearch="moderate"):
                url = row.get("image") or ""
                thumb = row.get("thumbnail") or url
                if not url:
                    continue
                items.append(
                    {
                        "source": "duckduckgo",
                        "kind": "image",
                        "title": row.get("title") or query,
                        "url": url,
                        "thumbnail": thumb,
                        "width": row.get("width") or 0,
                        "height": row.get("height") or 0,
                    }
                )
    except Exception:
        return []
    return items


def search_images_bing(query: str, limit: int) -> list[dict]:
    import html
    import re

    params = urllib.parse.urlencode({"q": query, "first": "0", "count": str(max(limit * 2, 10)), "qft": "+filterui:imagesize-large"})
    req = urllib.request.Request(f"https://www.bing.com/images/async?{params}", headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except Exception:
        return []

    items: list[dict] = []
    seen: set[str] = set()
    for m in re.finditer(r'm="([^"]+)"', raw):
        try:
            meta = json.loads(html.unescape(m.group(1)))
        except Exception:
            continue
        url = meta.get("murl") or ""
        thumb = meta.get("turl") or url
        if not url or url in seen or not url.startswith("http"):
            continue
        seen.add(url)
        items.append(
            {
                "source": "bing",
                "kind": "image",
                "title": meta.get("t") or query,
                "url": url,
                "thumbnail": thumb,
                "width": 0,
                "height": 0,
            }
        )
        if len(items) >= limit:
            break
    return items


def search_images_wallhaven(query: str, limit: int) -> list[dict]:
    def _fetch(q: str) -> list[dict]:
        params = urllib.parse.urlencode(
            {
                "q": q,
                "purity": "100",
                "sorting": "relevance",
                "page": "1",
            }
        )
        req = urllib.request.Request(f"https://wallhaven.cc/api/v1/search?{params}", headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception:
            return []

        out: list[dict] = []
        for row in (payload.get("data") or [])[:limit]:
            thumbs = row.get("thumbs") or {}
            u = row.get("path") or ""
            if not u:
                continue
            out.append(
                {
                    "source": "wallhaven",
                    "kind": "image",
                    "title": f"Wallhaven {row.get('id', '')}".strip(),
                    "url": u,
                    "thumbnail": thumbs.get("large") or thumbs.get("original") or u,
                    "width": row.get("dimension_x") or 0,
                    "height": row.get("dimension_y") or 0,
                }
            )
        return out

    items = _fetch(query)
    if not items and len(query.split()) > 3:
        short_q = " ".join(query.split()[:3])
        items = _fetch(short_q)
    return items


def search_videos_ytdlp(query: str, limit: int) -> list[dict]:
    ytdlp = shutil.which("yt-dlp")
    cmd = [ytdlp] if ytdlp else [sys.executable, "-m", "yt_dlp"]
    search_expr = query if query.startswith("http") else f"ytsearch{limit}:{query}"
    cmd.extend(["--dump-json", "--flat-playlist", "--no-warnings", "--socket-timeout", "10", search_expr])

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
    except Exception:
        return []

    if proc.returncode != 0 or not proc.stdout.strip():
        return []

    items: list[dict] = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        vid_id = row.get("id") or ""
        url = row.get("webpage_url") or row.get("url") or (f"https://www.youtube.com/watch?v={vid_id}" if vid_id else "")
        if not url:
            continue
        if not url.startswith("http") and vid_id:
            url = f"https://www.youtube.com/watch?v={vid_id}"
        thumbs = row.get("thumbnails") or []
        thumb = row.get("thumbnail") or (thumbs[-1].get("url") if thumbs else "")
        items.append(
            {
                "source": "youtube",
                "kind": "video",
                "title": row.get("title") or query,
                "url": url,
                "thumbnail": thumb or "",
                "duration": row.get("duration") or 0,
                "channel": row.get("channel") or row.get("uploader") or "",
            }
        )
    return items[:limit]


def cmd_search(args: argparse.Namespace) -> int:
    results: list[dict] = []
    if args.kind in ("image", "both"):
        imgs = search_images_bing(args.query, args.limit)
        if len(imgs) < args.limit:
            imgs.extend(search_images_wallhaven(args.query, args.limit - len(imgs)))
        if len(imgs) < args.limit:
            imgs.extend(search_images_ddg(args.query, args.limit - len(imgs)))
        results.extend(imgs[: args.limit])

    if args.kind in ("video", "both"):
        vids = search_videos_ytdlp(args.query, min(args.limit, 4))
        results.extend(vids[: args.limit])

    print(json.dumps({"ok": True, "query": args.query, "items": results}, ensure_ascii=False))
    return 0


def cmd_download(args: argparse.Namespace) -> int:
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if args.kind == "image":
        req = urllib.request.Request(args.url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if not data:
            raise RuntimeError("Imagem vazia retornada pelo servidor.")
        out_path.write_bytes(data)
        print(json.dumps({"ok": True, "path": str(out_path), "bytes": len(data)}, ensure_ascii=False))
        return 0

    ytdlp = shutil.which("yt-dlp")
    cmd = [ytdlp] if ytdlp else [sys.executable, "-m", "yt_dlp"]
    temp_raw = out_path.with_suffix(".raw.mp4")
    if temp_raw.exists():
        temp_raw.unlink()

    dl_cmd = cmd + [
        "-f",
        "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
        "--merge-output-format",
        "mp4",
        "--no-playlist",
        "-o",
        str(temp_raw),
        args.url,
    ]
    if args.start >= 0 and args.duration > 0:
        end_sec = args.start + args.duration
        dl_cmd.extend(["--download-sections", f"*{args.start}-{end_sec}"])

    proc = subprocess.run(dl_cmd, capture_output=True, text=True, timeout=180, check=False)
    if proc.returncode != 0 or not temp_raw.exists():
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "Falha ao baixar vídeo via yt-dlp.")

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg and args.duration > 0:
        trim_cmd = [
            ffmpeg,
            "-y",
            "-i",
            str(temp_raw),
            "-t",
            str(args.duration),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "21",
            "-an",
            "-movflags",
            "+faststart",
            str(out_path),
        ]
        fproc = subprocess.run(trim_cmd, capture_output=True, text=True, timeout=120, check=False)
        if fproc.returncode == 0 and out_path.exists():
            temp_raw.unlink(missing_ok=True)
        else:
            temp_raw.replace(out_path)
    else:
        temp_raw.replace(out_path)

    print(
        json.dumps(
            {"ok": True, "path": str(out_path), "bytes": out_path.stat().st_size},
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Buscador e downloader gratuito de mídias por cena")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_search = sub.add_parser("search")
    p_search.add_argument("--query", required=True)
    p_search.add_argument("--kind", choices=["image", "video", "both"], default="both")
    p_search.add_argument("--limit", type=int, default=6)

    p_dl = sub.add_parser("download")
    p_dl.add_argument("--url", required=True)
    p_dl.add_argument("--kind", choices=["image", "video"], required=True)
    p_dl.add_argument("--out", required=True)
    p_dl.add_argument("--start", type=float, default=0)
    p_dl.add_argument("--duration", type=float, default=6)

    args = parser.parse_args()
    try:
        if args.cmd == "search":
            return cmd_search(args)
        return cmd_download(args)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
