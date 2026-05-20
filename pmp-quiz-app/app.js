'use strict';

// ==================== VERSION ====================
// Bump this string on every deploy to invalidate the Service Worker cache
const APP_VERSION = '2.3.0';

// ==================== SUPABASE ====================
const SUPABASE_URL  = 'https://otxfzzlenddvmoxxxaix.supabase.co';
const SUPABASE_ANON = 'sb_publishable_H9asTbXGp-R9FUc_n5IZDQ_pycr289R';

let _sb = null;
const sb = () => {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  return _sb;
};

// ==================== CONSTANTS ====================
const QUIZ_SIZES   = { daily: 30, quick: 10, weak: 10 };
const SRS_COOLDOWN = 15; // min questions before re-showing the same weak question
const TODAY = () => new Date().toISOString().slice(0, 10);

const BADGES_DEF = [
  { id: 'first',   emoji: '🎯', name: 'Pierwszy krok', desc: 'Ukończ pierwszy quiz',           check: s => s.totalQuizzes >= 1 },
  { id: 'week',    emoji: '🔥', name: 'Tydzień ognia', desc: '7 dni serii z rzędu',             check: s => s.currentStreak >= 7 },
  { id: 'month',   emoji: '💪', name: 'Miesiąc mocy',  desc: '30 dni serii z rzędu',            check: s => s.currentStreak >= 30 },
  { id: 'hundred', emoji: '🧠', name: 'Setka',         desc: '100 odpowiedzianych pytań',       check: s => s.totalAnswered >= 100 },
  { id: 'fivehun', emoji: '🏆', name: 'Pięćsetka',     desc: '500 odpowiedzianych pytań',       check: s => s.totalAnswered >= 500 },
  { id: 'perfect', emoji: '⭐', name: 'Perfekcja',     desc: '100% poprawnych w jednym quizie', check: s => s.hadPerfectQuiz },
  { id: 'ready',   emoji: '🎓', name: 'PMP Ready',     desc: 'Średnia ≥ 80% z 30 dni',          check: s => s.avg30 >= 80 },
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

// ==================== STORAGE (localStorage cache) ====================
const Storage = {
  _get(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  _set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error('Storage error', e); }
  },
  getHistory()          { return this._get('quiz_history', []); },
  saveResult(r)         { const h = this.getHistory(); h.push(r); this._set('quiz_history', h); },
  getStreakData()        { return this._get('streak_data', {}); },
  saveStreakData(d)      { this._set('streak_data', d); },
  getWeakQuestions()    { return this._get('weak_questions', {}); },
  saveWeakQuestions(wq) { this._set('weak_questions', wq); },
  getUnlockedBadges()   { return this._get('unlocked_badges', []); },
  saveUnlockedBadges(b) { this._set('unlocked_badges', b); },
  getSettings()         { return this._get('settings', { confidenceEnabled: true, defaultLanguage: 'pl' }); },
  saveSettings(s)       { this._set('settings', s); },
  getConfidenceData()   { return this._get('confidence_data', {}); },
  saveConfidenceData(d) { this._set('confidence_data', d); },
  recordConfidence(questionId, confidence, wasCorrect) {
    if (confidence === null) return;
    const cd = this.getConfidenceData();
    if (!cd[questionId]) cd[questionId] = { '1_correct': 0, '2_correct': 0, '3_correct': 0, wrong: 0 };
    if (!wasCorrect) { cd[questionId].wrong++; }
    else             { cd[questionId][`${confidence}_correct`]++; }
    this.saveConfidenceData(cd);
  },
  hasCompletedAnyQuiz() { return this.getHistory().length > 0; },
};

