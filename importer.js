/* ==========================================================================
   importer.js — rozpoznawanie przepisu z wklejonego tekstu (lokalnie, bez sieci).
   Obsługuje: zwykły tekst PL/EN/DE/FR/IT, listy ze składnikami "500 g mąki",
   "Mąka — 1000 g — 100%", zakresy, ułamki, jednostki imperialne, °F → °C,
   oraz kod HTML strony z JSON-LD (schema.org/Recipe).
   Widok importera znajduje się w views-import.js.
   ========================================================================== */
import { blankRecipe, blankSection, blankStep, blankIngredient, DEFAULT_CATEGORIES } from './recipes.js';
import { parseNum, capFirst, fmtNum, norm } from './util.js';

/* ---------- Słowniki ---------- */

// Jednostki: [regex (bez kotwic), jednostka docelowa, mnożnik, dopisek do nazwy]
const UNIT_DEFS = [
  [/^(kg|kilogram\w*|kilo)$/i, 'kg', 1],
  [/^(g|gr|gram\w*|grams?|gramm)$/i, 'g', 1],
  [/^(dag|dkg|deka\w*)$/i, 'g', 10],
  [/^(mg)$/i, 'g', 0.001],
  [/^(l|litr\w*|liters?|litres?|liter)$/i, 'l', 1],
  [/^(ml|mililitr\w*|milliliters?|millilitres?)$/i, 'ml', 1],
  [/^(dl|decyl\w*)$/i, 'ml', 100],
  [/^(cl)$/i, 'ml', 10],
  [/^(szklank\w*|glass(es)?)$/i, 'ml', 250],
  [/^(cups?|tasse\w*)$/i, 'ml', 240],
  [/^(łyżk\w*|lyzk\w*|tbsps?|tbs|tablespoons?|el|esslöffel|càs|cucchiai\w*|cuillères?)$/i, 'łyżka', 1],
  [/^(łyżeczk\w*|lyzeczk\w*|tsps?|teaspoons?|tl|teelöffel|cucchiaini?)$/i, 'łyżeczka', 1],
  [/^(szczypt\w*|pinch(es)?|prise|pizzico)$/i, 'szczypta', 1],
  [/^(oz|ounces?)$/i, 'g', 28.35],
  [/^(lbs?|pounds?)$/i, 'g', 453.6],
  [/^(fl\.?oz)$/i, 'ml', 29.57],
  [/^(pints?|pt)$/i, 'ml', 473],
  [/^(quarts?|qt)$/i, 'ml', 946],
  [/^(stick|sticks)$/i, 'g', 113],
  [/^(ząb\w*|zab\w*|cloves?)$/i, 'szt.', 1, 'ząbki'],
  [/^(szt|sztuk\w*|sztuka|pcs?|pieces?|piece|stück|pièces?)$/i, 'szt.', 1],
  [/^(plast\w*|slices?)$/i, 'szt.', 1, 'plasterki'],
  [/^(liśc\w*|lisc\w*|leaf|leaves)$/i, 'szt.', 1, 'liście'],
  [/^(gałąz\w*|galaz\w*|sprigs?)$/i, 'szt.', 1, 'gałązki'],
  [/^(pęcz\w*|pecz\w*|bunch(es)?)$/i, 'szt.', 1, 'pęczek'],
  [/^(kromk\w*)$/i, 'szt.', 1, 'kromki'],
  [/^(puszk\w*|cans?|tins?)$/i, 'szt.', 1, 'puszka'],
  [/^(opak\w*|paczk\w*|packages?|packets?)$/i, 'szt.', 1, 'opakowanie'],
  [/^(kostk\w*|cubes?)$/i, 'szt.', 1, 'kostka'],
  [/^(garść|garsc|garści|handfuls?)$/i, 'porcja', 1, 'garść'],
];

