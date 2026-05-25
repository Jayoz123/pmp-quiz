# Move Back Button to Bottom and Refactor Styling

This plan outlines the changes to move the "Back" button from the top of various screens to the bottom, and to update its styling to match the primary buttons (like "Start" and "Trial Exam") but with a gray color.

## Proposed Changes

### [CSS Component]
Create a new `.btn-gray` class for standalone full-width buttons and update `.btn-secondary` for consistency.

#### [styles.css](file:///C:/dev/pmp-quiz/pmp-quiz-app/styles.css)
- Add `.btn-gray` class with `width: 100%`, `font-size: 1rem`, and `background: var(--surface2)`.
- Update `.btn-secondary` to have `font-size: 1rem` and transition effects to match `.btn-primary`.
- (Optional) Remove `.btn-back` if no longer used after all replacements.

```css
.btn-gray {
  width: 100%;
  padding: 14px;
  background: var(--surface2);
  color: var(--text);
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  transition: background var(--transition), transform var(--transition);
  text-align: center;
  border: none;
  cursor: pointer;
  font-family: inherit;
  margin-top: 12px;
}
.btn-gray:active { transform: scale(0.98); background: var(--border); }
```

---

### [App Logic Component]
Update views in `app.js` to move the back button.

#### [app.js](file:///C:/dev/pmp-quiz/pmp-quiz-app/app.js)
- **`Views['mode-select']`**: Move back button to the bottom, change class to `btn-gray`.
- **`Views['trial-setup']`**: Move back button to the bottom, change class to `btn-gray`.
- **`Views['trial-result']`**: Remove back button from the top. The bottom already has a "Back to menu" button.
- **`Views.stats`**: Move back button to the bottom, change class to `btn-gray`.

---

### [Static Content Component]
Update the privacy policy page.

#### [privacy-policy.html](file:///C:/dev/pmp-quiz/pmp-quiz-app/privacy-policy.html)
- Move the back link to the bottom of the main content.
- Update its class to `btn-gray` and update internal CSS to match the new style.

## Verification Plan

### Automated Tests
- None available for UI layout changes.

### Manual Verification
1. Open the app and navigate to "Szybki Quiz" (`mode-select`).
   - Verify "Back" is at the bottom and gray.
   - Verify clicking it returns to Home.
2. Navigate to "Trial Exam" setup (`trial-setup`).
   - Verify "Back" is at the bottom and gray.
   - Verify clicking it returns to Home.
3. Complete a Trial Exam or navigate to results (`trial-result`).
   - Verify no "Back" button at the top.
   - Verify "Back to menu" at the bottom still works.
4. Navigate to "Statystyki" (`stats`).
   - Verify "Back" is at the bottom and gray.
   - Verify clicking it returns to Home.
5. Open "Polityka prywatności" from settings.
   - Verify "Wróć do aplikacji" is at the bottom and styled as a button.
