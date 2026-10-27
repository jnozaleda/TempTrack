// TempCheck web — "Is today unusual?" The same screens as the iOS app (Today and This week),
// rendered from plain template strings. State lives in the URL so the WhatsApp link can open
// any city, date and language directly: ?c=Madrid&lat=40.4168&lon=-3.7038&d=2026-09-25&l=es

import {
  BASELINE_START, HEAT_THRESHOLD, TROPICAL_NIGHT, fetchForecast, searchCities, loadDay, loadWeek, loadMonth, loadYear,
  daysSinceEpoch, yearOf, addDays,
} from "./climate.js";
import { dayLine } from "./phrases.js";
import { monthNote, weekNote, weekDayNote, dateHistoryNote, rainWindNote, longTermNote } from "./facts.js";

const APP_NAME = "TempCheck";
// GoatCounter site code (the "xxx" in xxx.goatcounter.com). Empty = no analytics at all.
const GOATCOUNTER_CODE = "tempcheck";
const DEFAULT_LOC = { name: "Madrid", lat: 40.4168, lon: -3.7038 };

// ---------- Copy ----------
const T = {
  es: {
    today: "Hoy", week: "Esta semana", backToToday: "Volver a hoy", changeCity: "Cambiar ciudad",
    verdicts: ["Mucho más calor de lo normal", "Más calor de lo normal", "Normal para la fecha", "Más fresco de lo normal", "Mucho más frío de lo normal"],
    forecast: "Previsión", recorded: "Registrado",
    noForecast: "Aún sin previsión", normalHigh: (low) => `Máxima normal para esta fecha · mínima ${low}`,
    high: "Máx", low: "Mín", usually: (v) => `lo normal, ${v}`,
    rain: "Lluvia", wind: "Viento", dry: "Seco", wetter: "Más lluvia", normalWord: "Normal", windier: "Más viento", calmer: "Más calma",
    every: (d) => `Cada ${d}`, last10: "últimos 10 años", normalSince: `normal desde ${BASELINE_START}`,
    rainWind: "Lluvia y viento", since: (y) => `Desde ${y}`, sameDay: "mismo día", todayLower: "hoy",
    compare: "(años 80 → últimos 10 años)", compareHigh: "Máx", compareLow: "Mín",
    heatTitle: (t, m) => `Días por encima de ${t}° · ${m}`, soFar: "de momento",
    usualHeat: (n) => (n === 0 ? "normalmente ninguno a estas alturas" : `normalmente solo ${n} a estas alturas`),
    above: (t) => `por encima de ${t}°`, not: "no", toCome: "por llegar",
    avgFortnight: "media de<br>estos 14 días", eachBar: "Cada barra: ese día frente a su normal · hoy remarcado",
    last7: "← últimos 7 días", next7: "próximos 7 días →", todayCaps: "Hoy",
    loading: `Cargando el tiempo de cada año desde ${BASELINE_START}…`,
    error: "No se han podido cargar los datos.", retry: "Reintentar", noData: "No hay datos históricos para esta fecha.",
    search: "Busca una ciudad", close: "Cerrar", noResults: "Sin resultados",
    footer: `Lo normal = la media de ese día desde ${BASELINE_START}.`, privacy: "Privacidad",
    title: "¿Es hoy un día normal?",
    month: {
      soFar: (m) => `${m} hasta hoy`, closed: (m) => `${m}, cerrado`, range: (a, b, m) => `${a}–${b} ${m} · desde ${BASELINE_START}`,
      temperature: "Temperatura", rain: "Lluvia",
      verdicts: ["Mucho más cálido de lo normal", "Más cálido de lo normal", "Dentro de lo normal", "Más fresco de lo normal", "Mucho más frío de lo normal"],
      wetter: "Más lluvioso de lo normal", drier: "Más seco de lo normal", normal: "Dentro de lo normal",
      avgHigh: (a, n) => `máxima media ${a} · normal ${n}`,
      rank: { warm: (o, n) => (o ? `el ${o} más cálido de ${n}` : `el más cálido de ${n}`), cool: (o, n) => (o ? `el ${o} más fresco de ${n}` : `el más fresco de ${n}`),
              wet: (o, n) => (o ? `el ${o} más lluvioso de ${n}` : `el más lluvioso de ${n}`), dry: (o, n) => (o ? `el ${o} más seco de ${n}` : `el más seco de ${n}`) },
      ordinal: (n) => `${n}.º`,
      eachDay: "Cada día frente a su normal", today: "hoy",
      byNow: (v) => `normal ${v} a estas alturas`, normalMonth: (v) => `normal ${v}`,
      usual: "lo habitual (la mitad de los años)", wholeMonth: (v) => `normal (mes entero: ${v})`,
      rainyDays: "Días de lluvia", usually: (n) => `normalmente ${n}`, wettest: "Día más lluvioso", noRain: "aún sin lluvia",
    },
    year: {
      soFar: (y) => `${y} hasta hoy`, lowHigh: "de la mínima a la máxima media", rainMonth: "lluvia del mes",
      hottest: "Día más caluroso", coldest: "Noche más fría", hotDays: (n) => `Días de ${n}° o más`,
      nights: (n) => `Noches de ${n}° o más`, tropical: "noches tropicales", rain: "Lluvia", onDays: (n) => `en ${n} días`,
      dry: "Racha más larga sin llover", days: (n) => `${n} días`,
    },
    lowsChange: "Mínimas, años 80 → últimos 10", highsChange: "Máximas, años 80 → últimos 10",
    push: {
      title: "Aviso diario",
      pitch: (c) => `Recibe cada mañana a las 8:00 cómo viene el día en ${c} frente a lo normal.`,
      enable: "Activar aviso diario", disable: "Desactivar", copy: "Copiar código", copied: "Copiado",
      on: (c) => `Aviso diario activado para ${c}.`,
      when: "Te llegará cada mañana a las 8:00 (hora peninsular). Si cambias de ciudad o idioma aquí, el aviso cambia contigo.",
      sendCode: "Para darte de alta en la beta, envía este código a quien te invitó. Si cambias de ciudad o idioma, vuelve a mandarlo.",
      ios: "En iPhone, las notificaciones solo funcionan con la web instalada: pulsa Compartir y luego «Añadir a pantalla de inicio». Abre TempCheck desde ese icono y activa aquí el aviso.",
      unsupported: "Este navegador no admite notificaciones.",
      denied: "Has bloqueado las notificaciones de esta web. Actívalas en los ajustes del navegador y vuelve aquí.",
      failed: "No se ha podido activar. Vuelve a intentarlo.",
    },
  },
  en: {
    today: "Today", week: "This week", backToToday: "Back to today", changeCity: "Change city",
    verdicts: ["Much hotter than usual", "Hotter than usual", "About normal", "Cooler than usual", "Much colder than usual"],
    forecast: "Forecast", recorded: "Recorded",
    noForecast: "No forecast yet", normalHigh: (low) => `Normal high for this date · low ${low}`,
    high: "High", low: "Low", usually: (v) => `usually ${v}`,
    rain: "Rain", wind: "Wind", dry: "Dry", wetter: "Wetter", normalWord: "Normal", windier: "Windier", calmer: "Calmer",
    every: (d) => `Every ${d}`, last10: "last 10 years", normalSince: `normal since ${BASELINE_START}`,
    rainWind: "Rain & wind", since: (y) => `Since ${y}`, sameDay: "same day", todayLower: "today",
    compare: "(1980s → last 10 years)", compareHigh: "High", compareLow: "Low",
    heatTitle: (t, m) => `Days above ${t}° · ${m}`, soFar: "so far",
    usualHeat: (n) => (n === 0 ? "usually none by now" : `usually just ${n} by now`),
    above: (t) => `above ${t}°`, not: "not", toCome: "still to come",
    avgFortnight: "avg this<br>fortnight", eachBar: "Each bar: that day vs its normal · today outlined",
    last7: "← last 7 days", next7: "next 7 days →", todayCaps: "Today",
    loading: `Loading every year since ${BASELINE_START}…`,
    error: "Couldn't load the data.", retry: "Try again", noData: "No historical data for this date.",
    search: "Search for a city", close: "Close", noResults: "No results",
    footer: `Normal = the average for that date since ${BASELINE_START}.`, privacy: "Privacy",
    title: "Is today unusual?",
    month: {
      soFar: (m) => `${m} so far`, closed: (m) => `${m}, complete`, range: (a, b, m) => `${a}–${b} ${m} · since ${BASELINE_START}`,
      temperature: "Temperature", rain: "Rain",
      verdicts: ["Much hotter than usual", "Hotter than usual", "About normal", "Cooler than usual", "Much colder than usual"],
      wetter: "Wetter than usual", drier: "Drier than usual", normal: "About normal",
      avgHigh: (a, n) => `average high ${a} · normal ${n}`,
      rank: { warm: (o, n) => (o ? `${o} warmest of ${n}` : `The warmest of ${n}`), cool: (o, n) => (o ? `${o} coolest of ${n}` : `The coolest of ${n}`),
              wet: (o, n) => (o ? `${o} wettest of ${n}` : `The wettest of ${n}`), dry: (o, n) => (o ? `${o} driest of ${n}` : `The driest of ${n}`) },
      ordinal: (n) => n + ({ one: "st", two: "nd", few: "rd" }[new Intl.PluralRules("en", { type: "ordinal" }).select(n)] ?? "th"),
      eachDay: "Each day vs its normal", today: "today",
      byNow: (v) => `normal ${v} by now`, normalMonth: (v) => `normal ${v}`,
      usual: "usual (half of all years)", wholeMonth: (v) => `normal (whole month: ${v})`,
      rainyDays: "Rainy days", usually: (n) => `usually ${n}`, wettest: "Wettest day", noRain: "no rain yet",
    },
    year: {
      soFar: (y) => `${y} so far`, lowHigh: "average low to high", rainMonth: "rain in the month",
      hottest: "Hottest day", coldest: "Coldest night", hotDays: (n) => `Days of ${n}° or more`,
      nights: (n) => `Nights of ${n}° or more`, tropical: "tropical nights", rain: "Rain", onDays: (n) => `on ${n} days`,
      dry: "Longest dry spell", days: (n) => `${n} days`,
    },
    lowsChange: "Lows, 1980s → last 10 years", highsChange: "Highs, 1980s → last 10 years",
    push: {
      title: "Daily heads-up",
      pitch: (c) => `Get how the day compares with normal in ${c}, every morning at 8:00.`,
      enable: "Turn on daily heads-up", disable: "Turn off", copy: "Copy code", copied: "Copied",
      on: (c) => `Daily heads-up on for ${c}.`,
      when: "It arrives every morning at 8:00 (Madrid time). Change city or language here and the heads-up follows.",
      sendCode: "To join the beta, send this code to whoever invited you. If you change city or language, send it again.",
      ios: "On iPhone, notifications only work with the web installed: tap Share, then “Add to Home Screen”. Open TempCheck from that icon and turn it on here.",
      unsupported: "This browser doesn't support notifications.",
      denied: "Notifications are blocked for this site. Allow them in your browser settings and come back.",
      failed: "Couldn't turn it on. Try again.",
    },
  },
};

