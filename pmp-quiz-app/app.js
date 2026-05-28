'use strict';

// ==================== VERSION ====================
// UWAGA: APP_VERSION generowany przez tools/build.py — nie edytuj ręcznie.
// Uruchom 'python tools/build.py' przed deployem (CI robi to automatycznie).
const APP_VERSION = 'build-04603aec';  // placeholder, nadpisywany przez build.py

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
const GOOGLE_OAUTH_VISIBLE = false; // Keep the Google beta flow dormant until invites are managed automatically.
const TODAY = () => new Date().toISOString().slice(0, 10);
const Engagement = {
  scoreAnswers({ correct, total, mode }) {
    const wrong = total - correct;
    let careerExp = correct * 5 + wrong;
    let rankingDelta = correct * 2 - wrong * 2;
    if (mode === 'daily') careerExp += 20;
    if (mode === 'daily' && correct / total >= 0.7) rankingDelta += 5;
    if (mode === 'trial') careerExp += 50;
    if (mode === 'trial' && correct / total >= 0.8) careerExp += 100;
    return { careerExp, rankingDelta };
  },
  levelForExp(exp) { return Math.floor(Math.sqrt(Math.max(0, exp) / 100)) + 1; },
};
const newSessionId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const BRAND_NAME = 'PM Academy';
const Icons = {
  mark: () => '<img class="brand-mark" src="./icons/pm-academy-mark.svg" alt="">',
  training: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21V4M5 11l7-7 7 7"/></svg>',
  exam: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h10v18H7zM10 8h4M10 12h4M10 16h4"/></svg>',
  stats: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 20V11m7 9V4m7 16V8"/></svg>',
  status: checked => checked
    ? '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>'
    : '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
  settings: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4z"/><path d="M19 12l2-1.2-2-3.4-2.2 1a7 7 0 0 0-1.5-.9L15 5h-4l-.3 2.5a7 7 0 0 0-1.5.9L7 7.4l-2 3.4L7 12l-2 1.2 2 3.4 2.2-1a7 7 0 0 0 1.5.9L11 19h4l.3-2.5a7 7 0 0 0 1.5-.9l2.2 1 2-3.4z"/></svg>',
  confidence: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20a8 8 0 1 0-8-8"/><path d="M12 8v4l3 2"/></svg>',
  scroll: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v16m-5-5 5 5 5-5"/></svg>',
  language: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  theme: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 15.5A8.5 8.5 0 1 1 8.5 4 7 7 0 0 0 20 15.5z"/></svg>',
  home: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-6v-6h-4v6H4z"/></svg>',
  ranking: () => '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 21v-7h4v7M10 21V8h4v13M14 21V3h4v18"/></svg>',
};
const appNav = active => `
  <nav class="app-nav" aria-label="${t('nav_label')}">
    <button class="${active === 'home' ? 'active' : ''}" onclick="App.navigate('home')">${Icons.home()}<span>${t('nav_start')}</span></button>
    <button class="${active === 'training' ? 'active' : ''}" onclick="App.navigate('mode-select')">${Icons.training()}<span>${t('nav_training')}</span></button>
    <button class="${active === 'stats' ? 'active' : ''}" onclick="App.navigate('stats')">${Icons.stats()}<span>${t('nav_progress')}</span></button>
    <button class="${active === 'ranking' ? 'active' : ''}" onclick="App.navigate('ranking')">${Icons.ranking()}<span>${t('nav_ranking')}</span></button>
  </nav>`;

// ==================== TRIAL EXAM (plan 12) ====================
// Prawdziwy egzamin PMP: 230 min / 180 pyt ≈ 1.2778 min/pyt — skalujemy proporcjonalnie.
// Gdy wejdzie nowa wersja egzaminu (od 9 lipca 2026) wystarczy zmienić minutes wariantu 'full' na 240.
const TRIAL_VARIANTS = [
  { id: 'full',  questions: 180, minutes: 230 },
  { id: 'half',  questions: 90,  minutes: 115 },
  { id: 'short', questions: 60,  minutes: 77  },
];
const trialVariant = id => TRIAL_VARIANTS.find(v => v.id === id) || TRIAL_VARIANTS[0];

// Rating orientacyjny — PMI używa analizy psychometrycznej, więc to przybliżenie.
function trialRating(percent) {
  if (percent >= 80) return 'above';   // Above Target
  if (percent >= 65) return 'target';  // Target (umowny próg „zaliczenia")
  if (percent >= 50) return 'below';   // Below Target
  return 'needs';                       // Needs Improvement
}

const BADGES_DEF = [
  { id: 'first',   emoji: '🎯', name: 'Pierwszy krok', name_en: 'First step',    desc: 'Ukończ pierwszy quiz',           desc_en: 'Complete your first quiz',        check: s => s.totalQuizzes >= 1 },
  { id: 'week',    emoji: '🔥', name: 'Tydzień ognia', name_en: 'Week of fire',  desc: '7 dni serii z rzędu',             desc_en: '7-day streak in a row',           check: s => s.currentStreak >= 7 },
  { id: 'month',   emoji: '💪', name: 'Miesiąc mocy',  name_en: 'Month of power', desc: '30 dni serii z rzędu',           desc_en: '30-day streak in a row',          check: s => s.currentStreak >= 30 },
  { id: 'hundred', emoji: '🧠', name: 'Setka',         name_en: 'Century',       desc: '100 odpowiedzianych pytań',       desc_en: '100 questions answered',          check: s => s.totalAnswered >= 100 },
  { id: 'fivehun', emoji: '🏆', name: 'Pięćsetka',     name_en: 'Five hundred',  desc: '500 odpowiedzianych pytań',       desc_en: '500 questions answered',          check: s => s.totalAnswered >= 500 },
  { id: 'perfect', emoji: '⭐', name: 'Perfekcja',     name_en: 'Perfection',    desc: '100% poprawnych w jednym quizie', desc_en: '100% correct in a single quiz',   check: s => s.hadPerfectQuiz },
  { id: 'ready',   emoji: '🎓', name: 'PMP Ready',     name_en: 'PMP Ready',     desc: 'Średnia ≥ 80% z 30 dni',          desc_en: 'Average ≥ 80% over 30 days',      check: s => s.avg30 >= 80 },
  // Trial Exam (plan 12) — 🎬 zamiast 🎓 by nie dublować emoji z odznaką 'ready'.
  { id: 'trial_first',    emoji: '🎬', name: 'Próba generalna', name_en: 'Dress Rehearsal', desc: 'Ukończ pierwszy Trial Exam',                desc_en: 'Complete your first Trial Exam',              check: s => s.trialCount >= 1 },
  { id: 'trial_marathon', emoji: '📝', name: 'Maraton PMP',     name_en: 'PMP Marathon',    desc: 'Ukończ pełny egzamin 180 pytań',            desc_en: 'Complete a full 180-question exam',           check: s => s.trialFullDone },
  { id: 'trial_target',   emoji: '🏅', name: 'Powyżej celu',    name_en: 'Above Target',    desc: 'Wynik ≥ 80% w Trial Exam',                  desc_en: 'Score ≥ 80% in a Trial Exam',                 check: s => s.trialBest >= 80 },
  { id: 'trial_clock',    emoji: '⏱️', name: 'Mistrz czasu',     name_en: 'Time Master',     desc: 'Ukończ Trial Exam z ≥ 25% czasu w zapasie', desc_en: 'Finish a Trial Exam with ≥ 25% time to spare', check: s => s.trialBeatClock },
];

const QUOTES = [
  { pl: 'Zarządzanie projektem to sztuka realizacji wizji w ramach ograniczeń.', en: 'Project management is the art of realizing a vision within constraints.' },
  { pl: 'Dobry plan teraz jest lepszy od doskonałego planu jutro.',              en: 'A good plan now is better than a perfect plan tomorrow.' },
  { pl: 'Ryzyk nie ignorujemy — zarządzamy nimi.',                               en: "We don't ignore risks — we manage them." },
  { pl: 'Komunikacja to 90% zarządzania projektem.',                             en: 'Communication is 90% of project management.' },
  { pl: 'Każdy projekt to szansa na naukę.',                                     en: 'Every project is a chance to learn.' },
  { pl: 'Sukces to zaplanowany wynik, nie przypadek.',                           en: 'Success is a planned outcome, not an accident.' },
  { pl: 'Zarządzaj oczekiwaniami tak samo pilnie jak zakresem.',                 en: 'Manage expectations as diligently as you manage scope.' },
];

// ==================== I18N (UI language) ====================
// Current UI language follows AppState.showEnglish (set from the saved language setting,
// and toggled per-question by testers). 'en' => English UI, otherwise Polish.
const L = () => (AppState.showEnglish ? 'en' : 'pl');

// PL domain (as stored in questions.json) -> EN label
const DOMAIN_I18N = {
  'Harmonogram': 'Schedule', 'Integracja': 'Integration', 'Interesariusz': 'Stakeholder',
  'Jakość': 'Quality', 'Komunikacja': 'Communications', 'Koszt': 'Cost', 'Ludzie': 'People',
  'Nabywanie': 'Procurement', 'Ogólny': 'General', 'Proces': 'Process', 'Ryzyko': 'Risk',
  'Zakres': 'Scope', 'Zasoby': 'Resource', 'Środowisko biznesowe': 'Business Environment', 'Zwinne': 'Agile',
};
const tDomain = d => (AppState.showEnglish ? (DOMAIN_I18N[d] || d) : d);
const ECO_I18N = {
  People: { pl: 'People', en: 'People' },
  Process: { pl: 'Process', en: 'Process' },
  'Business Environment': { pl: 'Business Environment', en: 'Business Environment' },
};
const APPROACH_I18N = {
  agile: { pl: 'Agile', en: 'Agile' },
  hybrid: { pl: 'Hybrydowe', en: 'Hybrid' },
  predictive: { pl: 'Predykcyjne', en: 'Predictive' },
};
const QTYPE_I18N = {
  scenario: { pl: 'Scenariuszowe', en: 'Scenario' },
  knowledge: { pl: 'Wiedzowe', en: 'Knowledge' },
  calculation: { pl: 'Obliczeniowe', en: 'Calculation' },
};
const DIFFICULTY_I18N = {
  easy: { pl: 'Łatwe', en: 'Easy' },
  medium: { pl: 'Średnie', en: 'Medium' },
  hard: { pl: 'Trudne', en: 'Hard' },
};
const labelFor = (labels, key) => labels[key]?.[L()] || key;
const tEcoDomain = key => labelFor(ECO_I18N, key);
const tApproach = key => labelFor(APPROACH_I18N, key);
const tQtype = key => labelFor(QTYPE_I18N, key);
const tDifficulty = key => labelFor(DIFFICULTY_I18N, key);
const emptyFilters = () => ({ domains: [], ecoDomains: [], approachTags: [], difficulties: [], qtypes: [] });
const filterForSegment = (dimension, key) => {
  const filters = emptyFilters();
  const filterKey = { domain: 'domains', ecoDomain: 'ecoDomains', approach: 'approachTags', difficulty: 'difficulties', qtype: 'qtypes' }[dimension];
  if (filterKey) filters[filterKey] = [key];
  return filters;
};
const labelForSegment = (dimension, key) => ({
  domain: tDomain, ecoDomain: tEcoDomain, approach: tApproach, difficulty: tDifficulty, qtype: tQtype,
}[dimension] || (v => v))(key);
const quizTagsHtml = (question, extended = false) => {
  const tags = [
    question.domain && { text: tDomain(question.domain), className: 'quiz-tag--domain' },
    question.eco_domain && { text: tEcoDomain(question.eco_domain), className: 'quiz-tag--eco' },
    ...(question.approach_tags || []).map(tag => ({ text: tApproach(tag), className: 'quiz-tag--approach' })),
  ].filter(Boolean);
  if (extended && question.qtype) tags.push({ text: tQtype(question.qtype), className: 'quiz-tag--detail' });
  if (extended && question.difficulty) tags.push({ text: tDifficulty(question.difficulty), className: 'quiz-tag--detail' });
  return tags.map(tag => `<span class="quiz-tag ${tag.className}">${tag.text}</span>`).join('');
};

