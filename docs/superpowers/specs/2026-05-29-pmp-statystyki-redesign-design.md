# Redesign sekcji Statystyki: kokpit gotowosci PMP

Data: 2026-05-29  
Zakres: ekran `Statystyki/Postep` w aplikacji PM Academy

## Cel

Nowy ekran statystyk ma odpowiadac przede wszystkim na pytanie: **czy jestem gotowy do egzaminu PMP i co powinienem trenowac dalej?**

Obecne elementy, takie jak srednie wyniki, liczba quizow, kalendarz i odznaki, zostaja zachowane, ale ich rola zmienia sie z glownej analityki na kontekst wspierajacy. Ekran ma byc spojny z aktualnym dashboardem: spokojny, mobilny, oparty o istniejace tokeny CSS, karty o umiarkowanym promieniu, czytelna hierarchia i bez marketingowego nadmiaru.

## Wybrany kierunek UX

Rekomendowany kierunek to **kokpit decyzyjny**.

Alternatywy rozwazane:

1. **Kokpit decyzyjny** - jedna dominujaca karta gotowosci, pod nia trzy domeny ECO, trend i rekomendowana akcja. Najlepiej wspiera nauke pod egzamin.
2. **Progress-first** - trend postepu jest prawie rownie wazny jak aktualny score. Bardziej motywacyjny, ale slabiej odpowiada na pytanie "czy jestem gotowy?".
3. **Modulowy panel** - wiele rownorzednych kafli. Kompaktowy, ale mniej prowadzacy i mniej egzaminacyjny.

Decyzja: wariant 1 jako baza, z lekkim wykresem trendu z wariantu 2.

## Hierarchia ekranu

Kolejnosc sekcji:

1. **Naglowek Postep** - krotki tytul i status danych, np. "Ostatnie 30 dni".
2. **PMP Readiness** - glowna karta z wynikiem, statusem i rekomendowana akcja.
3. **Domeny ECO** - trzy kompaktowe panele: People, Process, Business Environment.
4. **Trend postepu** - lekki wykres liniowy/obszarowy pokazujacy gotowosc lub skutecznosc w czasie.
5. **Najwieksza luka** - kontekstowy blok z domena/segmentem i CTA do treningu.
6. **Ranking** - maly, wspierajacy modul z pozycja lub stanem prywatnosci.
7. **Aktywnosc** - odswiezony, lekki kalendarz z zachowaniem klikniec.
8. **Odznaki** - nowy, spokojniejszy system odznak, mniej emoji, nadal klikalny.
9. **Szczegoly analityczne** - zakladki breakdownow: ECO, podejscie, obszary, typ, trudnosc.

## Karta PMP Readiness

Karta powinna byc pierwszym silnym sygnalem ekranu.

Zawartosc:

- eyebrow: `PMP READINESS`
- glowny wynik: `72%` albo stan `Kalibracja`
- status opisowy:
  - `Gotowosc treningowa` dla stanu gotowosci,
  - `Zbieramy dane` dla building evidence,
  - `Kalibracja` dla nowych uzytkownikow.
- ring/gauge po prawej, w stylu obecnego dashboardu, ale czystszy i stabilniejszy wizualnie.
- subtekst: `Wskaznik treningowy PM Academy, nie oficjalny wynik egzaminu PMI.`
- mala metryka pokrycia: np. `96 / 120 odpowiedzi ECO` albo `3/3 domeny pokryte`.

Stany:

- **Calibration**: karta pokazuje ile odpowiedzi brakuje do pierwszej diagnozy i CTA `Rozpocznij trening`.
- **Building evidence**: karta pokazuje score jako wstepny, ale mocniej eksponuje brak pokrycia ECO.
- **Ready**: karta pokazuje procent, najslabsza domene i CTA do treningu luki.

## Domeny ECO

Sekcja ma pokazac znajomosc zakresu z trzech domen ECO bez rozbijania uwagi na zbyt wiele szczegolow.

Kazda domena jako osobny, klikany wiersz lub kompaktowa karta:

- nazwa domeny: `People`, `Process`, `Business Environment`
- wynik procentowy
- liczba odpowiedzi w probie
- mini progress bar
- status:
  - `Mocna` od 80% i wystarczajacym pokryciu,
  - `Do poprawy` ponizej 70%,
  - `Za malo danych` przy niskim pokryciu.

