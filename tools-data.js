/* ==========================================================================
   tools-data.js — dane referencyjne do narzędzi kuchennych.
   Wartości orientacyjne (praktyka kuchenna / zalecenia USDA) — dostosuj do
   własnego sprzętu i produktów.
   ========================================================================== */

/* Masa (g) i objętość (ml). */
export const MASS_UNITS = [['g', 'g', 1], ['kg', 'kg', 1000], ['oz', 'uncja (oz)', 28.3495], ['lb', 'funt (lb)', 453.592]];
export const VOL_UNITS = [
  ['ml', 'ml', 1], ['l', 'l', 1000], ['tsp', 'łyżeczka (5 ml)', 5], ['tbsp', 'łyżka (15 ml)', 15],
  ['szkl', 'szklanka PL (250 ml)', 250], ['cup', 'cup US (236,6 ml)', 236.588], ['floz', 'fl oz US (29,6 ml)', 29.5735], ['pt', 'pint US (473 ml)', 473.176],
];

/* Gęstość: g na 1 ml. */
export const DENSITY = [
  ['Woda / mleko', 1.0], ['Mąka pszenna', 0.53], ['Mąka żytnia', 0.5], ['Cukier kryształ', 0.85], ['Cukier puder', 0.5], ['Cukier brązowy (ubity)', 0.9],
  ['Masło', 0.95], ['Olej / oliwa', 0.92], ['Miód', 1.42], ['Śmietana 30%', 1.0], ['Jogurt', 1.03], ['Ryż (surowy)', 0.78], ['Kasza (surowa)', 0.75],
  ['Płatki owsiane', 0.38], ['Kakao', 0.35], ['Sól drobna', 1.2], ['Bułka tarta', 0.45], ['Mielone migdały', 0.4], ['Orzechy włoskie (posiekane)', 0.42],
  ['Proszek do pieczenia', 0.9], ['Drożdże instant', 0.6], ['Ser parmezan (starty)', 0.4], ['Czekolada (posiekana)', 0.6],
];

/* Temperatury wewnętrzne (°C). `pull` = wyjmij z ognia, `rest` = po odpoczynku (dojście do temperatury). */
export const DONENESS = [
  { group: 'Wołowina i jagnięcina (stek, polędwica)', rows: [
    ['Rare (krwisty)', 48, 52, 'Środek czerwony, chłodny'], ['Medium rare', 52, 56, 'Środek różowo-czerwony — najpopularniejszy'],
    ['Medium', 57, 62, 'Różowy, soczysty'], ['Medium well', 63, 67, 'Lekko różowy'], ['Well done', 68, 72, 'Brązowy, ścisły'] ] },
  { group: 'Wieprzowina', rows: [
    ['Schab / polędwiczka (soczysty)', 60, 63, 'Bezpieczny wg USDA od 63 °C + 3 min odpoczynku'], ['Karkówka / łopatka do krojenia', 72, 78, ''], ['Szarpana (pulled pork)', 90, 95, 'Kolagen musi się rozpuścić'], ['Żeberka', 90, 95, 'Mięso schodzi z kości'] ] },
  { group: 'Drób', rows: [
    ['Pierś kurczaka / indyka', 72, 74, 'Bezpiecznie od 74 °C (można 65 °C dłużej)'], ['Udka i podudzia', 80, 85, 'Wyższa temp. = bardziej kruche'], ['Pierś z kaczki (różowa)', 54, 57, 'Skórka chrupiąca, środek różowy'], ['Mięso mielone', 71, 74, 'Zawsze dobrze wysmażone'] ] },
  { group: 'Ryby', rows: [
    ['Łosoś (miękki, „glassy”)', 48, 52, 'Środek półprzejrzysty'], ['Łosoś / pstrąg (wypieczony)', 56, 60, ''], ['Dorsz, morszczuk, sandacz', 56, 60, 'Płatki łatwo się rozdzielają'], ['Tuńczyk (rzadki)', 40, 48, 'Tylko ryby klasy sushi'] ] },
  { group: 'Inne', rows: [
    ['Jajko w kąpieli 63 °C (sous-vide)', 63, 63, '45–60 min, białko miękkie'], ['Chleb pszenny (środek)', 94, 98, 'Gotowy, gdy dźwięczny przy opukaniu'], ['Pieczeń z indyka (cała)', 74, 77, 'W najgrubszym miejscu uda'], ['Sos hollandaise (bezpieczny)', 62, 65, 'Nie przekraczaj 70 °C'] ] },
];