const I18N = {
  // login
  login_subtitle:     { pl: 'Nauka do egzaminu PMP',            en: 'Study for the PMP exam' },
  email_ph:           { pl: 'Adres email',                      en: 'Email address' },
  login_id_ph:        { pl: 'Email lub nick',                   en: 'Email or nick' },
  nick_ph:            { pl: 'Nick (3–20 znaków)',               en: 'Nick (3–20 characters)' },
  nick_hint:          { pl: 'Litery, cyfry, _ lub - · bez spacji', en: 'Letters, digits, _ or - · no spaces' },
  nick_required:      { pl: 'Nick musi mieć 3–20 znaków: litery, cyfry, _ lub -.', en: 'Nick must be 3–20 chars: letters, digits, _ or -.' },
  pass_ph:            { pl: 'Hasło (min. 6 znaków)',            en: 'Password (min. 6 characters)' },
  sign_up:            { pl: 'Zarejestruj się',                  en: 'Sign up' },
  sign_in:            { pl: 'Zaloguj się',                      en: 'Sign in' },
  have_account:       { pl: '← Mam już konto — zaloguj się',    en: '← I already have an account — sign in' },
  no_account:         { pl: 'Nie mam konta — zarejestruj się →', en: "Don't have an account — sign up →" },
  enter_credentials:  { pl: 'Podaj email/nick i hasło.',        en: 'Enter your email/nick and password.' },
  check_email:        { pl: 'Sprawdź email i kliknij link potwierdzający, a potem wróć i zaloguj się.', en: 'Check your email and click the confirmation link, then come back and sign in.' },
  generic_error:      { pl: 'Błąd — spróbuj ponownie.',         en: 'Error — please try again.' },
  session_kicked:     { pl: 'Konto zostało zalogowane na innym urządzeniu. Zaloguj się ponownie.', en: 'Your account was signed in on another device. Please sign in again.' },
  // beta invite codes
  login_subtitle_beta:{ pl: 'Beta — dostęp tylko z kodem zaproszenia', en: 'Beta — access by invite code only' },
  code_ph:            { pl: 'Kod beta (PMP-XXXX-XXXX)',         en: 'Beta code (PMP-XXXX-XXXX)' },
  code_hint:          { pl: 'Nie masz kodu? Napisz do organizatora bety.', en: "Don't have a code? Contact the beta organizer." },
  sign_up_beta:       { pl: 'Zarejestruj się z kodem',          en: 'Sign up with code' },
  code_required:      { pl: 'Podaj kod beta w formacie PMP-XXXX-XXXX.', en: 'Enter a beta code in the format PMP-XXXX-XXXX.' },
  register_verifying: { pl: 'Weryfikuję kod i rejestruję…',     en: 'Verifying code and registering…' },
  register_ok:        { pl: '✅ Konto utworzone! Możesz się teraz zalogować.', en: '✅ Account created! You can sign in now.' },
  // Google OAuth + beta code
  oauth_or:           { pl: 'lub',                              en: 'or' },
  oauth_code_ph:      { pl: 'Kod beta (do logowania Google)',   en: 'Beta code (for Google sign-in)' },
  oauth_code_hint:    { pl: 'Wymagany przy pierwszym logowaniu przez Google.', en: 'Required the first time you sign in with Google.' },
  oauth_google_btn:   { pl: 'Zaloguj przez Google',             en: 'Sign in with Google' },
  oauth_need_code:    { pl: 'Aby zalogować się przez Google, najpierw podaj kod beta.', en: 'To sign in with Google, enter your beta code first.' },
  oauth_redirecting:  { pl: 'Przekierowuję do Google…',         en: 'Redirecting to Google…' },
  // password reset (email + original beta code + new password ×2)
  forgot_pass_link:   { pl: 'Nie pamiętasz hasła?',             en: 'Forgot your password?' },
  reset_subtitle:     { pl: 'Reset hasła — podaj email i swój kod beta', en: 'Password reset — enter your email and beta code' },
  reset_email_ph:     { pl: 'Adres email konta',               en: 'Account email address' },
  reset_code_ph:      { pl: 'Kod beta użyty przy rejestracji',  en: 'Beta code used at registration' },
  reset_pass_ph:      { pl: 'Nowe hasło (min. 6 znaków)',       en: 'New password (min. 6 characters)' },
  reset_pass2_ph:     { pl: 'Powtórz nowe hasło',               en: 'Repeat new password' },
  reset_submit:       { pl: 'Ustaw nowe hasło',                 en: 'Set new password' },
  reset_back_login:   { pl: '← Wróć do logowania',              en: '← Back to sign in' },
  reset_pass_mismatch:{ pl: 'Hasła nie są identyczne.',         en: 'Passwords do not match.' },
  reset_pass_short:   { pl: 'Hasło musi mieć co najmniej 6 znaków.', en: 'Password must be at least 6 characters.' },
  reset_email_required:{ pl: 'Podaj prawidłowy adres email.',   en: 'Enter a valid email address.' },
  reset_verifying:    { pl: 'Zmieniam hasło…',                  en: 'Updating password…' },
  reset_ok:           { pl: '✅ Hasło zmienione. Zaloguj się nowym hasłem.', en: '✅ Password changed. Sign in with your new password.' },
  // home
  settings:           { pl: 'Ustawienia',                       en: 'Settings' },
  streak_start:       { pl: '⚡ Zacznij serię!',                en: '⚡ Start a streak!' },
  streak_one:         { pl: '🔥 Dobry początek!',               en: '🔥 Good start!' },
  streak_two:         { pl: '🔥 Dwa dni z rzędu!',              en: '🔥 Two days running!' },
  streak_roll:        { pl: '🔥 Jesteś na fali!',               en: "🔥 You're on a roll!" },
  streak_keep:        { pl: '🔥 Nie zatrzymuj się!',             en: '🔥 Keep it going!' },
  streak_fire:        { pl: '🔥 Tydzień ognia!',                 en: "🔥 You're on Fire! 🔥" },
  streak_many:        { pl: '🔥 {n} dni z rzędu',               en: '🔥 {n} days in a row' },
  streak_unit_one:    { pl: 'dzień',                            en: 'day' },
  streak_unit_many:   { pl: 'dni',                              en: 'days' },
  daily_challenge:    { pl: 'Codzienne Wyzwanie',               en: 'Daily Challenge' },
  daily_done:         { pl: '30 pytań · Ukończono dziś ✓',      en: '30 questions · Done today ✓' },
  daily_pending:      { pl: '30 pytań · Wymagane dziś',         en: '30 questions · Required today' },
  quick_quiz:         { pl: 'Szybki Quiz',                      en: 'Quick Quiz' },
  quick_quiz_sub:     { pl: 'Trening celowany lub losowy',       en: 'Targeted or random training' },
  statistics:         { pl: 'Statystyki',                       en: 'Statistics' },
  your_progress:      { pl: 'Twój postęp',                      en: 'Your progress' },
  welcome_back:       { pl: 'Cześć, {nick}',                    en: 'Hello, {nick}' },
  learner:            { pl: 'Uczniu',                           en: 'Learner' },
  readiness_title:    { pl: 'Gotowość do egzaminu',             en: 'Exam readiness' },
  readiness_disclaimer:{ pl: 'Wskaźnik treningowy PM Academy, nie oficjalny wynik egzaminu PMI.', en: 'PM Academy training indicator, not an official PMI exam result.' },
  calibrating:        { pl: 'Kalibrujemy Twoją gotowość',       en: 'Calibrating your readiness' },
  calibrating_more:   { pl: 'Odpowiedz na jeszcze {n} pytań z klasyfikacją ECO.', en: 'Answer {n} more ECO-classified questions.' },
  weakest_area:       { pl: 'Najsłabszy obszar',                en: 'Weakest area' },
  today_plan:         { pl: 'Plan na dziś',                     en: 'Today plan' },
  plan_daily:         { pl: 'Ukończ codzienny zestaw i utrzymaj rytm nauki.', en: 'Complete today\'s set and keep your study rhythm.' },
  plan_adaptive:      { pl: 'Wzmocnij obszar wymagający najwięcej pracy.', en: 'Strengthen the area needing the most work.' },
  adaptive_training:  { pl: 'Trening adaptacyjny',              en: 'Adaptive training' },
  streak_metric:      { pl: 'Seria',                            en: 'Streak' },
  latest_result:      { pl: 'Ostatni wynik',                    en: 'Latest score' },
  no_result:          { pl: 'Brak danych',                      en: 'No data' },
  progress_title:     { pl: 'Postęp',                           en: 'Progress' },
  level:              { pl: 'Poziom {n}',                       en: 'Level {n}' },
  career_exp:         { pl: '{n} EXP',                          en: '{n} EXP' },
  nav_label:          { pl: 'Główna nawigacja',                 en: 'Main navigation' },
  nav_start:          { pl: 'Start',                            en: 'Start' },
  nav_training:       { pl: 'Trening',                          en: 'Training' },
  nav_progress:       { pl: 'Postęp',                           en: 'Progress' },
  nav_ranking:        { pl: 'Ranking',                          en: 'Ranking' },
  // settings modal
  settings_learning:  { pl: 'Nauka',                            en: 'Learning' },
  settings_display:   { pl: 'Wygląd i język',                   en: 'Appearance and language' },
  settings_privacy:   { pl: 'Ranking i prywatność',             en: 'Ranking and privacy' },
  settings_account:   { pl: 'Konto',                            en: 'Account' },
  close:              { pl: 'Zamknij',                          en: 'Close' },
  confidence_label:   { pl: 'Ocena pewności',                   en: 'Confidence rating' },
  confidence_desc:    { pl: 'Skala 1–3 przed odpowiedzią',      en: '1–3 scale before answering' },
  confidence_aria:    { pl: 'Włącz ocenę pewności',             en: 'Enable confidence rating' },
  auto_scroll_label:  { pl: 'Automatyczne przewijanie',         en: 'Auto-scroll' },
  auto_scroll_desc:   { pl: 'Przewiń do dołu po odpowiedzi',    en: 'Scroll to bottom after answering' },
  auto_scroll_aria:   { pl: 'Włącz automatyczne przewijanie',   en: 'Enable auto-scroll' },
  app_language:       { pl: 'Język aplikacji',                  en: 'App language' },
  app_language_desc:  { pl: 'Język całej aplikacji i pytań',    en: 'Language of the whole app and questions' },
  theme:              { pl: 'Motyw',                            en: 'Theme' },
  theme_desc:         { pl: 'Jasny, ciemny lub systemowy',      en: 'Light, dark or system theme' },
  theme_light:        { pl: 'Jasny',                            en: 'Light' },
  theme_dark:         { pl: 'Ciemny',                           en: 'Dark' },
  theme_auto:         { pl: 'Auto',                             en: 'Auto' },
  sign_out:           { pl: 'Wyloguj się',                      en: 'Sign out' },
  privacy_policy:     { pl: 'Polityka prywatności ↗',           en: 'Privacy policy ↗' },
  leaderboard_visible:{ pl: 'Pokazuj mnie w publicznym rankingu', en: 'Show me in the public leaderboard' },
  leaderboard_desc:   { pl: 'Widoczny będzie tylko Twój nick, pozycja i wynik/EXP.', en: 'Only your nick, position and score/EXP will be visible.' },
  leaderboard_error:  { pl: 'Nie udało się zapisać ustawienia rankingu.', en: 'Could not save leaderboard setting.' },
  sign_out_confirm:   { pl: 'Wylogować się?',                   en: 'Sign out?' },
  // mode select
  back:               { pl: '‹ Wróć',                           en: '‹ Back' },
  standard_quiz:      { pl: '⚡ Standardowy Quiz',              en: '⚡ Standard Quiz' },
  standard_quiz_desc: { pl: 'Wybierz trening',                  en: 'Choose training' },
  filter_domains:     { pl: 'Filtruj domeny (domyślnie wszystkie):', en: 'Filter domains (all by default):' },
  filter_eco:         { pl: 'Domena egzaminu ECO',              en: 'ECO exam domain' },
  filter_approach:    { pl: 'Podejście',                        en: 'Approach' },
  filter_qtype:       { pl: 'Typ pytań',                        en: 'Question type' },
  filter_difficulty:  { pl: 'Trudność',                         en: 'Difficulty' },
  preset_all:         { pl: 'Wszystkie',                        en: 'All' },
  preset_calculation: { pl: 'Obliczenia',                       en: 'Calculations' },
  customize_scope:    { pl: 'Dostosuj zakres',                  en: 'Customize scope' },
  count_label:        { pl: 'Liczba pytań',                     en: 'Number of questions' },
  available_count:    { pl: 'Dostępnych pytań: {n}',            en: 'Available questions: {n}' },
  pool_too_small:     { pl: 'Dostępnych jest tylko {n} pytań. Zmień filtry lub liczbę pytań.', en: 'Only {n} questions are available. Change filters or question count.' },
  weak_questions:     { pl: '🎯 Moje słabe pytania',            en: '🎯 My weak questions' },
  weak_locked:        { pl: 'Ukończ pierwszy quiz, żeby odblokować', en: 'Complete your first quiz to unlock' },
  weak_none:          { pl: 'Nie masz jeszcze słabych pytań 🎉', en: "You don't have any weak questions yet 🎉" },
  weak_count:         { pl: '{n} pytań do powtórki',            en: '{n} questions to review' },
  start:              { pl: 'Start →',                          en: 'Start →' },
  weak_alert:         { pl: 'Nie masz jeszcze słabych pytań. Ukończ więcej quizów!', en: "You don't have any weak questions yet. Complete more quizzes!" },
  no_questions_filter:{ pl: 'Brak pytań dla wybranych filtrów. Zmień ustawienia.', en: 'No questions for the selected filters. Change the settings.' },
  load_fail:          { pl: 'Nie udało się załadować pytań. Sprawdź połączenie i odśwież stronę.', en: 'Failed to load questions. Check your connection and refresh the page.' },
  // quiz
  back_to_menu:       { pl: 'Wróć do menu',                     en: 'Back to menu' },
  report_title:       { pl: 'Zgłoś błąd w pytaniu',             en: 'Report an issue with this question' },
  confidence_q:       { pl: 'Jak pewna/y byłaś/eś?',            en: 'How confident were you?' },
  conf_guess:         { pl: '🎲 Zgadywałem/am',                 en: '🎲 I guessed' },
  conf_unsure:        { pl: '🤔 Nie byłem/am pewny/a',          en: "🤔 I wasn't sure" },
  conf_knew:          { pl: '✅ Wiedziałem/am!',                en: '✅ I knew it!' },
  verdict_correct:    { pl: '✅ Poprawnie!',                    en: '✅ Correct!' },
  verdict_wrong:      { pl: '❌ Błędna odpowiedź',              en: '❌ Wrong answer' },
  why_answer:         { pl: 'Dlaczego ta odpowiedź?',           en: 'Why this answer?' },
  session_daily:      { pl: 'Codzienne wyzwanie',               en: 'Daily challenge' },
  session_adaptive:   { pl: 'Trening adaptacyjny',              en: 'Adaptive training' },
  session_weak:       { pl: 'Powtórka słabych pytań',           en: 'Weak question review' },
  session_quick:      { pl: 'Trening',                          en: 'Training' },
  next:               { pl: 'Dalej →',                          en: 'Next →' },
  // report modal
  report_aria:        { pl: 'Zgłoś błąd',                       en: 'Report an issue' },
  report_header:      { pl: '🚩 Zgłoś błąd w pytaniu',          en: '🚩 Report an issue with this question' },
  cat_wrong_answer:   { pl: '❌ Błędna poprawna odpowiedź',     en: '❌ Wrong correct answer' },
  cat_unclear:        { pl: '❓ Niejasne pytanie',              en: '❓ Unclear question' },
  cat_typo:           { pl: '✏️ Literówka / błąd w treści',     en: '✏️ Typo / error in text' },
  cat_translation:    { pl: '🌐 Błąd w tłumaczeniu (EN/PL)',    en: '🌐 Translation error (EN/PL)' },
  cat_other:          { pl: '💬 Inne',                          en: '💬 Other' },
  report_comment_ph:  { pl: 'Opcjonalnie: opisz dokładniej co jest nie tak…', en: 'Optionally: describe in more detail what is wrong…' },
  cancel:             { pl: 'Anuluj',                           en: 'Cancel' },
  send_report:        { pl: 'Wyślij zgłoszenie',               en: 'Send report' },
  report_sent:        { pl: '✅ Zgłoszenie wysłane — dziękujemy!', en: '✅ Report sent — thank you!' },
  report_send_err:    { pl: 'Błąd wysyłania — spróbuj ponownie.', en: 'Send error — please try again.' },
  // badge popup
  badge_unlocked:     { pl: 'Odznaka odblokowana!',             en: 'Badge unlocked!' },
  // summary
  quiz_complete:      { pl: 'Quiz ukończony!',                  en: 'Quiz complete!' },
  streak_extended:    { pl: '🔥 Seria przedłużona!',            en: '🔥 Streak extended!' },
  best_streak:        { pl: 'Najlepsza seria:',                 en: 'Best streak:' },
  in_a_row:           { pl: '{n} pod rząd',                     en: '{n} in a row' },
  weakest_domain:     { pl: 'Najsłabsza domena:',               en: 'Weakest domain:' },
  most_difficulty:    { pl: 'Najwięcej trudności:',             en: 'Most difficulty:' },
  train_area:         { pl: 'Ćwicz ten obszar',                 en: 'Train this area' },
  play_again:         { pl: 'Zagraj ponownie',                  en: 'Play again' },
  readiness_delta:    { pl: 'Zmiana gotowości: {n} pkt',        en: 'Readiness change: {n} pts' },
  reward_pending:     { pl: 'Nagroda zsynchronizuje się przy kolejnym połączeniu.', en: 'Your reward will sync on the next connection.' },
  exp_awarded:        { pl: '+{n} EXP',                         en: '+{n} EXP' },
  leaderboard_title:  { pl: 'Ranking',                          en: 'Leaderboard' },
  leaderboard_private:{ pl: 'Twój udział jest wyłączony',       en: 'Your participation is off' },
  leaderboard_private_desc:{ pl: 'Dołącz dobrowolnie. Publicznie widoczne będą tylko nick, pozycja i wynik/EXP.', en: 'Join voluntarily. Only your nick, position and score/EXP become public.' },
  leaderboard_join:   { pl: 'Dołącz do rankingu',               en: 'Join leaderboard' },
  leaderboard_week:   { pl: 'Tydzień',                          en: 'Week' },
  leaderboard_month:  { pl: 'Miesiąc',                          en: 'Month' },
  leaderboard_all:    { pl: 'Ogółem',                           en: 'All time' },
  leaderboard_empty:  { pl: 'Brak wyników dla wybranego okresu.', en: 'No scores in this period.' },
  leaderboard_score:  { pl: 'Wynik',                            en: 'Score' },
  leaderboard_loading:{ pl: 'Wczytywanie rankingu...',          en: 'Loading leaderboard...' },
  leaderboard_unavailable:{ pl: 'Ranking jest chwilowo niedostępny.', en: 'The leaderboard is temporarily unavailable.' },
  leaderboard_position:{ pl: 'Pozycja',                         en: 'Position' },
  // stats
  avg_correct:        { pl: 'Średnia poprawnych odpowiedzi',    en: 'Average correct answers' },
  d3:                 { pl: '3 dni',                            en: '3 days' },
  d7:                 { pl: '7 dni',                            en: '7 days' },
  d30:                { pl: '30 dni',                           en: '30 days' },
  total:              { pl: 'Łącznie',                          en: 'Total' },
  quizzes:            { pl: 'Quizy',                            en: 'Quizzes' },
  questions:          { pl: 'Pytania',                          en: 'Questions' },
  per_domain:         { pl: 'Per domena',                       en: 'Per domain' },
  preparation_analysis:{ pl: 'Analiza przygotowania',           en: 'Readiness analysis' },
  tab_ecoDomain:      { pl: 'Domeny ECO',                       en: 'ECO Domains' },
  tab_approach:       { pl: 'Podejścia',                        en: 'Approaches' },
  tab_domain:         { pl: 'Obszary',                          en: 'Topics' },
  tab_qtype:          { pl: 'Typ pytań',                        en: 'Question Type' },
  tab_difficulty:     { pl: 'Trudność',                         en: 'Difficulty' },
  data_since_update:  { pl: 'Dane od aktualizacji klasyfikacji', en: 'Data since classification update' },
  no_data:            { pl: 'Brak danych',                      en: 'No data' },
  responses:          { pl: 'odp.',                             en: 'ans.' },
  recommended_training:{ pl: 'Polecany trening',                en: 'Recommended training' },
  practice_10:        { pl: 'Ćwicz 10 pytań',                   en: 'Practice 10 questions' },
  activity_30:        { pl: 'Aktywność',                        en: 'Activity' },
  activity_history:   { pl: 'Historia aktywności',              en: 'Activity History' },
  badges:             { pl: 'Odznaki',                          en: 'Badges' },
  // Calendar
  day_0: { pl: 'Niedziela', en: 'Sunday' },
  day_1: { pl: 'Poniedziałek', en: 'Monday' },
  day_2: { pl: 'Wtorek', en: 'Tuesday' },
  day_3: { pl: 'Środa', en: 'Wednesday' },
  day_4: { pl: 'Czwartek', en: 'Thursday' },
  day_5: { pl: 'Piątek', en: 'Friday' },
  day_6: { pl: 'Sobota', en: 'Saturday' },
  month_0: { pl: 'Styczeń', en: 'January' },
  month_1: { pl: 'Luty', en: 'February' },
  month_2: { pl: 'Marzec', en: 'March' },
  month_3: { pl: 'Kwiecień', en: 'April' },
  month_4: { pl: 'Maj', en: 'May' },
  month_5: { pl: 'Czerwiec', en: 'June' },
  month_6: { pl: 'Lipiec', en: 'July' },
  month_7: { pl: 'Sierpień', en: 'August' },
  month_8: { pl: 'Wrzesień', en: 'September' },
  month_9: { pl: 'Październik', en: 'October' },
  month_10: { pl: 'Listopad', en: 'November' },
  month_11: { pl: 'Grudzień', en: 'December' },
  // trial exam (plan 12)
  trial_title:            { pl: 'Trial Exam',                       en: 'Trial Exam' },
  trial_menu_sub:         { pl: 'Symulacja egzaminu PMP na czas',   en: 'Timed PMP exam simulation' },
  trial_intro:            { pl: 'Wybierz długość. Czas i nawigacja jak na prawdziwym egzaminie. Wynik na końcu.', en: 'Pick a length. Timed, with exam-style navigation. Score at the end.' },
  trial_questions:        { pl: 'pytań',                            en: 'questions' },
  trial_min:              { pl: 'min',                              en: 'min' },
  trial_start:            { pl: 'Rozpocznij egzamin',               en: 'Start exam' },
  trial_not_enough:       { pl: 'Za mało pytań w puli dla tej długości.', en: 'Not enough questions in the pool for this length.' },
  trial_prev:             { pl: '‹ Poprzednie',                     en: '‹ Previous' },
  trial_next:             { pl: 'Dalej ›',                          en: 'Next ›' },
  trial_finish:           { pl: 'Zakończ egzamin',                  en: 'Finish exam' },
  trial_flag:             { pl: 'Oznacz do przeglądu',              en: 'Flag for review' },
  trial_palette:          { pl: 'Pytania',                          en: 'Questions' },
  trial_abandon:          { pl: 'Przerwij egzamin',                 en: 'Abandon exam' },
  trial_abandon_confirm:  { pl: 'Przerwać egzamin? Postęp przepadnie.', en: 'Abandon the exam? Progress will be lost.' },
  trial_confirm:          { pl: 'Zakończyć? Bez odpowiedzi: {un}, oflagowane: {fl}.', en: 'Finish? Unanswered: {un}, flagged: {fl}.' },
  trial_resume_title:     { pl: 'Masz niedokończony egzamin',       en: 'You have an unfinished exam' },
  trial_resume_sub:       { pl: 'Wznów tam, gdzie skończyłeś, albo zacznij od nowa.', en: 'Resume where you left off, or start over.' },
  trial_resume:           { pl: 'Wznów',                            en: 'Resume' },
  trial_discard:          { pl: 'Porzuć',                           en: 'Discard' },
  trial_timed_out:        { pl: '⏰ Czas minął — egzamin zakończony automatycznie', en: "⏰ Time's up — exam submitted automatically" },
  trial_time_used:        { pl: 'Czas',                             en: 'Time' },
  trial_time_of:          { pl: 'z',                                en: 'of' },
  trial_result_title:     { pl: 'Wynik egzaminu',                   en: 'Exam result' },
  trial_rating_disclaimer:{ pl: 'Progi orientacyjne — prawdziwy egzamin używa analizy psychometrycznej.', en: 'Approximate thresholds — the real exam uses psychometric scoring.' },
  trial_new_exam:         { pl: 'Nowy egzamin',                     en: 'New exam' },
  trial_show_answers:     { pl: 'Zobacz odpowiedzi',                en: 'See answers' },
  trial_hide_answers:     { pl: 'Ukryj odpowiedzi',                 en: 'Hide answers' },
  trial_review_title:     { pl: 'Przegląd pytań',                   en: 'Question review' },
  trial_domains_title:    { pl: 'Wyniki per domena',                en: 'Results per domain' },
  trial_unanswered:       { pl: '— brak odpowiedzi —',              en: '— no answer —' },
  rating_above:           { pl: 'Powyżej celu',                     en: 'Above Target' },
  rating_target:          { pl: 'Cel osiągnięty',                   en: 'Target' },
  rating_below:           { pl: 'Poniżej celu',                     en: 'Below Target' },
  rating_needs:           { pl: 'Wymaga poprawy',                   en: 'Needs Improvement' },
  your_answer:            { pl: 'Twoja odpowiedź',                  en: 'Your answer' },
  correct_answer:         { pl: 'Poprawna odpowiedź',              en: 'Correct answer' },
};