// ==================== SUPABASE SYNC ====================
const SupabaseSync = {
  async pullProgress() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const { data, error } = await sb()
        .from('user_progress')
        .select('streak_data, weak_questions, unlocked_badges')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error || !data) return;
      // Remote wins for streak + badges (cloud is source of truth)
      if (data.streak_data)     Storage.saveStreakData(data.streak_data);
      if (data.unlocked_badges) Storage.saveUnlockedBadges(data.unlocked_badges);
      // Merge weak_questions: take max error count per question
      if (data.weak_questions) {
        const local  = Storage.getWeakQuestions();
        const merged = { ...local };
        Object.entries(data.weak_questions).forEach(([id, cnt]) => {
          merged[id] = Math.max(merged[id] || 0, cnt);
        });
        Storage.saveWeakQuestions(merged);
      }
    } catch (e) { console.warn('pullProgress failed:', e); }
  },

  // Loads the tester flag in an isolated query so a missing `is_tester`
  // column never breaks the main progress sync. Defaults to false on any error.
  async pullTesterFlag() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const { data, error } = await sb()
        .from('user_progress')
        .select('is_tester')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return;
      AppState.isTester = data?.is_tester ?? false;
    } catch (e) { console.warn('pullTesterFlag failed:', e); }
  },

  async pushProgress() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      await sb().from('user_progress').upsert({
        user_id:         user.id,
        streak_data:     Storage.getStreakData(),
        weak_questions:  Storage.getWeakQuestions(),
        unlocked_badges: Storage.getUnlockedBadges(),
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch (e) { console.warn('pushProgress failed:', e); }
  },

  async saveQuizSession({ mode, correct, total, percent, domainResults }) {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      await sb().from('quiz_sessions').insert({
        user_id: user.id,
        mode,
        score:   correct,
        total,
        percent,
        domains: domainResults || [],
      });
    } catch (e) { console.warn('saveQuizSession failed:', e); }
  },

  async reportQuestion({ questionId, questionText, category, comment }) {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) throw new Error('Nie jesteś zalogowany');
      const { error } = await sb().from('question_reports').insert({
        user_id:       user.id,
        question_id:   questionId,
        question_text: questionText || null,
        category,
        comment:       comment || null,
      });
      if (error) throw error;
    } catch (e) {
      console.warn('reportQuestion failed:', e);
      throw e;
    }
  },
};

// ==================== AUTH ====================
const Auth = {
  async signIn(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signUp(email, password) {
    const { error } = await sb().auth.signUp({ email, password });
    if (error) throw error;
  },
  async signOut() {
    await sb().auth.signOut();
  },
};

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

  // FIX #4 — SRS cooldown: recentlyShown prevents repeating weak questions
  selectQuestions(allQuestions, mode, domains = [], recentlyShown = []) {
    if (mode === 'weak') {
      const wq = Storage.getWeakQuestions();
      const cooldownIds = new Set(recentlyShown.slice(-SRS_COOLDOWN));

      // First pass: exclude recently shown
      let pool = [];
      allQuestions.forEach(q => {
        const count = wq[q.id] || 0;
        if (count > 0 && !cooldownIds.has(q.id)) {
          for (let i = 0; i < Math.min(count * 3, 9); i++) pool.push(q);
        }
      });
      // If pool too small, fall back to including cooled-down items
      if (pool.length < QUIZ_SIZES.weak) {
        allQuestions.forEach(q => {
          const count = wq[q.id] || 0;
          if (count > 0 && cooldownIds.has(q.id)) pool.push(q);
        });
      }
      pool = this.shuffle(pool);
      const seen = new Set();
      return pool
        .filter(q => { if (seen.has(q.id)) return false; seen.add(q.id); return true; })
        .slice(0, QUIZ_SIZES.weak);
    }
    let pool = domains.length > 0
      ? allQuestions.filter(q => domains.includes(q.domain))
      : [...allQuestions];
    const size = mode === 'daily' ? QUIZ_SIZES.daily : QUIZ_SIZES.quick;
    return this.shuffle(pool).slice(0, size);
  },

  // Bilingual support: keeps PL and EN answers in sync through shuffling
  shuffleAnswers(question) {
    const indexed = question.answers.map((text, i) => ({
      text_pl:   text,
      text_en:   question.answers_en ? question.answers_en[i] : null,
      isCorrect: i === question.correct,
    }));
    const shuffled = this.shuffle(indexed);
    return {
      displayAnswers_pl: shuffled.map(a => a.text_pl),
      displayAnswers_en: shuffled.map(a => a.text_en),
      correctDisplayIndex: shuffled.findIndex(a => a.isCorrect),
    };
  },

  countWeakQuestions(allQuestions) {
    const wq = Storage.getWeakQuestions();
    return allQuestions.filter(q => (wq[q.id] || 0) > 0).length;
  },

  recordAnswer(questionId, wasCorrect, confidence = null) {
    const wq = Storage.getWeakQuestions();
    if (!wasCorrect || confidence === 1) {
      wq[questionId] = (wq[questionId] || 0) + 1;
    } else if (confidence === 2) {
      // no-op: unsure but correct — leave pool unchanged
    } else {
      // confidence 3 or null: normal correct behavior
      if (wq[questionId]) {
        wq[questionId] = Math.max(0, wq[questionId] - 1);
        if (wq[questionId] === 0) delete wq[questionId];
      }
    }
    Storage.saveWeakQuestions(wq);
  },
};

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
    const totalQuizzes  = history.length;
    const currentStreak = StreakManager.getCurrentStreak();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const last30 = history.filter(r => new Date(r.date) >= cutoff);
    const avg30  = last30.length
      ? Math.round(last30.reduce((s, r) => s + r.percent, 0) / last30.length) : 0;
    const hadPerfectQuiz = history.some(r => r.percent === 100);
    return { totalAnswered, totalQuizzes, currentStreak, avg30, hadPerfectQuiz };
  },
  checkAndUnlock() {
    const stats   = this.buildStats();
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
    const cutoff  = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const recent  = history.filter(r => new Date(r.date) >= cutoff);
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

// ==================== APP STATE ====================
const AppState = {
  questions:    [],
  quizSession:  null,   // { questions, current, answers, mode, shuffledMap, recentlyShown }
  lastSummary:  null,   // { correct, total, percent, bestStreak, weakestDomain, streakExtended, mode }
  pendingMode:  null,
  pendingDomains: [],
  showEnglish:  false,  // EN/PL toggle state
  isTester:     false,  // gates per-question EN/PL override (set from Supabase user_progress.is_tester)
};

// ==================== VIEWS ====================
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
    this.navigate('loading');
    const { data: { session } } = await sb().auth.getSession();
    if (!session) {
      this.navigate('login');
      return;
    }
    await this.afterAuth();
  },

  async afterAuth() {
    try {
      const res = await fetch('./questions.json');
      AppState.questions = await res.json();
    } catch (e) {
      console.error('Failed to load questions.json', e);
      AppState.questions = [];
    }
    // Pull cloud progress + tester flag in background — does not block UI
    SupabaseSync.pullProgress().catch(console.error);
    SupabaseSync.pullTesterFlag().catch(console.error);
    // Initialize EN/PL state from saved global language preference
    AppState.showEnglish = (Storage.getSettings().defaultLanguage === 'en');
    await new Promise(r => setTimeout(r, 800));
    this.navigate('home');
  },
};

