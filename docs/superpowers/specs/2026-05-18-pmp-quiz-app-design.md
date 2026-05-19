# PMP Quiz App — Specyfikacja Projektowa

**Data:** 2026-05-18  
**Status:** Zatwierdzony  
**Platforma:** Progressive Web App (PWA)

---

## 1. Przegląd

Osobista aplikacja do nauki przed egzaminem PMP. Działa offline jako installowalna PWA na Androidzie (Chrome → "Dodaj do ekranu głównego"), dostępna też na desktop i iOS. Baza pytań pochodzi z ekstrakcji dwóch plików PDF, przetłumaczona przez użytkownika do pliku JSON wymienianego ręcznie.

---

## 2. Architektura i struktura plików

```
pmp-quiz-app/
├── index.html          ← layout całej aplikacji (single-page)
├── app.js              ← cała logika aplikacji
├── styles.css          ← stylowanie + dark mode
├── manifest.json       ← metadane PWA (ikona, nazwa, kolor motywu)
├── service-worker.js   ← cache offline (Cache API)
├── questions.json      ← baza pytań (podmienialna po tłumaczeniu)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

**Stan aplikacji** przechowywany w `localStorage`:
- `streak_data` — obiekt z datami ukończonych dziennych quizów
- `quiz_history` — tablica wyników z datą, trybem, wynikiem, domenami
- `weak_questions` — mapa `{id: errorCount}` dla trybu powtórek
- `unlocked_badges` — tablica odblokowanych odznak

**Format questions.json:**
```json
[
  {
    "id": 1,
    "domain": "Risk",
    "question": "Treść pytania...",
    "answers": ["Odp A", "Odp B", "Odp C", "Odp D"],
    "correct": 2,
    "explanation": "Wyjaśnienie dlaczego ta odpowiedź jest poprawna..."
  }
]
```

Pole `correct` to indeks (0–3) poprawnej odpowiedzi w tablicy `answers`. Odpowiedzi są tasowane losowo przy każdym wyświetleniu pytania — aplikacja zapamiętuje mapowanie na czas quizu.

---

## 3. Pipeline danych: PDF → Aplikacja

### Krok 1: Ekstrakcja (wykonuje Claude)
Z dwóch plików PDF wyekstrahowane zostają pytania z odpowiedziami i wyjaśnieniami. Duplikaty usuwane. Pytania oznaczane domeną PMP jeśli możliwe do odczytania z kontekstu. Wynik: `questions_en.xlsx`.

**Format arkusza źródłowego (9 kolumn):**

| ID | Domain | Question | Answer_A | Answer_B | Answer_C | Answer_D | Correct | Explanation |
|----|--------|----------|----------|----------|----------|----------|---------|-------------|

- `Correct` zawiera literę A/B/C/D wskazującą poprawną odpowiedź
- Odpowiedzi są losowo rozłożone po kolumnach A–D już na etapie ekstrakcji
- Nie ma założenia że konkretna kolumna jest zawsze poprawna

### Krok 2: Tłumaczenie (wykonuje użytkownik)
Tłumaczone kolumny: Question, Answer_A, Answer_B, Answer_C, Answer_D, Explanation. Kolumny ID, Domain, Correct pozostają bez zmian. Wynik: `questions_pl.xlsx`.

### Krok 3: Konwersja do JSON (wykonuje Claude)
`questions_pl.xlsx` → `questions.json`. Przy konwersji litera z kolumny Correct mapowana jest na indeks (A→0, B→1, C→2, D→3). Plik `questions.json` podmieniony w folderze aplikacji.

### Aktualizacje w przyszłości
Nowe pytania dopisać do `questions_pl.xlsx` → dostarczyć Claude → nowy `questions.json`.

---

## 4. Ekrany aplikacji

### 4.1 Ekran główny (Home)

Elementy od góry:
1. Widget serii: licznik "🔥 N dni z rzędu" + siatka 30 kółek (szare/żółte/zielone)
2. Przycisk **Codzienne Wyzwanie** — zielony checkmark jeśli dziś ukończone, czerwona pulsująca kropka jeśli nie
3. Przycisk **Szybki Quiz**
4. Przycisk **Statystyki**

### 4.2 Ekran wyboru trybu (Szybki Quiz)

Kliknięcie "Szybki Quiz" na ekranie głównym prowadzi do ekranu wyboru trybu z dwoma opcjami:

**Opcja A — Standardowy Quiz (10 pytań)**
- Opcjonalny filtr domenowy: "Wszystkie domeny" (domyślnie) lub checkbox lista domen
- Przycisk "Start"

**Opcja B — Moje słabe pytania (10 pytań)**
- Dostępna tylko gdy użytkownik ma ≥ 10 pytań w puli błędnych (inaczej wyszarzona z komunikatem "Potrzebujesz więcej błędów — ukończ więcej quizów")
- Brak filtra domenowego — losuje wyłącznie z puli błędnych
- Przycisk "Start"

Codzienne wyzwanie pomija ten ekran — zawsze losuje z całej puli bez filtra.

### 4.3 Ekran quizu

Elementy:
- Nagłówek: numer pytania / łączna liczba + tag domeny + pasek postępu
- Treść pytania
- 4 przyciski odpowiedzi (A/B/C/D)

**Zachowanie po odpowiedzi:**
- Poprawna: przycisk zielony → po 1500ms automatyczne przejście do następnego pytania
- Błędna: przycisk czerwony + panel z wyjaśnieniem + przycisk "Dalej →" (ręczne przejście)
- Po wyborze wszystkie pozostałe przyciski wyszarzają się (brak możliwości zmiany)

### 4.4 Ekran podsumowania

Elementy:
- Wynik liczbowy (np. 23/30) i procentowy
- Pasek wizualny wypełnienia
- Najlepsza seria poprawnych odpowiedzi w tym quizie
- Najsłabsza domena w tym quizie
- Animacja konfetti jeśli wynik ≥ 80%
- Komunikat "🔥 Seria przedłużona!" jeśli to był dzienny quiz
- Przyciski: "Wróć do menu" / "Zagraj ponownie"

### 4.5 Ekran statystyk

Elementy:
- Średnia poprawnych odpowiedzi: ostatnie 3 / 7 / 30 dni
- Łączna liczba ukończonych quizów i odpowiedzianych pytań
- Pasłupkowy breakdown per domena (procent poprawnych)
- Kalendarz aktywności ostatnich 30 dni
- Galeria odznak (kolorowe = odblokowane, szare = zablokowane)

---

## 5. Gamifikacja

### 5.1 Kalendarz serii

Siatka 30 kółek na ekranie głównym reprezentująca ostatnie 30 dni:
- Szare — brak aktywności
- Żółte — ukończony szybki quiz (ale bez dziennego)
- Zielone — ukończone codzienne wyzwanie

Licznik "🔥 N dni z rzędu" liczy tylko kolejne dni z ukończonym dziennym wyzwaniem (30 pytań). Seria zeruje się po pominięciu dnia. Brak push notyfikacji — zamiast tego wizualne przypomnienie na ekranie głównym.

### 5.2 Odznaki

| Odznaka | Warunek wyzwolenia |
|---------|-------------------|
| 🎯 Pierwszy krok | Ukończenie pierwszego quizu |
| 🔥 Tydzień ognia | 7 dni serii z rzędu |
| 💪 Miesiąc mocy | 30 dni serii z rzędu |
| 🧠 Setka | 100 odpowiedzianych pytań łącznie |
| 🏆 Pięćsetka | 500 odpowiedzianych pytań łącznie |
| ⭐ Perfekcja | 100% poprawnych w jednym quizie |
| 🎓 PMP Ready | Średnia ≥ 80% z ostatnich 30 dni |

Odblokowanie odznaki wywołuje animowany popup (krótki, nienachalny). Odznaki widoczne w statystykach.

---

## 6. Tryby gry

| Tryb | Liczba pytań | Filtr domenowy | Liczy do serii |
|------|-------------|----------------|----------------|
| Codzienne wyzwanie | 30 | Brak (cała pula) | Tak |
| Szybki Quiz | 10 | Opcjonalny | Nie |
| Słabe pytania | 10 | Brak (tylko błędne) | Nie |

**Tryb "Słabe pytania"** — dostępny jako opcja B na ekranie wyboru trybu Szybkiego Quizu (nie jako osobny przycisk na ekranie głównym). Losuje pytania z puli błędnie odpowiedzianych. Każde błędne pytanie trafia do puli po pierwszym błędzie i jest losowane 3x częściej niż standardowe pytania. Dostępny gdy użytkownik ma co najmniej 10 pytań w puli słabych.

---

## 7. Dodatkowe funkcje UX

**Dark mode:** Automatyczne dopasowanie do `prefers-color-scheme` systemowego. Oba motywy obsługiwane w `styles.css`.

**Ekran ładowania:** Przy starcie aplikacji 1–2 sekundy z losowym cytatem o zarządzaniu projektami. Maskuje inicjalizację danych.

**Responsywność:** Główny target to telefon pionowo (360–430px szerokości). Aplikacja działa też na desktop i tablecie.

---

## 8. Ograniczenia i decyzje projektowe

- Brak kont użytkowników — dane tylko lokalnie w `localStorage`
- Brak synchronizacji między urządzeniami
- Brak push notyfikacji (ograniczenia PWA bez dedykowanego serwera)
- Aktualizacja pytań wymaga ręcznej wymiany pliku `questions.json`
- Baza pytań pochodzi wyłącznie z dostarczonych PDF-ów (nie ma zewnętrznego API)
