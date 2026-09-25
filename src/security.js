const enc = new TextEncoder();

export function sameOrigin(request, origin) {
  const source = request.headers.get("origin");
  if (!source) return true;
  try { return new URL(source).origin === new URL(origin).origin; } catch { return false; }
}

export function bodyTooLarge(request, maxBytes) {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > maxBytes;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

export async function enforceRateLimit(request, env, namespace, limit, windowSeconds = 3600) {
  const salt = env.RATE_LIMIT_SALT || env.APP_ORIGIN || "secretnests";
  if (!env.DB) return { ok: true, degraded: true };
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const bucketStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const bucketKey = await sha256Hex(`${namespace}:${salt}:${ip}:${bucketStart}`);
  const windowIso = new Date(bucketStart).toISOString();
  await env.DB.prepare(`INSERT INTO request_rate_limits (bucket_key,window_start,count,updated_at)
    VALUES (?,?,1,?)
    ON CONFLICT(bucket_key) DO UPDATE SET count=count+1,updated_at=excluded.updated_at`)
    .bind(bucketKey,windowIso,new Date(now).toISOString()).run();
  const row = await env.DB.prepare("SELECT count FROM request_rate_limits WHERE bucket_key=?").bind(bucketKey).first();
  return { ok: Number(row?.count || 0) <= limit, remaining: Math.max(0, limit - Number(row?.count || 0)) };
}

export function adminEmail(request, env) {
  const email = (request.headers.get("cf-access-authenticated-user-email") || "").trim().toLowerCase();
  const allowed = String(env.ADMIN_EMAILS || "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) return null;
  return email;
}

export function safeLogError(error) {
  const message = String(error?.message || error || "unknown error")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[redacted-email]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,"Bearer [redacted]");
  return message.slice(0,1000);
}