// Słowa (EN/DE/FR/IT → PL) dla nazw składników. Klucze małymi literami.
const PHRASES = {
  'all-purpose flour': 'mąka pszenna', 'plain flour': 'mąka pszenna', 'bread flour': 'mąka chlebowa', 'strong flour': 'mąka chlebowa',
  'whole wheat flour': 'mąka pełnoziarnista', 'olive oil': 'oliwa z oliwek', 'extra virgin olive oil': 'oliwa extra vergine',
  'baking powder': 'proszek do pieczenia', 'baking soda': 'soda oczyszczona', 'bicarbonate of soda': 'soda oczyszczona',
  'black pepper': 'pieprz czarny', 'freshly ground black pepper': 'pieprz czarny świeżo mielony', 'white pepper': 'pieprz biały',
  'sea salt': 'sól morska', 'kosher salt': 'sól gruboziarnista', 'brown sugar': 'cukier brązowy', 'caster sugar': 'cukier puder drobny',
  'powdered sugar': 'cukier puder', 'icing sugar': 'cukier puder', 'heavy cream': 'śmietanka 36%', 'double cream': 'śmietanka 36%',
  'whipping cream': 'śmietanka 36%', 'sour cream': 'śmietana', 'egg yolks': 'żółtka', 'egg yolk': 'żółtko', 'egg whites': 'białka',
  'egg white': 'białko', 'fresh yeast': 'drożdże świeże', 'dry yeast': 'drożdże suche', 'active dry yeast': 'drożdże suche aktywne',
  'instant yeast': 'drożdże instant', 'tomato paste': 'koncentrat pomidorowy', 'tomato sauce': 'sos pomidorowy', 'chicken stock': 'bulion drobiowy',
  'chicken broth': 'bulion drobiowy', 'beef stock': 'bulion wołowy', 'vegetable stock': 'bulion warzywny', 'red onion': 'cebula czerwona',
  'spring onion': 'dymka', 'green onion': 'dymka', 'bell pepper': 'papryka', 'red pepper': 'papryka czerwona', 'chili flakes': 'płatki chili',
  'lemon juice': 'sok z cytryny', 'lemon zest': 'skórka z cytryny', 'lime juice': 'sok z limonki', 'soy sauce': 'sos sojowy',
  'white wine': 'wino białe', 'red wine': 'wino czerwone', 'cream cheese': 'serek śmietankowy', 'parmesan cheese': 'parmezan',
  'pecorino romano': 'pecorino romano', 'ground beef': 'mielona wołowina', 'minced beef': 'mielona wołowina', 'ground pork': 'mielona wieprzowina',
  'chicken breast': 'pierś z kurczaka', 'chicken thighs': 'udka z kurczaka', 'vanilla extract': 'ekstrakt waniliowy', 'maple syrup': 'syrop klonowy',
  'peanut butter': 'masło orzechowe', 'sweet potato': 'batat', 'sun-dried tomatoes': 'suszone pomidory', 'canned tomatoes': 'pomidory z puszki',
  'plum tomatoes': 'pomidory śliwkowe', 'cherry tomatoes': 'pomidory koktajlowe', 'fresh basil': 'bazylia świeża', 'fresh parsley': 'pietruszka świeża',
};
const WORDS = {
  flour: 'mąka', water: 'woda', salt: 'sól', sugar: 'cukier', butter: 'masło', milk: 'mleko', cream: 'śmietanka', eggs: 'jajka', egg: 'jajko',
  oil: 'olej', yeast: 'drożdże', pepper: 'pieprz', garlic: 'czosnek', onion: 'cebula', onions: 'cebula', tomato: 'pomidor', tomatoes: 'pomidory',
  cheese: 'ser', parmesan: 'parmezan', mozzarella: 'mozzarella', basil: 'bazylia', parsley: 'pietruszka', thyme: 'tymianek', rosemary: 'rozmaryn',
  oregano: 'oregano', cinnamon: 'cynamon', vanilla: 'wanilia', honey: 'miód', vinegar: 'ocet', wine: 'wino', beef: 'wołowina', pork: 'wieprzowina',
  chicken: 'kurczak', bacon: 'boczek', ham: 'szynka', potato: 'ziemniak', potatoes: 'ziemniaki', carrot: 'marchew', carrots: 'marchew',
  celery: 'seler', mushrooms: 'pieczarki', mushroom: 'pieczarka', spinach: 'szpinak', lemon: 'cytryna', lime: 'limonka', orange: 'pomarańcza',
  apple: 'jabłko', apples: 'jabłka', banana: 'banan', rice: 'ryż', pasta: 'makaron', noodles: 'makaron', bread: 'chleb', breadcrumbs: 'bułka tarta',
  cocoa: 'kakao', chocolate: 'czekolada', almonds: 'migdały', walnuts: 'orzechy włoskie', nuts: 'orzechy', raisins: 'rodzynki', ginger: 'imbir',
  paprika: 'papryka wędzona', cumin: 'kmin rzymski', turmeric: 'kurkuma', chili: 'chili', chilli: 'chili', shrimp: 'krewetki', prawns: 'krewetki',
  salmon: 'łosoś', cod: 'dorsz', tuna: 'tuńczyk', anchovies: 'anchois', capers: 'kapary', olives: 'oliwki', beans: 'fasola', lentils: 'soczewica',
  chickpeas: 'ciecierzyca', cabbage: 'kapusta', cucumber: 'ogórek', zucchini: 'cukinia', courgette: 'cukinia', eggplant: 'bakłażan', aubergine: 'bakłażan',
  broccoli: 'brokuły', cauliflower: 'kalafior', corn: 'kukurydza', peas: 'groszek', leek: 'por', dill: 'koperek', mint: 'mięta', cilantro: 'kolendra',
  coriander: 'kolendra', sage: 'szałwia', nutmeg: 'gałka muszkatołowa', cloves: 'goździki', yogurt: 'jogurt', yoghurt: 'jogurt', semolina: 'semolina',
  cornstarch: 'skrobia kukurydziana', cornflour: 'skrobia kukurydziana', gelatin: 'żelatyna', rum: 'rum', beer: 'piwo', stock: 'bulion', broth: 'bulion',
  // DE / FR / IT (najczęstsze)
  mehl: 'mąka', zucker: 'cukier', salz: 'sól', eier: 'jajka', milch: 'mleko', hefe: 'drożdże', butterschmalz: 'masło klarowane', sahne: 'śmietanka',
  farine: 'mąka', sucre: 'cukier', sel: 'sól', oeufs: 'jajka', beurre: 'masło', lait: 'mleko', crème: 'śmietanka', levure: 'drożdże',
  farina: 'mąka', zucchero: 'cukier', sale: 'sól', uova: 'jajka', burro: 'masło', latte: 'mleko', olio: 'oliwa', lievito: 'drożdże', pomodori: 'pomidory', guanciale: 'guanciale',
};
const PREP = {
  chopped: 'posiekane', 'finely chopped': 'drobno posiekane', diced: 'pokrojone w kostkę', sliced: 'pokrojone w plasterki', minced: 'drobno posiekane',
  grated: 'starte', 'finely grated': 'drobno starte', melted: 'roztopione', softened: 'miękkie', 'room temperature': 'temp. pokojowa', peeled: 'obrane',
  crushed: 'zgniecione', ground: 'mielone', fresh: 'świeże', 'freshly ground': 'świeżo mielone', optional: 'opcjonalnie', 'to taste': 'do smaku',
  divided: 'podzielone', beaten: 'roztrzepane', cubed: 'pokrojone w kostkę', halved: 'przekrojone na pół', drained: 'odsączone', rinsed: 'opłukane',
  packed: 'ubite', sifted: 'przesiane', 'cut into pieces': 'pokrojone', large: 'duże', medium: 'średnie', small: 'małe',
};

