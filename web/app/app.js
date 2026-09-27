// TempCheck web — "Is today unusual?" The same screens as the iOS app (Today and This week),
// rendered from plain template strings. State lives in the URL so the WhatsApp link can open
// any city, date and language directly: ?c=Madrid&lat=40.4168&lon=-3.7038&d=2026-09-25&l=es

import {
  BASELINE_START, HEAT_THRESHOLD, fetchForecast, searchCities, loadDay, loadWeek, loadHeat,
  trendDelta, monthDay, daysSinceEpoch, yearOf, addDays,
} from "./climate.js";
import { dayLine, weekLine, trendLine } from "./phrases.js";

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
// Visits that arrive from the daily WhatsApp link carry ?src=wa and are counted as such.
const cameFromWhatsApp = new URLSearchParams(location.search).get("src") === "wa";
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
  track({ path, title: state.loc.name, ...(first && cameFromWhatsApp ? { referrer: "whatsapp" } : {}) });
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
if (cameFromWhatsApp) trackEvent("from-whatsapp");

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
  const { stats, weather, yearly } = day;
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
  // Forecast days get the day's one-liner (same as the week list); recorded past days get the
  // 10-year trend for that date, since "grab a jumper" makes no sense for last March.
  const sentence = today || weather.isForecast
    ? dayLine(state.lang, {
        delta, rainMM: weather.rain, daySwing: weather.min != null ? weather.max - weather.min : null,
        windKmh: weather.wind, uvIndex: weather.uv,
      }, state.loc.name, daysSinceEpoch(day.date))
    : (() => { const d = trendDelta(yearly); return d == null ? null : trendLine(state.lang, d, `${state.loc.name}-${monthDay(day.date)}`); })();

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

function heatCard(heat) {
  const usual = Math.round(heat.usual);
  const todayIdx = heat.dots.findLastIndex((d) => d !== null);
  const month = fmt(state.forecast.today, { month: "long" });
  const dots = heat.dots.map((d, i) =>
    `<i class="${d === true ? "hot" : d === false ? "off" : "future"}${i === todayIdx ? " today" : ""}"></i>`).join("");
  return `<section class="card">
    <div class="card-head"><h2>🔥 ${esc(t().heatTitle(HEAT_THRESHOLD, month))}</h2></div>
    <div class="heat-row"><span class="n">${heat.count}</span>
      <span class="l">${esc(t().soFar)}<br><span class="muted">${esc(t().usualHeat(usual))}</span></span></div>
    <div class="dots" aria-hidden="true">${dots}</div>
    <div class="legend">
      <span><i class="sw" style="background:var(--much-hotter)"></i>${esc(t().above(HEAT_THRESHOLD))}</span>
      <span><i class="sw" style="background:var(--dot-off)"></i>${esc(t().not)}</span>
      <span><i class="sw" style="border:1px dashed var(--text-3)"></i>${esc(t().toCome)}</span>
    </div>
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
  const compare = hiFrom != null && hiTo != null && loFrom != null && loTo != null
    ? `<p class="compare"><span style="color:var(--much-hotter)">${esc(t().compareHigh)}</span> ${num1(hiFrom)}° → ${num1(hiTo)}° ·
       <span style="color:var(--cooler)">${esc(t().compareLow)}</span> ${num1(loFrom)}° → ${num1(loTo)}°
       <span class="muted">${esc(t().compare)}</span></p>` : "";

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
  const line = weekLine(state.lang, d, week.anyRain, week.anyBigSwing, `${state.loc.name}-${today}`);

  return `<section class="card hero">
    <div class="verdict"><i style="background:${c}"></i>${esc(verdict(d))}</div>
    <div class="hero-row"><div class="hero-number" style="color:${c}">${signed(d)}</div><div class="aside">${t().avgFortnight}</div></div>
    <p class="sentence">${esc(line)}</p>
    <div class="anomaly" role="img" aria-label="${esc(t().eachBar)}">
      <div class="bars">${slots}</div>
      <div class="initials">${initials}</div>
      <div class="ends"><span>${esc(t().last7)}</span><span>${esc(t().next7)}</span></div>
    </div>
    <p class="small muted" style="margin:6px 0 0">${esc(t().eachBar)}</p>
  </section>`;
}

function weekList(week) {
  const today = state.forecast.today;
  const rows = week.days.filter((x) => x.date >= today).map((x) => {
    const line = x.max != null && x.normalMax != null ? dayLine(state.lang, {
      delta: x.delta, rainMM: x.rain, daySwing: x.min != null ? x.max - x.min : null, windKmh: x.wind, uvIndex: x.uv,
    }, state.loc.name, daysSinceEpoch(x.date)) : "";
    const details = [`${x.max != null ? deg(x.max) : "—"} / ${x.min != null ? deg(x.min) : "—"}`];
    if ((x.rain ?? 0) >= 0.1) details.push(`💧 ${mm(x.rain)}`);
    return `<button type="button" class="day-row" data-date="${x.date}">
      <span class="when"><small class="${x.date === today ? "is-today" : ""}">${esc(x.date === today ? t().todayCaps : fmt(x.date, { weekday: "short" }))}</small>
        <b>${Number(x.date.slice(8))}</b></span>
      <span class="dd" style="color:${x.delta != null ? moodColor(x.delta) : "var(--text-2)"}">${x.delta != null ? signed(x.delta) : "—"}</span>
      <span class="txt"><p>${esc(line)}</p><span>${esc(details.join(" · "))}</span></span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`;
  }).join("");
  return `<section class="card day-list">${rows}</section>`;
}

// ---------- Loading + rendering ----------
const main = $("main");
const errorCard = () => `<section class="card error">${esc(t().error)}<br><button type="button" id="retry">${esc(t().retry)}</button></section>`;
const memo = { day: new Map(), week: null, heat: null };

async function ensureForecast(token) {
  if (state.forecast) return true;
  state.forecast = await fetchForecast(state.loc);
  return token === state.token;
}

async function render() {
  const token = ++state.token;
  renderHeader();
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
      + (isToday() && memo.heat?.isUnusual ? heatCard(memo.heat) : "")
      + (day.yearly.length ? rangesCard(day) + rainWindCard(day) : "")
      + longTermCard(day);
  };
  draw();
  // The heat streak is today-only and loads after the main content (a month of every year).
  if (isToday() && !memo.heat) {
    try { memo.heat = await loadHeat(state.loc, state.forecast); } catch { return; }
    if (token === state.token && memo.heat.isUnusual) draw();
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
  memo.day.clear(); memo.week = null; memo.heat = null;
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
