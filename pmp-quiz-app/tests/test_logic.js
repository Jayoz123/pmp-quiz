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
  getSettings()         { return this._get('settings', { confidenceEnabled: true }); },
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
  recordAnswer(id, wasCorrect, confidence = null) {
    const wq = Storage.getWeakQuestions();
    if (!wasCorrect || confidence === 1) {
      wq[id] = (wq[id] || 0) + 1;
    } else if (confidence === 2) {
      // no-op: unsure but correct — do not change pool
    } else {
      // confidence 3 or null: normal correct behavior
      if (wq[id]) { wq[id] = Math.max(0, wq[id] - 1); if (wq[id] === 0) delete wq[id]; }
    }
    Storage.saveWeakQuestions(wq);
  },
  selectTrialQuestions(allQuestions, n) { return this.shuffle([...allQuestions]).slice(0, n); },
};

const TODAY = () => new Date().toISOString().slice(0, 10);

// ===== TRIAL EXAM (plan 12) — mirror app.js =====
const TRIAL_VARIANTS = [
  { id: 'full',  questions: 180, minutes: 230 },
  { id: 'half',  questions: 90,  minutes: 115 },
  { id: 'short', questions: 60,  minutes: 77  },
];
const trialVariant = id => TRIAL_VARIANTS.find(v => v.id === id) || TRIAL_VARIANTS[0];
function trialRating(percent) {
  if (percent >= 80) return 'above';
  if (percent >= 65) return 'target';
  if (percent >= 50) return 'below';
  return 'needs';
}
// Mirror rdzenia scoringu z Views.trial._finish (unanswered = błędne)
function scoreTrial(answers, correctIdx) {
  let correct = 0;
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] !== null && answers[i] === correctIdx[i]) correct++;
  }
  const total = answers.length;
  return { correct, total, percent: Math.round((correct / total) * 100) };
}

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
  getMonthData(year, month) {
    const data = Storage.getStreakData();
    const todayKey = TODAY();
    const today = new Date();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDow = (firstDay.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < firstDow; i++) days.push({ type: 'padding' });
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const current = new Date(year, month, d);
      const key = current.toISOString().slice(0, 10);
      const isToday = key === todayKey;
      const isFuture = current > today && !isToday;
      let status = 'none';
      if (isFuture) status = 'future';
      else if (data[key] === 'daily') status = 'done';
      else if (data[key] === 'activity') status = 'activity';
      else if (isToday) status = 'today';
      days.push({ type: 'day', dayNum: d, date: key, status, isToday });
    }
    return days;
  },
  getActiveMonths() {
    const data = Storage.getStreakData();
    const keys = Object.keys(data).sort();
    const months = new Set();
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.add(fmt(now));
    months.add(fmt(prev));
    keys.forEach(k => months.add(k.slice(0, 7)));
    return Array.from(months).sort(); // Sort chronologically (oldest to newest)
  },
  getDayDetails(dateKey) {
    const h = Storage.getHistory();
    const dayEntries = h.filter(r => r.date === dateKey);
    if (!dayEntries.length) return null;
    const counts = {};
    dayEntries.forEach(r => { counts[r.mode] = (counts[r.mode] || 0) + 1; });
    const modeNames = { daily: 'Daily Challenge', quick: 'Quick Quiz', standard: 'Standard Quiz', weak: 'Weak Questions', trial: 'Trial Exam' };
    return Object.entries(counts).map(([mode, count]) => {
      const name = modeNames[mode] || mode;
      return `${count}x ${name}`;
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
  { id: 'trial_first',    check: s => s.trialCount >= 1 },
  { id: 'trial_marathon', check: s => s.trialFullDone },
  { id: 'trial_target',   check: s => s.trialBest >= 80 },
  { id: 'trial_clock',    check: s => s.trialBeatClock },
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
    const trials = history.filter(r => r.mode === 'trial');
    const trialCount     = trials.length;
    const trialFullDone  = trials.some(r => r.examLength === 180);
    const trialBest      = trials.reduce((m, r) => Math.max(m, r.percent || 0), 0);
    const trialBeatClock = trials.some(r => r.durationSec && r.timeLeftSec >= r.durationSec * 0.25);
    return { totalAnswered, totalQuizzes, currentStreak, avg30, hadPerfectQuiz,
             trialCount, trialFullDone, trialBest, trialBeatClock };
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
test('getSettings returns { confidenceEnabled: true } initially', () => {
  reset();
  assertEqual(Storage.getSettings(), { confidenceEnabled: true });
});
test('saveSettings persists and overwrites', () => {
  Storage.saveSettings({ confidenceEnabled: false });
  assertEqual(Storage.getSettings().confidenceEnabled, false);
});
test('getConfidenceData returns {} initially', () => {
  reset();
  assertEqual(Storage.getConfidenceData(), {});
});
test('recordConfidence null is a no-op', () => {
  reset();
  Storage.recordConfidence(5, null, true);
  assertEqual(Storage.getConfidenceData(), {});
});
test('recordConfidence tracks confident correct (3)', () => {
  reset();
  Storage.recordConfidence(5, 3, true);
  assertEqual(Storage.getConfidenceData()[5]['3_correct'], 1);
});
test('recordConfidence tracks guessed correct (1)', () => {
  reset();
  Storage.recordConfidence(5, 1, true);
  assertEqual(Storage.getConfidenceData()[5]['1_correct'], 1);
});
test('recordConfidence tracks wrong', () => {
  reset();
  Storage.recordConfidence(5, 2, false);
  assertEqual(Storage.getConfidenceData()[5].wrong, 1);
});
test('recordConfidence accumulates across calls', () => {
  reset();
  Storage.recordConfidence(5, 3, true);
  Storage.recordConfidence(5, 3, true);
  assertEqual(Storage.getConfidenceData()[5]['3_correct'], 2);
});

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
test('recordAnswer confidence=1 correct adds to weak pool', () => {
  reset();
  QuizEngine.recordAnswer(10, true, 1);
  assertEqual(Storage.getWeakQuestions()[10], 1);
});
test('recordAnswer confidence=2 correct is no-op on weak pool', () => {
  reset();
  Storage.saveWeakQuestions({ 10: 2 });
  QuizEngine.recordAnswer(10, true, 2);
  assertEqual(Storage.getWeakQuestions()[10], 2);
});
test('recordAnswer confidence=2 correct does not add if not in pool', () => {
  reset();
  QuizEngine.recordAnswer(10, true, 2);
  assert(!Storage.getWeakQuestions()[10]);
});
test('recordAnswer confidence=3 correct decrements weak pool', () => {
  reset();
  Storage.saveWeakQuestions({ 10: 2 });
  QuizEngine.recordAnswer(10, true, 3);
  assertEqual(Storage.getWeakQuestions()[10], 1);
});
test('recordAnswer confidence=null correct decrements backward compat', () => {
  reset();
  Storage.saveWeakQuestions({ 10: 1 });
  QuizEngine.recordAnswer(10, true, null);
  assert(!Storage.getWeakQuestions()[10]);
});
test('recordAnswer wrong always increments regardless of confidence', () => {
  reset();
  QuizEngine.recordAnswer(10, false, 3);
  assertEqual(Storage.getWeakQuestions()[10], 1);
});
test('recordAnswer wrong with confidence=1 increments', () => {
  reset();
  QuizEngine.recordAnswer(10, false, 1);
  assertEqual(Storage.getWeakQuestions()[10], 1);
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
  assert(StreakManager.isDailyDoneToday());
});

test('getMonthData basic check', () => {
  const monthData = StreakManager.getMonthData(2024, 0); // Jan 2024 (starts on Mon)
  assert(monthData[0].type === 'day' && monthData[0].dayNum === 1, 'Jan 1 2024 should be Mon (no padding)');
  assert(monthData.length === 31, 'Jan should have 31 days');
});

test('getActiveMonths basic check', () => {
  const activeMonths = StreakManager.getActiveMonths();
  assert(activeMonths.length >= 2, 'Should at least contain current and previous month');

  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  assert(activeMonths.includes(fmt(now)), 'Should contain current month');
  assert(activeMonths.includes(fmt(prev)), 'Should contain previous month');

  // Check sorting
  assert(activeMonths[0] <= activeMonths[activeMonths.length-1], 'Should be sorted chronologically');
});

test('getDayDetails basic check', () => {
  reset();
  const date = TODAY();
  Storage.saveResult({ date, mode: 'daily', correct: 1, total: 1, percent: 100 });
  Storage.saveResult({ date, mode: 'quick', correct: 8, total: 10, percent: 80 });

  const details = StreakManager.getDayDetails(date);
  assert(details.length === 2, 'Should have 2 types of activity');
  assert(details.some(d => d.includes('Daily Challenge')), 'Should mention Daily Challenge');
  assert(details.some(d => d.includes('Quick Quiz')), 'Should mention Quick Quiz');
});

// ===== BADGE MANAGER TESTS =====
console.log('\nBadgeManager:');
test('buildStats calculates totalQuizzes from history', () => {
  reset();
  Storage.saveResult({ date: '2026-01-01', percent: 80, total: 10 });
  const stats = BadgeManager.buildStats();
  assertEqual(stats.totalQuizzes, 1);
});
test('checkAndUnlock unlocks badge when condition met', () => {
  reset();
  Storage.saveResult({ date: '2026-01-01', percent: 100, total: 30 });
  const newBadges = BadgeManager.checkAndUnlock();
  const unlocked = Storage.getUnlockedBadges();
  assert(unlocked.includes('first'));
});

// ===== STATS MANAGER TESTS =====
console.log('\nStatsManager:');
test('getAvg calculates average percent', () => {
  reset();
  const today = new Date().toISOString().split('T')[0];
  Storage.saveResult({ date: today, percent: 80, total: 10 });
  Storage.saveResult({ date: today, percent: 90, total: 10 });
  const avg = StatsManager.getAvg(10);
  assertEqual(avg, 85);
});
test('getPerDomain returns all domains', () => {
  reset();
  const domains = StatsManager.getPerDomain(mockQs);
  assert(domains.length > 0);
});

// ===== TRIAL EXAM TESTS (plan 12, sekcja 19a) =====
console.log('\nTrial — variants & rating:');
test('trialVariant returns matching variant', () => assertEqual(trialVariant('half').id, 'half'));
test('trialVariant falls back to full', () => assertEqual(trialVariant('nope').id, 'full'));
test('variant times: full=230, half=115, short=77', () => {
  assert(trialVariant('full').minutes === 230 && trialVariant('half').minutes === 115 && trialVariant('short').minutes === 77);
});
test('variant questions: 180/90/60', () => {
  assert(trialVariant('full').questions === 180 && trialVariant('half').questions === 90 && trialVariant('short').questions === 60);
});
test('trialRating 100 -> above', () => assertEqual(trialRating(100), 'above'));
test('trialRating 80 -> above',  () => assertEqual(trialRating(80),  'above'));
test('trialRating 79 -> target', () => assertEqual(trialRating(79),  'target'));
test('trialRating 65 -> target', () => assertEqual(trialRating(65),  'target'));
test('trialRating 64 -> below',  () => assertEqual(trialRating(64),  'below'));
test('trialRating 50 -> below',  () => assertEqual(trialRating(50),  'below'));
test('trialRating 49 -> needs',  () => assertEqual(trialRating(49),  'needs'));

console.log('\nTrial — selectTrialQuestions:');
const trialPool = Array.from({ length: 990 }, (_, i) => ({ id: i + 1 }));
test('selectTrialQuestions returns n', () => assertEqual(QuizEngine.selectTrialQuestions(trialPool, 180).length, 180));
test('selectTrialQuestions no duplicates', () => {
  const sel = QuizEngine.selectTrialQuestions(trialPool, 180);
  assertEqual(new Set(sel.map(q => q.id)).size, 180);
});
test('selectTrialQuestions caps at pool size', () => assertEqual(QuizEngine.selectTrialQuestions(trialPool.slice(0, 50), 180).length, 50));

console.log('\nTrial — scoring (unanswered = wrong):');
test('all correct -> 100%', () => assertEqual(scoreTrial([0,1,2,3], [0,1,2,3]).percent, 100));
test('5 of 10 -> 50%', () => assertEqual(scoreTrial([0,0,0,0,0,9,9,9,9,9], [0,0,0,0,0,0,0,0,0,0]).percent, 50));
test('null counts as wrong', () => assertEqual(scoreTrial([0, null, 2], [0, 1, 2]), { correct: 2, total: 3, percent: 67 }));

console.log('\nTrial — buildStats & badges:');
test('buildStats trial fields from history', () => {
  reset();
  Storage.saveResult({ date: '2026-01-01', mode: 'daily', percent: 90, total: 30 });
  Storage.saveResult({ date: '2026-01-02', mode: 'trial', percent: 82, total: 180, examLength: 180, durationSec: 13800, timeLeftSec: 4000 });
  const s = BadgeManager.buildStats();
  assert(s.trialCount === 1, 'trialCount');
  assert(s.trialFullDone === true, 'trialFullDone');
  assert(s.trialBest === 82, 'trialBest');
  assert(s.trialBeatClock === true, 'trialBeatClock (4000 >= 13800*0.25=3450)');
});
test('trialBeatClock false when time left < 25%', () => {
  reset();
  Storage.saveResult({ date: '2026-01-02', mode: 'trial', percent: 70, total: 60, examLength: 60, durationSec: 4620, timeLeftSec: 1000 });
  assertEqual(BadgeManager.buildStats().trialBeatClock, false);
});
test('no trials -> zero/false stats', () => {
  reset();
  const s = BadgeManager.buildStats();
  assert(s.trialCount === 0 && s.trialFullDone === false && s.trialBest === 0 && s.trialBeatClock === false);
});
test('trial badges unlock when conditions met', () => {
  reset();
  Storage.saveResult({ date: '2026-01-02', mode: 'trial', percent: 82, total: 180, examLength: 180, durationSec: 13800, timeLeftSec: 4000 });
  BadgeManager.checkAndUnlock();
  const u = Storage.getUnlockedBadges();
  assert(u.includes('trial_first') && u.includes('trial_marathon') && u.includes('trial_target') && u.includes('trial_clock'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