// Genitiv → mianownik dla typowych składników ("łyżka oliwy" → "oliwa").
const GEN = {
  'mąki': 'mąka', 'oliwy': 'oliwa', 'soli': 'sól', 'cukru': 'cukier', 'masła': 'masło', 'wody': 'woda', 'mleka': 'mleko', 'śmietany': 'śmietana',
  'śmietanki': 'śmietanka', 'drożdży': 'drożdże', 'pieprzu': 'pieprz', 'czosnku': 'czosnek', 'cebuli': 'cebula', 'oleju': 'olej', 'octu': 'ocet',
  'wina': 'wino', 'miodu': 'miód', 'sera': 'ser', 'jajek': 'jajka', 'jaj': 'jajka', 'marchewki': 'marchew', 'marchwi': 'marchew', 'pomidorów': 'pomidory',
  'ziemniaków': 'ziemniaki', 'makaronu': 'makaron', 'ryżu': 'ryż', 'kakao': 'kakao', 'czekolady': 'czekolada', 'bazylii': 'bazylia', 'pietruszki': 'pietruszka',
  'natki pietruszki': 'natka pietruszki', 'cynamonu': 'cynamon', 'proszku do pieczenia': 'proszek do pieczenia', 'sody': 'soda', 'skrobi': 'skrobia',
  'bulionu': 'bulion', 'koncentratu pomidorowego': 'koncentrat pomidorowy', 'soku z cytryny': 'sok z cytryny', 'wanilii': 'wanilia', 'kaszy': 'kasza',
  'mięsa': 'mięso', 'boczku': 'boczek', 'szynki': 'szynka', 'kurczaka': 'kurczak', 'papryki': 'papryka', 'żółtek': 'żółtka', 'białek': 'białka',
  'orzechów': 'orzechy', 'rodzynek': 'rodzynki', 'majonezu': 'majonez', 'musztardy': 'musztarda', 'ketchupu': 'ketchup', 'jogurtu': 'jogurt', 'twarogu': 'twaróg',
};

