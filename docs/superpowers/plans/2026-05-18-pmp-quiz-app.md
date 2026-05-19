# PMP Quiz App — Plan Implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować offline-first PWA do nauki na egzamin PMP z gamifikacją (seria, odznaki), trzema trybami quizu i pipeline'em danych PDF→Excel→JSON.

**Architecture:** Single-page vanilla JS app bez build toolów. Cała logika w `app.js` podzielona na moduły (Storage, QuizEngine, StreakManager, BadgeManager, StatsManager, Views, Router). Stan w localStorage. Offline via Service Worker z cache-first strategy.

**Tech Stack:** HTML5, CSS3 (custom properties + dark mode), Vanilla JS ES6, Web App Manifest, Service Worker Cache API, Python 3 + pdfplumber + openpyxl (narzędzia pipeline'u), pytest (testy pipeline'u), Node.js (testy logiki JS).

**Folder roboczy:** `pmp-quiz-app/` wewnątrz folderu workspace.

---

## Mapa plików

```
pmp-quiz-app/
├── index.html            ← SPA shell: #app div + rejestracja SW
├── app.js                ← cała logika (budowana zadanie po zadaniu)
├── styles.css            ← CSS custom properties, dark mode, wszystkie komponenty
├── manifest.json         ← PWA metadata
├── service-worker.js     ← cache-first offline
├── questions.json        ← baza pytań (stub na czas dev, docelowo z pipeline'u)
└── icons/
    ├── icon-192.png      ← generowany przez tools/generate_icons.py
    └── icon-512.png
tools/
├── extract_questions.py  ← PDF → questions_en.xlsx
├── convert_to_json.py    ← questions_pl.xlsx → questions.json
├── generate_icons.py     ← generuje PNG ikony
├── requirements.txt
└── test_pipeline.py      ← pytest testy narzędzi
tests/
└── test_logic.js         ← Node.js testy modułów JS
```

---

## Task 1: Scaffold projektu

**Files:**
- Create: `pmp-quiz-app/index.html`
- Create: `pmp-quiz-app/manifest.json`
- Create: `pmp-quiz-app/service-worker.js`
- Create: `pmp-quiz-app/questions.json` (stub z 5 pytaniami)

- [ ] **Krok 1: Utwórz `pmp-quiz-app/index.html`**

```html
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="theme-color" content="#6366f1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="styles.css">
  <title>PMP Quiz</title>
</head>
<body>
  <div id="app"></div>
  <div id="badge-popup" class="badge-popup hidden" aria-live="polite"></div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Krok 2: Utwórz `pmp-quiz-app/manifest.json`**

```json
{
  "name": "PMP Quiz",
  "short_name": "PMP Quiz",
  "description": "Aplikacja do nauki na egzamin PMP",
  "start_url": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#6366f1",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Krok 3: Utwórz `pmp-quiz-app/service-worker.js`**

```javascript
'use strict';
const CACHE_NAME = 'pmp-quiz-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './questions.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

- [ ] **Krok 4: Utwórz `pmp-quiz-app/questions.json` (stub deweloperski)**

```json
[
  {
    "id": 1,
    "domain": "Risk",
    "question": "Który proces zarządzania ryzykiem powinien być wykonywany jako pierwszy w nowym projekcie?",
    "answers": [
      "Identyfikacja ryzyk",
      "Planowanie zarządzania ryzykiem",
      "Jakościowa analiza ryzyk",
      "Planowanie odpowiedzi na ryzyka"
    ],
    "correct": 1,
    "explanation": "Planowanie zarządzania ryzykiem jest pierwszym procesem — definiuje jak będziemy podchodzić do ryzyk w całym projekcie, zanim jeszcze je zidentyfikujemy."
  },
  {
    "id": 2,
    "domain": "Cost",
    "question": "Jaka jest wartość SPI = 0.8?",
    "answers": [
      "Projekt jest opóźniony względem harmonogramu",
      "Projekt jest przed harmonogramem",
      "Projekt przekroczył budżet",
      "Projekt jest w ramach harmonogramu"
    ],
    "correct": 0,
    "explanation": "SPI (Schedule Performance Index) poniżej 1.0 oznacza opóźnienie — wykonano mniej pracy niż planowano na dany moment."
  },
  {
    "id": 3,
    "domain": "People",
    "question": "Czym charakteryzuje się styl przywództwa 'servant leader'?",
    "answers": [
      "Skupieniu na potrzebach zespołu i usuwaniu przeszkód",
      "Podejmowaniu wszystkich decyzji samodzielnie",
      "Nagradzaniu najlepszych pracowników",
      "Ścisłej kontroli wykonania zadań"
    ],
    "correct": 0,
    "explanation": "Servant leader stawia potrzeby zespołu na pierwszym miejscu, usuwa blokery i wspiera rozwój członków — kluczowa postawa w zwinnych metodykach."
  },
  {
    "id": 4,
    "domain": "Process",
    "question": "Kiedy tworzymy WBS (Work Breakdown Structure)?",
    "answers": [
      "Podczas monitorowania i kontroli projektu",
      "Podczas zamknięcia projektu",
      "Podczas planowania zakresu projektu",
      "Podczas inicjowania projektu"
    ],
    "correct": 2,
    "explanation": "WBS tworzy się w grupie procesów planowania, w procesie 'Create WBS' — rozbija zakres projektu na mniejsze, zarządzalne elementy."
  },
  {
    "id": 5,
    "domain": "Risk",
    "question": "Co to jest rezerwa na zarządzanie (management reserve)?",
    "answers": [
      "Budżet na znane ryzyka projektu",
      "Fundusz na nieznane ryzyka poza zakresem bazowym",
      "Zysk zaplanowany dla sponsora",
      "Budżet na zmiany zakresu"
    ],
    "correct": 1,
    "explanation": "Management reserve to budżet na nieznane-nieznane ryzyka (unk-unks), kontrolowany przez kierownictwo — nie jest częścią bazowego budżetu projektu."
  }
]
```

- [ ] **Krok 5: Utwórz pusty `pmp-quiz-app/styles.css` i `pmp-quiz-app/app.js`**

```bash
touch pmp-quiz-app/styles.css pmp-quiz-app/app.js
mkdir -p pmp-quiz-app/icons
```

- [ ] **Krok 6: Commit**

```bash
cd pmp-quiz-app
git init
git add .
git commit -m "feat: scaffold PWA project (HTML, manifest, service worker, stub questions)"
```

---

## Task 2: CSS — Zmienne, reset, dark mode, base komponenty

**Files:**
- Modify: `pmp-quiz-app/styles.css`

- [ ] **Krok 1: Napisz pełny `styles.css`**

```css
/* ===== CUSTOM PROPERTIES ===== */
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface2: #f1f5f9;
  --text: #1e293b;
  --text2: #64748b;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --accent-light: #e0e7ff;
  --green: #22c55e;
  --green-light: #dcfce7;
  --red: #ef4444;
  --red-light: #fee2e2;
  --yellow: #f59e0b;
  --yellow-light: #fef3c7;
  --border: #e2e8f0;
  --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.12);
  --radius: 14px;
  --radius-sm: 8px;
  --transition: 0.2s ease;
  --max-width: 480px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #334155;
    --text: #f1f5f9;
    --text2: #94a3b8;
    --accent: #818cf8;
    --accent-hover: #6366f1;
    --accent-light: #1e1b4b;
    --green: #4ade80;
    --green-light: #14532d;
    --red: #f87171;
    --red-light: #450a0a;
    --yellow: #fbbf24;
    --yellow-light: #451a03;
    --border: #334155;
    --shadow: 0 1px 3px rgba(0,0,0,0.3);
    --shadow-lg: 0 10px 25px rgba(0,0,0,0.4);
  }
}

/* ===== RESET ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; -webkit-tap-highlight-color: transparent; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  min-height: -webkit-fill-available;
}
button { cursor: pointer; border: none; background: none; font-family: inherit; font-size: inherit; color: inherit; }
#app { min-height: 100vh; display: flex; flex-direction: column; }

/* ===== LAYOUT WRAPPER ===== */
.screen {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 20px 16px 32px;
  width: 100%;
  flex: 1;
}

/* ===== LOADING SCREEN ===== */
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 32px;
  text-align: center;
  gap: 16px;
}
.loading-logo { font-size: 4rem; }
.loading-screen h1 { font-size: 2rem; font-weight: 700; color: var(--accent); }
.loading-quote {
  font-size: 0.95rem;
  color: var(--text2);
  font-style: italic;
  max-width: 320px;
  line-height: 1.5;
}
.loading-spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== HOME SCREEN ===== */
.home { display: flex; flex-direction: column; gap: 20px; }

.streak-widget {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
}
.streak-count {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text);
}
.streak-dots {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 5px;
}
.streak-dot {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  transition: background var(--transition);
}
.streak-dot--none    { background: var(--surface2); }
.streak-dot--activity { background: var(--yellow); }
.streak-dot--daily   { background: var(--green); }

.menu { display: flex; flex-direction: column; gap: 12px; }
.menu-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
  transition: transform var(--transition), box-shadow var(--transition);
  text-align: left;
  width: 100%;
}
.menu-btn:active { transform: scale(0.98); }
.menu-btn__icon { font-size: 1.6rem; flex-shrink: 0; }
.menu-btn__content { flex: 1; }
.menu-btn__title { font-size: 1rem; font-weight: 600; }
.menu-btn__sub { font-size: 0.82rem; color: var(--text2); margin-top: 2px; }
.menu-btn__arrow { font-size: 1.4rem; color: var(--text2); }
.menu-btn--daily.pending .menu-btn__icon { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ===== MODE SELECT ===== */
.mode-select { display: flex; flex-direction: column; gap: 16px; }
.mode-select h2 { font-size: 1.3rem; font-weight: 700; }
.mode-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 18px;
  box-shadow: var(--shadow);
  border: 2px solid transparent;
  transition: border-color var(--transition);
}
.mode-card.selected { border-color: var(--accent); }
.mode-card h3 { font-size: 1rem; font-weight: 600; margin-bottom: 4px; }
.mode-card p { font-size: 0.85rem; color: var(--text2); }
.mode-card.disabled { opacity: 0.5; pointer-events: none; }

