
import os
import queue
import shutil
import threading
import time

from datetime import datetime
from pathlib import Path

import customtkinter as ctk

from tkinter import filedialog, messagebox
from PIL import Image

from .catalog import Catalog, CatalogError, Anime
from .config import DATASET_PATH, DOWNLOAD_DIR, DATABASE_PATH
from .database import DownloadDatabase
from .downloader import ImageDownloader, DownloadBlocked
from .frame_selector import FrameSelector


ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

PAGE_SIZE = 50


class FanCapsApp(ctk.CTk):

    def __init__(self):
        super().__init__()

        self.title("FanCaps Downloader")
        self.geometry("1180x780")
        self.minsize(1000, 680)

        self.catalog = Catalog(DATASET_PATH)
        self.frame_selector = FrameSelector()
        self.database = DownloadDatabase(DATABASE_PATH)

        self.anime_items = []
        self.filtered_anime = []
        self.current_anime = None
        self.current_episode = None

        self.current_page = 0
        self.local_counts = {}
        self.worker = None
        self.download_worker = None
        self.download_active = False
        self.download_queue = []
        self.download_queue_keys = set()

        self.local_folder = None
        self.events = queue.Queue()
        self.preview_images = []
        self.last_result = None

        self._build_ui()
        self._load_catalog()

        self.after(150, self._process_events)

    # =========================================================
    # INTERFACE
    # =========================================================

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        header = ctk.CTkFrame(self, corner_radius=0)
        header.grid(row=0, column=0, sticky="ew")

        ctk.CTkLabel(
            header,
            text="FanCaps Downloader",
            font=ctk.CTkFont(size=25, weight="bold")
        ).pack(side="left", padx=22, pady=18)

        ctk.CTkLabel(
            header,
            text="Gerenciador de imagens e frames",
            text_color="gray"
        ).pack(side="right", padx=22)

        self.tabs = ctk.CTkTabview(self, corner_radius=10)
        self.tabs.grid(
            row=1,
            column=0,
            padx=18,
            pady=18,
            sticky="nsew"
        )

        self.tabs.add("Downloads")
        self.tabs.add("Seleção de frames")

        self._build_download_tab()
        self._build_frame_tab()

    # =========================================================
    # ABA DOWNLOADS
    # =========================================================

    def _build_download_tab(self):
        tab = self.tabs.tab("Downloads")

        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(1, weight=1)

        toolbar = ctk.CTkFrame(tab)
        toolbar.grid(
            row=0,
            column=0,
            sticky="ew",
            padx=10,
            pady=10
        )

        toolbar.grid_columnconfigure(0, weight=1)

        self.search_entry = ctk.CTkEntry(
            toolbar,
            placeholder_text="Pesquisar anime..."
        )
        self.search_entry.grid(
            row=0,
            column=0,
            padx=10,
            pady=10,
            sticky="ew"
        )
        self.search_entry.bind(
            "<KeyRelease>",
            lambda _event: self._filter_anime()
        )

        ctk.CTkButton(
            toolbar,
            text="Atualizar catálogo",
            command=self._load_catalog,
            width=150
        ).grid(row=0, column=1, padx=6, pady=10)

        self.queue_start_button = ctk.CTkButton(
            toolbar,
            text="Iniciar fila (0)",
            command=self._start_download_queue,
            width=130
        )
        self.queue_start_button.grid(row=0, column=2, padx=6, pady=10)

        self.queue_clear_button = ctk.CTkButton(
            toolbar,
            text="Limpar fila",
            command=self._clear_download_queue,
            width=100
        )
        self.queue_clear_button.grid(row=0, column=3, padx=6, pady=10)

        content = ctk.CTkFrame(tab, fg_color="transparent")
        content.grid(
            row=1,
            column=0,
            sticky="nsew",
            padx=10,
            pady=(0, 10)
        )

        content.grid_columnconfigure(0, weight=1)
        content.grid_columnconfigure(1, weight=2)
        content.grid_rowconfigure(0, weight=1)

        anime_panel = ctk.CTkFrame(content)
        anime_panel.grid(
            row=0,
            column=0,
            sticky="nsew",
            padx=(0, 8)
        )

        anime_panel.grid_rowconfigure(1, weight=1)
        anime_panel.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            anime_panel,
            text="Catálogo",
            font=ctk.CTkFont(size=17, weight="bold")
        ).grid(
            row=0,
            column=0,
            padx=14,
            pady=12,
            sticky="w"
        )

        self.anime_list = ctk.CTkScrollableFrame(anime_panel)
        self.anime_list.grid(
            row=1,
            column=0,
            sticky="nsew",
            padx=8,
            pady=(0, 8)
        )

        pagination = ctk.CTkFrame(
            anime_panel,
            fg_color="transparent"
        )
        pagination.grid(
            row=2,
            column=0,
            sticky="ew",
            padx=8,
            pady=8
        )

        self.previous_button = ctk.CTkButton(
            pagination,
            text="Anterior",
            width=90,
            command=self._previous_page
        )
        self.previous_button.pack(side="left", padx=4)

        self.page_label = ctk.CTkLabel(
            pagination,
            text="Página 1"
        )
        self.page_label.pack(side="left", expand=True)

        self.next_button = ctk.CTkButton(
            pagination,
            text="Próxima",
            width=90,
            command=self._next_page
        )
        self.next_button.pack(side="right", padx=4)

        episode_panel = ctk.CTkFrame(content)
        episode_panel.grid(
            row=0,
            column=1,
            sticky="nsew",
            padx=(8, 0)
        )

        episode_panel.grid_rowconfigure(2, weight=1)
        episode_panel.grid_columnconfigure(0, weight=1)

        self.download_heading = ctk.CTkLabel(
            episode_panel,
            text="Selecione um anime",
            font=ctk.CTkFont(size=20, weight="bold")
        )
        self.download_heading.grid(
            row=0,
            column=0,
            padx=15,
            pady=(15, 5),
            sticky="w"
        )

        self.download_summary = ctk.CTkLabel(
            episode_panel,
            text="Os dados serão exibidos aqui.",
            text_color="gray",
            justify="left",
            anchor="w"
        )
        self.download_summary.grid(
            row=1,
            column=0,
            padx=15,
            pady=5,
            sticky="ew"
        )

        self.episode_list = ctk.CTkScrollableFrame(
            episode_panel,
            label_text="Episódios"
        )
        self.episode_list.grid(
            row=2,
            column=0,
            padx=10,
            pady=10,
            sticky="nsew"
        )

        bottom = ctk.CTkFrame(
            episode_panel,
            fg_color="transparent"
        )
        bottom.grid(
            row=3,
            column=0,
            padx=10,
            pady=10,
            sticky="ew"
        )

        bottom.grid_columnconfigure(0, weight=1)

        self.download_folder_label = ctk.CTkLabel(
            bottom,
            text=f"Pasta: {DOWNLOAD_DIR}",
            text_color="gray",
            anchor="w",
            wraplength=600
        )
        self.download_folder_label.grid(
            row=0,
            column=0,
            padx=5,
            pady=5,
            sticky="ew"
        )

        ctk.CTkButton(
            bottom,
            text="Abrir pasta de downloads",
            command=self._open_download_folder
        ).grid(
            row=1,
            column=0,
            padx=5,
            pady=5,
            sticky="w"
        )

        self.download_status = ctk.CTkLabel(
            bottom,
            text="Fila de downloads ociosa",
            text_color="gray",
            anchor="w"
        )
        self.download_status.grid(
            row=2,
            column=0,
            padx=5,
            pady=(8, 2),
            sticky="ew"
        )

        self.download_progress = ctk.CTkProgressBar(bottom)
        self.download_progress.set(0)
        self.download_progress.grid(
            row=3,
            column=0,
            padx=5,
            pady=(2, 8),
            sticky="ew"
        )

        self.queue_items_label = ctk.CTkLabel(
            bottom,
            text="Episódios na fila: nenhum",
            text_color="gray",
            anchor="w",
            justify="left",
            wraplength=650
        )
        self.queue_items_label.grid(
            row=4,
            column=0,
            padx=5,
            pady=(0, 5),
            sticky="ew"
        )

        self.catalog_status = ctk.CTkLabel(
            tab,
            text="Pronto",
            text_color="gray",
            anchor="w"
        )
        self.catalog_status.grid(
            row=2,
            column=0,
            padx=15,
            pady=(0, 8),
            sticky="ew"
        )

    # =========================================================
    # PAGINAÇÃO E CATÁLOGO
    # =========================================================

    def _load_catalog(self):
        try:
            self.catalog_status.configure(
                text="Carregando catálogo..."
            )
            self.update_idletasks()

            self.anime_items = self.catalog.load()
            self.local_counts.clear()

            self.search_entry.delete(0, "end")
            self.filtered_anime = list(self.anime_items)
            self.current_page = 0

            self._render_anime_list()

            self.catalog_status.configure(
                text=(
                    f"{len(self.anime_items)} animes carregados "
                    f"• Dataset: {DATASET_PATH}"
                )
            )

        except CatalogError as exc:
            self.catalog_status.configure(
                text="Erro ao carregar catálogo"
            )
            messagebox.showerror("Catálogo", str(exc))

    def _filter_anime(self):
        query = self.search_entry.get().strip().casefold()

        self.filtered_anime = [
            anime for anime in self.anime_items
            if query in anime.title.casefold()
        ]

        self.current_page = 0
        self._render_anime_list()

    def _render_anime_list(self):
        for child in self.anime_list.winfo_children():
            child.destroy()

        start = self.current_page * PAGE_SIZE
        end = start + PAGE_SIZE

        visible = self.filtered_anime[start:end]

        for anime in visible:
            ctk.CTkButton(
                self.anime_list,
                text=anime.title,
                anchor="w",
                fg_color="transparent",
                text_color=("gray10", "gray90"),
                hover_color=("gray80", "gray25"),
                command=lambda selected=anime: (
                    self._select_anime(selected)
                )
            ).pack(fill="x", padx=4, pady=2)

        total_pages = max(
            1,
            (len(self.filtered_anime) + PAGE_SIZE - 1) // PAGE_SIZE
        )

        self.page_label.configure(
            text=f"Página {self.current_page + 1} de {total_pages}"
        )

        self.previous_button.configure(
            state="normal" if self.current_page > 0 else "disabled"
        )

        self.next_button.configure(
            state="normal" if end < len(self.filtered_anime) else "disabled"
        )

    def _previous_page(self):
        if self.current_page > 0:
            self.current_page -= 1
            self._render_anime_list()

    def _next_page(self):
        if (self.current_page + 1) * PAGE_SIZE < len(self.filtered_anime):
            self.current_page += 1
            self._render_anime_list()

    # =========================================================
    # EPISÓDIOS E DADOS LOCAIS
    # =========================================================

    def _select_anime(self, anime: Anime):
        self.current_anime = anime
        self.current_episode = None

        self.download_heading.configure(text=anime.title)

        explicit = sum(ep.source == "explicit" for ep in anime.episodes)
        intervals = sum(ep.source == "interval" for ep in anime.episodes)
        missing = sum(ep.source == "missing" for ep in anime.episodes)

        summary = self.database.get_summary(anime.id)

        self.download_summary.configure(
            text=(
                f"ID: {anime.id}  •  {len(anime.episodes)} episódios\n"
                f"{explicit} com IDs individuais  •  "
                f"{intervals} com intervalos  •  "
                f"{missing} sem metadados\n"
                f"Registros locais: "
                f"{sum(summary.values())}  •  "
                f"Concluídos: {summary.get('downloaded', 0)}  •  "
                f"Erros: {summary.get('error', 0)}"
            )
        )

        for child in self.episode_list.winfo_children():
            child.destroy()

        for ep in anime.episodes:
            row = ctk.CTkFrame(self.episode_list)
            row.pack(fill="x", padx=5, pady=4)

            folder = (
                DOWNLOAD_DIR
                / self._safe_name(anime.title)
                / self._safe_name(ep.title)
            )

            local_key = (anime.id, ep.number)
            local_count = self.local_counts.get(local_key)

            ctk.CTkLabel(
                row,
                text=ep.title,
                font=ctk.CTkFont(weight="bold")
            ).pack(side="left", padx=12, pady=10)

            if ep.source == "explicit":
                detail = f"{len(ep.image_ids)} IDs individuais"
                color = "#55B987"
            elif ep.source == "interval":
                detail = (
                    f"Intervalo: {ep.first_image_id} – "
                    f"{ep.last_image_id}"
                )
                color = "#D6A64B"
            else:
                detail = "Sem metadados"
                color = "gray"

            db_summary = self.database.get_episode_summary(
                anime.id,
                ep.number
            )

            registered = sum(db_summary.values())
            downloaded = db_summary.get("downloaded", 0)

            local_text = (
                f"{local_count} locais"
                if local_count is not None
                else "Contagem pendente"
            )

            detail += (
                f"  •  {local_text}"
                f"  •  {downloaded}/{registered} registrados"
            )

            ctk.CTkLabel(
                row,
                text=detail,
                text_color=color
            ).pack(side="right", padx=12)

            # A análise local não depende da existência de IDs no dataset.
            ctk.CTkButton(
                row,
                text="Analisar local",
                width=112,
                command=lambda selected_anime=anime, selected_ep=ep, selected_folder=folder: (
                    self._open_episode_analysis(
                        selected_anime,
                        selected_ep,
                        selected_folder
                    )
                )
            ).pack(side="right", padx=6, pady=5)

            if ep.source == "explicit" and ep.image_ids:
                queue_key = (anime.id, ep.number)
                already_queued = queue_key in self.download_queue_keys
                queue_button = ctk.CTkButton(
                    row,
                    text="Na fila" if already_queued else "Adicionar",
                    width=92,
                    state="disabled" if already_queued else "normal",
                    command=lambda selected_anime=anime, selected_ep=ep, selected_folder=folder, selected_row=row: (
                        self._add_episode_to_queue(
                            selected_anime,
                            selected_ep,
                            selected_folder,
                            selected_row
                        )
                    )
                )
                queue_button.pack(side="right", padx=6, pady=5)
            else:
                ctk.CTkButton(
                    row,
                    text="Sem IDs",
                    width=92,
                    state="disabled"
                ).pack(side="right", padx=6, pady=5)

            self._schedule_folder_scan(
                anime,
                ep,
                folder,
                row,
                color
            )

    def _add_episode_to_queue(self, anime, episode, folder, row):
        if self.download_active:
            messagebox.showinfo(
                "Fila em andamento",
                "Não é possível alterar a fila durante o processamento."
            )
            return

        if episode.source != "explicit" or not episode.image_ids:
            return

        key = (anime.id, episode.number)
        if key in self.download_queue_keys:
            return

        self.download_queue.append((anime, episode, folder))
        self.download_queue_keys.add(key)

        for child in row.winfo_children():
            if isinstance(child, ctk.CTkButton) and child.cget("text") == "Adicionar":
                child.configure(text="Na fila", state="disabled")

        self._update_queue_controls()

    def _update_queue_controls(self):
        episode_count = len(self.download_queue)
        image_count = sum(len(item[1].image_ids) for item in self.download_queue)

        self.queue_start_button.configure(
            text=f"Iniciar fila ({episode_count})",
            state="normal" if episode_count and not self.download_active else "disabled"
        )
        self.queue_clear_button.configure(
            state="normal" if episode_count and not self.download_active else "disabled"
        )

        names = [
            f"{anime.title} / {episode.title}"
            for anime, episode, _folder in self.download_queue
        ]
        visible_names = names[:5]
        if len(names) > 5:
            visible_names.append(f"... e mais {len(names) - 5} episódios")

        self.queue_items_label.configure(
            text=(
                "Episódios na fila: " + " | ".join(visible_names)
                if visible_names else "Episódios na fila: nenhum"
            )
        )

        if not self.download_active:
            self.download_status.configure(
                text=(
                    f"Fila: {episode_count} episódios • "
                    f"{image_count} imagens confirmadas"
                    if episode_count else "Fila de downloads vazia"
                )
            )

    def _clear_download_queue(self):
        if self.download_active:
            return

        self.download_queue.clear()
        self.download_queue_keys.clear()

        if self.current_anime:
            self._select_anime(self.current_anime)
        self._update_queue_controls()

    def _start_download_queue(self):
        if self.download_active or not self.download_queue:
            return

        episode_count = len(self.download_queue)
        image_count = sum(len(item[1].image_ids) for item in self.download_queue)

        if not messagebox.askyesno(
            "Iniciar fila",
            (
                f"Iniciar download de {episode_count} episódios "
                f"({image_count} imagens)?\n\n"
                "As imagens serão solicitadas uma por vez, com intervalo "
                "entre requisições. Se houver HTTP 403/429 ou bloqueio "
                "Cloudflare, toda a fila será interrompida."
            )
        ):
            return

        queue_snapshot = list(self.download_queue)
        self.download_active = True
        self.queue_start_button.configure(state="disabled")
        self.queue_clear_button.configure(state="disabled")
        self.download_progress.set(0)
        self.download_status.configure(text="Preparando fila...")

        self.download_worker = threading.Thread(
            target=self._download_queue_worker,
            args=(queue_snapshot,),
            daemon=True
        )
        self.download_worker.start()

    def _download_queue_worker(self, episodes):
        downloader = ImageDownloader(self.database)
        total_images = sum(len(episode.image_ids) for _, episode, _ in episodes)
        processed = 0
        downloaded = 0
        skipped = 0
        errors = 0

        try:
            for episode_index, (anime, episode, folder) in enumerate(episodes, start=1):
                folder.mkdir(parents=True, exist_ok=True)

                for image_id in episode.image_ids:
                    destination = folder / f"{image_id}.jpg"
                    result = downloader.download_one(
                        image_id=image_id,
                        anime_id=anime.id,
                        episode_number=episode.number,
                        destination=destination
                    )

                    if result.status == "downloaded":
                        downloaded += 1
                    elif result.status == "skipped":
                        skipped += 1
                    else:
                        errors += 1

                    processed += 1
                    self.events.put((
                        "queue_progress",
                        processed,
                        total_images,
                        episode_index,
                        len(episodes),
                        anime.title,
                        episode.title,
                        downloaded,
                        skipped,
                        errors
                    ))

                    # Pausa conservadora entre requisições; não tenta contornar bloqueios.
                    if processed < total_images:
                        time.sleep(1.5)

            self.events.put((
                "queue_finished",
                downloaded,
                skipped,
                errors,
                episodes
            ))

        except DownloadBlocked as exc:
            self.events.put((
                "queue_blocked",
                str(exc),
                downloaded,
                skipped,
                errors,
                episodes
            ))

        except Exception as exc:
            self.events.put((
                "queue_error",
                str(exc),
                downloaded,
                skipped,
                errors,
                episodes
            ))

    def _open_episode_analysis(self, anime, episode, folder):
        """
        Abre a análise usando a pasta local do episódio.
        Não consulta o dataset por IDs nem acessa o site.
        """
        self.tabs.set("Seleção de frames")

        if not folder.is_dir():
            self.current_anime = anime
            self.current_episode = episode
            self.local_folder = None
            self.analysis_context_label.configure(
                text=f"Origem: {anime.title} / {episode.title}"
            )
            self.folder_label.configure(
                text=f"Pasta esperada: {folder}",
                text_color="gray"
            )
            self.analysis_status.configure(
                text="A pasta local deste episódio ainda não foi encontrada."
            )

            choose = messagebox.askyesno(
                "Pasta local não encontrada",
                (
                    f"Não encontrei a pasta deste episódio:\n{folder}\n\n"
                    "Deseja escolher outra pasta manualmente?"
                )
            )
            if choose:
                self._choose_local_folder()
            return

        self.current_anime = anime
        self.current_episode = episode
        self.local_folder = folder
        self.last_result = None
        self.results_button.configure(state="disabled")
        self.progress.set(0)

        self.analysis_context_label.configure(
            text=f"Origem: {anime.title} / {episode.title}"
        )
        self.folder_label.configure(
            text=f"{folder}\nVerificando imagens...",
            text_color="white"
        )
        self.analysis_status.configure(
            text="Verificando imagens locais do episódio..."
        )

        threading.Thread(
            target=self._folder_info_worker,
            args=(folder,),
            daemon=True
        ).start()

    def _schedule_folder_scan(self, anime, episode, folder, row, color):
        def scan():
            count = len(self.frame_selector.get_images(folder))
            self.events.put((
                "folder_count",
                anime.id,
                episode.number,
                count,
                row,
                color
            ))

        threading.Thread(
            target=scan,
            daemon=True
        ).start()

    def _open_download_folder(self):
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        os.startfile(str(DOWNLOAD_DIR))

    # =========================================================
    # ABA SELEÇÃO DE FRAMES
    # =========================================================

    def _build_frame_tab(self):
        tab = self.tabs.tab("Seleção de frames")

        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(2, weight=1)

        folder_panel = ctk.CTkFrame(tab)
        folder_panel.grid(
            row=0,
            column=0,
            sticky="ew",
            padx=10,
            pady=10
        )

        folder_panel.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            folder_panel,
            text="Pasta de imagens",
            font=ctk.CTkFont(size=17, weight="bold")
        ).grid(
            row=0,
            column=0,
            padx=14,
            pady=(12, 5),
            sticky="w"
        )

        self.folder_label = ctk.CTkLabel(
            folder_panel,
            text="Nenhuma pasta selecionada",
            text_color="gray",
            anchor="w",
            wraplength=700
        )
        self.folder_label.grid(
            row=1,
            column=0,
            padx=14,
            pady=8,
            sticky="ew"
        )

        self.analysis_context_label = ctk.CTkLabel(
            folder_panel,
            text="Origem: pasta escolhida manualmente",
            text_color="gray",
            anchor="w"
        )
        self.analysis_context_label.grid(
            row=2,
            column=0,
            padx=14,
            pady=(0, 8),
            sticky="ew"
        )

        ctk.CTkButton(
            folder_panel,
            text="Escolher pasta",
            command=self._choose_local_folder
        ).grid(row=1, column=1, padx=14, pady=8)

        settings = ctk.CTkFrame(tab)
        settings.grid(
            row=1,
            column=0,
            sticky="ew",
            padx=10,
            pady=(0, 10)
        )

        settings.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            settings,
            text="Configurações de seleção",
            font=ctk.CTkFont(size=17, weight="bold")
        ).grid(
            row=0,
            column=0,
            columnspan=3,
            padx=14,
            pady=12,
            sticky="w"
        )

        self.mode_menu = ctk.CTkOptionMenu(
            settings,
            values=["Melhores frames", "Intervalo", "Todos"],
            command=self._on_mode_change
        )
        self.mode_menu.set("Melhores frames")
        self.mode_menu.grid(
            row=1,
            column=0,
            padx=14,
            pady=8,
            sticky="w"
        )

        self.threshold_frame = ctk.CTkFrame(
            settings,
            fg_color="transparent"
        )
        self.threshold_frame.grid(
            row=2,
            column=0,
            columnspan=3,
            padx=14,
            pady=8,
            sticky="ew"
        )
        self.threshold_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            self.threshold_frame,
            text="Sensibilidade"
        ).grid(row=0, column=0, padx=(0, 12))

        self.threshold_slider = ctk.CTkSlider(
            self.threshold_frame,
            from_=0,
            to=16,
            number_of_steps=16,
            command=self._update_threshold_label
        )
        self.threshold_slider.set(4)
        self.threshold_slider.grid(row=0, column=1, sticky="ew")

        self.threshold_value = ctk.CTkLabel(
            self.threshold_frame,
            text="4",
            width=35
        )
        self.threshold_value.grid(row=0, column=2, padx=(10, 0))

        self.interval_frame = ctk.CTkFrame(
            settings,
            fg_color="transparent"
        )
        self.interval_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            self.interval_frame,
            text="Selecionar uma imagem a cada"
        ).grid(row=0, column=0, padx=(0, 12))

        self.interval_slider = ctk.CTkSlider(
            self.interval_frame,
            from_=1,
            to=20,
            number_of_steps=19,
            command=self._update_interval_label
        )
        self.interval_slider.set(3)
        self.interval_slider.grid(row=0, column=1, sticky="ew")

        self.interval_value = ctk.CTkLabel(
            self.interval_frame,
            text="3",
            width=35
        )
        self.interval_value.grid(row=0, column=2, padx=(10, 0))

        self.interval_frame.grid_remove()

        self.mode_description = ctk.CTkLabel(
            settings,
            text=(
                "Compara imagens consecutivas e "
                "identifica frames visualmente semelhantes."
            ),
            text_color="gray",
            anchor="w",
            justify="left"
        )
        self.mode_description.grid(
            row=3,
            column=0,
            columnspan=3,
            padx=14,
            pady=(4, 12),
            sticky="w"
        )

        results = ctk.CTkFrame(tab)
        results.grid(
            row=2,
            column=0,
            sticky="nsew",
            padx=10,
            pady=(0, 10)
        )

        results.grid_columnconfigure(0, weight=1)

        self.analysis_status = ctk.CTkLabel(
            results,
            text="Aguardando seleção de pasta",
            anchor="w"
        )
        self.analysis_status.grid(
            row=0,
            column=0,
            padx=14,
            pady=(12, 4),
            sticky="ew"
        )

        self.progress = ctk.CTkProgressBar(results)
        self.progress.set(0)
        self.progress.grid(
            row=1,
            column=0,
            padx=14,
            pady=8,
            sticky="ew"
        )

        controls = ctk.CTkFrame(
            results,
            fg_color="transparent"
        )
        controls.grid(
            row=2,
            column=0,
            padx=10,
            pady=(5, 12),
            sticky="ew"
        )

        self.analyze_button = ctk.CTkButton(
            controls,
            text="Analisar frames",
            command=self._start_analysis,
            fg_color="#287A55",
            hover_color="#206443"
        )
        self.analyze_button.pack(side="left", padx=5)

        self.results_button = ctk.CTkButton(
            controls,
            text="Ver resultados",
            command=self._show_results,
            state="disabled"
        )
        self.results_button.pack(side="left", padx=5)

    # =========================================================
    # CONFIGURAÇÕES
    # =========================================================

    def _on_mode_change(self, mode):
        if mode == "Melhores frames":
            self.interval_frame.grid_remove()
            self.threshold_frame.grid(
                row=2,
                column=0,
                columnspan=3,
                padx=14,
                pady=8,
                sticky="ew"
            )
            description = (
                "Compara imagens consecutivas e "
                "identifica frames visualmente semelhantes."
            )

        elif mode == "Intervalo":
            self.threshold_frame.grid_remove()
            self.interval_frame.grid(
                row=2,
                column=0,
                columnspan=3,
                padx=14,
                pady=8,
                sticky="ew"
            )
            description = (
                "Seleciona uma imagem a cada quantidade definida."
            )

        else:
            self.threshold_frame.grid_remove()
            self.interval_frame.grid_remove()
            description = "Mantém todas as imagens encontradas."

        self.mode_description.configure(text=description)

    def _update_threshold_label(self, value):
        self.threshold_value.configure(text=str(round(value)))

    def _update_interval_label(self, value):
        self.interval_value.configure(text=str(round(value)))

    def _get_selection_settings(self):
        modes = {
            "Melhores frames": "best",
            "Intervalo": "interval",
            "Todos": "all"
        }

        return {
            "mode": modes[self.mode_menu.get()],
            "threshold": round(self.threshold_slider.get()),
            "interval": round(self.interval_slider.get())
        }

    # =========================================================
    # SELEÇÃO DE PASTA
    # =========================================================

    def _choose_local_folder(self):
        selected = filedialog.askdirectory(
            title="Selecione a pasta de imagens",
            initialdir=str(DOWNLOAD_DIR)
        )

        if not selected:
            return

        self.local_folder = Path(selected)
        self.current_episode = None
        self.analysis_context_label.configure(
            text="Origem: pasta escolhida manualmente"
        )

        self.folder_label.configure(
            text=f"{self.local_folder}\nVerificando imagens...",
            text_color="white"
        )

        self.analysis_status.configure(
            text="Verificando conteúdo da pasta..."
        )

        threading.Thread(
            target=self._folder_info_worker,
            args=(self.local_folder,),
            daemon=True
        ).start()

        self.results_button.configure(state="disabled")
        self.last_result = None

    def _folder_info_worker(self, folder):
        images = self.frame_selector.get_images(folder)
        self.events.put(("folder_info", folder, len(images)))

    # =========================================================
    # ANÁLISE DE FRAMES
    # =========================================================

    def _start_analysis(self):
        if self.worker and self.worker.is_alive():
            return

        if not self.local_folder or not self.local_folder.exists():
            messagebox.showinfo(
                "Seleção de pasta",
                "Escolha uma pasta válida primeiro."
            )
            return

        settings = self._get_selection_settings()

        self.last_result = None
        self.results_button.configure(state="disabled")
        self.progress.set(0)
        self.analysis_status.configure(text="Analisando imagens...")
        self.analyze_button.configure(state="disabled")

        self.worker = threading.Thread(
            target=self._analysis_worker,
            args=(self.local_folder, settings),
            daemon=True
        )
        self.worker.start()

    def _analysis_worker(self, folder, settings):
        try:
            images = self.frame_selector.get_images(folder)

            if not images:
                self.events.put((
                    "analysis_error",
                    "Nenhuma imagem compatível foi encontrada."
                ))
                return

            selector = FrameSelector(
                threshold=settings["threshold"]
            )

            result = selector.select(
                images,
                mode=settings["mode"],
                interval=settings["interval"]
            )

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_folder = folder / f"frames_selecionados_{timestamp}"
            output_folder.mkdir(parents=True, exist_ok=True)

            selected_paths = []

            total = max(1, len(result.selected))

            for index, image_path in enumerate(result.selected, start=1):
                destination = output_folder / image_path.name
                shutil.copy2(image_path, destination)
                selected_paths.append(destination)

                self.events.put((
                    "analysis_progress",
                    index / total
                ))

            manifest = output_folder / "selecao.txt"

            with manifest.open("w", encoding="utf-8") as file:
                file.write(f"Pasta original: {folder}\n")
                file.write(f"Modo: {settings['mode']}\n")
                file.write(f"Sensibilidade: {settings['threshold']}\n")
                file.write(f"Intervalo: {settings['interval']}\n")
                file.write(f"Imagens originais: {result.total}\n")
                file.write(f"Selecionadas: {result.selected_count}\n")
                file.write(f"Descartadas: {result.discarded_count}\n\n")

                file.write("FRAMES SELECIONADOS\n")
                for path in result.selected:
                    file.write(path.name + "\n")

                file.write("\nFRAMES DESCARTADOS\n")
                for path in result.discarded:
                    file.write(path.name + "\n")

            self.events.put((
                "analysis_finished",
                result,
                selected_paths,
                list(result.discarded),
                output_folder
            ))

        except Exception as exc:
            self.events.put(("analysis_error", str(exc)))

    # =========================================================
    # GALERIA
    # =========================================================

    def _show_results(self):
        if not self.last_result:
            return

        result = self.last_result

        window = ctk.CTkToplevel(self)
        window.title("Resultados da seleção")
        window.geometry("1050x750")
        window.minsize(800, 600)
        window.transient(self)

        window.grid_columnconfigure(0, weight=1)
        window.grid_rowconfigure(1, weight=1)

        ctk.CTkLabel(
            window,
            text=(
                f"{result['selected_count']} selecionados "
                f"• {result['discarded_count']} descartados"
            ),
            font=ctk.CTkFont(size=20, weight="bold")
        ).grid(
            row=0,
            column=0,
            padx=18,
            pady=14,
            sticky="w"
        )

        tabs = ctk.CTkTabview(window)
        tabs.grid(
            row=1,
            column=0,
            padx=12,
            pady=8,
            sticky="nsew"
        )

        tabs.add("Selecionados")
        tabs.add("Descartados")

        self.preview_images = []

        self._populate_gallery(
            tabs.tab("Selecionados"),
            result["selected_paths"]
        )

        self._populate_gallery(
            tabs.tab("Descartados"),
            result["discarded_paths"]
        )

        bottom = ctk.CTkFrame(window, fg_color="transparent")
        bottom.grid(
            row=2,
            column=0,
            padx=12,
            pady=10,
            sticky="ew"
        )

        ctk.CTkButton(
            bottom,
            text="Abrir pasta do resultado",
            command=lambda: os.startfile(str(result["output_folder"]))
        ).pack(side="left", padx=5)

        ctk.CTkLabel(
            bottom,
            text="Os originais não foram modificados.",
            text_color="gray"
        ).pack(side="right", padx=5)

    def _populate_gallery(self, parent, paths):
        scroll = ctk.CTkScrollableFrame(parent)
        scroll.pack(fill="both", expand=True, padx=8, pady=8)

        for index, path in enumerate(paths):
            try:
                with Image.open(path) as original:
                    thumbnail = original.convert("RGB")
                    thumbnail.thumbnail((230, 145))

                    image = ctk.CTkImage(
                        light_image=thumbnail,
                        dark_image=thumbnail,
                        size=thumbnail.size
                    )

                self.preview_images.append(image)

                card = ctk.CTkFrame(scroll)
                card.grid(
                    row=index // 3,
                    column=index % 3,
                    padx=7,
                    pady=7,
                    sticky="nsew"
                )

                ctk.CTkLabel(
                    card,
                    text="",
                    image=image
                ).pack(padx=6, pady=6)

                ctk.CTkLabel(
                    card,
                    text=path.name,
                    font=ctk.CTkFont(size=11)
                ).pack(padx=5, pady=(0, 7))

            except (OSError, ValueError):
                continue

        if not paths:
            ctk.CTkLabel(
                scroll,
                text="Nenhuma imagem nesta categoria.",
                text_color="gray"
            ).pack(padx=20, pady=20)

    # =========================================================
    # EVENTOS
    # =========================================================

    def _process_events(self):
        try:
            while True:
                event = self.events.get_nowait()
                kind = event[0]

                if kind == "folder_count":
                    _, anime_id, episode_number, count, row, color = event

                    self.local_counts[(anime_id, episode_number)] = count

                    try:
                        if row.winfo_exists():
                            for child in row.winfo_children():
                                if isinstance(child, ctk.CTkLabel):
                                    current = child.cget("text")

                                    if "Contagem pendente" in current:
                                        child.configure(
                                            text=current.replace(
                                                "Contagem pendente",
                                                f"{count} locais"
                                            ),
                                            text_color=color
                                        )
                    except Exception:
                        pass

                elif kind == "folder_info":
                    _, folder, count = event

                    if folder == self.local_folder:
                        self.folder_label.configure(
                            text=f"{folder}\n{count} imagens encontradas"
                        )
                        self.analysis_status.configure(
                            text="Pasta carregada. Pronta para análise."
                        )

                elif kind == "queue_progress":
                    (
                        _, current, total, episode_index, episode_total,
                        anime_title, episode_title, downloaded, skipped, errors
                    ) = event
                    self.download_progress.set(current / max(1, total))
                    self.download_status.configure(
                        text=(
                            f"Episódio {episode_index}/{episode_total}: "
                            f"{anime_title} / {episode_title} • "
                            f"Imagem {current}/{total} • "
                            f"{downloaded} baixadas • {skipped} existentes "
                            f"• {errors} erros"
                        )
                    )

                elif kind in ("queue_finished", "queue_blocked", "queue_error"):
                    if kind == "queue_finished":
                        _, downloaded, skipped, errors, episodes = event
                    elif kind == "queue_blocked":
                        _, reason, downloaded, skipped, errors, episodes = event
                    else:
                        _, reason, downloaded, skipped, errors, episodes = event

                    self.download_active = False
                    self.download_queue.clear()
                    self.download_queue_keys.clear()

                    if kind == "queue_finished":
                        self.download_progress.set(1)
                        self.download_status.configure(
                            text=(
                                f"Fila concluída: {downloaded} baixadas, "
                                f"{skipped} existentes e {errors} erros."
                            )
                        )
                        messagebox.showinfo(
                            "Fila concluída",
                            (
                                f"Episódios processados: {len(episodes)}\n"
                                f"Baixadas: {downloaded}\n"
                                f"Já existentes: {skipped}\n"
                                f"Erros: {errors}"
                            )
                        )
                    elif kind == "queue_blocked":
                        self.download_status.configure(
                            text="Fila interrompida por bloqueio do servidor."
                        )
                        messagebox.showwarning(
                            "Fila interrompida",
                            (
                                f"{reason}\n\n"
                                f"Baixadas antes do bloqueio: {downloaded}\n"
                                f"Já existentes: {skipped}\n"
                                f"Erros: {errors}\n\n"
                                "A fila restante foi descartada. Aguarde o fim do bloqueio."
                            )
                        )
                    else:
                        self.download_status.configure(
                            text="Fila encerrada com erro."
                        )
                        messagebox.showerror(
                            "Erro na fila",
                            (
                                f"{reason}\n\n"
                                f"Baixadas: {downloaded}\n"
                                f"Já existentes: {skipped}\n"
                                f"Erros: {errors}"
                            )
                        )

                    if self.current_anime:
                        self._select_anime(self.current_anime)
                    self._update_queue_controls()

                elif kind == "analysis_progress":
                    self.progress.set(event[1])

                elif kind == "analysis_finished":
                    (
                        _,
                        result,
                        selected_paths,
                        discarded_paths,
                        output_folder
                    ) = event

                    self.last_result = {
                        "total": result.total,
                        "selected_count": result.selected_count,
                        "discarded_count": result.discarded_count,
                        "selected_paths": selected_paths,
                        "discarded_paths": discarded_paths,
                        "output_folder": output_folder
                    }

                    self.progress.set(1)

                    self.analysis_status.configure(
                        text=(
                            f"Concluído: {result.selected_count} selecionados "
                            f"e {result.discarded_count} descartados."
                        )
                    )

                    self.analyze_button.configure(state="normal")
                    self.results_button.configure(state="normal")

                    messagebox.showinfo(
                        "Análise concluída",
                        (
                            f"Imagens encontradas: {result.total}\n"
                            f"Selecionadas: {result.selected_count}\n"
                            f"Descartadas: {result.discarded_count}"
                        )
                    )

                elif kind == "analysis_error":
                    self.analysis_status.configure(
                        text="Erro durante a análise."
                    )
                    self.analyze_button.configure(state="normal")
                    messagebox.showerror("Análise", event[1])

        except queue.Empty:
            pass

        self.after(150, self._process_events)

    # =========================================================
    # UTILITÁRIOS
    # =========================================================

    @staticmethod
    def _safe_name(value):
        invalid = '<>:"/\\|?*'

        cleaned = "".join(
            "_" if char in invalid else char
            for char in value
        )

        return cleaned.strip().rstrip(".")
