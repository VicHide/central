"use client";

import Link from "next/link";
import styles from "./Picker.module.css";

export default function PickerPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CENTRAL DO CANAL / FERRAMENTAS</p>
          <h1>Seletor de imagens</h1>
          <p className={styles.description}>
            Área independente para preparar imagens e montar materiais de quiz.
          </p>
        </div>
        <Link className={styles.back} href="/">Voltar ao Central</Link>
      </header>
      <div className={styles.notice} role="note">
        A busca remota no FanCaps está temporariamente desativada nesta integração:
        o serviço aplicou bloqueio de acesso. Não usamos proxies alternativos para
        contornar essa restrição. O espaço de trabalho manual continua disponível.
      </div>
      <iframe
        className={styles.frame}
        src="/picker/index.html"
        title="Seletor de imagens"
        loading="eager"
      />
    </main>
  );
}