.domain-filter { margin-top: 8px; }
.domain-filter label { font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 8px; }
.domain-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.domain-chip {
  padding: 5px 12px;
  border-radius: 20px;
  background: var(--surface2);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
  border: 1.5px solid transparent;
}
.domain-chip.selected { background: var(--accent-light); border-color: var(--accent); color: var(--accent); font-weight: 600; }

.btn-primary {
  width: 100%;
  padding: 14px;
  background: var(--accent);
  color: white;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  transition: background var(--transition), transform var(--transition);
}
.btn-primary:active { transform: scale(0.98); background: var(--accent-hover); }
.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: var(--text2);
  margin-bottom: 16px;
}

/* ===== QUIZ SCREEN ===== */
.quiz { display: flex; flex-direction: column; gap: 16px; min-height: 100vh; }
.quiz-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.quiz-counter { font-size: 0.85rem; font-weight: 600; color: var(--text2); white-space: nowrap; }
.quiz-domain {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  background: var(--accent-light);
  color: var(--accent);
}
.quiz-progress {
  height: 5px;
  background: var(--surface2);
  border-radius: 3px;
  overflow: hidden;
}
.quiz-progress__bar {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.quiz-question {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  font-size: 1rem;
  line-height: 1.6;
  font-weight: 500;
  box-shadow: var(--shadow);
}
.quiz-answers { display: flex; flex-direction: column; gap: 10px; }
.answer-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  text-align: left;
  width: 100%;
  box-shadow: var(--shadow);
  border: 2px solid transparent;
  transition: border-color var(--transition), background var(--transition), opacity var(--transition);
  font-size: 0.95rem;
  line-height: 1.4;
}
.answer-btn:active:not(:disabled) { transform: scale(0.99); }
.answer-btn .letter {
  font-size: 0.8rem;
  font-weight: 700;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--transition);
}
.answer-btn.correct { background: var(--green-light); border-color: var(--green); }
.answer-btn.correct .letter { background: var(--green); color: white; }
.answer-btn.wrong { background: var(--red-light); border-color: var(--red); }
.answer-btn.wrong .letter { background: var(--red); color: white; }
.answer-btn:disabled { opacity: 0.5; }
.answer-btn.correct:disabled, .answer-btn.wrong:disabled { opacity: 1; }

.explanation-panel {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 16px;
  border-left: 4px solid var(--accent);
  box-shadow: var(--shadow);
  animation: slideUp 0.2s ease;
}
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.explanation-panel p { font-size: 0.9rem; line-height: 1.6; color: var(--text2); }
.btn-next {
  width: 100%;
  padding: 14px;
  background: var(--accent);
  color: white;
  border-radius: var(--radius);
  font-weight: 600;
  transition: background var(--transition);
}

/* ===== SUMMARY SCREEN ===== */
.summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 32px 16px;
  text-align: center;
}
.summary__score-circle {
  width: 120px; height: 120px;
  border-radius: 50%;
  background: var(--accent-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 4px solid var(--accent);
}
.summary__score-num { font-size: 1.8rem; font-weight: 800; color: var(--accent); }
.summary__score-pct { font-size: 0.85rem; color: var(--text2); }
.summary__title { font-size: 1.3rem; font-weight: 700; }
.summary__streak-msg { font-size: 1rem; color: var(--green); font-weight: 600; }
.summary__details {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 16px;
  width: 100%;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary__detail { display: flex; justify-content: space-between; font-size: 0.9rem; }
.summary__detail span:last-child { font-weight: 600; }
.summary__progress {
  height: 8px;
  background: var(--surface2);
  border-radius: 4px;
  overflow: hidden;
  width: 100%;
}
.summary__progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 1s ease;
}
.summary__actions { display: flex; gap: 10px; width: 100%; }
.btn-secondary {
  flex: 1; padding: 14px;
  background: var(--surface2);
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 0.9rem;
}

/* ===== STATS SCREEN ===== */
.stats { display: flex; flex-direction: column; gap: 20px; }
.stats h1 { font-size: 1.3rem; font-weight: 700; }
.stats-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
}
.stats-card h3 { font-size: 0.85rem; font-weight: 600; color: var(--text2); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
.avg-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.avg-item { text-align: center; flex: 1; }
.avg-item__val { font-size: 1.6rem; font-weight: 800; color: var(--accent); }
.avg-item__label { font-size: 0.75rem; color: var(--text2); }
.domain-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.domain-bar__name { font-size: 0.82rem; width: 100px; flex-shrink: 0; }
.domain-bar__track { flex: 1; height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
.domain-bar__fill { height: 100%; border-radius: 4px; background: var(--accent); transition: width 0.6s ease; }
.domain-bar__pct { font-size: 0.82rem; font-weight: 600; width: 36px; text-align: right; }
.totals { display: flex; justify-content: space-around; }
.total-item { text-align: center; }
.total-item__val { font-size: 1.8rem; font-weight: 800; color: var(--accent); }
.total-item__label { font-size: 0.78rem; color: var(--text2); }
.badges-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.badge-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.badge-item__emoji { font-size: 1.8rem; }
.badge-item__name { font-size: 0.65rem; text-align: center; color: var(--text2); }
.badge-item.locked { filter: grayscale(1); opacity: 0.4; }

/* ===== BADGE POPUP ===== */
.badge-popup {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px 20px;
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
  min-width: 260px;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 2px solid var(--accent);
}
.badge-popup.visible { transform: translateX(-50%) translateY(0); }
.badge-popup.hidden { display: none; }
.badge-popup__emoji { font-size: 2rem; }
.badge-popup__text strong { display: block; font-size: 0.95rem; }
.badge-popup__text span { font-size: 0.8rem; color: var(--text2); }

/* ===== UTILITY ===== */
.hidden { display: none !important; }
.text-center { text-align: center; }
```

- [ ] **Krok 2: Commit**

```bash
git add styles.css
git commit -m "feat: CSS foundation with dark mode, all component styles"
```

---

## Task 3: Storage module + testy

**Files:**
- Modify: `pmp-quiz-app/app.js` (dodaj sekcję Storage)
- Create: `tests/test_logic.js`

- [ ] **Krok 1: Dodaj do `app.js` (cały plik — zastąp zawartość)**

```javascript
'use strict';

// ==================== CONSTANTS ====================
const QUIZ_SIZES = { daily: 30, quick: 10, weak: 10 };
const TODAY = () => new Date().toISOString().slice(0, 10);

const BADGES_DEF = [
  { id: 'first',    emoji: '🎯', name: 'Pierwszy krok', desc: 'Ukończ pierwszy quiz',           check: s => s.totalQuizzes >= 1 },
  { id: 'week',     emoji: '🔥', name: 'Tydzień ognia', desc: '7 dni serii z rzędu',             check: s => s.currentStreak >= 7 },
  { id: 'month',    emoji: '💪', name: 'Miesiąc mocy',  desc: '30 dni serii z rzędu',            check: s => s.currentStreak >= 30 },
  { id: 'hundred',  emoji: '🧠', name: 'Setka',         desc: '100 odpowiedzianych pytań',       check: s => s.totalAnswered >= 100 },
  { id: 'fivehun',  emoji: '🏆', name: 'Pięćsetka',     desc: '500 odpowiedzianych pytań',       check: s => s.totalAnswered >= 500 },
  { id: 'perfect',  emoji: '⭐', name: 'Perfekcja',     desc: '100% poprawnych w jednym quizie', check: s => s.hadPerfectQuiz },
  { id: 'ready',    emoji: '🎓', name: 'PMP Ready',     desc: 'Średnia ≥ 80% z 30 dni',          check: s => s.avg30 >= 80 },
];

const QUOTES = [
  'Zarządzanie projektem to sztuka realizacji wizji w ramach ograniczeń.',
  'Dobry plan teraz jest lepszy od doskonałego planu jutro.',
  'Ryzyk nie ignorujemy — zarządzamy nimi.',
  'Komunikacja to 90% zarządzania projektem.',
  'Każdy projekt to szansa na naukę.',
  'Sukces to zaplanowany wynik, nie przypadek.',
  'Zarządzaj oczekiwaniami tak samo pilnie jak zakresem.',
];

// ==================== STORAGE ====================
const Storage = {
  _get(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  _set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error('Storage error', e); }
  },
  getHistory()           { return this._get('quiz_history', []); },
  saveResult(r)          { const h = this.getHistory(); h.push(r); this._set('quiz_history', h); },
  getStreakData()         { return this._get('streak_data', {}); },
  saveStreakData(d)       { this._set('streak_data', d); },
  getWeakQuestions()     { return this._get('weak_questions', {}); },
  saveWeakQuestions(wq)  { this._set('weak_questions', wq); },
  getUnlockedBadges()    { return this._get('unlocked_badges', []); },
  saveUnlockedBadges(b)  { this._set('unlocked_badges', b); },
};
```

- [ ] **Krok 2: Utwórz `tests/test_logic.js` z testami Storage**

```javascript
// tests/test_logic.js — Node.js test runner (no dependencies)
// Run: node tests/test_logic.js

// Mock localStorage for Node
const _store = {};
global.localStorage = {
  getItem: k => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = v; },
  removeItem: k => { delete _store[k]; },
};

