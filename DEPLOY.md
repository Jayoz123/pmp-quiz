# Instrukcja deploymentu — PMP Quiz App

## Jak to działa

```
Twój komputer  →  GitHub (repo Jayoz123/pmp-quiz)  →  GitHub Actions  →  Cloudflare Pages
```

Wystarczy jeden `git push` — reszta dzieje się automatycznie.

---

## Pierwsze uruchomienie CI/CD (jednorazowo)

Zanim GitHub Actions będzie mogło deployować do Cloudflare, musisz dodać dwa sekrety w ustawieniach repo.

### Krok 1 — Pobierz dane z Cloudflare

1. Wejdź na https://dash.cloudflare.com
2. **Account ID** — widoczny po prawej stronie na stronie głównej dashboardu (np. `abc123...`)
3. **API Token** — utwórz nowy:
   - Kliknij ikonę profilu → **My Profile** → **API Tokens** → **Create Token**
   - Użyj szablonu **"Edit Cloudflare Workers"** (lub Custom Token z uprawnieniami `Cloudflare Pages: Edit`)
   - Skopiuj token (widoczny tylko raz!)

### Krok 2 — Dodaj sekrety do repo na GitHubie

1. Wejdź na https://github.com/Jayoz123/pmp-quiz
2. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. Dodaj dwa sekrety:

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | token z Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | ID konta z Cloudflare |

Po tym kroku CI/CD jest gotowe — więcej nie trzeba tego powtarzać.

---

## Codzienny deploy (rutyna)

### Przez VS Code / terminal

```bash
# 1. Sprawdź co się zmieniło
git status

# 2. Dodaj zmienione pliki
git add .

# 3. Commit z opisem
git commit -m "Opis zmiany, np. dodano bug reporting"

# 4. Wyślij na GitHub → automatycznie odpali deploy
git push origin main
```

### Co się dzieje po push:

1. GitHub Actions uruchamia workflow `deploy.yml`
2. Automatycznie aktualizuje `APP_VERSION` do aktualnego timestamp (np. `202505191430`)
3. Deployuje folder `pmp-quiz-app/` na Cloudflare Pages
4. Aplikacja jest żywa pod: **https://pmp-quiz-app.bart100larski.workers.dev**

Czas od push do live: **~1-2 minuty**.

---

## ✅ Weryfikacja — czy CI/CD działa?

Wykonaj ten test po każdym pierwszym ustawieniu lub po przerwie, żeby upewnić się że pipeline jest sprawny.

### Test end-to-end (5 minut)

**Krok 1 — zrób widoczną zmianę testową**

Otwórz `pmp-quiz-app/index.html` i dodaj niewidoczny komentarz (lub zmień dowolny tekst):
```html
<!-- CI/CD test 2026-05-19 -->
```

**Krok 2 — wypchnij i obserwuj**

```bash
git add .
del "C:\Users\bartosz.stolarski\OneDrive - Net-o-logy sp. z o.o\Dokumenty\PMP Exam Prepp App\.git\index.lock"
git commit -m "OPIS ZMIAN"

git push origin main
```

**Krok 3 — sprawdź GitHub Actions (30 sek. po push)**

Wejdź na https://github.com/Jayoz123/pmp-quiz/actions

Powinieneś zobaczyć nowy run z nazwą `"Deploy to Cloudflare Pages"` ze statusem:
- 🟡 żółte kółko = w trakcie (OK, czekaj)
- ✅ zielony ptaszek = sukces
- ❌ czerwony X = błąd (sprawdź logi — kliknij run → krok który padł)

**Krok 4 — zweryfikuj wersję na produkcji (~2 minuty po push)**

Otwórz https://pmp-quiz-app.bart100larski.workers.dev w trybie incognito i sprawdź w konsoli przeglądarki (F12 → Console):

```
APP_VERSION
```

Wartość powinna być timestamp z dzisiaj, np. `"202605191430"`. Jeśli tak — CI/CD działa poprawnie.

### Szybka lista kontrolna

| Co sprawdzić | Gdzie | Oczekiwany wynik |
|---|---|---|
| Workflow odpalił się | GitHub → Actions | Nowy run widoczny po push |
| Workflow przeszedł bez błędu | GitHub → Actions → ostatni run | Zielony ptaszek ✅ |
| `APP_VERSION` zaktualizowany | Konsola przeglądarki na prod | Dzisiejszy timestamp |
| Strona się ładuje | https://pmp-quiz-app.bart100larski.workers.dev | Aplikacja działa |

> Jeśli wszystkie 4 punkty są zielone — pipeline jest sprawny i możesz deployować bez ręcznej weryfikacji.

---

## Podgląd statusu deployu

- GitHub Actions: https://github.com/Jayoz123/pmp-quiz/actions
- Cloudflare Pages: https://dash.cloudflare.com → Workers & Pages → `pmp-quiz-app`

---

## Struktura repo (co idzie na produkcję)

```
pmp-quiz-app/           ← ten folder deployuje się na Cloudflare Pages
├── index.html
├── app.js
├── service-worker.js
├── questions.json
├── manifest.json
└── ...
wrangler.toml           ← konfiguracja Cloudflare (nie edytuj)
.github/
└── workflows/
    └── deploy.yml      ← definicja CI/CD (nie edytuj)
```

> Zmiany wprowadzaj tylko w folderze `pmp-quiz-app/` — reszta to infrastruktura.

---

## Troubleshooting

| Problem | Co sprawdzić |
|---------|-------------|
| Workflow nie odpala | Czy push był na branch `main`? |
| Błąd autoryzacji Cloudflare | Czy sekrety `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` są ustawione w repo? |
| Stara wersja apki w przeglądarce | Wyczyść cache lub otwórz w trybie incognito (service worker może cachować) |
| Deploy przeszedł ale apka nie działa | Sprawdź logi w Cloudflare Pages → Deployments → kliknij ostatni deploy |

---

## Linki

- **Aplikacja (produkcja):** https://pmp-quiz-app.bart100larski.workers.dev
- **Repo GitHub:** https://github.com/Jayoz123/pmp-quiz
- **GitHub Actions:** https://github.com/Jayoz123/pmp-quiz/actions
- **Cloudflare Pages Dashboard:** https://dash.cloudflare.com
