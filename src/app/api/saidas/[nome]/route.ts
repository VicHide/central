
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ nome: string }> }
) {
  const { nome } = await params;

  if (path.basename(nome) !== nome || !/\.(mp4|txt)$/i.test(nome)) {
    return new Response("Não encontrado", { status: 404 });
  }

  const f = path.join(process.cwd(), "out", nome);

  if (!fs.existsSync(f)) {
    return new Response("Não encontrado", { status: 404 });
  }

  if (nome.endsWith(".txt")) {
    return new Response(fs.readFileSync(f, "utf8"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(
    Readable.toWeb(fs.createReadStream(f)) as ReadableStream,
    {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fs.statSync(f).size),
      },
    }
  );
}