// Load app modules (inject as IIFE — we require just the logic section)
// Copy Storage const here for isolated testing:
const Storage = {
  _get(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  getHistory()        { return this._get('quiz_history', []); },
  saveResult(r)       { const h = this.getHistory(); h.push(r); this._set('quiz_history', h); },
  getStreakData()      { return this._get('streak_data', {}); },
  saveStreakData(d)    { this._set('streak_data', d); },
  getWeakQuestions()  { return this._get('weak_questions', {}); },
  saveWeakQuestions(w){ this._set('weak_questions', w); },
  getUnlockedBadges() { return this._get('unlocked_badges', []); },
  saveUnlockedBadges(b){ this._set('unlocked_badges', b); },
};

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function assert(val, msg) { if (!val) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

console.log('\nStorage tests:');
test('getHistory returns [] initially', () => assertEqual(Storage.getHistory(), []));
test('saveResult persists one result', () => {
  Storage.saveResult({ date: '2026-01-01', percent: 80, total: 10 });
  assert(Storage.getHistory().length === 1);
});
test('saveResult accumulates multiple results', () => {
  Storage.saveResult({ date: '2026-01-02', percent: 90, total: 10 });
  assert(Storage.getHistory().length === 2);
});
test('getStreakData returns {} initially', () => {
  _store['streak_data'] = undefined;
  assertEqual(Storage.getStreakData(), {});
});
test('saveStreakData and read back', () => {
  Storage.saveStreakData({ '2026-01-01': 'daily' });
  assertEqual(Storage.getStreakData(), { '2026-01-01': 'daily' });
});
test('getWeakQuestions returns {} initially', () => {
  assertEqual(Storage.getWeakQuestions(), {});
});
test('getUnlockedBadges returns [] initially', () => {
  assertEqual(Storage.getUnlockedBadges(), []);
});

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
```

- [ ] **Krok 3: Uruchom testy**

```bash
node tests/test_logic.js
```

Oczekiwany wynik: `7 passed, 0 failed`

- [ ] **Krok 4: Commit**

```bash
git add app.js tests/test_logic.js
git commit -m "feat: Storage module with localStorage helpers + tests"
```

---

## Task 4: QuizEngine module + testy

**Files:**
- Modify: `pmp-quiz-app/app.js` (dodaj QuizEngine po Storage)
- Modify: `tests/test_logic.js` (dodaj testy QuizEngine)

- [ ] **Krok 1: Dodaj QuizEngine do `app.js` (po bloku Storage)**

```javascript
// ==================== QUIZ ENGINE ====================
const QuizEngine = {
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  selectQuestions(allQuestions, mode, domains = []) {
    if (mode === 'weak') {
      const wq = Storage.getWeakQuestions();
      let pool = [];
      allQuestions.forEach(q => {
        const count = wq[q.id] || 0;
        if (count > 0) {
          const weight = Math.min(count * 3, 9);
          for (let i = 0; i < weight; i++) pool.push(q);
        }
      });
      pool = this.shuffle(pool);
      const seen = new Set();
      return pool.filter(q => { if (seen.has(q.id)) return false; seen.add(q.id); return true; })
                 .slice(0, QUIZ_SIZES.weak);
    }
    let pool = domains.length > 0
      ? allQuestions.filter(q => domains.includes(q.domain))
      : [...allQuestions];
    const size = mode === 'daily' ? QUIZ_SIZES.daily : QUIZ_SIZES.quick;
    return this.shuffle(pool).slice(0, size);
  },

  shuffleAnswers(question) {
    const indexed = question.answers.map((text, i) => ({ text, isCorrect: i === question.correct }));
    const shuffled = this.shuffle(indexed);
    return {
      displayAnswers: shuffled.map(a => a.text),
      correctDisplayIndex: shuffled.findIndex(a => a.isCorrect),
    };
  },

  countWeakQuestions(allQuestions) {
    const wq = Storage.getWeakQuestions();
    return allQuestions.filter(q => (wq[q.id] || 0) > 0).length;
  },

  recordAnswer(questionId, wasCorrect) {
    const wq = Storage.getWeakQuestions();
    if (!wasCorrect) {
      wq[questionId] = (wq[questionId] || 0) + 1;
    } else if (wq[questionId]) {
      wq[questionId] = Math.max(0, wq[questionId] - 1);
      if (wq[questionId] === 0) delete wq[questionId];
    }
    Storage.saveWeakQuestions(wq);
  },
};
```

- [ ] **Krok 2: Dodaj testy QuizEngine do `tests/test_logic.js`** (po sekcji Storage tests)

```javascript
// Paste QuizEngine definition here too (same as app.js, but Storage mock already set up above)
const QuizEngine = {
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  selectQuestions(allQuestions, mode, domains = []) {
    if (mode === 'weak') {
      const wq = Storage.getWeakQuestions();
      let pool = [];
      allQuestions.forEach(q => {
        const count = wq[q.id] || 0;
        if (count > 0) { const w = Math.min(count * 3, 9); for (let i = 0; i < w; i++) pool.push(q); }
      });
      pool = this.shuffle(pool);
      const seen = new Set();
      return pool.filter(q => { if (seen.has(q.id)) return false; seen.add(q.id); return true; }).slice(0, 10);
    }
    let pool = domains.length > 0 ? allQuestions.filter(q => domains.includes(q.domain)) : [...allQuestions];
    const size = mode === 'daily' ? 30 : 10;
    return this.shuffle(pool).slice(0, size);
  },
  shuffleAnswers(q) {
    const indexed = q.answers.map((text, i) => ({ text, isCorrect: i === q.correct }));
    const shuffled = this.shuffle(indexed);
    return { displayAnswers: shuffled.map(a => a.text), correctDisplayIndex: shuffled.findIndex(a => a.isCorrect) };
  },
  countWeakQuestions(all) {
    const wq = Storage.getWeakQuestions();
    return all.filter(q => (wq[q.id] || 0) > 0).length;
  },
  recordAnswer(id, wasCorrect) {
    const wq = Storage.getWeakQuestions();
    if (!wasCorrect) { wq[id] = (wq[id] || 0) + 1; }
    else if (wq[id]) { wq[id] = Math.max(0, wq[id] - 1); if (wq[id] === 0) delete wq[id]; }
    Storage.saveWeakQuestions(wq);
  },
};

const mockQuestions = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, domain: i % 2 === 0 ? 'Risk' : 'Cost',
  question: `Q${i+1}`, answers: ['A','B','C','D'], correct: 0, explanation: 'E'
}));

console.log('\nQuizEngine tests:');
test('shuffle returns same length', () => assert(QuizEngine.shuffle([1,2,3]).length === 3));
test('shuffle does not mutate original', () => { const a = [1,2,3]; QuizEngine.shuffle(a); assertEqual(a, [1,2,3]); });
test('selectQuestions daily returns max 30', () => {
  assert(QuizEngine.selectQuestions(mockQuestions, 'daily').length <= 30);
});
test('selectQuestions quick returns 10 when pool >= 10', () => {
  assert(QuizEngine.selectQuestions(mockQuestions, 'quick').length === 10);
});
test('selectQuestions filters by domain', () => {
  const r = QuizEngine.selectQuestions(mockQuestions, 'quick', ['Risk']);
  assert(r.every(q => q.domain === 'Risk'));
});
test('shuffleAnswers preserves correct answer', () => {
  const q = { answers: ['W','X','Y','Z'], correct: 2 };
  const { displayAnswers, correctDisplayIndex } = QuizEngine.shuffleAnswers(q);
  assertEqual(displayAnswers[correctDisplayIndex], 'Y');
});
test('recordAnswer increments weak count on wrong', () => {
  _store['weak_questions'] = undefined;
  QuizEngine.recordAnswer(99, false);
  assertEqual(Storage.getWeakQuestions()[99], 1);
});
test('recordAnswer decrements on correct', () => {
  QuizEngine.recordAnswer(99, true);
  assert(!Storage.getWeakQuestions()[99]);
});
test('countWeakQuestions counts ids with count > 0', () => {
  QuizEngine.recordAnswer(1, false);
  QuizEngine.recordAnswer(2, false);
  assert(QuizEngine.countWeakQuestions(mockQuestions) === 2);
});
```

- [ ] **Krok 3: Uruchom testy**

```bash
node tests/test_logic.js
```

Oczekiwany wynik: `16 passed, 0 failed`

- [ ] **Krok 4: Commit**

```bash
git add app.js tests/test_logic.js
git commit -m "feat: QuizEngine module (select, shuffle, weak questions tracking) + tests"
```

---

## Task 5: StreakManager + BadgeManager + StatsManager + testy

**Files:**
- Modify: `pmp-quiz-app/app.js`
- Modify: `tests/test_logic.js`

- [ ] **Krok 1: Dodaj StreakManager do `app.js` (po QuizEngine)**

```javascript
// ==================== STREAK MANAGER ====================
const StreakManager = {
  markDailyDone() {
    const data = Storage.getStreakData();
    data[TODAY()] = 'daily';
    Storage.saveStreakData(data);
  },
  markActivityDone() {
    const data = Storage.getStreakData();
    if (data[TODAY()] !== 'daily') data[TODAY()] = 'activity';
    Storage.saveStreakData(data);
  },
  isDailyDoneToday() {
    return Storage.getStreakData()[TODAY()] === 'daily';
  },
  getCurrentStreak() {
    const data = Storage.getStreakData();
    let streak = 0;
    const d = new Date();
    if (data[TODAY()] !== 'daily') d.setDate(d.getDate() - 1);
    for (let i = 0; i < 366; i++) {
      const key = d.toISOString().slice(0, 10);
      if (data[key] === 'daily') { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  },
  getLast30Days() {
    const data = Storage.getStreakData();
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      return { date: key, status: data[key] || 'none' };
    });
  },
};

// ==================== BADGE MANAGER ====================
const BadgeManager = {
  buildStats() {
    const history = Storage.getHistory();
    const totalAnswered = history.reduce((s, r) => s + (r.total || 0), 0);
    const totalQuizzes = history.length;
    const currentStreak = StreakManager.getCurrentStreak();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const last30 = history.filter(r => new Date(r.date) >= cutoff);
    const avg30 = last30.length
      ? Math.round(last30.reduce((s, r) => s + r.percent, 0) / last30.length) : 0;
    const hadPerfectQuiz = history.some(r => r.percent === 100);
    return { totalAnswered, totalQuizzes, currentStreak, avg30, hadPerfectQuiz };
  },
  checkAndUnlock() {
    const stats = this.buildStats();
    const unlocked = Storage.getUnlockedBadges();
    const newBadges = [];
    BADGES_DEF.forEach(b => {
      if (!unlocked.includes(b.id) && b.check(stats)) {
        unlocked.push(b.id);
        newBadges.push(b);
      }
    });
    if (newBadges.length) Storage.saveUnlockedBadges(unlocked);
    return newBadges;
  },
};

