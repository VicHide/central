"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "../FanCaps.module.css";

type QueueLog = { time: number; level: "info" | "success" | "warning" | "error"; message: string };
type LogsResponse = { logs: QueueLog[]; total: number };

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Não foi possível consultar o serviço.");
  return data as T;
};

export default function FanCapsLogsPage() {
  const [data, setData] = useState<LogsResponse>({ logs: [], total: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setData(await getJson<LogsResponse>("/api/fancaps?resource=logs"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os logs.");
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const clearLogs = async () => {
    if (!window.confirm("Limpar todo o histórico de logs? A fila e os arquivos baixados serão preservados.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/fancaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_logs" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.erro || "Não foi possível limpar os logs.");
      setData({ logs: [], total: 0 });
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao limpar os logs.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}><span className={styles.mark}>C</span><span><strong>Central do Canal</strong><small>Estúdio de quiz</small></span></Link>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/fancaps">FanCaps Downloader</Link>
          <span className={styles.active}>Histórico de logs</span>
        </nav>
        <div className={styles.sidebarNote}>Histórico de eventos do serviço FanCaps.</div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <span>Central do Canal <i>/</i> Ferramentas <i>/</i> <Link href="/fancaps">FanCaps</Link> <i>/</i> Logs</span>
          <span className={styles.live}><b /> Serviço local</span>
        </header>
        <div className={styles.workspace}>
          <div className={styles.heading}>
            <div><p className={styles.eyebrow}>FANCAPS DOWNLOADER</p><h1>Histórico de logs</h1><p>Consulte os eventos registrados durante o processamento da fila.</p></div>
            <div className={styles.controls}>
              <button className={styles.secondary} onClick={loadLogs} disabled={busy}>Atualizar</button>
              <button className={styles.primary} onClick={clearLogs} disabled={busy || data.total === 0}>Limpar logs</button>
            </div>
          </div>
          {error && <div className={styles.alert} role="alert">{error}</div>}
          <section className={styles.queuePanel}>
            <div className={styles.logsHeading}>
              <div><h3>Registro de atividade</h3><p>Os logs são carregados somente quando esta página é aberta ou atualizada.</p></div>
              <span>{data.total} eventos</span>
            </div>
            <div className={styles.logsList} style={{ maxHeight: "calc(100vh - 310px)" }}>
              {!data.logs.length && <p className={styles.empty}>Nenhum evento registrado.</p>}
              {[...data.logs].reverse().map((entry, index) => (
                <div className={styles.logEntry} data-level={entry.level} key={`${entry.time}-${index}`}>
                  <time>{new Date(entry.time * 1000).toLocaleString("pt-BR")}</time>
                  <span>{entry.level === "error" ? "ERRO" : entry.level === "warning" ? "AVISO" : entry.level === "success" ? "OK" : "INFO"}</span>
                  <p>{entry.message}</p>
                </div>
              ))}
            </div>
          </section>
          <footer className={styles.footer}><span>Central do Canal · FanCaps</span><span>A visualização dos logs não interfere na fila.</span></footer>
        </div>
      </section>
    </main>
  );
}
