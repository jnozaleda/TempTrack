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
    return { ...d, normalMax: stats?.avgMax ?? null, normalMin: stats?.avgMin ?? null, delta: stats && d.max != null ? d.max - stats.avgMax : null };
  });
  const deltas = withDelta.map((d) => d.delta).filter((v) => v != null);
  return {
    days: withDelta,
    avgDelta: deltas.length ? avg(deltas) : null,
    anyRain: days.some((d) => (d.rain ?? 0) >= 0.1),
    anyBigSwing: days.some((d) => d.max != null && d.min != null && d.max - d.min >= 12),
  };
}

// ---------- The month so far vs the same days of every year since BASELINE_START ----------
// Same rules as loadMonthSummary in WeatherViewModel.swift. In the first days of a month
// there's too little to judge, so the previous month is shown, closed. Past years' months are
// cached per location + month (they never change).
export const MONTH_MIN_DAYS = 5;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function percentile(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = p * (s.length - 1), lo = Math.floor(pos), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function running(values, n) {
  let total = 0;
  return values.slice(0, n).map((v) => (total += v ?? 0));
}

export async function loadMonth(loc, forecast) {
  const today = forecast.today;
  const todayDay = Number(today.slice(8));
  const isClosed = todayDay < MONTH_MIN_DAYS;
  let [y, m] = today.split("-").map(Number);
  if (isClosed) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  const start = `${ym}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${ym}-${String(daysInMonth).padStart(2, "0")}`;
  const dayCount = isClosed ? daysInMonth : todayDay;
  const last = isClosed ? end : today;
  const safeEnd = addDays(today, -7);
  const empty = () => ({ max: Array(31).fill(null), min: Array(31).fill(null), rain: Array(31).fill(null) });

  // This year: archive first, then the forecast (which covers the last week) on top.
  const current = empty();
  const put = (d) => {
    const i = Number(d.date.slice(8)) - 1;
    if (d.max != null) current.max[i] = d.max;
    if (d.min != null) current.min[i] = d.min;
    if (d.rain != null) current.rain[i] = d.rain;
  };
  for (const d of (await fetchArchiveWindows(loc, start, last, [0], safeEnd)) ?? []) put(d);
  for (const d of forecast.days) if (d.date >= start && d.date <= last) put(d);

  const cacheKey = `cc_month_v1_${coordKey(loc)}_${String(m).padStart(2, "0")}`;
  const byYear = store.get(cacheKey) ?? {};
  const pastYears = Array.from({ length: y - BASELINE_START }, (_, i) => BASELINE_START + i);
  const missing = pastYears.filter((yr) => !byYear[yr]);
  if (missing.length) {
    const fetched = await fetchArchiveWindows(loc, start, end, missing.map((yr) => y - yr), safeEnd);
    if (fetched) {
      for (const d of fetched) {
        const yr = yearOf(d.date);
        if (yr === y || Number(d.date.slice(5, 7)) !== m) continue;
        byYear[yr] ??= empty();
        const i = Number(d.date.slice(8)) - 1;
        byYear[yr].max[i] = d.max; byYear[yr].min[i] = d.min; byYear[yr].rain[i] = d.rain;
      }
      store.set(cacheKey, byYear);
    }
  }
  const past = pastYears.map((yr) => byYear[yr]).filter(Boolean);
  if (past.length < 10) return null;

  // Temperature
  const curMax = current.max.slice(0, dayCount).filter((v) => v != null);
  if (curMax.length < dayCount - 2) return null;
  const meanMax = mean(curMax);
  const pastMeans = past.map((p) => mean(p.max.slice(0, dayCount).filter((v) => v != null))).filter((v) => v != null);
  const normalMeanMax = mean(pastMeans);
  const spread = Math.sqrt(pastMeans.reduce((a, v) => a + (v - normalMeanMax) ** 2, 0) / pastMeans.length);
  const dailyDelta = Array.from({ length: daysInMonth }, (_, i) => {
    if (i >= dayCount || current.max[i] == null) return null;
    const normal = mean(past.map((p) => p.max[i]).filter((v) => v != null));
    return normal == null ? null : current.max[i] - normal;
  });

  // Rain
  const curRain = current.rain.slice(0, dayCount).map((v) => v ?? 0);
  const rain = curRain.reduce((a, b) => a + b, 0);
  const pastTotals = past.map((p) => p.rain.slice(0, dayCount).reduce((a, v) => a + (v ?? 0), 0));
  const pastCum = past.map((p) => running(p.rain, daysInMonth));
  const column = (i) => pastCum.map((c) => c[i]);
  const wettestIdx = curRain.reduce((best, v, i) => (v > (curRain[best] ?? -1) ? i : best), 0);

  return {
    monthStart: start, daysInMonth, dayCount, isClosed, yearCount: past.length + 1,
    meanMax, normalMeanMax, spread, delta: meanMax - normalMeanMax,
    deviations: spread > 0 ? (meanMax - normalMeanMax) / spread : 0,
    warmRank: 1 + pastMeans.filter((v) => v > meanMax).length,
    dailyDelta,
    rain, normalRain: mean(pastTotals) ?? 0,
    rainLow: percentile(pastTotals, 0.25), rainHigh: percentile(pastTotals, 0.75),
    wetRank: 1 + pastTotals.filter((v) => v > rain).length,
    rainyDays: curRain.filter((v) => v >= 1).length,
    normalRainyDays: mean(past.map((p) => p.rain.slice(0, dayCount).filter((v) => (v ?? 0) >= 1).length)) ?? 0,
    wettestDay: curRain[wettestIdx] >= 1 ? wettestIdx + 1 : null,
    wettestDayRain: curRain[wettestIdx] ?? 0,
    cumulative: running(current.rain, dayCount),
    normalCumulative: Array.from({ length: daysInMonth }, (_, i) => mean(column(i)) ?? 0),
    lowCumulative: Array.from({ length: daysInMonth }, (_, i) => percentile(column(i), 0.25)),
    highCumulative: Array.from({ length: daysInMonth }, (_, i) => percentile(column(i), 0.75)),
  };
}

// ---------- This year so far, on its own (no comparison) ----------
// About 21 archive "calls" the first time, then only the days added since. Recorded days are
// cached per location + year; the last week comes from the forecast.
export const TROPICAL_NIGHT = 20;

export async function loadYear(loc, forecast) {
  const today = forecast.today;
  const year = yearOf(today);
  const yearStart = `${year}-01-01`;
  const safeEnd = addDays(today, -7);
  const cacheKey = `cc_year_v1_${coordKey(loc)}_${year}`;
  const days = store.get(cacheKey) ?? {};
  const lastCached = Object.keys(days).sort().at(-1);
  const from = lastCached ? addDays(lastCached, 1) : yearStart;
  if (from <= safeEnd) {
    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lon}` +
                  `&start_date=${from}&end_date=${safeEnd}&daily=${DAILY}&timezone=auto`;
      for (const d of parseDaily(await getJSON(url))) if (d.max != null) days[d.date] = [d.max, d.min, d.rain];
      store.set(cacheKey, days);
    } catch { /* show what's cached */ }
  }
  const all = { ...days };
  for (const d of forecast.days) if (d.date >= yearStart && d.date <= today && d.max != null) all[d.date] = [d.max, d.min, d.rain];
  const series = Object.keys(all).sort().map((date) => ({ date, max: all[date][0], min: all[date][1], rain: all[date][2] ?? 0 }));
  if (series.length < 14) return null;

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const rows = series.filter((d) => Number(d.date.slice(5, 7)) === m);
    if (!rows.length) continue;
    months.push({ month: m, meanMax: mean(rows.map((d) => d.max)), meanMin: mean(rows.map((d) => d.min).filter((v) => v != null)),
                  rain: rows.reduce((a, d) => a + d.rain, 0) });
  }
  const hottest = series.reduce((a, d) => (d.max > a.max ? d : a));
  const withMin = series.filter((d) => d.min != null);
  const coldest = withMin.reduce((a, d) => (d.min < a.min ? d : a), withMin[0]);
  const hot = series.filter((d) => d.max >= HEAT_THRESHOLD);

  // Longest run of days under 1 mm.
  let best = null, runStart = null, run = 0;
  for (const d of series) {
    if (d.rain < 1) {
      runStart ??= d.date; run += 1;
      if (run > (best?.days ?? 0)) best = { days: run, start: runStart, end: d.date };
    } else { runStart = null; run = 0; }
  }

  return {
    year, lastDay: series.at(-1).date, months,
    hottestDay: hottest.date, hottestTemp: hottest.max,
    coldestNight: coldest?.date ?? null, coldestTemp: coldest?.min ?? 0,
    hotDays: hot.length, firstHotDay: hot[0]?.date ?? null, lastHotDay: hot.at(-1)?.date ?? null,
    tropicalNights: series.filter((d) => (d.min ?? -Infinity) >= TROPICAL_NIGHT).length,
    rain: series.reduce((a, d) => a + d.rain, 0), rainyDays: series.filter((d) => d.rain >= 1).length,
    dryStreak: best,
  };
}