Klikniecie domeny powinno otwierac trening tej domeny przez istniejacy mechanizm `Views['mode-select']._applyTraining('ecoDomain', key)`.

Wizualnie domeny nie powinny byc jednokolorowe. Proponowane akcenty:

- People: zielony/success
- Process: indigo/accent
- Business Environment: zolty/warning

Kolory musza bazowac na istniejacych tokenach `--green`, `--accent`, `--yellow` i ich jasnych wariantach, z poprawnym kontrastem w dark mode.

## Wykres postepu

Ekran powinien zawierac lekki wykres pokazujacy progress, ale bez ciezkiej biblioteki.

Rekomendacja: prosty inline SVG generowany z danych historii:

- zakres domyslny: ostatnie 30 dni,
- linia: readiness score, gdy da sie go wyliczyc,
- fallback: srednia skutecznosc dzienna/tygodniowa, gdy readiness nie jest jeszcze stabilny,
- os X bez gestych etykiet, tylko 3 punkty orientacyjne,
- os Y uproszczona: 0%, 50%, 100% lub bez widocznej osi, jesli karta pozostanie czytelna,
- pod wykresem trzy male wartosci: `start`, `teraz`, `zmiana`.

Wykres nie powinien dominowac nad karta gotowosci. Jego rola to pokazanie kierunku: czy uzytkownik realnie zbliza sie do gotowosci.

## Ranking

Ranking ma byc dodatkiem motywacyjnym, nie glownym kryterium gotowosci.

Modul na ekranie statystyk:

- gdy ranking wlaczony:
  - pokazuje punkty rankingu,
  - pozycje, jesli jest dostepna,
  - link/CTA `Zobacz ranking`.
- gdy ranking prywatny:
  - pokazuje `Ranking prywatny`,
  - wyjasnia jednym zdaniem, ze publiczny ranking jest dobrowolny,
  - CTA `Ustawienia rankingu` albo `Dolacz do rankingu`.

Nie nalezy mieszac EXP i ranking score z readiness. Uzytkownik ma rozumiec, ze ranking mierzy aktywnosc/rywalizacje, a gotowosc mierzy przygotowanie do egzaminu.

## Odznaki

Obecne emoji odznaki wygladaja niespojnie z nowym UI. Rekomendacja: zastapic je autorskimi, generycznymi znakami opartymi o proste SVG/HTML, bez bitmap i bez emoji.

Styl:

- male medaliony 40-48 px,
- okrag lub osmiokat z subtelnym tlem,
- jedna prosta ikona liniowa w srodku,
- zablokowane odznaki: kontur + niski kontrast, bez agresywnego grayscale emoji,
- odblokowane: akcent domeny lub typu osiagniecia.

Proponowany zestaw ikon:

- `week` - plomien/seria jako uproszczony znak liniowy,
- `month` - tarcza z checkiem,
- `hundred` - stos kart/pytan,
- `fivehun` - gwiazda w medalionie,
- `perfect` - celownik,
- `ready` - tarcza PMP,
- `trial_first` - dokument egzaminu,
- `trial_marathon` - zegar + check,
- `trial_target` - cel,
- `trial_clock` - stoper.

Klikniecie odznaki nadal wywoluje `Views.stats._showBadgeInfo(id)` i pokazuje popup. Popup powinien przejsc z emoji na ten sam komponent ikony, powiekszony do ok. 48 px.

## Kalendarz aktywnosci

Kalendarz powinien byc lzejszy i mniej toporny, ale zachowac obecna funkcjonalnosc:

- klikniecie karty aktywnosci otwiera pelny kalendarz,
- klikniecie dnia z aktywnoscia pokazuje szczegoly dnia,
- dni moga miec statusy: brak, aktywnosc, daily done, dzis, przyszly.

Nowy wyglad:

- karta `Aktywnosc` pokazuje krotki tygodniowy pasek lub kompaktowy miesiac,
- komorki sa mniejsze, z wiekszym oddechem i mniej wypelnionym kolorem,
- aktywnosc jako kropka/pill pod numerem dnia zamiast pelnego kolorowego kwadratu,
- dzisiaj jako obrys akcentowy,
- `daily done` jako pelna kropka success,
- zwykla aktywnosc jako kropka warning,
- przyszle dni z niska przezroczystoscia.

