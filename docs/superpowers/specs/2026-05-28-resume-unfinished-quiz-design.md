# Resume Unfinished Quiz Design

## Context

The app already keeps the current quiz session in memory (`AppState.quizSession`) and has a separate persisted `trial_session` flow for Trial Exam. Standard quiz modes (`quick`, `daily`, `weak`) are lost when the user exits the quiz view or reloads the app. The requested feature adds a resume affordance for an unfinished standard quiz on the home screen.

## Goals

- Persist an unfinished standard quiz only after the first answer is submitted.
- Show a resume tile on the home screen only while a persisted unfinished standard quiz exists.
- Place that tile as the first item in the home menu, matching the selected visual direction B.
- When the user starts another standard quiz while one is unfinished, ask whether to discard the previous session and start the new one or resume the previous session.
- Clear the persisted session when the quiz is completed or explicitly discarded.

## Non-Goals

- Do not change Trial Exam persistence or timer behavior.
- Do not sync unfinished quiz sessions across devices.
- Do not create a resume tile before the user answers at least one question.
- Do not record abandoned unfinished quizzes in quiz history or engagement scoring.

## User Experience

Home screen:

- If there is no unfinished standard quiz, the home menu stays unchanged.
- If there is an unfinished standard quiz, the first menu item becomes a highlighted "return to quiz" tile.
- The tile shows the mode label and progress, for example "Szybki Quiz, 4 / 10".
- Clicking the tile restores the saved session and navigates to the normal quiz view at the next unanswered question.

Starting a new quiz:

- If no persisted unfinished session exists, the selected quiz starts normally.
- If a persisted unfinished session exists and the user starts any standard quiz from the home or mode-select flow, the app opens a modal.
- The modal offers two actions:
  - Resume the previous quiz.
  - End the previous session and start the newly requested quiz.

Abandoning a quiz:

- If the user leaves a quiz before the first answer, no resume state is created.
- If the user leaves after at least one answer, the persisted unfinished session remains and appears on the home screen.
- If the user chooses to discard the previous session from the new-quiz modal, the persisted session is removed.
- If the user leaves after answering a question but before pressing "Next", resuming continues from the next unanswered question. This avoids showing the same answered question as answerable again.

## Data Model

Add a new localStorage key:

- `active_quiz_session`

The stored object mirrors the fields needed by `Views.quiz`:

- `sessionId`
- `questions`
- `current` as the next unanswered question index
- `answers`
- `mode`
- `filters`
- `shuffledMap`
- `recentlyShown`
- `currentAnswer`
- `readinessBefore`

The session is considered resumable only when:

- `mode` is not `trial`
- `questions` is a non-empty array
- `answers` is a non-empty array
- `current` is lower than `questions.length`

## Architecture

Storage:

- Add `getActiveQuizSession`, `saveActiveQuizSession`, and `clearActiveQuizSession`.
- Add a validation helper so malformed localStorage data does not create a broken tile.

Quiz lifecycle:

- On `_processAnswer`, after the answer is appended, persist a resumable copy whose `current` points at the next unanswered question while leaving the in-memory session on the feedback view.
- On `_advance`, persist the updated session if it is not finished.
- On `_finishQuiz`, clear `active_quiz_session` before navigating to summary.
- On `_abandon`, keep the saved session if at least one answer exists; otherwise clear it.

Home view:

- Read the validated active session.
- Render the resume tile as the first menu item when present.
- Add a home action that loads the session into `AppState.quizSession` and navigates to `quiz`.

New quiz conflict handling:

- Before creating a new standard quiz session, check for a validated persisted active session.
- If one exists, save the pending new-session intent in memory and show a modal.
- Resume action loads the previous session.
- Start-new action clears the persisted session and executes the pending new-session intent.

## Error Handling

- Invalid JSON or malformed persisted data is ignored and cleared.
- If a saved session cannot be resumed because it lacks questions or progress, the tile is not shown.
- If a pending new-session intent becomes invalid, the modal closes and the app returns to the current screen without starting a broken quiz.

## Testing

Node logic tests should cover:

- `Storage` round-trips `active_quiz_session`.
- A session without answers is not resumable.
- A session with at least one answer and remaining questions is resumable.
- A completed session is not resumable.
- Clearing the active quiz session removes it from storage.

Manual/browser verification should cover:

- Start a quick quiz, answer one question, exit, and confirm the resume tile appears first in the home menu.
- Click the tile and confirm the quiz resumes at the expected question.
- Start another quiz while the old one is unfinished and confirm the modal choices work.
- Complete a resumed quiz and confirm the tile disappears.
