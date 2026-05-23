'use strict';

// ==================== VERSION ====================
// UWAGA: APP_VERSION generowany przez tools/build.py — nie edytuj ręcznie.
// Uruchom 'python tools/build.py' przed deployem (CI robi to automatycznie).
const APP_VERSION = 'build-4df551ab';  // placeholder, nadpisywany przez build.py

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
  { id: 'first',   emoji: '🎯', name: 'Pierwszy krok', name_en: 'First step',    desc: 'Ukończ pierwszy quiz',           desc_en: 'Complete your first quiz',        check: s => s.totalQuizzes >= 1 },
  { id: 'week',    emoji: '🔥', name: 'Tydzień ognia', name_en: 'Week of fire',  desc: '7 dni serii z rzędu',             desc_en: '7-day streak in a row',           check: s => s.currentStreak >= 7 },
  { id: 'month',   emoji: '💪', name: 'Miesiąc mocy',  name_en: 'Month of power', desc: '30 dni serii z rzędu',           desc_en: '30-day streak in a row',          check: s => s.currentStreak >= 30 },
  { id: 'hundred', emoji: '🧠', name: 'Setka',         name_en: 'Century',       desc: '100 odpowiedzianych pytań',       desc_en: '100 questions answered',          check: s => s.totalAnswered >= 100 },
  { id: 'fivehun', emoji: '🏆', name: 'Pięćsetka',     name_en: 'Five hundred',  desc: '500 odpowiedzianych pytań',       desc_en: '500 questions answered',          check: s => s.totalAnswered >= 500 },
  { id: 'perfect', emoji: '⭐', name: 'Perfekcja',     name_en: 'Perfection',    desc: '100% poprawnych w jednym quizie', desc_en: '100% correct in a single quiz',   check: s => s.hadPerfectQuiz },
  { id: 'ready',   emoji: '🎓', name: 'PMP Ready',     name_en: 'PMP Ready',     desc: 'Średnia ≥ 80% z 30 dni',          desc_en: 'Average ≥ 80% over 30 days',      check: s => s.avg30 >= 80 },
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
  'Zakres': 'Scope', 'Zasoby': 'Resource', 'Środowisko biznesowe': 'Business Environment',
};
const tDomain = d => (AppState.showEnglish ? (DOMAIN_I18N[d] || d) : d);