// ---------- State (mirrored in the URL) ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function initialState() {
  const p = new URLSearchParams(location.search);
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  const fromUrl = p.get("lat") && p.get("lon") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { name: (p.get("c") || "—").slice(0, 60), lat, lon } : null;
  const lang = ["es", "en"].includes(p.get("l")) ? p.get("l")
    : store.get("cc_lang") ?? (navigator.language?.toLowerCase().startsWith("es") ? "es" : "en");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.get("d") ?? "") ? p.get("d") : null;
  return {
    lang,
    loc: fromUrl ?? store.get("cc_loc") ?? DEFAULT_LOC,
    tab: p.get("t") === "week" ? "week" : "today",
    date,               // null = the location's today
    forecast: null,
    token: 0,
  };
}
const state = initialState();
const t = () => T[state.lang];
const selectedDate = () => state.date ?? state.forecast?.today;
const isToday = () => !state.date || state.date === state.forecast?.today;

function syncUrl() {
  const p = new URLSearchParams({ c: state.loc.name, lat: state.loc.lat, lon: state.loc.lon, l: state.lang });
  if (state.date && state.date !== state.forecast?.today) p.set("d", state.date);
  if (state.tab === "week") p.set("t", "week");
  history.replaceState(null, "", `?${p}`);
}

// ---------- Analytics (GoatCounter: no cookies, no personal data) ----------
// Page views are counted by hand with clean paths (/today, /week, /day) and the city as the
// title, so the stats group by screen instead of by every lat/lon/date combination.
// Visits from the daily message carry ?src=wa (WhatsApp) or ?src=push (Web Push).
const arrivedFrom = { wa: "whatsapp", push: "push" }[new URLSearchParams(location.search).get("src")] ?? null;
const trackQueue = [];
let lastView = "";

