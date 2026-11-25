// Sign in with Pi: verifies a Pi access token with the Pi Platform API, then creates or finds the matching
// Yomak user and returns a one-time token the app exchanges for a normal Supabase session.
// Uses the service role key provided by the Edge runtime. Never exposed to the browser.
// Deploy with JWT verification OFF (the app calls it before sign-in, with the public key only).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const UID = /^[A-Za-z0-9-]{8,64}$/;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!svc) return json({ error: "not configured" }, 500);
  let token = "";
  try { token = String((await req.json()).token || ""); } catch { return json({ error: "bad request" }, 400); }
  if (token.length < 10 || token.length > 4000) return json({ error: "bad token" }, 400);
  // 1) Verify the token with Pi (never trust the client-side user object).
  const me = await fetch("https://api.minepi.com/v2/me", { headers: { Authorization: "Bearer " + token } });
  if (!me.ok) return json({ error: "pi token rejected" }, 401);
  const pi = await me.json();
  const uid = String(pi.uid || "");
  const username = String(pi.username || "").slice(0, 40);
  if (!UID.test(uid)) return json({ error: "bad pi user" }, 401);
  // 2) Create or find the Yomak user for this Pi user (stable per Pi uid).
  const email = `${uid.toLowerCase()}@pi.yomak-users.com`;
  const sh = { apikey: svc, Authorization: "Bearer " + svc, "Content-Type": "application/json" };
  const mk = await fetch(url + "/auth/v1/admin/users", {
    method: "POST", headers: sh,
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { name: username || "Pi user", pi_uid: uid, pi_username: username } }),
  });
  if (!mk.ok && mk.status !== 422 && mk.status !== 409) return json({ error: "create failed" }, 500);
  // 3) One-time sign-in token (no email is sent).
  const gl = await fetch(url + "/auth/v1/admin/generate_link", {
    method: "POST", headers: sh, body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!gl.ok) return json({ error: "link failed" }, 500);
  const g = await gl.json();
  const th = g.hashed_token || (g.properties && g.properties.hashed_token);
  if (!th) return json({ error: "no token" }, 500);
  return json({ token_hash: th, name: username });
});
