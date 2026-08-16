import { describe, it, expect } from "vitest"
import { runWithActor, getCurrentActor } from "./actor-context"
import type { AuditActor } from "./actor-context"

// Nothing is mocked in this file, by design. The REAL AsyncLocalStorage runs under
// vitest — the same approach as src/lib/execution/recursion.test.ts, the Phase 26 analog.
// Faking the storage would assert only that the fake works, not that the actor actually
// survives the shape this phase depends on (multi-await mutation -> synchronous emit ->
// non-async handler -> fire-and-forget insert).
//
// The "is anything mocked here" gate greps this file for the literal call, so this note
// deliberately avoids spelling it out — a gate its own comment can defeat proves nothing.

describe("audit actor context", () => {
  describe("runWithActor", () => {
    it("makes getCurrentActor return the actor for the scope", () => {
      const actor: AuditActor = { kind: "user", userId: "u1" }
      let captured: AuditActor | undefined
      runWithActor(actor, () => {
        captured = getCurrentActor()
      })
      expect(captured).toEqual({ kind: "user", userId: "u1" })
    })

    it("survives awaits inside an async function", async () => {
      let captured: AuditActor | undefined
      await runWithActor(
        { kind: "workflow_run", userId: null, workflowRunId: "run-1" },
        async () => {
          await new Promise((r) => setTimeout(r, 1))
          await new Promise((r) => setTimeout(r, 1))
          captured = getCurrentActor()
        }
      )
      expect(captured).toEqual({
        kind: "workflow_run",
        userId: null,
        workflowRunId: "run-1",
      })
    })

    it("nested calls use the inner actor and restore the outer one", () => {
      let outerBefore: AuditActor | undefined
      let inner: AuditActor | undefined
      let outerAfter: AuditActor | undefined
      runWithActor({ kind: "user", userId: "outer" }, () => {
        outerBefore = getCurrentActor()
        runWithActor({ kind: "api_key", userId: "inner" }, () => {
          inner = getCurrentActor()
        })
        outerAfter = getCurrentActor()
      })
      expect(outerBefore?.userId).toBe("outer")
      expect(inner).toEqual({ kind: "api_key", userId: "inner" })
      expect(outerAfter?.userId).toBe("outer")
      expect(outerAfter?.kind).toBe("user")
    })
  })

  describe("getCurrentActor outside any scope", () => {
    it("returns undefined rather than a fabricated system actor", () => {
      const actor = getCurrentActor()
      expect(actor).toBeUndefined()
      // Absence must stay distinguishable from a real actor whose kind is "system".
      // Mapping absence to "system" is the subscriber's single explicit line (36-11),
      // never a silent default at this layer (T-36-02, repudiation).
      expect(actor).not.toEqual({ kind: "system", userId: null })
      expect(actor?.kind).toBeUndefined()
    })

    it("returns undefined again after an awaited scope resolves", async () => {
      await runWithActor({ kind: "import", userId: "u9", importSessionId: "s1" }, async () => {
        await new Promise((r) => setTimeout(r, 1))
        expect(getCurrentActor()?.importSessionId).toBe("s1")
      })
      expect(getCurrentActor()).toBeUndefined()
    })
  })

  describe("concurrency", () => {
    it("keeps two concurrent scopes from observing each other's actor", async () => {
      const observed: Array<string | null | undefined> = []

      // A suspends on this until B has observed. Ordering is enforced by the handoff
      // rather than by racing two setTimeout durations — a wall-clock race reorders
      // under parallel suite load and would fail on the scheduler, not on the actor.
      let releaseA: () => void = () => {}
      const aMayObserve = new Promise<void>((resolve) => {
        releaseA = resolve
      })

      // Started WITHOUT awaiting, so both scopes are open at the same time and their
      // continuations interleave. Mirrors the RESEARCH probe's concurrent-A /
      // concurrent-B rows, which measured zero cross-contamination.
      const scopes = [
        runWithActor({ kind: "user", userId: "concurrent-A" }, async () => {
          await aMayObserve
          observed.push(getCurrentActor()?.userId)
          expect(getCurrentActor()?.userId).toBe("concurrent-A")
        }),
        runWithActor({ kind: "user", userId: "concurrent-B" }, async () => {
          await Promise.resolve()
          observed.push(getCurrentActor()?.userId)
          expect(getCurrentActor()?.userId).toBe("concurrent-B")
          releaseA()
        }),
      ]

      await Promise.all(scopes)

      expect(observed).toHaveLength(2)
      expect(observed).toContain("concurrent-A")
      expect(observed).toContain("concurrent-B")
      // B ran to completion while A sat suspended inside its own open scope, and A
      // still saw concurrent-A on resume — the two really did interleave.
      expect(observed[0]).toBe("concurrent-B")
      expect(getCurrentActor()).toBeUndefined()
    })
  })
})