function track(hit) {
  if (!GOATCOUNTER_CODE) return;
  if (window.goatcounter?.count) window.goatcounter.count(hit);
  else trackQueue.push(hit);
}
const trackEvent = (name, title = "") => track({ path: name, title, event: true });

function trackView() {
  const path = state.tab === "week" ? "/week" : isToday() ? "/today" : "/day";
  const key = `${path}|${state.loc.name}|${selectedDate()}`;
  if (key === lastView) return;
  const first = !lastView;
  lastView = key;
  track({ path, title: state.loc.name, ...(first && arrivedFrom ? { referrer: arrivedFrom } : {}) });
}

if (GOATCOUNTER_CODE) {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  s.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
  s.onload = () => { while (trackQueue.length) window.goatcounter?.count?.(trackQueue.shift()); };
  document.head.append(s);
}
if (arrivedFrom) trackEvent(`from-${arrivedFrom}`);

// ---------- Daily push (Web Push) ----------
// Turning it on registers the browser's push subscription (plus city and language) with our
// Cloudflare Worker (push-worker/), which the daily GitHub Actions job reads to send. While
// PUSH_API is empty the card falls back to the beta flow: it shows the subscription as a code
// to paste into the WEBPUSH_SUBSCRIPTIONS secret, and only with ?beta=1 or when installed.
const PUSH_API = "https://tempcheck-push.tempcheck-app.workers.dev";
const VAPID_PUBLIC_KEY = "BHiR-87Dl6hNut9NoRG3kGIMYag3bgfg3fr3GyTShZEVTigWuCoTGbCtWc3veeUj3ETap09yhJTCuOWP5hqKN-Q";
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (new URLSearchParams(location.search).get("beta") === "1") store.set("cc_beta", true);
const showPush = () => Boolean(PUSH_API) || store.get("cc_beta") === true || isInstalled;
const pushRecord = (sub) => ({ sub: sub.toJSON(), city: state.loc.name, lat: state.loc.lat, lon: state.loc.lon, lang: state.lang });

async function pushApi(path, body) {
  const res = await fetch(PUSH_API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`push api ${res.status}`);
}

// Keeps the server's copy in step with the city and language on screen (once per change).
async function syncPush(sub) {
  const key = `${sub.endpoint}|${state.loc.lat},${state.loc.lon}|${state.lang}`;
  if (!PUSH_API || store.get("cc_push_synced") === key) return;
  try { await pushApi("/subscribe", pushRecord(sub)); store.set("cc_push_synced", key); } catch { /* retried on next render */ }
}

const swReady = pushSupported ? navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).catch(() => null) : Promise.resolve(null);

function vapidKey() {
  const b64 = VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}
const pushCode = (sub) => JSON.stringify(pushRecord(sub));

async function renderPush(message = "") {
  const card = $("pushCard");
  if (!showPush()) { card.hidden = true; return; }
  card.hidden = false;
  const p = t().push;
  const city = esc(state.loc.name);
  const head = `<h2>🔔 ${esc(p.title)}</h2>`;
  const note = message ? `<p style="color:var(--much-hotter)">${esc(message)}</p>` : "";

  if (isIOS && !isInstalled) { card.innerHTML = head + `<p>${esc(p.ios)}</p>`; return; }
  if (!pushSupported) { card.innerHTML = head + `<p>${esc(p.unsupported)}</p>`; return; }
  if (Notification.permission === "denied") { card.innerHTML = head + `<p>${esc(p.denied)}</p>`; return; }

  const reg = await swReady;
  const sub = await reg?.pushManager.getSubscription();
  if (sub && PUSH_API) {
    syncPush(sub);
    card.innerHTML = head + `<p>✅ ${p.on(city)}</p><p>${esc(p.when)}</p>
      <button type="button" class="btn secondary" id="pushOff">${esc(p.disable)}</button>`;
  } else if (sub) {
    card.innerHTML = head + `<p>✅ ${p.on(city)}</p><p>${esc(p.sendCode)}</p>
      <textarea readonly id="pushCode">${esc(pushCode(sub))}</textarea>
      <div class="row"><button type="button" class="btn" id="pushCopy">${esc(p.copy)}</button>
      <button type="button" class="btn secondary" id="pushOff">${esc(p.disable)}</button></div>`;
  } else {
    card.innerHTML = head + `<p>${p.pitch(city)}</p>${note}<button type="button" class="btn" id="pushOn">${esc(p.enable)}</button>`;
  }
}

document.getElementById("pushCard").addEventListener("click", async (e) => {
  const p = t().push;
  if (e.target.id === "pushOn") {
    try {
      if ((await Notification.requestPermission()) !== "granted") return renderPush();
      const reg = await swReady;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() });
      if (PUSH_API) {
        try { await pushApi("/subscribe", pushRecord(sub)); }
        catch (err) { await sub.unsubscribe(); throw err; } // don't look "on" if we can't deliver
        store.set("cc_push_synced", `${sub.endpoint}|${state.loc.lat},${state.loc.lon}|${state.lang}`);
      }
      trackEvent("push-subscribe", state.loc.name);
      renderPush();
    } catch (err) { console.error(err); renderPush(p.failed); }
  } else if (e.target.id === "pushCopy") {
    const code = $("pushCode").value;
    try { await navigator.clipboard.writeText(code); } catch { $("pushCode").select(); document.execCommand("copy"); }
    e.target.textContent = p.copied;
    setTimeout(() => { e.target.textContent = p.copy; }, 1500);
  } else if (e.target.id === "pushOff") {
    const sub = await (await swReady)?.pushManager.getSubscription();
    if (sub && PUSH_API) { try { await pushApi("/unsubscribe", { endpoint: sub.endpoint }); } catch { /* the daily job drops it once the browser reports it gone */ } }
    await sub?.unsubscribe();
    store.set("cc_push_synced", null);
    trackEvent("push-unsubscribe");
    renderPush();
  }
});

