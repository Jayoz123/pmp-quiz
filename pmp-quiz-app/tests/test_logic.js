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
  _isResumableQuizSession(s) {
    return !!s
      && s.mode !== 'trial'
      && Array.isArray(s.questions)
      && s.questions.length > 0
      && Array.isArray(s.answers)
      && s.answers.length > 0
      && Number.isInteger(s.current)
      && s.current >= 0
      && s.current < s.questions.length;
  },
  getActiveQuizSession() {
    const session = this._get('active_quiz_session', null);
    if (!this._isResumableQuizSession(session)) {
      this.clearActiveQuizSession();
      return null;
    }
    return session;
  },
  saveActiveQuizSession(s) { this._set('active_quiz_session', s); },
  clearActiveQuizSession() { try { localStorage.removeItem('active_quiz_session'); } catch {} },
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

const emptyFilters = () => ({ domains: [], ecoDomains: [], approachTags: [], difficulties: [], qtypes: [] });
const ECO_DOMAIN_KEYS = ['People', 'Process', 'Business Environment'];
const READINESS_CONFIG = {
  minimumAnswersForDiagnostic: 30,
  minimumAnswersForReadiness: 90,
  targetAnswersForReadiness: 120,
  minimumPerEcoDomain: 20,
  targetPerEcoDomain: 40,
};
const labelFor = (_labels, key) => key;
const tDomain = key => key;
const tEcoDomain = key => key;
const tApproach = key => key;
const tQtype = key => key;
const tDifficulty = key => key;
const questionTagItems = (question, detailed = false) => {
  const tags = [
    question.domain && { kind: 'domain', text: tDomain(question.domain), className: 'quiz-tag--domain' },
    question.eco_domain && { kind: 'eco', text: tEcoDomain(question.eco_domain), className: 'quiz-tag--eco' },
    ...(question.approach_tags || []).map(tag => ({ kind: 'approach', text: tApproach(tag), className: 'quiz-tag--approach' })),
  ].filter(Boolean);
  if (detailed && question.qtype) tags.push({ kind: 'qtype', text: tQtype(question.qtype), className: 'quiz-tag--detail' });
  if (detailed && question.difficulty) tags.push({ kind: 'difficulty', text: tDifficulty(question.difficulty), className: 'quiz-tag--detail' });
  return tags;
};
function formatDurationHms(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hh = String(Math.floor(safeSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(safeSeconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
function formatDisplayNick(nick) {
  const trimmed = String(nick || '').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}
const AppProblemReport = {
  sanitizeHash(hash) {
    return String(hash || '').startsWith('#/') ? hash : null;
  },
  sanitizeHref(href) {
    try {
      const url = new URL(href);
      return `${url.origin}${url.pathname}`;
    } catch {
      return null;
    }
  },
  buildPayload({ userId, category, comment, appVersion, userAgent, pageHref, pageHash, settings = {} }) {
    return {
      user_id: userId,
      category,
      comment: comment || null,
      app_version: appVersion || null,
      user_agent: userAgent || null,
      page_href: this.sanitizeHref(pageHref),
      page_hash: this.sanitizeHash(pageHash),
      app_language: settings.defaultLanguage || null,
      app_theme: settings.theme || null,
    };
  },
};
const filterForSegment = (dimension, key) => {
  const filters = emptyFilters();
  const filterKey = { domain: 'domains', ecoDomain: 'ecoDomains', approach: 'approachTags', difficulty: 'difficulties', qtype: 'qtypes' }[dimension];
  if (filterKey) filters[filterKey] = [key];
  return filters;
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
  normalizeFilters(filters) {
    if (Array.isArray(filters)) return { ...emptyFilters(), domains: filters };
    return { ...emptyFilters(), ...(filters || {}) };
  },
  matchesFilters(q, filters = {}) {
    const f = this.normalizeFilters(filters);
    const selectedIn = (values, value) => values.length === 0 || values.includes(value);
    return selectedIn(f.domains, q.domain)
      && selectedIn(f.ecoDomains, q.eco_domain)
      && selectedIn(f.difficulties, q.difficulty)
      && selectedIn(f.qtypes, q.qtype)
      && (f.approachTags.length === 0 || (q.approach_tags || []).some(tag => f.approachTags.includes(tag)));
  },
  countAvailable(allQuestions, mode, filters = {}) {
    const matching = allQuestions.filter(q => this.matchesFilters(q, filters));
    if (mode !== 'weak') return matching.length;
    const weak = Storage.getWeakQuestions();
    return matching.filter(q => (weak[q.id] || 0) > 0).length;
  },
  selectQuestions(allQuestions, mode, filters = [], recentlyShown = [], requestedSize = null) {
    const matching = allQuestions.filter(q => this.matchesFilters(q, filters));
    if (mode === 'weak') {
      const wq = Storage.getWeakQuestions();
      let pool = [];
      matching.forEach(q => {
        const count = wq[q.id] || 0;
        if (count > 0) { const w = Math.min(count * 3, 9); for (let i = 0; i < w; i++) pool.push(q); }
      });
      pool = this.shuffle(pool);
      const seen = new Set();
      return pool.filter(q => { if (seen.has(q.id)) return false; seen.add(q.id); return true; }).slice(0, 10);
    }
    const size = requestedSize || (mode === 'daily' ? 30 : 10);
    return this.shuffle(matching).slice(0, size);
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
  answerRecord(q, correct) {
    return { questionId: q.id, correct, domain: q.domain, ecoDomain: q.eco_domain, ecoTask: q.eco_task,
      difficulty: q.difficulty, qtype: q.qtype, approachTags: q.approach_tags || [] };
  },
  buildDomainResults(answers) {
    const totals = {};
    answers.forEach(a => {
      if (!a.domain) return;
      if (!totals[a.domain]) totals[a.domain] = { correct: 0, total: 0 };
      totals[a.domain].total++;
      if (a.correct) totals[a.domain].correct++;
    });
    return Object.entries(totals).map(([domain, values]) => ({ domain, ...values, percent: Math.round(values.correct / values.total * 100) }));
  },
  buildBreakdowns(answers) {
    const totals = { ecoDomain: {}, approach: {}, difficulty: {}, qtype: {}, ecoTask: {}, domain: {} };
    const add = (dimension, key, correct) => {
      if (!key) return;
      if (!totals[dimension][key]) totals[dimension][key] = { correct: 0, total: 0 };
      totals[dimension][key].total++;
      if (correct) totals[dimension][key].correct++;
    };
    answers.forEach(a => {
      add('domain', a.domain, a.correct); add('ecoDomain', a.ecoDomain, a.correct);
      add('difficulty', a.difficulty, a.correct); add('qtype', a.qtype, a.correct); add('ecoTask', a.ecoTask, a.correct);
      (a.approachTags || []).forEach(tag => add('approach', tag, a.correct));
    });
    return Object.fromEntries(Object.entries(totals).map(([dimension, values]) => [
      dimension, Object.entries(values).map(([key, count]) => ({ key, ...count, percent: Math.round(count.correct / count.total * 100) })),
    ]));
  },
  selectTrialQuestions(allQuestions, n) { return this.shuffle([...allQuestions]).slice(0, n); },
};

const TODAY = () => new Date().toISOString().slice(0, 10);

const QuizSessionPersistence = {
  buildResumableCopy(session, nextCurrent = session?.current) {
    if (!session || session.mode === 'trial' || !Array.isArray(session.questions) || !Array.isArray(session.answers)) return null;
    if (session.answers.length === 0) return null;
    if (!Number.isInteger(nextCurrent) || nextCurrent < 0 || nextCurrent >= session.questions.length) return null;
    return { ...session, current: nextCurrent, currentAnswer: null };
  },
  buildResumeProgressLabel(session) {
    const answered = Array.isArray(session?.answers) ? session.answers.length : 0;
    const total = Array.isArray(session?.questions) ? session.questions.length : 0;
    return `${answered} / ${total}`;
  },
};

const Engagement = {
  questionExp(wasCorrect) { return wasCorrect ? 5 : 1; },
  scoreAnswers({ correct, total, mode }) {
    const wrong = total - correct;
    let careerExp = correct * this.questionExp(true) + wrong * this.questionExp(false);
    let rankingDelta = correct * 2 - wrong * 2;
    if (mode === 'daily') careerExp += 20;
    if (mode === 'daily' && correct / total >= 0.7) rankingDelta += 5;
    if (mode === 'trial') careerExp += 50;
    if (mode === 'trial' && correct / total >= 0.8) careerExp += 100;
    return { careerExp, rankingDelta: this.clampRankingScore(rankingDelta) };
  },
  clampRankingScore(score) { return Math.max(0, Number(score) || 0); },
  normalizeLeaderboardRows(rows) {
    return (rows || []).map(item => ({
      ...item,
      score: this.clampRankingScore(item.ranking_score ?? item.score),
    }));
  },
  levelForExp(exp) { return Math.floor(Math.sqrt(Math.max(0, exp) / 100)) + 1; },
};

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
    const totals = recent.reduce((sum, r) => ({ correct: sum.correct + (Number.isFinite(r.correct) ? r.correct : r.percent * (r.total || 1) / 100), total: sum.total + (r.total || 1) }), { correct: 0, total: 0 });
    return Math.round(totals.correct / totals.total * 100);
  },
  getPerDomain(questions) {
    const history = Storage.getHistory();
    const domains = [...new Set(questions.map(q => q.domain).filter(Boolean))].sort();
    return domains.map(domain => {
      const entries = history.flatMap(r => r.domainResults || []).filter(d => d.domain === domain);
      if (!entries.length) return { domain, percent: null, total: 0 };
      const counted = entries.filter(entry => Number.isFinite(entry.correct) && Number.isFinite(entry.total));
      if (!counted.length) return { domain, percent: Math.round(entries.reduce((s, d) => s + d.percent, 0) / entries.length), total: null };
      const correct = counted.reduce((sum, entry) => sum + entry.correct, 0);
      const total = counted.reduce((sum, entry) => sum + entry.total, 0);
      return { domain, percent: Math.round(correct / total * 100), total };
    });
  },
  getRecentClassifiedHistory(days = 30, maxAnswers = READINESS_CONFIG.targetAnswersForReadiness) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    let answered = 0;
    return Storage.getHistory().slice().reverse().filter(result => {
      if (answered >= maxAnswers || new Date(result.date) < cutoff || !(result.breakdowns?.ecoDomain || []).length) return false;
      answered += result.total || 0;
      return true;
    });
  },
  aggregateBreakdown(results, dimension) {
    const totals = {};
    results.flatMap(result => result.breakdowns?.[dimension] || []).forEach(item => {
      if (!totals[item.key]) totals[item.key] = { correct: 0, total: 0 };
      totals[item.key].correct += item.correct || 0;
      totals[item.key].total += item.total || 0;
    });
    return Object.entries(totals).map(([key, item]) => ({
      key, ...item, percent: Math.round(item.correct / item.total * 100),
    }));
  },
  resultFromAnswerRecords(answerRecords) {
    const records = Array.isArray(answerRecords) ? answerRecords : [];
    const correct = records.filter(record => record.correct).length;
    const total = records.length;
    return {
      date: TODAY(),
      mode: 'preview',
      correct,
      total,
      percent: total ? Math.round(correct / total * 100) : 0,
      breakdowns: QuizEngine.buildBreakdowns(records),
    };
  },
  calculateReadiness(recent) {
    const answered = recent.reduce((sum, result) => sum + (result.total || 0), 0);
    if (answered < READINESS_CONFIG.minimumAnswersForDiagnostic) {
      return { state: 'calibrating', answered, required: READINESS_CONFIG.minimumAnswersForDiagnostic };
    }
    const correct = recent.reduce((sum, result) => sum + (result.correct || 0), 0);
    const accuracy = Math.round(correct / answered * 100);
    const byDomain = Object.fromEntries(this.aggregateBreakdown(recent, 'ecoDomain').map(item => [item.key, item]));
    const eco = ECO_DOMAIN_KEYS.map(key => {
      const item = byDomain[key] || { key, correct: 0, total: 0 };
      return { ...item, percent: item.total ? Math.round(item.correct / item.total * 100) : 0 };
    });
    const ecoAnswered = eco.reduce((sum, item) => sum + item.total, 0);
    const ecoCorrect = eco.reduce((sum, item) => sum + item.correct, 0);
    const rawMastery = ecoAnswered ? Math.round(ecoCorrect / ecoAnswered * 100) : accuracy;
    const answeredFactor = Math.min(1, answered / READINESS_CONFIG.targetAnswersForReadiness);
    const minEcoCoverageFactor = eco.reduce((sum, item) => {
      return sum + Math.min(1, item.total / READINESS_CONFIG.targetPerEcoDomain);
    }, 0) / ECO_DOMAIN_KEYS.length;
    const coverageFactor = answeredFactor * minEcoCoverageFactor;
    const score = Math.round(rawMastery * coverageFactor);
    const sampled = eco.filter(item => item.total >= 5);
    const weakest = sampled.slice().sort((a, b) => a.percent - b.percent || b.total - a.total)[0] || null;
    const coverageGap = eco
      .filter(item => item.total < READINESS_CONFIG.minimumPerEcoDomain)
      .sort((a, b) => a.total - b.total || ECO_DOMAIN_KEYS.indexOf(a.key) - ECO_DOMAIN_KEYS.indexOf(b.key))[0] || null;
    const state = answered >= READINESS_CONFIG.minimumAnswersForReadiness && !coverageGap
      ? 'ready'
      : 'building_evidence';
    return {
      state, score, accuracy, coverageFactor, rawMastery, weakest, coverageGap, answered,
      required: state === 'building_evidence' ? READINESS_CONFIG.targetAnswersForReadiness : READINESS_CONFIG.minimumAnswersForDiagnostic,
      domains: eco,
    };
  },
  getReadiness(extraResults = []) {
    const recent = [...(Array.isArray(extraResults) ? extraResults : []), ...this.getRecentClassifiedHistory()]
      .filter(result => (result.breakdowns?.ecoDomain || []).length);
    return this.calculateReadiness(recent);
  },
  getReadinessWithAdditionalAnswers(answerRecords) {
    const records = Array.isArray(answerRecords) ? answerRecords : [];
    return this.getReadiness(records.length ? [this.resultFromAnswerRecords(records)] : []);
  },
  previewReadinessDelta(answerRecordsBefore, answerRecordAfter) {
    const beforeRecords = Array.isArray(answerRecordsBefore) ? answerRecordsBefore : [];
    const afterRecords = answerRecordAfter ? [...beforeRecords, answerRecordAfter] : beforeRecords;
    const before = this.getReadinessWithAdditionalAnswers(beforeRecords);
    const after = this.getReadinessWithAdditionalAnswers(afterRecords);
    const delta = before.state === 'ready' && after.state === 'ready'
      ? after.score - before.score
      : null;
    return { before, after, delta };
  },
  getReadinessInsight(questions) {
    const readiness = this.getReadiness();
    const hasQuestions = Array.isArray(questions) && questions.length > 0;
    const canTrain = item => hasQuestions && QuizEngine.countAvailable(questions, 'quick', filterForSegment('ecoDomain', item.key)) >= 10;
    const weakEnough = readiness.weakest && readiness.weakest.total >= READINESS_CONFIG.minimumPerEcoDomain && canTrain(readiness.weakest);
    const gapTrainable = readiness.coverageGap && canTrain(readiness.coverageGap);
    const recommended = weakEnough
      ? { dimension: 'ecoDomain', key: readiness.weakest.key, total: readiness.weakest.total, percent: readiness.weakest.percent, filters: filterForSegment('ecoDomain', readiness.weakest.key) }
      : gapTrainable
        ? { dimension: 'ecoDomain', key: readiness.coverageGap.key, total: readiness.coverageGap.total, percent: readiness.coverageGap.percent, filters: filterForSegment('ecoDomain', readiness.coverageGap.key), reason: 'coverage' }
        : this.getRecommendation(questions);
    return {
      readiness,
      recommended,
      primaryGapLabel: recommended ? recommended.key : readiness.weakest?.key || readiness.coverageGap?.key || null,
      evidenceLabel: readiness.state === 'ready' ? 'Gotowosc treningowa' : 'Diagnoza wstepna',
      weeklyDelta: null,
    };
  },
  getRecommendation(questions) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    let answerCount = 0;
    const recent = [];
    Storage.getHistory().slice().reverse().forEach(result => {
      if (answerCount >= 100 || new Date(result.date) < cutoff || !result.breakdowns) return;
      recent.push(result);
      answerCount += result.total || 0;
    });
    if (answerCount < 20) return null;
    const candidates = ['ecoDomain', 'approach', 'qtype', 'domain'].flatMap(dimension => {
      const keys = new Set(recent.flatMap(result => (result.breakdowns?.[dimension] || []).map(item => item.key)));
      return [...keys].map(key => {
        const entries = recent.flatMap(result => result.breakdowns?.[dimension] || []).filter(item => item.key === key);
        const correct = entries.reduce((sum, item) => sum + item.correct, 0);
        const total = entries.reduce((sum, item) => sum + item.total, 0);
        const percent = Math.round(correct / total * 100);
        const filters = filterForSegment(dimension, key);
        return { dimension, key, total, percent, priority: (total - correct) * (1 - percent / 100), filters };
      });
    }).filter(item => item.total >= 5 && QuizEngine.countAvailable(questions, 'quick', item.filters) >= 10);
    return candidates.sort((a, b) => b.priority - a.priority || a.percent - b.percent)[0] || null;
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
test('getActiveQuizSession returns null initially', () => {
  reset();
  assertEqual(Storage.getActiveQuizSession(), null);
});
test('active quiz session is resumable only after one answer with remaining questions', () => {
  reset();
  const session = { mode: 'quick', questions: [{ id: 1 }, { id: 2 }], current: 1, answers: [{ questionId: 1, correct: true }] };
  Storage.saveActiveQuizSession(session);
  assertEqual(Storage.getActiveQuizSession().current, 1);
});
test('active quiz session ignores sessions without answers', () => {
  reset();
  Storage.saveActiveQuizSession({ mode: 'quick', questions: [{ id: 1 }], current: 0, answers: [] });
  assertEqual(Storage.getActiveQuizSession(), null);
});
test('active quiz session ignores completed sessions', () => {
  reset();
  Storage.saveActiveQuizSession({ mode: 'quick', questions: [{ id: 1 }], current: 1, answers: [{ questionId: 1, correct: true }] });
  assertEqual(Storage.getActiveQuizSession(), null);
});
test('clearActiveQuizSession removes saved session', () => {
  reset();
  Storage.saveActiveQuizSession({ mode: 'quick', questions: [{ id: 1 }, { id: 2 }], current: 1, answers: [{ questionId: 1, correct: true }] });
  Storage.clearActiveQuizSession();
  assertEqual(Storage.getActiveQuizSession(), null);
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
  eco_domain: i % 2 === 0 ? 'Process' : 'People', eco_task: 'Process-1',
  difficulty: i % 3 === 0 ? 'hard' : 'medium', qtype: i % 4 === 0 ? 'calculation' : 'scenario',
  source_pool: i === 1 ? 'agile' : 'pmbok', approach_tags: i % 2 === 0 ? ['agile'] : [],
  question: `Q${i+1}`, answers: ['A','B','C','D'], correct: 0, explanation: 'E',
}));

test('shuffle returns same length', () => assert(QuizEngine.shuffle([1,2,3]).length === 3));
test('shuffle does not mutate original', () => { const a=[1,2,3]; QuizEngine.shuffle(a); assertEqual(a,[1,2,3]); });
test('selectQuestions daily returns <= 30', () => assert(QuizEngine.selectQuestions(mockQs,'daily').length <= 30));
test('selectQuestions quick returns 10', () => assertEqual(QuizEngine.selectQuestions(mockQs,'quick').length, 10));
test('selectQuestions filters by domain', () => {
  assert(QuizEngine.selectQuestions(mockQs,'quick',['Risk']).every(q => q.domain === 'Risk'));
});
test('matchesFilters combines OR within an axis and AND across axes', () => {
  const selected = QuizEngine.selectQuestions(mockQs, 'quick', { ...emptyFilters(), ecoDomains: ['Process', 'People'], qtypes: ['calculation'] }, [], 20);
  assert(selected.length > 0 && selected.every(q => q.qtype === 'calculation'));
});
test('Agile filtering uses approach_tags even outside an Agile domain', () => {
  const selected = QuizEngine.selectQuestions(mockQs, 'quick', { ...emptyFilters(), approachTags: ['agile'] }, [], 20);
  assert(selected.length > 0 && selected.every(q => q.approach_tags.includes('agile')));
  assert(selected.some(q => q.domain !== 'Agile'));
});
test('source_pool is not a user-facing filter axis', () => {
  assert(QuizEngine.matchesFilters(mockQs[0], { ...emptyFilters(), sourcePools: ['agile'] }));
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
test('buildBreakdowns stores counts and includes each approach tag', () => {
  const answers = [
    QuizEngine.answerRecord({ ...mockQs[0], approach_tags: ['agile', 'hybrid'] }, false),
    QuizEngine.answerRecord({ ...mockQs[2], approach_tags: ['agile'] }, true),
  ];
  const breakdowns = QuizEngine.buildBreakdowns(answers);
  assertEqual(breakdowns.approach.find(item => item.key === 'agile'), { key: 'agile', correct: 1, total: 2, percent: 50 });
  assertEqual(breakdowns.approach.find(item => item.key === 'hybrid'), { key: 'hybrid', correct: 0, total: 1, percent: 0 });
});

// ===== QUIZ SESSION PERSISTENCE TESTS =====
console.log('\nQuizSessionPersistence:');
test('buildResumableCopy returns null before first answer', () => {
  const session = { mode: 'quick', questions: [{ id: 1 }, { id: 2 }], current: 0, answers: [], currentAnswer: null };
  assertEqual(QuizSessionPersistence.buildResumableCopy(session, 0), null);
});
test('buildResumableCopy stores next unanswered question after first answer', () => {
  const session = {
    mode: 'quick',
    questions: [{ id: 1 }, { id: 2 }],
    current: 0,
    answers: [{ questionId: 1, correct: true }],
    currentAnswer: { selectedIndex: 0, isCorrect: true, processed: true },
  };
  const resumable = QuizSessionPersistence.buildResumableCopy(session, 1);
  assertEqual(resumable.current, 1);
  assertEqual(resumable.currentAnswer, null);
});
test('buildResumableCopy returns null after final answer', () => {
  const session = { mode: 'quick', questions: [{ id: 1 }], current: 0, answers: [{ questionId: 1, correct: true }], currentAnswer: null };
  assertEqual(QuizSessionPersistence.buildResumableCopy(session, 1), null);
});
test('buildResumeProgressLabel reports answered and total counts', () => {
  const session = { mode: 'quick', questions: [{ id: 1 }, { id: 2 }, { id: 3 }], current: 1, answers: [{ questionId: 1, correct: true }] };
  assertEqual(QuizSessionPersistence.buildResumeProgressLabel(session), '1 / 3');
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
test('getPerDomain weights modern session counts instead of averaging percentages', () => {
  reset();
  Storage.saveResult({ domainResults: [{ domain: 'Risk', correct: 1, total: 1, percent: 100 }] });
  Storage.saveResult({ domainResults: [{ domain: 'Risk', correct: 0, total: 9, percent: 0 }] });
  const risk = StatsManager.getPerDomain(mockQs).find(item => item.domain === 'Risk');
  assertEqual(risk.percent, 10);
});
test('recommendation ignores a segment with fewer than five answers', () => {
  reset();
  const pool = Array.from({ length: 12 }, (_, i) => ({ ...mockQs[0], id: i + 100, eco_domain: 'Process', approach_tags: ['agile'] }));
  Storage.saveResult({ date: TODAY(), total: 20, breakdowns: {
    ecoDomain: [{ key: 'Process', correct: 8, total: 20, percent: 40 }],
    approach: [{ key: 'agile', correct: 0, total: 4, percent: 0 }],
  } });
  assertEqual(StatsManager.getRecommendation(pool).key, 'Process');
});
function classifiedResult(correct, total, ecoCounts) {
  return {
    date: TODAY(), mode: 'quick', correct, total,
    percent: Math.round(correct / total * 100),
    breakdowns: {
      ecoDomain: Object.entries(ecoCounts).map(([key, count]) => ({
        key, ...count, percent: Math.round(count.correct / count.total * 100),
      })),
    },
  };
}
test('readiness remains calibrating below 30 classified answers', () => {
  reset();
  Storage.saveResult(classifiedResult(18, 20, { Process: { correct: 18, total: 20 } }));
  assertEqual(StatsManager.getReadiness().state, 'calibrating');
});
test('readiness ignores legacy results without ECO breakdown entries', () => {
  reset();
  Storage.saveResult({ date: TODAY(), mode: 'quick', correct: 27, total: 30, percent: 90, breakdowns: {} });
  assertEqual(StatsManager.getReadiness().state, 'calibrating');
});
test('readiness identifies the weakest ECO segment after calibration', () => {
  reset();
  Storage.saveResult(classifiedResult(21, 30, {
    People: { correct: 8, total: 10 },
    Process: { correct: 6, total: 10 },
    'Business Environment': { correct: 7, total: 10 },
  }));
  const readiness = StatsManager.getReadiness();
  assertEqual(readiness.state, 'building_evidence');
  assertEqual(readiness.weakest.key, 'Process');
});
test('readiness shows preliminary diagnosis after 30 low-accuracy answers, not full readiness', () => {
  reset();
  Storage.saveResult(classifiedResult(10, 30, {
    People: { correct: 4, total: 10 },
    Process: { correct: 3, total: 10 },
    'Business Environment': { correct: 3, total: 10 },
  }));
  const readiness = StatsManager.getReadiness();
  assertEqual(readiness.state, 'building_evidence');
  assert(readiness.score < 33, `expected coverage-adjusted score below 33, got ${readiness.score}`);
});
test('readiness penalizes 30 answers concentrated in one ECO domain', () => {
  reset();
  Storage.saveResult(classifiedResult(27, 30, {
    Process: { correct: 27, total: 30 },
  }));
  const readiness = StatsManager.getReadiness();
  assertEqual(readiness.state, 'building_evidence');
  assertEqual(readiness.coverageGap.key, 'People');
  assert(readiness.score < 30, `expected low score from missing coverage, got ${readiness.score}`);
});
test('readiness is ready with 120 evenly covered ECO answers', () => {
  reset();
  Storage.saveResult(classifiedResult(96, 120, {
    People: { correct: 32, total: 40 },
    Process: { correct: 30, total: 40 },
    'Business Environment': { correct: 34, total: 40 },
  }));
  const readiness = StatsManager.getReadiness();
  assertEqual(readiness.state, 'ready');
  assertEqual(readiness.score, 80);
});
test('readiness treats an ECO domain below minimum sample as coverage gap', () => {
  reset();
  Storage.saveResult(classifiedResult(90, 120, {
    People: { correct: 42, total: 50 },
    Process: { correct: 42, total: 50 },
    'Business Environment': { correct: 6, total: 20 },
  }));
  const readiness = StatsManager.getReadiness();
  assertEqual(readiness.state, 'ready');
  assertEqual(readiness.weakest.key, 'Business Environment');

  reset();
  Storage.saveResult(classifiedResult(90, 120, {
    People: { correct: 45, total: 60 },
    Process: { correct: 45, total: 60 },
  }));
  const gap = StatsManager.getReadiness();
  assertEqual(gap.state, 'building_evidence');
  assertEqual(gap.coverageGap.key, 'Business Environment');
});
test('previewReadinessDelta reports positive delta for a correct classified answer', () => {
  reset();
  Storage.saveResult(classifiedResult(60, 90, {
    People: { correct: 20, total: 30 },
    Process: { correct: 20, total: 30 },
    'Business Environment': { correct: 20, total: 30 },
  }));
  const delta = StatsManager.previewReadinessDelta([], {
    questionId: 901,
    correct: true,
    domain: 'Risk',
    ecoDomain: 'Process',
    ecoTask: 'Process task',
    difficulty: 'medium',
    qtype: 'knowledge',
    approachTags: ['agile'],
  });
  assert(delta.delta > 0, `expected positive readiness delta, got ${delta.delta}`);
});
test('previewReadinessDelta does not report positive delta for a wrong answer', () => {
  reset();
  Storage.saveResult(classifiedResult(60, 90, {
    People: { correct: 20, total: 30 },
    Process: { correct: 20, total: 30 },
    'Business Environment': { correct: 20, total: 30 },
  }));
  const delta = StatsManager.previewReadinessDelta([], {
    questionId: 902,
    correct: false,
    domain: 'Risk',
    ecoDomain: 'Process',
    ecoTask: 'Process task',
    difficulty: 'medium',
    qtype: 'knowledge',
    approachTags: ['agile'],
  });
  assert(delta.delta <= 0, `expected non-positive readiness delta, got ${delta.delta}`);
});
test('previewReadinessDelta returns null delta while readiness is calibrating', () => {
  reset();
  Storage.saveResult(classifiedResult(18, 20, {
    Process: { correct: 18, total: 20 },
  }));
  const delta = StatsManager.previewReadinessDelta([], {
    questionId: 903,
    correct: true,
    domain: 'Risk',
    ecoDomain: 'Process',
    ecoTask: 'Process task',
    difficulty: 'medium',
    qtype: 'knowledge',
    approachTags: ['agile'],
  });
  assertEqual(delta.delta, null);
  assertEqual(delta.after.state, 'calibrating');
});

console.log('\nDisplay helpers:');
test('formatDisplayNick capitalizes lowercase nick', () => assertEqual(formatDisplayNick('bartek'), 'Bartek'));
test('formatDisplayNick leaves already capitalized nick unchanged', () => assertEqual(formatDisplayNick('Bartosz'), 'Bartosz'));
test('formatDisplayNick trims whitespace before capitalization', () => assertEqual(formatDisplayNick('  bartosz '), 'Bartosz'));
test('questionTagItems includes qtype and difficulty only in detail mode', () => {
  const q = {
    domain: 'Risk',
    eco_domain: 'Process',
    approach_tags: ['agile'],
    qtype: 'knowledge',
    difficulty: 'hard',
  };
  assertEqual(questionTagItems(q, false).map(item => item.kind), ['domain', 'eco', 'approach']);
  assertEqual(questionTagItems(q, true).map(item => item.kind), ['domain', 'eco', 'approach', 'qtype', 'difficulty']);
});

console.log('\nApp problem reports:');
test('buildPayload stores report details and app context', () => {
  const row = AppProblemReport.buildPayload({
    userId: 'user-123',
    category: 'sync',
    comment: 'Progress did not sync',
    appVersion: 'build-test',
    userAgent: 'NodeTest/1.0',
    pageHref: 'https://pmp.nord-star.pl/?code=secret#/settings',
    pageHash: '#/settings',
    settings: { defaultLanguage: 'en', theme: 'dark' },
  });
  assertEqual(row, {
    user_id: 'user-123',
    category: 'sync',
    comment: 'Progress did not sync',
    app_version: 'build-test',
    user_agent: 'NodeTest/1.0',
    page_href: 'https://pmp.nord-star.pl/',
    page_hash: '#/settings',
    app_language: 'en',
    app_theme: 'dark',
  });
});

test('buildPayload drops non-route hashes that may contain tokens', () => {
  const row = AppProblemReport.buildPayload({
    userId: 'user-123',
    category: 'login',
    comment: '',
    pageHref: 'https://pmp.nord-star.pl/?code=secret#access_token=secret',
    pageHash: '#access_token=secret',
  });
  assertEqual(row.page_href, 'https://pmp.nord-star.pl/');
  assertEqual(row.page_hash, null);
  assertEqual(row.comment, null);
});

console.log('\nEngagement:');
test('wrong answers never subtract career EXP and do not create negative ranking points', () => {
  assertEqual(Engagement.scoreAnswers({ correct: 7, total: 10, mode: 'quick' }), {
    careerExp: 38,
    rankingDelta: 8,
  });
  assertEqual(Engagement.scoreAnswers({ correct: 2, total: 10, mode: 'quick' }), {
    careerExp: 18,
    rankingDelta: 0,
  });
});
test('leaderboard rows use the persisted ranking score as points', () => {
  assertEqual(Engagement.normalizeLeaderboardRows([
    { nick: 'bartek', score: -12, ranking_score: 16, career_exp: 128 },
  ]), [
    { nick: 'bartek', score: 16, ranking_score: 16, career_exp: 128 },
  ]);
});
test('trial awards completion EXP and positive ranking only after submission', () => {
  const award = Engagement.scoreAnswers({ correct: 48, total: 60, mode: 'trial' });
  assertEqual(award.careerExp, 402);
  assert(award.rankingDelta > 0);
});
test('questionExp mirrors per-answer career EXP scoring', () => {
  assertEqual(Engagement.questionExp(true), 5);
  assertEqual(Engagement.questionExp(false), 1);
  const quick = Engagement.scoreAnswers({ correct: 7, total: 10, mode: 'quick' });
  assertEqual(quick.careerExp, 7 * Engagement.questionExp(true) + 3 * Engagement.questionExp(false));
});
test('career levels are non-decreasing with accumulated EXP', () => {
  assertEqual(Engagement.levelForExp(0), 1);
  assert(Engagement.levelForExp(400) >= Engagement.levelForExp(100));
});

// ===== TRIAL EXAM TESTS (plan 12, sekcja 19a) =====
console.log('\nTrial — variants & rating:');
test('trialVariant returns matching variant', () => assertEqual(trialVariant('half').id, 'half'));
test('trialVariant falls back to full', () => assertEqual(trialVariant('nope').id, 'full'));
test('variant times: full=230, half=115, short=77', () => {
  assert(trialVariant('full').minutes === 230 && trialVariant('half').minutes === 115 && trialVariant('short').minutes === 77);
});
test('formatDurationHms renders hours, minutes, and seconds', () => {
  assertEqual(formatDurationHms(0), '00:00:00');
  assertEqual(formatDurationHms(65), '00:01:05');
  assertEqual(formatDurationHms(4620), '01:17:00');
  assertEqual(formatDurationHms(13800), '03:50:00');
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

