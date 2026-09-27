// Daily WhatsApp summary: for each recipient, today's "vs normal" for their city plus the same
// one-liner the web and the app show, sent with the approved `daily_summary` template.
// Run by .github/workflows/daily-whatsapp.yml. Node 20+, no dependencies.
//
// Env:
//   WHATSAPP_TOKEN            Meta access token (GitHub secret; never commit it)
//   WHATSAPP_RECIPIENTS       JSON (GitHub secret — phone numbers never go in the repo):
//                             [{"to":"346XXXXXXXX","city":"Madrid","lat":40.4168,"lon":-3.7038,"lang":"es"}]
//   WHATSAPP_PHONE_NUMBER_ID  the test number's ID (see META_IDS.md)
//   DRY_RUN=1                 print the messages instead of sending them
//   SCHEDULE                  the cron that fired (github.event.schedule); see shouldRunNow()

import { fetchForecast, loadDay, daysSinceEpoch } from "../app/climate.js";
import { dayLine } from "../app/phrases.js";

const GRAPH_VERSION = "v23.0";
const TEMPLATE = "daily_summary";
const WEB_BASE = "https://jnozaleda.github.io/TempTrack/web/app/?";

const env = process.env;
const dryRun = env.DRY_RUN === "1" || process.argv.includes("--dry-run");

// GitHub cron is UTC-only, so the workflow fires at 06:00 and 07:00 UTC and this keeps the one
// that is 08:00 in Madrid (06:00 UTC in summer, 07:00 UTC in winter). Deciding by which cron
// fired, not by the clock, means GitHub's usual start delays can't make us skip or double-send.
function shouldRunNow() {
  const schedule = env.SCHEDULE?.trim();
  if (!schedule) return true; // manual run
  const madridOffset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName").value; // "GMT+2" / "GMT+1"
  const summer = madridOffset === "GMT+2";
  return schedule.startsWith("0 6 ") ? summer : schedule.startsWith("0 7 ") ? !summer : true;
}

const signed = (d) => { const r = Math.round(d); return r === 0 ? "±0°" : `${r > 0 ? "+" : "−"}${Math.abs(r)}°`; };
const deg = (v) => `${Math.round(v)}°`;
// Template variables can't contain newlines, tabs or 4+ spaces in a row.
const clean = (s) => String(s).replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();

async function buildMessage(place) {
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
  const query = new URLSearchParams({ c: place.city, lat: place.lat, lon: place.lon, l: place.lang, src: "wa" });

  return {
    date: forecast.today,
    body: [place.city, signed(delta), deg(weather.max), deg(stats.avgMax), sentence].map(clean),
    urlSuffix: query.toString(),
  };
}

async function send(to, lang, msg) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: TEMPLATE,
        language: { code: lang },
        components: [
          { type: "body", parameters: msg.body.map((text) => ({ type: "text", text })) },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: msg.urlSuffix }] },
        ],
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error?.message ?? "unknown error"}`);
  return json.messages?.[0]?.id;
}

const mask = (to) => `…${String(to).slice(-3)}`; // logs are public in a public repo

async function main() {
  if (!shouldRunNow()) { console.log("Not 08:00 in Madrid for this trigger — skipping."); return; }

  const recipients = JSON.parse(env.WHATSAPP_RECIPIENTS ?? "[]");
  if (!recipients.length) throw new Error("WHATSAPP_RECIPIENTS is empty");
  if (!dryRun && (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID)) throw new Error("missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID");

  // One weather computation per city + language, however many people share it.
  const messages = new Map();
  let failures = 0;
  for (const r of recipients) {
    const key = `${r.lat},${r.lon},${r.lang}`;
    try {
      if (!messages.has(key)) messages.set(key, await buildMessage(r));
      const msg = messages.get(key);
      if (dryRun) {
        console.log(`[dry run] to ${mask(r.to)} (${r.city}, ${msg.date}):`, JSON.stringify(msg.body), msg.urlSuffix);
      } else {
        const id = await send(r.to, r.lang, msg);
        console.log(`sent to ${mask(r.to)} (${r.city}) → ${id}`);
      }
    } catch (e) {
      failures++;
      console.error(`FAILED for ${mask(r.to)} (${r.city}): ${e.message}`);
    }
  }
  if (failures) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