// ---------- Formatting ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const deg = (v) => `${Math.round(v)}°`;
const num1 = (v) => v.toLocaleString(state.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mm = (v) => `${num1(v)} mm`;
const kmh = (v) => `${Math.round(v)} km/h`;
function signed(delta) {
  const r = Math.round(delta);
  return r === 0 ? "±0°" : `${r > 0 ? "+" : "−"}${Math.abs(r)}°`;
}
const bucket = (d) => (d > 6 ? 0 : d > 2 ? 1 : d >= -2 ? 2 : d > -6 ? 3 : 4);
const moodColor = (d) => ["var(--much-hotter)", "var(--hotter)", "var(--normal)", "var(--cooler)", "var(--much-colder)"][bucket(d)];
const verdict = (d) => t().verdicts[bucket(d)];
const fmt = (date, opts) => new Intl.DateTimeFormat(state.lang, { timeZone: "UTC", ...opts }).format(new Date(date + "T00:00:00Z"));

// ---------- Header ----------
const $ = (id) => document.getElementById(id);

function renderHeader() {
  document.documentElement.lang = state.lang;
  document.title = `${state.loc.name} · ${APP_NAME}`;
  $("cityBtn").textContent = state.loc.name;
  $("cityBtn").setAttribute("aria-label", `${t().changeCity}: ${state.loc.name}`);
  const date = selectedDate();
  $("dateBtn").innerHTML = date && state.forecast
    ? esc(state.tab === "week"
        ? `${fmt(addDays(state.forecast.today, -7), { day: "numeric", month: "short" })} – ${fmt(addDays(state.forecast.today, 6), { day: "numeric", month: "short" })}`
        : fmt(date, { weekday: "long", day: "numeric", month: "long", ...(yearOf(date) !== yearOf(state.forecast.today) ? { year: "numeric" } : {}) }))
    : "&nbsp;";
  $("dateBtn").disabled = state.tab === "week";
  $("dateBtn").classList.toggle("static", state.tab === "week");
  let back = document.querySelector(".back-today");
  if (!isToday() && state.tab === "today") {
    if (!back) {
      back = Object.assign(document.createElement("button"), { type: "button", className: "link back-today" });
      back.style.cssText = "font-size:14px;margin-top:4px";
      back.addEventListener("click", () => { state.date = null; syncUrl(); render(); });
      $("dateBtn").after(back);
    }
    back.textContent = `← ${t().backToToday}`;
  } else back?.remove();

  document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.textContent = t()[b.dataset.tab];
    b.setAttribute("aria-selected", String(b.dataset.tab === state.tab));
  });
  if (state.forecast) {
    $("dateInput").min = `${BASELINE_START + 1}-01-01`;
    $("dateInput").max = state.forecast.days.at(-1).date;
    $("dateInput").value = selectedDate();
  }
  $("foot").innerHTML = `${esc(t().footer)}<br>Datos · Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0) · <a href="../../">${esc(t().privacy)}</a>`;
  $("searchInput").placeholder = t().search;
  $("searchClose").textContent = t().close;
}

// ---------- Pieces ----------
const shimmer = (w, h, extra = "") => `<div class="shimmer" style="width:${w};height:${h}px;${extra}"></div>`;

function skeletonHero() {
  return `<section class="card hero">
    ${shimmer("170px", 15)}${shimmer("150px", 80, "margin-top:10px;border-radius:12px")}
    ${shimmer("100%", 13, "margin-top:14px")}${shimmer("60%", 13, "margin-top:8px")}
    ${shimmer("100%", 6, "margin-top:26px")}${shimmer("100%", 6, "margin-top:26px")}
    <p class="status">${esc(t().loading)}</p></section>`;
}
const skeletonCard = (rows = 5) => `<section class="card">${shimmer("40%", 12)}${
  Array.from({ length: rows }, (_, i) => shimmer("100%", 8, `margin-top:12px;opacity:${1 - i * 0.12}`)).join("")}</section>`;

function scale(label, value, normal) {
  const delta = value - normal;
  const pos = ((Math.min(Math.max(delta, -10), 10) + 10) / 20) * 100;
  const c = moodColor(delta);
  return `<div>
    <div class="scale-top"><span>${esc(label)} · <b>${deg(value)}</b> ${esc(t().usually(deg(normal)))}</span>
      <span class="delta" style="color:${c}">${signed(delta)}</span></div>
    <div class="track" aria-hidden="true"><div class="bar"></div><div class="mid"></div>
      <div class="knob" style="left:${pos}%;border-color:${c}"></div></div>
  </div>`;
}

function chip(title, headline, detail) {
  return `<div class="chip"><div class="t">${esc(title)}</div><div class="h">${esc(headline)}</div><div class="d">${esc(detail)}</div></div>`;
}

function heroCard(day) {
  const { stats, weather } = day;
  const today = isToday();
  if (!stats) return `<section class="card error">${esc(t().noData)}</section>`;

  if (!weather || weather.max == null) {
    return `<section class="card hero">
      <div class="verdict"><i style="background:var(--text-3)"></i>${esc(t().noForecast)}</div>
      <div class="hero-number">${deg(stats.avgMax)}</div>
      <p class="muted" style="font-size:14px;margin:8px 0 0">${esc(t().normalHigh(deg(stats.avgMin)))}</p>
    </section>`;
  }

  const delta = weather.max - stats.avgMax;
  const c = moodColor(delta);
  // The day's one-liner — the only joke on the page — for days with a forecast; recorded past
  // days get none, since "grab a jumper" makes no sense for last March.
  const sentence = today || weather.isForecast
    ? dayLine(state.lang, {
        delta, rainMM: weather.rain, daySwing: weather.min != null ? weather.max - weather.min : null,
        windKmh: weather.wind, uvIndex: weather.uv,
      }, state.loc.name, daysSinceEpoch(day.date))
    : null;

  const chips = [];
  if (weather.rain != null) {
    const word = weather.rain < 0.1 ? t().dry : weather.rain > Math.max(stats.avgRain * 1.5, 1) ? t().wetter : t().normalWord;
    const usual = t().usually(mm(stats.avgRain));
    chips.push(chip(t().rain, word, weather.rain >= 0.1 ? `${mm(weather.rain)} · ${usual}` : usual));
  }
  if (weather.wind != null && stats.avgWind > 0) {
    const d = weather.wind - stats.avgWind;
    const word = Math.abs(d) < 5 ? t().normalWord : d > 0 ? t().windier : t().calmer;
    chips.push(chip(t().wind, word, `${kmh(weather.wind)} · ${t().usually(kmh(stats.avgWind))}`));
  }

  return `<section class="card hero">
    ${today ? "" : `<div class="eyebrow">${esc(weather.isForecast ? t().forecast : t().recorded)}</div>`}
    <div class="verdict"><i style="background:${c}"></i>${esc(verdict(delta))}</div>
    <div class="hero-number" style="color:${c}">${signed(delta)}</div>
    ${sentence ? `<p class="sentence">${esc(sentence)}</p>` : ""}
    <div class="scales">
      ${scale(t().high, weather.max, stats.avgMax)}
      ${weather.min != null ? scale(t().low, weather.min, stats.avgMin) : ""}
    </div>
    ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
  </section>`;
}

