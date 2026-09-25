// Data layer: Open-Meteo fetches, the per-date archive cache and the "normal" maths — the same
// rules as WeatherViewModel.swift. Plain ES module with no DOM use, so the WhatsApp sender can
// import it too (localStorage is optional; without it everything is simply fetched).

export const BASELINE_START = 1980;
export const HEAT_THRESHOLD = 35;

const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,uv_index_max";
const CACHE_VERSION = 3;
const DAY_MS = 86_400_000;

// ---------- Date strings ("YYYY-MM-DD", always treated as UTC midnights) ----------
export const toDate = (s) => new Date(s + "T00:00:00Z");
export const toStr = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => toStr(new Date(toDate(s).getTime() + n * DAY_MS));
export const yearOf = (s) => Number(s.slice(0, 4));
export const monthDay = (s) => s.slice(5);
export const daysSinceEpoch = (s) => Math.floor(toDate(s).getTime() / DAY_MS);

// Same year shift as Calendar.date(byAdding: .year): 29 Feb lands on 28 Feb in common years.
function shiftYears(s, k) {
  const y = yearOf(s) - k;
  let md = monthDay(s);
  if (md === "02-29" && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) md = "02-28";
  return `${y}-${md}`;
}

// ---------- Storage (optional) ----------
const store = {
  get(key) {
    try { const v = globalThis.localStorage?.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* full or blocked */ }
  },
};
const coordKey = (loc) => `${loc.lat.toFixed(4)}_${loc.lon.toFixed(4)}`;

// ---------- Fetching ----------
async function getJSON(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    throw new Error(`HTTP ${res.status}`);
  }
}

function parseDaily(json, today) {
  const d = json.daily;
  return d.time.map((date, i) => ({
    date,
    max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i], wind: d.wind_speed_10m_max[i], uv: d.uv_index_max?.[i] ?? null,
    isForecast: today ? date >= today : false,
  }));
}

// Last 7 recorded days + the next 7, in the location's own time zone. `today` is the
// location's date, not the browser's — Madrid's today, even when viewed from New York.
export async function fetchForecast(loc) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
              `&daily=${DAILY}&timezone=auto&past_days=7&forecast_days=7`;
  const json = await getJSON(url);
  const today = toStr(new Date(Date.now() + json.utc_offset_seconds * 1000));
  return { today, days: parseDaily(json, today) };
}

export async function searchCities(query, lang) {
  if (!query.trim()) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=${lang}&format=json`;
  const json = await getJSON(url);
  return (json.results ?? []).map((r) => ({
    name: r.name, country: r.country ?? "", admin: r.admin1 ?? "",
    lat: Math.round(r.latitude * 1e4) / 1e4, lon: Math.round(r.longitude * 1e4) / 1e4,
  }));
}

// Open-Meteo bills any archive request spanning more than 2 weeks as several calls, so each
// year gets its own short window. 4 in flight: the archive answers 429 to bigger bursts.
async function fetchArchiveWindows(loc, first, last, yearsBack, safeEnd) {
  const windows = yearsBack.map((k) => {
    const start = shiftYears(first, k);
    const end = shiftYears(last, k) < safeEnd ? shiftYears(last, k) : safeEnd;
    return start <= end ? { start, end } : null;
  }).filter(Boolean);
  if (!windows.length) return [];

  const results = [];
  let next = 0;
  async function worker() {
    while (next < windows.length) {
      const w = windows[next++];
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lon}` +
                  `&start_date=${w.start}&end_date=${w.end}&daily=${DAILY}&timezone=auto`;
      try { results.push(parseDaily(await getJSON(url))); } catch { results.push(null); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, windows.length) }, worker));
  const ok = results.filter(Boolean);
  return ok.length ? ok.flat() : null;
}