// ==================== STATS MANAGER ====================
const StatsManager = {
  getAvg(days) {
    const history = Storage.getHistory();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const recent = history.filter(r => new Date(r.date) >= cutoff);
    if (!recent.length) return null;
    return Math.round(recent.reduce((s, r) => s + r.percent, 0) / recent.length);
  },
  getPerDomain(questions) {
    const history = Storage.getHistory();
    const domains = [...new Set(questions.map(q => q.domain).filter(Boolean))].sort();
    return domains.map(domain => {
      const entries = history.flatMap(r => r.domainResults || []).filter(d => d.domain === domain);
      if (!entries.length) return { domain, percent: null };
      return { domain, percent: Math.round(entries.reduce((s, d) => s + d.percent, 0) / entries.length) };
    });
  },
  getTotals() {
    const h = Storage.getHistory();
    return { quizzes: h.length, answered: h.reduce((s, r) => s + (r.total || 0), 0) };
  },
};
```

- [ ] **Krok 2: Dodaj testy do `tests/test_logic.js`**

Paste StreakManager, BadgeManager, StatsManager (same code as above) then add:

```javascript
console.log('\nStreakManager tests:');
test('getCurrentStreak is 0 with no data', () => {
  _store['streak_data'] = undefined;
  assertEqual(StreakManager.getCurrentStreak(), 0);
});
test('markDailyDone sets today', () => {
  StreakManager.markDailyDone();
  assert(StreakManager.isDailyDoneToday());
});
test('getLast30Days returns 30 items', () => {
  assert(StreakManager.getLast30Days().length === 30);
});
test('getCurrentStreak counts consecutive daily days', () => {
  const data = {};
  for (let i = 0; i < 5; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    data[d.toISOString().slice(0, 10)] = 'daily';
  }
  Storage.saveStreakData(data);
  assertEqual(StreakManager.getCurrentStreak(), 5);
});
test('activity day does not count to streak', () => {
  const data = {};
  const d = new Date(); d.setDate(d.getDate() - 1);
  data[d.toISOString().slice(0, 10)] = 'activity';
  Storage.saveStreakData(data);
  assertEqual(StreakManager.getCurrentStreak(), 0);
});

console.log('\nBadgeManager tests:');
test('no badges for empty history', () => {
  _store['quiz_history'] = undefined;
  _store['unlocked_badges'] = undefined;
  _store['streak_data'] = undefined;
  assertEqual(BadgeManager.checkAndUnlock(), []);
});
test('first badge after 1 quiz', () => {
  Storage.saveResult({ date: TODAY(), percent: 80, total: 10 });
  const newBadges = BadgeManager.checkAndUnlock();
  assert(newBadges.some(b => b.id === 'first'));
});
test('perfect badge on 100%', () => {
  _store['unlocked_badges'] = undefined;
  Storage.saveResult({ date: TODAY(), percent: 100, total: 10 });
  const newBadges = BadgeManager.checkAndUnlock();
  assert(newBadges.some(b => b.id === 'perfect'));
});
```

- [ ] **Krok 3: Uruchom testy**

```bash
node tests/test_logic.js
```

Oczekiwany wynik: wszystkie passed

- [ ] **Krok 4: Commit**

```bash
git add app.js tests/test_logic.js
git commit -m "feat: StreakManager, BadgeManager, StatsManager modules + tests"
```

---

## Task 6: App router + LoadingView + inicjalizacja

**Files:**
- Modify: `pmp-quiz-app/app.js` (dodaj na końcu: App state, views skeleton, router)

- [ ] **Krok 1: Dodaj do `app.js`**

```javascript
// ==================== APP STATE ====================
const AppState = {
  questions: [],
  quizSession: null,   // { questions, current, answers, mode, shuffledMap }
  pendingMode: null,   // 'daily' | 'quick' | 'weak'
  pendingDomains: [],
};

// ==================== VIEWS (stubs — filled in later tasks) ====================
const Views = {};

// ==================== ROUTER ====================
const App = {
  currentView: 'loading',

  navigate(view, params = {}) {
    Object.assign(AppState, params);
    this.currentView = view;
    this.render();
    window.scrollTo(0, 0);
  },

  render() {
    const view = Views[this.currentView];
    if (!view) { console.error('Unknown view:', this.currentView); return; }
    document.getElementById('app').innerHTML = view.render();
    view.init?.();
  },

  async init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
    }
    // Show loading screen immediately
    this.navigate('loading');
    // Load questions
    try {
      const res = await fetch('./questions.json');
      AppState.questions = await res.json();
    } catch (e) {
      console.error('Failed to load questions.json', e);
      AppState.questions = [];
    }
    // Minimum loading display time (UX)
    await new Promise(r => setTimeout(r, 1200));
    this.navigate('home');
  },
};

