// Gera os efeitos de public/sfx por síntese (sem arquivos de terceiros). Uso: npm run sons
import fs from "node:fs";
import path from "node:path";

const SR = 44100;
let sem = 12345;
const ruido = () => { sem = (Math.imul(sem, 1664525) + 1013904223) >>> 0; return sem / 2147483648 - 1; };
const gera = (seg: number, f: (t: number) => number) => Float32Array.from({ length: Math.round(seg * SR) }, (_, i) => f(i / SR));

function wav(a: Float32Array): Buffer {
  const pico = Math.max(...a.map(Math.abs)) || 1;
  const b = Buffer.alloc(44 + a.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + a.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(a.length * 2, 40);
  a.forEach((v, i) => b.writeInt16LE(Math.round((v / pico) * 0.9 * 32767), 44 + i * 2));
  return b;
}

const clique = (hz: number) => gera(0.09, (t) => (Math.sin(2 * Math.PI * hz * t) * 0.6 + ruido() * 0.4 * Math.exp(-t * 400)) * Math.exp(-t * 70));
const nota = (hz: number, t: number) => (Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(4 * Math.PI * hz * t)) * Math.exp(-t * 5);
let lp = 0;

const sons: Record<string, Float32Array> = {
  tick: clique(2200),
  tock: clique(1400),
  pop: gera(0.14, (t) => Math.sin(2 * Math.PI * (450 * t + 0.5 * 6400 * t * t)) * Math.exp(-t * 28)),
  whoosh: gera(0.5, (t) => { lp += (0.02 + 0.4 * (t / 0.5)) * (ruido() - lp); return lp * Math.sin((Math.PI * t) / 0.5) ** 2; }),
  reveal: gera(1, (t) => [[523.25, 0], [659.25, 0.08], [783.99, 0.16]].reduce((s, [hz, d]) => s + (t >= d ? nota(hz, t - d) : 0), 0)),
};

const dir = path.join(process.cwd(), "public", "sfx");
fs.mkdirSync(dir, { recursive: true });
for (const [nome, dados] of Object.entries(sons)) fs.writeFileSync(path.join(dir, `${nome}.wav`), wav(dados));
console.log("Efeitos gerados em public/sfx:", Object.keys(sons).join(", "));