// ---------- Month so far ----------
const signed1 = (delta) => {
  const r = Math.round(delta * 10) / 10;
  return r === 0 ? "±0°" : `${r > 0 ? "+" : "−"}${num1(Math.abs(r))}°`;
};
const note = (text) => (text ? `<p class="note">${esc(text)}</p>` : "");
const WET = "var(--wet)", DRY = "var(--dry)";

// "14th warmest of 47" / "The 3rd coolest of 47" — counted from whichever end is closer.
function rankText(rank, count, kind) {
  const m = t().month;
  const fromTop = rank <= (count + 1) / 2;
  const pos = fromTop ? rank : count - rank + 1;
  const f = m.rank[kind === "temp" ? (fromTop ? "warm" : "cool") : (fromTop ? "wet" : "dry")];
  return f(pos === 1 ? null : m.ordinal(pos), count);
}

function rainChart(mo) {
  const W = 320, H = 120, n = mo.daysInMonth;
  const top = Math.max(...mo.highCumulative, ...mo.cumulative, 1) * 1.12;
  const x = (day) => ((day - 1) / Math.max(n - 1, 1)) * W;
  const y = (v) => H - (v / top) * H;
  const band = mo.highCumulative.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`)
    .concat(mo.lowCumulative.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).reverse()).join(" ");
  const normal = mo.normalCumulative.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const steps = mo.cumulative.flatMap((v, i) => (i ? [`${x(i + 1).toFixed(1)},${y(mo.cumulative[i - 1]).toFixed(1)}`] : []).concat(`${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`)).join(" ");
  const last = mo.cumulative.at(-1) ?? 0, lx = x(mo.cumulative.length), ly = y(last);
  // A scale line every few mm (step picked so there are 2–4 lines) and, for the month in
  // progress, a dashed line at today.
  const step = [5, 10, 20, 25, 50, 100, 200].find((st) => top / st <= 4) ?? 500;
  const grid = [];
  for (let v = step; v < top; v += step) grid.push(v);
  const lines = grid.map((v) => `<span class="gl" style="top:${(y(v) / H) * 100}%"><em>${v} mm</em></span>`).join("");
  const at = (f) => `calc(var(--axis) + (100% - var(--axis)) * ${f.toFixed(4)})`;
  const today = mo.isClosed ? "" : `<span class="now" style="left:${at(lx / W)}"></span>`;
  const todayLabel = mo.isClosed ? "" : `<span class="mark" style="left:${at(lx / W)}">${esc(t().month.today)}</span>`;
  return `<div class="rain-chart" role="img" aria-label="${esc(t().month.usual)}">
    ${lines}${today}
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polygon points="${band}" fill="var(--normal)" fill-opacity="0.14"/>
      <polyline points="${normal}" fill="none" stroke="var(--normal-line)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
      <polyline points="${steps}" fill="none" stroke="${WET}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <span class="end-dot" style="left:${at(lx / W)};top:${(ly / H) * 100}%"></span>
    <span class="end-label" style="right:calc((100% - var(--axis)) * ${(1 - lx / W).toFixed(4)});top:${(ly / H) * 100}%">${Math.round(last)} mm</span>
  </div>
  <div class="strip-axis rain-axis"><span>1</span>${todayLabel}<span>${n}</span></div>
  <div class="legend"><span><i class="sw band"></i>${esc(t().month.usual)}</span>
    <span><i class="dash h"></i>${esc(t().month.wholeMonth(`${Math.round(mo.normalCumulative.at(-1) ?? 0)} mm`))}</span></div>`;
}

function monthCard(mo) {
  const m = t().month;
  const monthName = fmt(mo.monthStart, { month: "long" });
  const name = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const z = mo.deviations;
  const b = z > 2 ? 0 : z > 1 ? 1 : z >= -1 ? 2 : z > -2 ? 3 : 4;
  const tc = ["var(--much-hotter)", "var(--hotter)", "var(--normal)", "var(--cooler)", "var(--much-colder)"][b];
  const wet = mo.rain > mo.rainHigh && mo.rain >= 1, dry = mo.rain < mo.rainLow;
  const rc = wet ? WET : dry ? DRY : "var(--normal)";
  const strip = mo.dailyDelta.map((d) => `<i style="background:${d == null ? "var(--track)" : moodColor(d)}"></i>`).join("");
  const todayMark = !mo.isClosed && mo.dayCount > 2 && mo.dayCount < mo.daysInMonth - 1
    ? `<span class="mark" style="left:${((mo.dayCount - 0.5) / mo.daysInMonth) * 100}%">${esc(m.today)}</span>` : "";
  const big = mo.normalRain >= 1 ? `${Math.round((mo.rain / mo.normalRain) * 100)}${state.lang === "es" ? " %" : "%"}` : mm(mo.rain);
  const wettest = mo.wettestDay ? fmt(addDays(mo.monthStart, mo.wettestDay - 1), { day: "numeric", month: "short" }) : m.noRain;

  return `<section class="card month">
    <div class="card-head"><h2>${esc((mo.isClosed ? m.closed : m.soFar)(name))}</h2>
      <span>${esc(m.range(1, mo.dayCount, fmt(mo.monthStart, { month: "short" })))}</span></div>
    <div class="sec">${esc(m.temperature)}</div>
    <div class="verdict"><i style="background:${tc}"></i>${esc(m.verdicts[b])}</div>
    <div class="kpi"><span class="n" style="color:${tc}">${signed1(mo.delta)}</span>
      <span class="sub">${esc(m.avgHigh(`${num1(mo.meanMax)}°`, `${num1(mo.normalMeanMax)}°`))}<br>${esc(rankText(mo.warmRank, mo.yearCount, "temp"))}</span></div>
    <div class="lbl">${esc(m.eachDay)}</div>
    <div class="strip" aria-hidden="true">${strip}</div>
    <div class="strip-axis"><span>1</span>${todayMark}<span>${mo.daysInMonth}</span></div>
    ${note(monthNote(state.lang, mo))}
    <hr>
    <div class="sec">${esc(m.rain)}</div>
    <div class="verdict"><i style="background:${rc}"></i>${esc(wet ? m.wetter : dry ? m.drier : m.normal)}</div>
    <div class="kpi"><span class="n" style="color:${rc}">${esc(big)}</span>
      <span class="sub">${Math.round(mo.rain)} mm · ${esc((mo.isClosed ? m.normalMonth : m.byNow)(`${Math.round(mo.normalRain)} mm`))}<br>${esc(rankText(mo.wetRank, mo.yearCount, "rain"))}</span></div>
    ${rainChart(mo)}
    <div class="chips">${chip(m.rainyDays, String(mo.rainyDays), m.usually(Math.round(mo.normalRainyDays)))}${
      chip(m.wettest, mo.wettestDay ? mm(mo.wettestDayRain) : "—", wettest)}</div>
  </section>`;
}

// ---------- Year so far: climograph + records ----------
// Absolute temperature → colour (blue cold, red hot), only where real temperatures are drawn.
const STOPS = [[0, 47, 79, 168], [8, 59, 130, 245], [15, 141, 195, 217], [20, 226, 214, 160], [26, 232, 162, 62], [32, 217, 69, 59], [38, 142, 31, 31]];
function tempColor(v) {
  if (v <= STOPS[0][0]) return `rgb(${STOPS[0].slice(1)})`;
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, ...c1] = STOPS[i], [t0, ...c0] = STOPS[i - 1];
    if (v <= t1) { const f = (v - t0) / (t1 - t0); return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f))})`; }
  }
  return `rgb(${STOPS.at(-1).slice(1)})`;
}

