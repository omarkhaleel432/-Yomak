// Admin-only account control: block (cannot sign in), unblock, delete account.
// Caller must be in public.admins. Uses the service role key provided by the Edge runtime. Never exposed to the browser.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!svc) return json({ error: "not configured" }, 500);
  const auth = req.headers.get("Authorization") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  const me = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, Authorization: auth } });
  if (!me.ok) return json({ error: "not signed in" }, 401);
  const caller = (await me.json()).id as string;
  const sh = { apikey: svc, Authorization: "Bearer " + svc, "Content-Type": "application/json" };
  const chk = await fetch(`${url}/rest/v1/admins?select=user_id&user_id=eq.${caller}&limit=1`, { headers: sh });
  const adm = chk.ok ? await chk.json() : [];
  if (!Array.isArray(adm) || !adm.length) return json({ error: "not admin" }, 403);
  let body: { action?: string; user_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const act = String(body.action || ""), uid = String(body.user_id || "");
  if (!["block", "unblock", "delete"].includes(act) || !UUID.test(uid)) return json({ error: "bad request" }, 400);
  if (uid === caller) return json({ error: "cannot target yourself" }, 400);
  const tgt = await fetch(`${url}/rest/v1/admins?select=user_id&user_id=eq.${uid}&limit=1`, { headers: sh });
  const ta = tgt.ok ? await tgt.json() : [];
  if (Array.isArray(ta) && ta.length) return json({ error: "target is an admin" }, 400);
  const log = (d: string) => fetch(url + "/rest/v1/admin_log", { method: "POST", headers: sh, body: JSON.stringify({ admin: caller, action: "acct_" + act, target_user: uid, details: d }) });
  if (act === "delete") {
    const r = await fetch(`${url}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: sh });
    if (!r.ok) return json({ error: "delete failed", detail: (await r.text()).slice(0, 200) }, 500);
    await log("account deleted");
    return json({ ok: true });
  }
  const r = await fetch(`${url}/auth/v1/admin/users/${uid}`, { method: "PUT", headers: sh, body: JSON.stringify({ ban_duration: act === "block" ? "876000h" : "none" }) });
  if (!r.ok) return json({ error: act + " failed", detail: (await r.text()).slice(0, 200) }, 500);
  if (act === "block") await fetch(url + "/rest/v1/bans", { method: "POST", headers: sh, body: JSON.stringify({ user_id: uid, until: null, reason: "حظر الحساب", created_by: caller }) });
  else await fetch(`${url}/rest/v1/bans?user_id=eq.${uid}`, { method: "DELETE", headers: sh });
  await log(act === "block" ? "sign-in disabled" : "sign-in restored");
  return json({ ok: true });
});
