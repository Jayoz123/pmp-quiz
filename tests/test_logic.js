// tests/test_logic.js — Node.js test runner (no dependencies)
// Run: node tests/test_logic.js

// Mock localStorage for Node
const _store = {};
global.localStorage = {
  getItem:    k => Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null,
  setItem:    (k, v) => { _store[k] = v; },
  removeItem: k => { delete _store[k]; },
};

// ===== MODULE DEFINITIONS (mirror of app.js logic sections) =====

const Storage = {
  _get(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  getHistory()          { return this._get('quiz_history', []); },
  saveResult(r)         { const h = this.getHistory(); h.push(r); this._set('quiz_history', h); },
  getStreakData()        { return this._get('streak_data', {}); },
  saveStreakData(d)      { this._set('streak_data', d); },
  getWeakQuestions()    { return this._get('weak_questions', {}); },
  saveWeakQuestions(wq) { this._set('weak_questions', wq); },
  getUnlockedBadges()   { return this._get('unlocked_badges', []); },
  saveUnlockedBadges(b) { this._set('unlocked_badges', b); },
};

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

const TODAY = () => new Date().toISOString().slice(0, 10);

const StreakManager = {
  markDailyDone() { const d = Storage.getStreakData(); d[TODAY()] = 'daily'; Storage.saveStreakData(d); },
  markActivityDone() { const d = Storage.getStreakData(); if (d[TODAY()] !== 'daily') d[TODAY()] = 'activity'; Storage.saveStreakData(d); },
  isDailyDoneToday() { return Storage.getStreakData()[TODAY()] === 'daily'; },
  getCurrentStreak() {
    const data = Storage.getStreakData();
    let streak = 0;
    const d = new Date();
    if (data[TODAY()] !== 'daily') d.setDate(d.getDate() - 1);
    for (let i = 0; i < 366; i++) {
      const key = d.toISOString().slice(0, 10);
      if (data[key] === 'daily') { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return streak;
  },
  getLast30Days() {
    const data = Storage.getStreakData();
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      return { date: key, status: data[key] || 'none' };
    });
  },
};

const BADGES_DEF = [
  { id: 'first',   check: s => s.totalQuizzes >= 1 },
  { id: 'week',    check: s => s.currentStreak >= 7 },
  { id: 'month',   check: s => s.currentStreak >= 30 },
  { id: 'hundred', check: s => s.totalAnswered >= 100 },
  { id: 'fivehun', check: s => s.totalAnswered >= 500 },
  { id: 'perfect', check: s => s.hadPerfectQuiz },
  { id: 'ready',   check: s => s.avg30 >= 80 },
];

const BadgeManager = {
  buildStats() {
    const history = Storage.getHistory();
    const totalAnswered = history.reduce((s, r) => s + (r.total || 0), 0);
    const totalQuizzes = history.length;
    const currentStreak = StreakManager.getCurrentStreak();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const last30 = history.filter(r => new Date(r.date) >= cutoff);
    const avg30 = last30.length ? Math.round(last30.reduce((s, r) => s + r.percent, 0) / last30.length) : 0;
    const hadPerfectQuiz = history.some(r => r.percent === 100);
    return { totalAnswered, totalQuizzes, currentStreak, avg30, hadPerfectQuiz };
  },
  checkAndUnlock() {
    const stats = this.buildStats();
    const unlocked = Storage.getUnlockedBadges();
    const newBadges = [];
    BADGES_DEF.forEach(b => {
      if (!unlocked.includes(b.id) && b.check(stats)) { unlocked.push(b.id); newBadges.push(b); }
    });
    if (newBadges.length) Storage.saveUnlockedBadges(unlocked);
    return newBadges;
  },
};

const StatsManager = {
  getAvg(days) {
    const history = Storage.getHistory();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const recent = history.filter(r => new Date(r.date) >= cutoff);
    if (!recent.length) return null;
    return Math.round(recent.reduce((s, r) => s + r.percent, 0) / recent.length);
  },
  getTotals() {
    const h = Storage.getHistory();
    return { quizzes: h.length, answered: h.reduce((s, r) => s + (r.total || 0), 0) };
  },
};

// ===== TEST RUNNER =====
let passed = 0, failed = 0;
function reset() { Object.keys(_store).forEach(k => delete _store[k]); }
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function assert(val, msg) { if (!val) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ===== STORAGE TESTS =====
console.log('\nStorage:');
reset();
test('getHistory returns [] initially', () => assertEqual(Storage.getHistory(), []));
test('saveResult appends one entry', () => {
  Storage.saveResult({ date: '2026-01-01', percent: 80, total: 10 });
  assert(Storage.getHistory().length === 1);
});
test('saveResult accumulates', () => {
  Storage.saveResult({ date: '2026-01-02', percent: 90, total: 10 });
  assert(Storage.getHistory().length === 2);
});
test('getStreakData returns {} initially', () => { reset(); assertEqual(Storage.getStreakData(), {}); });
test('saveStreakData round-trips', () => {
  Storage.saveStreakData({ '2026-01-01': 'daily' });
  assertEqual(Storage.getStreakData(), { '2026-01-01': 'daily' });
});
test('getWeakQuestions returns {} initially', () => { reset(); assertEqual(Storage.getWeakQuestions(), {}); });
test('getUnlockedBadges returns [] initially', () => assertEqual(Storage.getUnlockedBadges(), []));

// ===== QUIZ ENGINE TESTS =====
console.log('\nQuizEngine:');
const mockQs = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, domain: i % 2 === 0 ? 'Risk' : 'Cost',
  question: `Q${i+1}`, answers: ['A','B','C','D'], correct: 0, explanation: 'E',
}));

