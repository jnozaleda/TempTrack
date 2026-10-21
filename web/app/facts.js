// The one-line notes under each card — a port of FactNotes.swift, so the web and the iOS app
// say the same thing. Facts computed from the card's own data, never jokes (the day's
// one-liner in phrases.js is the only joke). Every function returns null when there's
// nothing worth saying.

const S = {
  es: {
    warm: (a, b, d) => `del ${a} al ${b}, hasta ${d} por encima`,
    cool: (a, b, d) => `del ${a} al ${b}, hasta ${d} por debajo`,
    last7: (x) => `Últimos 7 días: ${x}.`, closeToNormal: "cerca de lo normal",
    next7: (temp, rain) => `Próximos 7 días: ${temp}, ${rain}.`,
    temps: ["mucho más cálidos de lo normal", "más cálidos de lo normal", "en su normal", "más frescos de lo normal", "mucho más frescos de lo normal"],
    dry: "secos", rainOne: "lluvia 1 día", rainDays: (n) => `lluvia ${n} días`,
    rainOn: (v) => `Lluvia: ${v}`, warmest: "El día más cálido de la semana", coolest: "El día más fresco de la semana",
    coolNight: (v) => `Noche fresca: ${v}`, warmNight: (v) => `Noche cálida: ${v}`,
    warmer: (n, of) => `${n} de los últimos ${of} años fueron más cálidos que este.`,
    coolestSince: (y) => `La noche más fresca en esta fecha desde ${y}.`,
    warmestSince: (y) => `La noche más cálida en esta fecha desde ${y}.`,
    coolestAtLeast: (y) => `La noche más fresca en esta fecha desde al menos ${y}.`,
    warmestAtLeast: (y) => `La noche más cálida en esta fecha desde al menos ${y}.`,
    rained: (n, of) => `Llovió en esta fecha en ${n} de los últimos ${of} años.`,
    rainedDry: (n, of) => `Llovió en esta fecha en ${n} de los últimos ${of} años; este año, seco.`,
    rainedWet: (n, of, v) => `Llovió en esta fecha en ${n} de los últimos ${of} años; este año, ${v}.`,
    windier: "Más viento de lo normal.", calmer: "Menos viento de lo normal.",
    night: "Esta fecha se ha calentado sobre todo por la noche; las máximas han cambiado menos.",
    day: "Esta fecha se ha calentado sobre todo de día; las noches han cambiado menos.",
    both: "Los días y las noches se han calentado desde los años 80.",
    bothCool: "Los días y las noches son más frescos que en los años 80.",
    little: "Pocos cambios desde los años 80.",
  },
  en: {
    warm: (a, b, d) => `${a}–${b}, up to ${d} above normal`,
    cool: (a, b, d) => `${a}–${b}, up to ${d} below normal`,
    last7: (x) => `Last 7 days: ${x}.`, closeToNormal: "close to normal",
    next7: (temp, rain) => `Next 7 days: ${temp}, ${rain}.`,
    temps: ["much warmer than usual", "warmer than usual", "about normal", "cooler than usual", "much cooler than usual"],
    dry: "dry", rainOne: "rain on 1 day", rainDays: (n) => `rain on ${n} days`,
    rainOn: (v) => `Rain: ${v}`, warmest: "Warmest day of the week", coolest: "Coolest day of the week",
    coolNight: (v) => `Cool night: ${v}`, warmNight: (v) => `Warm night: ${v}`,
    warmer: (n, of) => `${n} of the last ${of} years were warmer than this one.`,
    coolestSince: (y) => `The coolest night on this date since ${y}.`,
    warmestSince: (y) => `The warmest night on this date since ${y}.`,
    coolestAtLeast: (y) => `The coolest night on this date since at least ${y}.`,
    warmestAtLeast: (y) => `The warmest night on this date since at least ${y}.`,
    rained: (n, of) => `It rained on this date in ${n} of the last ${of} years.`,
    rainedDry: (n, of) => `It rained on this date in ${n} of the last ${of} years; this year, dry.`,
    rainedWet: (n, of, v) => `It rained on this date in ${n} of the last ${of} years; this year, ${v}.`,
    windier: "Windier than usual.", calmer: "Calmer than usual.",
    night: "This date has warmed mostly at night; the highs have changed less.",
    day: "This date has warmed mostly by day; the nights have changed less.",
    both: "Both days and nights have warmed since the 1980s.",
    bothCool: "Both days and nights are cooler than in the 1980s.",
    little: "Little change since the 1980s.",
  },
};
const s = (lang) => S[lang] ?? S.en;
const deg = (v) => `${Math.round(v)}°`;
const capitalize = (x) => x.charAt(0).toUpperCase() + x.slice(1);

