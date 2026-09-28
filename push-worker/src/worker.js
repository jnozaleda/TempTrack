// TempCheck push subscriptions — the only server-side piece of the web.
//
// The browser registers here when someone turns on the daily heads-up; the daily GitHub
// Actions job reads the list and sends the pushes. Nothing personal is stored: a push
// endpoint (an opaque URL from the browser vendor), its encryption keys, and the city and
// language to write the message for.
//
//   POST   /subscribe      {sub, city, lat, lon, lang}   browser, from ALLOWED_ORIGINS only
//   POST   /unsubscribe    {endpoint}                    browser
//   GET    /subscriptions                                daily job, Authorization: Bearer ADMIN_TOKEN
//   DELETE /subscriptions  {endpoint}                    daily job, drops expired subscriptions
//   GET    /state                                        daily job: {lastSent: "YYYY-MM-DD" | null}
//   PUT    /state          {lastSent}                    daily job: marks today's send as done
//
// It is also the clock: GitHub's scheduled runs start late or not at all when busy, so a Cron
// Trigger here starts the daily GitHub workflow at 08:00 Madrid time (see scheduled() below).
//
// Bindings: SUBS (KV namespace), ADMIN_TOKEN (secret), ALLOWED_ORIGINS (comma-separated var),
// GITHUB_DISPATCH_TOKEN (secret: fine-grained token, Actions read/write on the repo only).

// Only real browser push services, so the list can't be filled with arbitrary URLs.
const PUSH_HOSTS = [
  "fcm.googleapis.com",                // Chrome, Edge, Android
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com",                // Safari (macOS, iOS home-screen web apps)
  ".notify.windows.com",               // legacy Edge
];
const MAX_BODY = 2048;

const GITHUB_REPO = "jnozaleda/TempTrack";
const GITHUB_WORKFLOW = "daily-whatsapp.yml";

export default {
  // Cron Triggers (wrangler.toml) fire every 15 minutes during 06:00–07:59 UTC, which covers
  // 08:00–09:59 Madrid in both summer and winter. Only runs that land in Madrid's 08:00–09:59
  // window act, and only while today's message hasn't gone out: the first one starts the
  // workflow; later ones retry if it didn't send (the workflow itself never double-sends).
  async scheduled(event, env, ctx) {
    const now = madridNow();
    if (env.DISPATCH_TEST !== "1") { // test deploys only: dispatch regardless of time/state
      if (now.hour < 8 || now.hour > 9) return;
      if ((await env.SUBS.get("state:lastSent")) === now.date) return;
    }
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "tempcheck-push",
      },
      body: JSON.stringify({ ref: "main", inputs: { mode: "scheduled" } }),
    });
    console.log(`dispatch ${now.date} ${now.hour}h → ${res.status}${res.ok ? "" : " " + (await res.text())}`);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] ?? "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const reply = (status, body) => new Response(body == null ? null : JSON.stringify(body), {
      status, headers: { ...cors, ...(body == null ? {} : { "Content-Type": "application/json" }) },
    });

    if (request.method === "OPTIONS") return reply(204);

    try {
      if (url.pathname === "/subscribe" || url.pathname === "/unsubscribe") {
        if (request.method !== "POST") return reply(405, { error: "method not allowed" });
        if (!allowed.includes(origin)) return reply(403, { error: "origin not allowed" });
        const body = await readJson(request);

        if (url.pathname === "/unsubscribe") {
          const endpoint = validEndpoint(body?.endpoint);
          if (!endpoint) return reply(400, { error: "bad endpoint" });
          await env.SUBS.delete(await keyFor(endpoint));
          return reply(200, { ok: true });
        }

        const record = validRecord(body);
        if (!record) return reply(400, { error: "bad subscription" });
        // Same endpoint again (e.g. new city or language) simply overwrites the record.
        await env.SUBS.put(await keyFor(record.sub.endpoint), "", { metadata: record });
        return reply(200, { ok: true });
      }

      if (url.pathname === "/subscriptions" || url.pathname === "/state") {
        if (!env.ADMIN_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
          return reply(401, { error: "unauthorized" });
        }
      }

      // The daily job runs several times each morning (GitHub skips scheduled runs under load);
      // this is how it knows today's message already went out. Stored under a key that can't
      // collide with a subscription (those are 64-char hashes).
      if (url.pathname === "/state") {
        if (request.method === "GET") return reply(200, { lastSent: await env.SUBS.get("state:lastSent") });
        if (request.method === "PUT") {
          const lastSent = (await readJson(request))?.lastSent;
          if (typeof lastSent !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(lastSent)) return reply(400, { error: "bad date" });
          await env.SUBS.put("state:lastSent", lastSent);
          return reply(200, { ok: true });
        }
        return reply(405, { error: "method not allowed" });
      }

      if (url.pathname === "/subscriptions") {
        if (request.method === "GET") {
          const subscriptions = [];
          let cursor;
          do {
            const page = await env.SUBS.list({ cursor });
            for (const k of page.keys) if (k.metadata && !k.name.startsWith("state:")) subscriptions.push(k.metadata);
            cursor = page.list_complete ? undefined : page.cursor;
          } while (cursor);
          return reply(200, { subscriptions });
        }
        if (request.method === "DELETE") {
          const endpoint = validEndpoint((await readJson(request))?.endpoint);
          if (!endpoint) return reply(400, { error: "bad endpoint" });
          await env.SUBS.delete(await keyFor(endpoint));
          return reply(200, { ok: true });
        }
        return reply(405, { error: "method not allowed" });
      }

      return reply(404, { error: "not found" });
    } catch (e) {
      return reply(400, { error: String(e.message ?? e) });
    }
  },
};

function madridNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("body too large");
  return JSON.parse(text);
}

function validEndpoint(value) {
  if (typeof value !== "string" || value.length > 600) return null; // the whole record must fit in KV metadata (1 KB)
  let u;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const ok = PUSH_HOSTS.some((h) => (h.startsWith(".") ? u.hostname.endsWith(h) : u.hostname === h));
  return ok ? value : null;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

// Rebuilds the record from known fields only, so nothing unexpected is ever stored.
function validRecord(body) {
  const endpoint = validEndpoint(body?.sub?.endpoint);
  const { p256dh, auth } = body?.sub?.keys ?? {};
  if (!endpoint || typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!B64URL.test(p256dh) || p256dh.length > 120 || !B64URL.test(auth) || auth.length > 40) return null;
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const city = typeof body.city === "string" ? body.city.trim().slice(0, 60) : "";
  if (!city) return null;
  const lang = body.lang === "en" ? "en" : "es";
  return {
    sub: { endpoint, keys: { p256dh, auth } },
    city, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, lang,
    since: new Date().toISOString().slice(0, 10),
  };
}

async function keyFor(endpoint) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
