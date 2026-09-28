// Daily summary: for each recipient, today's "vs normal" for their city plus the same one-liner
// the web and the app show — by WhatsApp (approved `daily_summary` template) and/or Web Push.
// Run by .github/workflows/daily-whatsapp.yml. Node 20+, no dependencies.
//
// Env:
//   WHATSAPP_TOKEN            Meta access token (GitHub secret; never commit it)
//   WHATSAPP_RECIPIENTS       JSON (GitHub secret — phone numbers never go in the repo):
//                             [{"to":"346XXXXXXXX","city":"Madrid","lat":40.4168,"lon":-3.7038,"lang":"es"}]
//   WHATSAPP_PHONE_NUMBER_ID  the test number's ID (see META_IDS.md)
//   WEBPUSH_API               the Cloudflare Worker holding push subscriptions (push-worker/)
//   WEBPUSH_ADMIN_TOKEN       its ADMIN_TOKEN (GitHub secret)
//   WEBPUSH_SUBSCRIPTIONS     optional extra subscriptions pasted by hand (GitHub secret, JSON array)
//   WEBPUSH_VAPID_PUBLIC      public key (also in app/app.js)
//   WEBPUSH_VAPID_PRIVATE     private key (GitHub secret)
//   MODE                      what to do (default "template"):
//                               template     the real daily message: WhatsApp template + Web Push
//                               push_only    only the Web Push part
//                               wa_only      only the WhatsApp template part
//                               dry_run      print the messages, send nothing
//                               hello_world  send Meta's pre-approved sample: checks token, number, recipients
//                               text_preview send today's message as plain text + link. Only reaches people
//                                            who wrote to the test number in the last 24 h (WhatsApp rule)
//   SCHEDULE                  set by scheduled runs (github.event.schedule); see the once-a-day guard in main()

import { fetchForecast, loadDay, daysSinceEpoch } from "../app/climate.js";
import { dayLine } from "../app/phrases.js";

const GRAPH_VERSION = "v23.0";
const TEMPLATE = "daily_summary";
const WEB_BASE = "https://jnozaleda.github.io/TempTrack/web/app/?";

const env = process.env;
const MODES = ["template", "push_only", "wa_only", "dry_run", "hello_world", "text_preview", "scheduled"];
let mode = process.argv.includes("--dry-run") ? "dry_run" : (env.MODE || "template");
if (!MODES.includes(mode)) throw new Error(`unknown MODE "${mode}" (use ${MODES.join(", ")})`);
// "scheduled" = the daily send triggered by the Cloudflare Worker's clock: the real message,
// with the same once-a-day guard as GitHub's own (unreliable) schedule.
const scheduled = mode === "scheduled" || Boolean(env.SCHEDULE?.trim());
if (mode === "scheduled") mode = "template";

// Madrid's date and hour right now ("2026-09-28", 9), whatever the server's time zone.
function madridNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

