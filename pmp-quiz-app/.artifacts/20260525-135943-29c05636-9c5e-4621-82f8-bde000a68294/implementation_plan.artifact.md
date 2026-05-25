# Implement Badge Information Pop-up in Statistics Menu

The goal is to allow users to click on badges in the statistics menu to see a bilingual description of how to earn them.

## User Review Required

> [!NOTE]
> The pop-up will use the existing `badge-popup` notification system at the bottom of the screen, but it will be modified to show both Polish and English descriptions simultaneously (bilingual format) and remain visible for a slightly longer duration.

## Proposed Changes

### [CSS] [styles.css](file:///C:/dev/pmp-quiz/pmp-quiz-app/styles.css)

- Add `cursor: pointer` to `.badge-item` to indicate interactivity.
- (Optional) Increase `z-index` of `.badge-popup` if needed (it's already 1000).

### [JavaScript] [app.js](file:///C:/dev/pmp-quiz/pmp-quiz-app/app.js)

#### Refactor `showBadgePopup`
Modify the function to:
- Accept a second parameter `isInfo` (boolean).
- If `isInfo` is true, show the badge name as the title and the requirement as the description.
- Use a bilingual format (Polish / English) for both title and description when in "info" mode.
- Extend the display time to 4 seconds for better readability of bilingual text.

#### Update `Views.stats`
- Update the `render()` method to add an `onclick` handler to each badge item.
- Implement `_showBadgeInfo(badgeId)` to find the badge definition and call `showBadgePopup(badge, true)`.

## Badge Conditions (Refined)

The following conditions are already implemented in `BadgeManager.buildStats()` and `BADGES_DEF`:

| ID | Name (PL/EN) | Condition | Description (PL) |
|---|---|---|---|
| `first` | Pierwszy krok / First step | `totalQuizzes >= 1` | Ukończ pierwszy quiz |
| `week` | Tydzień ognia / Week of fire | `currentStreak >= 7` | 7 dni serii z rzędu |
| `month` | Miesiąc mocy / Month of power | `currentStreak >= 30` | 30 dni serii z rzędu |
| `hundred` | Setka / Century | `totalAnswered >= 100` | 100 odpowiedzianych pytań |
| `fivehun` | Pięćsetka / Five hundred | `totalAnswered >= 500` | 500 odpowiedzianych pytań |
| `perfect` | Perfekcja / Perfection | `hadPerfectQuiz` | 100% poprawnych w jednym quizie |
| `ready` | PMP Ready / PMP Ready | `avg30 >= 80` | Średnia ≥ 80% z 30 dni |
| `trial_first` | Próba generalna / Dress Rehearsal | `trialCount >= 1` | Ukończ pierwszy Trial Exam |
| `trial_marathon` | Maraton PMP / PMP Marathon | `trialFullDone` | Ukończ pełny egzamin 180 pytań |
| `trial_target` | Powyżej celu / Above Target | `trialBest >= 80` | Wynik ≥ 80% w Trial Exam |
| `trial_clock` | Mistrz czasu / Time Master | `trialBeatClock` | Ukończ Trial Exam z ≥ 25% czasu w zapasie |

## Verification Plan

### Manual Verification
1.  **Open Statistics Menu**: Navigate to the statistics screen.
2.  **Click Locked Badge**: Click a grayed-out badge (e.g., "Month of power").
    *   Verify a pop-up appears at the bottom.
    *   Verify the content is bilingual: `Miesiąc mocy / Month of power` as title and `30 dni serii z rzędu / 30-day streak in a row` as description.
3.  **Click Unlocked Badge**: Click a colored badge.
    *   Verify the same bilingual pop-up appears.
4.  **Check Language Toggle**: Change app language in settings and verify the pop-up STILL shows both languages (as requested by "bilingual format").
5.  **Simulate Badge Unlock**: Complete a quiz that triggers a new badge.
    *   Verify the "Badge unlocked!" notification still works (can be Polish or English based on app settings, or bilingual if I decide to make that bilingual too).

### Automated Tests
- Run existing tests in `tests/test_logic.js` to ensure `BadgeManager` logic is not broken.
- Command: `node tests/test_logic.js` (assuming it's a Node-compatible test file, or I can check how tests are run).
