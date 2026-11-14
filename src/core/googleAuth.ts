import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function readEnvVar(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(envPath, "utf8").match(new RegExp(`^${escaped}=(.+)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

function loadServiceAccount(): ServiceAccount | null {
  const credPath = readEnvVar("GOOGLE_APPLICATION_CREDENTIALS") || readEnvVar("GOOGLE_TTS_CREDENTIALS_PATH");
  if (!credPath) return null;
  const resolved = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Arquivo de credenciais do Google Cloud não encontrado: ${resolved}`);
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("O JSON da conta de serviço do Google Cloud está incompleto (falta client_email ou private_key).");
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
  };
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const sa = loadServiceAccount();
  if (!sa) {
    throw new Error(
      "Configure GOOGLE_APPLICATION_CREDENTIALS no .env.local apontando para o JSON da conta de serviço do Google Cloud."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Falha ao obter token OAuth2 do Google Cloud (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("O Google OAuth2 não retornou access_token.");
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}
