# 04 Need Further Discussion (Post-MVP Backlog)

This document records items intentionally excluded from MVP scope but requiring follow-up design and implementation decisions.

## 1) Knowledge Tag System Governance
**Current MVP behavior**
- AI analysis uses a two-stage flow and receives a tag list from DB as prompt context.
- If the model outputs unknown tags, backend auto-creates custom tags on save.
- This works functionally but can cause inconsistent naming and fragmented taxonomy when the standard tag library is weak or empty.

**Why deferred**
- MVP prioritized end-to-end usability over strict taxonomy control.

**Post-MVP direction**
- Prepare a cold-start canonical math tag set.
- Use subset retrieval (grade + semantic/top-N) instead of injecting the full list into prompt.
- Add normalization (alias/synonym mapping) before persistence.
- Optionally enforce strict mode: only allow tags from canonical list.

## 2) Checker and Diagnosis Reintroduction
**Current MVP behavior**
- Checker/Diagnosis generation and UI were disabled to reduce complexity and release risk.
- Error analysis now relies on structured LLM output (G/H/I) and manual editing.

**Why deferred**
- Existing checker/diagnosis logic had quality and reliability issues.
- Hard to guarantee correctness across mixed question types in MVP timeline.

**Post-MVP direction**
- Reintroduce for limited checkable math types first (fraction arithmetic, linear equations).
- Separate deterministic checker output from LLM explanation.
- Add regression tests with labeled examples before enabling by default.

## 3) Prompt Size and Tag Injection Cost
**Current MVP behavior**
- Available tags are injected into reason-stage prompt.
- Long tag lists increase latency/token usage and may reduce output stability.

**Why deferred**
- Current scale is acceptable for MVP.

**Post-MVP direction**
- Add retrieval-based candidate narrowing (top 20-40 tags).
- Cache candidate tags by grade/topic.
- Track token and latency metrics per request for optimization.

## 4) Root Cause Assistance UX (LLM Dialogue vs Manual)
**Current MVP behavior**
- Root-cause section is manual-first (student enters final cause directly).
- System hint is optional and non-blocking.

**Why deferred**
- Earlier side-panel dialogue version was not satisfactory and increased UX complexity.

**Post-MVP direction**
- Evaluate a lightweight Socratic assistant with explicit "copy to final cause" flow.
- Keep teacher/student control and avoid hidden auto-overwrite behavior.

## 5) Legacy Data Compatibility Strategy
**Current MVP behavior**
- Some pages now assume structured JSON as primary source.
- Backward compatibility with old/partial data was intentionally minimized during rapid iteration.

**Why deferred**
- MVP dataset is mostly test data and can be reset if needed.

**Post-MVP direction**
- Decide whether to keep hard cutover or add migration scripts.
- If needed, provide one-time data backfill tools and compatibility checks.

## 6) Review and Practice Dependence on Cause Grouping
**Current MVP behavior**
- "Group by Cause" and cause-dependent review paths were disabled with checker/diagnosis removal.

**Why deferred**
- Cause signals are not stable yet without reliable checker/diagnosis.

**Post-MVP direction**
- Re-enable after cause quality baseline is proven.
- Consider fallback grouping by canonical knowledge tags when cause is missing.

## 7) Deployment Hardening (Render and Supabase Ops)
**Current MVP behavior**
- Core flow runs on env-based config plus Supabase DB/Storage.
- Some operational hardening remains manual.

**Why deferred**
- Focus remained on feature correctness and UX.

**Post-MVP direction**
- Add deployment runbook, env validation checklist, and smoke tests.
- Add observability for image upload/signing failures and AI timeout/quota behavior.

## 8) Full i18n Completion (MVP keeps Chinese-only UI)
**Current MVP decision**
- MVP UI is Chinese-only by default, including buttons, filters, and prompts.
- Some newer notebook/filter text is intentionally written directly in Chinese instead of adding full bilingual keys.

**Why deferred**
- Full i18n key coverage and consistency cleanup costs time but does not block MVP core flow.
- Product priority is release speed and interaction quality, not bilingual polish.

**Post-MVP direction**
- Normalize all newly added Chinese hard-coded strings into translation keys.
- Complete and verify both `zh` and `en` namespaces for notebook/search/filter/batch actions.
- Add a lightweight i18n regression checklist to prevent missing keys in future UI changes.