function t(key, vars) {
  const entry = I18N[key];
  let s = entry ? (entry[L()] ?? entry.pl) : key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}

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
  getStreakData()           { return this._get('streak_data', {}); },
  saveStreakData(d)         { this._set('streak_data', d); },
  getStreakWeekStartDow()   { return this._get('streak_week_start_dow', null); },
  saveStreakWeekStartDow(d) { this._set('streak_week_start_dow', d); },
  getWeakQuestions()    { return this._get('weak_questions', {}); },
  saveWeakQuestions(wq) { this._set('weak_questions', wq); },
  getUnlockedBadges()   { return this._get('unlocked_badges', []); },
  saveUnlockedBadges(b) { this._set('unlocked_badges', b); },
  getSettings()         {
    const defaults = { confidenceEnabled: true, autoScrollEnabled: true, defaultLanguage: 'pl', theme: 'auto' };
    return { ...defaults, ...this._get('settings', {}) };
  },
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
  // Odblokowanie działa między urządzeniami dzięki cross-device sync (plan 09).
  // quiz_history jest teraz synchronizowane z chmurą; fallback na streak_data
  // zapewnia poprawne działanie również zanim nastąpi pierwszy pull.
  hasCompletedAnyQuiz() {
    return this.getHistory().length > 0
        || Object.keys(this.getStreakData()).length > 0;
  },
  // Trial Exam — sesja egzaminu przeżywa reload/PWA dzięki localStorage (plan 12, sekcja 3a).
  getTrialSession()   { return this._get('trial_session', null); },
  saveTrialSession(s) { this._set('trial_session', s); },
  clearTrialSession() { try { localStorage.removeItem('trial_session'); } catch {} },
  getPendingAwards()  { return this._get('pending_engagement_awards', []); },
  queueAward(award) {
    const pending = this.getPendingAwards().filter(item => item.sessionId !== award.sessionId);
    pending.push(award);
    this._set('pending_engagement_awards', pending);
  },
  removePendingAward(sessionId) {
    this._set('pending_engagement_awards', this.getPendingAwards().filter(item => item.sessionId !== sessionId));
  },
};

// ==================== SUPABASE SYNC ====================
const SupabaseSync = {
  async pullProgress() {
    AppState.syncStatus = 'syncing';
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) { AppState.syncStatus = 'idle'; return; }
      const { data, error } = await sb()
        .from('user_progress')
        .select('streak_data, streak_week_start_dow, weak_questions, unlocked_badges, quiz_history, settings, confidence_data')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error || !data) { AppState.syncStatus = 'error'; return; }
      // Remote wins for streak + badges (cloud is source of truth)
      if (data.streak_data)     Storage.saveStreakData(data.streak_data);
      if (data.streak_week_start_dow !== undefined && data.streak_week_start_dow !== null) {
        Storage.saveStreakWeekStartDow(data.streak_week_start_dow);
      }
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
      // quiz_history — cloud wins (full history, use only if non-empty)
      if (data.quiz_history && Array.isArray(data.quiz_history) && data.quiz_history.length > 0) {
        Storage._set('quiz_history', data.quiz_history);
      }
      // settings — cloud wins, merged over local keys so new local-only keys survive
      if (data.settings && Object.keys(data.settings).length > 0) {
        Storage.saveSettings({ ...Storage.getSettings(), ...data.settings });
        // Keep live language state in sync with pulled settings
        const pulled = Storage.getSettings();
        AppState.showEnglish = (pulled.defaultLanguage === 'en');
      }
      // confidence_data — cloud wins
      if (data.confidence_data && Object.keys(data.confidence_data).length > 0) {
        Storage.saveConfidenceData(data.confidence_data);
      }
      AppState.syncStatus = 'ok';
    } catch (e) { console.warn('pullProgress failed:', e); AppState.syncStatus = 'error'; }
  },

  // Loads the full tester profile in an isolated query so a missing table/row
  // never breaks the main progress sync. `user_profiles` is the source of truth.
  // Back-compat: accounts created before the beta system have no user_profiles
  // row, so we fall back to the legacy `user_progress.is_tester` flag and grant
  // bug-reporting to existing testers (otherwise they'd lose the 🚩 button).
  async pullProfile() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;

      const { data: profile, error } = await sb()
        .from('user_profiles')
        .select('nick, is_tester, can_report_bugs, can_see_debug_info')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && profile) {
        AppState.nick            = profile.nick              ?? null;
        AppState.isTester        = profile.is_tester        ?? false;
        AppState.canReportBugs   = profile.can_report_bugs   ?? false;
        AppState.canSeeDebugInfo = profile.can_see_debug_info ?? false;
        return;
      }

      // No profile row (legacy account or error) → fall back to user_progress.
      const { data: legacy } = await sb()
        .from('user_progress')
        .select('is_tester')
        .eq('user_id', user.id)
        .maybeSingle();
      const legacyTester = legacy?.is_tester ?? false;
      AppState.isTester        = legacyTester;
      AppState.canReportBugs   = legacyTester;
      AppState.canSeeDebugInfo = false;
    } catch (e) { console.warn('pullProfile failed:', e); }
  },

  async pushProgress() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      // Limit quiz_history to last 500 entries to keep JSONB column size sane
      const history = Storage.getHistory().slice(-500);
      await sb().from('user_progress').upsert({
        user_id:               user.id,
        streak_data:           Storage.getStreakData(),
        streak_week_start_dow: Storage.getStreakWeekStartDow(),
        weak_questions:        Storage.getWeakQuestions(),
        unlocked_badges:       Storage.getUnlockedBadges(),
        quiz_history:          history,
        settings:              Storage.getSettings(),
        confidence_data:       Storage.getConfidenceData(),
        updated_at:            new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch (e) { console.warn('pushProgress failed:', e); }
  },

  async saveQuizSession({ mode, correct, total, percent, domainResults, breakdowns, examLength, durationSec, timeLeftSec, rating }) {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const row = {
        user_id: user.id,
        mode,
        score:   correct,
        total,
        percent,
        domains: domainResults || [],
        breakdowns: breakdowns || {},
      };
      // Pola egzaminu Trial — wymagają migracji 12_trial_exam.sql; wysyłane tylko
      // gdy podane (tryby quiz/daily/quick/weak ich nie dosyłają).
      if (examLength  !== undefined) row.exam_length   = examLength;
      if (durationSec !== undefined) row.duration_sec  = durationSec;
      if (timeLeftSec !== undefined) row.time_left_sec = timeLeftSec;
      if (rating      !== undefined) row.rating        = rating;
      await sb().from('quiz_sessions').insert(row);
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

const EngagementSync = {
  _setState(row) {
    if (!row) return;
    AppState.engagement = {
      careerExp: row.career_exp ?? 0,
      rankingScore: row.ranking_score ?? 0,
      leaderboardVisible: row.leaderboard_visible ?? false,
    };
  },
  async pullMe() {
    const { data: { session } } = await sb().auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;
    const { data, error } = await sb()
      .from('user_engagement')
      .select('career_exp, ranking_score, leaderboard_visible')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    this._setState(data);
    return data;
  },
  async award(award) {
    Storage.queueAward(award);
    const { data, error } = await sb().rpc('award_quiz_session', {
      p_session_id: award.sessionId,
      p_mode: award.mode,
      p_correct: award.correct,
      p_total: award.total,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    Storage.removePendingAward(award.sessionId);
    this._setState(row);
    return row;
  },
  async flushPending() {
    for (const award of Storage.getPendingAwards()) {
      try { await this.award(award); } catch (e) { console.warn('award retry failed:', e); break; }
    }
  },
  async setVisibility(visible) {
    const { data, error } = await sb().rpc('set_leaderboard_visibility', { p_visible: visible });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    this._setState(row);
    return row;
  },
  async getLeaderboard(period) {
    const { data, error } = await sb().rpc('get_public_leaderboard', { p_period: period, p_limit: 50 });
    if (error) throw error;
    return data || [];
  },
};

// ==================== SESSION GUARD ====================
// One account = one active device. Each device holds a random device_token in
// localStorage and mirrors it into user_sessions on login. On app start we
// compare the two; a mismatch means another device logged in → force sign-out.
// See plans/07-multi-device-protection.md.
const SessionGuard = {
  STORAGE_KEY: 'device_token',

  // Get (or lazily create) this device's persistent token.
  getLocalToken() {
    let token = localStorage.getItem(this.STORAGE_KEY);
    if (!token) {
      token = (crypto.randomUUID ? crypto.randomUUID()
                                 : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(this.STORAGE_KEY, token);
    }
    return token;
  },

  // On login: claim this account for this device (overwrites the previous row).
  async registerDevice() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      const token = this.getLocalToken();
      const now   = new Date().toISOString();
      await sb().from('user_sessions').upsert({
        user_id:      user.id,
        device_token: token,
        device_info:  navigator.userAgent.substring(0, 80),
        logged_in_at: now,
        last_seen_at: now,
      }, { onConflict: 'user_id' });
    } catch (e) { console.warn('registerDevice failed:', e); }
  },

  // On app start: is this device still the active one for the account?
  // Fail-open on network/query errors so a transient Supabase hiccup never
  // locks a legitimately-logged-in user out of an offline-capable PWA.
  async verify() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return true; // no auth session = nothing to guard

      const localToken = localStorage.getItem(this.STORAGE_KEY);

      const { data, error } = await sb()
        .from('user_sessions')
        .select('device_token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return true;        // query failed → don't kick on a hiccup
      if (!data)  return true;        // no device claimed yet (legacy/first run) → allow
      if (!localToken) return false;  // a device owns this account, but it isn't us
      return data.device_token === localToken;
    } catch (e) { console.warn('SessionGuard.verify failed:', e); return true; }
  },

  // Optional: refresh last_seen_at (called on a timer) for activity monitoring.
  async heartbeat() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return;
      await sb().from('user_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', user.id);
    } catch (e) { /* non-critical */ }
  },

  // Start the 5-minute heartbeat. Idempotent: a second login in the same page
  // load (logout → login, no reload) won't stack multiple timers.
  _heartbeatTimer: null,
  startHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => this.heartbeat(), 5 * 60 * 1000);
  },

  // On manual logout: drop the local token so the next login is unconstrained.
  clearLocalToken() {
    localStorage.removeItem(this.STORAGE_KEY);
  },
};

