# Analysis Redesign + Checker/Diagnosis Reliability Design

## Scope
- Redesign the "analyze correction" output into explicit learning blocks `F/G/H/I`.
- Keep existing fields unchanged in the UI flow:
  - notebook selector
  - grade/semester
  - paper level
- Support root-cause dialogue in both places:
  - during analysis (before save)
  - in error-item detail (after save)
- Fix current checker/diagnosis quality issues in one iteration (`P0 + P1 + P2`).

## Goals
- Remove duplicate answer/analysis presentation and reduce cognitive load.
- Separate "standard solution" from "student mistake path" explicitly.
- Ensure checker outputs are trustworthy; avoid false confidence.
- Keep backend internal diagnosis candidates hidden from students.

## Non-Goals
- Multi-problem auto splitting (out of MVP scope).
- Changing notebook/grade/paper workflows.
- Introducing a new standalone microservice for symbolic math in this iteration.

## Current Problems
- `answerText` semantic conflict: prompt defines it as correct answer, checker treats it as student answer source.
- Fraction/expression extraction is too weak for powers, brackets, and LaTeX forms.
- Diagnosis often mirrors checker diff text without robust step-level evidence.
- Analysis editor duplicates content across left and right panes.

## Information Architecture (Student-Facing)
- `F Knowledge Points`
  - tags (1-3), each with short evidence and confidence.
- `G Standard Solution`
  - final answer + clear step-by-step standard method.
- `H Mistake Localization`
  - extracted student steps, first wrong step, why wrong, and local fix.
- `I Root Cause (Self-Diagnosis)`
  - student hypothesis, confirmed cause, and short chat summary.

## Internal Data (Hidden from Student)
- Checker evidence and intermediate results.
- Diagnosis internal candidates and triggers.
- Engine metadata and confidence notes.

## Data Model Strategy
No new table is required for this phase. Reuse existing JSON columns with versioned schemas.

- `structuredJson` (upgrade to `v2` shape, backward compatible)
  - existing `problem` / `student` kept
  - add:
    - `knowledge`
    - `solution`
    - `mistake`
    - `rootCause`
- `checkerJson` (upgrade to `rule_v2`)
  - explicit inputs:
    - `standard_answer` from standard-solution block
    - `student_answer` from extracted student result/step, not from `answerText`
  - strict `checkable` downgrade when parse confidence is low.
- `diagnosisJson`
  - internal candidates + evidence map + engine metadata.
  - does not drive direct student display.

## API Changes
- Keep: `POST /api/analyze`
  - return current fields plus `structuredJson v2` draft (F/G/H prepared, I empty).
- Keep: `POST /api/error-items`
  - persist `structuredJson v2`.
  - regenerate checker/diagnosis using new semantics.
- Add: `POST /api/root-cause-chat`
  - for unsaved analysis flow (stateless context from editor data).
- Add: `POST /api/error-items/:id/root-cause-chat`
  - for saved item detail flow.
- Keep: `PUT /api/error-items/:id`
  - allow persisting `rootCause.studentHypothesis` and `rootCause.confirmedCause`.

## Prompt Strategy
- Split responsibilities:
  - analysis prompt -> produce `F/G/H` structure.
  - root-cause chat prompt -> Socratic guidance only.
- Knowledge-point constraints:
  - LLM can only choose from prompt-injected system whitelist tags.
  - user custom tags stay as manual edit capability in UI, not AI auto-output.
- Mistake-localization constraints:
  - must identify wrong step index, quote evidence, and provide local correction.

## UI Changes
### Analysis Editor
- Keep existing image/notebook/grade/paper controls unchanged.
- Replace duplicate blocks with one canonical editor flow:
  - question content
  - knowledge points
  - standard solution
  - mistake localization
  - root-cause self-diagnosis entry button
- Keep source/render toggle for math-heavy fields.

### Error Item Detail
- Student-facing diagnosis card shows:
  - mistake localization summary
  - confirmed root cause
  - "continue self-diagnosis" action (opens side panel)
- Internal diagnosis candidates are not shown to students.

### Root-Cause Dialogue Panel
- Side drawer interaction in both analysis and detail pages.
- Assistant behavior: ask one focused reflective question each turn.
- End state: user confirms final cause; save to `structuredJson.rootCause.confirmedCause`.

## Checker/Diagnosis Fix Plan
### P0 Accuracy
- Stop parsing student answer from `answerText`.
- Normalize math expressions before evaluation (`\\frac`, powers, bracket forms).
- If parsing is ambiguous, set `checkable=false` with explicit reason.

### P1 Reliability
- Build diagnosis from:
  - checker result (only when trustworthy),
  - mistake-localization evidence.
- Require evidence pointers to concrete step strings.

### P2 Coverage
- Expand rule coverage for common primary/junior-high math patterns:
  - linear equation variants
  - ratio/proportion variants
  - fraction arithmetic with power/brackets normalization
  - basic signed-number arithmetic chains

## Error Handling
- If analyze returns partial structure:
  - keep editable draft with missing-field warnings.
- If checker cannot safely evaluate:
  - do not output "incorrect/correct", only "not reliably checkable".
- If root-cause chat fails:
  - keep current draft cause text and allow manual confirmation.

## Testing Plan
- Unit tests:
  - math normalization and parser cases.
  - checker semantic-source correctness (standard vs student separation).
  - diagnosis evidence integrity checks.
- Integration tests:
  - upload -> analyze -> save -> detail reload.
  - analysis-page root-cause chat and save path.
  - detail-page root-cause chat and confirm path.
- Regression checks:
  - notebook/grade/paper behavior unchanged.
  - hidden internal candidates never rendered in student view.

## Rollout Notes
- Backward compatibility:
  - if `structuredJson` is old shape, derive fallback display from legacy fields.
- No persistent-disk dependency introduced.
- Subject remains math-only.

