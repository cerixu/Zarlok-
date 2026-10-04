# Żarłok — roadmap redesignu

Żarłok jest osobnym projektem. Nie mieszać jego kodu, wersji ani etapów z Kucharkiem Claude.

## Zasady
- Pracujemy fazami po kolei.
- Faza nie jest uznana za zakończoną, dopóki nie przejdzie kontroli.
- Na końcu każdej fazy podbijamy numer aplikacji w `util.js` i numer Service Workera w `sw.js`.
- Docelowo interfejs ma zachować charakter referencji: ciemny, premium, glassmorphism, duże fotografie, warstwowe karty, pływająca nawigacja.
- Finalne grafiki dla aplikacji generujemy jako osobny asset pack po ustaleniu systemu UI. Nie produkujemy teraz losowych obrazków.

## Fazy

### 0. Fundament i bezpieczeństwo
Status: ✅
- osobna gałąź redesignu
- zabezpieczenie startu Safari
- fallback IndexedDB → Cache API → localStorage → pamięć sesyjna
- informacja o aktywnym magazynie w Ustawieniach
- wersja 1.2.0

### 1. Design System
Status: ✅
- dark-first glass system
- tło z głębią i subtelnymi poświatami
- szkło, blur, krawędzie, cienie
- ciepły pomarańczowo-złoty akcent
- pływający Glass Tab Bar
- spójne glassowe formularze, przyciski i panele
- wersja 1.3.0

### 2. Karty receptur
Status: ✅
- pionowa karta zamiast płaskiego wiersza
- duże zdjęcie
- gradient nad fotografią
- tagi na zdjęciu
- ulubione jako szklany przycisk
- parametry czasu, porcji i temperatury
- subtelna warstwowość kart
- wersja 1.4.0

### 3. Ekran pojedynczego przepisu
Status: ✅
- immersive hero photo
- szkło nachodzące na zdjęcie
- tytuł, kategoria, tradycyjność, tagi
- ocena i parametry
- główna komenda „Rozpocznij gotowanie”
- sekcja wizualnych składników
- przygotowanie, uwagi i koszt
- miejsce na finalne grafiki składników
- wersja 1.5.0

### 4. System grafik i assetów
Status: ⏳
- finalne zdjęcia dań
- grafiki składników
- ikony kategorii
- grafiki stanów pustych
- grafiki narzędzi i modułów
- spójny styl fotograficzny
- bez masowego duplikowania ciężkich plików

### 5. GOTUJĘ / Chef Mode
Status: ⏳
- krok po kroku
- swipe
- timer
- postęp
- składniki potrzebne w kroku
- głos
- ekran końcowy

### 6. Kalkulatory
Status: ⏳
- pizza / ciasto
- procenty piekarskie
- przeliczanie
- food cost
- temperatury
- solanki i pozostałe narzędzia
- wspólny glass UI

### 7. Magazyn i Zakupy
Status: ⏳
- stan magazynowy
- automatyczne zużycie
- niskie stany
- straty / odpady
- lista zakupów
- skaner EAN
- glass UI

### 8. Import i wyszukiwanie
Status: ⏳
- wyszukiwanie
- import tekstu
- import ze stron
- tłumaczenie
- prezentacja wyników w nowym systemie

### 9. Minutniki
Status: ⏳
- wiele timerów
- pływające pastylki
- spójny wygląd z resztą UI
- zachowanie po przeładowaniu

### 10. Animacje i micro-interactions
Status: ⏳
- przejścia ekranów
- spring motion
- reakcje przy nacisku
- ruch kart
- glass transitions
- reduced motion

### 11. iPhone / Safari QA
Status: ⏳
- Safari
- PWA z ekranu początkowego
- safe area
- klawiatura
- przewijanie
- orientacja
- offline
- restart
- aktualizacja Service Workera
- test regresji funkcji

### 12. Final polish
Status: ⏳
- spójność wszystkich ekranów
- wydajność
- rozmiary assetów
- błędy tekstowe
- accessibility
- końcowy audit
- finalny numer wersji
