'use strict';

// ==================== CONSTANTS ====================
const QUIZ_SIZES = { daily: 30, quick: 10, weak: 10 };
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

// ==================== STORAGE ====================
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

// ==================== APP STATE ====================
const AppState = {
  questions: [],
  quizSession: null,   // { questions, current, answers, mode, shuffledMap }
  lastSummary: null,   // { correct, total, percent, bestStreak, weakestDomain, streakExtended, mode }
  pendingMode: null,
  pendingDomains: [],
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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
    }
    this.navigate('loading');
    try {
      const res = await fetch('./questions.json');
      AppState.questions = await res.json();
    } catch (e) {
      console.error('Failed to load questions.json', e);
      AppState.questions = [];
    }
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
  init() {},
};

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
  init() {},
};

// ==================== MODE SELECT VIEW ====================
Views['mode-select'] = {
  _selectedMode: 'quick',
  _selectedDomains: [],

  render() {
    const domains = [...new Set(AppState.questions.map(q => q.domain).filter(Boolean))].sort();
    const weakCount = QuizEngine.countWeakQuestions(AppState.questions);
    const weakDisabled = weakCount < 10;
    const self = Views['mode-select'];

    const domainChips = domains.map(d => {
      const sel = self._selectedDomains.includes(d);
      return `<div class="domain-chip ${sel ? 'selected' : ''}"
                   onclick="Views['mode-select']._toggleDomain('${d}')">${d}</div>`;
    }).join('');

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
             onclick="Views['mode-select']._selectMode('weak')">
          <h3>🎯 Moje słabe pytania</h3>
          <p>${weakDisabled
            ? `Potrzebujesz ≥ 10 błędnych pytań — masz ${weakCount}`
            : `${weakCount} pytań do powtórki`}</p>
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
    else this._selectedDomains.push(domain);
    App.render();
  },

  _selectMode(mode) {
    this._selectedMode = mode;
    App.render();
  },

  _startQuiz() {
    const questions = QuizEngine.selectQuestions(
      AppState.questions,
      this._selectedMode,
      this._selectedDomains
    );
    if (!questions.length) {
      alert('Brak pytań dla wybranych filtrów. Zmień ustawienia.');
      return;
    }
    AppState.quizSession = { questions, current: 0, answers: [], mode: this._selectedMode, shuffledMap: {} };
    this._selectedDomains = [];
    this._selectedMode = 'quick';
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
    const questions = QuizEngine.selectQuestions(AppState.questions, 'daily');
    AppState.quizSession = { questions, current: 0, answers: [], mode: 'daily', shuffledMap: {} };
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
    const { displayAnswers } = session.shuffledMap[session.current];
    const total = session.questions.length;
    const pct = Math.round((session.current / total) * 100);
    const letters = ['A', 'B', 'C', 'D'];

    const answerBtns = displayAnswers.map((text, i) => `
      <button class="answer-btn" data-index="${i}"
              onclick="Views.quiz._selectAnswer(${i})">
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

  _selectAnswer(selectedIndex) {
    const session = AppState.quizSession;
    const q = session.questions[session.current];
    const { correctDisplayIndex } = session.shuffledMap[session.current];
    const isCorrect = selectedIndex === correctDisplayIndex;

    document.querySelectorAll('.answer-btn').forEach(btn => {
      btn.disabled = true;
      const idx = parseInt(btn.dataset.index);
      if (idx === correctDisplayIndex) btn.classList.add('correct');
      else if (idx === selectedIndex && !isCorrect) btn.classList.add('wrong');
    });

    QuizEngine.recordAnswer(q.id, isCorrect);
    session.answers.push({ questionId: q.id, domain: q.domain, correct: isCorrect });

    if (isCorrect) {
      setTimeout(() => this._advance(), 1500);
    } else {
      const panel = document.getElementById('explanation-panel');
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <div class="explanation-panel">
          <p><strong>Wyjaśnienie:</strong> ${q.explanation}</p>
        </div>
        <button class="btn-next" onclick="Views.quiz._advance()" style="margin-top:10px">
          Dalej →
        </button>`;
    }
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
    const total = session.answers.length;
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
      StreakManager.markDailyDone();
      streakExtended = true;
    } else {
      StreakManager.markActivityDone();
    }

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
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
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
    set