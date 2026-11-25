// Issues a short-lived LiveKit join token for a YOMAK group call.
// Secrets (set in Supabase, never in the repo): LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the Edge runtime.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const b64u = (x: ArrayBuffer | string) => {
  const bytes = typeof x === "string" ? new TextEncoder().encode(x) : new Uint8Array(x);
  let s = ""; bytes.forEach((c) => (s += String.fromCharCode(c)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function sign(payload: Record<string, unknown>, secret: string) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64u(sig);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  const apiKey = Deno.env.get("LIVEKIT_API_KEY"), apiSecret = Deno.env.get("LIVEKIT_API_SECRET"), lkUrl = Deno.env.get("LIVEKIT_URL");
  if (!apiKey || !apiSecret || !lkUrl) return json({ error: "not configured" }, 500);
  let gid = "";
  try { gid = String((await req.json()).group_id || ""); } catch { /* ignore */ }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(gid)) return json({ error: "bad group" }, 400);
  const hdr = { apikey: anon, Authorization: auth };
  const u = await fetch(url + "/auth/v1/user", { headers: hdr });
  if (!u.ok) return json({ error: "not signed in" }, 401);
  const uid = (await u.json()).id as string;
  // membership check with the caller's own token (read only, respects RLS)
  const m = await fetch(`${url}/rest/v1/group_members?select=user_id&group_id=eq.${encodeURIComponent(gid)}&user_id=eq.${uid}&limit=1`, { headers: hdr });
  const rows = m.ok ? await m.json() : [];
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: "not a member" }, 403);
  let name = "مستخدم";
  const p = await fetch(`${url}/rest/v1/profiles?select=name&id=eq.${uid}&limit=1`, { headers: hdr });
  if (p.ok) { const r = await p.json(); if (r[0]?.name) name = String(r[0].name).slice(0, 40); }
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({
    iss: apiKey, sub: uid, name, nbf: now - 10, exp: now + 3600,
    video: { room: "grp-" + gid, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false },
  }, apiSecret);
  return json({ token, url: lkUrl, room: "grp-" + gid });
});
