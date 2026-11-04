import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const dir = path.join(process.cwd(), "out");
  if (!fs.existsSync(dir)) return Response.json([]);
  const itens = fs.readdirSync(dir).filter((f) => /\.(mp4|txt)$/i.test(f)).map((nome) => {
    const s = fs.statSync(path.join(dir, nome));
    return { nome, kb: Math.round(s.size / 1024), data: s.mtimeMs };
  });
  return Response.json(itens.sort((a, b) => b.data - a.data));
}
