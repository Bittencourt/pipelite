# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-14)

**Core value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals, activities, and custom fields. Advanced features can be built externally via the API.
**Current focus:** v1.1 Reliability & Operations — Phase 17: TypeScript Cleanup

## Current Position

Milestone: v1.1 Reliability & Operations
Phase: 17 of 22 (TypeScript Cleanup)
Plan: 1 of 1 in current phase
Status: Phase 17 complete — ready for Phase 18
Last activity: 2026-03-14 — Phase 17 plan 01 complete (TypeScript cleanup)

Progress (v1.1): [█░░░░░░░░░] ~5% (1/~20 plans est.)

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 73 (v1.0)
- Average duration: 7min
- Total execution time: ~8.5 hours

**v1.1 By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 17. TypeScript Cleanup | 1 | ~15min | ~15min |
| 18. DB Infrastructure | TBD | - | - |
| 19. Webhook Reliability | TBD | - | - |
| 20. Import State Reliability | TBD | - | - |
| 21. Formula Reactivity | TBD | - | - |
| 22. Bulk Operations | TBD | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0 Phase 16]: In-memory Map for import state — won't survive restarts; Phase 20 replaces with DB-backed sessions
- [v1.0 Phase 10]: Webhook delivery is fire-and-forget via setTimeout — Phase 19 replaces with durable pg-boss queue
- [v1.0 Phase 7]: Formula fields evaluated client-side only — Phase 21 adds server-side evaluation on save
- [v1.1 Phase 17]: Removed `ignoreBuildErrors: true` from next.config.ts — tsc was already clean, removal safe; Docker build confirmed passing

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 19 (Webhook Reliability): Cron trigger mechanism for `api/internal/webhooks/process` needs a concrete decision before implementation — Docker cron service vs pg-boss self-scheduling. Decide during plan-phase.
- Phase 21 (Formula Reactivity): Formula recalc hook covers `saveFieldValues` (custom fields path). Non-custom entity fields (dealValue, closeDate) that formula expressions may reference go through a different save path — assess full dependency surface during plan-phase.

## Session Continuity

Last session: 2026-03-14
Stopped at: Completed 17-01-PLAN.md — Phase 17 TypeScript Cleanup done
Resume file: None

---
*State updated: 2026-03-14 — Phase 17 complete, ready for Phase 18*