const I18N = {
  // login
  login_subtitle:     { pl: 'Nauka do egzaminu PMP',            en: 'Study for the PMP exam' },
  email_ph:           { pl: 'Adres email',                      en: 'Email address' },
  pass_ph:            { pl: 'Hasło (min. 6 znaków)',            en: 'Password (min. 6 characters)' },
  sign_up:            { pl: 'Zarejestruj się',                  en: 'Sign up' },
  sign_in:            { pl: 'Zaloguj się',                      en: 'Sign in' },
  have_account:       { pl: '← Mam już konto — zaloguj się',    en: '← I already have an account — sign in' },
  no_account:         { pl: 'Nie mam konta — zarejestruj się →', en: "Don't have an account — sign up →" },
  enter_credentials:  { pl: 'Podaj email i hasło.',             en: 'Enter your email and password.' },
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
  // home
  settings:           { pl: 'Ustawienia',                       en: 'Settings' },
  streak_start:       { pl: '⚡ Zacznij serię!',                en: '⚡ Start a streak!' },
  streak_one:         { pl: '🔥 Dobry początek!',               en: '🔥 Good start!' },
  streak_two:         { pl: '🔥 Dwa dni z rzędu!',              en: '🔥 Two days running!' },
  streak_roll:        { pl: '🔥 Jesteś na fali!',               en: "🔥 You're on a roll!" },
  streak_keep:        { pl: '🔥 Nie zatrzymuj się!',             en: '🔥 Keep it going!' },
  streak_fire:        { pl: '🔥 Tydzień ognia!',                 en: "🔥 You're on Fire! 🔥" },
  streak_many:        { pl: '🔥 {n} dni z rzędu',               en: '🔥 {n} days in a row' },
  daily_challenge:    { pl: 'Codzienne Wyzwanie',               en: 'Daily Challenge' },
  daily_done:         { pl: '30 pytań · Ukończono dziś ✓',      en: '30 questions · Done today ✓' },
  daily_pending:      { pl: '30 pytań · Wymagane dziś',         en: '30 questions · Required today' },
  quick_quiz:         { pl: 'Szybki Quiz',                      en: 'Quick Quiz' },
  quick_quiz_sub:     { pl: '10 pytań · losowe',                en: '10 questions · random' },
  statistics:         { pl: 'Statystyki',                       en: 'Statistics' },
  your_progress:      { pl: 'Twój postęp',                      en: 'Your progress' },
  // settings modal
  close:              { pl: 'Zamknij',                          en: 'Close' },
  confidence_label:   { pl: 'Ocena pewności',                   en: 'Confidence rating' },
  confidence_desc:    { pl: 'Skala 1–3 przed odpowiedzią',      en: '1–3 scale before answering' },
  confidence_aria:    { pl: 'Włącz ocenę pewności',             en: 'Enable confidence rating' },
  app_language:       { pl: 'Język aplikacji',                  en: 'App language' },
  app_language_desc:  { pl: 'Język całej aplikacji i pytań',    en: 'Language of the whole app and questions' },
  sign_out:           { pl: 'Wyloguj się',                      en: 'Sign out' },
  privacy_policy:     { pl: 'Polityka prywatności ↗',           en: 'Privacy policy ↗' },
  sign_out_confirm:   { pl: 'Wylogować się?',                   en: 'Sign out?' },
  // mode select
  back:               { pl: '‹ Wróć',                           en: '‹ Back' },
  standard_quiz:      { pl: '⚡ Standardowy Quiz',              en: '⚡ Standard Quiz' },
  standard_quiz_desc: { pl: '10 losowych pytań z wybranych domen', en: '10 random questions from selected domains' },
  filter_domains:     { pl: 'Filtruj domeny (domyślnie wszystkie):', en: 'Filter domains (all by default):' },
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
  play_again:         { pl: 'Zagraj ponownie',                  en: 'Play again' },
  // stats
  avg_correct:        { pl: 'Średnia poprawnych odpowiedzi',    en: 'Average correct answers' },
  d3:                 { pl: '3 dni',                            en: '3 days' },
  d7:                 { pl: '7 dni',                            en: '7 days' },
  d30:                { pl: '30 dni',                           en: '30 days' },
  total:              { pl: 'Łącznie',                          en: 'Total' },
  quizzes:            { pl: 'Quizy',                            en: 'Quizzes' },
  questions:          { pl: 'Pytania',                          en: 'Questions' },
  per_domain:         { pl: 'Per domena',                       en: 'Per domain' },
  activity_30:        { pl: 'Aktywność (30 dni)',               en: 'Activity (30 days)' },
  badges:             { pl: 'Odznaki',                          en: 'Badges' },
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
  // Odblokowanie działa między urządzeniami dzięki cross-device sync (plan 09).
  // quiz_history jest teraz synchronizowane z chmurą; fallback na streak_data
  // zapewnia poprawne działanie również zanim nastąpi pierwszy pull.
  hasCompletedAnyQuiz() {
    return this.getHistory().length > 0
        || Object.keys(this.getStreakData()).length > 0;
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
        .select('is_tester, can_report_bugs, can_see_debug_info')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && profile) {
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
  async signIn(email, password) {
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
  async registerBeta(code, email, password) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/register-beta-user`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'apikey':        SUPABASE_ANON,
      },
      body: JSON.stringify({ code, email, password }),
    });
    let data;
    try { data = await res.json(); }
    catch { throw new Error(t('generic_error')); }
    return data;
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
  isTester:        false, // gates per-question EN/PL override (user_profiles.is_tester, source of truth)
  canReportBugs:   false, // gates the "Report issue" 🚩 button (user_profiles.can_report_bugs)
  canSeeDebugInfo: false, // gates future diagnostics (user_profiles.can_see_debug_info)
  syncStatus:   'idle', // 'idle' | 'syncing' | 'ok' | 'error'
  sessionKickedMsg: null, // set when SessionGuard kicks this device; shown once on the login screen
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
    document.documentElement.lang = L();
    document.getElementById('app').innerHTML = view.render();
    view.init?.();
  },

  async init() {
    // Apply saved language before the first paint so the loading/login screens are localized too
    AppState.showEnglish = (Storage.getSettings().defaultLanguage === 'en');
    this.navigate('loading');
    const { data: { session } } = await sb().auth.getSession();
    if (!session) {
      this.navigate('login');
      return;
    }
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
    // Initialize EN/PL state from saved global language preference
    AppState.showEnglish = (Storage.getSettings().defaultLanguage === 'en');
    await new Promise(r => setTimeout(r, 800));
    this.navigate('home');
    SessionGuard.startHeartbeat();
  },
};

// ==================== LOGIN VIEW ====================
Views.login = {
  _mode: 'login',

  render() {
    const isReg = this._mode === 'register';
    const kickedBanner = AppState.sessionKickedMsg ? `
        <div class="login-kicked-banner">⚠️ ${AppState.sessionKickedMsg}</div>` : '';
    return `
      <div class="screen login-screen">
        <div class="login-logo">📋</div>
        <h1 class="login-title">PMP Quiz</h1>
        <p class="login-subtitle">${isReg ? t('login_subtitle_beta') : t('login_subtitle')}</p>
        ${kickedBanner}
        <div class="login-form">
          <input type="email" id="l-email" placeholder="${t('email_ph')}"
                 autocomplete="email" inputmode="email" />
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
          <button class="btn-link" onclick="Views.login._toggle()">
            ${isReg ? t('have_account') : t('no_account')}
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

    if (!email || !pass) { this._msg(t('enter_credentials'), false); return; }

    const registerLabel = t('sign_up_beta');

    if (this._mode === 'register') {
      const code = document.getElementById('l-code')?.value.trim().toUpperCase();
      if (!code || code.length < 12) { this._msg(t('code_required'), false); return; }

      btn.disabled = true; btn.textContent = '…';
      this._msg(t('register_verifying'), true);

      try {
        const data = await Auth.registerBeta(code, email, pass);
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
    const weekDays   = StreakManager.getWeekDays();

    const streakLabel = streak === 0 ? t('streak_start')
      : streak === 1 ? t('streak_one')
      : streak === 2 ? t('streak_two')
      : streak <= 4  ? t('streak_roll')
      : streak <= 6  ? t('streak_keep')
      : t('streak_fire');

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

    return `
      <div class="screen home">
        <div class="home-topbar">
          <button class="btn-settings" onclick="Views.home._openSettings()" title="${t('settings')}">⚙️</button>
        </div>
        ${syncLabel ? `<div class="sync-indicator sync-indicator--${AppState.syncStatus}">${syncLabel}</div>` : ''}
        <div id="pwa-install-banner"></div>
        <div class="streak-widget">
          <div class="streak-week">${dayCells}</div>
          <hr class="streak-divider">
          <div class="streak-message">${streakLabel}</div>
        </div>
        <div class="menu">
          <button class="menu-btn menu-btn--daily ${dailyDone ? 'done' : 'pending'}"
                  onclick="App.navigate('daily-start')">
            <span class="menu-btn__icon">${dailyDone ? '✅' : '🔴'}</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">${t('daily_challenge')}</div>
              <div class="menu-btn__sub">${dailyDone ? t('daily_done') : t('daily_pending')}</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
          <button class="menu-btn" onclick="App.navigate('mode-select')">
            <span class="menu-btn__icon">⚡</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">${t('quick_quiz')}</div>
              <div class="menu-btn__sub">${t('quick_quiz_sub')}</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
          <button class="menu-btn" onclick="App.navigate('stats')">
            <span class="menu-btn__icon">📊</span>
            <div class="menu-btn__content">
              <div class="menu-btn__title">${t('statistics')}</div>
              <div class="menu-btn__sub">${t('your_progress')}</div>
            </div>
            <span class="menu-btn__arrow">›</span>
          </button>
        </div>
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
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">🧠</span>
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
        <div class="settings-separator"></div>
        <div class="settings-row">
          <div class="settings-row__info">
            <span class="settings-row__icon">🌐</span>
            <div>
              <div class="settings-row__label">${t('app_language')}</div>
              <div class="settings-row__desc">${t('app_language_desc')}</div>
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
                onclick="Views.home._logout()">${t('sign_out')}</button>
        <a class="settings-action-btn settings-action-btn--link"
           href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">${t('privacy_policy')}</a>
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

  async _logout() {
    Views.home._closeSettings();
    if (!confirm(t('sign_out_confirm'))) return;
    SessionGuard.clearLocalToken();
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
    // FIX #6 — karta zawsze widoczna; wyblakła (disabled) gdy nie ma czego grać:
    //          albo brak ukończonego quizu, albo 0 słabych pytań do powtórki.
    const neverPlayed  = !Storage.hasCompletedAnyQuiz();
    const weakDisabled = neverPlayed || weakCount === 0;
    const self = Views['mode-select'];

    const domainChips = domains.map(d => {
      const sel = self._selectedDomains.includes(d);
      return `<div class="domain-chip ${sel ? 'selected' : ''}"
                   onclick="Views['mode-select']._toggleDomain('${d}')">${tDomain(d)}</div>`;
    }).join('');

    let weakSubtitle;
    if (neverPlayed)      weakSubtitle = t('weak_locked');
    else if (weakCount === 0) weakSubtitle = t('weak_none');
    else                  weakSubtitle = t('weak_count', { n: weakCount });

    return `
      <div class="screen mode-select">
        <button class="btn-back" onclick="App.navigate('home')">${t('back')}</button>
        <h2>${t('quick_quiz')}</h2>
        <div class="mode-card ${self._selectedMode === 'quick' ? 'selected' : ''}"
             onclick="Views['mode-select']._selectMode('quick')">
          <h3>${t('standard_quiz')}</h3>
          <p>${t('standard_quiz_desc')}</p>
          <div class="domain-filter" style="margin-top:12px">
            <label>${t('filter_domains')}</label>
            <div class="domain-chips">${domainChips}</div>
          </div>
        </div>
        <div class="mode-card ${self._selectedMode === 'weak' ? 'selected' : ''} ${weakDisabled ? 'disabled' : ''}"
             ${weakDisabled ? '' : "onclick=\"Views['mode-select']._selectMode('weak')\""}>
          <h3>${t('weak_questions')}</h3>
          <p>${weakSubtitle}</p>
        </div>
        <button class="btn-primary" style="margin-top:8px"
                onclick="Views['mode-select']._startQuiz()">
          ${t('start')}
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
      alert(t('weak_alert'));
      return;
    }
    const recentlyShown = AppState.quizSession?.recentlyShown || [];
    const questions = QuizEngine.selectQuestions(
      AppState.questions, this._selectedMode, this._selectedDomains, recentlyShown
    );
    if (!questions.length) {
      alert(t('no_questions_filter'));
      return;
    }
    AppState.quizSession    = { questions, current: 0, answers: [], mode: this._selectedMode, shuffledMap: {}, recentlyShown: [], currentAnswer: null };
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
      alert(t('load_fail'));
      App.navigate('home');
      return;
    }
    const questions = QuizEngine.selectQuestions(AppState.questions, 'daily');
    AppState.quizSession = { questions, current: 0, answers: [], mode: 'daily', shuffledMap: {}, recentlyShown: [], currentAnswer: null };
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
            ${q.domain ? `<span class="quiz-domain">${tDomain(q.domain)}</span>` : ''}
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
              data-showing="${showEn ? 'en' : 'pl'}"
              title="${showEn ? 'PL' : 'EN'}" aria-label="${showEn ? 'PL' : 'EN'}">
        ${showEn ? '🇵🇱' : '🇬🇧'}
      </button>` : '';

    panel.innerHTML = `
      <div class="explanation-panel ${isCorrect ? 'explanation-panel--correct' : 'explanation-panel--wrong'}">
        <div class="explanation-header">
          <span class="explanation-verdict">${isCorrect ? t('verdict_correct') : t('verdict_wrong')}</span>
          ${explanationLangBtn}
        </div>
        <p class="explanation-text" id="expl-text">${explanationText}</p>
      </div>
      <button class="btn-next" onclick="Views.quiz._advance()">${t('next')}</button>`;
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

  // ---- Zgłaszanie błędów ----
  _openReportModal() {
    const session = AppState.quizSession;
    if (!session) return;
    const q = session.questions[session.current];

    // Usuń poprzedni modal jeśli istnieje
    document.getElementById('report-modal')?.remove();

    const categories = [
      { id: 'wrong_answer',  label: t('cat_wrong_answer') },
      { id: 'unclear',       label: t('cat_unclear') },
      { id: 'typo',          label: t('cat_typo') },
      { id: 'translation',   label: t('cat_translation') },
      { id: 'other',         label: t('cat_other') },
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
      <div class="report-modal__card" role="dialog" aria-modal="true" aria-label="${t('report_aria')}">
        <div class="report-modal__header">
          <span>${t('report_header')}</span>
          <button class="report-modal__close" onclick="Views.quiz._closeReportModal()" aria-label="${t('close')}">✕</button>
        </div>
        <p class="report-modal__question-preview">"${(() => { const txt = (AppState.showEnglish && q.question_en) ? q.question_en : q.question; return txt.slice(0, 100) + (txt.length > 100 ? '…' : ''); })()}"</p>
        <div class="report-modal__cats" id="report-cats">${chips}</div>
        <textarea id="report-comment" class="report-modal__textarea"
                  placeholder="${t('report_comment_ph')}"
                  maxlength="500" rows="3"></textarea>
        <div id="report-modal-msg" class="report-modal__msg hidden"></div>
        <div class="report-modal__actions">
          <button class="btn-secondary" onclick="Views.quiz._closeReportModal()">${t('cancel')}</button>
          <button class="btn-primary" id="report-submit-btn"
                  onclick="Views.quiz._submitReport()" disabled>${t('send_report')}</button>
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
      Views.quiz._showToast(t('report_sent'), true);
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = t('report_send_err');
        msgEl.className   = 'report-modal__msg report-modal__msg--err';
      }
      submitBtn.disabled    = false;
      submitBtn.textContent = t('send_report');
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
  const bName = AppState.showEnglish ? (badge.name_en || badge.name) : badge.name;
  const bDesc = AppState.showEnglish ? (badge.desc_en || badge.desc) : badge.desc;
  popup.innerHTML = `
    <div class="badge-popup__emoji">${badge.emoji}</div>
    <div class="badge-popup__text">
      <strong>${t('badge_unlocked')}</strong>
      <span>${bName} — ${bDesc}</span>
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
        <div class="summary__title">${emoji} ${t('quiz_complete')}</div>
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
        <div class="summary__details">
          <div class="summary__detail">
            <span>${t('best_streak')}</span>
            <span>${t('in_a_row', { n: s.bestStreak })}</span>
          </div>
          ${s.weakestDomain ? `
          <div class="summary__detail">
            <span>${t('weakest_domain')}</span>
            <span>${tDomain(s.weakestDomain)}</span>
          </div>` : ''}
        </div>
        <div class="summary__actions">
          <button class="btn-secondary" onclick="App.navigate('home')">${t('back_to_menu')}</button>
          <button class="btn-primary" style="flex:1"
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
        <span class="domain-bar__name">${tDomain(d.domain)}</span>
        <div class="domain-bar__track">
          <div class="domain-bar__fill" style="width:0%" data-target="${d.percent ?? 0}"></div>
        </div>
        <span class="domain-bar__pct">${d.percent !== null ? d.percent + '%' : '—'}</span>
      </div>`).join('');

    const badgeItems = BADGES_DEF.map(b => `
      <div class="badge-item ${unlocked.includes(b.id) ? '' : 'locked'}">
        <div class="badge-item__emoji">${b.emoji}</div>
        <div class="badge-item__name">${AppState.showEnglish ? (b.name_en || b.name) : b.name}</div>
      </div>`).join('');

    const calDots = days.map(d =>
      `<div class="streak-dot streak-dot--${d.status}" title="${d.date}"></div>`
    ).join('');

    return `
      <div class="screen stats">
        <button class="btn-back" onclick="App.navigate('home')">${t('back')}</button>
        <h1>${t('statistics')}</h1>

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
          <h3>${t('activity_30')}</h3>
          <div class="streak-dots">${calDots}</div>
        </div>

        <div class="stats-card">
          <h3>${t('badges')}</h3>
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