const HEAD = {
  ingredients: /^(składniki|skladniki|ingredients?|zutaten|ingr[ée]dients?|ingredienti|ingredientes)\b/i,
  steps: /^(przygotowanie|spos[oó]b przygotowania|wykonanie|instrukcj\w*|spos[oó]b wykonania|kroki|method|directions?|instructions?|preparation|steps?|zubereitung|pr[ée]paration|procedimento|procedura)\b/i,
  notes: /^(uwagi|notatki|wskaz[oó]wki|porady|notes?|tips?|hinweise?)\b/i,
};

/* ---------- Pomocnicze ---------- */

export const fToC = (f) => Math.round((f - 32) / 1.8 / 5) * 5;

/** °F → °C w tekście: "350°F" → "175 °C (350 °F)". Idempotentne (nie konwertuje drugi raz). */
export function convertTemps(text) {
  const conv = (m, f, off, str) => (str.slice(Math.max(0, off - 4), off) === '°C (' ? m : `${fToC(+f)} °C (${f} °F)`);
  return text.replace(/(\d{2,3})\s*°\s*F\b/g, conv).replace(/(\d{2,3})\s*degrees?\s*F\b/gi, conv);
}

/** "PT1H30M", "1 h 30 min", "90 min", "1,5 godz." → minuty. */
export function parseDuration(s) {
  if (!s) return 0;
  s = String(s).trim();
  let m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (m && /^P/i.test(s) && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  let total = 0, found = false;
  const re = /(\d+(?:[.,]\d+)?)\s*(dni|dzień|dzien|days?|d\b|godz\w*|h\b|hours?|hrs?|std|min\w*|m\b|minutes?)/gi;
  while ((m = re.exec(s))) {
    found = true;
    const n = parseNum(m[1]), u = m[2].toLowerCase();
    if (/^(d|dni|dzie|day)/.test(u)) total += n * 1440;
    else if (/^(h|godz|hour|hr|std)/.test(u)) total += n * 60;
    else total += n;
  }
  if (!found) { const n = parseNum(s); return n && n < 1000 ? Math.round(n) : 0; }
  return Math.round(total);
}

const BULLET = /^[\s•●▪▫◦‣⁃∙·*▢☐□✓✔☑➤➢→-]+\s*/;
const QTY_RX = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+[.,]\\d+|\\d+|[½⅓⅔¼¾⅛])';

function matchUnit(tok) {
  const t = tok.replace(/[.,;:]+$/, '');
  for (const [re, unit, mult, tag] of UNIT_DEFS) if (re.test(t)) return { unit, mult, tag };
  return null;
}

