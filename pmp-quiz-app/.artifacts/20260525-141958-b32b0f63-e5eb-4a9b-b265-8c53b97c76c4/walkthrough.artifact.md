# Walkthrough - Move Back Button to Bottom and Refactor Styling

I have moved the "Back" button from the top of the screens to the bottom and updated its styling to match the primary buttons but with a gray color.

## Changes

### [styles.css](file:///C:/dev/pmp-quiz/pmp-quiz-app/styles.css)
- Added `.btn-gray` class for standalone full-width buttons with adjusted `margin-top: 4px` to match container spacing.
- Updated `.btn-secondary` for consistency with primary buttons.
- Removed the unused `.btn-back` class.

### [app.js](file:///C:/dev/pmp-quiz/pmp-quiz-app/app.js)
- Moved the "Back" button to the bottom in `mode-select`, `trial-setup`, and `stats` views.
- Removed the "Back" button from the top of `trial-result` (the bottom already has a "Back to menu" button).
- Applied the new `btn-gray` class to these buttons.

### [privacy-policy.html](file:///C:/dev/pmp-quiz/pmp-quiz-app/privacy-policy.html)
- Moved the "Back" link from the top to the bottom of the page.
- Updated its styling to match the new `btn-gray` button style.

## Verification Results

### Manual Verification
- Verified all "Back" buttons in `app.js` are now at the bottom and styled as gray buttons.
- Verified `privacy-policy.html` back link is at the bottom and styled as a button.
- Confirmed no remaining usages of the old `.btn-back` class.
