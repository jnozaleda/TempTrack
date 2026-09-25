// Cheeky one-liners — a straight port of CannedInsight.swift so the web, the WhatsApp message
// and the iOS app say the same thing for the same city and day. Keep the banks in sync with
// the app (they're generated from it). Plain ES module: also imported by the WhatsApp sender.

// FNV-1a 64-bit, mod Int32.max — identical to the app's stableHash, so picks match exactly.
function stableHash(str) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(str)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return Number(hash % 2147483647n);
}

function pick(templates, seed, rotation = 0) {
  return templates.length ? templates[(stableHash(seed) + rotation) % templates.length] : "";
}

function appendTips(sentence, tips, seed, rotation) {
  return tips.reduce((out, tip, i) => out + " " + pick(tip, seed + "tip" + i, rotation), sentence);
}

// At most two tips, in priority order — same rules as the app.
function dayTips(ctx, bank) {
  const tips = [];
  const rainy = (ctx.rainMM ?? 0) >= 0.1;
  if (rainy) tips.push(bank.tipRain);
  if (ctx.daySwing != null && ctx.daySwing >= 12) tips.push(bank.tipSwing);
  if (ctx.windKmh != null && ctx.windKmh >= 35) tips.push(bank.tipWind);
  if (!rainy && ctx.uvIndex != null && ctx.uvIndex >= 8) tips.push(bank.tipUV);
  return tips.slice(0, 2);
}

// ctx: { delta, rainMM, daySwing, windKmh, uvIndex }. rotation = days since epoch of the day,
// seed = city name — so 7 consecutive days never repeat a line and cities don't all match.
export function dayLine(lang, ctx, seed, rotation = 0) {
  const bank = BANKS[lang] ?? BANKS.en;
  const d = ctx.delta;
  const templates = d > 6 ? bank.dayScorching : d > 2 ? bank.dayWarm : d >= -2 ? bank.dayNormal
                  : d > -6 ? bank.dayCool : bank.dayCold;
  return appendTips(pick(templates, seed, rotation), dayTips(ctx, bank), seed, rotation);
}

export function weekLine(lang, avgDeltaMax, anyRain, anyBigSwing, seed) {
  const bank = BANKS[lang] ?? BANKS.en;
  const d = avgDeltaMax;
  const templates = d > 4 ? bank.weekHot : d > 1 ? bank.weekWarm : d >= -1 ? bank.weekNormal
                  : d > -4 ? bank.weekCool : bank.weekCold;
  const tips = [];
  if (anyRain) tips.push(bank.tipRain);
  if (anyBigSwing) tips.push(bank.tipSwing);
  return appendTips(pick(templates, seed), tips, seed, 0);
}

export function trendLine(lang, deltaOverDecade, seed) {
  const bank = BANKS[lang] ?? BANKS.en;
  let amount = Math.abs(deltaOverDecade).toFixed(1);
  if (lang === "es") amount = amount.replace(".", ",");
  const templates = Math.abs(deltaOverDecade) < 0.3 ? bank.trendStable
                  : deltaOverDecade > 0 ? bank.trendWarmer : bank.trendCooler;
  return pick(templates, seed).replace("%@", amount);
}