// ==================== LOGIN VIEW ====================
Views.login = {
  _mode: 'login',

  render() {
    const isReg = this._mode === 'register';
    return `
      <div class="screen login-screen">
        <div class="login-logo">📋</div>
        <h1 class="login-title">PMP Quiz</h1>
        <p class="login-subtitle">Nauka do egzaminu PMP</p>
        <div class="login-form">
          <input type="email" id="l-email" placeholder="Adres email"
                 autocomplete="email" inputmode="email" />
          <input type="password" id="l-pass"
                 placeholder="Hasło (min. 6 znaków)"
                 autocomplete="${isReg ? 'new-password' : 'current-password'}" />
          <div id="l-msg" class="login-msg hidden"></div>
          <button class="btn-primary" id="l-submit" onclick="Views.login._submit()">
            ${isReg ? 'Zarejestruj się' : 'Zaloguj się'}
          </button>
          <button class="btn-link" onclick="Views.login._toggle()">
            ${isReg ? '← Mam już konto — zaloguj się' : 'Nie mam konta — zarejestruj się →'}
          </button>
        </div>
      </div>`;
  },

  _toggle() {
    this._mode = this._mode === 'login' ? 'register' : 'login';
    App.render();
  },

  async _submit() {
    const email = document.getElementById('l-email')?.value.trim();
    const pass  = document.getElementById('l-pass')?.value;
    const btn   = document.getElementById('l-submit');

    if (!email || !pass) { this._msg('Podaj email i hasło.', false); return; }

    btn.disabled    = true;
    btn.textContent = '…';

    try {
      if (this._mode === 'register') {
        await Auth.signUp(email, pass);
        this._msg('Sprawdź email i kliknij link potwierdzający, a potem wróć i zaloguj się.', true);
        this._mode      = 'login';
        btn.disabled    = false;
        btn.textContent = 'Zaloguj się';
      } else {
        await Auth.signIn(email, pass);
        await App.afterAuth();
      }
    } catch (e) {
      this._msg(e.message || 'Błąd — spróbuj ponownie.', false);
      btn.disabled    = false;
      btn.textContent = this._mode === 'register' ? 'Zarejestruj się' : 'Zaloguj się';
    }
  },

  _msg(text, ok) {
    const el = document.getElementById('l-msg');
    if (!el) return;
    el.textContent = text;
    el.className   = `login-msg ${ok ? 'login-msg--ok' : 'login-msg--err'}`;
  },

  init() {},
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
  init() {},
};