function translateName(name) {
  let s = name.trim();
  // Genitiv na początku (dwa słowa najpierw)
  const w = s.split(/\s+/);
  const two = w.slice(0, 3).join(' ').toLowerCase(), two2 = w.slice(0, 2).join(' ').toLowerCase(), one = w[0] ? w[0].toLowerCase() : '';
  if (GEN[two]) { w.splice(0, 3, GEN[two]); s = w.join(' '); }
  else if (GEN[two2]) { w.splice(0, 2, GEN[two2]); s = w.join(' '); }
  else if (GEN[one]) { w[0] = GEN[one]; s = w.join(' '); }
  // Frazy obcojęzyczne
  const low = s.toLowerCase();
  for (const k of Object.keys(PHRASES).sort((a, b) => b.length - a.length)) {
    if (low.includes(k)) { s = s.replace(new RegExp(k.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'), PHRASES[k]); break; }
  }
  // Pojedyncze słowa obce (tylko całe słowa)
  s = s.replace(/[A-Za-zÀ-ÿ]+/g, (m) => (WORDS[m.toLowerCase()] && !/[ąćęłńóśźż]/i.test(m) ? WORDS[m.toLowerCase()] : m));
  return capFirst(s.replace(/\s{2,}/g, ' ').trim());
}

function splitPrepNote(s) {
  const notes = [];
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => { notes.push(inner); return ''; });
  const parts = s.split(/,\s*|\s+-\s+/);
  const name = parts.shift();
  parts.forEach((p) => notes.push(p));
  const nn = notes.map((n) => {
    const k = n.trim().toLowerCase();
    return PREP[k] || n.trim();
  }).filter(Boolean);
  return { name: name.trim(), notes: nn };
}

/* ---------- Składnik z jednej linii ---------- */

/**
 * "2 łyżki oliwy" → {name:'Oliwa', amount:2, unit:'łyżka'};  "1 cup flour" → {Mąka, 240 ml};
 * "Mąka — 1000 g — 100%" → {Mąka, 1000 g, percent 100}.  Zwraca null dla pustej linii.
 */
export function parseIngredientLine(raw) {
  let line = String(raw || '').replace(BULLET, '').replace(/\s+/g, ' ').trim();
  if (!line) return null;
  const ing = blankIngredient({ unit: '', amount: null });
  const warn = [];

  // procent na końcu (…— 100%)
  const pm = line.match(/[\s—–|:-]+(\d+(?:[.,]\d+)?)\s*%\s*$/);
  if (pm && line.replace(pm[0], '').trim()) { ing.percent = parseNum(pm[1]); line = line.replace(pm[0], '').trim(); }

  // separatory "nazwa — ilość jednostka"
  const dash = line.split(/\s+[—–|]\s+|\t+/);
  let namePart = line, qtyPart = '';
  if (dash.length >= 2) { namePart = dash[0]; qtyPart = dash.slice(1).join(' '); }

  const lead = new RegExp('^(' + QTY_RX + ')(?:\\s*[-–]\\s*(' + QTY_RX + '))?\\s*([^\\s\\d].*)?$');
  const trail = new RegExp('^(.*?)[\\s:,–—-]+(' + QTY_RX + ')(?:\\s*[-–]\\s*' + QTY_RX + ')?\\s*([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż.]+)?\\s*$');
  let amount = null, unitTok = '', rest = '';

  const take = (m, nameFirst) => {
    if (nameFirst) { rest = m[1]; amount = parseNum(m[2]); unitTok = m[3] || ''; }
    else {
      amount = parseNum(m[1]);
      if (m[2]) warn.push(`zakres ${m[1]}–${m[2]}: przyjęto ${m[1]}`);
      rest = (m[3] || '').trim();
    }
  };
  let m;
  const src = qtyPart ? qtyPart : line;
  if ((m = src.match(lead))) {
    take(m, false);
    // jednostka = pierwszy token reszty (lub sklejona "500g")
    const tok = rest.split(/\s+/)[0] || '';
    if (matchUnit(tok)) { unitTok = tok; rest = rest.slice(tok.length).trim(); }
    if (qtyPart) { rest = namePart + (rest ? ' ' + rest : ''); }
  } else if ((m = line.match(/^(\d+(?:[.,]\d+)?)([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+)\s+(.+)$/)) && matchUnit(m[2])) {
    amount = parseNum(m[1]); unitTok = m[2]; rest = m[3];
  } else if ((m = line.match(trail)) && (m[3] ? matchUnit(m[3]) : true) && m[1].trim()) {
    take(m, true); if (unitTok && !matchUnit(unitTok)) { rest += ' ' + unitTok; unitTok = ''; }
  } else {
    rest = line;
  }

  // "1 cup of flour", "2 łyżki z oliwą" → wytnij of/z
  rest = rest.replace(/^(of|von|di|de|d'|z|ze)\s+/i, '');

  const u = unitTok ? matchUnit(unitTok) : null;
  if (u) {
    ing.unit = u.unit;
    if (amount != null) amount *= u.mult;
    if (u.tag) rest = rest ? `${rest} (${u.tag})` : u.tag;
  } else if (amount != null) {
    ing.unit = 'szt.';
  }
  if (amount != null && ing.unit === 'g' && amount >= 1000 && Number.isInteger(amount / 1000) === false) amount = Math.round(amount);
  if (amount != null && (ing.unit === 'g' || ing.unit === 'ml')) amount = Math.round(amount * 10) / 10;
  ing.amount = amount;

  // nazwa + notatki
  const { name, notes } = splitPrepNote(rest || namePart);
  let finalName = translateName(name);
  const tasteRx = /^(do smaku|to taste|nach geschmack|au go[uû]t|q\.?b\.?)$/i;
  const nn = notes.filter((n) => { if (tasteRx.test(n)) { return false; } return true; });
  const taste = notes.some((n) => tasteRx.test(n)) || /\bdo smaku\b|\bto taste\b/i.test(rest);
  finalName = finalName.replace(/\s*(do smaku|to taste)\s*$/i, '').trim();
  if (nn.length) finalName += ` (${nn.join(', ')})`;
  ing.name = finalName || capFirst(line);
  if (amount == null && taste) { ing.unit = ''; ing.name += ' (do smaku)'; }
  ing._warn = warn;
  return ing;
}

/* ---------- Sekcje i kroki ---------- */

function isSectionLine(l) {
  if (/^\[.+\]$/.test(l)) return l.slice(1, -1).trim();
  if (/^(dla|do|na|for|pour|per)\s+.{2,40}:?$/i.test(l) && !/\d/.test(l) && l.length < 45) return l.replace(/:$/, '');
  if (/^[^\d•\-*].{1,40}:$/.test(l) && !/\d/.test(l) && !/[,.;]/.test(l.slice(0, -1))) return l.slice(0, -1).trim();
  const letters = l.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '');
  if (letters.length >= 3 && l.length <= 40 && l === l.toUpperCase() && !/\d/.test(l)) return l.trim();
  return null;
}

const STEP_NUM = /^(?:krok|step|schritt|[ée]tape|passo)?\s*\d{1,2}\s*[.):\-–]\s*/i;
export const cleanStep = (l) => convertTemps(l.replace(BULLET, '').replace(STEP_NUM, '').trim());

function splitSentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
  const out = []; let cur = '';
  for (const p of parts) {
    if ((cur + p).length > 230 && cur) { out.push(cur.trim()); cur = p; } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ---------- JSON-LD (schema.org/Recipe) ---------- */

function findRecipeLD(text) {
  const blocks = [...text.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  if (!blocks.length && /^\s*[[{]/.test(text) && /"@type"/.test(text)) blocks.push(text);
  const isRecipe = (o) => o && (o['@type'] === 'Recipe' || (Array.isArray(o['@type']) && o['@type'].includes('Recipe')));
  const walk = (o) => {
    if (!o || typeof o !== 'object') return null;
    if (isRecipe(o)) return o;
    if (Array.isArray(o)) { for (const x of o) { const r = walk(x); if (r) return r; } return null; }
    if (o['@graph']) return walk(o['@graph']);
    return null;
  };
  for (const b of blocks) { try { const r = walk(JSON.parse(b.trim())); if (r) return r; } catch (_) { /* dalej */ } }
  return null;
}

const decodeHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();

function fromLD(ld, r, issues) {
  r.name = decodeHtml(ld.name);
  r.description = decodeHtml(ld.description).slice(0, 600);
  const sec = blankSection('');
  (ld.recipeIngredient || ld.ingredients || []).forEach((l) => { const i = parseIngredientLine(decodeHtml(l)); if (i) sec.ingredients.push(i); });
  r.sections = [sec];
  const steps = [];
  const walk = (x) => {
    if (!x) return;
    if (typeof x === 'string') { decodeHtml(x).split(/\n+/).forEach((t) => t && steps.push(t)); return; }
    if (Array.isArray(x)) return x.forEach(walk);
    if (x['@type'] === 'HowToSection') return walk(x.itemListElement);
    if (x.text) steps.push(decodeHtml(x.text)); else if (x.name) steps.push(decodeHtml(x.name));
  };
  walk(ld.recipeInstructions);
  r.steps = steps.map((t) => blankStep(cleanStep(t)));
  r.prepTime = parseDuration(ld.prepTime); r.cookTime = parseDuration(ld.cookTime);
  if (!r.prepTime && !r.cookTime && ld.totalTime) r.cookTime = parseDuration(ld.totalTime);
  const y = Array.isArray(ld.recipeYield) ? ld.recipeYield[0] : ld.recipeYield;
  const yn = parseNum(String(y || '').match(/\d+/)?.[0]);
  if (yn) r.servings = yn;
  if (ld.url && !r.sourceUrl) r.sourceUrl = String(ld.url);
  if (ld.author) { const a = Array.isArray(ld.author) ? ld.author[0] : ld.author; r.source = decodeHtml(a && a.name ? a.name : a); }
  const kw = ld.keywords ? String(ld.keywords).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6) : [];
  r.tags = kw;
  if (!r.steps.length) issues.push('Nie znaleziono kroków przygotowania.');
}

/* ---------- Kategoria z treści ---------- */

const CAT_RX = [
  ['cat-pizza', /pizz|focacc|calzone/], ['cat-pasta', /spaghetti|makaron|pasta|penne|tagliatelle|lasagn|gnocchi|carbonara|ravioli|risotto/],
  ['cat-zupy', /\bzup|rosół|rosol|krem z|soup|bulion/], ['cat-salatki', /sałatk|salatk|salad/], ['cat-desery', /deser|tort\b|ciast[ok]|ciasto na|sernik|brownie|tiramisu|cake|cookie|dessert|mus |krem /],
  ['cat-pieczywo', /chleb|bułk|bulk|bread|bagiet|rolls?\b|croissant/], ['cat-ryby', /ryb|łosoś|losos|dorsz|tuńczyk|salmon|cod\b|fish|pstrąg/],
  ['cat-owoce-morza', /krewet|małż|malz|ośmiorn|kalmar|shrimp|prawn|mussel|seafood|octopus/], ['cat-cocktaile', /cocktail|koktajl|drink|spritz|negroni|mojito/],
  ['cat-sosy-bazowe', /sos bazowy|demi|beszamel|bechamel|velout|fond/], ['cat-sosy', /\bsos\b|sauce|salsa|dressing|pesto|vinaigrette/],
  ['cat-mieso', /kurczak|wołow|wieprz|schab|stek|steak|chicken|beef|pork|lamb|jagni|kotlet|mięs|mies|burger/], ['cat-warzywa', /warzyw|vegetable|cukini|bakłażan|ratatouille|zapiekan/],
];
export function guessCategory(text) {
  const t = norm(text);
  for (const [id, rx] of CAT_RX) if (rx.test(t)) return id;
  return 'cat-inne';
}

/* ---------- Główny parser ---------- */

/**
 * parseRecipeText(text, {url}) → { recipe, issues[], stats }
 * `issues` to lista rzeczy, których nie udało się rozpoznać (pokazywana w formularzu).
 */
export function parseRecipeText(text, { url = '' } = {}) {
  const issues = [];
  const r = blankRecipe({ servings: 4, sourceUrl: url || '' });
  const raw = String(text || '').replace(/\r/g, '');

  const ld = findRecipeLD(raw);
  if (ld) {
    fromLD(ld, r, issues);
  } else {
    const lines = convertTemps(raw).split('\n').map((l) => l.replace(/\u00a0/g, ' ').trim()).filter(Boolean);
    let mode = 'title'; // title → (ingredients|steps|notes)
    let sec = null;
    const sections = [];
    const steps = [];
    const notes = [];
    const pending = [];
    let sawHeading = false;

    const headKind = (l) => {
      const bare = l.replace(/[:：]\s*$/, '').trim();
      if (bare.length > 40) return null;
      for (const k of ['ingredients', 'steps', 'notes']) if (HEAD[k].test(bare) && bare.split(/\s+/).length <= 4) return k;
      return null;
    };

    // meta w liniach
    const meta = (l) => {
      let m;
      if ((m = l.match(/^(?:liczba porcji|porcje|porcji|ilość porcji|servings?|serves|yield|makes|portions?|ergibt|portionen|dla)\s*[:\-–]?\s*(\d+)/i)) ||
          (m = l.match(/^(\d+)\s*(?:porcji|porcje|osób|osoby|servings?|portions?)\b/i))) { r.servings = +m[1]; return true; }
      if ((m = l.match(/^(?:czas przygotowania|przygotowanie|prep(?:aration)?(?: time)?)\s*[:\-–]\s*(.+)$/i))) { r.prepTime = parseDuration(m[1]); return true; }
      if ((m = l.match(/^(?:czas gotowania|czas pieczenia|gotowanie|pieczenie|cook(?:ing)?(?: time)?|bake time|total time|czas całkowity)\s*[:\-–]\s*(.+)$/i))) { r.cookTime = parseDuration(m[1]); return true; }
      if ((m = l.match(/^(?:fermentacja|wyrastanie|czas fermentacji|proof(?:ing)?|rise|rest(?:ing)?(?: time)?|marynowanie)\s*[:\-–]\s*(.+)$/i))) { r.fermentTime = parseDuration(m[1]); return true; }
      if ((m = l.match(/^(?:temperatura|temp\.?|temperature|oven)\s*[:\-–]?\s*(\d{2,3})\s*(?:°|stopni)?\s*([CF])?/i))) { r.temperature = m[2] && m[2].toUpperCase() === 'F' ? `${fToC(+m[1])} °C` : `${m[1]} °C`; return true; }
      return false;
    };

    for (const l of lines) {
      const k = headKind(l);
      if (k) { mode = k; sawHeading = true; continue; }
      if (meta(l)) continue;
      if (mode === 'title') {
        if (!r.name && l.length <= 90 && !/^\d/.test(l)) { r.name = l.replace(BULLET, '').replace(/[:：]\s*$/, ''); continue; }
        pending.push(l); continue;
      }
      if (mode === 'ingredients') {
        const s = isSectionLine(l);
        if (s && !/^\d/.test(l)) { sec = blankSection(capFirst(s.toLowerCase() === s || s === s.toUpperCase() ? s.toUpperCase() : s)); sections.push(sec); continue; }
        const ing = parseIngredientLine(l);
        if (ing) { if (!sec) { sec = blankSection(''); sections.push(sec); } sec.ingredients.push(ing); }
      } else if (mode === 'steps') steps.push(l);
      else notes.push(l);
    }

    // Brak nagłówków → klasyfikuj linie heurystycznie.
    if (!sawHeading) {
      const rest = pending.length ? pending : lines.slice(r.name ? 1 : 0);
      const ingRx = new RegExp('^(' + QTY_RX + ')\\s*\\S|^[•●▪*-]\\s*\\S|\\s[-–—:]\\s*' + QTY_RX + '\\s*(g|kg|ml|l|szt)\\b', 'i');
      let curSec = null;
      rest.forEach((l) => {
        if (meta(l)) return;
        const sLine = isSectionLine(l);
        const isStep = STEP_NUM.test(l) || l.length > 70 || /[.!?]$/.test(l);
        if (!isStep && (ingRx.test(l) || l.length <= 45)) {
          if (sLine && !/^\d/.test(l)) { curSec = blankSection(sLine); sections.push(curSec); return; }
          const ing = parseIngredientLine(l);
          if (ing) { if (!curSec) { curSec = blankSection(''); sections.push(curSec); } curSec.ingredients.push(ing); }
        } else steps.push(l);
      });
      if (sections.length) issues.push('Brak nagłówków „Składniki / Przygotowanie” — podział linii jest zgadywany, sprawdź go.');
    }

    r.sections = sections.length ? sections : [blankSection('')];
    // Kroki: jeden długi akapit → zdania
    let stepTexts = steps;
    if (steps.length === 1 && steps[0].length > 300) stepTexts = splitSentences(steps[0]);
    r.steps = stepTexts.map((t) => blankStep(cleanStep(t))).filter((s) => s.text);
    if (notes.length) r.notes = notes.join('\n');

    // Temperatura z kroków, jeśli nie podano
    if (!r.temperature) {
      const t = r.steps.map((s) => s.text).join(' ').match(/(\d{2,3})\s*°\s*C\b/);
      if (t) r.temperature = `${t[1]} °C`;
    }
  }

  r.sections = r.sections.filter((s, i) => s.ingredients.length || s.name || i === 0);
  r.sections.forEach((s) => s.ingredients.forEach((i) => { delete i._warn; }));
  const nIng = r.sections.reduce((n, s) => n + s.ingredients.length, 0);
  if (!r.name) issues.push('Nie rozpoznano nazwy — wpisz ją ręcznie.');
  if (!nIng) issues.push('Nie rozpoznano składników.');
  if (!r.steps.length) issues.push('Nie rozpoznano kroków przygotowania.');
  if (!/(porcj|serv|osób|yield|makes|portion)/i.test(raw) && !ld) issues.push('Nie znaleziono liczby porcji — ustawiono 4.');
  const unitless = r.sections.flatMap((s) => s.ingredients).filter((i) => i.amount == null && !/do smaku/i.test(i.name)).length;
  if (unitless) issues.push(`${unitless} składników bez ilości — uzupełnij w formularzu.`);
  r.category = guessCategory(`${r.name} ${r.description}`);
  if (/[a-z]{4,}/i.test(raw.slice(0, 400)) && /\b(the|and|with|until|minutes|stir|add|mix|bake)\b/i.test(raw)) {
    issues.push('Tekst wygląda na obcojęzyczny: nazwy składników i jednostki zostały przetłumaczone, kroki przetłumacz np. w Google Tłumaczu (przycisk poniżej).');
  }
  if (url) r.source = r.source || hostOf(url);
  return { recipe: r, issues, stats: { ingredients: nIng, steps: r.steps.length, sections: r.sections.length } };
}

export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }
export const looksLikeUrl = (s) => /^https?:\/\/\S+$/i.test(String(s).trim());
export { DEFAULT_CATEGORIES, fmtNum };
