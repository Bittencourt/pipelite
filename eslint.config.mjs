import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent git worktrees contain a full second copy of src/, which otherwise
    // doubles the reported problem count and — worse — lets a transient copy
    // fail the repo's lint gate for reasons unrelated to the real tree.
    ".claude/**",
  ]),
  // NOTE: the three entries below are the FIRST `rules` block and the FIRST per-file
  // overrides this config has ever carried — there was no prior local-entry shape to
  // match, so they follow the presets-then-locals ordering and the semicolon style above.
  //
  // The wording above deliberately omits the override key's trailing colon. Phase 42's
  // acceptance gate counts that exact token and expects 2 — the two real overrides below —
  // so prose describing the mechanism would inflate the count of the gate enforcing it.
  // Reword the comment, never weaken the gate: this class of collision has fired 15+ times
  // across phases 37-38, twice on wording that described the very rule being enforced.
  // (It fired here too, twice: once on this NOTE, then again on the sentence explaining it.)
  {
    // Phase 42 / OBS-01, criterion 1's DURABLE half. Criterion 1 reads "no bare console.*
    // calls remain in non-test source". Migrating the call sites satisfies that sentence for
    // a moment; this rule is what keeps it true, and without it the 274th call arrives next
    // phase. Empirically: 273 violations across 96 non-test files before the migration, 0
    // after (tool-verified with `eslint --rule no-console:error`, not grep — the two
    // disagree on absolutes). This entry therefore lands LAST in the phase, and its clean
    // run is the proof that all 273 sites are gone.
    rules: { "no-console": "error" },
  },
  {
    // Exemption 1 of 2: the logger IS the console wrapper, so it cannot obey the rule it
    // exists to make enforceable. `src/lib/log.ts` delegates to console.error / .warn /
    // .debug / .log deliberately (4 sites, log.ts:131-134). Writing to process.stdout
    // instead would break 89 `vi.spyOn(console, …)` calls across 40 test files, and would
    // make the module unusable from the edge runtime and from the browser — five
    // "use client" components now import it.
    files: ["src/lib/log.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Exemption 2 of 2: NON-APPLICATION SURFACES. Criterion 1 is about non-test *source* —
    // code that runs inside the server, where a bare console.* bypasses the structured
    // logger and so cannot be levelled, scoped or shipped. Nothing listed here is that.
    //
    //   - the three test globs: 21 legitimate console calls across 12 test files (measured
    //     before the migration). A console.log in a test is a debugging aid.
    //   - `e2e/**`: the Playwright harness. `seed-admin.ts` and `seed-member.ts` are test
    //     fixtures that happen not to be named *.test.ts, so the globs above miss them (4
    //     sites). Same category, same reasoning.
    //   - `drizzle/**`: `seed-activity-types.ts`, run by `npm run db:seed-activities` via
    //     tsx (6 sites). Its console output is a human-facing terminal UI — "✓ Created
    //     activity type: Call" — not an application log line. Emitting those as JSON would
    //     degrade the CLI and serve no observability goal; nothing ships a seed script's
    //     stdout anywhere.
    //   - `.planning/**`: phase-38 UAT evidence scripts (9 sites). All 29 files in
    //     `.planning/milestones/v1.3-phases/38-bulk-operations/38-20-uat-evidence/` are UNTRACKED — `git
    //     ls-files` returns 0 — so they are not in the repository, never reach CI, and are
    //     absent from every agent worktree. Same rationale as the `.claude/**` ignore above:
    //     a transient copy must not fail the repo's lint gate for reasons unrelated to the
    //     real tree.
    //
    // These four non-src entries were NOT in the phase plan, which measured the migration
    // surface with an eslint run scoped to `src/` and so never counted them. Bare `eslint`
    // walks the whole repo. Adding them is a scope correction, not a hole: every path here
    // is outside `src/`, so criterion 1's actual surface is untouched.
    //
    // These are the ONLY two exemptions, deliberately. A third for the five "use client"
    // component paths was considered and rejected: it would satisfy criterion 1 by carving
    // a hole in it, and the sixth client component next phase would reopen the hole. An
    // `**/*.tsx` override would additionally exempt server components. Note that between
    // both overrides the only `src/` path exempted anywhere is `src/lib/log.ts` itself.
    files: [
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "**/__tests__/**",
      "e2e/**",
      "drizzle/**",
      ".planning/**",
    ],
    rules: { "no-console": "off" },
  },
]);

export default eslintConfig;