// ==================== HOME VIEW ====================
Views.home = {
  render() {
    const streak     = StreakManager.getCurrentStreak();
    const dailyDone  = StreakManager.isDailyDoneToday();
    const days       = StreakManager.getLast30Days();
    const dots       = days.map(d =>
      `<div class="streak-dot streak-dot--${d.status}" title="${d.date}"></div>`
    ).join('');
    const streakLabel = streak === 0 ? '⚡ Zacznij serię!'
      : streak === 1 ? '🔥 1 dzień z rzędu'
      : `🔥 ${streak} dni z rzędu`;

    return `
      <div class="screen home">
        <div class="home-topbar">
          <button class="btn-settings" onclick="Views.home._openSettings()" title="Ustawienia">⚙️</button>
        </div>
        <div id="pwa-install-banner"></div>
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

  _openSettings() {
    const settings = Storage.getSettings();
    const el = document.createElement('div');
    el.id = 'settings-modal';
    el.className = 'settings-modal';
    el.innerHTML = `
      <div class="settings-modal__card" role="dialog" aria-modal="true" aria-label="Ustawienia">
        <div class="settings-modal__header">
          <span>Ustawienia</span>
          <button class="settings-modal__close" onclick="Views.home._closeSettings()" aria-label="Zamknij">✕</button>
        </div>
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">🧠</span>
            <div>
              <div class="settings-row__label">Ocena pewności</div>
              <div class="settings-row__desc">Skala 1–3 przed odpowiedzią</div>
            </div>
          </div>
          <label class="settings-toggle" aria-label="Włącz ocenę pewności">
            <input type="checkbox" id="confidence-toggle"
                   ${settings.confidenceEnabled ? 'checked' : ''}
                   onchange="Views.home._toggleConfidence(this.checked)">
            <span class="settings-toggle__slider"></span>
          </label>
        </div>
        <div class="settings-separator"></div>
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">🌐</span>
            <div>
              <div class="settings-row__label">Język pytań</div>
              <div class="settings-row__desc">Domyślny język treści quizu</div>
            </div>
          </div>
          <div class="settings-lang-select">
            <button class="btn-lang-opt ${settings.defaultLanguage === 'en' ? '' : 'active'}"
                    onclick="Views.home._setLang('pl')">🇵🇱 PL</button>
            <button class="btn-lang-opt ${settings.defaultLanguage === 'en' ? 'active' : ''}"
                    onclick="Views.home._setLang('en')">🇬🇧 EN</button>
          </div>
        </div>
        <div class="settings-separator"></div>
        <button class="settings-action-btn settings-action-btn--danger"
                onclick="Views.home._logout()">Wyloguj się</button>
        <a class="settings-action-btn settings-action-btn--link"
           href="#" target="_blank" rel="noopener noreferrer">Polityka prywatności ↗</a>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) Views.home._closeSettings(); });
  },

  _closeSettings() {
    document.getElementById('settings-modal')?.remove();
  },

  _toggleConfidence(enabled) {
    const s = Storage.getSettings();
    s.confidenceEnabled = enabled;
    Storage.saveSettings(s);
  },

  _setLang(lang) {
    const s = Storage.getSettings();
    s.defaultLanguage = lang;
    Storage.saveSettings(s);
    // Keep the live EN/PL state in sync with the new global preference
    AppState.showEnglish = (lang === 'en');
    // Re-render the modal so the active button reflects the change
    Views.home._closeSettings();
    Views.home._openSettings();
  },

  async _logout() {
    Views.home._closeSettings();
    if (!confirm('Wylogować się?')) return;
    await Auth.signOut();
    App.navigate('login');
  },

  init() {
    // PWA install banner placeholder — no-op until install prompt logic is implemented
  },
};