test('shuffle returns same length', () => assert(QuizEngine.shuffle([1,2,3]).length === 3));
test('shuffle does not mutate original', () => { const a=[1,2,3]; QuizEngine.shuffle(a); assertEqual(a,[1,2,3]); });
test('selectQuestions daily returns <= 30', () => assert(QuizEngine.selectQuestions(mockQs,'daily').length <= 30));
test('selectQuestions quick returns 10', () => assertEqual(QuizEngine.selectQuestions(mockQs,'quick').length, 10));
test('selectQuestions filters by domain', () => {
  assert(QuizEngine.selectQuestions(mockQs,'quick',['Risk']).every(q => q.domain === 'Risk'));
});
test('shuffleAnswers preserves correct answer text', () => {
  const q = { answers: ['W','X','Y','Z'], correct: 2 };
  const { displayAnswers, correctDisplayIndex } = QuizEngine.shuffleAnswers(q);
  assertEqual(displayAnswers[correctDisplayIndex], 'Y');
});
test('recordAnswer increments weak count on wrong', () => {
  reset();
  QuizEngine.recordAnswer(99, false);
  assertEqual(Storage.getWeakQuestions()[99], 1);
});
test('recordAnswer decrements on correct', () => {
  QuizEngine.recordAnswer(99, true);
  assert(!Storage.getWeakQuestions()[99]);
});
test('countWeakQuestions counts ids with count > 0', () => {
  reset();
  QuizEngine.recordAnswer(1, false);
  QuizEngine.recordAnswer(2, false);
  assertEqual(QuizEngine.countWeakQuestions(mockQs), 2);
});

// ===== STREAK MANAGER TESTS =====
console.log('\nStreakManager:');
reset();
test('getCurrentStreak is 0 with no data', () => assertEqual(StreakManager.getCurrentStreak(), 0));
test('isDailyDoneToday false initially', () => assert(!StreakManager.isDailyDoneToday()));
test('markDailyDone sets today as daily', () => {
  StreakManager.markDailyDone();
  assert(StreakManager.isDailyDoneToday());
});
test('getLast30Days returns 30 items', () => assertEqual(StreakManager.getLast30Days().length, 30));
test('getCurrentStreak counts consecutive daily days', () => {
  reset();
  const data = {};
  for (let i = 0; i < 5; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    data[d.toISOString().slice(0,10)] = 'daily';
  }
  Storage.saveStreakData(data);
  assertEqual(StreakManager.getCurrentStreak(), 5);
});
test('activity day does not count to streak', () => {
  reset();
  const data = {};
  const d = new Date(); d.setDate(d.getDate() - 1);
  data[d.toISOString().slice(0,10)] = 'activity';
  Storage.saveStreakData(data);
  assertEqual(StreakManager.getCurrentStreak(), 0);
});
test('markActivityDone does not overwrite daily', () => {
  reset();
  StreakManager.markDailyDone();
  StreakManager.markActivityDone();
  assertEqual(Storage.getStreakData()[TODAY()], 'daily');
});

// ===== BADGE MANAGER TESTS =====
console.log('\nBadgeManager:');
reset();
test('no badges for empty history', () => assertEqual(BadgeManager.checkAndUnlock(), []));
test('first badge after 1 quiz', () => {
  Storage.saveResult({ date: TODAY(), percent: 80, total: 10 });
  assert(BadgeManager.checkAndUnlock().some(b => b.id === 'first'));
});
test('perfect badge on 100%', () => {
  reset();
  Storage.saveResult({ date: TODAY(), percent: 100, total: 10 });
  assert(BadgeManager.checkAndUnlock().some(b => b.id === 'perfect'));
});
test('badges not re-unlocked', () => {
  const before = Storage.getUnlockedBadges().length;
  BadgeManager.checkAndUnlock();
  assertEqual(Storage.getUnlockedBadges().length, before);
});

// ===== STATS MANAGER TESTS =====
console.log('\nStatsManager:');
reset();
test('getAvg returns null for no history', () => assert(StatsManager.getAvg(7) === null));
test('getAvg returns correct average', () => {
  Storage.saveResult({ date: TODAY(), percent: 80, total: 10 });
  Storage.saveResult({ date: TODAY(), percent: 60, total: 10 });
  assertEqual(StatsManager.getAvg(7), 70);
});
test('getTotals returns correct counts', () => {
  reset();
  Storage.saveResult({ date: TODAY(), percent: 80, total: 10 });
  Storage.saveResult({ date: TODAY(), percent: 60, total: 5 });
  const t = StatsManager.getTotals();
  assertEqual(t.quizzes, 2);
  assertEqual(t.answered, 15);
});

console.log(`\n${'='.repeat(40)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