Pelny kalendarz w bottom sheet zostaje, ale:

- naglowek ma tytul i przycisk zamkniecia jako ikone,
- miesiace maja wiekszy odstep i mniejsze naglowki,
- tooltip dnia powinien wygladac jak mala karta z lista aktywnosci.

## Szczegoly analityczne

Obecne zakladki breakdownow zostaja, ale powinny zejsc nizej. To sa dane dla uzytkownika, ktory chce wejsc glebiej, nie pierwszy sygnal ekranu.

Zasady:

- zakladki jako segmented control zamiast malych chipow,
- domyslna zakladka: `Domeny ECO`,
- wiersze maja stale proporcje: nazwa, bar, procent, liczba odpowiedzi,
- brak danych pokazuje `Za malo danych`, nie puste miejsce.

## Responsywnosc i dostepnosc

Ekran pozostaje mobile-first z `--max-width: 480px`.

Wymagania:

- kazdy klikalny modul musi byc `button` albo miec role/keyboard handling, jesli zostaje jako element niestandardowy,
- minimalny obszar dotyku: 44 px,
- tekst nie moze opierac sie wylacznie na kolorze,
- wykres musi miec tekstowy summary,
- ring readiness musi miec `aria-label`,
- odznaki zablokowane i odblokowane musza miec czytelne nazwy w popupie.

## Dane i integracje

Projekt powinien korzystac z obecnych zrodel:

- `StatsManager.getReadiness()` dla score, stanu, domen ECO, weakest i coverage gap,
- `StatsManager.getReadinessInsight(AppState.questions)` dla rekomendowanej akcji,
- `StatsManager.getBreakdown('ecoDomain', AppState.questions)` i pozostalych breakdownow,
- `Storage.getUnlockedBadges()` i `BADGES_DEF` dla odznak,
- `StreakManager.getMonthData()`, `getActiveMonths()` i `getDayDetails()` dla kalendarza,
- `AppState.engagement` i istniejacy widok `Views.ranking` dla rankingu.

Nie ma potrzeby dodawania nowej bazy danych ani nowej synchronizacji dla samego redesignu. Trend readiness mozna wyliczac lokalnie z `quiz_history`; jesli brakuje danych dziennych, wykres pokazuje mniej punktow i jasny stan pusty.

## Copy UI

Proponowane etykiety PL:

- `PMP Readiness`
- `Gotowosc treningowa`
- `Zbieramy wiarygodne pokrycie ECO`
- `Najwieksza luka`
- `Trenuj te domene`
- `Postep w czasie`
- `Domeny ECO`
- `Za malo danych`
- `Ranking prywatny`
- `Aktywnosc nauki`
- `Odznaki PM Academy`

Angielskie odpowiedniki powinny zostac dodane rownolegle w `UI_TEXT`, bo aplikacja ma tryb PL/EN.

## Poza zakresem

Ten redesign nie zmienia:

- algorytmu readiness,
- zasad naliczania EXP,
- zasad naliczania ranking score,
- prywatnosci rankingu,
- struktury danych Supabase,
- trybu egzaminu probnego.

## Kryteria akceptacji

1. Pierwszy ekran statystyk natychmiast komunikuje gotowosc do PMP.
2. Uzytkownik widzi poziom znajomosci wszystkich trzech domen ECO bez przewijania daleko w dol.
3. Uzytkownik widzi trend postepu w czasie.
4. Klikniecie rekomendowanej domeny ECO prowadzi do treningu tej domeny.
5. Ranking jest widoczny jako modul wspierajacy, ale nie konkuruje z readiness.
6. Odznaki nie uzywaja emoji jako glownego elementu wizualnego.
7. Klikniecie odznaki nadal pokazuje szczegoly.
8. Kalendarz jest lzejszy wizualnie i nadal obsluguje klikniecia dnia oraz pelny widok.
9. Ekran dziala w light i dark mode, bez nowych jednokolorowych motywow.
10. Brak danych ma jawne, spokojne stany puste.