// ==================== MODE SELECT VIEW ====================
Views['mode-select'] = {
  _selectedMode: 'quick',
  _selectedDomains: [],

  render() {
    const domains    = [...new Set(AppState.questions.map(q => q.domain).filter(Boolean))].sort();
    const weakCount  = QuizEngine.countWeakQuestions(AppState.questions);
    // FIX #5 — odblokuj po ukończeniu DOWOLNEGO quizu, nie po 10 błędach
    const neverPlayed  = !Storage.hasCompletedAnyQuiz();
    const weakDisabled = neverPlayed;
    const self = Views['mode-select'];

    const domainChips = domains.map(d => {
      const sel = self._selectedDomains.includes(d);
      return `<div class="domain-chip ${sel ? 'selected' : ''}"
                   onclick="Views['mode-select']._toggleDomain('${d}')">${d}</div>`;
    }).join('');

    let weakSubtitle;
    if (neverPlayed)      weakSubtitle = 'Ukończ pierwszy quiz, żeby odblokować';
    else if (weakCount === 0) weakSubtitle = 'Nie masz jeszcze słabych pytań 🎉';
    else                  weakSubtitle = `${weakCount} pytań do powtórki`;

    return `
      <div class="screen mode-select">
        <button class="btn-back" onclick="App.navigate('home')">‹ Wróć</button>
        <h2>Szybki Quiz</h2>
        <div class="mode-card ${self._selectedMode === 'quick' ? 'selected' : ''}"
             onclick="Views['mode-select']._selectMode('quick')">
          <h3>⚡ Standardowy Quiz</h3>
          <p>10 losowych pytań z wybranych domen</p>
          <div class="domain-filter" style="margin-top:12px">
            <label>Filtruj domeny (domyślnie wszystkie):</label>
            <div class="domain-chips">${domainChips}</div>
          </div>
        </div>
        <div class="mode-card ${self._selectedMode === 'weak' ? 'selected' : ''} ${weakDisabled ? 'disabled' : ''}"
             ${weakDisabled ? '' : "onclick=\"Views['mode-select']._selectMode('weak')\""}>
          <h3>🎯 Moje słabe pytania</h3>
          <p>${weakSubtitle}</p>
        </div>
        <button class="btn-primary" style="margin-top:8px"
                onclick="Views['mode-select']._startQuiz()">
          Start →
        </button>
      </div>`;
  },

  _toggleDomain(domain) {
    const idx = this._selectedDomains.indexOf(domain);
    if (idx >= 0) this._selectedDomains.splice(idx, 1);
    else          this._selectedDomains.push(domain);
    App.render();
  },

  _selectMode(mode) {
    this._selectedMode = mode;
    App.render();
  },

  _startQuiz() {
    if (this._selectedMode === 'weak' && QuizEngine.countWeakQuestions(AppState.questions) === 0) {
      alert('Nie masz jeszcze słabych pytań. Ukończ więcej quizów!');
      return;
    }
    const recentlyShown = AppState.quizSession?.recentlyShown || [];
    const questions = QuizEngine.selectQuestions(
      AppState.questions, this._selectedMode, this._selectedDomains, recentlyShown
    );
    if (!questions.length) {
      alert('Brak pytań dla wybranych filtrów. Zmień ustawienia.');
      return;
    }
    AppState.quizSession    = { questions, current: 0, answers: [], mode: this._selectedMode, shuffledMap: {}, recentlyShown: [] };
    this._selectedDomains   = [];
    this._selectedMode      = 'quick';
    App.navigate('quiz');
  },

  init() {},
};

// ==================== DAILY START ====================
Views['daily-start'] = {
  render() {
    return `<div class="loading-screen"><div class="loading-spinner"></div></div>`;
  },
  init() {
    if (StreakManager.isDailyDoneToday()) {
      App.navigate('home');
      return;
    }
    if (!AppState.questions.length) {
      alert('Nie udało się załadować pytań. Sprawdź połączenie i odśwież stronę.');
      App.navigate('home');
      return;
    }
    const questions = QuizEngine.selectQuestions(AppState.questions, 'daily');
    AppState.quizSession = { questions, current: 0, answers: [], mode: 'daily', shuffledMap: {}, recentlyShown: [] };
    App.navigate('quiz');
  },
};