function yearCard(yr) {
  const y = t().year;
  const lo = Math.min(...yr.months.map((m) => m.meanMin)) - 1, hi = Math.max(...yr.months.map((m) => m.meanMax)) + 1;
  const maxRain = Math.max(...yr.months.map((m) => m.rain), 1);
  const H = 124, inset = 15;
  const py = (v) => inset + ((hi - v) / Math.max(hi - lo, 1)) * (H - 2 * inset);
  const letters = Array.from({ length: 12 }, (_, i) => fmt(`2026-${String(i + 1).padStart(2, "0")}-15`, { month: "narrow" }));
  const cols = letters.map((letter, i) => {
    const mo = yr.months.find((x) => x.month === i + 1);
    if (!mo) return `<div class="col future"><div class="plot"><i class="cap" style="top:${H / 2 - 22}px;height:44px"></i></div><div class="rainbar"></div><span class="m">${esc(letter)}</span></div>`;
    const top = py(mo.meanMax), bottom = py(mo.meanMin);
    return `<div class="col"><div class="plot">
        <b style="top:${top - 16}px">${Math.round(mo.meanMax)}</b>
        <i class="cap" style="top:${top}px;height:${Math.max(bottom - top, 10)}px;background:${tempColor((mo.meanMax + mo.meanMin) / 2)}"></i>
        <small style="top:${bottom + 2}px">${Math.round(mo.meanMin)}</small></div>
      <div class="rainbar"><i style="height:${Math.max(1.5, (26 * mo.rain) / maxRain)}px"></i></div>
      <span class="m">${esc(letter)}</span></div>`;
  }).join("");
  // Scale every 10° and a line at today, so the bars can be read and past and future told apart.
  const grid = [];
  for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) grid.push(v);
  const lines = grid.map((v) => `<span class="gl" style="top:${py(v)}px"><em>${v}°</em></span>`).join("");
  const [, lm, ld] = yr.lastDay.split("-").map(Number);
  const share = (lm - 1 + (ld - 0.5) / new Date(Date.UTC(yr.year, lm, 0)).getUTCDate()) / 12;
  const now = `<span class="now" style="left:calc(var(--axis) + (100% - var(--axis)) * ${share.toFixed(4)})"><em>${esc(t().month.today)}</em></span>`;
  const d = (s) => (s ? fmt(s, { day: "numeric", month: "short" }) : "");
  const rows = [
    [y.hottest, `${num1(yr.hottestTemp)}°`, d(yr.hottestDay)],
    [y.coldest, `${num1(yr.coldestTemp).replace("-", "−")}°`, d(yr.coldestNight)],
    [y.hotDays(HEAT_THRESHOLD), String(yr.hotDays), yr.firstHotDay ? `${d(yr.firstHotDay)} – ${d(yr.lastHotDay)}` : ""],
    [y.nights(TROPICAL_NIGHT), String(yr.tropicalNights), y.tropical],
    [y.rain, `${Math.round(yr.rain)} mm`, y.onDays(yr.rainyDays)],
    [y.dry, y.days(yr.dryStreak?.days ?? 0), yr.dryStreak ? `${d(yr.dryStreak.start)} – ${d(yr.dryStreak.end)}` : ""],
  ].map(([a, b, c]) => `<div class="rec"><span>${esc(a)}</span><b>${esc(b)}</b><em>${esc(c)}</em></div>`).join("");
  return `<section class="card year">
    <div class="card-head"><h2>${esc(y.soFar(yr.year))}</h2><span>${esc(`${d(`${yr.year}-01-01`)} – ${d(yr.lastDay)}`)}</span></div>
    <div class="climo-wrap">${lines}${now}<div class="climo" role="img" aria-label="${esc(y.lowHigh)}">${cols}</div></div>
    <div class="legend"><span><i class="sw cap-sw"></i>${esc(y.lowHigh)}</span><span><i class="sw" style="background:${WET};border-radius:2px"></i>${esc(y.rainMonth)}</span></div>
    <div class="recs">${rows}</div>
  </section>`;
}

function rangesCard(day) {
  const { yearly, stats } = day;
  const temps = yearly.flatMap((y) => [y.min, y.max]).filter((v) => v != null).concat(stats ? [stats.avgMin, stats.avgMax] : []);
  const lo = Math.min(...temps) - 2, hi = Math.max(...temps) + 2;
  const pct = (v) => ((v - lo) / Math.max(hi - lo, 1)) * 100;
  const norms = stats ? [stats.avgMin, stats.avgMax].map((v) => `<span class="norm" style="left:${pct(v)}%"></span>`).join("") : "";

  const rows = yearly.map((y) => {
    let color = "var(--track)";
    if (stats && y.max != null) color = y.isCurrent ? moodColor(y.max - stats.avgMax) : y.max >= stats.avgMax ? "var(--past-hot)" : "var(--past-cool)";
    const bar = y.min != null && y.max != null
      ? `<span class="rb" style="left:${pct(y.min)}%;width:${pct(y.max) - pct(y.min)}%;background:${color}"></span>` : "";
    const label = y.isCurrent && isToday() ? t().todayCaps : y.year;
    return `<div class="range-row${y.isCurrent ? " current" : ""}"><span class="y">${esc(label)}</span>
      <span class="lane">${norms}${bar}</span>
      <span class="v">${y.min != null ? Math.round(y.min) + "–" + deg(y.max) : "—"}</span></div>`;
  }).join("");

  return `<section class="card">
    <div class="card-head"><h2>${esc(t().every(fmt(day.date, { day: "numeric", month: "short" })))}</h2><span>${esc(t().last10)}</span></div>
    <div class="ranges">${rows}</div>
    ${stats ? `<div class="legend"><span><i class="dash"></i>${esc(t().normalSince)}</span></div>` : ""}
    ${note(dateHistoryNote(state.lang, yearly.find((y) => y.isCurrent), yearly.filter((y) => !y.isCurrent), day.longTerm, stats?.avgMin))}
  </section>`;
}

