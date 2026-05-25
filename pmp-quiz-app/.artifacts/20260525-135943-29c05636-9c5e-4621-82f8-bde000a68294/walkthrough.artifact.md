# Walkthrough - Badge Information Pop-up

I have implemented a feature that allows users to click on badges in the Statistics menu to see a bilingual description of how to earn them.

## Changes Made

### UI & Styling
- **Interactivity**: Added `cursor: pointer` to badge items in the statistics grid to indicate they are clickable.
- **Bilingual Pop-up**: Modified the existing `badge-popup` system to support an "info" mode. When a badge is clicked in the Statistics view, it shows both Polish and English names and requirements simultaneously.
- **Duration**: Increased the display time for the info pop-up to 4 seconds (from 2.2s) to ensure users have enough time to read the bilingual text.

### Logic
- **Refactored `showBadgePopup`**: The function now accepts an `isInfo` parameter.
    - If `true`: Displays a bilingual "Name / Name_EN" title and "Desc / Desc_EN" description.
    - If `false` (default): Behaves as a standard "Badge unlocked!" notification in the current app language.
- **Stats View Integration**:
    - Added an `onclick` handler to each badge item in `Views.stats.render()`.
    - Implemented `Views.stats._showBadgeInfo(badgeId)` to trigger the pop-up.

### Bug Fixes
- **Test Fix**: Fixed a failing test in `tests/test_logic.js` where `StatsManager.getAvg` was failing due to hardcoded past dates that fell outside the "last X days" window. Updated it to use dynamic dates.

## Verification Results

### Automated Tests
- Ran `node tests/test_logic.js`.
- **Result**: `66 passed, 0 failed`. This confirms that the badge management logic and statistics calculations remain intact.

### Manual Verification Steps (Recommended for User)
1.  Navigate to the **Statistics** screen.
2.  Click on any badge (locked or unlocked).
3.  Observe the pop-up at the bottom:
    - It should show the title as `[Polish Name] / [English Name]`.
    - It should show the description as `[Polish Desc] / [English Desc]`.
    - It should stay visible for 4 seconds.
4.  Verify that completing a quiz and unlocking a *new* badge still triggers the standard "Badge unlocked!" notification (single language based on settings).

## Badge Conditions Reference

| Badge Name | Condition |
|---|---|
| First step | `totalQuizzes >= 1` |
| Week of fire | `currentStreak >= 7` |
| Month of power | `currentStreak >= 30` |
| Century | `totalAnswered >= 100` |
| Five hundred | `totalAnswered >= 500` |
| Perfection | `hadPerfectQuiz` (100% score) |
| PMP Ready | `avg30 >= 80` |
| Dress Rehearsal | `trialCount >= 1` |
| PMP Marathon | `trialFullDone` (180 questions) |
| Above Target | `trialBest >= 80` |
| Time Master | `trialBeatClock` (>= 25% time left) |