// Every past year of each date's month-day, keyed by "MM-DD". Covers `yearsBack` years before
// each date's own year, plus the date itself once it's safely in the archive. Cache first;
// only missing years are fetched. Historical data never changes, so entries never expire.
export async function historicalYears(loc, dates, yearsBack, today) {
  const safeEnd = addDays(today, -7);
  const byKey = {};
  const missingOffsets = new Set();
  const missingDates = [];

  for (const date of dates) {
    const key = monthDay(date);
    const cached = store.get(`cc_archive_v${CACHE_VERSION}_${coordKey(loc)}_${key}`) ?? [];
    byKey[key] = Object.fromEntries(cached.map((y) => [y.year, y]));
    const year = yearOf(date);
    const firstOffset = date <= safeEnd ? 0 : 1;
    for (let k = firstOffset; k <= yearsBack; k++) {
      if (!byKey[key][year - k]) { missingOffsets.add(k); if (!missingDates.includes(date)) missingDates.push(date); }
    }
  }

  let failed = false;
  if (missingDates.length) {
    missingDates.sort();
    const fetched = await fetchArchiveWindows(loc, missingDates[0], missingDates.at(-1),
                                              [...missingOffsets].sort((a, b) => a - b), safeEnd);
    if (fetched) {
      const touched = new Set();
      for (const day of fetched) {
        const key = monthDay(day.date);
        if (!byKey[key] || day.date > safeEnd) continue;
        byKey[key][yearOf(day.date)] = { year: yearOf(day.date), max: day.max, min: day.min, rain: day.rain, wind: day.wind, uv: day.uv };
        touched.add(key);
      }
      for (const key of touched) {
        store.set(`cc_archive_v${CACHE_VERSION}_${coordKey(loc)}_${key}`,
                  Object.values(byKey[key]).sort((a, b) => a.year - b.year));
      }
    } else failed = true;
  }

  const result = {};
  for (const date of dates) {
    const key = monthDay(date);
    const year = yearOf(date);
    const lowest = year - yearsBack;
    const highest = date <= safeEnd ? year : year - 1;
    const years = Object.values(byKey[key] ?? {})
      .filter((y) => y.year >= lowest && y.year <= highest)
      .sort((a, b) => a.year - b.year);
    if (years.length) result[key] = years;
  }
  return !Object.keys(result).length && failed ? null : result;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const values = (rows, f) => rows.map((r) => r[f]).filter((v) => v != null);

export function computeStats(years) {
  return {
    avgMax: avg(values(years, "max")), avgMin: avg(values(years, "min")),
    avgRain: avg(values(years, "rain")), avgWind: avg(values(years, "wind")),
  };
}

// ---------- One date: the Today tab / day view ----------
export async function loadDay(loc, date, forecast) {
  const dateYear = yearOf(date);
  const baseline = (await historicalYears(loc, [date], dateYear - BASELINE_START, forecast.today))?.[monthDay(date)] ?? null;
  // Normal = prior years only, so a past date is never compared with itself.
  const prior = (baseline ?? []).filter((y) => y.year < dateYear);
  const stats = prior.length ? computeStats(prior) : null;

  const fc = forecast.days.find((d) => d.date === date);
  const archived = baseline?.find((y) => y.year === dateYear);
  const weather = fc ?? (archived ? { ...archived, date, isForecast: false } : null);

  const yearly = prior.filter((y) => y.year >= dateYear - 10).map((y) => ({ ...y, isCurrent: false }));
  if (weather) yearly.push({ year: dateYear, max: weather.max, min: weather.min, rain: weather.rain, wind: weather.wind, isCurrent: true });

  return { date, stats, weather, yearly, longTerm: baseline ?? [], failed: baseline === null };
}

// Rule-based trend across the last 10 years of this date (first half vs second half).
export function trendDelta(yearly) {
  const past = yearly.filter((y) => !y.isCurrent).sort((a, b) => a.year - b.year);
  if (past.length < 4) return null;
  const mid = Math.floor(past.length / 2);
  const first = values(past.slice(0, mid), "max"), second = values(past.slice(-mid), "max");
  if (!first.length || !second.length) return null;
  return avg(second) - avg(first);
}

// ---------- The fortnight: last 7 + next 7 days, each against its own normal ----------
export async function loadWeek(loc, forecast) {
  const from = addDays(forecast.today, -7), to = addDays(forecast.today, 6);
  const days = forecast.days.filter((d) => d.date >= from && d.date <= to);
  if (!days.length) return null;
  const years = await historicalYears(loc, days.map((d) => d.date), yearOf(days[0].date) - BASELINE_START, forecast.today);
  if (!years) return null;
  const withDelta = days.map((d) => {
    const s = years[monthDay(d.date)];
    const stats = s ? computeStats(s.filter((y) => y.year < yearOf(d.date))) : null;
    return { ...d, normalMax: stats?.avgMax ?? null, delta: stats && d.max != null ? d.max - stats.avgMax : null };
  });
  const deltas = withDelta.map((d) => d.delta).filter((v) => v != null);
  return {
    days: withDelta,
    avgDelta: deltas.length ? avg(deltas) : null,
    anyRain: days.some((d) => (d.rain ?? 0) >= 0.1),
    anyBigSwing: days.some((d) => d.max != null && d.min != null && d.max - d.min >= 12),
  };
}

// ---------- Days above 35° this month vs the usual count by this day of the month ----------
export async function loadHeat(loc, forecast) {
  const today = forecast.today;
  const [y, m] = today.split("-").map(Number);
  const start = `${today.slice(0, 7)}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${today.slice(0, 7)}-${String(daysInMonth).padStart(2, "0")}`;
  const currentDay = Number(today.slice(8));
  const safeEnd = addDays(today, -7);

  // This month so far: archive first, then the forecast (which covers the last week) on top.
  const thisMonth = {};
  for (const d of (await fetchArchiveWindows(loc, start, today, [0], safeEnd)) ?? []) if (d.max != null) thisMonth[d.date] = d.max;
  for (const d of forecast.days) if (d.date >= start && d.date <= today && d.max != null) thisMonth[d.date] = d.max;
  const count = Object.values(thisMonth).filter((t) => t >= HEAT_THRESHOLD).length;
  const dots = Array.from({ length: daysInMonth }, (_, i) => {
    if (i + 1 > currentDay) return null;
    return (thisMonth[`${today.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`] ?? -Infinity) >= HEAT_THRESHOLD;
  });

  // Past years' full month, cached per location + month (past months never change).
  const cacheKey = `cc_heat_v1_${coordKey(loc)}_${String(m).padStart(2, "0")}`;
  const byYear = store.get(cacheKey) ?? {};
  const pastYears = Array.from({ length: y - BASELINE_START }, (_, i) => BASELINE_START + i);
  const missing = pastYears.filter((yr) => !byYear[yr]);
  if (missing.length) {
    const fetched = await fetchArchiveWindows(loc, start, end, missing.map((yr) => y - yr), safeEnd);
    if (fetched) {
      for (const d of fetched) {
        const yr = yearOf(d.date);
        if (yr === y || Number(d.date.slice(5, 7)) !== m) continue;
        byYear[yr] ??= Array(31).fill(null);
        byYear[yr][Number(d.date.slice(8)) - 1] = d.max;
      }
      store.set(cacheKey, byYear);
    }
  }
  const counts = pastYears.filter((yr) => byYear[yr])
    .map((yr) => byYear[yr].slice(0, currentDay).filter((t) => t != null && t >= HEAT_THRESHOLD).length);
  const usual = counts.length ? avg(counts) : 0;
  return { count, usual, dots, isUnusual: count - usual >= 3 };
}