// ==================== QUIZ VIEW ====================
Views.quiz = {
  render() {
    const session = AppState.quizSession;
    if (!session) { App.navigate('home'); return ''; }

    const q = session.questions[session.current];
    if (!session.shuffledMap[session.current]) {
      session.shuffledMap[session.current] = QuizEngine.shuffleAnswers(q);
    }
    const map     = session.shuffledMap[session.current];
    const showEn  = AppState.showEnglish;
    const hasEn   = !!(q.question_en && map.displayAnswers_en[0]);

    const displayAnswers = (showEn && hasEn) ? map.displayAnswers_en : map.displayAnswers_pl;
    const questionText   = (showEn && hasEn) ? q.question_en : q.question;
    const total = session.questions.length;
    const pct   = Math.round((session.current / total) * 100);
    const letters = ['A', 'B', 'C', 'D'];

    const answerBtns = displayAnswers.map((text, i) => `
      <button class="answer-btn" data-index="${i}"
              onclick="Views.quiz._selectAnswer(${i})">
        <span class="letter">${letters[i]}</span>
        <span>${text}</span>
      </button>`).join('');

    // Toggle EN/PL — per-question override, only for testers (regular users use the global setting)
    const langToggle = (hasEn && AppState.isTester) ? `
      <button class="btn-lang-toggle" onclick="Views.quiz._toggleLang()">
        ${showEn ? '🇵🇱 Pokaż PL' : '🇬🇧 Pokaż EN'}
      </button>` : '';

    return `
      <div class="screen quiz">
        <div class="quiz-header">
          <button class="quiz-abandon" onclick="Views.quiz._abandon()" title="Wróć do menu">✕</button>
          <span class="quiz-counter">${session.current + 1} / ${total}</span>
          ${q.domain ? `<span class="quiz-domain">${q.domain}</span>` : ''}
          <button class="quiz-report-btn" onclick="Views.quiz._openReportModal()" title="Zgłoś błąd w pytaniu">🚩</button>
        </div>
        <div class="quiz-progress">
          <div class="quiz-progress__bar" style="width:${pct}%"></div>
        </div>
        ${langToggle}
        <div class="quiz-question">${questionText}</div>
        <div class="quiz-answers" id="quiz-answers">${answerBtns}</div>
        <div id="explanation-panel" class="hidden"></div>
      </div>`;
  },

  _toggleLang() {
    AppState.showEnglish = !AppState.showEnglish;
    App.render();
  },

  _selectAnswer(selectedIndex) {
    // Disable all buttons immediately to prevent double-tap
    document.querySelectorAll('.answer-btn').forEach(btn => {
      btn.disabled = true;
    });
    // Mark selected as pending (visual only — correct/wrong applied in _processAnswer)
    document.querySelectorAll('.answer-btn')[selectedIndex]?.classList.add('answer-btn--pending');

    if (Storage.getSettings().confidenceEnabled) {
      this._showConfidenceOverlay(selectedIndex);
    } else {
      this._processAnswer(selectedIndex, null);
    }
  },

  _showConfidenceOverlay(selectedIndex) {
    const backdrop = document.createElement('div');
    backdrop.className = 'confidence-backdrop';
    backdrop.innerHTML = `
      <div class="confidence-sheet" id="confidence-sheet">
        <p class="confidence-sheet__title">Jak pewna/y byłaś/eś?</p>
        <button class="confidence-btn"
                onclick="Views.quiz._pickConfidence(1, ${selectedIndex})">
          🎲 Zgadywałem/am
        </button>
        <button class="confidence-btn"
                onclick="Views.quiz._pickConfidence(2, ${selectedIndex})">
          🤔 Nie byłem/am pewny/a
        </button>
        <button class="confidence-btn"
                onclick="Views.quiz._pickConfidence(3, ${selectedIndex})">
          ✅ Wiedziałem/am!
        </button>
      </div>`;
    // Tap outside backdrop = skip confidence (null, no SRS penalty)
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        backdrop.remove();
        Views.quiz._processAnswer(selectedIndex, null);
      }
    });
    document.body.appendChild(backdrop);
    // Trigger slide-up animation after paint
    requestAnimationFrame(() => {
      document.getElementById('confidence-sheet')?.classList.add('confidence-sheet--visible');
    });
  },

  _pickConfidence(confidence, selectedIndex) {
    document.querySelector('.confidence-backdrop')?.remove();
    this._processAnswer(selectedIndex, confidence);
  },

  _processAnswer(selectedIndex, confidence) {
    const session = AppState.quizSession;
    const q       = session.questions[session.current];
    const map     = session.shuffledMap[session.current];
    const { correctDisplayIndex } = map;
    const isCorrect = selectedIndex === correctDisplayIndex;
    const showEn    = AppState.showEnglish;
    const hasEn     = !!(q.question_en && map.displayAnswers_en[0]);

    // Remove pending state, apply correct/wrong highlight
    document.querySelectorAll('.answer-btn').forEach(btn => {
      btn.classList.remove('answer-btn--pending');
      const idx = parseInt(btn.dataset.index);
      if (idx === correctDisplayIndex)              btn.classList.add('correct');
      else if (idx === selectedIndex && !isCorrect) btn.classList.add('wrong');
    });

    QuizEngine.recordAnswer(q.id, isCorrect, confidence);
    Storage.recordConfidence(q.id, confidence, isCorrect);
    session.answers.push({ questionId: q.id, domain: q.domain, correct: isCorrect });

    if (!session.recentlyShown) session.recentlyShown = [];
    session.recentlyShown.push(q.id);

    const panel = document.getElementById('explanation-panel');
    panel.classList.remove('hidden');

    const explPl = q.explanation || '';
    const explEn = q.explanation_en || '';
    const explanationText = (showEn && hasEn) ? explEn : explPl;

    const explanationLangBtn = (hasEn && AppState.isTester) ? `
      <button class="btn-sm btn-lang-sm"
              onclick="Views.quiz._toggleExplLang(this, ${session.current})"
              data-showing="${showEn ? 'en' : 'pl'}">
        ${showEn ? '🇵🇱 PL' : '🇬🇧 EN'}
      </button>` : '';

    panel.innerHTML = `
      <div class="explanation-panel ${isCorrect ? 'explanation-panel--correct' : 'explanation-panel--wrong'}">
        <div class="explanation-header">
          <span class="explanation-verdict">${isCorrect ? '✅ Poprawnie!' : '❌ Błędna odpowiedź'}</span>
          ${explanationLangBtn}
        </div>
        <p class="explanation-text" id="expl-text">${explanationText}</p>
      </div>
      <button class="btn-next" onclick="Views.quiz._advance()">Dalej →</button>`;
  },

  _toggleExplLang(btn, qIdx) {
    const session    = AppState.quizSession;
    const q          = session.questions[qIdx];
    const showing    = btn.dataset.showing;
    const newShowing = showing === 'pl' ? 'en' : 'pl';
    const textEl     = document.getElementById('expl-text');
    if (textEl) {
      textEl.textContent = newShowing === 'en'
        ? (q.explanation_en || q.explanation)
        : q.explanation;
    }
    btn.dataset.showing = newShowing;
    btn.textContent = newShowing === 'en' ? '🇵🇱 PL' : '🇬🇧 EN';
  },

  // ---- Zgłaszanie błędów ----
  _openReportModal() {
    const session = AppState.quizSession;
    if (!session) return;
    const q = session.questions[session.current];

    // Usuń poprzedni modal jeśli istnieje
    document.getElementById('report-modal')?.remove();

    const categories = [
      { id: 'wrong_answer',  label: '❌ Błędna poprawna odpowiedź' },
      { id: 'unclear',       label: '❓ Niejasne pytanie' },
      { id: 'typo',          label: '✏️ Literówka / błąd w treści' },
      { id: 'translation',   label: '🌐 Błąd w tłumaczeniu (EN/PL)' },
      { id: 'other',         label: '💬 Inne' },
    ];

    const chips = categories.map(c => `
      <button type="button" class="report-chip" data-cat="${c.id}"
              onclick="Views.quiz._selectReportCat('${c.id}')">
        ${c.label}
      </button>`).join('');

    const modal = document.createElement('div');
    modal.id = 'report-modal';
    modal.className = 'report-modal';
    modal.innerHTML = `
      <div class="report-modal__card" role="dialog" aria-modal="true" aria-label="Zgłoś błąd">
        <div class="report-modal__header">
          <span>🚩 Zgłoś błąd w pytaniu</span>
          <button class="report-modal__close" onclick="Views.quiz._closeReportModal()" aria-label="Zamknij">✕</button>
        </div>
        <p class="report-modal__question-preview">"${q.question.slice(0, 100)}${q.question.length > 100 ? '…' : ''}"</p>
        <div class="report-modal__cats" id="report-cats">${chips}</div>
        <textarea id="report-comment" class="report-modal__textarea"
                  placeholder="Opcjonalnie: opisz dokładniej co jest nie tak…"
                  maxlength="500" rows="3"></textarea>
        <div id="report-modal-msg" class="report-modal__msg hidden"></div>
        <div class="report-modal__actions">
          <button class="btn-secondary" onclick="Views.quiz._closeReportModal()">Anuluj</button>
          <button class="btn-primary" id="report-submit-btn"
                  onclick="Views.quiz._submitReport()" disabled>Wyślij zgłoszenie</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    // Zamknij na klik tła
    modal.addEventListener('click', e => { if (e.target === modal) Views.quiz._closeReportModal(); });
  },

  _selectReportCat(catId) {
    document.querySelectorAll('.report-chip').forEach(el => {
      el.classList.toggle('selected', el.dataset.cat === catId);
    });
    const btn = document.getElementById('report-submit-btn');
    if (btn) btn.disabled = false;
  },

  _closeReportModal() {
    document.getElementById('report-modal')?.remove();
  },

  async _submitReport() {
    const session = AppState.quizSession;
    if (!session) return;
    const q        = session.questions[session.current];
    const catEl    = document.querySelector('.report-chip.selected');
    const comment  = document.getElementById('report-comment')?.value.trim();
    const msgEl    = document.getElementById('report-modal-msg');
    const submitBtn = document.getElementById('report-submit-btn');

    if (!catEl) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = '…';

    try {
      await SupabaseSync.reportQuestion({
        questionId:   q.id,
        questionText: q.question,
        category:     catEl.dataset.cat,
        comment,
      });
      this._closeReportModal();
      Views.quiz._showToast('✅ Zgłoszenie wysłane — dziękujemy!', true);
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = 'Błąd wysyłania — spróbuj ponownie.';
        msgEl.className   = 'report-modal__msg report-modal__msg--err';
      }
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Wyślij zgłoszenie';
    }
  },

  _showToast(msg, success = true) {
    const existing = document.getElementById('quiz-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id        = 'quiz-toast';
    toast.className = `quiz-toast ${success ? 'quiz-toast--ok' : 'quiz-toast--err'}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },
  // ---- koniec zgłaszania błędów ----

  _abandon() {
    AppState.quizSession = null;
    App.navigate('home');
  },

  _advance() {
    const session = AppState.quizSession;
    session.current++;
    if (session.current >= session.questions.length) {
      this._finishQuiz();
    } else {
      App.navigate('quiz');
    }
  },

  _finishQuiz() {
    const session = AppState.quizSession;
    const correct = session.answers.filter(a => a.correct).length;
    const total   = session.answers.length;
    const percent = Math.round((correct / total) * 100);

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
    const sortedDomains = [...domainResults].sort((a, b) => a.percent - b.percent);
    const weakestDomain = sortedDomains[0]?.domain || null;

    let bestStreak = 0, curStreak = 0;
    session.answers.forEach(a => {
      if (a.correct) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
      else curStreak = 0;
    });

    const result = { date: TODAY(), mode: session.mode, correct, total, percent, domainResults };
    Storage.saveResult(result);

    let streakExtended = false;
    if (session.mode === 'daily') {
      const wasAlreadyDone = StreakManager.isDailyDoneToday();
      StreakManager.markDailyDone();
      streakExtended = !wasAlreadyDone;
    } else {
      StreakManager.markActivityDone();
    }

    SupabaseSync.saveQuizSession({ mode: session.mode, correct, total, percent, domainResults }).catch(console.error);
    SupabaseSync.pushProgress().catch(console.error);

    AppState.lastSummary = { correct, total, percent, bestStreak, weakestDomain, streakExtended, mode: session.mode };
    AppState.quizSession = null;
    App.navigate('summary');
  },

  init() {},
};