// Runs of at least `minLength` consecutive days more than 2° above (or below) their normal.
export function spells(days, minLength = 2) {
  const out = [];
  let run = [];
  const close = () => {
    if (run.length >= minLength) {
      const peak = run.map((r) => r.delta).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
      out.push({ first: run[0].day, last: run.at(-1).day, peak });
    }
    run = [];
  };
  for (const { day, delta } of days) {
    if (delta == null || Math.abs(delta) <= 2) { close(); continue; }
    if (run.length && (run.at(-1).delta > 0) !== (delta > 0)) close();
    run.push({ day, delta });
  }
  close();
  return out;
}

// The two strongest spells, in date order.
function spellsText(lang, list) {
  const strongest = [...list]
    .sort((a, b) => Math.abs(b.peak) * (b.last - b.first + 1) - Math.abs(a.peak) * (a.last - a.first + 1))
    .slice(0, 2)
    .sort((a, b) => a.first - b.first);
  if (!strongest.length) return null;
  return strongest.map((x) => (x.peak > 0 ? s(lang).warm : s(lang).cool)(x.first, x.last, deg(Math.abs(x.peak)))).join("; ");
}

export function monthNote(lang, month) {
  const text = spellsText(lang, spells(month.dailyDelta.map((delta, i) => ({ day: i + 1, delta }))));
  return text ? capitalize(text) + "." : null;
}

// past: [{ day, delta }], upcoming: [{ delta, rain }]
export function weekNote(lang, past, upcoming) {
  const out = [];
  if (past.length) out.push(s(lang).last7(spellsText(lang, spells(past)) ?? s(lang).closeToNormal));
  const deltas = upcoming.map((x) => x.delta).filter((v) => v != null);
  if (deltas.length) {
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const temp = s(lang).temps[avg > 6 ? 0 : avg > 2 ? 1 : avg >= -2 ? 2 : avg > -6 ? 3 : 4];
    const rainy = upcoming.filter((x) => (x.rain ?? 0) >= 1).length;
    const rain = rainy === 0 ? s(lang).dry : rainy === 1 ? s(lang).rainOne : s(lang).rainDays(rainy);
    out.push(s(lang).next7(temp, rain));
  }
  return out.length ? out.join(" ") : null;
}

export function weekDayNote(lang, { rain, delta, nightDelta, min, isWarmest, isCoolest }, mm) {
  if ((rain ?? 0) >= 1) return s(lang).rainOn(mm(rain));
  if (delta != null && isWarmest && delta >= 3) return s(lang).warmest;
  if (delta != null && isCoolest && delta <= -3) return s(lang).coolest;
  if (nightDelta != null && min != null && nightDelta <= -2.5) return s(lang).coolNight(deg(min));
  if (nightDelta != null && min != null && nightDelta >= 2.5) return s(lang).warmNight(deg(min));
  return null;
}

// "6 of the last 10 years were warmer than this one. The coolest night on this date since 2023."
export function dateHistoryNote(lang, current, lastTen, sinceBaseline, normalMin) {
  if (!current || current.max == null || lastTen.length < 5) return null;
  const out = [s(lang).warmer(lastTen.filter((y) => (y.max ?? -Infinity) > current.max).length, lastTen.length)];
  if (current.min != null && normalMin != null) {
    const earlier = sinceBaseline.filter((y) => y.year < current.year).sort((a, b) => b.year - a.year);
    const isCool = current.min < normalMin;
    const match = earlier.find((y) => y.min != null && (isCool ? y.min <= current.min : y.min >= current.min));
    if (match && current.year - match.year >= 3) out.push((isCool ? s(lang).coolestSince : s(lang).warmestSince)(match.year));
    else if (!match && earlier.length) out.push((isCool ? s(lang).coolestAtLeast : s(lang).warmestAtLeast)(earlier.at(-1).year));
  }
  return out.join(" ");
}

export function rainWindNote(lang, current, lastTen, normalWind, mm) {
  if (lastTen.length < 5) return null;
  const rainy = lastTen.filter((y) => (y.rain ?? 0) >= 1).length;
  let out = current?.rain == null ? s(lang).rained(rainy, lastTen.length)
    : current.rain >= 1 ? s(lang).rainedWet(rainy, lastTen.length, mm(current.rain))
    : s(lang).rainedDry(rainy, lastTen.length);
  if (current?.wind != null && normalWind > 0) {
    if (current.wind - normalWind >= 5) out += " " + s(lang).windier;
    if (current.wind - normalWind <= -5) out += " " + s(lang).calmer;
  }
  return out;
}

export function longTermNote(lang, highChange, lowChange) {
  const h = highChange, l = lowChange;
  if (l >= 1 && l - h >= 1) return s(lang).night;
  if (h >= 1 && h - l >= 1) return s(lang).day;
  if (h >= 1 && l >= 1) return s(lang).both;
  if (h <= -1 && l <= -1) return s(lang).bothCool;
  if (Math.abs(h) < 0.5 && Math.abs(l) < 0.5) return s(lang).little;
  return null;
}
