import fs from "node:fs";
import path from "node:path";

const DICIONARIO_PATH = path.join(process.cwd(), "data", "pronuncias.json");

function carregaDicionario(): Record<string, string> {
  try {
    if (!fs.existsSync(DICIONARIO_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(DICIONARIO_PATH, "utf8")) as Record<string, string>;
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        normalized[key.toLowerCase().trim()] = value.trim();
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function adaptaRomaji(word: string): string {
  // Só aplica heurística em palavras com padrões típicos de romaji/japonês.
  if (!/(sh|ch|ts|ji|ju|jo|ky|gy|hy|ry|my|ny|k)/i.test(word)) return word;
  return word
    .replace(/sh([aeiou])/gi, "ch$1")
    .replace(/chi/gi, "tchi")
    .replace(/ju/gi, "dju")
    .replace(/ji/gi, "dji")
    .replace(/ge/gi, "gue")
    .replace(/gi/gi, "gui");
}

/**
 * Converte termos estrangeiros/romaji para grafia fonética em PT-BR
 * apenas para o TTS, preservando a legenda original na tela.
 */
export function aplicaPronuncia(text: string): string {
  const dict = carregaDicionario();
  return text.replace(/[\p{L}\p{N}]+/gu, (token) => {
    const key = token.toLowerCase();
    if (dict[key]) return dict[key];
    return adaptaRomaji(token);
  });
}