// ==================== CONFETTI ====================
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width, y: -10 - Math.random() * 40,
    r: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    speed: Math.random() * 3 + 2, drift: (Math.random() - 0.5) * 2,
    spin: (Math.random() - 0.5) * 0.15, angle: Math.random() * Math.PI * 2,
  }));
  let raf;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.y += p.speed; p.x += p.drift; p.angle += p.spin;
      if (p.y < canvas.height + 10) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.5);
      ctx.restore();
    });
    if (alive) raf = requestAnimationFrame(animate); else canvas.remove();
  };
  animate();
  setTimeout(() => { cancelAnimationFrame(raf); canvas.remove(); }, 4000);
}

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

// ==================== SUMMARY VIEW ====================
Views.summary = {
  render() {
    const s = AppState.lastSummary;
    if (!s) { App.navigate('home'); return ''; }
    const barColor = s.percent >= 80 ? 'var(--green)' : s.percent >= 60 ? 'var(--yellow)' : 'var(--red)';
    const emoji    = s.percent >= 80 ? '🎉' : s.percent >= 60 ? '👍' : '💪';
    return `
      <div class="screen summary">
        <div class="summary__title">${emoji} Quiz ukończony!</div>
        ${s.streakExtended ? '<div class="summary__streak-msg">🔥 Seria przedłużona!</div>' : ''}
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
            <span>${s.bestStreak} pod rząd</span>
          </div>
          ${s.weakestDomain ? `
          <div class="summary__detail">
            <span>Najsłabsza domena:</span>
            <span>${s.weakestDomain}</span>
          </div>` : ''}
        </div>
        <div class="summary__actions">
          <button class="btn-secondary" onclick="App.navigate('home')">Wróć do menu</button>
          <button class="btn-primary" style="flex:1"
                  onclick="Views.summary._replay()">Zagraj ponownie</button>
        </div>
      </div>`;
  },

  init() {
    const s = AppState.lastSummary;
    if (!s) return;
    setTimeout(() => {
      const bar = document.querySelector('.summary__progress-bar');
      if (bar) bar.style.width = bar.dataset.target + '%';
    }, 100);
    if (s.percent >= 80) setTimeout(launchConfetti, 300);
    const newBadges = BadgeManager.checkAndUnlock();
    if (newBadges.length) {
      let delay = 800;
      newBadges.forEach(b => { setTimeout(() => showBadgePopup(b), delay); delay += 2500; });
    }
  },

  _replay() {
    const mode = AppState.lastSummary?.mode;
    if (mode === 'daily') App.navigate('daily-start');
    else App.navigate('mode-select');
  },
};

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
          <div class="domain-bar__fill" style="width:0%" data-target="${d.percent ?? 0}"></div>
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
    setTimeout(() => {
      document.querySelectorAll('.domain-bar__fill[data-target]').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    }, 100);
  },
};

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', () => App.init());