// ==================== LOADING VIEW ====================
Views.loading = {
  render() {
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return `
      <div class="loading-screen">
        <div class="loading-logo">📋</div>
        <h1>PMP Quiz</h1>
        <p class="loading-quote">"${quote}"</p>
        <div class="loading-spinner"></div>
      </div>`;
  },
};

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', () => App.init());
```

- [ ] **Krok 2: Przetestuj w przeglądarce**

Otwórz `pmp-quiz-app/index.html` bezpośrednio (file://) lub przez lokalny serwer:
```bash
cd pmp-quiz-app && python3 -m http.server 8080
```
Otwórz http://localhost:8080. Powinna pojawić się loading screen z losowym cytatem przez ~1.2s, a potem błąd konsoli "Unknown view: home" (oczekiwane — Home jeszcze nie zaimplementowany).

- [ ] **Krok 3: Commit**

```bash
git add app.js
git commit -m "feat: App router, AppState, LoadingView, SW registration"
```

---

## Task 7: HomeView

**Files:**
- Modify: `pmp-quiz-app/app.js`

- [ ] **Krok 1: Dodaj `Views.home` do `app.js` (przed `Views.loading`)**

```javascript
// ==================== HOME VIEW ====================
Views.home = {
  render() {
    const streak = StreakManager.getCurrentStreak();
    const dailyDone = StreakManager.isDailyDoneToday();
    const days = StreakManager.getLast30Days();
    const dots = days.map(d =>
      `<div class="streak-dot streak-dot--${d.status}" title="${d.date}"></div>`
    ).join('');

    const streakLabel = streak === 0 ? '⚡ Zacznij serię!'
      : streak === 1 ? '🔥 1 dzień z rzędu'
      : `🔥 ${streak} dni z rzędu`;

    return `
      <div class="screen home">
        <div class="streak-widget">
          <div class="streak-count">${streakLabel}</div>
          <div class="streak-dots">${dots}</div>
        </div>
        <div class="menu">
          <button class="menu-btn menu-btn--daily ${dailyDone ? 'done' : 'pending'}"
                  onclick="App.navigate('daily-start')">
            <span class="menu-btn__icon">${dailyDone ? '✅' : '🔴'}</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">Codzienne Wyzwanie</div>
              <div class="menu-btn__sub">30 pytań · ${dailyDone ? 'Ukończono dziś ✓' : 'Wymagane dziś'}</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
          <button class="menu-btn" onclick="App.navigate('mode-select')">
            <span class="menu-btn__icon">⚡</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">Szybki Quiz</div>
              <div class="menu-btn__sub">10 pytań · losowe</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
          <button class="menu-btn" onclick="App.navigate('stats')">
            <span class="menu-btn__icon">📊</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">Statystyki</div>
              <div class="menu-btn__sub">Twój postęp</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
        </div>
      </div>`;
  },
};
```

- [ ] **Krok 2: Przetestuj w przeglądarce**

Po załadowaniu powinna pojawić się strona główna z: widgetem serii (30 szarych kółek), przyciskiem Codzienne Wyzwanie z pulsującą czerwoną kropką, Szybkim Quizem i Statystykami. Kliknięcie przycisków daje błąd konsoli (oczekiwane).

- [ ] **Krok 3: Commit**

```bash
git add app.js
git commit -m "feat: HomeView with streak calendar widget"
```

---

## Task 8: ModeSelectView (selektor trybu + filtr domenowy)

**Files:**
- Modify: `pmp-quiz-app/app.js`

- [ ] **Krok 1: Dodaj `Views['mode-select']` do `app.js`**

```javascript
// ==================== MODE SELECT VIEW ====================
Views['mode-select'] = {
  selectedMode: 'quick',
  selectedDomains: [],

  render() {
    const domains = [...new Set(AppState.questions.map(q => q.domain).filter(Boolean))].sort();
    const weakCount = QuizEngine.countWeakQuestions(AppState.questions);
    const weakDisabled = weakCount < 10;

    const domainChips = domains.map(d => {
      const sel = this.selectedDomains.includes(d);
      return `<div class="domain-chip ${sel ? 'selected' : ''}"
                   onclick="Views['mode-select'].toggleDomain('${d}')">${d}</div>`;
    }).join('');

    return `
      <div class="screen mode-select">
        <button class="btn-back" onclick="App.navigate('home')">‹ Wróć</button>
        <h2>Szybki Quiz</h2>
        <div class="mode-card ${this.selectedMode === 'quick' ? 'selected' : ''}"
             onclick="Views['mode-select'].selectMode('quick')">
          <h3>⚡ Standardowy Quiz</h3>
          <p>10 losowych pytań z wybranych domen</p>
          <div class="domain-filter" style="margin-top:12px">
            <label>Filtruj domeny (domyślnie wszystkie):</label>
            <div class="domain-chips">${domainChips}</div>
          </div>
        </div>
        <div class="mode-card ${this.selectedMode === 'weak' ? 'selected' : ''} ${weakDisabled ? 'disabled' : ''}"
             onclick="Views['mode-select'].selectMode('weak')">
          <h3>🎯 Moje słabe pytania</h3>
          <p>${weakDisabled
            ? `Potrzebujesz ≥ 10 błędnych pytań — masz ${weakCount}`
            : `${weakCount} pytań do powtórki`}</p>
        </div>
        <button class="btn-primary" style="margin-top:8px"
                onclick="Views['mode-select'].startQuiz()">
          Start →
        </button>
      </div>`;
  },

  toggleDomain(domain) {
    const idx = this.selectedDomains.indexOf(domain);
    if (idx >= 0) this.selectedDomains.splice(idx, 1);
    else this.selectedDomains.push(domain);
    App.render();
  },

  selectMode(mode) {
    this.selectedMode = mode;
    App.render();
  },

  startQuiz() {
    const questions = QuizEngine.selectQuestions(
      AppState.questions,
      this.selectedMode,
      this.selectedDomains
    );
    if (!questions.length) {
      alert('Brak pytań dla wybranych filtrów. Zmień ustawienia.');
      return;
    }
    AppState.quizSession = { questions, current: 0, answers: [], mode: this.selectedMode };
    this.selectedDomains = [];
    this.selectedMode = 'quick';
    App.navigate('quiz');
  },

  init() {},
};
```

- [ ] **Krok 2: Dodaj `Views['daily-start']` (uruchamia daily bez ekranu wyboru)**

```javascript
// ==================== DAILY START (direct launch) ====================
Views['daily-start'] = {
  render() { return `<div class="loading-screen"><div class="loading-spinner"></div></div>`; },
  init() {
    const questions = QuizEngine.selectQuestions(AppState.questions, 'daily');
    AppState.quizSession = { questions, current: 0, answers: [], mode: 'daily' };
    App.navigate('quiz');
  },
};
```

- [ ] **Krok 3: Przetestuj**

Kliknij "Szybki Quiz" → powinien pojawić się ekran wyboru z chipami domen. Kliknij domenę — powinna się zaznaczyć. Kliknij "Start" — konsola powinna pokazać błąd "Unknown view: quiz" (oczekiwane).

- [ ] **Krok 4: Commit**

```bash
git add app.js
git commit -m "feat: ModeSelectView with domain filter chips, DailyStart launcher"
```

---

## Task 9: QuizView — ekran pytania i logika odpowiedzi

**Files:**
- Modify: `pmp-quiz-app/app.js`

- [ ] **Krok 1: Dodaj `Views.quiz` do `app.js`**

```javascript
// ==================== QUIZ VIEW ====================
Views.quiz = {
  _shuffled: null,  // { displayAnswers, correctDisplayIndex } for current question

  render() {
    const session = AppState.quizSession;
    const q = session.questions[session.current];
    this._shuffled = QuizEngine.shuffleAnswers(q);
    const { displayAnswers, correctDisplayIndex } = this._shuffled;
    const total = session.questions.length;
    const pct = Math.round((session.current / total) * 100);
    const letters = ['A', 'B', 'C', 'D'];

    const answerBtns = displayAnswers.map((text, i) => `
      <button class="answer-btn" data-index="${i}"
              onclick="Views.quiz.selectAnswer(${i})">
        <span class="letter">${letters[i]}</span>
        <span>${text}</span>
      </button>`).join('');

    return `
      <div class="screen quiz">
        <div class="quiz-header">
          <span class="quiz-counter">${session.current + 1} / ${total}</span>
          ${q.domain ? `<span class="quiz-domain">${q.domain}</span>` : ''}
        </div>
        <div class="quiz-progress">
          <div class="quiz-progress__bar" style="width:${pct}%"></div>
        </div>
        <div class="quiz-question">${q.question}</div>
        <div class="quiz-answers" id="quiz-answers">${answerBtns}</div>
        <div id="explanation-panel" class="hidden"></div>
      </div>`;
  },

  selectAnswer(selectedIndex) {
    const session = AppState.quizSession;
    const q = session.questions[session.current];
    const { correctDisplayIndex } = this._shuffled;
    const isCorrect = selectedIndex === correctDisplayIndex;

    // Disable all buttons
    document.querySelectorAll('.answer-btn').forEach(btn => {
      btn.disabled = true;
      const idx = parseInt(btn.dataset.index);
      if (idx === correctDisplayIndex) btn.classList.add('correct');
      else if (idx === selectedIndex && !isCorrect) btn.classList.add('wrong');
    });

    // Record answer
    QuizEngine.recordAnswer(q.id, isCorrect);
    session.answers.push({
      questionId: q.id,
      domain: q.domain,
      correct: isCorrect,
    });

    if (isCorrect) {
      setTimeout(() => this.advance(), 1500);
    } else {
      const panel = document.getElementById('explanation-panel');
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <div class="explanation-panel">
          <p><strong>Wyjaśnienie:</strong> ${q.explanation}</p>
        </div>
        <button class="btn-next" onclick="Views.quiz.advance()" style="margin-top:10px">
          Dalej →
        </button>`;
    }
  },

  advance() {
    const session = AppState.quizSession;
    session.current++;
    if (session.current >= session.questions.length) {
      this.finishQuiz();
    } else {
      App.navigate('quiz');
    }
  },

  finishQuiz() {
    const session = AppState.quizSession;
    const correct = session.answers.filter(a => a.correct).length;
    const total = session.answers.length;
    const percent = Math.round((correct / total) * 100);

    // Calculate domain results
    const domainMap = {};
    session.answers.forEach(a => {
      if (!a.domain) return;
      if (!domainMap[a.domain]) domainMap[a.domain] = { correct: 0, total: 0 };
      domainMap[a.domain].total++;
      if (a.correct) domainMap[a.domain].correct++;
    });
    const domainResults = Object.entries(domainMap).map(([domain, d]) => ({
      domain, percent: Math.round((d.correct / d.total) * 100),
    }));
    const weakestDomain = domainResults.sort((a, b) => a.percent - b.percent)[0]?.domain || null;

    // Best streak
    let bestStreak = 0, curStreak = 0;
    session.answers.forEach(a => {
      if (a.correct) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
      else curStreak = 0;
    });

    // Save result
    const result = { date: TODAY(), mode: session.mode, correct, total, percent, domainResults };
    Storage.saveResult(result);

    // Update streak if daily
    let streakExtended = false;
    if (session.mode === 'daily') {
      StreakManager.markDailyDone();
      streakExtended = true;
    } else {
      StreakManager.markActivityDone();
    }

    // Store summary data
    AppState.lastSummary = { correct, total, percent, bestStreak, weakestDomain, streakExtended, mode: session.mode };
    AppState.quizSession = null;

    App.navigate('summary');
  },

  init() {},
};
```

- [ ] **Krok 2: Przetestuj**

Uruchom daily lub szybki quiz. Powinna wyświetlić się pytania z przyciskami A-D. Kliknij poprawną odpowiedź — powinna zieleneć i przejść automatycznie. Kliknij błędną — powinna czerwonieć, pojawi się wyjaśnienie i przycisk "Dalej".

- [ ] **Krok 3: Commit**

```bash
git add app.js
git commit -m "feat: QuizView with answer feedback, explanation panel, finish logic"
```

---

## Task 10: SummaryView + konfetti

**Files:**
- Modify: `pmp-quiz-app/app.js`

- [ ] **Krok 1: Dodaj funkcję konfetti i `Views.summary` do `app.js`**

```javascript
// ==================== CONFETTI ====================
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899'];
  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 40,
    r: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    speed: Math.random() * 3 + 2,
    drift: (Math.random() - 0.5) * 2,
    spin: (Math.random() - 0.5) * 0.15,
    angle: Math.random() * Math.PI * 2,
  }));
  let raf;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.y += p.speed; p.x += p.drift; p.angle += p.spin;
      if (p.y < canvas.height + 10) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.5);
      ctx.restore();
    });
    if (alive) raf = requestAnimationFrame(animate);
    else canvas.remove();
  };
  animate();
  setTimeout(() => { cancelAnimationFrame(raf); canvas.remove(); }, 4000);
}

// ==================== SUMMARY VIEW ====================
Views.summary = {
  render() {
    const s = AppState.lastSummary;
    if (!s) { App.navigate('home'); return ''; }
    const barColor = s.percent >= 80 ? 'var(--green)' : s.percent >= 60 ? 'var(--yellow)' : 'var(--red)';
    const emoji = s.percent >= 80 ? '🎉' : s.percent >= 60 ? '👍' : '💪';

    return `
      <div class="screen summary">
        <div class="summary__title">${emoji} Quiz ukończony!</div>
        ${s.streakExtended ? `<div class="summary__streak-msg">🔥 Seria przedłużona!</div>` : ''}
        <div class="summary__score-circle">
          <div class="summary__score-num">${s.correct}/${s.total}</div>
          <div class="summary__score-pct">${s.percent}%</div>
        </div>
        <div class="summary__progress">
          <div class="summary__progress-bar"
               style="width:0%;background:${barColor}"
               data-target="${s.percent}"></div>
        </div>
        <div class="summary__details">
          <div class="summary__detail">
            <span>Najlepsza seria:</span>
            <span>${s.bestStreak} ✓ pod rząd</span>
          </div>
          ${s.weakestDomain ? `
          <div class="summary__detail">
            <span>Najsłabsza domena:</span>
            <span>${s.weakestDomain}</span>
          </div>` : ''}
        </div>
        <div class="summary__actions">
          <button class="btn-secondary" onclick="App.navigate('home')">Menu</button>
          <button class="btn-primary" style="flex:1"
                  onclick="Views.summary.replay()">Zagraj ponownie</button>
        </div>
      </div>`;
  },

  init() {
    const s = AppState.lastSummary;
    if (!s) return;
    // Animate progress bar
    setTimeout(() => {
      const bar = document.querySelector('.summary__progress-bar');
      if (bar) bar.style.width = bar.dataset.target + '%';
    }, 100);
    // Confetti on good score
    if (s.percent >= 80) setTimeout(launchConfetti, 300);
    // Check badges
    const newBadges = BadgeManager.checkAndUnlock();
    if (newBadges.length) {
      let delay = 800;
      newBadges.forEach(b => { setTimeout(() => showBadgePopup(b), delay); delay += 2500; });
    }
  },

  replay() {
    const mode = AppState.lastSummary?.mode;
    if (mode === 'daily') App.navigate('daily-start');
    else App.navigate('mode-select');
  },
};

// ==================== BADGE POPUP ====================
function showBadgePopup(badge) {
  const popup = document.getElementById('badge-popup');
  popup.classList.remove('hidden');
  popup.innerHTML = `
    <div class="badge-popup__emoji">${badge.emoji}</div>
    <div class="badge-popup__text">
      <strong>Odznaka odblokowana!</strong>
      <span>${badge.name} — ${badge.desc}</span>
    </div>`;
  popup.classList.add('visible');
  setTimeout(() => {
    popup.classList.remove('visible');
    setTimeout(() => popup.classList.add('hidden'), 400);
  }, 2200);
}
```

- [ ] **Krok 2: Przetestuj**

Ukończ quiz. Powinien pojawić się ekran podsumowania z animowanym paskiem, wynikami, i konfetti jeśli ≥ 80%. Sprawdź czy przy pierwszym quizie pojawia się popup odznaki "Pierwszy krok".

- [ ] **Krok 3: Commit**

```bash
git add app.js
git commit -m "feat: SummaryView, confetti animation, badge popup"
```

---

## Task 11: StatsView

**Files:**
- Modify: `pmp-quiz-app/app.js`

- [ ] **Krok 1: Dodaj `Views.stats` do `app.js`**

```javascript
// ==================== STATS VIEW ====================
Views.stats = {
  render() {
    const avg3  = StatsManager.getAvg(3);
    const avg7  = StatsManager.getAvg(7);
    const avg30 = StatsManager.getAvg(30);
    const totals = StatsManager.getTotals();
    const perDomain = StatsManager.getPerDomain(AppState.questions);
    const unlocked = Storage.getUnlockedBadges();
    const days = StreakManager.getLast30Days();

    const avgVal = v => v !== null ? `${v}%` : '—';
    const domainBars = perDomain.map(d => `
      <div class="domain-bar">
        <span class="domain-bar__name">${d.domain}</span>
        <div class="domain-bar__track">
          <div class="domain-bar__fill"
               style="width:0%" data-target="${d.percent ?? 0}"
               ${d.percent === null ? 'style="width:0%"' : ''}></div>
        </div>
        <span class="domain-bar__pct">${d.percent !== null ? d.percent + '%' : '—'}</span>
      </div>`).join('');

    const badgeItems = BADGES_DEF.map(b => `
      <div class="badge-item ${unlocked.includes(b.id) ? '' : 'locked'}">
        <div class="badge-item__emoji">${b.emoji}</div>
        <div class="badge-item__name">${b.name}</div>
      </div>`).join('');

    const calDots = days.map(d =>
      `<div class="streak-dot streak-dot--${d.status}" title="${d.date}"></div>`
    ).join('');

    return `
      <div class="screen stats">
        <button class="btn-back" onclick="App.navigate('home')">‹ Wróć</button>
        <h1>Statystyki</h1>

        <div class="stats-card">
          <h3>Średnia poprawnych odpowiedzi</h3>
          <div class="avg-row">
            <div class="avg-item">
              <div class="avg-item__val">${avgVal(avg3)}</div>
              <div class="avg-item__label">3 dni</div>
            </div>
            <div class="avg-item">
              <div class="avg-item__val">${avgVal(avg7)}</div>
              <div class="avg-item__label">7 dni</div>
            </div>
            <div class="avg-item">
              <div class="avg-item__val">${avgVal(avg30)}</div>
              <div class="avg-item__label">30 dni</div>
            </div>
          </div>
        </div>

        <div class="stats-card">
          <h3>Łącznie</h3>
          <div class="totals">
            <div class="total-item">
              <div class="total-item__val">${totals.quizzes}</div>
              <div class="total-item__label">Quizy</div>
            </div>
            <div class="total-item">
              <div class="total-item__val">${totals.answered}</div>
              <div class="total-item__label">Pytania</div>
            </div>
          </div>
        </div>

        ${perDomain.length ? `
        <div class="stats-card">
          <h3>Per domena</h3>
          ${domainBars}
        </div>` : ''}

        <div class="stats-card">
          <h3>Aktywność (30 dni)</h3>
          <div class="streak-dots">${calDots}</div>
        </div>

        <div class="stats-card">
          <h3>Odznaki</h3>
          <div class="badges-grid">${badgeItems}</div>
        </div>
      </div>`;
  },

  init() {
    // Animate domain bars
    setTimeout(() => {
      document.querySelectorAll('.domain-bar__fill[data-target]').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    }, 100);
  },
};
```

- [ ] **Krok 2: Przetestuj**

Kliknij Statystyki. Powinny pojawić się: karty ze średnimi (— dla pustej historii), łączne liczniki, słupki domen (animowane), kalendarz 30 dni, siatka odznak (6 szarych, 1 kolorowa jeśli ukończono quiz).

- [ ] **Krok 3: Commit**

```bash
git add app.js
git commit -m "feat: StatsView with averages, domain bars, calendar, badges gallery"
```

---

## Task 12: Python — narzędzie ekstrakcji pytań z PDF

**Files:**
- Create: `tools/extract_questions.py`
- Create: `tools/requirements.txt`
- Create: `tools/test_pipeline.py`

- [ ] **Krok 1: Utwórz `tools/requirements.txt`**

```
pdfplumber==0.11.4
openpyxl==3.1.2
pytest==8.2.0
Pillow==10.3.0
```

- [ ] **Krok 2: Zainstaluj zależności**

```bash
pip install -r tools/requirements.txt --break-system-packages
```

- [ ] **Krok 3: Utwórz `tools/extract_questions.py`**

```python
#!/usr/bin/env python3
"""
Ekstrahuje pytania z plików PDF PMP i zapisuje do questions_en.xlsx.
Użycie: python tools/extract_questions.py
"""
import pdfplumber
import openpyxl
import re
import random
import os
import sys

PDF_FILES = [
    "404451735-Questions-and-Answers-PMP-Exam-Prep.pdf",
    "983625620-PMP-Exam-Prep-2025-2026-All-In-One-Guide-to-Passing-With-Confidence-Including-1-100-Practice-Test-Proven-Strategies-to-Get-Publication-NewGrade.pdf",
]

PMP_DOMAINS = ['Risk', 'Cost', 'Schedule', 'Scope', 'Quality', 'Resource',
               'Communications', 'Stakeholder', 'Procurement', 'Integration',
               'People', 'Process', 'Business Environment']

DOMAIN_KEYWORDS = {
    'Risk': ['risk', 'threat', 'opportunity', 'probability', 'impact', 'mitigation'],
    'Cost': ['cost', 'budget', 'EVM', 'earned value', 'CPI', 'CV', 'BAC', 'EAC'],
    'Schedule': ['schedule', 'SPI', 'SV', 'critical path', 'float', 'slack', 'CPM'],
    'Scope': ['scope', 'WBS', 'requirements', 'deliverable', 'change request'],
    'Quality': ['quality', 'QA', 'QC', 'defect', 'audit', 'process improvement'],
    'Resource': ['resource', 'team', 'RACI', 'staffing', 'training', 'HR'],
    'Communications': ['communication', 'report', 'stakeholder', 'message', 'channel'],
    'Stakeholder': ['stakeholder', 'engagement', 'register', 'influence', 'interest'],
    'Procurement': ['procurement', 'contract', 'vendor', 'RFP', 'SOW', 'make-or-buy'],
    'Integration': ['integration', 'charter', 'project plan', 'change control', 'lessons'],
    'People': ['servant leader', 'emotional intelligence', 'conflict', 'motivation', 'team'],
    'Process': ['process group', 'knowledge area', 'initiating', 'planning', 'executing'],
    'Business Environment': ['compliance', 'governance', 'benefit', 'strategy', 'organization'],
}


def infer_domain(question_text, explanation_text=''):
    text = (question_text + ' ' + explanation_text).lower()
    scores = {domain: 0 for domain in PMP_DOMAINS}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                scores[domain] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else 'General'


def extract_text_from_pdf(path):
    pages = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return '\n'.join(pages)


def parse_questions(text):
    """
    Parses common PMP PDF question formats:
    - Numbered questions: "1." or "Question 1:" or "1)"
    - Answer choices: "A." "B." "C." "D." or "A)" "(A)"
    - Correct answer: "Answer: B" or "Correct Answer: B" or "The correct answer is B"
    - Explanation: text after correct answer marker
    """
    questions = []

    # Split into question blocks by question number
    # Pattern: line starting with number followed by period/paren/colon
    block_pattern = re.compile(
        r'(?:^|\n)(?:Question\s+)?(\d+)[.):\s]+(.+?)(?=(?:^|\n)(?:Question\s+)?\d+[.):\s]|\Z)',
        re.DOTALL | re.MULTILINE | re.IGNORECASE
    )

    answer_choice_pattern = re.compile(
        r'(?:^|\n)\s*[(\[]?([A-D])[.):\]\s]\s*(.+?)(?=(?:^|\n)\s*[(\[]?[A-D][.):\]\s]|(?:^|\n)\s*(?:Answer|Correct)|$)',
        re.DOTALL | re.MULTILINE
    )

    correct_pattern = re.compile(
        r'(?:Answer|Correct\s+Answer|The\s+correct\s+answer\s+is)[:\s]+([A-D])',
        re.IGNORECASE
    )

    explanation_pattern = re.compile(
        r'(?:Explanation|Rationale|Because|Since)[:\s]+(.+?)(?=(?:^|\n)(?:Question\s+)?\d+[.):\s]|\Z)',
        re.DOTALL | re.IGNORECASE
    )

    for match in block_pattern.finditer(text):
        block = match.group(2).strip()
        lines = block.split('\n')
        question_lines = []
        rest = block

        # Extract question text (lines before answer choices)
        for i, line in enumerate(lines):
            if re.match(r'\s*[(\[]?[A-D][.):\]\s]', line):
                rest = '\n'.join(lines[i:])
                break
            question_lines.append(line.strip())

        question_text = ' '.join(q for q in question_lines if q).strip()
        if len(question_text) < 20:
            continue

        # Extract answer choices
        choices = {}
        for cm in answer_choice_pattern.finditer(rest):
            letter = cm.group(1).upper()
            text = re.sub(r'\s+', ' ', cm.group(2)).strip()
            if text:
                choices[letter] = text

        if len(choices) < 2:
            continue

        # Extract correct answer
        correct_match = correct_pattern.search(rest)
        if not correct_match:
            continue
        correct_letter = correct_match.group(1).upper()
        if correct_letter not in choices:
            continue

        # Extract explanation
        exp_match = explanation_pattern.search(rest)
        explanation = re.sub(r'\s+', ' ', exp_match.group(1)).strip() if exp_match else ''

        # Build answer list with correct at determined position, others shuffled
        other_letters = [l for l in ['A', 'B', 'C', 'D'] if l in choices and l != correct_letter]
        random.shuffle(other_letters)
        all_letters = ['A', 'B', 'C', 'D']
        # Shuffle placement of correct answer
        correct_col = random.choice(all_letters)
        remaining_cols = [c for c in all_letters if c != correct_col]
        mapping = {correct_col: correct_letter}
        for col, src in zip(remaining_cols, other_letters):
            mapping[col] = src

        answers = {col: choices.get(mapping[col], '') for col in all_letters}

        questions.append({
            'question': question_text,
            'answer_a': answers['A'],
            'answer_b': answers['B'],
            'answer_c': answers['C'],
            'answer_d': answers['D'],
            'correct': correct_col,
            'explanation': explanation,
        })

    return questions


def remove_duplicates(questions):
    seen = set()
    unique = []
    for q in questions:
        key = re.sub(r'\s+', ' ', q['question'][:80].lower().strip())
        if key not in seen:
            seen.add(key)
            unique.append(q)
    return unique


def save_to_excel(questions, output_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Questions'
    headers = ['ID', 'Domain', 'Question', 'Answer_A', 'Answer_B', 'Answer_C', 'Answer_D', 'Correct', 'Explanation']
    ws.append(headers)

    # Style header row
    from openpyxl.styles import Font, PatternFill, Alignment
    header_fill = PatternFill(start_color='6366F1', end_color='6366F1', fill_type='solid')
    for cell in ws[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')

    # Set column widths
    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 16
    ws.column_dimensions['C'].width = 60
    for col in ['D', 'E', 'F', 'G']:
        ws.column_dimensions[col].width = 35
    ws.column_dimensions['H'].width = 10
    ws.column_dimensions['I'].width = 60

    for i, q in enumerate(questions, start=1):
        domain = infer_domain(q['question'], q['explanation'])
        ws.append([
            i, domain,
            q['question'], q['answer_a'], q['answer_b'], q['answer_c'], q['answer_d'],
            q['correct'], q['explanation'],
        ])
        # Wrap text in long cells
        for col in [3, 4, 5, 6, 7, 9]:
            ws.cell(row=i+1, column=col).alignment = Alignment(wrap_text=True, vertical='top')

    wb.save(output_path)
    print(f'Saved {len(questions)} questions to {output_path}')


def main():
    all_questions = []
    for pdf_file in PDF_FILES:
        if not os.path.exists(pdf_file):
            print(f'WARNING: {pdf_file} not found, skipping')
            continue
        print(f'Processing {pdf_file}...')
        text = extract_text_from_pdf(pdf_file)
        questions = parse_questions(text)
        print(f'  Extracted {len(questions)} questions')
        all_questions.extend(questions)

    all_questions = remove_duplicates(all_questions)
    print(f'After deduplication: {len(all_questions)} questions')

    if not all_questions:
        print('ERROR: No questions extracted. Check PDF format.')
        sys.exit(1)

    save_to_excel(all_questions, 'questions_en.xlsx')
    print('\nNext step: translate questions_en.xlsx to Polish, save as questions_pl.xlsx')


if __name__ == '__main__':
    main()
```

- [ ] **Krok 4: Utwórz `tools/test_pipeline.py`**

```python
"""pytest tests for extract_questions.py"""
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from tools.extract_questions import (
    infer_domain, remove_duplicates, parse_questions
)

def test_infer_domain_risk():
    assert infer_domain('What is the best way to mitigate a risk?') == 'Risk'

def test_infer_domain_cost():
    assert infer_domain('The project CPI is 0.8. What does this mean?') == 'Cost'

def test_infer_domain_fallback():
    # Very generic text → General
    d = infer_domain('abc def ghi')
    assert isinstance(d, str)

def test_remove_duplicates_basic():
    q = [
        {'question': 'What is the WBS?', 'answer_a':'', 'answer_b':'', 'answer_c':'', 'answer_d':'', 'correct':'A', 'explanation':''},
        {'question': 'What is the WBS?', 'answer_a':'', 'answer_b':'', 'answer_c':'', 'answer_d':'', 'correct':'B', 'explanation':''},
        {'question': 'Different question here?', 'answer_a':'', 'answer_b':'', 'answer_c':'', 'answer_d':'', 'correct':'A', 'explanation':''},
    ]
    result = remove_duplicates(q)
    assert len(result) == 2

def test_parse_questions_minimal():
    sample = """
1. What does PM stand for?
A. Project Manager
B. Program Management
C. Process Model
D. Partial Milestone
Answer: A
Explanation: PM stands for Project Manager in PMP context.

2. What is a Gantt chart used for?
A. Budget tracking
B. Schedule visualization
C. Risk analysis
D. Stakeholder mapping
Answer: B
Explanation: Gantt charts visualize project schedules over time.
"""
    questions = parse_questions(sample)
    assert len(questions) >= 1
    # Verify correct answer is mapped
    for q in questions:
        assert q['correct'] in ['A', 'B', 'C', 'D']
        assert len(q['question']) > 0
```

- [ ] **Krok 5: Uruchom testy pipeline'u**

```bash
cd pmp-quiz-app/.. && pytest tools/test_pipeline.py -v
```

Oczekiwany wynik: 5 passed

- [ ] **Krok 6: Commit**

```bash
git add tools/
git commit -m "feat: PDF extraction script + pipeline tests"
```

---

## Task 13: Python — konwerter Excel → JSON

**Files:**
- Create: `tools/convert_to_json.py`
- Modify: `tools/test_pipeline.py`

- [ ] **Krok 1: Utwórz `tools/convert_to_json.py`**

```python
#!/usr/bin/env python3
"""
Konwertuje przetłumaczony plik questions_pl.xlsx do questions.json
Użycie: python tools/convert_to_json.py [input.xlsx] [output.json]
"""
import openpyxl
import json
import sys
import os
import random


LETTER_TO_INDEX = {'A': 0, 'B': 1, 'C': 2, 'D': 3}


def convert(input_path, output_path):
    wb = openpyxl.load_workbook(input_path)
    ws = wb.active

    headers = [str(cell.value).strip() if cell.value else '' for cell in ws[1]]
    required = ['ID', 'Domain', 'Question', 'Answer_A', 'Answer_B', 'Answer_C', 'Answer_D', 'Correct', 'Explanation']
    for req in required:
        if req not in headers:
            print(f'ERROR: Missing column "{req}". Found columns: {headers}')
            sys.exit(1)

    col = {h: i for i, h in enumerate(headers)}
    questions = []
    errors = 0

    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row[col['Question']]:
            continue

        correct_letter = str(row[col['Correct']]).strip().upper() if row[col['Correct']] else ''
        if correct_letter not in LETTER_TO_INDEX:
            print(f'Row {row_num}: Invalid Correct value "{correct_letter}", skipping')
            errors += 1
            continue

        answers_ordered = [
            str(row[col['Answer_A']] or '').strip(),
            str(row[col['Answer_B']] or '').strip(),
            str(row[col['Answer_C']] or '').strip(),
            str(row[col['Answer_D']] or '').strip(),
        ]
        correct_text = answers_ordered[LETTER_TO_INDEX[correct_letter]]

        # Shuffle answers so correct position is random in the JSON
        indexed = [(t, t == correct_text) for t in answers_ordered]
        random.shuffle(indexed)
        shuffled_answers = [t for t, _ in indexed]
        correct_index = next(i for i, (_, is_c) in enumerate(indexed) if is_c)

        questions.append({
            'id': int(row[col['ID']]) if row[col['ID']] else row_num - 1,
            'domain': str(row[col['Domain']] or 'General').strip(),
            'question': str(row[col['Question']]).strip(),
            'answers': shuffled_answers,
            'correct': correct_index,
            'explanation': str(row[col['Explanation']] or '').strip(),
        })

    if errors:
        print(f'WARNING: {errors} rows skipped due to errors')

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f'Converted {len(questions)} questions → {output_path}')
    return questions


def main():
    input_path  = sys.argv[1] if len(sys.argv) > 1 else 'questions_pl.xlsx'
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'pmp-quiz-app/questions.json'
    if not os.path.exists(input_path):
        print(f'ERROR: {input_path} not found')
        sys.exit(1)
    convert(input_path, output_path)


if __name__ == '__main__':
    main()
```

- [ ] **Krok 2: Dodaj testy konwertera do `tools/test_pipeline.py`**

```python
import openpyxl, json, tempfile, os
from tools.convert_to_json import convert, LETTER_TO_INDEX

def _make_xlsx(rows):
    """Helper: create a temp xlsx with given rows, return path."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['ID', 'Domain', 'Question', 'Answer_A', 'Answer_B', 'Answer_C', 'Answer_D', 'Correct', 'Explanation'])
    for row in rows:
        ws.append(row)
    path = tempfile.mktemp(suffix='.xlsx')
    wb.save(path)
    return path

def test_convert_basic():
    path = _make_xlsx([[1, 'Risk', 'Q1?', 'Odp1', 'Odp2', 'Odp3', 'Odp4', 'A', 'Wyjaśnienie']])
    out = tempfile.mktemp(suffix='.json')
    result = convert(path, out)
    assert len(result) == 1
    q = result[0]
    assert q['id'] == 1
    assert q['domain'] == 'Risk'
    assert q['question'] == 'Q1?'
    assert len(q['answers']) == 4
    assert q['answers'][q['correct']] == 'Odp1'  # Correct answer is Odp1 (was Answer_A=A)
    os.unlink(path); os.unlink(out)

def test_convert_correct_answer_preserved():
    """Regardless of shuffle, answers[correct] must always be the original A answer."""
    path = _make_xlsx([[1, 'Cost', 'Q?', 'Correct', 'Wrong1', 'Wrong2', 'Wrong3', 'A', '']])
    out = tempfile.mktemp(suffix='.json')
    for _ in range(10):  # Run multiple times to test shuffle stability
        result = convert(path, out)
        q = result[0]
        assert q['answers'][q['correct']] == 'Correct'
    os.unlink(path); os.unlink(out)

def test_convert_skips_invalid_correct():
    path = _make_xlsx([[1, 'Risk', 'Q?', 'A', 'B', 'C', 'D', 'X', '']])  # X is invalid
    out = tempfile.mktemp(suffix='.json')
    result = convert(path, out)
    assert len(result) == 0
    os.unlink(path); os.unlink(out)

def test_letter_to_index_mapping():
    assert LETTER_TO_INDEX['A'] == 0
    assert LETTER_TO_INDEX['D'] == 3
```

- [ ] **Krok 3: Uruchom testy**

```bash
pytest tools/test_pipeline.py -v
```

Oczekiwany wynik: 9 passed

- [ ] **Krok 4: Commit**

```bash
git add tools/convert_to_json.py tools/test_pipeline.py
git commit -m "feat: Excel→JSON converter with answer shuffle + tests"
```

---

## Task 14: Generowanie ikon PWA

**Files:**
- Create: `tools/generate_icons.py`

- [ ] **Krok 1: Utwórz `tools/generate_icons.py`**

```python
#!/usr/bin/env python3
"""
Generuje ikony PNG dla PWA (192x192 i 512x512).
Użycie: python tools/generate_icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    margin = int(size * 0.05)
    draw.ellipse([margin, margin, size - margin, size - margin],
                 fill='#6366f1')

    # Inner white circle (subtle)
    inner_m = int(size * 0.12)
    draw.ellipse([inner_m, inner_m, size - inner_m, size - inner_m],
                 fill='#5254cc')

    # Text "PM"
    try:
        font_size = int(size * 0.32)
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', font_size)
    except Exception:
        font = ImageFont.load_default()

    text = 'PM'
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1]
    draw.text((x, y), text, fill='white', font=font)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    print(f'Created {output_path} ({size}x{size})')


def main():
    create_icon(192, 'pmp-quiz-app/icons/icon-192.png')
    create_icon(512, 'pmp-quiz-app/icons/icon-512.png')


if __name__ == '__main__':
    main()
```

- [ ] **Krok 2: Wygeneruj ikony**

```bash
python tools/generate_icons.py
```

Oczekiwany wynik:
```
Created pmp-quiz-app/icons/icon-192.png (192x192)
Created pmp-quiz-app/icons/icon-512.png (512x512)
```

- [ ] **Krok 3: Commit**

```bash
git add pmp-quiz-app/icons/ tools/generate_icons.py
git commit -m "feat: generate PWA icons (192, 512)"
```

---

## Task 15: Ekstrakcja pytań z PDF i finalna integracja

**Files:**
- Run: `tools/extract_questions.py` na prawdziwych PDF-ach
- Replace: `pmp-quiz-app/questions.json`

- [ ] **Krok 1: Uruchom ekstrakcję z folderu gdzie są PDF-y**

```bash
# PDFy są w workspace folder — uruchom skrypt stamtąd
cd "/sessions/trusting-beautiful-goodall/mnt/PMP Exam Prepp App"
python tools/extract_questions.py
```

Oczekiwany wynik: `questions_en.xlsx` z setkami pytań.

- [ ] **Krok 2: Sprawdź wynik ekstrakcji**

```bash
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('questions_en.xlsx')
ws = wb.active
print(f'Rows: {ws.max_row - 1}')
print('Sample:', ws.cell(2,3).value[:80])
"
```

- [ ] **Krok 3: [Wykonujesz Ty] Przetłumacz `questions_en.xlsx` → `questions_pl.xlsx`**

Otwórz `questions_en.xlsx` w Excelu. Przetłumacz kolumny: Question, Answer_A, Answer_B, Answer_C, Answer_D, Explanation. Kolumny ID, Domain, Correct **pozostaw bez zmian**. Zapisz jako `questions_pl.xlsx` w tym samym folderze.

- [ ] **Krok 4: Konwertuj przetłumaczony plik do JSON**

```bash
python tools/convert_to_json.py questions_pl.xlsx pmp-quiz-app/questions.json
```

- [ ] **Krok 5: Przetestuj aplikację z prawdziwymi pytaniami**

```bash
cd pmp-quiz-app && python3 -m http.server 8080
```

Otwórz http://localhost:8080. Sprawdź:
- Loading screen pojawia się i przechodzi do Home
- Szybki Quiz pokazuje pytania po polsku
- Filtry domen pokazują rzeczywiste domeny z pytań
- Daily Challenge uruchamia 30 pytań

- [ ] **Krok 6: Commit po integracji**

```bash
git add pmp-quiz-app/questions.json
git commit -m "feat: integrate real translated question bank"
```

---

## Task 16: Checklist testów manualnych (przeglądarka)

Uruchom lokalny serwer (`python3 -m http.server 8080` w `pmp-quiz-app/`) i przejdź przez poniższą listę:

**Loading & Home:**
- [ ] Loading screen pojawia się przy starcie, z losowym cytatem
- [ ] Po ~1.2s przejście do Home screen
- [ ] Widget serii: 30 szarych kółek na początku, licznik "⚡ Zacznij serię!"
- [ ] Przycisk Codzienne Wyzwanie: pulsująca czerwona kropka

**Szybki Quiz — standardowy:**
- [ ] ModeSelect pokazuje chipy domenowe z prawdziwymi domenami
- [ ] Zaznaczenie domeny zaznacza chip i filtruje pytania
- [ ] Start z filtrem → quiz zawiera tylko pytania z wybranej domeny
- [ ] Odpowiedzi są tasowane (nie zawsze w tej samej kolejności)
- [ ] Poprawna odpowiedź → zielone podświetlenie → automatyczne przejście po 1.5s
- [ ] Błędna odpowiedź → czerwone + wyjaśnienie + "Dalej →"
- [ ] Pasek postępu rośnie co pytanie

**Summary:**
- [ ] Wynik numeryczny i procentowy poprawny
- [ ] Pasek animuje się do właściwej wartości
- [ ] Konfetti przy ≥ 80%
- [ ] "Wróć do menu" wraca na Home

**Daily Challenge + Streak:**
- [ ] Codzienne Wyzwanie uruchamia 30 pytań
- [ ] Po ukończeniu: "🔥 Seria przedłużona!" w summary
- [ ] Przycisk Codzienne Wyzwanie zmienia się na "✅ Ukończono dziś"
- [ ] Kółko dzisiejszego dnia w widgecie zmienia kolor na zielony
- [ ] Licznik serii: "🔥 1 dzień z rzędu"

**Odznaki:**
- [ ] Po pierwszym quizie pojawia się popup "Pierwszy krok"
- [ ] Popup znika po ~2.2s
- [ ] W Statystykach odznaka "🎯 Pierwszy krok" jest kolorowa

**Statystyki:**
- [ ] Średnie 3/7/30 dni wyświetlają się poprawnie (— przy braku danych)
- [ ] Łączna liczba quizów i pytań
- [ ] Słupki domen animują się przy wejściu
- [ ] Kalendarz 30 dni odzwierciedla aktywność

**Słabe pytania:**
- [ ] Tryb niedostępny (szary) przy < 10 błędnych pytań
- [ ] Po zebraniu ≥ 10 błędów: tryb aktywny
- [ ] Quiz z błędnych pytań losuje właściwe

**Dark mode:**
- [ ] Zmień ustawienia systemowe na ciemny motyw
- [ ] Aplikacja automatycznie przełącza kolory

**PWA Install (Android Chrome):**
- [ ] Otwórz na Androidzie przez ngrok lub lokalną sieć
- [ ] Chrome proponuje "Dodaj do ekranu głównego"
- [ ] Po instalacji: apka otwiera się bez paska przeglądarki
- [ ] Działa offline (wyłącz internet, odśwież)

---

## Podsumowanie

Po ukończeniu wszystkich tasków:

1. `pmp-quiz-app/` — kompletna PWA, instalowalna na Androidzie
2. `tools/extract_questions.py` — ekstrakcja pytań z PDF
3. `tools/convert_to_json.py` — konwersja Excel→JSON po tłumaczeniu
4. `tests/test_logic.js` — testy modułów JS
5. `tools/test_pipeline.py` — testy pipeline'u Python

**Workflow aktualizacji pytań:**
```bash
# Edytuj questions_pl.xlsx → dodaj nowe wiersze
python tools/convert_to_json.py questions_pl.xlsx pmp-quiz-app/questions.json
# Otwórz aplikację — nowe pytania dostępne od razu
```
