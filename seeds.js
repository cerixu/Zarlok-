/* ==========================================================================
   seeds.js — przepisy startowe w kompaktowym formacie tekstowym.
   Każdy można edytować lub usunąć. Format:
     # Nazwa
     @ cat=pasta origin=IT trad servings=4 prep=10 cook=20 ferm=0 art=pasta tags=a,b temp=180_°C bakers
     : Opis jednozdaniowy
     ## SEKCJA            (opcjonalnie)
     400 g | Składnik      (ilość jednostka | nazwa; pusta ilość = „do smaku”)
     > Krok przygotowania
   ========================================================================== */
import { parseNum, norm } from './util.js';

const UNIT_RE = /^(g|kg|ml|l|szt\.|łyżeczka|łyżka|szczypta|porcja)$/;

export function parseSeeds(text, f) {
  const out = [];
  let cur = null, sec = null;
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const finish = () => {
    if (!cur) return;
    cur.sections = cur.sections.filter((s) => s.ingredients.length);
    if (!cur.sections.length) cur.sections = [f.blankSection('')];
    out.push(cur);
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# ')) {
      finish();
      const name = line.slice(2).trim();
      cur = f.blankRecipe({ id: 'rcp_seed_' + slug(name), name, sections: [], steps: [], source: 'Przepis przykładowy — edytuj lub usuń' });
      sec = null;
    } else if (!cur) continue;
    else if (line.startsWith('@ ')) {
      for (const m of line.slice(2).matchAll(/(\w+)(?:=("[^"]*"|\S+))?/g)) {
        const k = m[1], v = (m[2] || '').replace(/^"|"$/g, '').replace(/_/g, ' ');
        if (k === 'cat') cur.category = 'cat-' + v;
        else if (k === 'origin') cur.origin = v;
        else if (k === 'trad') cur.traditional = true;
        else if (k === 'bakers') cur.bakers = true;
        else if (k === 'servings') cur.servings = parseNum(v) || 4;
        else if (k === 'prep') cur.prepTime = +v || 0;
        else if (k === 'cook') cur.cookTime = +v || 0;
        else if (k === 'ferm') cur.fermentTime = +v || 0;
        else if (k === 'art') cur.art = v;
        else if (k === 'temp') cur.temperature = v;
        else if (k === 'tags') cur.tags = v.split(',').map((t) => t.trim()).filter(Boolean);
        else if (k === 'yield') { const mm = v.match(/^([\d.,]+)\s*(\S+)$/); if (mm) { cur.yieldAmount = parseNum(mm[1]); cur.yieldUnit = mm[2]; } }
      }
    } else if (line.startsWith(': ')) cur.description = line.slice(2).trim();
    else if (line.startsWith('## ')) { sec = f.blankSection(line.slice(3).trim()); cur.sections.push(sec); }
    else if (line.startsWith('> ')) cur.steps.push(f.blankStep(line.slice(2).trim()));
    else if (line.includes('|')) {
      if (!sec) { sec = f.blankSection(''); cur.sections.push(sec); }
      const [left, ...rest] = line.split('|');
      const name = rest.join('|').trim();
      const l = left.trim();
      let amount = null, unit = 'g';
      if (l) {
        const parts = l.split(/\s+/);
        const u = parts[parts.length - 1];
        if (parts.length > 1 && UNIT_RE.test(u)) { unit = u; amount = parseNum(parts.slice(0, -1).join(' ')); }
        else if (UNIT_RE.test(l)) { unit = l; amount = 1; }
        else amount = parseNum(l);
        if (!Number.isFinite(amount)) amount = null;
      }
      sec.ingredients.push(f.blankIngredient({ name, amount, unit }));
    }
  }
  finish();
  const now = Date.now();
  out.forEach((r) => { r.createdAt = now; r.updatedAt = now; });
  return out;
}

export const SEED_TEXT = `
# Rosół z kury
@ cat=zupy origin=PL trad servings=6 prep=20 cook=180 art=soup tags=zupa,polskie,niedziela
: Klarowny, złoty rosół gotowany długo na minimalnym ogniu.
1500 g | Kurczak (tuszka lub części rosołowe)
500 g | Wołowina na rosół (szponder lub mostek)
3 l | Woda zimna
3 szt. | Marchew
2 szt. | Pietruszka (korzeń)
150 g | Seler (kawałek)
1 szt. | Por (biała część)
1 szt. | Cebula opalona nad palnikiem
2 szt. | Liść laurowy
4 szt. | Ziele angielskie
1 łyżeczka | Pieprz czarny w ziarnach
1 szt. | Lubczyk (gałązka)
 | Sól
 | Natka pietruszki do podania
> Mięso opłucz i zalej zimną wodą. Powoli doprowadź do wrzenia, zbierając szumowiny.
> Cebulę przypal nad palnikiem do mocno brązowego koloru — da złotą barwę.
> Dodaj warzywa, liście laurowe, ziele angielskie i pieprz. Gotuj na najmniejszym ogniu 2,5–3 godziny bez przykrycia, nie mieszając.
> Na ostatnie 20 minut dodaj lubczyk. Posól dopiero na końcu.
> Przecedź przez gazę. Podawaj z makaronem, marchewką i natką.

# Żurek na zakwasie
@ cat=zupy origin=PL trad servings=5 prep=15 cook=50 art=soup tags=zupa,polskie,wielkanoc
: Kwaśna zupa na zakwasie z białą kiełbasą i jajkiem.
500 ml | Zakwas na żurek
1,5 l | Bulion lub woda
300 g | Biała kiełbasa
150 g | Boczek wędzony
300 g | Ziemniaki
1 szt. | Marchew
4 szt. | Czosnek (ząbki)
1 łyżeczka | Majeranek
2 szt. | Liść laurowy
3 szt. | Ziele angielskie
150 ml | Śmietana 18%
4 szt. | Jajka ugotowane na twardo
1 łyżka | Chrzan
 | Sól i pieprz
> Boczek pokrój w kostkę i podsmaż w garnku. Dodaj bulion, pokrojone ziemniaki, marchew, liście laurowe i ziele.
> Gotuj 20 minut. Dodaj kiełbasę i gotuj kolejne 15 minut.
> Zakwas wymieszaj ze śmietaną, wlej do zupy powoli, mieszając. Nie gotuj mocno, tylko podgrzej.
> Dopraw majerankiem, czosnkiem, chrzanem, solą i pieprzem. Podaj z jajkiem.

# Barszcz czerwony
@ cat=zupy origin=PL trad servings=6 prep=20 cook=60 art=soup tags=zupa,polskie,wigilia
: Rubinowy barszcz — nie gotuj buraków zbyt długo, żeby nie stracił koloru.
800 g | Buraki
2 l | Woda lub bulion warzywny
1 szt. | Marchew
1 szt. | Pietruszka (korzeń)
1 szt. | Cebula
2 szt. | Czosnek (ząbki)
2 szt. | Liść laurowy
3 szt. | Ziele angielskie
1 łyżeczka | Majeranek
2 łyżka | Sok z cytryny
1 łyżeczka | Cukier
 | Sól i pieprz
> Buraki obierz i zetrzyj na grubych oczkach lub pokrój w plastry.
> Zagotuj wodę z marchewką, pietruszką, cebulą, liściem i zielem; gotuj 30 minut.
> Dodaj buraki i gotuj na małym ogniu 15–20 minut — zupa nie może się gotować mocno.
> Przecedź, dopraw sokiem z cytryny, cukrem, majerankiem, czosnkiem, solą i pieprzem. Podaj z uszkami lub krokietem.

# Zupa pomidorowa
@ cat=zupy origin=PL trad servings=4 prep=10 cook=25 art=soup tags=zupa,polskie,szybkie
: Klasyczna pomidorowa na rosole z makaronem.
1,5 l | Rosół
500 ml | Passata pomidorowa
3 łyżka | Koncentrat pomidorowy
100 ml | Śmietana 18%
150 g | Makaron (nitki lub kokardki)
1 łyżeczka | Cukier
 | Sól i pieprz
 | Natka pietruszki
> Rosół zagotuj z passatą i koncentratem. Gotuj 15 minut.
> Dopraw solą, pieprzem i cukrem.
> Śmietanę zahartuj chochlą gorącej zupy i wlej do garnka. Podgrzej, nie gotuj.
> Makaron ugotuj osobno. Podaj z natką.

# Krem z dyni
@ cat=zupy servings=4 prep=15 cook=30 art=soup tags=zupa,jesień,wegańskie
: Aksamitny krem z dyni z imbirem i mlekiem kokosowym.
800 g | Dynia (hokkaido lub piżmowa)
1 szt. | Cebula
2 szt. | Czosnek (ząbki)
1 łyżka | Imbir świeży (starty)
700 ml | Bulion warzywny
200 ml | Mleko kokosowe
2 łyżka | Oliwa
 | Sól i pieprz
 | Pestki dyni do podania
> Cebulę i czosnek zeszklij na oliwie. Dodaj imbir i pokrojoną dynię.
> Zalej bulionem i gotuj 20 minut do miękkości.
> Dodaj mleko kokosowe i zmiksuj na gładki krem. Dopraw. Podaj z pestkami.

# Tom yum z krewetkami
@ cat=zupy origin=TH servings=2 prep=15 cook=15 art=soup tags=zupa,tajskie,ostre
: Kwaśno-ostra zupa tajska z trawą cytrynową i krewetkami.
800 ml | Bulion drobiowy lub rybny
2 szt. | Trawa cytrynowa (łodygi)
20 g | Galangal lub imbir
4 szt. | Liście limonki kaffir
200 g | Krewetki
150 g | Pieczarki
2 łyżka | Pasta tom yum
2 łyżka | Sos rybny
3 łyżka | Sok z limonki
2 szt. | Chili
 | Kolendra do podania
> Trawę rozgnieć i pokrój. Zagotuj bulion z trawą, galangalem, liśćmi limonki i pastą — 5 minut.
> Dodaj pieczarki i chili, gotuj 3 minuty. Dodaj krewetki na 2–3 minuty, aż się zarumienią.
> Zdejmij z ognia, dodaj sos rybny i sok z limonki. Podaj z kolendrą.

# Gazpacho
@ cat=zupy origin=ES servings=4 prep=20 art=soup tags=zupa,hiszpańskie,na zimno,wegańskie
: Zimna zupa z surowych warzyw — idealna w upał.
1000 g | Pomidory dojrzałe
200 g | Ogórek
150 g | Papryka czerwona
1 szt. | Czosnek (ząbek)
50 g | Cebula czerwona
60 ml | Oliwa extra vergine
2 łyżka | Ocet sherry
50 g | Chleb (bez skórki)
 | Sól
> Pomidory, ogórek i paprykę pokrój. Chleb namocz w odrobinie wody.
> Wszystko zmiksuj na gładką masę, wlewając oliwę cienkim strumieniem.
> Dopraw octem i solą. Przetrzyj przez sito, schłódź min. 2 godziny.

# Kotlet schabowy
@ cat=mieso origin=PL trad servings=4 prep=20 cook=12 temp=170–180_°C art=steak tags=obiad,polskie,smażone
: Soczysty schabowy w chrupiącej panierce.
600 g | Schab bez kości (4 plastry)
60 g | Mąka pszenna
2 szt. | Jajka
120 g | Bułka tarta
150 ml | Smalec lub olej do smażenia
 | Sól i pieprz
> Schab pokrój w plastry ok. 1,5 cm, rozbij na 7–8 mm, posól i popieprz.
> Obtocz kolejno w mące, rozbełtanych jajkach i bułce tartej, lekko dociskając.
> Smaż na rozgrzanym tłuszczu (170–180 °C) po 3–4 minuty z każdej strony na złoty kolor.
> Odsącz na ręczniku papierowym. Podawaj z ziemniakami i mizerią.

# Bigos staropolski
@ cat=mieso origin=PL trad servings=8 prep=30 cook=180 art=steak tags=obiad,polskie,na zimę
: Bigos jest najlepszy po kilku dniach — gotuj go etapami.
1000 g | Kapusta kiszona
500 g | Kapusta świeża
300 g | Kiełbasa wiejska
200 g | Boczek wędzony
400 g | Łopatka lub schab
2 szt. | Cebula
20 g | Grzyby suszone
6 szt. | Śliwki suszone
1 łyżka | Koncentrat pomidorowy
100 ml | Wino czerwone
3 szt. | Liść laurowy
4 szt. | Ziele angielskie
1 łyżeczka | Majeranek
 | Sól i pieprz
> Grzyby namocz. Kapustę kiszoną przepłucz, jeśli jest bardzo kwaśna, i pokrój.
> Boczek i mięso pokrój w kostkę, podsmaż z cebulą. Dodaj obie kapusty, grzyby z wodą, przyprawy i wino.
> Gotuj pod przykryciem 1,5–2 godziny, mieszając od czasu do czasu.
> Dodaj kiełbasę, śliwki i koncentrat. Gotuj jeszcze 1 godzinę. Najlepiej odstawić na noc i odgrzać następnego dnia.

# Gołąbki w sosie pomidorowym
@ cat=mieso origin=PL trad servings=6 prep=60 cook=90 temp=170_°C art=steak tags=obiad,polskie,piekarnik
: Gołąbki z mięsem i ryżem duszone w sosie pomidorowym.
1200 g | Kapusta biała (główka)
500 g | Mięso mielone wieprzowe
100 g | Ryż (surowy)
1 szt. | Cebula
1 szt. | Jajko
 | Sól i pieprz
## SOS
700 ml | Passata pomidorowa
300 ml | Bulion
1 łyżeczka | Cukier
> Wytnij głąb kapusty i sparz ją we wrzątku, zdejmując kolejne liście. Grube nerwy zetnij.
> Ryż ugotuj do połowy. Wymieszaj z mięsem, podsmażoną cebulą, jajkiem, solą i pieprzem.
> Na każdy liść połóż farsz, zawiń w kopertę. Układaj zakładką do dołu w brytfannie.
> Zalej sosem z passaty i bulionu. Piecz pod przykryciem 70 minut w 170 °C, potem 20 minut bez.

# Gulasz węgierski
@ cat=mieso origin=HU trad servings=6 prep=25 cook=150 art=steak tags=obiad,węgierskie,gulasz
: Wołowy gulasz z dużą ilością cebuli i papryki.
800 g | Wołowina (łopatka)
400 g | Cebula
2 łyżka | Papryka słodka mielona
2 szt. | Papryka czerwona
200 ml | Passata pomidorowa
3 szt. | Czosnek (ząbki)
3 łyżka | Smalec lub olej
1 łyżeczka | Kminek
500 ml | Bulion lub woda
 | Sól
> Cebulę drobno pokrój i duś na smalcu 15 minut do miękkości.
> Zdejmij z ognia, dodaj paprykę mieloną i szybko wymieszaj (nie przypal).
> Dodaj mięso w kostce, kminek, czosnek, passatę i bulion. Duś pod przykryciem 2 godziny.
> Pod koniec dodaj paprykę w paskach na 20 minut. Posól.

# Wiener Schnitzel
@ cat=mieso origin=AT trad servings=4 prep=25 cook=8 temp=160–170_°C art=steak tags=obiad,austriackie,smażone
: Cienki sznycel cielęcy w pękającej, „falującej” panierce.
600 g | Cielęcina (4 kotlety z udźca)
60 g | Mąka pszenna
2 szt. | Jajka
150 g | Bułka tarta
200 g | Masło klarowane
1 szt. | Cytryna
 | Sól
> Mięso rozbij bardzo cienko (3–4 mm), posól.
> Panieruj: mąka, jajka, bułka tarta — bułki nie dociskaj.
> Smaż w obfitym gorącym tłuszczu, potrząsając patelnią, aby panierka się „napuszyła” — po 1,5–2 minuty z każdej strony.
> Podaj z cytryną.

# Chili con carne
@ cat=mieso origin=US servings=6 prep=15 cook=75 art=steak tags=obiad,mielone,ostre
: Gęste chili z wołowiną i fasolą — lepsze następnego dnia.
600 g | Mięso mielone wołowe
1 szt. | Cebula
3 szt. | Czosnek (ząbki)
1 szt. | Papryka czerwona
400 g | Fasola czerwona z puszki (odsączona)
400 g | Pomidory pelati
2 łyżka | Koncentrat pomidorowy
2 łyżeczka | Kmin rzymski
1 łyżeczka | Papryka wędzona
1 łyżeczka | Chili w proszku
200 ml | Bulion
10 g | Czekolada gorzka
 | Sól
> Cebulę zeszklij, dodaj mięso i smaż, aż się zrumieni. Dodaj czosnek i przyprawy na minutę.
> Dodaj paprykę, koncentrat, pomidory i bulion. Gotuj pod przykryciem 45 minut.
> Dodaj fasolę i czekoladę, gotuj jeszcze 15 minut. Posól.

# Burger domowy
@ cat=mieso origin=US servings=4 prep=20 cook=10 art=burger tags=obiad,grill,szybkie
: Soczyste burgery z wołowiny z domowym sosem.
600 g | Mięso mielone wołowe (20% tłuszczu)
4 szt. | Bułki do burgerów
4 szt. | Plaster cheddara
1 szt. | Pomidor
4 szt. | Liście sałaty
0,5 szt. | Cebula czerwona
2 szt. | Ogórek kiszony
 | Sól i pieprz
## SOS
3 łyżka | Majonez
1 łyżka | Ketchup
1 łyżeczka | Musztarda
> Mięso podziel na 4 kulki po 150 g, spłaszcz na 2 cm, zrób wgłębienie na środku. Posól tuż przed smażeniem.
> Smaż na mocno rozgrzanej patelni lub grillu po 3–4 minuty z każdej strony; pod koniec połóż ser.
> Bułki podpiecz. Złóż: sos, sałata, mięso z serem, pomidor, cebula, ogórek.

# Kurczak tikka masala
@ cat=mieso origin=IN servings=4 prep=30 cook=40 art=steak tags=obiad,indyjskie,curry
: Kurczak w marynacie jogurtowej w kremowym sosie pomidorowym.
700 g | Udka kurczaka bez kości
## MARYNATA
150 g | Jogurt naturalny
2 łyżeczka | Garam masala
1 łyżeczka | Kurkuma
1 łyżeczka | Papryka mielona
3 szt. | Czosnek (ząbki)
1 łyżka | Imbir świeży (starty)
1 łyżka | Sok z cytryny
## SOS
2 szt. | Cebula
400 g | Pomidory pelati
150 ml | Śmietana 30%
40 g | Masło
2 łyżeczka | Garam masala
 | Sól
 | Kolendra
> Kurczaka pokrój w kostkę, wymieszaj z marynatą i odstaw na min. 2 godziny.
> Mięso zrumień na patelni lub w piekarniku (220 °C, 15 minut) i odłóż.
> Cebulę zeszklij na maśle, dodaj garam masalę i pomidory, gotuj 15 minut. Zmiksuj.
> Dodaj śmietanę i kurczaka, gotuj 10 minut. Posól, posyp kolendrą. Podaj z ryżem basmati.

# Coq au vin
@ cat=mieso origin=FR trad servings=4 prep=30 cook=90 art=steak tags=obiad,francuskie,duszone
: Kurczak duszony w czerwonym winie z boczkiem i pieczarkami.
1200 g | Udka kurczaka
150 g | Boczek wędzony
12 szt. | Cebulki perłowe lub szalotki
250 g | Pieczarki
3 szt. | Czosnek (ząbki)
500 ml | Wino czerwone
250 ml | Bulion drobiowy
1 łyżka | Koncentrat pomidorowy
3 szt. | Tymianek (gałązki)
2 łyżka | Mąka
30 g | Masło
 | Sól i pieprz
> Boczek podsmaż w garnku, odłóż. W tym tłuszczu zrumień posolone udka, odłóż.
> Zrumień cebulki i czosnek, oprósz mąką, dodaj koncentrat, wino i bulion. Zagotuj.
> Włóż kurczaka, boczek i tymianek. Duś pod przykryciem 50–60 minut.
> Pieczarki podsmaż na maśle i dodaj na ostatnie 10 minut. Zredukuj sos do gęstości.

# Pierogi ruskie
@ cat=inne origin=PL trad servings=6 prep=75 cook=10 art=dumpling yield=40_szt. tags=pierogi,polskie,wigilia
: Pierogi z farszem ziemniaczano-twarogowym z cebulą.
## CIASTO
500 g | Mąka pszenna
250 ml | Woda ciepła
2 łyżka | Olej
1 łyżeczka | Sól
## FARSZ
600 g | Ziemniaki
300 g | Twaróg półtłusty
2 szt. | Cebula
30 g | Masło
 | Sól i pieprz
> Ziemniaki ugotuj i przeciśnij przez praskę. Cebulę zeszklij na maśle. Wymieszaj z twarogiem, dopraw solą i pieprzem; ostudź.
> Z mąki, wody, oleju i soli zagnieć gładkie ciasto, odpocznij 20 minut.
> Rozwałkuj cienko, wykrawaj kółka, nakładaj farsz i dokładnie sklejaj brzegi.
> Gotuj we wrzątku 3–4 minuty od wypłynięcia. Podaj ze skwarkami lub cebulką.

# Naleśniki
@ cat=inne origin=PL servings=4 prep=10 cook=20 art=plate yield=10_szt. tags=śniadanie,słodkie,polskie
: Cienkie naleśniki — z dżemem, serem lub na wytrawnie.
250 g | Mąka pszenna
500 ml | Mleko
2 szt. | Jajka
100 ml | Woda gazowana
2 łyżka | Olej (+ do smażenia)
1 łyżka | Cukier
1 szczypta | Sól
> Wszystkie składniki zmiksuj na gładkie, rzadkie ciasto. Odstaw na 20 minut.
> Smaż na rozgrzanej, lekko natłuszczonej patelni po ok. 1 minucie z każdej strony.

# Placki ziemniaczane
@ cat=warzywa origin=PL trad servings=4 prep=15 cook=20 art=plate tags=obiad,polskie,smażone
: Chrupiące placki z dodatkiem cebuli.
1000 g | Ziemniaki
1 szt. | Cebula
1 szt. | Jajko
3 łyżka | Mąka pszenna
1 łyżeczka | Sól
150 ml | Olej do smażenia
 | Pieprz
> Ziemniaki i cebulę zetrzyj na tarce, odlej nadmiar wody.
> Dodaj jajko, mąkę, sól i pieprz, wymieszaj.
> Smaż porcje na gorącym oleju po 3–4 minuty z każdej strony. Podaj ze śmietaną lub gulaszem.

# Szakszuka
@ cat=inne origin=IL servings=3 prep=10 cook=25 art=eggs tags=śniadanie,jajka,ostre
: Jajka pochowane w pikantnym sosie z pomidorów i papryki.
4 szt. | Jajka
400 g | Pomidory pelati
1 szt. | Cebula
1 szt. | Papryka czerwona
3 szt. | Czosnek (ząbki)
1 łyżeczka | Papryka wędzona
1 łyżeczka | Kmin rzymski
3 łyżka | Oliwa
80 g | Feta
 | Natka pietruszki
 | Sól
> Cebulę i paprykę zeszklij na oliwie, dodaj czosnek i przyprawy.
> Dodaj pomidory i gotuj 10 minut, aż sos zgęstnieje. Posól.
> Zrób wgłębienia i wbij jajka. Przykryj i gotuj 5–7 minut, aż białka się zetną. Posyp fetą i natką.

# Tortilla española
@ cat=inne origin=ES trad servings=4 prep=15 cook=30 art=eggs tags=hiszpańskie,jajka,tapas
: Hiszpańska tortilla ziemniaczana, soczysta w środku.
600 g | Ziemniaki
6 szt. | Jajka
150 g | Cebula
150 ml | Oliwa
1 łyżeczka | Sól
> Ziemniaki i cebulę pokrój w cienkie plastry, powoli smaż w oliwie 15 minut, aż będą miękkie.
> Odsącz, wymieszaj z roztrzepanymi jajkami i solą, odstaw na 5 minut.
> Smaż na patelni na małym ogniu 4–5 minut, odwróć na talerzu i smaż drugą stronę 3 minuty.

# Spaghetti aglio e olio
@ cat=pasta origin=IT trad servings=4 prep=5 cook=12 art=pasta tags=makaron,szybkie,wegańskie
: Najprostsza pasta — czosnek, oliwa, chili.
400 g | Spaghetti
5 szt. | Czosnek (ząbki)
80 ml | Oliwa extra vergine
1 szt. | Papryczka chili suszona
2 łyżka | Natka pietruszki
4 l | Woda do gotowania
30 g | Sól do wody
> Ugotuj spaghetti al dente w osolonej wodzie (ok. 10 minut). Zachowaj 150 ml wody z gotowania.
> Czosnek pokrój w plasterki i powoli podgrzewaj w oliwie z chili, aż lekko się zezłoci.
> Dodaj makaron i trochę wody, wymieszaj energicznie, aż powstanie emulsja. Dodaj natkę.

# Cacio e pepe
@ cat=pasta origin=IT trad servings=4 prep=5 cook=12 art=pasta tags=makaron,rzymskie,sery
: Rzymski klasyk z trzema składnikami: makaron, pecorino, pieprz.
400 g | Tonnarelli lub spaghetti
200 g | Pecorino romano (drobno starte)
2 łyżeczka | Pieprz czarny (świeżo mielony)
3 l | Woda do gotowania
10 g | Sól do wody
> Pieprz praż na suchej patelni 1 minutę. Makaron gotuj 9 minut w mniejszej ilości wody — ma być skrobiowa.
> Dodaj do pieprzu chochlę wody z makaronu i niedogotowany makaron.
> Zdejmij z ognia, dodaj pecorino wymieszane z odrobiną wody na krem, energicznie mieszaj.

# Lasagne alla bolognese
@ cat=pasta origin=IT trad servings=8 prep=45 cook=180 temp=180_°C art=pasta tags=makaron,piekarnik,włoskie
: Lasagne z długo duszonym ragù i beszamelem.
## RAGÙ
400 g | Mięso mielone wołowe
200 g | Mięso mielone wieprzowe
80 g | Pancetta lub boczek
1 szt. | Cebula
1 szt. | Marchew
1 szt. | Seler naciowy (łodyga)
400 ml | Passata pomidorowa
100 ml | Wino czerwone
1 łyżka | Koncentrat pomidorowy
100 ml | Mleko
2 łyżka | Oliwa
## BESZAMEL
60 g | Masło
60 g | Mąka pszenna
800 ml | Mleko
1 szczypta | Gałka muszkatołowa
## SKŁADANIE
250 g | Płaty lasagne
100 g | Parmezan
> Warzywa drobno posiekaj i zeszklij na oliwie z pancettą. Dodaj mięso i smaż, aż się zrumieni.
> Dodaj wino, koncentrat i passatę. Gotuj 2,5 godziny na małym ogniu, na końcu dolej mleko.
> Z masła i mąki zrób zasmażkę, wlej ciepłe mleko, gotuj 8 minut. Dopraw gałką i solą.
> Układaj warstwy: sos, ragù, płaty, ragù, beszamel, parmezan. Piecz 35–40 minut w 180 °C. Odstaw na 15 minut.

# Pad thai z krewetkami
@ cat=pasta origin=TH servings=3 prep=20 cook=12 art=pasta tags=makaron,tajskie,wok
: Smażony makaron ryżowy z sosem tamaryndowym i orzeszkami.
250 g | Makaron ryżowy
250 g | Krewetki
2 szt. | Jajka
150 g | Kiełki fasoli
4 szt. | Szczypiorek (łodygi)
50 g | Orzeszki ziemne
3 szt. | Czosnek (ząbki)
3 łyżka | Olej
1 szt. | Limonka
## SOS
3 łyżka | Sos rybny
3 łyżka | Pasta tamaryndowa
2 łyżka | Cukier brązowy
> Makaron zalej gorącą wodą na 8–10 minut, odcedź. Sos wymieszaj.
> W woku na dużym ogniu smaż krewetki i czosnek, odłóż. Wbij jajka, mieszaj.
> Dodaj makaron i sos, smaż 2 minuty. Dodaj kiełki, szczypiorek i krewetki. Podaj z orzeszkami i limonką.

# Pesto genovese
@ cat=sosy origin=IT trad servings=4 prep=15 art=sauce yield=200_g tags=sos,włoskie,bazylia
: Prawdziwe pesto z mozdzerza lub blendera.
80 g | Bazylia świeża
30 g | Orzeszki piniowe
40 g | Parmezan
20 g | Pecorino
1 szt. | Czosnek (ząbek)
100 ml | Oliwa extra vergine
2 g | Sól gruba
> Składniki dobrze schłódź. Bazylię roztrzyj w moździerzu z czosnkiem i solą (lub krótko miksuj).
> Dodaj orzeszki, następnie sery i oliwę. Nie nagrzewaj — makaron mieszaj z pestem poza ogniem.

# Guacamole
@ cat=sosy origin=MX trad servings=4 prep=10 art=sauce tags=sos,meksykańskie,wegańskie
: Kremowe guacamole z limonką i kolendrą.
3 szt. | Awokado dojrzałe
1 szt. | Limonka
40 g | Cebula czerwona
1 szt. | Pomidor
2 łyżka | Kolendra
1 szt. | Jalapeño
 | Sól
> Awokado rozgnieć widelcem, zostawiając kawałki.
> Dodaj drobno posiekaną cebulę, pomidor bez gniazd, kolendrę i jalapeño. Dopraw sokiem z limonki i solą.

# Hummus
@ cat=sosy origin=LB servings=6 prep=15 art=sauce tags=sos,przekąska,wegańskie
: Gładki hummus z tahini.
400 g | Ciecierzyca ugotowana (odsączona)
80 g | Pasta tahini
50 ml | Sok z cytryny
1 szt. | Czosnek (ząbek)
60 ml | Woda lodowata
2 łyżka | Oliwa
0,5 łyżeczka | Kmin rzymski
 | Sól
> Tahini zmiksuj z sokiem z cytryny i czosnkiem na kremową masę.
> Dodaj ciecierzycę, kmin i sól, wlewaj lodowatą wodę, miksując 3–4 minuty. Podaj z oliwą.

# Tzatziki
@ cat=sosy origin=GR servings=4 prep=10 art=sauce tags=sos,greckie,jogurt
: Chłodny sos jogurtowy z ogórkiem i czosnkiem.
300 g | Jogurt grecki
200 g | Ogórek
2 szt. | Czosnek (ząbki)
1 łyżka | Oliwa
1 łyżka | Koperek
1 łyżeczka | Sok z cytryny
 | Sól
> Ogórek zetrzyj, mocno odciśnij z wody. Wymieszaj z resztą składników. Odstaw na 30 minut.

# Sos beszamel
@ cat=sosy-bazowe origin=FR trad servings=6 prep=5 cook=10 art=sauce yield=750_g tags=sos bazowy,francuskie
: Sos bazowy do lasagne, zapiekanek i krokietów.
50 g | Masło
50 g | Mąka pszenna
700 ml | Mleko (ciepłe)
1 szczypta | Gałka muszkatołowa
 | Sól
> Masło roztop, dodaj mąkę i smaż 1–2 minuty, mieszając.
> Wlewaj ciepłe mleko stopniowo, ciągle mieszając rózgą. Gotuj 8 minut do zgęstnienia. Dopraw.

# Sos holenderski
@ cat=sosy-bazowe origin=FR trad servings=4 prep=10 cook=10 art=sauce tags=sos bazowy,francuskie,jajka
: Emulsja z żółtek i klarowanego masła — do szparagów i jajek.
3 szt. | Żółtka
200 g | Masło klarowane (ciepłe)
1 łyżka | Sok z cytryny
1 łyżka | Woda
1 szczypta | Pieprz cayenne
 | Sól
> Żółtka z wodą ubijaj nad parą (kąpiel wodna, nie wrząca), aż zgęstnieją i potroją objętość.
> Zdejmij, cienkim strumieniem dodawaj ciepłe masło, ubijając. Dopraw cytryną, solą i cayenne.

# Majonez domowy
@ cat=sosy-bazowe servings=8 prep=10 art=sauce yield=300_g tags=sos bazowy,jajka
: Majonez na żółtkach — wszystkie składniki o temp. pokojowej.
2 szt. | Żółtka
1 łyżeczka | Musztarda
250 ml | Olej rzepakowy
1 łyżka | Sok z cytryny
 | Sól
> Żółtka zmiksuj z musztardą i solą. Olej dodawaj bardzo cienkim strumieniem, nieustannie miksując.
> Na końcu dodaj sok z cytryny.

# Vinaigrette
@ cat=sosy-bazowe origin=FR servings=4 prep=5 art=sauce tags=sos bazowy,sałatki,szybkie
: Proporcja 3:1 — oliwa do octu.
90 ml | Oliwa
30 ml | Ocet winny
1 łyżeczka | Musztarda dijon
1 łyżeczka | Miód
 | Sól i pieprz
> Wszystko energicznie wymieszaj lub wstrząśnij w słoiku, aż utworzy się emulsja.

# Bulion drobiowy (fond)
@ cat=prep servings=10 prep=15 cook=240 art=prep yield=2_l tags=baza,bulion
: Mocny bulion do zup i sosów, do zamrażania.
1500 g | Szkielety lub skrzydła kurczaka
3 l | Woda zimna
1 szt. | Cebula
2 szt. | Marchew
2 szt. | Seler naciowy (łodygi)
2 szt. | Liść laurowy
8 szt. | Pieprz w ziarnach
 | Natka pietruszki
> Kości opłucz, zalej zimną wodą, doprowadź do wrzenia i zbieraj szumowiny.
> Dodaj warzywa i przyprawy. Gotuj na bardzo małym ogniu 3–4 godziny. Przecedź i schłódź.

# Masło ziołowe
@ cat=prep servings=10 prep=10 art=prep yield=270_g tags=prep,masło,do steków
: Do steków, ryb i pieczywa; mrożone w rolce.
250 g | Masło (miękkie)
2 szt. | Czosnek (ząbki)
3 łyżka | Natka pietruszki
1 łyżeczka | Tymianek
1 łyżeczka | Sok z cytryny
 | Sól
> Wszystko dokładnie wymieszaj, zwiń w rolkę w folii i schłódź lub zamroź.

# Cebula karmelizowana
@ cat=prep servings=8 prep=15 cook=60 art=prep yield=300_g tags=prep,cebula
: Wolno smażona cebula do burgerów, tart i zup.
1000 g | Cebula (ok. 8 szt.)
40 g | Masło
2 łyżka | Oliwa
1 łyżeczka | Sól
1 łyżeczka | Cukier
> Cebulę pokrój w półplasterki. Smaż na maśle z oliwą na małym ogniu 45–60 minut, mieszając.
> Pod koniec dodaj sól i cukier. W razie potrzeby dolewaj łyżkę wody.

# Marynowana czerwona cebula
@ cat=prep servings=6 prep=10 art=prep yield=1_szt. tags=prep,pickle
: Szybkie pickle do tacos, burgerów i sałatek.
2 szt. | Cebula czerwona
150 ml | Ocet jabłkowy
150 ml | Woda
2 łyżka | Cukier
1 łyżeczka | Sól
> Cebulę pokrój w cienkie plastry. Zalej gorącą zalewą z octu, wody, cukru i soli. Odstaw na 30 minut.

# Łosoś pieczony z cytryną
@ cat=ryby servings=4 prep=10 cook=15 temp=200_°C art=fish tags=obiad,ryby,szybkie
: Soczysty łosoś z masłem, czosnkiem i koperkiem.
600 g | Filet z łososia (4 porcje)
40 g | Masło
1 szt. | Cytryna
2 szt. | Czosnek (ząbki)
2 łyżka | Koperek
2 łyżka | Oliwa
 | Sól i pieprz
> Piekarnik nagrzej do 200 °C. Łososia posól, popieprz, skrop oliwą.
> Połóż skórą do dołu, na wierzchu masło, czosnek, plasterki cytryny. Piecz 12–15 minut. Posyp koperkiem.

# Fish and chips
@ cat=ryby origin=GB trad servings=4 prep=30 cook=25 temp=180_°C art=fish tags=obiad,smażone,angielskie
: Ryba w kruchym cieście piwnym z grubymi frytkami.
600 g | Filet z dorsza
190 g | Mąka pszenna
200 ml | Piwo lager (zimne)
1 łyżeczka | Proszek do pieczenia
1000 g | Ziemniaki
1,5 l | Olej do smażenia
 | Sól
 | Ocet słodowy
> Frytki pokrój, namocz w wodzie 30 minut, osusz. Smaż 5 minut w 150 °C, odstaw, potem smaż w 190 °C na złoto.
> Z 150 g mąki, proszku, soli i zimnego piwa zrób ciasto. Rybę oprósz mąką, zanurz w cieście.
> Smaż w 180 °C 5–6 minut. Podaj z octem i frytkami.

# Gambas al ajillo
@ cat=owoce-morza origin=ES trad servings=3 prep=10 cook=6 art=shrimp tags=tapas,hiszpańskie,czosnek
: Krewetki skwierczące w oliwie z czosnkiem i chili.
400 g | Krewetki
100 ml | Oliwa
6 szt. | Czosnek (ząbki)
1 szt. | Chili
2 łyżka | Sherry
2 łyżka | Natka pietruszki
 | Sól
 | Chleb do podania
> Czosnek w plasterkach podgrzewaj w oliwie z chili. Dodaj krewetki, smaż 2 minuty z każdej strony.
> Dodaj sherry i natkę. Podawaj od razu z chlebem.

# Ratatouille
@ cat=warzywa origin=FR trad servings=4 prep=25 cook=50 art=veg tags=obiad,wegańskie,francuskie
: Duszone warzywa prowansalskie.
300 g | Bakłażan
400 g | Cukinia
2 szt. | Papryka
600 g | Pomidory
1 szt. | Cebula
3 szt. | Czosnek (ząbki)
5 łyżka | Oliwa
2 szt. | Tymianek (gałązki)
10 szt. | Liście bazylii
 | Sól
> Warzywa pokrój w kostkę i smaż osobno na oliwie do lekkiego zrumienienia.
> Cebulę i czosnek zeszklij, dodaj pomidory i tymianek, gotuj 10 minut.
> Dodaj pozostałe warzywa i duś 25 minut. Dopraw solą i bazylią.

# Mizeria
@ cat=salatki origin=PL trad servings=4 prep=10 art=salad tags=surówka,polskie,lato
: Chłodna surówka z ogórków ze śmietaną.
600 g | Ogórki
200 g | Śmietana 18%
2 łyżka | Koperek
1 łyżeczka | Sok z cytryny
1 szczypta | Cukier
 | Sól
> Ogórki pokrój cienko, posól, odstaw na 10 minut, odlej wodę. Wymieszaj ze śmietaną, koperkiem, cytryną i cukrem.

# Sernik klasyczny
@ cat=desery origin=PL trad servings=12 prep=30 cook=70 temp=170_°C art=cake tags=ciasto,polskie,wypiek
: Kremowy sernik na twarogu trzykrotnie mielonym (forma 24 cm).
## SPÓD
250 g | Herbatniki
100 g | Masło
## MASA
1000 g | Twaróg trzykrotnie mielony
200 g | Cukier
5 szt. | Jajka
125 g | Masło (miękkie)
40 g | Budyń waniliowy w proszku
> Herbatniki zmiel, wymieszaj z roztopionym masłem, wyłóż spód formy i podpiecz 10 minut.
> Masło utrzyj z cukrem, dodawaj po jednym jajku, potem twaróg i budyń. Wylej na spód.
> Piecz 60 minut w 170 °C, następnie zostaw w uchylonym piekarniku na 1 godzinę. Schłódź.

# Szarlotka
@ cat=desery origin=PL trad servings=12 prep=40 cook=50 temp=180_°C art=cake tags=ciasto,jabłka,polskie
: Kruche ciasto z kwaśnymi jabłkami i cynamonem.
## CIASTO
400 g | Mąka pszenna
200 g | Masło (zimne)
100 g | Cukier puder
3 szt. | Żółtka
2 łyżka | Śmietana
1 łyżeczka | Proszek do pieczenia
## NADZIENIE
1500 g | Jabłka kwaśne
2 łyżeczka | Cynamon
50 g | Cukier
3 łyżka | Bułka tarta
> Z mąki, masła, cukru pudru, żółtek, śmietany i proszku zagnieć kruche ciasto. Podziel na dwie części, schłódź 30 minut.
> Jabłka zetrzyj lub pokrój, podduś z cukrem i cynamonem. Dno ciasta posyp bułką tartą, wyłóż jabłka.
> Przykryj startym na tarce drugim kawałkiem ciasta. Piecz 45–50 minut w 180 °C.

# Tiramisu
@ cat=desery origin=IT trad servings=8 prep=30 art=cake tags=deser,włoskie,bez pieczenia
: Klasyczne tiramisu z mascarpone, kawą i savoiardi.
500 g | Mascarpone
4 szt. | Żółtka (świeże)
80 g | Cukier
200 g | Biszkopty savoiardi
300 ml | Espresso (ostudzone)
2 łyżka | Marsala lub amaretto
2 łyżka | Kakao
> Żółtka utrzyj z cukrem na jasną masę, dodaj mascarpone i wymieszaj.
> Biszkopty szybko zanurzaj w kawie z alkoholem, układaj warstwę w naczyniu, przykryj kremem. Powtórz.
> Posyp kakao. Schładzaj min. 6 godzin, najlepiej całą noc.

# Panna cotta z truskawkami
@ cat=desery origin=IT servings=6 prep=15 cook=10 art=cake tags=deser,śmietanka
: Delikatny deser z żelatyną i sosem truskawkowym.
500 ml | Śmietana 30%
100 ml | Mleko
60 g | Cukier
6 g | Żelatyna
1 szt. | Laska wanilii
## SOS
200 g | Truskawki
30 g | Cukier
> Żelatynę namocz w zimnej wodzie. Podgrzej śmietanę z mlekiem, cukrem i wanilią (nie gotuj).
> Dodaj odciśniętą żelatynę, rozpuść. Rozlej do foremek, schładzaj min. 4 godziny.
> Truskawki zmiksuj z cukrem na sos. Podaj z panna cottą.

# Brownie czekoladowe
@ cat=desery origin=US servings=16 prep=15 cook=25 temp=170_°C art=cake tags=ciasto,czekolada,wypiek
: Wilgotne, ciągnące brownie (forma 20 × 20 cm).
200 g | Czekolada gorzka
150 g | Masło
200 g | Cukier
3 szt. | Jajka
80 g | Mąka pszenna
20 g | Kakao
1 szczypta | Sól
80 g | Orzechy włoskie
> Czekoladę i masło rozpuść, lekko ostudź. Jajka ubij z cukrem, połącz z czekoladą.
> Dodaj mąkę, kakao, sól i orzechy. Piecz 22–25 minut w 170 °C — środek ma być lekko wilgotny.

# Crème brûlée
@ cat=desery origin=FR trad servings=6 prep=20 cook=40 temp=150_°C art=cake tags=deser,francuskie,waniliowe
: Waniliowy krem pod chrupiącą skorupką karmelu.
500 ml | Śmietana 30%
5 szt. | Żółtka
80 g | Cukier
1 szt. | Laska wanilii
6 łyżeczka | Cukier do karmelizowania
> Śmietanę zagrzej z wanilią. Żółtka utrzyj z cukrem, połącz powoli z gorącą śmietaną.
> Rozlej do kokilek, piecz w kąpieli wodnej 35–40 minut w 150 °C. Schłódź.
> Posyp cukrem i przypal palnikiem.

# Pancakes amerykańskie
@ cat=desery origin=US servings=4 prep=10 cook=15 art=cake yield=12_szt. tags=śniadanie,słodkie
: Puszyste placuszki na śniadanie.
250 g | Mąka pszenna
300 ml | Mleko
2 szt. | Jajka
30 g | Cukier
2 łyżeczka | Proszek do pieczenia
40 g | Masło roztopione
1 szczypta | Sól
> Suche składniki wymieszaj, dodaj mleko, jajka i masło. Nie mieszaj za długo — grudki są ok.
> Smaż porcje na suchej patelni po 2 minuty z każdej strony. Podaj z syropem i owocami.

# Focaccia
@ cat=pieczywo origin=IT trad bakers servings=8 prep=30 cook=25 ferm=720 temp=230_°C art=bread tags=chleb,włoskie,oliwa
: Wysokonawodnione ciasto, pieczone z oliwą i solą w płatkach.
500 g | Mąka pszenna chlebowa
400 g | Woda
12 g | Sól
3 g | Drożdże instant
40 ml | Oliwa (do ciasta)
40 ml | Oliwa (do formy i polania)
 | Sól w płatkach
 | Rozmaryn
> Wymieszaj mąkę, wodę, sól i drożdże; dodaj oliwę. Złóż ciasto kilkukrotnie co 30 minut (4 razy).
> Odstaw do lodówki na 8–12 godzin.
> Przełóż do natłuszczonej blachy, rozciągnij, odstaw na 1–2 godziny. Zrób palcami dołki, polej oliwą, posyp solą i rozmarynem.
> Piecz 20–25 minut w 230 °C.

# Chleb na zakwasie
@ cat=pieczywo bakers servings=10 prep=40 cook=45 ferm=900 temp=250_→_230_°C art=bread tags=chleb,zakwas
: Klasyczny bochenek pieczony w garnku (żeliwnym lub emaliowanym).
450 g | Mąka pszenna chlebowa
50 g | Mąka żytnia pełnoziarnista
375 g | Woda
100 g | Zakwas aktywny (100% nawodnienia)
10 g | Sól
> Wymieszaj mąkę z wodą, odstaw na 45 minut (autoliza). Dodaj zakwas i sól, zagnieć.
> Fermentuj 4–5 godzin w temperaturze pokojowej, składając ciasto co 45 minut.
> Uformuj bochenek, włóż do koszyka i schłódź 12–16 godzin w lodówce.
> Piecz w rozgrzanym garnku z pokrywą 20 minut w 250 °C, potem 25 minut w 230 °C bez pokrywy.

# Chleb pszenny na drożdżach
@ cat=pieczywo bakers servings=10 prep=30 cook=40 ferm=180 temp=230_°C art=bread tags=chleb,drożdże
: Prosty bochenek na co dzień.
500 g | Mąka pszenna chlebowa
330 g | Woda
10 g | Drożdże świeże
10 g | Sól
> Wymieszaj i wyrabiaj 10 minut. Wyrastaj 1,5 godziny pod przykryciem.
> Uformuj bochenek, odstaw na 1 godzinę. Nacięcia, piecz 35–40 minut w 230 °C z parą.

# Sałatka grecka
@ cat=salatki origin=GR trad servings=3 prep=10 art=salad tags=sałatka,greckie,wegetariańskie
: Pomidory, ogórek, feta i oliwki — bez sałaty.
4 szt. | Pomidory
1 szt. | Ogórek
1 szt. | Papryka zielona
0,5 szt. | Cebula czerwona
100 g | Oliwki kalamata
200 g | Feta
4 łyżka | Oliwa
1 łyżeczka | Oregano
1 łyżka | Ocet winny
> Warzywa pokrój w grubą kostkę. Dodaj oliwki, na wierzch całą kostkę fety. Skrop oliwą z octem, posyp oregano.

# Sałatka caprese
@ cat=salatki origin=IT trad servings=3 prep=10 art=salad tags=sałatka,włoskie,szybkie
: Trzy kolory włoskiej flagi na talerzu.
500 g | Pomidory
250 g | Mozzarella di bufala
12 szt. | Liście bazylii
3 łyżka | Oliwa extra vergine
 | Sól i pieprz
> Pomidory i mozzarellę pokrój w plastry, układaj naprzemiennie z bazylią. Skrop oliwą, posól.

# Sałatka Cezar
@ cat=salatki origin=US servings=3 prep=25 cook=15 art=salad tags=sałatka,kurczak
: Sałata rzymska z kurczakiem, grzankami i sosem Cezar.
2 szt. | Sałata rzymska
400 g | Pierś kurczaka
80 g | Grzanki
40 g | Parmezan
## SOS
1 szt. | Żółtko
1 szt. | Czosnek (ząbek)
3 szt. | Anchois (filety)
1 łyżeczka | Musztarda dijon
1 łyżka | Sok z cytryny
100 ml | Oliwa
> Kurczaka posól, usmaż po 5–6 minut z każdej strony, pokrój.
> Sos zmiksuj: żółtko, czosnek, anchois, musztarda, cytryna; wlewaj oliwę cienkim strumieniem.
> Wymieszaj sałatę z sosem, dodaj kurczaka, grzanki i parmezan.

# Sałatka jarzynowa
@ cat=salatki origin=PL trad servings=8 prep=30 cook=30 art=salad tags=sałatka,polskie,święta
: Wigilijna i wielkanocna klasyka z majonezem.
400 g | Ziemniaki
300 g | Marchew
150 g | Pietruszka (korzeń)
150 g | Seler
4 szt. | Jajka
4 szt. | Ogórki kiszone
200 g | Groszek konserwowy
1 szt. | Jabłko
1 szt. | Cebula
200 g | Majonez
1 łyżka | Musztarda
 | Sól i pieprz
> Warzywa korzeniowe ugotuj, ostudź. Jajka ugotuj na twardo.
> Wszystko pokrój w drobną kostkę. Wymieszaj z majonezem i musztardą, dopraw. Schłódź przez noc.

# Margarita
@ cat=cocktaile origin=MX trad servings=1 prep=3 art=cocktail tags=cocktail,tequila
: Klasyk z tequilą, triple sec i limonką.
50 ml | Tequila blanco
25 ml | Triple sec
25 ml | Sok z limonki
 | Sól do rantu
 | Lód
> Brzeg szklanki zwilż limonką i obtocz w soli. W shakerze zmieszaj składniki z lodem, mocno wstrząśnij 10 sekund. Przecedź do szklanki.

# Negroni
@ cat=cocktaile origin=IT trad servings=1 prep=2 art=cocktail tags=cocktail,gorzki,gin
: Równe części gin, Campari i czerwone vermouth.
30 ml | Gin
30 ml | Campari
30 ml | Vermouth rosso
1 szt. | Skórka pomarańczy
 | Lód
> Składniki zmieszaj z lodem w szklance typu old fashioned. Dodaj skórkę pomarańczy.

# Aperol Spritz
@ cat=cocktaile origin=IT servings=1 prep=2 art=cocktail tags=cocktail,lekki,prosecco
: Lekki aperitif 3:2:1.
90 ml | Prosecco
60 ml | Aperol
30 ml | Woda gazowana
1 szt. | Plaster pomarańczy
 | Lód
> Do dużego kieliszka z lodem wlej prosecco, Aperol i wodę gazowaną. Dodaj pomarańczę.

# Old Fashioned
@ cat=cocktaile origin=US trad servings=1 prep=3 art=cocktail tags=cocktail,whisky
: Whisky, cukier i angostura.
60 ml | Bourbon lub rye
1 łyżeczka | Syrop cukrowy
2 szt. | Angostura (krople)
1 szt. | Skórka pomarańczy
 | Lód
> Mieszaj składniki z lodem 30 sekund. Przecedź do szklanki z dużą kostką. Skórką skrop drink.

# Mojito
@ cat=cocktaile servings=1 prep=5 art=cocktail tags=cocktail,rum,mięta
: Rum, limonka i świeża mięta.
50 ml | Rum biały
25 ml | Sok z limonki
2 łyżeczka | Cukier trzcinowy
10 szt. | Listki mięty
60 ml | Woda gazowana
 | Lód kruszony
> Miętę lekko rozgnieć z cukrem i sokiem. Dodaj rum, lód, dolej wodą gazowaną i wymieszaj.

# Espresso Martini
@ cat=cocktaile origin=GB servings=1 prep=3 art=cocktail tags=cocktail,kawa,wódka
: Wódka, likier kawowy i świeże espresso.
50 ml | Wódka
30 ml | Likier kawowy
30 ml | Espresso (świeże)
1 łyżeczka | Syrop cukrowy
3 szt. | Ziarna kawy
> Wstrząśnij energicznie z lodem 15 sekund, aby powstała pianka. Przecedź do schłodzonego kieliszka. Udekoruj ziarnami.
`;