// ==================== AUTH ====================
const Auth = {
  // Nick format (mirrors migration 13 CHECK + the Edge Functions):
  // 3–20 chars, [A-Za-z0-9_-], no spaces, no diacritics.
  NICK_RE: /^[A-Za-z0-9_-]{3,20}$/,

  // A login identifier is an email if it contains '@'. The nick regex forbids
  // '@', so the two namespaces never overlap and this heuristic is unambiguous.
  isEmail(id) { return id.includes('@'); },

  // Translate a nick → email via the resolve-nick Edge Function (service_role,
  // so user emails are NOT publicly readable — RODO). Returns the email string,
  // or throws an Error with a user-facing (deliberately vague) message.
  async resolveNick(nick) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-nick`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'apikey':        SUPABASE_ANON,
      },
      body: JSON.stringify({ nick }),
    });
    let data;
    try { data = await res.json(); }
    catch { throw new Error(t('generic_error')); }
    if (!data || !data.ok || !data.email) {
      // Uniform message — never reveal whether the nick exists (anti-enumeration).
      throw new Error((data && data.error) || t('generic_error'));
    }
    return data.email;
  },

  // Accepts an email OR a nick as the identifier. If it's a nick, resolve it to
  // an email first, then sign in with email+password as usual.
  async signIn(identifier, password) {
    const id    = String(identifier || '').trim();
    const email = this.isEmail(id) ? id : await this.resolveNick(id);
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signUp(email, password) {
    const { error } = await sb().auth.signUp({ email, password });
    if (error) throw error;
  },
  // Beta registration goes through the register-beta-user Edge Function, which
  // is the only way to create an account once "Enable sign ups" is OFF.
  // Returns { ok } on success, or { error } with a user-facing message.
  async registerBeta(code, email, password, nick) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/register-beta-user`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'apikey':        SUPABASE_ANON,
      },
      body: JSON.stringify({ code, email, password, nick }),
    });
    let data;
    try { data = await res.json(); }
    catch { throw new Error(t('generic_error')); }
    return data;
  },
  // Start the Google OAuth redirect. The beta code is NOT sent here — it's
  // stashed in sessionStorage by Views.login._google() before this runs, and
  // claimed server-side after the redirect lands back in App.init() (the gate).
  // redirectTo brings the user back to this exact page; detectSessionInUrl
  // (on by default) then picks the token out of the URL and sets the session.
  async signInWithGoogle() {
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) throw error;
    // The browser is now redirecting to Google; the code is already stored.
  },

  // First Google login only: hand the pending beta code to claim-oauth-beta,
  // authenticated with the user's own access token. Creates the tester profile.
  // Returns { ok } on success or { error } with a user-facing message.
  async claimOauthBeta(code) {
    const { data: { session } } = await sb().auth.getSession();
    const token = session?.access_token;
    if (!token) return { error: t('generic_error') };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/claim-oauth-beta`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,   // the USER's token, not the anon key
        'apikey':        SUPABASE_ANON,
      },
      body: JSON.stringify({ code }),
    });
    let data;
    try { data = await res.json(); }
    catch { return { error: t('generic_error') }; }
    return data;
  },

  // Password reset without Supabase email auth: email + the ORIGINAL beta code
  // + a new password go to the reset-beta-password Edge Function, which verifies
  // the (email, code) pair against user_profiles and sets the password via the
  // admin API. Returns { ok } or { error }.
  async resetPassword(email, code, newPassword) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reset-beta-password`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'apikey':        SUPABASE_ANON,
      },
      body: JSON.stringify({ email, code, newPassword }),
    });
    let data;
    try { data = await res.json(); }
    catch { throw new Error(t('generic_error')); }
    return data; // { ok } or { error }
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

  normalizeFilters(filters) {
    if (Array.isArray(filters)) return { ...emptyFilters(), domains: filters };
    return { ...emptyFilters(), ...(filters || {}) };
  },

  matchesFilters(question, filters = {}) {
    const f = this.normalizeFilters(filters);
    const selectedIn = (values, value) => values.length === 0 || values.includes(value);
    return selectedIn(f.domains, question.domain)
      && selectedIn(f.ecoDomains, question.eco_domain)
      && selectedIn(f.difficulties, question.difficulty)
      && selectedIn(f.qtypes, question.qtype)
      && (f.approachTags.length === 0
        || (question.approach_tags || []).some(tag => f.approachTags.includes(tag)));
  },

  countAvailable(allQuestions, mode, filters = {}) {
    const matching = allQuestions.filter(q => this.matchesFilters(q, filters));
    if (mode !== 'weak') return matching.length;
    const weak = Storage.getWeakQuestions();
    return matching.filter(q => (weak[q.id] || 0) > 0).length;
  },

  // FIX #4 — SRS cooldown: recentlyShown prevents repeating weak questions
  selectQuestions(allQuestions, mode, filters = {}, recentlyShown = [], requestedSize = null) {
    const matching = allQuestions.filter(q => this.matchesFilters(q, filters));
    if (mode === 'weak') {
      const wq = Storage.getWeakQuestions();
      const cooldownIds = new Set(recentlyShown.slice(-SRS_COOLDOWN));

      // First pass: exclude recently shown
      let pool = [];
      matching.forEach(q => {
        const count = wq[q.id] || 0;
        if (count > 0 && !cooldownIds.has(q.id)) {
          for (let i = 0; i < Math.min(count * 3, 9); i++) pool.push(q);
        }
      });
      // If pool too small, fall back to including cooled-down items
      if (pool.length < QUIZ_SIZES.weak) {
        matching.forEach(q => {
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
    const size = requestedSize || (mode === 'daily' ? QUIZ_SIZES.daily : QUIZ_SIZES.quick);
    return this.shuffle(matching).slice(0, size);
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

  answerRecord(question, correct) {
    return {
      questionId: question.id,
      correct,
      domain: question.domain,
      ecoDomain: question.eco_domain,
      ecoTask: question.eco_task,
      difficulty: question.difficulty,
      qtype: question.qtype,
      approachTags: question.approach_tags || [],
    };
  },

  buildDomainResults(answers) {
    const totals = {};
    answers.forEach(answer => {
      if (!answer.domain) return;
      if (!totals[answer.domain]) totals[answer.domain] = { correct: 0, total: 0 };
      totals[answer.domain].total++;
      if (answer.correct) totals[answer.domain].correct++;
    });
    return Object.entries(totals).map(([domain, values]) => ({
      domain, ...values, percent: Math.round((values.correct / values.total) * 100),
    }));
  },

  buildBreakdowns(answers) {
    const totals = { ecoDomain: {}, approach: {}, difficulty: {}, qtype: {}, ecoTask: {}, domain: {} };
    const add = (dimension, key, correct) => {
      if (!key) return;
      if (!totals[dimension][key]) totals[dimension][key] = { correct: 0, total: 0 };
      totals[dimension][key].total++;
      if (correct) totals[dimension][key].correct++;
    };
    answers.forEach(answer => {
      add('domain', answer.domain, answer.correct);
      add('ecoDomain', answer.ecoDomain, answer.correct);
      add('difficulty', answer.difficulty, answer.correct);
      add('qtype', answer.qtype, answer.correct);
      add('ecoTask', answer.ecoTask, answer.correct);
      (answer.approachTags || []).forEach(tag => add('approach', tag, answer.correct));
    });
    return Object.fromEntries(Object.entries(totals).map(([dimension, values]) => [
      dimension,
      Object.entries(values).map(([key, count]) => ({
        key, ...count, percent: Math.round((count.correct / count.total) * 100),
      })),
    ]));
  },

  weakestSegment(breakdowns, minAnswers = 3) {
    const dimensions = ['ecoDomain', 'approach', 'qtype', 'domain'];
    const segments = dimensions.flatMap(dimension => (breakdowns[dimension] || [])
      .filter(item => item.total >= minAnswers)
      .map(item => ({ dimension, ...item, filters: filterForSegment(dimension, item.key) })));
    return segments.sort((a, b) =>
      a.percent - b.percent || (b.total - b.correct) - (a.total - a.correct) || b.total - a.total
    )[0] || null;
  },

  // Trial Exam — losowo z całej puli, bez powtórzeń (plan 12, sekcja 4).
  selectTrialQuestions(allQuestions, n) {
    return this.shuffle([...allQuestions]).slice(0, n);
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
  getWeekDays() {
    const data = Storage.getStreakData();
    let startDow = Storage.getStreakWeekStartDow();

    // Pierwsza wizyta — zapisz bieżący dzień tygodnia jako punkt startowy
    if (startDow === null) {
      startDow = (new Date().getDay() + 6) % 7; // JS 0=Nd → 0=Pn
      Storage.saveStreakWeekStartDow(startDow);
    }

    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7;
    // Ile dni wstecz do początku bieżącego tygodnia widgetu
    const daysBack = (todayDow - startDow + 7) % 7;

    const todayKey = TODAY();
    const dayNamesPl = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
    const dayNamesEn = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - daysBack + i);
      const key = d.toISOString().slice(0, 10);
      const isToday  = key === todayKey;
      const isFuture = d > today && !isToday;
      const dow = (d.getDay() + 6) % 7;
      const status = isFuture           ? 'future'
        : data[key] === 'daily'         ? 'done'
        : data[key] === 'activity'      ? 'activity'
        : isToday                       ? 'today'
        : 'missed';
      return {
        date:     key,
        dayShort: AppState.showEnglish ? dayNamesEn[dow] : dayNamesPl[dow],
        dayNum:   d.getDate(),
        status,
        isToday,
      };
    });
  },
  getMonthData(year, month) {
    const data = Storage.getStreakData();
    const todayKey = TODAY();
    const today = new Date();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Dzień tygodnia pierwszego dnia (0=Pn, 6=Nd)
    const firstDow = (firstDay.getDay() + 6) % 7;

    const days = [];
    // Padding na początku
    for (let i = 0; i < firstDow; i++) {
      days.push({ type: 'padding' });
    }

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
      else if (data[key] === undefined && current < today) {
        // Sprawdzamy czy użytkownik w ogóle był wtedy aktywny (czy data[key] istnieje)
        // Jeśli nie ma wpisu, to 'none', jeśli jest cokolwiek innego niż daily/activity to 'missed'
        // Ale StreakManager zazwyczaj zapisuje tylko sukcesy.
        // Jeśli chcemy pokazać kropkę jako "niezrobione", musimy wiedzieć od kiedy użytkownik ma konto.
        // Dla uproszczenia: jeśli nie ma w data[key], to 'none'.
        status = 'none';
      }

      days.push({
        type: 'day',
        dayNum: d,
        date: key,
        status,
        isToday
      });
    }

    return days;
  },
  getActiveMonths() {
    const data = Storage.getStreakData();
    const keys = Object.keys(data).sort();
    const months = new Set();

    // Zawsze dodaj bieżący i poprzedni miesiąc
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    months.add(fmt(now));
    months.add(fmt(prev));

    keys.forEach(k => {
      months.add(k.slice(0, 7)); // YYYY-MM
    });

    return Array.from(months).sort(); // Sort chronologically (oldest to newest)
  },
  getDayDetails(dateKey) {
    const h = Storage.getHistory();
    const dayEntries = h.filter(r => r.date === dateKey);
    if (!dayEntries.length) return null;

    const counts = {};
    dayEntries.forEach(r => {
      counts[r.mode] = (counts[r.mode] || 0) + 1;
    });

    const modeNames = {
      daily:    t('daily_challenge'),
      quick:    t('quick_quiz'),
      standard: t('standard_quiz'),
      weak:     t('weak_questions'),
      trial:    t('trial_title')
    };

    return Object.entries(counts).map(([mode, count]) => {
      const name = modeNames[mode] || mode;
      return `${count}x ${name}`;
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
    // Trial Exam (plan 12) — pola wyliczane z historii (filtr mode === 'trial')
    const trials = history.filter(r => r.mode === 'trial');
    const trialCount     = trials.length;
    const trialFullDone  = trials.some(r => r.examLength === 180);
    const trialBest      = trials.reduce((m, r) => Math.max(m, r.percent || 0), 0);
    const trialBeatClock = trials.some(r =>
      r.durationSec && r.timeLeftSec >= r.durationSec * 0.25);
    return { totalAnswered, totalQuizzes, currentStreak, avg30, hadPerfectQuiz,
             trialCount, trialFullDone, trialBest, trialBeatClock };
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
    const totals = recent.reduce((sum, result) => ({
      correct: sum.correct + (Number.isFinite(result.correct) ? result.correct : (result.percent || 0) * (result.total || 1) / 100),
      total: sum.total + (result.total || 1),
    }), { correct: 0, total: 0 });
    return Math.round((totals.correct / totals.total) * 100);
  },
  getPerDomain(questions) {
    const history = Storage.getHistory();
    const domains = [...new Set(questions.map(q => q.domain).filter(Boolean))].sort();
    return domains.map(domain => {
      const entries = history.flatMap(r => r.domainResults || []).filter(d => d.domain === domain);
      if (!entries.length) return { domain, percent: null, total: 0 };
      const counted = entries.filter(entry => Number.isFinite(entry.correct) && Number.isFinite(entry.total));
      if (!counted.length) {
        return { domain, percent: Math.round(entries.reduce((s, entry) => s + entry.percent, 0) / entries.length), total: null };
      }
      const correct = counted.reduce((sum, entry) => sum + entry.correct, 0);
      const total = counted.reduce((sum, entry) => sum + entry.total, 0);
      return { domain, percent: Math.round((correct / total) * 100), total };
    });
  },
  getBreakdown(dimension, questions) {
    const values = {
      ecoDomain: Object.keys(ECO_I18N),
      approach: Object.keys(APPROACH_I18N),
      qtype: Object.keys(QTYPE_I18N),
      difficulty: Object.keys(DIFFICULTY_I18N),
      domain: [...new Set(questions.map(q => q.domain).filter(Boolean))].sort(),
    }[dimension] || [];
    const entries = Storage.getHistory().flatMap(result => result.breakdowns?.[dimension] || []);
    return values.map(key => {
      const matching = entries.filter(entry => entry.key === key);
      const correct = matching.reduce((sum, entry) => sum + (entry.correct || 0), 0);
      const total = matching.reduce((sum, entry) => sum + (entry.total || 0), 0);
      return { key, correct, total, percent: total ? Math.round((correct / total) * 100) : null };
    });
  },
  getRecentClassifiedHistory(days = 30, maxAnswers = 100) {
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
  getReadiness() {
    const recent = this.getRecentClassifiedHistory();
    const answered = recent.reduce((sum, result) => sum + (result.total || 0), 0);
    if (answered < 30) return { state: 'calibrating', answered, required: 30 };
    const correct = recent.reduce((sum, result) => sum + (result.correct || 0), 0);
    const accuracy = Math.round(correct / answered * 100);
    const eco = this.aggregateBreakdown(recent, 'ecoDomain').filter(item => item.total >= 5);
    const coverage = eco.length
      ? Math.round(eco.reduce((sum, item) => sum + item.percent, 0) / eco.length)
      : accuracy;
    const score = Math.round(accuracy * 0.65 + coverage * 0.35);
    const weakest = eco.slice().sort((a, b) => a.percent - b.percent)[0] || null;
    return { state: 'ready', score, accuracy, coverage, weakest, answered };
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
      const keys = new Set(recent.flatMap(result => (result.breakdowns[dimension] || []).map(item => item.key)));
      return [...keys].map(key => {
        const entries = recent.flatMap(result => result.breakdowns[dimension] || []).filter(item => item.key === key);
        const correct = entries.reduce((sum, item) => sum + item.correct, 0);
        const total = entries.reduce((sum, item) => sum + item.total, 0);
        const percent = total ? Math.round((correct / total) * 100) : 0;
        const filters = filterForSegment(dimension, key);
        return { dimension, key, correct, total, percent, filters, priority: (total - correct) * (1 - percent / 100) };
      });
    }).filter(item => item.total >= 5 && QuizEngine.countAvailable(questions, 'quick', item.filters) >= 10);
    return candidates.sort((a, b) => b.priority - a.priority || a.percent - b.percent)[0] || null;
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
  trialResult:  null,   // { ...result, review } — wynik ostatniego Trial Exam (plan 12)
  pendingMode:  null,
  pendingDomains: [],
  showEnglish:  false,  // EN/PL toggle state
  nick:            null,  // user's unique nick (user_profiles.nick); null for legacy accounts
  engagement:      { careerExp: 0, rankingScore: 0, leaderboardVisible: false },
  isTester:        false, // gates per-question EN/PL override (user_profiles.is_tester, source of truth)
  canReportBugs:   false, // gates the "Report issue" 🚩 button (user_profiles.can_report_bugs)
  canSeeDebugInfo: false, // gates future diagnostics (user_profiles.can_see_debug_info)
  syncStatus:   'idle', // 'idle' | 'syncing' | 'ok' | 'error'
  sessionKickedMsg: null, // set when SessionGuard kicks this device; shown once on the login screen
};

// ==================== REPORT MODAL (shared by quiz / trial / trial-result) ====================
// Wspólny helper zgłaszania błędów — używany przez Views.quiz, Views.trial i
// Views['trial-result']. Pytanie podajemy jawnie przez open(question).
const ReportModal = {
  _q: null,

  open(question) {
    if (!question) return;
    this._q = question;
    document.getElementById('report-modal')?.remove();
    const q = question;

    const categories = [
      { id: 'wrong_answer',  label: t('cat_wrong_answer') },
      { id: 'unclear',       label: t('cat_unclear') },
      { id: 'typo',          label: t('cat_typo') },
      { id: 'translation',   label: t('cat_translation') },
      { id: 'other',         label: t('cat_other') },
    ];
    const chips = categories.map(c => `
      <button type="button" class="report-chip" data-cat="${c.id}"
              onclick="ReportModal._selectCat('${c.id}')">
        ${c.label}
      </button>`).join('');
    const preview = (() => {
      const txt = (AppState.showEnglish && q.question_en) ? q.question_en : q.question;
      return txt.slice(0, 100) + (txt.length > 100 ? '…' : '');
    })();

    const modal = document.createElement('div');
    modal.id = 'report-modal';
    modal.className = 'report-modal';
    modal.innerHTML = `
      <div class="report-modal__card" role="dialog" aria-modal="true" aria-label="${t('report_aria')}">
        <div class="report-modal__header">
          <span>${t('report_header')}</span>
          <button class="report-modal__close" onclick="ReportModal.close()" aria-label="${t('close')}">✕</button>
        </div>
        <p class="report-modal__question-preview">"${preview}"</p>
        <div class="report-modal__cats" id="report-cats">${chips}</div>
        <textarea id="report-comment" class="report-modal__textarea"
                  placeholder="${t('report_comment_ph')}"
                  maxlength="500" rows="3"></textarea>
        <div id="report-modal-msg" class="report-modal__msg hidden"></div>
        <div class="report-modal__actions">
          <button class="btn-secondary" onclick="ReportModal.close()">${t('cancel')}</button>
          <button class="btn-primary" id="report-submit-btn"
                  onclick="ReportModal._submit()" disabled>${t('send_report')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) ReportModal.close(); });
  },

  _selectCat(catId) {
    document.querySelectorAll('.report-chip').forEach(el => {
      el.classList.toggle('selected', el.dataset.cat === catId);
    });
    const btn = document.getElementById('report-submit-btn');
    if (btn) btn.disabled = false;
  },

  close() {
    document.getElementById('report-modal')?.remove();
  },

  async _submit() {
    const q = this._q;
    if (!q) return;
    const catEl     = document.querySelector('.report-chip.selected');
    const comment   = document.getElementById('report-comment')?.value.trim();
    const msgEl     = document.getElementById('report-modal-msg');
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
      this.close();
      this.toast(t('report_sent'), true);
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = t('report_send_err');
        msgEl.className   = 'report-modal__msg report-modal__msg--err';
      }
      submitBtn.disabled    = false;
      submitBtn.textContent = t('send_report');
    }
  },

  toast(msg, success = true) {
    document.getElementById('quiz-toast')?.remove();
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
};

// ==================== VIEWS ====================
const Views = {};

// ==================== THEME MANAGER ====================
const ThemeManager = {
  init() {
    this.apply(Storage.getSettings().theme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (Storage.getSettings().theme === 'auto') this.apply('auto');
    });
  },
  apply(theme) {
    const root = document.documentElement;
    const metaTheme = document.querySelector('meta[name="theme-color"]');

    root.classList.remove('theme-dark', 'theme-light');

    if (theme === 'dark') {
      root.classList.add('theme-dark');
      if (metaTheme) metaTheme.setAttribute('content', '#081426');
    } else if (theme === 'light') {
      root.classList.add('theme-light');
      if (metaTheme) metaTheme.setAttribute('content', '#F5F7FB');
    } else {
      // auto
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (metaTheme) metaTheme.setAttribute('content', isDark ? '#081426' : '#F5F7FB');
    }
  }
};

// ==================== ROUTER ====================
const App = {
  currentView: 'loading',

  navigate(view, params = {}) {
    // Sprzątanie timera egzaminu przy opuszczaniu widoku 'trial' (plan 12, sekcja 15).
    if (this.currentView === 'trial' && view !== 'trial') Views.trial?._stopTimer();
    Object.assign(AppState, params);
    this.currentView = view;
    this.render();
    window.scrollTo(0, 0);
  },

  render() {
    const view = Views[this.currentView];
    if (!view) { console.error('Unknown view:', this.currentView); return; }
    document.documentElement.lang = L();
    document.getElementById('app').innerHTML = view.render();
    view.init?.();
  },

  async init() {
    ThemeManager.init();
    // Apply saved language before the first paint so the loading/login screens are localized too
    AppState.showEnglish = (Storage.getSettings().defaultLanguage === 'en');
    this.navigate('loading');
    const { data: { session } } = await sb().auth.getSession();
    if (!session) {
      this.navigate('login');
      return;
    }
    // Beta gate for Google OAuth: a fresh Google sign-in lands here with a valid
    // session but possibly NO tester profile yet (Supabase creates auth.users for
    // any Google account even with sign-ups OFF). _oauthGate ensures such a user
    // has claimed a beta code; if it can't be satisfied it signs out and bounces
    // to login itself, returning false so we stop here. Existing testers (profile
    // present, or email/password logins) pass straight through.
    const gated = await this._oauthGate();
    if (!gated) return;
    // Multi-device guard: if another device has claimed this account since we
    // last opened the app, sign out here and bounce to login with a notice.
    const isValid = await SessionGuard.verify();
    if (!isValid) {
      SessionGuard.clearLocalToken();
      await sb().auth.signOut();
      this.navigate('login', { sessionKickedMsg: t('session_kicked') });
      return;
    }
    await this.afterAuth();
  },

  // Returns true to continue normal startup, false if it has already redirected
  // (signed the user out and navigated to login). Key for Google OAuth:
  //   - profile exists           → existing tester → continue
  //   - no profile + pending code → first Google login → claim it → continue
  //   - no profile + no code      → someone reached a session without a code →
  //                                 sign out, send back to login with a notice
  //   - no profile + bad/used code→ claim rejected → sign out, show the reason
  // The pending code is stashed in sessionStorage by Views.login._google()
  // before the redirect to Google, and survives the round-trip.
  async _oauthGate() {
    try {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return true; // no user → let the normal (no-session) path handle it

      // RLS allows a user to read only their own profile row.
      const { data: profile, error } = await sb()
        .from('user_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // Profile present → existing tester (email or already-claimed Google).
      // On a query error, fail OPEN (don't lock out a legitimate tester over a
      // transient Supabase hiccup) — same philosophy as SessionGuard.verify.
      if (error) return true;
      if (profile) {
        sessionStorage.removeItem('pmp_pending_beta_code');
        return true;
      }

      // No profile → this is a first Google login that must present a code.
      const pendingCode = sessionStorage.getItem('pmp_pending_beta_code');
      if (!pendingCode) {
        await Auth.signOut();
        this.navigate('login', { sessionKickedMsg: t('oauth_need_code') });
        return false;
      }

      const data = await Auth.claimOauthBeta(pendingCode);
      if (!data || !data.ok) {
        sessionStorage.removeItem('pmp_pending_beta_code');
        await Auth.signOut();
        this.navigate('login', { sessionKickedMsg: (data && data.error) || t('generic_error') });
        return false;
      }

      // Claim succeeded → profile now exists; clear the code and continue.
      sessionStorage.removeItem('pmp_pending_beta_code');
      return true;
    } catch (e) {
      console.warn('OAuth gate failed:', e);
      // Fail open: don't strand a tester if the gate itself errors.
      return true;
    }
  },

  async afterAuth() {
    try {
      const res = await fetch('./questions.json');
      AppState.questions = await res.json();
    } catch (e) {
      console.error('Failed to load questions.json', e);
      AppState.questions = [];
    }
    // Claim this account for this device (overwrites any previous device's
    // token). Awaited so the binding is written before the session is "active".
    await SessionGuard.registerDevice();
    // Pull cloud progress + tester profile in background — does not block UI
    SupabaseSync.pullProgress().catch(console.error);
    SupabaseSync.pullProfile().catch(console.error);
    EngagementSync.pullMe().then(() => App.render()).catch(console.warn);
    EngagementSync.flushPending().then(() => EngagementSync.pullMe()).then(() => App.render()).catch(console.warn);
    // Initialize EN/PL state from saved global language preference
    AppState.showEnglish = (Storage.getSettings().defaultLanguage === 'en');
    await new Promise(r => setTimeout(r, 800));

    // Trial Exam — wykrycie niedokończonej sesji egzaminu (plan 12, sekcja 3a).
    const trial = Storage.getTrialSession();
    if (trial && trial.mode === 'trial' && Array.isArray(trial.questions) && trial.questions.length) {
      AppState.quizSession = trial;
      if (trial.endsAt <= Date.now()) {
        // Egzamin wygasł w tle → auto-finalizacja z timedOut=true.
        this.navigate('home');
        SessionGuard.startHeartbeat();
        Views.trial._finish(true);   // nawiguje do trial-result
        return;
      }
      // Wciąż ważny → zaproponuj wznowienie.
      this.navigate('home');
      SessionGuard.startHeartbeat();
      Views.home._promptTrialResume();
      return;
    }

    this.navigate('home');
    SessionGuard.startHeartbeat();
  },
};

// ==================== LOGIN VIEW ====================
Views.login = {
  // 'login' | 'register' | 'reset'
  _mode: 'login',

  render() {
    const isReg   = this._mode === 'register';
    const isReset = this._mode === 'reset';
    const subtitle = isReset ? t('reset_subtitle')
                   : isReg   ? t('login_subtitle_beta')
                   :           t('login_subtitle');
    const kickedBanner = AppState.sessionKickedMsg ? `
        <div class="login-kicked-banner">⚠️ ${AppState.sessionKickedMsg}</div>` : '';

    // ── Password-reset form (email + original beta code + new password ×2) ──
    if (isReset) {
      return `
      <div class="screen login-screen">
        <div class="login-logo">${Icons.mark()}</div>
        <h1 class="login-title">${BRAND_NAME}</h1>
        <p class="login-subtitle">${subtitle}</p>
        ${kickedBanner}
        <div class="login-form">
          <input type="email" id="r-email" placeholder="${t('reset_email_ph')}"
                 autocomplete="email" inputmode="email" spellcheck="false"
                 autocapitalize="none" />
          <input type="text" id="r-code" placeholder="${t('reset_code_ph')}"
                 autocomplete="off" maxlength="13" spellcheck="false"
                 inputmode="text"
                 oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')" />
          <input type="password" id="r-pass" placeholder="${t('reset_pass_ph')}"
                 autocomplete="new-password" />
          <input type="password" id="r-pass2" placeholder="${t('reset_pass2_ph')}"
                 autocomplete="new-password" />
          <div id="l-msg" class="login-msg hidden"></div>
          <button class="btn-primary" id="l-submit" onclick="Views.login._submit()">
            ${t('reset_submit')}
          </button>
          <button class="btn-link" onclick="Views.login._setMode('login')">
            ${t('reset_back_login')}
          </button>
        </div>
      </div>`;
    }

    // ── Login / Register form ──
    return `
      <div class="screen login-screen">
        <div class="login-logo">${Icons.mark()}</div>
        <h1 class="login-title">${BRAND_NAME}</h1>
        <p class="login-subtitle">${subtitle}</p>
        ${kickedBanner}
        <div class="login-form">
          ${isReg ? `
          <input type="email" id="l-email" placeholder="${t('email_ph')}"
                 autocomplete="email" inputmode="email" />` : `
          <input type="text" id="l-email" placeholder="${t('login_id_ph')}"
                 autocomplete="username" inputmode="text" spellcheck="false"
                 autocapitalize="none" />`}
          ${isReg ? `
          <input type="text" id="l-nick" placeholder="${t('nick_ph')}"
                 autocomplete="off" maxlength="20" spellcheck="false"
                 autocapitalize="none" inputmode="text"
                 oninput="this.value = this.value.replace(/[^A-Za-z0-9_-]/g,'')" />
          <p class="login-beta-hint">${t('nick_hint')}</p>` : ''}
          <input type="password" id="l-pass"
                 placeholder="${t('pass_ph')}"
                 autocomplete="${isReg ? 'new-password' : 'current-password'}" />
          ${isReg ? `
          <input type="text" id="l-code" placeholder="${t('code_ph')}"
                 autocomplete="off" maxlength="13" spellcheck="false"
                 inputmode="text"
                 oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')" />
          <p class="login-beta-hint">${t('code_hint')}</p>` : ''}
          <div id="l-msg" class="login-msg hidden"></div>
          <button class="btn-primary" id="l-submit" onclick="Views.login._submit()">
            ${isReg ? t('sign_up_beta') : t('sign_in')}
          </button>
          ${!isReg ? `
          <button class="btn-link" onclick="Views.login._setMode('reset')">
            ${t('forgot_pass_link')}
          </button>` : ''}

          ${!isReg && GOOGLE_OAUTH_VISIBLE ? `
          <div class="login-divider"><span>${t('oauth_or')}</span></div>

          <input type="text" id="l-code-oauth" placeholder="${t('oauth_code_ph')}"
                 autocomplete="off" maxlength="13" spellcheck="false"
                 inputmode="text"
                 oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')" />
          <p class="login-beta-hint">${t('oauth_code_hint')}</p>
          <button class="btn-google" id="l-google" onclick="Views.login._google()">
            <span class="btn-google__icon">G</span> ${t('oauth_google_btn')}
          </button>` : ''}

          <button class="btn-link" onclick="Views.login._setMode('${isReg ? 'login' : 'register'}')">
            ${isReg ? t('have_account') : t('no_account')}
          </button>
        </div>
      </div>`;
  },

  _setMode(mode) {
    this._mode = mode;
    App.render();
  },

  // Start the Google OAuth flow. The beta code MUST be present first: we stash
  // it in sessionStorage so it survives the redirect to Google and back, then
  // App._oauthGate() claims it server-side once the session lands.
  async _google() {
    const code = document.getElementById('l-code-oauth')?.value.trim().toUpperCase();
    if (!code || code.length < 12) {
      this._msg(t('oauth_need_code'), false);
      return;
    }
    sessionStorage.setItem('pmp_pending_beta_code', code);
    const btn = document.getElementById('l-google');
    if (btn) btn.disabled = true;
    this._msg(t('oauth_redirecting'), true);
    try {
      await Auth.signInWithGoogle();   // browser redirects away on success
    } catch (e) {
      sessionStorage.removeItem('pmp_pending_beta_code');
      if (btn) btn.disabled = false;
      this._msg(e.message || t('generic_error'), false);
    }
  },

  async _submit() {
    const btn = document.getElementById('l-submit');

    // ── reset ──
    if (this._mode === 'reset') {
      const email = document.getElementById('r-email')?.value.trim();
      const code  = document.getElementById('r-code')?.value.trim().toUpperCase();
      const pass  = document.getElementById('r-pass')?.value;
      const pass2 = document.getElementById('r-pass2')?.value;

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) { this._msg(t('reset_email_required'), false); return; }
      if (!code || code.length < 12) { this._msg(t('code_required'), false); return; }
      if (!pass || pass.length < 6) { this._msg(t('reset_pass_short'), false); return; }
      if (pass !== pass2) { this._msg(t('reset_pass_mismatch'), false); return; }

      btn.disabled = true; btn.textContent = '…';
      this._msg(t('reset_verifying'), true);
      try {
        const data = await Auth.resetPassword(email, code, pass);
        if (!data || !data.ok) {
          this._msg((data && data.error) || t('generic_error'), false);
          btn.disabled = false; btn.textContent = t('reset_submit');
          return;
        }
        // Success → bounce back to login and surface the confirmation there.
        this._mode = 'login';
        App.render();
        this._msg(t('reset_ok'), true);
      } catch (e) {
        this._msg(e.message || t('generic_error'), false);
        btn.disabled = false; btn.textContent = t('reset_submit');
      }
      return;
    }

    const email = document.getElementById('l-email')?.value.trim();
    const pass  = document.getElementById('l-pass')?.value;

    if (!email || !pass) { this._msg(t('enter_credentials'), false); return; }

    const registerLabel = t('sign_up_beta');

    if (this._mode === 'register') {
      const nick = document.getElementById('l-nick')?.value.trim();
      if (!nick || !Auth.NICK_RE.test(nick)) { this._msg(t('nick_required'), false); return; }

      const code = document.getElementById('l-code')?.value.trim().toUpperCase();
      if (!code || code.length < 12) { this._msg(t('code_required'), false); return; }

      btn.disabled = true; btn.textContent = '…';
      this._msg(t('register_verifying'), true);

      try {
        const data = await Auth.registerBeta(code, email, pass, nick);
        if (!data || !data.ok) {
          this._msg((data && data.error) || t('generic_error'), false);
          btn.disabled = false; btn.textContent = registerLabel;
          return;
        }
        this._msg(t('register_ok'), true);
        this._mode      = 'login';
        btn.disabled    = false;
        btn.textContent = t('sign_in');
      } catch (e) {
        this._msg(e.message || t('generic_error'), false);
        btn.disabled = false; btn.textContent = registerLabel;
      }
      return;
    }

    // ── login ──
    btn.disabled = true; btn.textContent = '…';
    try {
      await Auth.signIn(email, pass);
      await App.afterAuth();
    } catch (e) {
      this._msg(e.message || t('generic_error'), false);
      btn.disabled = false; btn.textContent = t('sign_in');
    }
  },

  _msg(text, ok) {
    const el = document.getElementById('l-msg');
    if (!el) return;
    el.textContent = text;
    el.className   = `login-msg ${ok ? 'login-msg--ok' : 'login-msg--err'}`;
  },

  init() {
    // The "kicked" notice is shown once; clear it so re-renders (e.g. toggling
    // to the register form) and the next login screen don't keep showing it.
    AppState.sessionKickedMsg = null;
  },
};

// ==================== LOADING VIEW ====================
Views.loading = {
  render() {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    const quote = q[L()] ?? q.pl;
    return `
      <div class="loading-screen">
        <div class="loading-logo">${Icons.mark()}</div>
        <h1>${BRAND_NAME}</h1>
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
    const weekDays   = StreakManager.getWeekDays();
    const readiness  = StatsManager.getReadiness();
    const recommended = StatsManager.getRecommendation(AppState.questions);
    const latestResult = Storage.getHistory().slice(-1)[0];
    const nick = AppState.nick || t('learner');
    const exp = AppState.engagement.careerExp;
    const level = Engagement.levelForExp(exp);

    const streakLabel = streak === 0 ? t('streak_start')
      : streak === 1 ? t('streak_one')
      : streak === 2 ? t('streak_two')
      : streak <= 4  ? t('streak_roll')
      : streak <= 6  ? t('streak_keep')
      : t('streak_fire');

    const streakUnit = streak === 1 ? t('streak_unit_one') : t('streak_unit_many');

    const dayCells = weekDays.map(d => {
      const classes = [
        'streak-day',
        `streak-day--${d.status}`,
        d.isToday ? 'streak-day--today' : '',
      ].filter(Boolean).join(' ');
      return `
        <div class="${classes}">
          <span class="streak-day__label">${d.dayShort}</span>
          <div class="streak-day__circle"></div>
          <span class="streak-day__num">${d.dayNum}</span>
        </div>`;
    }).join('');

    const syncLabel = { idle: '', syncing: '⟳ sync…', ok: '', error: '⚠ offline' }[AppState.syncStatus] || '';
    const remaining = readiness.state === 'calibrating' ? Math.max(0, readiness.required - readiness.answered) : 0;
    const planIsDaily = !dailyDone;
    const planIsAdaptive = dailyDone && !!recommended;
    const planLabel = planIsDaily ? t('daily_challenge') : planIsAdaptive ? t('adaptive_training') : t('quick_quiz');
    const planText = planIsDaily ? t('plan_daily') : planIsAdaptive ? t('plan_adaptive') : t('quick_quiz_sub');
    const planClick = planIsDaily
      ? "App.navigate('daily-start')"
      : planIsAdaptive
        ? `Views['mode-select']._applyTraining('${recommended.dimension}', '${recommended.key}')`
        : "App.navigate('mode-select')";

    return `
      <div class="screen home">
        <div class="home-topbar">
          <div class="home-identity">
            <span>${BRAND_NAME}</span>
            <strong>${t('welcome_back', { nick })}</strong>
            <small class="career-level">${t('level', { n: level })} · ${t('career_exp', { n: exp })}</small>
          </div>
          <button class="btn-settings" onclick="Views.home._openSettings()" title="${t('settings')}" aria-label="${t('settings')}">${Icons.settings()}</button>
        </div>
        ${syncLabel ? `<div class="sync-indicator sync-indicator--${AppState.syncStatus}">${syncLabel}</div>` : ''}
        <div id="pwa-install-banner"></div>
        <section class="readiness-card">
          <div>
            <p class="card-eyebrow">${t('readiness_title')}</p>
            ${readiness.state === 'ready'
              ? `<div class="readiness-score">${readiness.score}<span>%</span></div>
                 ${readiness.weakest ? `<p class="readiness-weak">${t('weakest_area')}: <strong>${tEcoDomain(readiness.weakest.key)}</strong></p>` : ''}`
              : `<h2>${t('calibrating')}</h2><p class="readiness-calibrating">${t('calibrating_more', { n: remaining })}</p>`}
          </div>
          ${readiness.state === 'ready' ? `<div class="readiness-ring" style="--score:${readiness.score}">${readiness.score}%</div>` : ''}
          <p class="readiness-disclaimer">${t('readiness_disclaimer')}</p>
        </section>
        <section class="today-plan-card">
          <p class="card-eyebrow">${t('today_plan')}</p>
          <h2>${planLabel}</h2>
          <p>${planText}</p>
          <button class="btn-primary" onclick="${planClick}">${planLabel}</button>
        </section>
        <div class="metric-grid">
          <section class="metric-card">
            <p>${t('streak_metric')}</p>
            <strong>${streak} ${streakUnit}</strong>
            <small>${streakLabel}</small>
          </section>
          <section class="metric-card">
            <p>${t('latest_result')}</p>
            <strong>${latestResult ? `${latestResult.percent}%` : '—'}</strong>
            <small>${latestResult ? latestResult.date : t('no_result')}</small>
          </section>
        </div>
        <div class="streak-widget streak-widget--compact"><div class="streak-week">${dayCells}</div></div>
        <div class="menu">
          ${recommended ? `
          <div class="recommended-training">
            <div class="recommended-training__title">${t('recommended_training')}</div>
            <div class="recommended-training__area">${labelForSegment(recommended.dimension, recommended.key)}</div>
            <div class="recommended-training__score">${recommended.percent}% · ${recommended.total} ${t('responses')}</div>
            <button class="btn-primary" onclick="Views['mode-select']._applyTraining('${recommended.dimension}', '${recommended.key}')">${t('practice_10')}</button>
          </div>` : ''}
          <button class="menu-btn" onclick="App.navigate('mode-select')">
            <span class="menu-btn__icon">${Icons.training()}</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">${t('quick_quiz')}</div>
              <div class="menu-btn__sub">${t('quick_quiz_sub')}</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
          <button class="menu-btn" onclick="App.navigate('trial-setup')">
            <span class="menu-btn__icon">${Icons.exam()}</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">${t('trial_title')}</div>
              <div class="menu-btn__sub">${t('trial_menu_sub')}</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
          <button class="menu-btn" onclick="App.navigate('stats')">
            <span class="menu-btn__icon">${Icons.stats()}</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">${t('progress_title')}</div>
              <div class="menu-btn__sub">${t('your_progress')}</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
        </div>
        ${appNav('home')}
        <div class="app-version">${APP_VERSION}</div>
      </div>`;
  },

  _openSettings() {
    const settings = Storage.getSettings();
    const el = document.createElement('div');
    el.id = 'settings-modal';
    el.className = 'settings-modal';
    el.innerHTML = `
      <div class="settings-modal__card" role="dialog" aria-modal="true" aria-label="${t('settings')}">
        <div class="settings-modal__header">
          <span>${t('settings')}</span>
          <button class="settings-modal__close" onclick="Views.home._closeSettings()" aria-label="${t('close')}">✕</button>
        </div>
        <section class="settings-group">
          <h3 class="settings-group__title">${t('settings_learning')}</h3>
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">${Icons.confidence()}</span>
            <div>
              <div class="settings-row__label">${t('confidence_label')}</div>
              <div class="settings-row__desc">${t('confidence_desc')}</div>
            </div>
          </div>
          <label class="settings-toggle" aria-label="${t('confidence_aria')}">
            <input type="checkbox" id="confidence-toggle"
                   ${settings.confidenceEnabled ? 'checked' : ''}
                   onchange="Views.home._toggleConfidence(this.checked)">
            <span class="settings-toggle__slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">${Icons.scroll()}</span>
            <div>
              <div class="settings-row__label">${t('auto_scroll_label')}</div>
              <div class="settings-row__desc">${t('auto_scroll_desc')}</div>
            </div>
          </div>
          <label class="settings-toggle" aria-label="${t('auto_scroll_aria')}">
            <input type="checkbox" id="autoscroll-toggle"
                   ${settings.autoScrollEnabled !== false ? 'checked' : ''}
                   onchange="Views.home._toggleAutoScroll(this.checked)">
            <span class="settings-toggle__slider"></span>
          </label>
        </div>
        </section>
        <section class="settings-group">
          <h3 class="settings-group__title">${t('settings_display')}</h3>
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">${Icons.language()}</span>
            <div>
              <div class="settings-row__label">${t('app_language')}</div>
              <div class="settings-row__desc">${t('app_language_desc')}</div>
            </div>
          </div>
          <div class="lang-pill-toggle">
            <button class="btn-lang-opt ${settings.defaultLanguage === 'en' ? '' : 'active'}"
                    onclick="Views.home._setLang('pl')">PL</button>
            <button class="btn-lang-opt ${settings.defaultLanguage === 'en' ? 'active' : ''}"
                    onclick="Views.home._setLang('en')">EN</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">${Icons.theme()}</span>
            <div>
              <div class="settings-row__label">${t('theme')}</div>
              <div class="settings-row__desc">${t('theme_desc')}</div>
            </div>
          </div>
          <div class="theme-pill-toggle">
            <button class="btn-theme-opt ${settings.theme === 'light' ? 'active' : ''}"
                    onclick="Views.home._setTheme('light')">${t('theme_light')}</button>
            <button class="btn-theme-opt ${settings.theme === 'auto' ? 'active' : ''}"
                    onclick="Views.home._setTheme('auto')">${t('theme_auto')}</button>
            <button class="btn-theme-opt ${settings.theme === 'dark' ? 'active' : ''}"
                    onclick="Views.home._setTheme('dark')">${t('theme_dark')}</button>
          </div>
        </div>
        </section>
        <section class="settings-group">
          <h3 class="settings-group__title">${t('settings_privacy')}</h3>
          <div class="settings-row">
            <div class="settings-row__info">
              <span class="settings-row__icon">${Icons.ranking()}</span>
              <div>
                <div class="settings-row__label">${t('leaderboard_visible')}</div>
                <div class="settings-row__desc">${t('leaderboard_desc')}</div>
              </div>
            </div>
            <label class="settings-toggle" aria-label="${t('leaderboard_visible')}">
              <input type="checkbox" id="leaderboard-toggle"
                     ${AppState.engagement.leaderboardVisible ? 'checked' : ''}
                     onchange="Views.home._toggleLeaderboard(this.checked)">
              <span class="settings-toggle__slider"></span>
            </label>
          </div>
          <a class="settings-action-btn settings-action-btn--link"
             href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">${t('privacy_policy')}</a>
        </section>
        <section class="settings-group">
          <h3 class="settings-group__title">${t('settings_account')}</h3>
        <button class="settings-action-btn settings-action-btn--danger"
                 onclick="Views.home._logout()">${t('sign_out')}</button>
        </section>
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
    SupabaseSync.pushProgress().catch(console.error);
  },

  _toggleAutoScroll(enabled) {
    const s = Storage.getSettings();
    s.autoScrollEnabled = enabled;
    Storage.saveSettings(s);
    SupabaseSync.pushProgress().catch(console.error);
  },

  _setLang(lang) {
    const s = Storage.getSettings();
    s.defaultLanguage = lang;
    Storage.saveSettings(s);
    // Keep the live EN/PL state in sync with the new global preference
    AppState.showEnglish = (lang === 'en');
    SupabaseSync.pushProgress().catch(console.error);
    // Re-render the whole view behind the modal (so the entire UI switches language),
    // then reopen the modal so its labels + active button reflect the change
    Views.home._closeSettings();
    App.render();
    Views.home._openSettings();
  },

  _setTheme(theme) {
    const s = Storage.getSettings();
    s.theme = theme;
    Storage.saveSettings(s);
    ThemeManager.apply(theme);
    SupabaseSync.pushProgress().catch(console.error);
    Views.home._closeSettings();
    Views.home._openSettings();
  },

  async _toggleLeaderboard(visible) {
    const toggle = document.getElementById('leaderboard-toggle');
    if (toggle) toggle.disabled = true;
    try {
      await EngagementSync.setVisibility(visible);
      Views.home._closeSettings();
      App.render();
      Views.home._openSettings();
    } catch (error) {
      console.warn('leaderboard visibility failed:', error);
      if (toggle) {
        toggle.checked = !visible;
        toggle.disabled = false;
      }
      alert(t('leaderboard_error'));
    }
  },

  async _logout() {
    Views.home._closeSettings();
    if (!confirm(t('sign_out_confirm'))) return;
    SessionGuard.clearLocalToken();
    await Auth.signOut();
    App.navigate('login');
  },

  // ---- Trial Exam — modal wznowienia niedokończonego egzaminu (plan 12) ----
  _promptTrialResume() {
    document.getElementById('trial-resume-modal')?.remove();
    const el = document.createElement('div');
    el.id = 'trial-resume-modal';
    el.className = 'settings-modal';
    el.innerHTML = `
      <div class="settings-modal__card" role="dialog" aria-modal="true" aria-label="${t('trial_resume_title')}">
        <div class="settings-modal__header"><span>${t('trial_resume_title')}</span></div>
        <p class="trial-resume__sub">${t('trial_resume_sub')}</p>
        <div class="summary__actions" style="margin-top:8px">
          <button class="btn-secondary" onclick="Views.home._discardTrialResume()">${t('trial_discard')}</button>
          <button class="btn-primary" style="flex:1" onclick="Views.home._doTrialResume()">${t('trial_resume')}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  },
  _doTrialResume() {
    document.getElementById('trial-resume-modal')?.remove();
    App.navigate('trial');
  },
  _discardTrialResume() {
    document.getElementById('trial-resume-modal')?.remove();
    AppState.quizSession = null;
    Storage.clearTrialSession();
  },

  init() {
    // PWA install banner placeholder — no-op until install prompt logic is implemented
  },
};

// ==================== MODE SELECT VIEW ====================
Views['mode-select'] = {
  _selectedMode: 'quick',
  _preset: 'all',
  _count: 10,
  _advanced: false,
  _filters: emptyFilters(),

  render() {
    const domains    = [...new Set(AppState.questions.map(q => q.domain).filter(Boolean))].sort();
    const weakCount  = QuizEngine.countWeakQuestions(AppState.questions);
    // FIX #5 — odblokuj po ukończeniu DOWOLNEGO quizu, nie po 10 błędach
    // FIX #6 — karta zawsze widoczna; wyblakła (disabled) gdy nie ma czego grać:
    //          albo brak ukończonego quizu, albo 0 słabych pytań do powtórki.
    const neverPlayed  = !Storage.hasCompletedAnyQuiz();
    const weakDisabled = neverPlayed || weakCount === 0;
    const available = QuizEngine.countAvailable(AppState.questions, this._selectedMode, this._filters);
    const renderChips = (axis, values, labelFn) => values.map(value => `
      <button class="domain-chip ${this._filters[axis].includes(value) ? 'selected' : ''}"
              onclick="Views['mode-select']._toggleFilter('${axis}', '${value}')">${labelFn(value)}</button>`).join('');

    let weakSubtitle;
    if (neverPlayed)      weakSubtitle = t('weak_locked');
    else if (weakCount === 0) weakSubtitle = t('weak_none');
    else                  weakSubtitle = t('weak_count', { n: weakCount });

    return `
      <div class="screen mode-select">
        <h2>${t('quick_quiz')}</h2>
        <div class="mode-card ${this._selectedMode === 'quick' ? 'selected' : ''}">
          <h3>${t('standard_quiz')}</h3>
          <p>${t('standard_quiz_desc')}</p>
          <div class="preset-chips">
            <button class="preset-chip ${this._preset === 'all' && this._selectedMode === 'quick' ? 'selected' : ''}" onclick="Views['mode-select']._setPreset('all')">${t('preset_all')}</button>
            <button class="preset-chip ${this._preset === 'agile' ? 'selected' : ''}" onclick="Views['mode-select']._setPreset('agile')">Agile</button>
            <button class="preset-chip ${this._preset === 'calculation' ? 'selected' : ''}" onclick="Views['mode-select']._setPreset('calculation')">${t('preset_calculation')}</button>
            <button class="preset-chip ${this._selectedMode === 'weak' ? 'selected' : ''} ${weakDisabled ? 'disabled' : ''}"
                    ${weakDisabled ? 'disabled' : "onclick=\"Views['mode-select']._setPreset('weak')\""}>${t('weak_questions')}</button>
          </div>
          <button class="filters-toggle" onclick="Views['mode-select']._toggleAdvanced()">${t('customize_scope')} ${this._advanced ? '▲' : '▼'}</button>
          ${this._advanced ? `
          <div class="filters-advanced">
            <div class="filter-section"><label>${t('filter_eco')}</label><div class="domain-chips">${renderChips('ecoDomains', Object.keys(ECO_I18N), tEcoDomain)}</div></div>
            <div class="filter-section"><label>${t('filter_approach')}</label><div class="domain-chips">${renderChips('approachTags', Object.keys(APPROACH_I18N), tApproach)}</div></div>
            <div class="filter-section"><label>${t('filter_domains')}</label><div class="domain-chips">${renderChips('domains', domains, tDomain)}</div></div>
            <div class="filter-section"><label>${t('filter_qtype')}</label><div class="domain-chips">${renderChips('qtypes', Object.keys(QTYPE_I18N), tQtype)}</div></div>
            <div class="filter-section"><label>${t('filter_difficulty')}</label><div class="domain-chips">${renderChips('difficulties', Object.keys(DIFFICULTY_I18N), tDifficulty)}</div></div>
          </div>` : ''}
        </div>
        <p class="weak-status">${weakSubtitle}</p>
        ${this._selectedMode === 'quick' ? `
        <div class="question-count">
          <label>${t('count_label')}</label>
          <div class="preset-chips">${[10, 20, 30].map(count => `<button class="preset-chip ${this._count === count ? 'selected' : ''}" onclick="Views['mode-select']._setCount(${count})">${count}</button>`).join('')}</div>
        </div>` : ''}
        <div class="filter-count ${this._selectedMode === 'quick' && available < this._count ? 'filter-count--warning' : ''}">${t('available_count', { n: available })}</div>
        <button class="btn-primary" style="margin-top:8px"
                ${this._selectedMode === 'quick' && available < this._count ? 'disabled' : ''}
                onclick="Views['mode-select']._startQuiz()">
          ${t('start')}
        </button>
        <button class="btn-gray" onclick="App.navigate('home')">${t('back')}</button>
        ${appNav('training')}
      </div>`;
  },

  _setPreset(preset) {
    this._preset = preset;
    this._filters = emptyFilters();
    this._selectedMode = preset === 'weak' ? 'weak' : 'quick';
    if (preset === 'agile') this._filters.approachTags = ['agile'];
    if (preset === 'calculation') this._filters.qtypes = ['calculation'];
    App.render();
  },

  _toggleAdvanced() { this._advanced = !this._advanced; App.render(); },

  _toggleFilter(axis, value) {
    this._selectedMode = 'quick';
    this._preset = 'custom';
    const selected = this._filters[axis];
    const idx = selected.indexOf(value);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push(value);
    App.render();
  },

  _setCount(count) { this._count = count; App.render(); },

  _applyTraining(dimension, key) {
    this._selectedMode = 'quick';
    this._preset = 'custom';
    this._count = 10;
    this._advanced = true;
    this._filters = filterForSegment(dimension, key);
    App.navigate('mode-select');
  },

  _startQuiz() {
    if (this._selectedMode === 'weak' && QuizEngine.countWeakQuestions(AppState.questions) === 0) {
      alert(t('weak_alert'));
      return;
    }
    const available = QuizEngine.countAvailable(AppState.questions, this._selectedMode, this._filters);
    if (this._selectedMode === 'quick' && available < this._count) {
      alert(t('pool_too_small', { n: available }));
      return;
    }
    const recentlyShown = AppState.quizSession?.recentlyShown || [];
    const questions = QuizEngine.selectQuestions(
      AppState.questions, this._selectedMode, this._filters, recentlyShown, this._count
    );
    if (!questions.length) {
      alert(t('no_questions_filter'));
      return;
    }
    AppState.quizSession = { sessionId: newSessionId(), questions, current: 0, answers: [], mode: this._selectedMode, filters: this._filters, shuffledMap: {}, recentlyShown: [], currentAnswer: null, readinessBefore: StatsManager.getReadiness() };
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
      alert(t('load_fail'));
      App.navigate('home');
      return;
    }
    const questions = QuizEngine.selectQuestions(AppState.questions, 'daily');
    AppState.quizSession = { sessionId: newSessionId(), questions, current: 0, answers: [], mode: 'daily', shuffledMap: {}, recentlyShown: [], currentAnswer: null, readinessBefore: StatsManager.getReadiness() };
    App.navigate('quiz');
  },
};

// ==================== TRIAL EXAM (plan 12) ====================
// Format H:MM:SS (lub MM:SS gdy < 1h) — używany na ekranie wyników egzaminu.
function fmtHMS(totalSec) {
  totalSec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ---- Widok wyboru długości egzaminu ----
Views['trial-setup'] = {
  _variant: 'full',

  render() {
    const cards = TRIAL_VARIANTS.map(v => `
      <div class="trial-variant ${this._variant === v.id ? 'selected' : ''}"
           onclick="Views['trial-setup']._pick('${v.id}')">
        <div class="trial-variant__q">${v.questions}</div>
        <div class="trial-variant__label">${t('trial_questions')}</div>
        <div class="trial-variant__time">⏱ ${v.minutes} ${t('trial_min')}</div>
      </div>`).join('');
    return `
      <div class="screen trial-setup">
        <h2>${t('trial_title')}</h2>
        <p class="trial-intro">${t('trial_intro')}</p>
        <div class="trial-variants">${cards}</div>
        <button class="btn-primary" onclick="Views['trial-setup']._start()">${t('trial_start')}</button>
        <button class="btn-gray" onclick="App.navigate('home')">${t('back')}</button>
      </div>`;
  },

  _pick(id) { this._variant = id; App.render(); },

  _start() {
    const v = trialVariant(this._variant);
    if (AppState.questions.length < v.questions) { alert(t('trial_not_enough')); return; }
    const questions = QuizEngine.selectTrialQuestions(AppState.questions, v.questions);
    const now = Date.now();
    AppState.quizSession = {
      sessionId: newSessionId(),
      mode: 'trial', variant: v.id, questions,
      shuffledMap: {}, answers: Array(v.questions).fill(null),
      flags: Array(v.questions).fill(false), current: 0,
      startedAt: now, endsAt: now + v.minutes * 60000, durationSec: v.minutes * 60,
    };
    Storage.saveTrialSession(AppState.quizSession);
    App.navigate('trial');
  },

  init() {},
};

// ---- Runner egzaminu ----
Views.trial = {
  _tick: null,  // uchwyt setInterval

  render() {
    const s = AppState.quizSession;
    if (!s || s.mode !== 'trial') { App.navigate('home'); return ''; }
    const i = s.current;
    const q = s.questions[i];
    if (!s.shuffledMap[i]) s.shuffledMap[i] = QuizEngine.shuffleAnswers(q);
    const map = s.shuffledMap[i];
    const showEn = AppState.showEnglish;
    const hasEn  = !!(q.question_en && map.displayAnswers_en[0]);
    const displayAnswers = (showEn && hasEn) ? map.displayAnswers_en : map.displayAnswers_pl;
    const questionText   = (showEn && hasEn) ? q.question_en : q.question;
    const letters = ['A', 'B', 'C', 'D'];
    const selected = s.answers[i];

    const answerBtns = displayAnswers.map((text, idx) => `
      <button class="answer-btn ${selected === idx ? 'selected' : ''}" data-index="${idx}"
              onclick="Views.trial._select(${idx})">
        <span class="letter">${letters[idx]}</span><span>${text}</span>
      </button>`).join('');

    const langToggle = (hasEn && AppState.isTester) ? `
      <button class="btn-lang-toggle" onclick="Views.trial._toggleLang()"
              title="${showEn ? 'PL' : 'EN'}" aria-label="${showEn ? 'PL' : 'EN'}">${showEn ? '🇵🇱' : '🇬🇧'}</button>` : '';

    return `
      <div class="screen trial">
        <div class="trial-header">
          <button class="quiz-abandon" onclick="Views.trial._abandon()" title="${t('trial_abandon')}">✕</button>
          <span class="trial-timer" id="trial-timer">--:--</span>
          <div class="trial-header__right">
            ${AppState.canReportBugs ? `<button class="quiz-report-btn" onclick="Views.trial._report()" title="${t('report_title')}">🚩</button>` : ''}
            ${langToggle}
            <button class="trial-flag ${s.flags[i] ? 'active' : ''}" onclick="Views.trial._toggleFlag()" title="${t('trial_flag')}">⚑︎</button>
          </div>
        </div>
        <div class="trial-subbar">
          <span class="trial-counter">${i + 1} / ${s.questions.length}</span>
          ${q.domain ? `<span class="quiz-domain">${tDomain(q.domain)}</span>` : ''}
          <button class="trial-palette-btn" onclick="Views.trial._togglePalette()">${t('trial_palette')}</button>
        </div>
        <div class="quiz-question">${questionText}</div>
        <div class="quiz-answers" id="quiz-answers">${answerBtns}</div>
        <div class="trial-nav">
          <button class="btn-secondary" ${i === 0 ? 'disabled' : ''} onclick="Views.trial._prev()">${t('trial_prev')}</button>
          ${i === s.questions.length - 1
            ? `<button class="btn-primary" onclick="Views.trial._confirmFinish()">${t('trial_finish')}</button>`
            : `<button class="btn-primary" onclick="Views.trial._next()">${t('trial_next')}</button>`}
        </div>
        <div id="trial-palette" class="trial-palette hidden"></div>
      </div>`;
  },

  _select(idx) {
    const s = AppState.quizSession;
    s.answers[s.current] = idx;
    Storage.saveTrialSession(s);
    document.querySelectorAll('.answer-btn').forEach((b, k) =>
      b.classList.toggle('selected', k === idx));

    if (Storage.getSettings().autoScrollEnabled) {
      setTimeout(() => {
        const nav = document.querySelector('.trial-nav');
        if (nav) {
          nav.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      }, 100);
    }
  },

  _toggleFlag() {
    const s = AppState.quizSession;
    s.flags[s.current] = !s.flags[s.current];
    Storage.saveTrialSession(s);
    document.querySelector('.trial-flag')?.classList.toggle('active', s.flags[s.current]);
  },

  _prev() { const s = AppState.quizSession; if (s.current > 0) { s.current--; Storage.saveTrialSession(s); App.navigate('trial'); } },
  _next() { const s = AppState.quizSession; if (s.current < s.questions.length - 1) { s.current++; Storage.saveTrialSession(s); App.navigate('trial'); } },
  _jump(i) { const s = AppState.quizSession; s.current = i; Storage.saveTrialSession(s); App.navigate('trial'); },

  // W egzaminie nie ma panelu wyjaśnień, więc bezpiecznie przerysowujemy cały widok:
  // wybrana odpowiedź i flaga są trzymane w sesji, więc nic nie giniemy.
  _toggleLang() { AppState.showEnglish = !AppState.showEnglish; App.navigate('trial'); },

  _report() {
    const s = AppState.quizSession;
    if (s) ReportModal.open(s.questions[s.current]);
  },

  // ---- Paleta pytań ----
  _renderPalette() {
    const s = AppState.quizSession;
    const cells = s.questions.map((_, i) => {
      const cls = [
        'trial-pcell',
        s.answers[i] !== null ? 'answered' : 'empty',
        s.flags[i] ? 'flagged' : '',
        i === s.current ? 'current' : '',
      ].filter(Boolean).join(' ');
      return `<button class="${cls}" onclick="Views.trial._jump(${i})">${i + 1}</button>`;
    }).join('');
    return `<div class="trial-palette__grid">${cells}</div>`;
  },

  _togglePalette(forceClose) {
    const el = document.getElementById('trial-palette');
    if (!el) return;
    if (forceClose === true) { el.classList.add('hidden'); return; }
    const willShow = el.classList.contains('hidden');
    if (willShow) {
      el.innerHTML = this._renderPalette();
      el.classList.remove('hidden');
      // Przewiń do świeżo otwartej palety pytań.
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else {
      el.classList.add('hidden');
    }
  },

  // ---- Timer (odliczanie + auto-finalizacja) ----
  _startTimer() {
    this._stopTimer();          // nigdy nie stackuj interwałów
    this._renderTime();         // natychmiastowy render
    this._tick = setInterval(() => this._renderTime(), 1000);
  },
  _stopTimer() { if (this._tick) { clearInterval(this._tick); this._tick = null; } },
  _renderTime() {
    const s = AppState.quizSession;
    if (!s || s.mode !== 'trial') { this._stopTimer(); return; }
    const leftMs = s.endsAt - Date.now();
    const el = document.getElementById('trial-timer');
    if (leftMs <= 0) { this._stopTimer(); this._autoSubmit(); return; }
    const sec = Math.floor(leftMs / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    if (el) {
      el.textContent = `${mm}:${ss}`;
      el.classList.toggle('trial-timer--warn', leftMs <= 5 * 60000); // ostatnie 5 min
    }
  },
  _autoSubmit() { this._finish(/* timedOut */ true); },

  // ---- Zakończenie egzaminu ----
  _confirmFinish() {
    const s = AppState.quizSession;
    const unanswered = s.answers.filter(a => a === null).length;
    const flagged    = s.flags.filter(Boolean).length;
    this._openConfirm({
      message: t('trial_confirm', { un: unanswered, fl: flagged }),
      confirmLabel: t('trial_finish'),
      onConfirm: () => this._finish(false),
    });
  },

  _abandon() {
    this._openConfirm({
      message: t('trial_abandon_confirm'),
      confirmLabel: t('trial_abandon'),
      danger: true,
      onConfirm: () => {
        this._stopTimer();
        AppState.quizSession = null;
        Storage.clearTrialSession();
        App.navigate('home');
      },
    });
  },

  // Natywny (in-app) modal potwierdzenia — zamiast systemowego confirm().
  _openConfirm({ message, confirmLabel, cancelLabel, danger, onConfirm }) {
    document.getElementById('trial-confirm-modal')?.remove();
    const el = document.createElement('div');
    el.id = 'trial-confirm-modal';
    el.className = 'settings-modal';
    el.innerHTML = `
      <div class="settings-modal__card" role="dialog" aria-modal="true">
        <p class="trial-confirm__msg">${message}</p>
        <div class="summary__actions" style="margin-top:8px">
          <button class="btn-secondary" id="trial-confirm-cancel">${cancelLabel || t('cancel')}</button>
          <button class="btn-primary${danger ? ' trial-confirm__danger' : ''}" style="flex:1" id="trial-confirm-ok">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('#trial-confirm-cancel').onclick = close;
    el.querySelector('#trial-confirm-ok').onclick = () => { close(); onConfirm(); };
    el.addEventListener('click', e => { if (e.target === el) close(); });
  },

  _finish(timedOut) {
    this._stopTimer();
    const s = AppState.quizSession;
    if (!s) { App.navigate('home'); return; }

    let correct = 0;
    const answerRecords = [];
    const review = [];               // pełny przegląd na ekran wyników
    s.questions.forEach((q, i) => {
      const map = s.shuffledMap[i] || QuizEngine.shuffleAnswers(q);
      const sel = s.answers[i];
      const isCorrect = sel !== null && sel === map.correctDisplayIndex;
      if (isCorrect) correct++;
      // egzamin zasila „moje słabe pytania" (bez confidence)
      QuizEngine.recordAnswer(q.id, isCorrect, null);
      answerRecords.push(QuizEngine.answerRecord(q, isCorrect));
      review.push({ i, q, map, sel, isCorrect, flagged: s.flags[i] });
    });

    const total   = s.questions.length;
    const percent = Math.round((correct / total) * 100);
    const domainResults = QuizEngine.buildDomainResults(answerRecords);
    const breakdowns = QuizEngine.buildBreakdowns(answerRecords);
    const timeLeftSec = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
    const rating = trialRating(percent);

    const result = {
      date: TODAY(), mode: 'trial', correct, total, percent, domainResults, breakdowns,
      examLength: total, durationSec: s.durationSec, timeLeftSec, timedOut, rating,
    };
    Storage.saveResult(result);              // trafia do quiz_history (i sync do chmury)
    StreakManager.markActivityDone();        // egzamin to aktywność, NIE daily
    SupabaseSync.saveQuizSession({
      mode: 'trial', correct, total, percent, domainResults, breakdowns,
      examLength: total, durationSec: s.durationSec, timeLeftSec, rating,
    }).catch(console.error);
    SupabaseSync.pushProgress().catch(console.error);

    const award = { sessionId: s.sessionId || newSessionId(), mode: 'trial', correct, total };
    AppState.trialResult = { ...result, review, rewardPending: true };
    AppState.quizSession = null;
    Storage.clearTrialSession();
    App.navigate('trial-result');
    EngagementSync.award(award).then(reward => {
      if (!AppState.trialResult) return;
      AppState.trialResult.reward = reward;
      AppState.trialResult.rewardPending = false;
      if (App.currentView === 'trial-result') App.render();
    }).catch(error => {
      console.warn('trial reward pending retry:', error);
      if (App.currentView === 'trial-result') App.render();
    });
  },

  init() {
    const s = AppState.quizSession;
    if (!s || s.mode !== 'trial') return;
    this._startTimer();
  },
};

// ---- Ekran wyniku egzaminu + przegląd ----
Views['trial-result'] = {
  render() {
    const r = AppState.trialResult;
    if (!r) { App.navigate('home'); return ''; }
    const showEn = AppState.showEnglish;
    const letters = ['A', 'B', 'C', 'D'];
    const ratingLabel = t('rating_' + r.rating);
    const usedSec = (r.durationSec || 0) - (r.timeLeftSec || 0);
    const anyEn = r.review.some(it => it.q.question_en && it.map.displayAnswers_en[0]);

    const langToggle = (anyEn && AppState.isTester) ? `
      <button class="btn-lang-toggle" onclick="Views['trial-result']._toggleLang()"
              title="${showEn ? 'PL' : 'EN'}" aria-label="${showEn ? 'PL' : 'EN'}">${showEn ? '🇵🇱' : '🇬🇧'}</button>` : '';

    const domainBars = (r.domainResults || []).slice().sort((a, b) => a.percent - b.percent).map(d => `
      <div class="domain-bar">
        <span class="domain-bar__name">${tDomain(d.domain)}</span>
        <div class="domain-bar__track"><div class="domain-bar__fill" style="width:0%" data-target="${d.percent}"></div></div>
        <span class="domain-bar__pct">${d.percent}%</span>
      </div>`).join('');
    const ecoBars = (r.breakdowns?.ecoDomain || []).slice().sort((a, b) => a.percent - b.percent).map(item => `
      <div class="domain-bar">
        <span class="domain-bar__name">${tEcoDomain(item.key)}</span>
        <div class="domain-bar__track"><div class="domain-bar__fill" style="width:0%" data-target="${item.percent}"></div></div>
        <span class="domain-bar__pct">${item.percent}%</span>
      </div>`).join('');

    const reviewItems = r.review.map(item => {
      const { i, q, map, sel, isCorrect, flagged } = item;
      const hasEn = !!(q.question_en && map.displayAnswers_en[0]);
      const useEn = showEn && hasEn;
      const displayAnswers = useEn ? map.displayAnswers_en : map.displayAnswers_pl;
      const qText    = useEn ? q.question_en : q.question;
      const explText = useEn ? (q.explanation_en || q.explanation) : q.explanation;
      const correctIdx = map.correctDisplayIndex;

      const yourAnsHtml = sel === null
        ? `<span class="trial-review__none">${t('trial_unanswered')}</span>`
        : `<span class="trial-review__ans trial-review__ans--${isCorrect ? 'correct' : 'you'}">${isCorrect ? '✓' : '✗'} ${letters[sel]}. ${displayAnswers[sel]}</span>`;
      const correctAnsHtml = (sel === null || !isCorrect) ? `
        <div class="trial-review__row">
          <span class="trial-review__lbl">${t('correct_answer')}:</span>
          <span class="trial-review__ans trial-review__ans--correct">✓ ${letters[correctIdx]}. ${displayAnswers[correctIdx]}</span>
        </div>` : '';
      const reportBtn = AppState.canReportBugs
        ? `<button class="trial-review__report" onclick="Views['trial-result']._report(${i})" title="${t('report_title')}">🚩</button>` : '';

      return `
        <div class="trial-review__item ${isCorrect ? 'is-correct' : 'is-wrong'}">
          <div class="trial-review__head">
            <span class="trial-review__num">${i + 1}${flagged ? ' <span class="trial-review__flag">⚑︎</span>' : ''}</span>
            ${quizTagsHtml(q)}
            ${reportBtn}
          </div>
          <div class="trial-review__q">${qText}</div>
          <div class="trial-review__row">
            <span class="trial-review__lbl">${t('your_answer')}:</span>
            ${yourAnsHtml}
          </div>
          ${correctAnsHtml}
          ${explText ? `<p class="trial-review__expl">${explText}</p>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="screen trial-result">
        <div class="trial-result__head">
          <div style="flex:1"></div>
          ${langToggle}
        </div>
        <h2 class="trial-result__title">${t('trial_result_title')}</h2>
        ${r.timedOut ? `<div class="trial-timedout">${t('trial_timed_out')}</div>` : ''}
        <div class="trial-result__score trial-rating--${r.rating}">
          <div class="trial-result__num">${r.correct}/${r.total}</div>
          <div class="trial-result__pct">${r.percent}%</div>
          <div class="trial-result__rating">${ratingLabel}</div>
        </div>
        <p class="trial-result__disclaimer">${t('trial_rating_disclaimer')}</p>
        ${r.reward?.awarded_exp ? `<div class="exp-reward">${t('exp_awarded', { n: r.reward.awarded_exp })}</div>` : r.rewardPending ? `<p class="reward-pending">${t('reward_pending')}</p>` : ''}
        <div class="trial-result__time">${t('trial_time_used')}: <strong>${fmtHMS(usedSec)}</strong> ${t('trial_time_of')} ${fmtHMS(r.durationSec)}</div>
        ${ecoBars ? `<div class="stats-card"><h3>${t('tab_ecoDomain')}</h3>${ecoBars}</div>` : ''}
        ${domainBars ? `<div class="stats-card"><h3>${t('trial_domains_title')}</h3>${domainBars}</div>` : ''}
        <div class="summary__actions">
          <button class="btn-secondary" onclick="App.navigate('home')">${t('back_to_menu')}</button>
          <button class="btn-primary" style="flex:1" onclick="App.navigate('trial-setup')">${t('trial_new_exam')}</button>
        </div>
        <button class="btn-secondary trial-show-answers" id="trial-show-answers"
                onclick="Views['trial-result']._toggleAnswers()">${t('trial_show_answers')}</button>
        <div id="trial-answers" class="trial-answers hidden">
          <div class="stats-card">
            <h3>${t('trial_review_title')}</h3>
            <div class="trial-review">${reviewItems}</div>
          </div>
        </div>
      </div>`;
  },

  _report(i) {
    const r = AppState.trialResult;
    if (r && r.review[i]) ReportModal.open(r.review[i].q);
  },

  // Przegląd pytań jest domyślnie ukryty (plan UX) — odsłaniany przyciskiem.
  _toggleAnswers() {
    const box = document.getElementById('trial-answers');
    const btn = document.getElementById('trial-show-answers');
    if (!box) return;
    const show = box.classList.contains('hidden');
    box.classList.toggle('hidden', !show);
    if (btn) btn.textContent = show ? t('trial_hide_answers') : t('trial_show_answers');
    if (show) requestAnimationFrame(() => box.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  },

  // Jeden przełącznik dla testerów — przerysowuje cały przegląd w drugim języku.
  _toggleLang() { AppState.showEnglish = !AppState.showEnglish; App.navigate('trial-result'); },

  init() {
    setTimeout(() => {
      document.querySelectorAll('.trial-result .domain-bar__fill[data-target]').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    }, 100);
    const r = AppState.trialResult;
    if (!r) return;
    // Konfetti + odznaki tylko raz na wynik (nie przy każdym przełączeniu języka).
    if (!r._celebrated) {
      r._celebrated = true;
      if (r.percent >= 80) setTimeout(launchConfetti, 300);
      const newBadges = BadgeManager.checkAndUnlock();
      if (newBadges.length) {
        let delay = 800;
        newBadges.forEach(b => { setTimeout(() => showBadgePopup(b), delay); delay += 2500; });
      }
    }
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
    const targeted = session.filters && Object.values(session.filters).some(values => values.length);
    const sessionLabel = session.mode === 'daily' ? t('session_daily')
      : session.mode === 'weak' ? t('session_weak')
      : targeted ? t('session_adaptive') : t('session_quick');

    const answerBtns = displayAnswers.map((text, i) => `
      <button class="answer-btn" data-index="${i}"
              onclick="Views.quiz._selectAnswer(${i})">
        <span class="letter">${letters[i]}</span>
        <span>${text}</span>
      </button>`).join('');

    // Toggle EN/PL — per-question override, only for testers (regular users use the global setting).
    // Shows the flag of the language you'd switch TO.
    const langToggle = (hasEn && AppState.isTester) ? `
      <button class="btn-lang-toggle" onclick="Views.quiz._toggleLang()"
              title="${showEn ? 'PL' : 'EN'}" aria-label="${showEn ? 'PL' : 'EN'}">
        ${showEn ? '🇵🇱' : '🇬🇧'}
      </button>` : '';

    return `
      <div class="screen quiz">
        <div class="quiz-header">
          <div class="quiz-header__left">
            <button class="quiz-abandon" onclick="Views.quiz._abandon()" title="${t('back_to_menu')}">✕</button>
          </div>
          <span class="quiz-counter">${session.current + 1} / ${total}</span>
          <div class="quiz-header__right">
            ${AppState.canReportBugs ? `<button class="quiz-report-btn" onclick="Views.quiz._openReportModal()" title="${t('report_title')}">🚩</button>` : ''}
            ${langToggle}
          </div>
        </div>
        <div class="quiz-progress">
          <div class="quiz-progress__bar" style="width:${pct}%"></div>
        </div>
        <div class="quiz-context">${sessionLabel}</div>
        <div class="quiz-tags">${quizTagsHtml(q)}</div>
        <div class="quiz-question">${questionText}</div>
        <div class="quiz-answers" id="quiz-answers">${answerBtns}</div>
        <div id="explanation-panel" class="hidden"></div>
      </div>`;
  },

  _toggleLang() {
    AppState.showEnglish = !AppState.showEnglish;

    const session = AppState.quizSession;
    const q       = session.questions[session.current];
    const map     = session.shuffledMap[session.current];
    const showEn  = AppState.showEnglish;
    const hasEn   = !!(q.question_en && map.displayAnswers_en[0]);

    // 1. Swap question text
    const questionEl = document.querySelector('.quiz-question');
    if (questionEl) {
      questionEl.textContent = (showEn && hasEn) ? q.question_en : q.question;
    }

    // 2. Swap answer labels — leave button disabled/class state untouched
    const displayAnswers = (showEn && hasEn) ? map.displayAnswers_en : map.displayAnswers_pl;
    document.querySelectorAll('.answer-btn').forEach((btn, i) => {
      const span = btn.querySelector('span:last-child');
      if (span) span.textContent = displayAnswers[i];
    });

    // 3. Swap flag on the toggle button itself
    const toggleBtn = document.querySelector('.btn-lang-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = showEn ? '🇵🇱' : '🇬🇧';
      toggleBtn.title       = showEn ? 'PL' : 'EN';
      toggleBtn.setAttribute('aria-label', showEn ? 'PL' : 'EN');
    }

    // 4. If explanation panel is already visible, swap its text too
    const explTextEl = document.getElementById('expl-text');
    if (explTextEl) {
      explTextEl.textContent = (showEn && hasEn)
        ? (q.explanation_en || q.explanation)
        : q.explanation;
    }
    // Also sync the explanation language button (btn-lang-sm) if present
    const explLangBtn = document.querySelector('.btn-lang-sm');
    if (explLangBtn) {
      explLangBtn.dataset.showing = showEn ? 'en' : 'pl';
      explLangBtn.textContent     = showEn ? '🇵🇱' : '🇬🇧';
      explLangBtn.title           = showEn ? 'PL' : 'EN';
      explLangBtn.setAttribute('aria-label', showEn ? 'PL' : 'EN');
    }
  },

  _selectAnswer(selectedIndex) {
    // Disable all buttons immediately to prevent double-tap
    document.querySelectorAll('.answer-btn').forEach(btn => {
      btn.disabled = true;
    });
    // Mark selected as pending (visual only — correct/wrong applied in _processAnswer)
    document.querySelectorAll('.answer-btn')[selectedIndex]?.classList.add('answer-btn--pending');

    // Persist selected index so _toggleLang() can swap text without losing answer state
    AppState.quizSession.currentAnswer = { selectedIndex, isCorrect: null, processed: false };

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
        <p class="confidence-sheet__title">${t('confidence_q')}</p>
        <button class="confidence-btn"
                onclick="Views.quiz._pickConfidence(1, ${selectedIndex})">
          ${t('conf_guess')}
        </button>
        <button class="confidence-btn"
                onclick="Views.quiz._pickConfidence(2, ${selectedIndex})">
          ${t('conf_unsure')}
        </button>
        <button class="confidence-btn"
                onclick="Views.quiz._pickConfidence(3, ${selectedIndex})">
          ${t('conf_knew')}
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

    // Update persisted answer state so _toggleLang() can swap language without resetting UI
    session.currentAnswer = { selectedIndex, isCorrect, processed: true };

    // Remove pending state, apply correct/wrong highlight
    document.querySelectorAll('.answer-btn').forEach(btn => {
      btn.classList.remove('answer-btn--pending');
      const idx = parseInt(btn.dataset.index);
      if (idx === correctDisplayIndex)              btn.classList.add('correct');
      else if (idx === selectedIndex && !isCorrect) btn.classList.add('wrong');
    });

    QuizEngine.recordAnswer(q.id, isCorrect, confidence);
    Storage.recordConfidence(q.id, confidence, isCorrect);
    session.answers.push(QuizEngine.answerRecord(q, isCorrect));

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
              data-showing="${showEn ? 'en' : 'pl'}"
              title="${showEn ? 'PL' : 'EN'}" aria-label="${showEn ? 'PL' : 'EN'}">
        ${showEn ? '🇵🇱' : '🇬🇧'}
      </button>` : '';

    panel.innerHTML = `
      <div class="feedback-card ${isCorrect ? 'feedback-card--correct' : 'feedback-card--wrong'}">
        <div class="explanation-header">
          <span class="explanation-verdict">${isCorrect ? t('verdict_correct') : t('verdict_wrong')}</span>
          ${explanationLangBtn}
        </div>
        <h3>${t('why_answer')}</h3>
        <div class="quiz-tags quiz-tags--feedback">${quizTagsHtml(q, true)}</div>
        <p class="explanation-text" id="expl-text">${explanationText}</p>
      </div>
      <button class="btn-next" onclick="Views.quiz._advance()">${t('next')}</button>`;

    if (Storage.getSettings().autoScrollEnabled) {
      setTimeout(() => {
        const btnNext = panel.querySelector('.btn-next');
        if (btnNext) {
          btnNext.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      }, 100);
    }
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
    // Show the flag of the language you'd switch TO next
    btn.textContent = newShowing === 'en' ? '🇵🇱' : '🇬🇧';
    btn.title = newShowing === 'en' ? 'PL' : 'EN';
    btn.setAttribute('aria-label', newShowing === 'en' ? 'PL' : 'EN');
  },

  // ---- Zgłaszanie błędów (wspólny ReportModal) ----
  _openReportModal() {
    const session = AppState.quizSession;
    if (!session) return;
    ReportModal.open(session.questions[session.current]);
  },
  // ---- koniec zgłaszania błędów ----

  _abandon() {
    AppState.quizSession = null;
    App.navigate('home');
  },

  _advance() {
    const session = AppState.quizSession;
    session.current++;
    session.currentAnswer = null; // reset for the next question
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

    const domainResults = QuizEngine.buildDomainResults(session.answers);
    const breakdowns = QuizEngine.buildBreakdowns(session.answers);
    const sortedDomains = [...domainResults].sort((a, b) => a.percent - b.percent);
    const weakestDomain = sortedDomains[0]?.domain || null;
    const weakestSegment = QuizEngine.weakestSegment(breakdowns);

    let bestStreak = 0, curStreak = 0;
    session.answers.forEach(a => {
      if (a.correct) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
      else curStreak = 0;
    });

    const result = { date: TODAY(), mode: session.mode, correct, total, percent, domainResults, breakdowns };
    Storage.saveResult(result);
    const readinessAfter = StatsManager.getReadiness();
    const readinessDelta = session.readinessBefore?.state === 'ready' && readinessAfter.state === 'ready'
      ? readinessAfter.score - session.readinessBefore.score
      : null;

    let streakExtended = false;
    if (session.mode === 'daily') {
      const wasAlreadyDone = StreakManager.isDailyDoneToday();
      StreakManager.markDailyDone();
      streakExtended = !wasAlreadyDone;
    } else {
      StreakManager.markActivityDone();
    }

    SupabaseSync.saveQuizSession({ mode: session.mode, correct, total, percent, domainResults, breakdowns }).catch(console.error);
    SupabaseSync.pushProgress().catch(console.error);

    const award = { sessionId: session.sessionId || newSessionId(), mode: session.mode, correct, total };
    AppState.lastSummary = { correct, total, percent, bestStreak, weakestDomain, weakestSegment, streakExtended, mode: session.mode, readinessAfter, readinessDelta, rewardPending: true };
    AppState.quizSession = null;
    App.navigate('summary');
    EngagementSync.award(award).then(reward => {
      if (!AppState.lastSummary) return;
      AppState.lastSummary.reward = reward;
      AppState.lastSummary.rewardPending = false;
      if (App.currentView === 'summary') App.render();
    }).catch(error => {
      console.warn('quiz reward pending retry:', error);
      if (App.currentView === 'summary') App.render();
    });
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
function showBadgePopup(badge, isInfo = false) {
  const popup = document.getElementById('badge-popup');

  // Intercept all clicks to prevent underlying actions while popup is active
  let backdrop = document.getElementById('badge-popup-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'badge-popup-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:999;';
    document.body.appendChild(backdrop);
  }

  const hide = () => {
    if (window._badgePopupTimeout) clearTimeout(window._badgePopupTimeout);
    popup.classList.remove('visible');
    backdrop.style.display = 'none';
    if (window._badgePopupHideTimeout) clearTimeout(window._badgePopupHideTimeout);
    window._badgePopupHideTimeout = setTimeout(() => popup.classList.add('hidden'), 400);
  };

  backdrop.style.display = 'block';
  backdrop.onclick = (e) => {
    e.stopPropagation();
    hide();
  };

  // Clicking on the popup itself should also close it
  popup.onclick = (e) => {
    e.stopPropagation();
    hide();
  };

  popup.classList.remove('hidden');

  const bName = AppState.showEnglish ? (badge.name_en || badge.name) : badge.name;
  const bDesc = AppState.showEnglish ? (badge.desc_en || badge.desc) : badge.desc;

  let title, desc;
  if (isInfo) {
    title = bName;
    desc = bDesc;
  } else {
    title = t('badge_unlocked');
    desc = `${bName} — ${bDesc}`;
  }

  popup.innerHTML = `
    <div class="badge-popup__emoji">${badge.emoji}</div>
    <div class="badge-popup__text">
      <strong>${title}</strong>
      <span>${desc}</span>
    </div>`;

  if (window._badgePopupTimeout) clearTimeout(window._badgePopupTimeout);
  if (window._badgePopupHideTimeout) clearTimeout(window._badgePopupHideTimeout);

  // Trigger visual transition
  requestAnimationFrame(() => popup.classList.add('visible'));

  window._badgePopupTimeout = setTimeout(hide, isInfo ? 4000 : 2200);
}

// ==================== SUMMARY VIEW ====================
Views.summary = {
  render() {
    const s = AppState.lastSummary;
    if (!s) { App.navigate('home'); return ''; }
    const barColor = s.percent >= 80 ? 'var(--green)' : s.percent >= 60 ? 'var(--yellow)' : 'var(--red)';
    const readinessLabel = s.readinessAfter?.state === 'ready' ? `${s.readinessAfter.score}%` : t('calibrating');
    return `
      <div class="screen summary">
        <div class="summary__title">${t('quiz_complete')}</div>
        ${s.streakExtended ? `<div class="summary__streak-msg">${t('streak_extended')}</div>` : ''}
        <div class="summary__score-circle">
          <div class="summary__score-num">${s.correct}/${s.total}</div>
          <div class="summary__score-pct">${s.percent}%</div>
        </div>
        <div class="summary__progress">
          <div class="summary__progress-bar"
               style="width:0%;background:${barColor}"
               data-target="${s.percent}"></div>
        </div>
        <div class="summary-readiness">
          <span>${t('readiness_title')}</span>
          <strong>${readinessLabel}</strong>
          ${s.readinessDelta !== null ? `<small>${t('readiness_delta', { n: s.readinessDelta > 0 ? '+' + s.readinessDelta : s.readinessDelta })}</small>` : ''}
          <p>${t('readiness_disclaimer')}</p>
        </div>
        ${s.reward?.awarded_exp ? `<div class="exp-reward">${t('exp_awarded', { n: s.reward.awarded_exp })}</div>` : s.rewardPending ? `<p class="reward-pending">${t('reward_pending')}</p>` : ''}
        <div class="summary__details">
          <div class="summary__detail">
            <span>${t('best_streak')}</span>
            <span>${t('in_a_row', { n: s.bestStreak })}</span>
          </div>
          ${s.weakestSegment ? `
          <div class="summary__focus">
            <span>${t('most_difficulty')}</span>
            <strong>${labelForSegment(s.weakestSegment.dimension, s.weakestSegment.key)}</strong>
            <small>${s.weakestSegment.correct} / ${s.weakestSegment.total} (${s.weakestSegment.percent}%)</small>
            <button class="btn-primary" onclick="Views['mode-select']._applyTraining('${s.weakestSegment.dimension}', '${s.weakestSegment.key}')">${t('train_area')}</button>
          </div>` : s.weakestDomain ? `
          <div class="summary__detail">
            <span>${t('weakest_domain')}</span>
            <span>${tDomain(s.weakestDomain)}</span>
          </div>` : ''}
        </div>
        <div class="summary__actions">
          <button class="btn-secondary" onclick="App.navigate('home')">${t('back_to_menu')}</button>
          <button class="${s.weakestSegment ? 'btn-secondary' : 'btn-primary'}" style="flex:1"
                  onclick="Views.summary._replay()">${t('play_again')}</button>
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

// ==================== RANKING VIEW ====================
Views.ranking = {
  _period: 'week',
  _rows: [],
  _loadedPeriod: null,
  _loading: false,
  _error: false,

  render() {
    const visible = AppState.engagement.leaderboardVisible;
    const tabs = ['week', 'month', 'all'].map(period => `
      <button class="${this._period === period ? 'selected' : ''}" onclick="Views.ranking._setPeriod('${period}')">${t('leaderboard_' + period)}</button>`).join('');
    const rows = this._rows.map(item => `
      <div class="leaderboard-row ${item.nick === AppState.nick ? 'is-me' : ''}">
        <strong>#${item.rank}</strong>
        <span>${item.nick}</span>
        <b>${item.score}</b>
      </div>`).join('');
    const content = this._loading
      ? `<p class="leaderboard-state">${t('leaderboard_loading')}</p>`
      : this._error
        ? `<p class="leaderboard-state leaderboard-state--error">${t('leaderboard_unavailable')}</p>`
        : rows || `<p class="leaderboard-state">${t('leaderboard_empty')}</p>`;

    return `
      <div class="screen ranking">
        <h1>${t('leaderboard_title')}</h1>
        ${visible ? `
          <div class="leaderboard-tabs">${tabs}</div>
          <section class="leaderboard-table">
            <div class="leaderboard-head"><span>${t('leaderboard_position')}</span><span>Nick</span><span>${t('leaderboard_score')}</span></div>
            ${content}
          </section>` : `
          <section class="leaderboard-private">
            <span>${Icons.ranking()}</span>
            <h2>${t('leaderboard_private')}</h2>
            <p>${t('leaderboard_private_desc')}</p>
            <button class="btn-primary" onclick="Views.ranking._join()">${t('leaderboard_join')}</button>
          </section>`}
        ${appNav('ranking')}
      </div>`;
  },

  init() {
    if (AppState.engagement.leaderboardVisible && this._loadedPeriod !== this._period && !this._loading) this._load();
  },

  async _join() {
    try {
      await EngagementSync.setVisibility(true);
      this._loadedPeriod = null;
      App.render();
    } catch (error) {
      console.warn('leaderboard join failed:', error);
      alert(t('leaderboard_error'));
    }
  },

  _setPeriod(period) {
    this._period = period;
    this._loadedPeriod = null;
    App.render();
  },

  async _load() {
    this._loading = true;
    App.render();
    try {
      this._rows = await EngagementSync.getLeaderboard(this._period);
      this._loadedPeriod = this._period;
      this._error = false;
    } catch (error) {
      console.warn('leaderboard loading failed:', error);
      this._loadedPeriod = this._period;
      this._error = true;
    } finally {
      this._loading = false;
      App.render();
    }
  },
};

// ==================== STATS VIEW ====================
Views.stats = {
  _activeBreakdown: 'ecoDomain',

  render() {
    const readiness = StatsManager.getReadiness();
    const avg3  = StatsManager.getAvg(3);
    const avg7  = StatsManager.getAvg(7);
    const avg30 = StatsManager.getAvg(30);
    const totals = StatsManager.getTotals();
    const perDomain = StatsManager.getPerDomain(AppState.questions);
    const breakdown = StatsManager.getBreakdown(this._activeBreakdown, AppState.questions);
    const unlocked = Storage.getUnlockedBadges();

    const now = new Date();
    const dayName = t('day_' + now.getDay());
    const monthName = t('month_' + now.getMonth());
    const fullDate = `${now.getDate()} ${monthName} ${now.getFullYear()}, ${dayName}`;
    const monthGrid = this._renderMonthGrid(now.getFullYear(), now.getMonth());

    const avgVal = v => v !== null ? `${v}%` : '—';
    const domainBars = perDomain.map(d => `
      <div class="domain-bar">
        <span class="domain-bar__name">${tDomain(d.domain)}</span>
        <div class="domain-bar__track">
          <div class="domain-bar__fill" style="width:0%" data-target="${d.percent ?? 0}"></div>
        </div>
        <span class="domain-bar__pct">${d.percent !== null ? d.percent + '%' : '—'}</span>
      </div>`).join('');
    const breakdownRows = breakdown.map(item => `
      <div class="breakdown-row">
        <span class="breakdown-row__name">${labelForSegment(this._activeBreakdown, item.key)}</span>
        <div class="domain-bar__track"><div class="domain-bar__fill" style="width:0%" data-target="${item.percent ?? 0}"></div></div>
        <span class="breakdown-row__pct">${item.percent !== null ? item.percent + '%' : t('no_data')}</span>
        <span class="breakdown-row__count">${item.total ? item.total + ' ' + t('responses') : ''}</span>
      </div>`).join('');
    const breakdownTabs = ['ecoDomain', 'approach', 'domain', 'qtype', 'difficulty'].map(dimension => `
      <button class="stats-tab ${this._activeBreakdown === dimension ? 'selected' : ''}"
              onclick="Views.stats._setBreakdown('${dimension}')">${t('tab_' + dimension)}</button>`).join('');

    const badgeItems = BADGES_DEF.map(b => `
      <div class="badge-item ${unlocked.includes(b.id) ? '' : 'locked'}" onclick="Views.stats._showBadgeInfo('${b.id}')">
        <div class="badge-item__emoji">${b.emoji}</div>
        <div class="badge-item__name">${AppState.showEnglish ? (b.name_en || b.name) : b.name}</div>
      </div>`).join('');

    return `
      <div class="screen stats">
        <h1>${t('progress_title')}</h1>

        <div class="stats-card stats-readiness">
          <h3>${t('readiness_title')}</h3>
          ${readiness.state === 'ready'
            ? `<div class="stats-readiness__score">${readiness.score}%</div>
               ${readiness.weakest ? `<p>${t('weakest_area')}: <strong>${tEcoDomain(readiness.weakest.key)}</strong></p>` : ''}`
            : `<p>${t('calibrating_more', { n: Math.max(0, readiness.required - readiness.answered) })}</p>`}
          <p class="readiness-disclaimer">${t('readiness_disclaimer')}</p>
        </div>

        <div class="stats-card">
          <h3>${t('avg_correct')}</h3>
          <div class="avg-row">
            <div class="avg-item">
              <div class="avg-item__val">${avgVal(avg3)}</div>
              <div class="avg-item__label">${t('d3')}</div>
            </div>
            <div class="avg-item">
              <div class="avg-item__val">${avgVal(avg7)}</div>
              <div class="avg-item__label">${t('d7')}</div>
            </div>
            <div class="avg-item">
              <div class="avg-item__val">${avgVal(avg30)}</div>
              <div class="avg-item__label">${t('d30')}</div>
            </div>
          </div>
        </div>

        <div class="stats-card">
          <h3>${t('total')}</h3>
          <div class="totals">
            <div class="total-item">
              <div class="total-item__val">${totals.quizzes}</div>
              <div class="total-item__label">${t('quizzes')}</div>
            </div>
            <div class="total-item">
              <div class="total-item__val">${totals.answered}</div>
              <div class="total-item__label">${t('questions')}</div>
            </div>
          </div>
        </div>

        ${perDomain.length ? `
        <div class="stats-card">
          <h3>${t('per_domain')}</h3>
          ${domainBars}
        </div>` : ''}

        <div class="stats-card">
          <h3>${t('preparation_analysis')}</h3>
          <div class="stats-tabs">${breakdownTabs}</div>
          <p class="stats-note">${t('data_since_update')}</p>
          <div class="breakdown-list">${breakdownRows}</div>
        </div>

        <div class="stats-card stats-card--activity" onclick="Views.stats._openFullCalendar()">
          <h3>${t('activity_30')}</h3>
          <div class="activity-header">
            <span class="activity-date">${fullDate}</span>
          </div>
          <div class="calendar-grid">
            ${this._renderDayLabels()}
            ${monthGrid}
          </div>
        </div>

        <div class="stats-card">
          <h3>${t('badges')}</h3>
          <div class="badges-grid">${badgeItems}</div>
        </div>
        <button class="btn-gray" onclick="App.navigate('home')">${t('back')}</button>
        ${appNav('stats')}
      </div>`;
  },

  _renderDayLabels() {
    const labels = AppState.showEnglish
      ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
      : ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
    return labels.map(l => `<div class="calendar-label">${l}</div>`).join('');
  },

  _showBadgeInfo(badgeId) {
    const badge = BADGES_DEF.find(b => b.id === badgeId);
    if (badge) showBadgePopup(badge, true);
  },

  _setBreakdown(dimension) {
    this._activeBreakdown = dimension;
    App.render();
  },

  _renderMonthGrid(year, month) {
    const days = StreakManager.getMonthData(year, month);
    return days.map(d => {
      if (d.type === 'padding') return `<div class="calendar-cell padding"></div>`;

      const hasActivity = d.status === 'done' || d.status === 'activity';
      const onClick = hasActivity ? `onclick="event.stopPropagation(); Views.stats._showDayDetails('${d.date}', this)"` : '';
      const style = hasActivity ? 'cursor: pointer;' : '';

      return `<div class="calendar-cell calendar-cell--${d.status} ${d.isToday ? 'today' : ''}"
                   title="${d.date}" ${onClick} style="${style}">
                ${d.dayNum}
              </div>`;
    }).join('');
  },

  _showDayDetails(dateKey, el) {
    // 1. Usuń istniejące tooltipy
    document.querySelectorAll('.activity-tooltip').forEach(t => t.remove());

    const details = StreakManager.getDayDetails(dateKey);
    if (!details) return;

    // 2. Utwórz tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'activity-tooltip';
    tooltip.innerHTML = `
      <div class="activity-tooltip__title">${dateKey}</div>
      <div class="activity-tooltip__list">
        ${details.map(d => `<div class="activity-tooltip__item">${d}</div>`).join('')}
      </div>
      <div class="activity-tooltip__arrow"></div>
    `;

    // 3. Przypnij go do komórki kalendarza
    el.appendChild(tooltip);

    // 4. Auto-pozycjonowanie, by tooltip nie wychodził poza ekran
    const rect = tooltip.getBoundingClientRect();
    const arrow = tooltip.querySelector('.activity-tooltip__arrow');
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const padding = 10;

    let shiftX = 0;
    if (rect.right > winW - padding) {
      shiftX = rect.right - winW + padding;
    } else if (rect.left < padding) {
      shiftX = rect.left - padding;
    }

    if (shiftX !== 0) {
      // Przesuwamy tooltip, by zmieścił się w poziomie
      tooltip.style.transform = `translateX(calc(-50% - ${shiftX}px)) translateY(8px)`;
      // Przesuwamy strzałkę w przeciwną stronę, by nadal celowała w środek dnia
      if (arrow) arrow.style.left = `calc(50% + ${shiftX}px)`;
    }

    // Sprawdzenie czy nie wychodzi dołem
    if (rect.bottom > winH - padding) {
      tooltip.classList.add('activity-tooltip--top');
      // Zamień translateY na ujemne
      const currentTransform = tooltip.style.transform || 'translateX(-50%) translateY(8px)';
      tooltip.style.transform = currentTransform.replace('translateY(8px)', 'translateY(-8px)');
    }

    // 5. Mechanizm zamykania przez kliknięcie gdziekolwiek
    const hide = (e) => {
      // Nie zamykaj, jeśli kliknięto wewnątrz samego tooltipa (pozwala np. zaznaczyć tekst)
      if (e && tooltip.contains(e.target)) return;

      tooltip.remove();
      document.removeEventListener('click', hide, true);
    };

    // Timeout zapobiega natychmiastowemu zamknięciu przez ten sam klik, który otworzył tooltip
    setTimeout(() => document.addEventListener('click', hide, true), 10);
  },

  _openFullCalendar() {
    const months = StreakManager.getActiveMonths();
    const content = months.map(m => {
      const [year, month] = m.split('-').map(Number);
      const monthName = t('month_' + (month - 1));
      return `
        <div class="full-calendar-month">
          <div class="full-calendar-month-title">${monthName} ${year}</div>
          <div class="calendar-grid">
            ${this._renderDayLabels()}
            ${this._renderMonthGrid(year, month - 1)}
          </div>
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.className = 'calendar-modal';
    modal.innerHTML = `
      <div class="calendar-modal__card">
        <div class="calendar-modal__header">
          <span>${t('activity_history')}</span>
          <button class="calendar-modal__close" onclick="this.closest('.calendar-modal').remove()">×</button>
        </div>
        <div class="calendar-modal__body">
          ${content}
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
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
