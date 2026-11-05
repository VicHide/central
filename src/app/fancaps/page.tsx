"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./FanCaps.module.css";

type Anime = { id: number; title: string; episodes: number; downloadable: number };
type Episode = { number: string; title: string; source: string; image_count: number; available: boolean; registered: Record<string, number> };
type QueueItem = { key: string; anime_id: number; anime_title: string; episode_number: string; episode_title: string; image_count: number; processed: number; downloaded: number; skipped: number; errors: number; status: string; current_image_id: number | null };
type Queue = { active: boolean; paused: boolean; state: string; current_key: string | null; items: QueueItem[]; totals: { episodes: number; images: number; downloaded: number; skipped: number; errors: number; processed: number }; last_error?: string | null; last_summary?: { result: string } | null };

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Não foi possível consultar o serviço.");
  return data as T;
};

export default function FanCapsPage() {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Anime[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async () => {
    try { setQueue(await getJson<Queue>("/api/fancaps?resource=queue")); }
    catch (e) { setError(e instanceof Error ? e.message : "API indisponível."); }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await getJson<{ items: Anime[]; total: number }>("/api/fancaps?resource=catalog&q=" + encodeURIComponent(query) + "&page=" + page);
      setCatalog(data.items); setCatalogTotal(data.total); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar o catálogo."); }
  }, [query, page]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);
  useEffect(() => { loadQueue(); const timer = setInterval(loadQueue, 1500); return () => clearInterval(timer); }, [loadQueue]);

  const selectAnime = async (anime: Anime) => {
    setSelected(anime); setEpisodes([]);
    try {
      const data = await getJson<{ episodes: Episode[] }>("/api/fancaps?resource=episodes&anime_id=" + anime.id);
      setEpisodes(data.episodes);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar os episódios."); }
  };

  const action = async (actionName: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/fancaps", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "A operação não foi concluída.");
      if (data.items) setQueue(data as Queue);
      await loadQueue();
      if (selected) await selectAnime(selected);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro na operação."); }
    finally { setBusy(false); }
  };

  const totals = queue?.totals;
  const percent = totals && totals.images ? Math.round((totals.processed / totals.images) * 100) : 0;
  const statusText: Record<string, string> = { waiting: "Aguardando", running: "Em andamento", completed: "Concluído", blocked: "Bloqueado", error: "Erro" };

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}><span className={styles.mark}>C</span><span><strong>Central do Canal</strong><small>Estúdio de quiz</small></span></Link>
        <nav>
          <Link href="/#novo">Novo vídeo</Link>
          <Link href="/#top">Top 10 (Short)</Link>
          <Link href="/#projetos">Projetos</Link>
          <Link href="/#acervo">Acervo</Link>
          <Link href="/#saidas">Saídas</Link>
          <span className={styles.active}>FanCaps Downloader</span>
          <Link href="/picker">Seletor de imagens</Link>
        </nav>
        <div className={styles.sidebarNote}>Produção, acervo e ferramentas em um só lugar.</div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}><span>Central do Canal <i>/</i> Ferramentas <i>/</i> FanCaps</span><span className={styles.live}><b /> Serviço local</span></header>
        <div className={styles.workspace}>
          <div className={styles.heading}>
            <div><p className={styles.eyebrow}>GERENCIADOR DE CAPTURAS</p><h1>FanCaps Downloader</h1><p>Selecione episódios, organize a fila e acompanhe os downloads sem sair do painel.</p></div>
            <div className={styles.metric}><small>Progresso geral</small><strong>{percent}%</strong></div>
          </div>

          {error && <div className={styles.alert} role="alert">{error}</div>}

          <section className={styles.stats}>
            <div><small>Episódios na fila</small><strong>{totals?.episodes ?? 0}</strong></div>
            <div><small>Imagens processadas</small><strong>{totals?.processed ?? 0} / {totals?.images ?? 0}</strong></div>
            <div><small>Baixadas</small><strong>{totals?.downloaded ?? 0}</strong></div>
            <div><small>Já existentes</small><strong>{totals?.skipped ?? 0}</strong></div>
            <div><small>Erros</small><strong>{totals?.errors ?? 0}</strong></div>
          </section>

          <section className={styles.queuePanel}>
            <div className={styles.panelHead}><div><h2>Fila de downloads</h2><p>{queue?.state === "running" ? "A fila está sendo processada." : queue?.state === "paused" ? "A fila está pausada." : "Adicione episódios pelo catálogo abaixo."}</p></div>
              <div className={styles.controls}>
                {!queue?.active ? <button className={styles.primary} disabled={busy || !queue?.items.some((x) => x.status === "waiting")} onClick={() => action("start")}>Iniciar fila</button> :
                  <button className={styles.primary} disabled={busy} onClick={() => action(queue.paused ? "resume" : "pause")}>{queue.paused ? "Retomar" : "Pausar"}</button>}
                <button className={styles.secondary} disabled={busy || !!queue?.active || !queue?.items.length} onClick={() => action("clear")}>Limpar fila</button>
              </div>
            </div>
            <div className={styles.progressTrack}><span style={{ width: percent + "%" }} /></div>
            <div className={styles.queueList}>
              {!queue?.items.length && <p className={styles.empty}>Sua fila está vazia. Escolha um anime e adicione episódios.</p>}
              {queue?.items.map((item, index) => <article className={styles.queueItem} key={item.key}>
                <div className={styles.queueNumber}>{String(index + 1).padStart(2, "0")}</div>
                <div className={styles.queueInfo}><strong>{item.anime_title}</strong><span>{item.episode_title} · {item.image_count} imagens</span><div className={styles.itemProgress}><span style={{ width: (item.image_count ? item.processed / item.image_count * 100 : 0) + "%" }} /></div><small>{item.processed}/{item.image_count} · {item.downloaded} baixadas · {item.skipped} existentes · {item.errors} erros</small></div>
                <span className={styles.status} data-state={item.status}>{statusText[item.status] || item.status}</span>
              </article>)}
            </div>
            {queue?.last_error && <p className={styles.errorNote}>{queue.last_error}</p>}
            {queue?.last_summary && <p className={styles.summaryNote}>Última execução: {queue.last_summary.result === "completed" ? "concluída" : queue.last_summary.result === "blocked" ? "interrompida por bloqueio do servidor" : "encerrada com erro"}.</p>}
          </section>

          <section className={styles.browser}>
            <div className={styles.catalogPanel}>
              <div className={styles.panelHead}><div><h2>Catálogo</h2><p>{catalogTotal.toLocaleString("pt-BR")} animes disponíveis no dataset local.</p></div></div>
              <input className={styles.search} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Pesquisar anime..." />
              <div className={styles.animeList}>
                {catalog.map((anime) => <button key={anime.id} className={selected?.id === anime.id ? styles.selectedAnime : styles.animeButton} onClick={() => selectAnime(anime)}><span>{anime.title}</span><small>{anime.episodes} eps. · {anime.downloadable} disponíveis</small></button>)}
                {!catalog.length && <p className={styles.empty}>Nenhum anime encontrado.</p>}
              </div>
              <div className={styles.pagination}><button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</button><span>{page + 1} / {Math.max(1, Math.ceil(catalogTotal / 30))}</span><button disabled={(page + 1) * 30 >= catalogTotal} onClick={() => setPage((p) => p + 1)}>Próxima</button></div>
            </div>
            <div className={styles.episodesPanel}>
              <div className={styles.panelHead}><div><h2>{selected?.title || "Episódios"}</h2><p>{selected ? "Selecione os episódios que deseja incluir na fila." : "Escolha um anime no catálogo."}</p></div></div>
              <div className={styles.episodeList}>
                {episodes.map((episode) => {
                  const queued = queue?.items.some((item) => item.anime_id === selected?.id && item.episode_number === episode.number);
                  return <article className={styles.episode} key={episode.number}><div><strong>{episode.title}</strong><small>{episode.source === "explicit" ? "IDs individuais" : episode.source === "interval" ? "Intervalo de IDs" : "Sem metadados"} · {episode.image_count} imagens</small></div><button disabled={!episode.available || !!queued || !!queue?.active || busy} onClick={() => action("queue", { anime_id: selected?.id, episode_number: episode.number })}>{queued ? "Na fila" : episode.available ? "Adicionar" : "Indisponível"}</button></article>;
                })}
                {!episodes.length && <p className={styles.empty}>Os episódios do anime selecionado aparecerão aqui.</p>}
              </div>
            </div>
          </section>
          <footer className={styles.footer}><span>Central do Canal · FanCaps</span><span>O processamento permanece local neste computador.</span></footer>
        </div>
      </section>
    </main>
  );
}