function miniColumns(title, rows, field, normal, color, minScale) {
  const vals = rows.map((r) => r[field] ?? 0);
  const top = Math.max(...vals, normal ?? 0, minScale) * 1.1;
  const cols = rows.map((r, i) => {
    const v = vals[i];
    const h = v > 0 ? Math.max(2, (v / top) * 60) : 0;
    return `<i style="height:${h}px;background:${color};opacity:${r.isCurrent ? 1 : 0.5}"></i>`;
  }).join("");
  const norm = normal != null ? `<span class="norm" style="bottom:${(normal / top) * 60}px"></span>` : "";
  return `<div class="mini"><div class="t">${esc(title)}</div><div class="cols">${cols}${norm}</div></div>`;
}

function rainWindCard(day) {
  const { yearly, stats } = day;
  return `<section class="card">
    <div class="card-head"><h2>${esc(t().rainWind)}</h2><span>${esc(t().last10)}</span></div>
    <div class="minis">
      ${miniColumns(t().rain, yearly, "rain", stats?.avgRain, "var(--cooler)", 2)}
      ${miniColumns(t().wind, yearly, "wind", stats?.avgWind, "#30b0c7", 10)}
    </div>
    <div class="ends"><span>${yearly[0]?.year ?? ""}</span><span>${esc(isToday() ? t().todayCaps : yearly.at(-1)?.year ?? "")}</span></div>
    ${note(rainWindNote(state.lang, yearly.find((y) => y.isCurrent), yearly.filter((y) => !y.isCurrent), stats?.avgWind, mm))}
  </section>`;
}

