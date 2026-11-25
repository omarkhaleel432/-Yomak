// Hourly: fetch weather, USD rates and gold with fallbacks, keep the last good value, write to public.market_cache.
// Auth: x-push-secret header (JWT check off). Uses the runtime service role key.
const url = Deno.env.get("SUPABASE_URL")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H = { apikey: svc, Authorization: "Bearer " + svc, "Content-Type": "application/json" };
const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
async function j(u: string, ms = 9000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(u, { signal: c.signal, headers: { "User-Agent": "yomak-app/1.0" } }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
async function first<T>(label: string, fns: Array<[string, () => Promise<T>]>) {
  const errs: string[] = [];
  for (const [name, f] of fns) { try { return { value: await f(), source: name }; } catch (e) { errs.push(name + ":" + String((e as Error).message || e)); } }
  throw new Error(label + " all failed " + errs.join(" | "));
}
const CITIES = [
  { name: "الرياض", lat: 24.71, lng: 46.68 }, { name: "جدة", lat: 21.54, lng: 39.17 }, { name: "الدمام", lat: 26.43, lng: 50.1 },
  { name: "مكة", lat: 21.42, lng: 39.83 }, { name: "المدينة", lat: 24.47, lng: 39.61 }, { name: "بريدة", lat: 26.33, lng: 43.97 },
  { name: "القاهرة", lat: 30.04, lng: 31.24 }, { name: "الإسكندرية", lat: 31.2, lng: 29.92 },
];
async function weather() {
  return await first("weather", [
    ["open-meteo", async () => {
      const t = await j("https://api.open-meteo.com/v1/forecast?latitude=" + CITIES.map((c) => c.lat).join(",") + "&longitude=" + CITIES.map((c) => c.lng).join(",") + "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1");
      const arr = Array.isArray(t) ? t : [t]; const items: unknown[] = [];
      arr.forEach((x: any, i: number) => { const tt = num(x?.current?.temperature_2m, -40, 65); if (tt === null) return;
        items.push({ name: CITIES[i].name, lat: CITIES[i].lat, lng: CITIES[i].lng, temp: tt, min: num(x.daily?.temperature_2m_min?.[0], -40, 65), max: num(x.daily?.temperature_2m_max?.[0], -40, 65), code: Number(x.current.weather_code) || 0, hum: num(x.current.relative_humidity_2m, 0, 100), wind: num(x.current.wind_speed_10m, 0, 300) }); });
      if (!items.length) throw new Error("empty"); return { items };
    }],
    ["met.no", async () => {
      const items: unknown[] = [];
      for (const c of CITIES) { const r = await j(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${c.lat}&lon=${c.lng}`);
        const tt = num(r?.properties?.timeseries?.[0]?.data?.instant?.details?.air_temperature, -40, 65);
        if (tt !== null) items.push({ name: c.name, lat: c.lat, lng: c.lng, temp: tt, min: null, max: null, code: 0, hum: num(r.properties.timeseries[0].data.instant.details.relative_humidity, 0, 100), wind: null }); }
      if (!items.length) throw new Error("empty"); return { items };
    }],
  ]);
}
async function rates() {
  return await first("rates", [
    ["ExchangeRate-API", async () => { const n = await j("https://open.er-api.com/v6/latest/USD"); if (n.result !== "success") throw new Error("bad");
      const e = num(n.rates?.EGP, 5, 500), s = num(n.rates?.SAR, 3.4, 4.1); if (e === null || s === null) throw new Error("range");
      return { usdEgp: e, usdSar: s, upd: (Number(n.time_last_update_unix) || 0) * 1000 }; }],
    ["currency-api", async () => { const i = await j("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
      const e = num(i?.usd?.egp, 5, 500), s = num(i?.usd?.sar, 3.4, 4.1); if (e === null || s === null) throw new Error("range");
      return { usdEgp: e, usdSar: s, upd: Date.parse(i.date) || 0 }; }],
    ["currency-api-pages", async () => { const i = await j("https://latest.currency-api.pages.dev/v1/currencies/usd.json");
      const e = num(i?.usd?.egp, 5, 500), s = num(i?.usd?.sar, 3.4, 4.1); if (e === null || s === null) throw new Error("range");
      return { usdEgp: e, usdSar: s, upd: Date.parse(i.date) || 0 }; }],
  ]);
}
async function gold() {
  return await first("gold", [
    ["xaus.com", async () => { const a = await j("https://xaus.com/api/v1/spot?compact=1"); const v = num(a.spot_usd_oz, 300, 30000); if (v === null) throw new Error("range"); return { oz: v, upd: Date.parse(a.updated_at) || Date.now() }; }],
    ["gold-api.com", async () => { const a = await j("https://api.gold-api.com/price/XAU"); const v = num(a.price, 300, 30000); if (v === null) throw new Error("range"); return { oz: v, upd: Date.parse(a.updatedAt) || Date.now() }; }],
    ["currency-api(xau)", async () => { const i = await j("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json"); const v = num(i?.xau?.usd, 300, 30000); if (v === null) throw new Error("range"); return { oz: v, upd: Date.parse(i.date) || 0 }; }],
  ]);
}
async function save(id: string, data: unknown, source: string) {
  await fetch(url + "/rest/v1/market_cache?on_conflict=id", { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id, data, source, fetched_at: new Date().toISOString() }) });
}
Deno.serve(async (req) => {
  const sec = Deno.env.get("PUSH_SECRET");
  if (!svc || !sec || req.headers.get("x-push-secret") !== sec) return ok({ error: "no" }, 401);
  const out: Record<string, string> = {};
  for (const [id, f] of [["weather", weather], ["rates", rates], ["gold", gold]] as const) {
    try { const r = await f(); await save(id, r.value, r.source); out[id] = "ok " + r.source; }
    catch (e) { out[id] = "kept old: " + String((e as Error).message).slice(0, 160); }   // last good row stays, client sees its fetched_at
  }
  return ok(out);
});