/* Czasy gotowania: [produkt, minuty, uwagi, wskazówka dla minutnika (min)] */
export const COOK_TIMES = [
  ['Jajko na miękko (M, z lodówki)', 6, 'wrzątek, potem zimna woda', 6], ['Jajko „kremowy żółtek”', 7.5, 'wrzątek, potem zimna woda', 7.5], ['Jajko na twardo', 10, 'wrzątek, potem zimna woda', 10],
  ['Spaghetti', 10, 'wg opakowania, al dente −1 min', 10], ['Penne / rigatoni', 12, 'wg opakowania', 12], ['Makaron świeży', 3, 'ok. 2–4 min', 3], ['Gnocchi', 2, 'do wypłynięcia', 2],
  ['Ryż basmati', 11, '+ 5–10 min parowania pod przykryciem', 11], ['Ryż jaśminowy', 15, 'woda 1:1,5', 15], ['Kasza jaglana', 18, 'woda 1:2', 18], ['Kasza gryczana', 15, 'woda 1:2', 15], ['Komosa ryżowa', 15, 'woda 1:2', 15],
  ['Ziemniaki całe', 25, 'od wrzenia, średniej wielkości', 25], ['Ziemniaki w kostce 2 cm', 12, 'od wrzenia', 12], ['Brokuł (różyczki)', 4, 'al dente', 4], ['Szparagi', 4, 'cienkie 2–3 min', 4], ['Fasolka szparagowa', 5, '', 5], ['Marchew w plasterkach', 8, '', 8],
  ['Buraki całe', 50, 'zależnie od wielkości', 50], ['Soczewica czerwona', 12, 'rozgotowuje się — na zupy', 12], ['Ciecierzyca (namoczona)', 60, 'z puszki — tylko podgrzać', 60],
  ['Stek 2,5 cm — medium rare', 6, '3 min z każdej strony + 5 min odpoczynku', 3], ['Pierś kurczaka (patelnia)', 12, '5–6 min z każdej strony', 6], ['Łosoś — patelnia', 7, '4 min skórą do dołu, 2–3 min z drugiej', 4],
  ['Kotlet schabowy', 7, '3–4 min z każdej strony', 4], ['Pieczony kurczak cały (1,5 kg)', 75, '200 °C, potem 10 min odpoczynku', 75], ['Pizza domowa w piekarniku', 8, '250 °C na rozgrzanym kamieniu', 8],
];

/* Zamienniki: [składnik, zamiennik (ilość), uwagi] */
export const SUBSTITUTES = [
  ['Jajko (1 szt. w wypiekach)', '1 łyżka mielonego siemienia lub chia + 3 łyżki wody (odstaw 5 min)', 'Wiąże, nie spulchnia. Alternatywa: ¼ szklanki puree z jabłka lub ½ banana.'],
  ['Masło', 'Margaryna 1:1 · olej ¾ ilości masła · oliwa ¾', 'W kruchych ciastach tłuszcz stały daje lepszą strukturę.'],
  ['Śmietana kwaśna', 'Jogurt grecki 1:1', 'Do zup dodaj po zahartowaniu, żeby się nie zważył.'],
  ['Maślanka (1 szklanka)', '1 szklanka mleka + 1 łyżka soku z cytryny lub octu (odstaw 10 min)', ''],
  ['Mleko', 'Napój roślinny (owsiany, sojowy) 1:1', 'Do bechamelu najlepiej sojowy lub owsiany.'],
  ['Śmietana 30% (do gotowania)', 'Mleko kokosowe 1:1 lub ¾ szklanki mleka + ¼ szklanki masła', 'Nie wejdzie do ubijania.'],
  ['Mascarpone', 'Serek śmietankowy + trochę śmietany 30% (ok. 3:1)', 'Do tiramisu — wyjdzie nieco bardziej kwaśne.'],
  ['Drożdże świeże (42 g kostka)', 'Suche: ×0,4 (ok. 17 g) · instant: ×0,33 (ok. 14 g)', 'Instant nie wymaga rozrabiania. Suche — rozpuść w letniej wodzie.'],
  ['Proszek do pieczenia (1 łyżeczka)', '¼ łyżeczki sody + ½ łyżeczki soku z cytryny lub octu', 'Wymieszaj tuż przed pieczeniem.'],
  ['Mąka pszenna typ 00', 'Mąka typ 550 (chlebowa/pizzowa) — nieco mocniejsza', 'Do pizzy dobra jest typ 550 lub 650.'],
  ['Cukier brązowy (1 szkl.)', '1 szklanka cukru białego + 1 łyżka melasy lub miodu', ''],
  ['Cukier puder', 'Cukier kryształ zmielony w młynku', 'Bez skrobi — lukier będzie ciężej stabilny.'],
  ['Miód', 'Syrop klonowy lub z agawy 1:1; cukier + 1/4 wody', ''],
  ['Bułka tarta', 'Panko · pokruszone płatki kukurydziane · tarte sucharki', 'Płatki dają najbardziej chrupiącą panierkę.'],
  ['Wino białe (do sosów)', 'Bulion + 1 łyżka octu lub soku z cytryny', ''],
  ['Wino czerwone (do sosów)', 'Bulion wołowy + 1 łyżka octu balsamicznego', ''],
  ['Pecorino romano', 'Parmigiano reggiano (łagodniejszy) · grana padano', 'Do carbonary i cacio e pepe pecorino jest bardziej wyrazisty.'],
  ['Guanciale', 'Pancetta · gruby boczek wędzony (sparzony)', 'Wędzony boczek zmienia smak — blanszuj 2 min.'],
  ['Czosnek świeży (1 ząbek)', '¼ łyżeczki granulowanego czosnku', ''],
  ['Zioła świeże', 'Suszone: ⅓ ilości', 'Bazylia i natka tracą większość aromatu po suszeniu.'],
  ['Ocet winny', 'Sok z cytryny 1:1 · ocet jabłkowy 1:1', ''],
  ['Sos sojowy', 'Sos tamari (bezglutenowy) · sól + odrobina wody i cukru', ''],
  ['Skrobia kukurydziana (zagęszczanie)', 'Skrobia ziemniaczana 1:1 · mąka ×2', 'Mąkę trzeba dłużej gotować.'],
  ['Żelatyna (6 g)', 'Agar-agar ok. ⅓ ilości (2 g)', 'Agar wymaga zagotowania i zastyga w temp. pokojowej.'],
  ['Passata pomidorowa', 'Pomidory z puszki zmiksowane · przecier + woda', ''],
];