function longTermCard(day) {
  const years = day.longTerm.filter((y) => y.year < yearOf(day.date));
  if (years.length < 5) return "";
  const current = day.yearly.find((y) => y.isCurrent);
  const first = years[0].year;
  const last = Math.max(years.at(-1).year, current?.year ?? 0);
  const all = years.flatMap((y) => [y.max, y.min]).concat(current ? [current.max, current.min] : []).filter((v) => v != null);
  const lo = Math.min(...all) - 1, hi = Math.max(...all) + 1;
  const W = 300, H = 96;
  const x = (yr) => ((yr - first) / Math.max(last - first, 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const line = (f) => years.filter((r) => r[f] != null).map((r) => `${x(r.year).toFixed(1)},${y(r[f]).toFixed(1)}`).join(" ");
  const dot = (v, color) => v == null ? "" :
    `<span style="position:absolute;left:${(x(current.year) / W) * 100}%;top:${(y(v) / H) * 100}%;width:9px;height:9px;margin:-4.5px;border-radius:50%;background:${color}"></span>`;

  const avgIn = (f, from, to) => {
    const v = years.filter((r) => r.year >= from && r.year <= to && r[f] != null).map((r) => r[f]);
    return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const lastYear = years.at(-1).year;
  const hiFrom = avgIn("max", 1980, 1989), hiTo = avgIn("max", lastYear - 9, lastYear);
  const loFrom = avgIn("min", 1980, 1989), loTo = avgIn("min", lastYear - 9, lastYear);
  const ok = hiFrom != null && hiTo != null && loFrom != null && loTo != null;
  const compare = ok
    ? `<div class="chips" style="margin:0 0 10px">${chip(t().lowsChange, signed1(loTo - loFrom), `${num1(loFrom)}° → ${num1(loTo)}°`)}${
        chip(t().highsChange, signed1(hiTo - hiFrom), `${num1(hiFrom)}° → ${num1(hiTo)}°`)}</div>` : "";

  return `<section class="card longterm">
    <div class="card-head"><h2>${esc(t().since(BASELINE_START))}</h2><span>${esc(t().sameDay)}</span></div>
    ${compare}
    <div style="position:relative">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="${line("max")}" fill="none" stroke="var(--much-hotter)" stroke-opacity="0.85" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        <polyline points="${line("min")}" fill="none" stroke="var(--cooler)" stroke-opacity="0.85" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      </svg>
      ${current ? dot(current.max, "var(--much-hotter)") + dot(current.min, "var(--cooler)") : ""}
    </div>
    <div class="ends"><span>${first}</span><span>${esc(isToday() ? t().todayLower : String(current?.year ?? last))}</span></div>
    ${ok ? note(longTermNote(state.lang, hiTo - hiFrom, loTo - loFrom)) : ""}
  </section>`;
}

// ---------- Week ----------
function weekHero(week) {
  const d = week.avgDelta;
  const c = moodColor(d);
  const today = state.forecast.today;
  const biggest = Math.max(...week.days.map((x) => Math.abs(x.delta ?? 0)), 4);
  const slots = week.days.map((x) => {
    const v = x.delta ?? 0;
    const h = Math.max((Math.abs(v) / biggest) * 50, 1.5);
    const pos = v >= 0 ? `bottom:50%;height:${h}%` : `top:50%;height:${h}%`;
    return `<div class="slot${x.date === today ? " today" : ""}"><i style="${pos};background:${moodColor(v)};opacity:${x.date < today ? 0.45 : 1}"></i></div>`;
  }).join("");
  const initials = week.days.map((x) =>
    `<span class="${x.date === today ? "today" : ""}">${esc(fmt(x.date, { weekday: "narrow" }))}</span>`).join("");
  const line = weekNote(state.lang,
    week.days.filter((x) => x.date < today).map((x) => ({ day: Number(x.date.slice(8)), delta: x.delta })),
    week.days.filter((x) => x.date >= today).map((x) => ({ delta: x.delta, rain: x.rain })));

  return `<section class="card hero">
    <div class="verdict"><i style="background:${c}"></i>${esc(verdict(d))}</div>
    <div class="hero-row"><div class="hero-number" style="color:${c}">${signed(d)}</div><div class="aside">${t().avgFortnight}</div></div>
    <div class="anomaly" role="img" aria-label="${esc(t().eachBar)}">
      <div class="bars">${slots}</div>
      <div class="initials">${initials}</div>
      <div class="ends"><span>${esc(t().last7)}</span><span>${esc(t().next7)}</span></div>
    </div>
    <p class="small muted" style="margin:6px 0 0">${esc(t().eachBar)}</p>
    ${note(line)}
  </section>`;
}

function weekList(week) {
  const today = state.forecast.today;
  const upcoming = week.days.filter((x) => x.date >= today);
  const deltas = upcoming.map((x) => x.delta).filter((v) => v != null);
  const warmest = Math.max(...deltas), coolest = Math.min(...deltas);
  const rows = upcoming.map((x) => {
    const line = weekDayNote(state.lang, {
      rain: x.rain, delta: x.delta, min: x.min,
      nightDelta: x.min != null && x.normalMin != null ? x.min - x.normalMin : null,
      isWarmest: x.delta != null && x.delta === warmest, isCoolest: x.delta != null && x.delta === coolest,
    }, mm) ?? "";
    return `<button type="button" class="day-row" data-date="${x.date}">
      <span class="when"><small class="${x.date === today ? "is-today" : ""}">${esc(x.date === today ? t().todayCaps : fmt(x.date, { weekday: "short" }))}</small>
        <b>${Number(x.date.slice(8))}</b></span>
      <span class="dd" style="color:${x.delta != null ? moodColor(x.delta) : "var(--text-2)"}">${x.delta != null ? signed(x.delta) : "—"}</span>
      <span class="txt"><p>${x.max != null ? deg(x.max) : "—"} / ${x.min != null ? deg(x.min) : "—"}</p>${line ? `<span>${esc(line)}</span>` : ""}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`;
  }).join("");
  return `<section class="card day-list">${rows}</section>`;
}

// ---------- Loading + rendering ----------
const main = $("main");
const errorCard = () => `<section class="card error">${esc(t().error)}<br><button type="button" id="retry">${esc(t().retry)}</button></section>`;
const memo = { day: new Map(), week: null, month: undefined, year: undefined };

async function ensureForecast(token) {
  if (state.forecast) return true;
  state.forecast = await fetchForecast(state.loc);
  return token === state.token;
}

async function render() {
  const token = ++state.token;
  renderHeader();
  renderPush();
  main.innerHTML = state.tab === "today"
    ? skeletonHero() + skeletonCard(6) + skeletonCard(3)
    : skeletonHero() + skeletonCard(7);
  try {
    if (!(await ensureForecast(token))) return;
    renderHeader();
    trackView();
    if (state.tab === "today") await renderDay(token);
    else await renderWeek(token);
  } catch (e) {
    console.error(e);
    if (token === state.token) main.innerHTML = errorCard();
  }
}

async function renderDay(token) {
  const date = selectedDate();
  let day = memo.day.get(date);
  if (!day) {
    day = await loadDay(state.loc, date, state.forecast);
    if (day.failed) throw new Error("archive unavailable");
    memo.day.set(date, day);
  }
  if (token !== state.token) return;
  const draw = () => {
    main.innerHTML = heroCard(day)
      + (isToday() && memo.month ? monthCard(memo.month) : "")
      + (isToday() && memo.year ? yearCard(memo.year) : "")
      + (day.yearly.length ? rangesCard(day) + rainWindCard(day) : "")
      + longTermCard(day);
  };
  draw();
  // Month and year are today-only and load after the main content.
  if (isToday() && (memo.month === undefined || memo.year === undefined)) {
    const [month, year] = await Promise.all([
      memo.month === undefined ? loadMonth(state.loc, state.forecast).catch(() => null) : memo.month,
      memo.year === undefined ? loadYear(state.loc, state.forecast).catch(() => null) : memo.year,
    ]);
    memo.month = month; memo.year = year;
    if (token === state.token && (month || year)) draw();
  }
}

async function renderWeek(token) {
  memo.week ??= await loadWeek(state.loc, state.forecast);
  if (token !== state.token) return;
  if (!memo.week || memo.week.avgDelta == null) { main.innerHTML = errorCard(); return; }
  main.innerHTML = weekHero(memo.week) + weekList(memo.week);
}

function setLocation(loc) {
  state.loc = loc;
  state.date = null;
  state.forecast = null;
  memo.day.clear(); memo.week = null; memo.month = undefined; memo.year = undefined;
  store.set("cc_loc", loc);
  trackEvent("city-change", loc.name);
  syncUrl();
  render();
}

// ---------- Events ----------
main.addEventListener("click", (e) => {
  if (e.target.closest("#retry")) { state.forecast = null; render(); return; }
  const row = e.target.closest(".day-row");
  if (row) {
    trackEvent("week-day-tap");
    state.tab = "today";
    state.date = row.dataset.date === state.forecast.today ? null : row.dataset.date;
    syncUrl(); render(); scrollTo({ top: 0, behavior: "smooth" });
  }
});

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  if (state.tab === b.dataset.tab) return;
  state.tab = b.dataset.tab;
  trackEvent(`tab-${state.tab}`);
  syncUrl(); render();
}));

document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => {
  if (state.lang === b.dataset.lang) return;
  state.lang = b.dataset.lang;
  trackEvent(`lang-${state.lang}`);
  store.set("cc_lang", state.lang);
  syncUrl(); render();
}));

$("dateBtn").addEventListener("click", () => {
  const input = $("dateInput");
  try { input.showPicker(); } catch { input.focus(); input.click(); }
});
$("dateInput").addEventListener("change", (e) => {
  const v = e.target.value;
  if (!v || !state.forecast) return;
  state.date = v === state.forecast.today ? null : v;
  trackEvent("date-pick");
  syncUrl(); render();
});

// City search (Open-Meteo geocoding), debounced.
const dialog = $("search");
let searchTimer;
$("cityBtn").addEventListener("click", () => {
  $("searchInput").value = "";
  $("searchResults").innerHTML = "";
  dialog.showModal();
  $("searchInput").focus();
});
$("searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value;
  searchTimer = setTimeout(async () => {
    let results = [];
    try { results = await searchCities(q, state.lang); } catch { /* keep empty */ }
    if (q !== $("searchInput").value) return;
    $("searchResults").innerHTML = results.length
      ? results.map((r, i) => `<li><button type="button" data-i="${i}">${esc(r.name)}<small>${esc([r.admin, r.country].filter(Boolean).join(", "))}</small></button></li>`).join("")
      : q.trim() ? `<li class="muted" style="padding:12px 6px">${esc(t().noResults)}</li>` : "";
    $("searchResults").onclick = (ev) => {
      const btn = ev.target.closest("button[data-i]");
      if (!btn) return;
      const r = results[Number(btn.dataset.i)];
      dialog.close();
      setLocation({ name: r.name, lat: r.lat, lon: r.lon });
    };
  }, 250);
});
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

syncUrl();
render();
