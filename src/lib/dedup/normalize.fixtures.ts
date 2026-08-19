/**
 * THE ORGANIZATION-NORMALIZATION CASE TABLE — the single source of truth for what
 * "the TypeScript mirror and the SQL function agree" MEANS.
 *
 * This file is deliberately NOT named `*.test.ts`. Vitest's include glob is
 * `src/**\/*.{test,spec}.?(c|m)[jt]s?(x)` (vitest.config.ts), so a `.fixtures.ts` file is never
 * collected as a suite and can be imported by anything without side effects. Same reasoning as
 * `src/components/custom-fields/__tests__/source-scan.ts`.
 *
 * TWO consumers, and that is the whole point:
 *   1. `normalize.test.ts` runs every row through `normalizeOrgName`;
 *   2. `scripts/dedup-checks.sql` (plan 39-05) asserts the SAME rows against
 *      `public.dedup_norm_org` in Postgres.
 * Drift between the TypeScript rules and the SQL rules is therefore a failing assertion rather
 * than a silent halving of scan recall. When a row is added here it MUST be added there too.
 *
 * Rows 1-4 are outputs measured against the live database on 2026-08-18 (39-RESEARCH § The
 * Matching Layer). The rest encode ordering and guard decisions made in plan 39-01.
 */
export const NORMALIZATION_CASES: readonly { name: string; input: string; expected: string }[] =
  Object.freeze([
    // --- measured against the live database (39-RESEARCH) ---
    {
      name: "strips a single trailing LTDA",
      input: "COGUMELO INDUSTRIA E COMERCIO LTDA",
      expected: "cogumelo industria e comercio",
    },
    {
      name: "strips two stacked suffixes (LTDA ME)",
      input: "AUTO POSTO MR DA TAQUARA LTDA ME",
      expected: "auto posto mr da taquara",
    },
    {
      name: "folds accents",
      input: "Condomínio do Edifício Internacional RIo",
      expected: "condominio do edificio internacional rio",
    },
    {
      name: "collapses punctuation and ampersands to single spaces",
      input: "Ramada Hotel & Suítes Recife Boa viagem",
      expected: "ramada hotel suites recife boa viagem",
    },

    // --- the `S A` ordering decision: the two-token form is joined BEFORE the suffix pass ---
    {
      name: "joins a spaced S A into SA and then strips it",
      input: "UNIAO DE LOJAS LEADER S A",
      expected: "uniao de lojas leader",
    },
    {
      name: "dotted S.A. reaches the same string as the spaced form",
      input: "Uniao de Lojas Leader S.A.",
      expected: "uniao de lojas leader",
    },

    // --- the article guard: a standalone `a` and a standalone `s` are NOT noise ---
    {
      name: "keeps a standalone Portuguese article `a`",
      input: "CASA A CASA",
      expected: "casa a casa",
    },
    {
      name: "keeps a standalone `s`",
      input: "LOJA S DO NORTE",
      expected: "loja s do norte",
    },

    // --- degenerate input ---
    { name: "empty string stays empty", input: "", expected: "" },
    { name: "punctuation-only collapses to empty", input: "###", expected: "" },
    { name: "whitespace-only collapses to empty", input: "   \t  ", expected: "" },
    {
      name: "strips a bare SA suffix — the org half of the Sa/Sá divergence",
      input: "LOJAS SA",
      expected: "lojas",
    },
    {
      name: "a name that is nothing but a suffix normalizes to empty",
      input: "LTDA",
      expected: "",
    },
  ])