const BANKS = {
  "en": {
    "dayScorching": [
      "The sun has clearly lost the plot today. 🥵",
      "Basically a pizza oven with Wi-Fi out there.",
      "Even the pigeons are hunting for shade.",
      "This is not a drill — it's properly roasting. 🔥",
      "The thermometer is showing off. Hydrate or evaporate.",
      "Your AC is about to earn its entire salary today.",
      "The pavement is legally soup now."
    ],
    "dayWarm": [
      "Sleeves are officially optional today. ☀️",
      "Warmer than it has any right to be. Nobody's complaining. Yet.",
      "Summer refuses to take the hint.",
      "Leave the jacket at home, trust me.",
      "Sunglasses, not umbrellas.",
      "The weather showed up with extra enthusiasm today.",
      "Terrace season isn't over, apparently."
    ],
    "dayNormal": [
      "Boringly normal. The weather is on autopilot today. 😴",
      "Right on the historical average. Nothing to gossip about.",
      "Textbook weather for today. Your gran would approve.",
      "Exactly what this date usually looks like. No plot twists.",
      "Normal as a Tuesday. The climate is behaving, for once.",
      "Bang on average. Wear whatever you wore this day last year.",
      "Zero surprises today — the weather actually read the manual."
    ],
    "dayCool": [
      "Grab a layer, you'll thank me. 🧥",
      "The weather's in a mood today.",
      "Hoodie weather, officially.",
      "Someone left the fridge door open.",
      "Bring a jacket and some patience.",
      "Autumn's sneaking in early.",
      "The weather took the day off from being warm. Dress accordingly."
    ],
    "dayCold": [
      "Absolutely baltic out there. 🥶",
      "Scarf, gloves, the full kit.",
      "The weather chose violence today.",
      "Brr. Stay in if you can.",
      "Layers on layers on layers.",
      "Tea time is non-negotiable.",
      "Your radiator's big moment has arrived."
    ],
    "weekHot": [
      "The fan is your new best friend this week. 🥵",
      "A near-heatwave week. Summer said \"one more time\".",
      "This week decided to run hot. Bold choice.",
      "Ice cream counts as a food group this week.",
      "A week for shade, water and zero ambition."
    ],
    "weekWarm": [
      "A touch toasty this week. ☀️",
      "Nobody's filing complaints about this week.",
      "T-shirt weather, mostly.",
      "The week's running warm. Enjoy it while it lasts.",
      "A mild bonus round of summer this week."
    ],
    "weekNormal": [
      "A gloriously average week. The weather is coasting.",
      "This week is tracking the historical norm to the letter.",
      "Textbook week for the time of year — zero drama.",
      "Nothing weird this week. The climate's on its best behaviour.",
      "Perfectly average week. Your wardrobe can relax."
    ],
    "weekCool": [
      "A bit chilly this week. 🧥",
      "Hoodies are back in rotation.",
      "Autumn's rehearsing this week.",
      "Keep a layer handy all week.",
      "A cool week — someone's still got the fridge door open."
    ],
    "weekCold": [
      "A properly cold week. 🥶",
      "Blanket season, confirmed.",
      "A proper cold snap this week.",
      "The week decided to be cold. Rude.",
      "Soup, every single day."
    ],
    "trendStable": [
      "This date hasn't budged in a decade. Reliable, like a golden retriever.",
      "Ten years of data and this date refuses to change.",
      "Remarkably steady on this date for a decade — no drama.",
      "This day of the year is the climate's most consistent employee."
    ],
    "trendWarmer": [
      "This date has warmed about %@° in a decade. Not great, Bob. 🔥",
      "Ten years on, this date runs roughly %@° hotter.",
      "Trending hotter: about %@° warmer than a decade ago.",
      "This date gained %@° in ten years. The planet noticed."
    ],
    "trendCooler": [
      "This date has cooled about %@° over the decade. Plot twist. ❄️",
      "Ten years on, this date runs roughly %@° cooler.",
      "Trending cooler: about %@° down on a decade ago.",
      "This date lost %@° in ten years. Unexpected, but okay."
    ],
    "tipRain": [
      "Umbrella or regret — your call. ☔️",
      "Pack the brolly, the sky's feeling leaky.",
      "Rain's on the menu, so bring an umbrella.",
      "Don't trust the sky: umbrella in the bag."
    ],
    "tipSwing": [
      "But it drops hard after dark, so pack a jumper.",
      "Nights get sneaky cold — bring a layer for later.",
      "Warm by day, chilly by night: jumper in the bag.",
      "Big day/night swing, so don't get caught in a T-shirt at 10pm."
    ],
    "tipWind": [
      "Hold onto your hat, it's blowy. 💨",
      "Windy enough to ruin your hair. Plan accordingly.",
      "Gusty out there — umbrellas, beware."
    ],
    "tipUV": [
      "The sun's properly strong, so sunscreen isn't optional.",
      "Sunscreen, or look like a lobster by lunch. 🦞",
      "Serious midday sun — shade is your friend."
    ]
  },
  "es": {
    "dayScorching": [
      "El sol se ha venido arriba hoy. 🥵",
      "Ahí fuera es básicamente un horno con wifi.",
      "Hasta las palomas buscan sombra.",
      "No es un simulacro: hoy se asa uno. 🔥",
      "El termómetro se está luciendo. Hidrátate o evapórate.",
      "El aire acondicionado va a sudar la camiseta.",
      "El asfalto ya es sopa."
    ],
    "dayWarm": [
      "Hoy las mangas son opcionales. ☀️",
      "Más calor del que toca. Nadie se queja. De momento.",
      "El verano no se da por aludido.",
      "Deja la chaqueta en casa, hazme caso.",
      "Gafas de sol, no paraguas.",
      "El tiempo viene hoy con entusiasmo extra.",
      "La temporada de terraza sigue abierta, por lo visto."
    ],
    "dayNormal": [
      "Normal a más no poder. El tiempo va en piloto automático. 😴",
      "Clavado a la media histórica. Nada que cotillear.",
      "Tiempo de manual para hoy. Tu abuela lo aprobaría.",
      "Justo lo que suele hacer este día. Sin giros de guion.",
      "Más normal que un martes. El clima se está portando, por una vez.",
      "En la media exacta. Ponte lo mismo que este día el año pasado.",
      "Cero sorpresas hoy — el tiempo se ha leído el manual."
    ],
    "dayCool": [
      "Coge una capa, me lo agradecerás. 🧥",
      "El tiempo está de morros.",
      "Tiempo de sudadera, oficialmente.",
      "Alguien se ha dejado la nevera abierta.",
      "Chaqueta y paciencia.",
      "El otoño se cuela antes de hora.",
      "El tiempo se ha tomado el día libre de hacer calor. Vístete en consecuencia."
    ],
    "dayCold": [
      "Hace un frío que pela. 🥶",
      "Bufanda, guantes y todo el kit.",
      "El tiempo hoy ha elegido la violencia.",
      "Brrr. Si puedes, quédate en casa.",
      "Capas sobre capas sobre capas.",
      "La mantita no es negociable.",
      "Le ha llegado el gran momento al radiador."
    ],
    "weekHot": [
      "El ventilador es tu nuevo mejor amigo esta semana. 🥵",
      "Semana de casi ola de calor. El verano ha dicho \"una más\".",
      "Esta semana ha decidido ir a tope de calor. Valiente.",
      "Esta semana el helado cuenta como comida.",
      "Semana de sombra, agua y cero ambición."
    ],
    "weekWarm": [
      "Semana tirando a calurosa. ☀️",
      "Nadie ha puesto una queja por esta semana.",
      "Manga corta, casi siempre.",
      "La semana viene cálida. Disfrútalo mientras dure.",
      "Ronda extra de verano, versión suave."
    ],
    "weekNormal": [
      "Una semana gloriosamente normal. El tiempo va en punto muerto.",
      "Esta semana sigue la media histórica al pie de la letra.",
      "Semana de manual para esta época — cero drama.",
      "Nada raro esta semana. El clima se está portando bien.",
      "Semana en la media exacta. Tu armario puede relajarse."
    ],
    "weekCool": [
      "Semana fresquita. 🧥",
      "Vuelven las sudaderas.",
      "El otoño está ensayando esta semana.",
      "Ten una capa a mano toda la semana.",
      "Semana fresca — alguien sigue con la nevera abierta."
    ],
    "weekCold": [
      "Semana fría de verdad. 🥶",
      "Temporada de manta, confirmada.",
      "Ola de frío esta semana.",
      "La semana ha decidido ir fría. Qué falta de respeto.",
      "Sopa, todos los días."
    ],
    "trendStable": [
      "Este día no se ha movido en una década. Fiable como un golden retriever.",
      "Diez años de datos y este día se niega a cambiar.",
      "Muy estable este día durante la última década — cero drama.",
      "Este día del año es el empleado más constante del clima."
    ],
    "trendWarmer": [
      "Este día se ha calentado unos %@° en una década. Mal asunto. 🔥",
      "Diez años después, este día va unos %@° más caliente.",
      "Tendencia al alza: unos %@° más que hace una década.",
      "Este día ha ganado %@° en diez años. El planeta lo ha notado."
    ],
    "trendCooler": [
      "Este día se ha enfriado unos %@° en la década. Giro de guion. ❄️",
      "Diez años después, este día va unos %@° más fresco.",
      "Tendencia a la baja: unos %@° menos que hace una década.",
      "Este día ha perdido %@° en diez años. Inesperado, pero vale."
    ],
    "tipRain": [
      "Paraguas o arrepentimiento, tú eliges. ☔️",
      "Llévate el paraguas, que el cielo gotea.",
      "Hoy toca lluvia: paraguas a la mochila.",
      "No te fíes del cielo: paraguas en el bolso."
    ],
    "tipSwing": [
      "Pero por la noche refresca de verdad, llévate un jersey.",
      "Las noches vienen traicioneras — coge una capa para luego.",
      "Calor de día, fresco de noche: jersey en la mochila.",
      "Mucho contraste día/noche, que no te pille en manga corta a las diez."
    ],
    "tipWind": [
      "Agárrate el sombrero, que sopla. 💨",
      "Viento suficiente para arruinarte el peinado.",
      "Hoy sopla fuerte — paraguas, cuidadito."
    ],
    "tipUV": [
      "El sol pega de verdad, la crema no es opcional.",
      "Crema solar, o a mediodía pareces una gamba. 🦐",
      "Sol serio a mediodía — la sombra es tu amiga."
    ]
  }
};
