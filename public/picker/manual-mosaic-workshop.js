(function registerManualMosaicWorkshop() {
  "use strict";

  class ManualMosaicWorkshop extends HTMLElement {
    async connectedCallback() {
      if (this.shadowRoot || this.dataset.loading === "true") return;
      this.dataset.loading = "true";

      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<p class="loading" role="status">正在加载手动马赛克工具…</p>`;

      try {
        const response = await fetch("./manual-mosaic.html");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const source = await response.text();
        const parsed = new DOMParser().parseFromString(source, "text/html");
        const style = parsed.querySelector("style")?.textContent || "";
        const script = [...parsed.querySelectorAll("script")].at(-1)?.textContent || "";
        const content = [...parsed.body.children]
          .filter(element => element.tagName !== "SCRIPT")
          .map(element => element.outerHTML)
          .join("");

        const scopedStyle = style
          .replace(/:root/g, ":host")
          .replace(/html\.is-embedded/g, ":host")
          .replace(/html/g, ":host")
          .replace(/body/g, ".workshop-root");

        root.innerHTML = `
          <style>
            :host { display: block; color: var(--text, oklch(0.245 0.035 263)); }
            ${scopedStyle}
            .workshop-root {
              min-height: 0;
              padding: 0;
              background: transparent;
              color: inherit;
              font-family: inherit;
            }
            .workshop-root::before,
            .workshop-root::after { display: none; }
            .app-header {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              align-items: center;
              max-width: none;
              padding: 16px 22px 13px;
            }
            .header-copy {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              align-items: baseline;
              gap: 5px 14px;
            }
            .header-copy .eyebrow { display: none; }
            .header-copy h1 {
              grid-column: 1;
              margin: 0;
              font-size: 1.25rem;
              letter-spacing: 0;
              white-space: nowrap;
            }
            .header-copy p {
              grid-column: 2;
              margin: 0;
              font-size: 0.8rem;
            }
            main { max-width: none; padding: 0 24px 28px; }
            .top-deck, .gallery-area, .inspector { box-shadow: 0 6px 18px rgb(23 32 51 / 0.045); }
            .top-deck {
              border-color: var(--line);
              background: var(--surface);
            }
            .stage-ruler {
              min-height: 36px;
              background: color-mix(in oklch, var(--surface-soft) 72%, var(--surface));
              font-size: 0.68rem;
            }
            .stage-ruler .original-cell {
              background: color-mix(in oklch, var(--teal-soft) 72%, var(--surface));
            }
            .control-deck {
              display: grid;
              grid-template-columns: 280px minmax(0, 1fr);
              align-items: stretch;
            }
            .upload-zone {
              position: relative;
              display: grid;
              grid-template-columns: 40px minmax(0, 1fr);
              align-content: center;
              align-items: start;
              gap: 12px;
              min-height: 132px;
              padding: 16px 18px;
              border-inline-end: 1px solid var(--line);
              border-bottom: 0;
              background: var(--surface);
            }
            .upload-icon {
              grid-column: 1;
              grid-row: 1;
              width: 38px;
              height: 38px;
              border-radius: 10px;
              box-shadow: none;
            }
            .upload-copy {
              grid-column: 2;
              display: block;
              min-width: 0;
            }
            .upload-copy strong {
              margin-bottom: 2px;
              font-size: 0.94rem;
            }
            .upload-copy p {
              max-width: none;
              margin: 0 0 9px;
              line-height: 1.45;
            }
            .upload-copy button {
              min-width: 100px;
            }
            .global-settings {
              display: grid;
              grid-template-columns: 72px minmax(0, 1fr);
              grid-template-rows: auto auto;
              align-content: center;
              gap: 10px 12px;
              padding: 14px 18px;
            }
            .global-settings .section-heading {
              grid-column: 1;
              grid-row: 1;
              align-self: center;
              margin: 0;
            }
            .global-settings .section-heading h2 {
              font-size: 0.8rem;
            }
            .settings-line {
              display: contents;
            }
            .global-settings .preset-group {
              grid-column: 2;
              grid-row: 1;
              min-width: 0;
            }
            .global-settings .preset-group .field-label {
              margin-bottom: 5px;
            }
            .global-settings .preset-row {
              grid-template-columns: repeat(6, minmax(68px, 1fr));
              gap: 6px;
            }
            .global-settings .preset-button {
              min-height: 36px;
              padding: 5px 8px;
              white-space: nowrap;
              box-shadow: none !important;
            }
            .global-settings .preset-button::after { display: none; }
            .global-settings .preset-button.is-active {
              box-shadow: none !important;
            }
            .global-settings .custom-group {
              display: grid;
              grid-column: 1 / -1;
              grid-row: 2;
              grid-template-columns: 72px auto;
              align-items: center;
              justify-content: start;
              gap: 12px;
              min-width: 0;
              padding: 10px 0 0;
              border-top: 1px solid var(--line);
              background: transparent;
            }
            .global-settings .custom-group > .field-label {
              margin: 0;
              color: var(--ink);
              font-size: 0;
              line-height: 1.45;
            }
            .global-settings .custom-group > .field-label::before {
              content: "自定义";
              display: inline;
              color: var(--ink);
              font-size: 0.74rem;
              font-weight: 780;
            }
            .global-settings .custom-group .number-row {
              display: grid;
              grid-template-columns: repeat(3, 88px) 58px;
              align-items: stretch;
              gap: 7px;
            }
            .global-settings .custom-group .number-field {
              min-width: 0;
              background: var(--surface);
              box-shadow: none !important;
            }
            .global-settings .custom-group .number-field:focus-within {
              box-shadow: none !important;
            }
            .global-settings .custom-group .number-field input {
              width: 100%;
            }
            .global-settings .custom-group .apply-custom {
              min-width: 58px;
              box-shadow: none !important;
            }
            .global-settings .custom-group .field-error {
              grid-column: 2;
              min-height: 0;
              margin: -7px 0 0;
            }
            .empty-state {
              min-height: 96px;
              padding: 16px 24px;
            }
            .empty-illustration {
              display: none;
            }
            .empty-state h3 { margin-bottom: 4px; }
            .empty-state p { margin-bottom: 0; }
            .empty-state button { display: none; }
            .workspace:has(.inspector-empty) {
              grid-template-columns: minmax(0, 1fr);
            }
            .inspector:has(.inspector-empty) {
              display: none;
            }
            .inspector .inspector-body {
              padding: 16px 16px 18px;
            }
            .inspector .background-tool {
              margin-inline: 0;
            }
            .inspector .inspector-bottom {
              margin-inline: 0;
            }
            @media (max-width: 640px) {
              .app-header {
                grid-template-columns: 1fr;
                gap: 9px;
                padding-inline: 16px;
              }
              .header-copy {
                grid-template-columns: 1fr;
                gap: 4px;
              }
              .header-copy h1,
              .header-copy p { grid-column: 1; }
              .privacy-note { justify-self: start; }
              main { padding-inline: 16px; }
              .control-deck {
                grid-template-columns: 1fr;
              }
              .upload-zone {
                grid-template-columns: 42px minmax(0, 1fr);
                min-height: 0;
                padding: 16px;
                border-inline-end: 0;
                border-bottom: 1px solid var(--line);
              }
              .upload-icon { width: 40px; height: 40px; }
              .global-settings { padding: 18px 16px; }
              .global-settings {
                grid-template-columns: 1fr;
                grid-template-rows: auto auto;
              }
              .section-heading {
                align-items: flex-start;
                flex-direction: column;
                gap: 3px;
              }
              .global-settings .preset-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              .global-settings .preset-group {
                grid-column: 1;
                grid-row: 2;
              }
              .global-settings .section-heading {
                grid-column: 1;
                grid-row: 1;
              }
              .global-settings .custom-group {
                grid-column: 1;
                grid-row: 3;
                grid-template-columns: 1fr;
                gap: 9px;
              }
              .global-settings .custom-group .number-row {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .global-settings .custom-group .apply-custom { grid-column: 1 / -1; }
              .global-settings .custom-group .field-error { grid-column: 1; }
              .gallery-head {
                align-items: stretch;
                flex-direction: column;
              }
              .gallery-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .gallery-actions button { width: 100%; }
            }
          </style>
          <div class="workshop-root">${content}</div>
        `;

        const componentScript = script
          .replaceAll("document.getElementById", "root.getElementById")
          .replace(/\n\s*const embedded = new URLSearchParams[\s\S]*?window\.addEventListener\("load", reportHeight, \{ once: true \}\);\n\s*\}/, "");
        new Function("root", componentScript)(root);
      } catch (error) {
        root.innerHTML = `<p class="loading error" role="alert">手动马赛克工具加载失败，请刷新页面重试。</p>`;
        console.error("Manual mosaic workshop failed to initialize", error);
      }
    }
  }

  customElements.define("manual-mosaic-workshop", ManualMosaicWorkshop);
})();