/* Przelicznik mięsa na solanki: [nazwa, % soli, czas, uwagi] */
export const BRINES = [
  ['Kurczak cały / części', 5, '2–4 h (części 1–2 h)', 'Zanurz całkowicie, w lodówce.'],
  ['Pierś z kurczaka', 5, '30–60 min', 'Dłużej zrobi się „gąbczasta”.'],
  ['Schab / karkówka', 6, '4–8 h', 'Wypłucz i osusz przed smażeniem.'],
  ['Indyk (cały)', 5, '12–24 h', ''],
  ['Ryby (filety)', 4, '15–30 min', 'Bardzo krótko — ryba chłonie sól szybko.'],
  ['Krewetki', 4, '15–30 min', ''],
  ['Ogórki kiszone (zalewa)', 3, '3–7 dni (fermentacja)', 'Woda niechlorowana, sól niejodowana.'],
  ['Kapusta kiszona', 2, '1–2 tyg.', 'Sól: 2% wagi kapusty (sucha).'],
];

/* Formy do pieczenia — przeliczanie powierzchni. */
export const PAN_SHAPES = [['round', 'Okrągła (średnica)'], ['square', 'Kwadratowa (bok)'], ['rect', 'Prostokątna (a × b)']];
export const panArea = (shape, a, b) => {
  if (!(a > 0)) return 0;
  if (shape === 'round') return Math.PI * (a / 2) ** 2;
  if (shape === 'square') return a * a;
  return b > 0 ? a * b : 0;
};

/* Zakwas: typowe proporcje karmienia (zakwas : mąka : woda). */
export const STARTER_RATIOS = [['1:1:1', 1, 1, 1], ['1:2:2', 1, 2, 2], ['1:3:3', 1, 3, 3], ['1:5:5', 1, 5, 5], ['1:10:10', 1, 10, 10]];

/* Szybkie ściągi tekstowe. */
export const TIPS = [
  ['Sól do makaronu', '10 g soli na 1 litr wody (1%).'],
  ['Woda do makaronu', '1 litr wody na 100 g makaronu.'],
  ['Odpoczynek mięsa', 'Stek 5–10 min, pieczeń 15–20 min, cały drób 20–30 min — pod luźną folią.'],
  ['Temperatura oleju do smażenia', 'Kotlet 170–180 °C · frytki 170 / 190 °C · tempura 175 °C.'],
  ['Hydracja ciasta', 'Pizza 60–70% · chleb 65–80% · focaccia 75–85% · ciabatta 80–90%.'],
  ['Czosnek: siła smaku', 'Całe ząbki — łagodnie; pokrojone — mocniej; wyciśnięte — najostrzej.'],
  ['Cebula karmelizowana', '45–60 min na małym ogniu. Szybciej = podduszona, nie karmelizowana.'],
  ['Jajko — świeżość', 'Zanurz w wodzie: leży płasko = świeże, stoi = starsze, pływa = wyrzuć.'],
];