async function stateApi(method, body) {
  const res = await fetch(`${env.WEBPUSH_API}/state`, {
    method,
    headers: { Authorization: `Bearer ${env.WEBPUSH_ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`state API ${method} → HTTP ${res.status}`);
  return res.json();
}

const signed = (d) => { const r = Math.round(d); return r === 0 ? "±0°" : `${r > 0 ? "+" : "−"}${Math.abs(r)}°`; };
const deg = (v) => `${Math.round(v)}°`;
// Template variables can't contain newlines, tabs or 4+ spaces in a row.
const clean = (s) => String(s).replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();

// WhatsApp's template text is fixed (changing it means a new Meta review), but its variables
// can carry emoji — so the colour comes from them: a mood emoji after the difference, and the
// rain status leading the one-liner. Variables can't hold line breaks, hence " · ".
const MOOD_EMOJI = (d) => (d > 6 ? "🔥" : d > 2 ? "☀️" : d >= -2 ? "👌" : d > -6 ? "🧥" : "🥶");
function rainLine(lang, mm) {
  const amount = `${(mm ?? 0).toFixed(1).replace(".", lang === "en" ? "." : ",")} mm`;
  if ((mm ?? 0) < 0.1) return lang === "en" ? "🌂 No rain" : "🌂 Sin lluvia";
  if (mm < 1) return lang === "en" ? "🌦️ A bit of rain" : "🌦️ Algo de lluvia";
  return lang === "en" ? `🌧️ Rain (${amount})` : `🌧️ Lluvia (${amount})`;
}

async function buildMessage(place, src = "wa") {
  const loc = { name: place.city, lat: place.lat, lon: place.lon };
  const forecast = await fetchForecast(loc);
  const day = await loadDay(loc, forecast.today, forecast);
  const { stats, weather } = day;
  if (!stats || weather?.max == null) throw new Error(`no data for ${place.city} on ${forecast.today}`);

  const delta = weather.max - stats.avgMax;
  const sentence = dayLine(place.lang, {
    delta, rainMM: weather.rain, daySwing: weather.min != null ? weather.max - weather.min : null,
    windKmh: weather.wind, uvIndex: weather.uv,
  }, place.city, daysSinceEpoch(forecast.today));
  const query = new URLSearchParams({ c: place.city, lat: place.lat, lon: place.lon, l: place.lang, src });

  return {
    date: forecast.today,
    body: [place.city, signed(delta), deg(weather.max), deg(stats.avgMax), sentence].map(clean),
    // The same five template variables, dressed up for WhatsApp.
    waBody: [place.city, `${signed(delta)} ${MOOD_EMOJI(delta)}`, deg(weather.max), deg(stats.avgMax),
             `${rainLine(place.lang, weather.rain)} · ${sentence}`].map(clean),
    rainMM: weather.rain ?? 0,
    urlSuffix: query.toString(),
  };
}

// What the approved template will render, as plain text — for text_preview only.
function previewText(lang, msg) {
  const [city, delta, max, normal, sentence] = msg.waBody;
  const url = WEB_BASE + msg.urlSuffix;
  return lang === "en"
    ? `Good morning. Today in ${city}: ${delta} vs normal (high ${max}, usually ${normal}).\n\n${sentence}\n\nSee details: ${url}\n\n(test preview)`
    : `Buenos días. Hoy en ${city}: ${delta} respecto a lo normal (máx ${max}, lo normal ${normal}).\n\n${sentence}\n\nVer detalle: ${url}\n\n(vista previa de prueba)`;
}

function payload(to, lang, msg) {
  if (mode === "hello_world") {
    return { type: "template", template: { name: "hello_world", language: { code: "en_US" } } };
  }
  if (mode === "text_preview") {
    return { type: "text", text: { body: previewText(lang, msg), preview_url: true } };
  }
  return {
    type: "template",
    template: {
      name: TEMPLATE,
      language: { code: lang },
      components: [
        { type: "body", parameters: msg.waBody.map((text) => ({ type: "text", text })) },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: msg.urlSuffix }] },
      ],
    },
  };
}

async function send(to, lang, msg) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload(to, lang, msg) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json.error ?? {};
    // Meta's code + details say exactly what's wrong (e.g. 132001 template missing/not approved,
    // 131047 outside the 24 h window, 131030 number not in the test recipient list).
    const detail = err.error_data?.details ? ` — ${err.error_data.details}` : "";
    throw new Error(`HTTP ${res.status} [${err.code ?? "?"}] ${err.message ?? "unknown error"}${detail}`);
  }
  return json.messages?.[0]?.id;
}

const mask = (to) => `…${String(to).slice(-3)}`; // logs are public in a public repo

// ---------- Web Push ----------
// Notification titles get cut at ~30 characters on a phone (iOS already shows "TempCheck"
// above them), so the title is only city + difference, with 🌧️ when rain is forecast:
// "Madrid: +6° vs lo normal 🌧️". The rain amount leads the body, then the numbers, then the
// one-liner — which, on a rainy day, always carries the umbrella tip (0.1 mm threshold).
function rainNote(lang, mm) {
  if (mm < 0.1) return "";
  const amount = `${mm.toFixed(1).replace(".", lang === "en" ? "." : ",")} mm`;
  if (lang === "en") return mm < 1 ? "A bit of rain." : `Rain (${amount}).`;
  return mm < 1 ? "Algo de lluvia." : `Lluvia (${amount}).`;
}

function pushPayload(lang, msg) {
  const [city, delta, max, normal, sentence] = msg.body;
  const rain = rainNote(lang, msg.rainMM);
  const icon = rain ? (msg.rainMM < 1 ? " 🌦️" : " 🌧️") : "";
  return {
    title: (lang === "en" ? `${city}: ${delta} vs normal` : `${city}: ${delta} vs lo normal`) + icon,
    body: [rain, lang === "en" ? `High ${max}, usually ${normal}.` : `Máx ${max}, lo normal ${normal}.`, sentence].filter(Boolean).join(" "),
    url: WEB_BASE + msg.urlSuffix,
  };
}

async function pushApi(method, body) {
  const res = await fetch(`${env.WEBPUSH_API}/subscriptions`, {
    method,
    headers: { Authorization: `Bearer ${env.WEBPUSH_ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`push API ${method} → HTTP ${res.status}`);
  return res.json();
}

// Subscriptions from the Worker plus any pasted by hand, one per endpoint.
async function loadSubscribers() {
  const manual = JSON.parse(env.WEBPUSH_SUBSCRIPTIONS || "[]").map((s) => ({ ...s, source: "manual" }));
  const fromApi = env.WEBPUSH_API && env.WEBPUSH_ADMIN_TOKEN
    ? (await pushApi("GET")).subscriptions.map((s) => ({ ...s, source: "api" })) : [];
  const byEndpoint = new Map();
  for (const s of [...manual, ...fromApi]) if (s.sub?.endpoint) byEndpoint.set(s.sub.endpoint, s);
  return [...byEndpoint.values()];
}

async function sendPushes() {
  const subscribers = await loadSubscribers();
  console.log(`Web Push: ${subscribers.length} subscriber(s)`);
  if (!subscribers.length) { console.log("Web Push: no subscribers"); return 0; }
  let webpush = null;
  if (mode !== "dry_run") {
    if (!env.WEBPUSH_VAPID_PUBLIC || !env.WEBPUSH_VAPID_PRIVATE) throw new Error("missing WEBPUSH_VAPID_PUBLIC or WEBPUSH_VAPID_PRIVATE");
    webpush = (await import("web-push")).default;
    webpush.setVapidDetails("mailto:sustancial-losas-5w@icloud.com", env.WEBPUSH_VAPID_PUBLIC, env.WEBPUSH_VAPID_PRIVATE);
  }
  const messages = new Map();
  let failures = 0;
  for (const s of subscribers) {
    const who = `push …${String(s.sub?.endpoint ?? "").slice(-6)}`;
    const key = `${s.lat},${s.lon},${s.lang}`;
    try {
      if (!messages.has(key)) messages.set(key, await buildMessage(s, "push"));
      const payload = pushPayload(s.lang, messages.get(key));
      if (mode === "dry_run") { console.log(`[dry run] ${who} (${s.city}):`, JSON.stringify(payload)); continue; }
      await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "normal" });
      console.log(`sent ${who} (${s.city})`);
    } catch (e) {
      failures++;
      // 404/410 = the browser dropped this subscription (notifications turned off, app deleted).
      if (e.statusCode === 404 || e.statusCode === 410) {
        failures--; // expected churn, not an error
        if (s.source === "api") {
          await pushApi("DELETE", { endpoint: s.sub.endpoint }).catch(() => {});
          console.log(`${who} (${s.city}) expired — removed`);
        } else {
          console.log(`${who} (${s.city}) expired — remove it from WEBPUSH_SUBSCRIPTIONS`);
        }
        continue;
      }
      console.error(`FAILED ${who} (${s.city}): ${e.statusCode ?? ""} ${e.body || e.message}`);
    }
  }
  return failures;
}

async function main() {
  console.log(`Mode: ${mode}`);

  // The Cloudflare Worker triggers this at 08:00 Madrid time (and re-checks every 15 minutes);
  // GitHub's own schedule is only a backup, as it runs late or not at all when busy. Whichever
  // comes first from 08:00 sends; the Worker remembers the day it went out. Nothing goes out
  // after 12:00 — a "good morning" in the afternoon is worse than none. Manual runs skip this.
  const today = madridNow();
  if (scheduled) {
    if (today.hour < 8) { console.log(`${today.hour}:xx in Madrid — too early, waiting for 08:00.`); return; }
    if (today.hour >= 12) { console.log(`${today.hour}:xx in Madrid — too late for a morning message, skipping today.`); return; }
    const { lastSent } = await stateApi("GET");
    if (lastSent === today.date) { console.log(`Already sent today (${today.date}) — nothing to do.`); return; }
  }

  const pushFailures = ["template", "push_only", "dry_run"].includes(mode) ? await sendPushes() : 0;
  // Marked right after the pushes: a WhatsApp error must not make the next run push again.
  if (scheduled) { await stateApi("PUT", { lastSent: today.date }); console.log(`Marked ${today.date} as sent.`); }
  if (mode === "push_only") { if (pushFailures) process.exit(1); return; }

  const recipients = JSON.parse(env.WHATSAPP_RECIPIENTS || "[]");
  if (!recipients.length) { console.log("WhatsApp: no recipients"); if (pushFailures) process.exit(1); return; }
  if (mode !== "dry_run" && (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID)) throw new Error("missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID");

  // One weather computation per city + language, however many people share it.
  const messages = new Map();
  let failures = 0;
  for (const r of recipients) {
    const key = `${r.lat},${r.lon},${r.lang}`;
    try {
      if (!messages.has(key)) messages.set(key, await buildMessage(r));
      const msg = messages.get(key);
      if (mode === "dry_run") {
        console.log(`[dry run] to ${mask(r.to)} (${r.city}, ${msg.date}):`, JSON.stringify(msg.waBody), msg.urlSuffix);
      } else {
        const id = await send(r.to, r.lang, msg);
        console.log(`sent to ${mask(r.to)} (${r.city}) → ${id}`);
      }
    } catch (e) {
      failures++;
      console.error(`FAILED for ${mask(r.to)} (${r.city}): ${e.message}`);
    }
  }
  if (failures || pushFailures) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
