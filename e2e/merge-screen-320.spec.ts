/**
 * SC-3 — the merge screen has no horizontal overflow at a 320px viewport, in all three locales.
 *
 * 39-UI-SPEC R-2 calls this "the single most valuable verification in the phase", and the reason is
 * specific rather than rhetorical: `/duplicates/[pairId]` is the one surface in this phase where a
 * side-by-side layout would have failed, and a Playwright spec is the only instrument in this repo
 * that measures real layout. There is no jsdom here (39-VALIDATION V-7), and jsdom computes no
 * layout anyway — every width it reports is zero.
 *
 * The rules below are the same ones `e2e/viewport-320.spec.ts` states, and they are restated rather
 * than referenced because each one is a trap a future edit can walk into:
 *
 *   - The 305 rather than 320 comes from `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }`
 *     in playwright.config.ts. Without it headless Chromium reports clientWidth 320 and this whole
 *     file green-lights a layout that still scrolls sideways on a real phone.
 *   - The viewport is neither declared nor changed here — the chromium project already supplies
 *     320x640. Resizing mid-run is deliberately absent as well: `@dnd-kit/core` wires the window
 *     `Resize` event to its drag-cancel handler, so a programmatic resize is a hazard that must not
 *     become a habit anywhere under e2e/.
 *   - No login happens here. The session arrives from the setup project's storageState
 *     (`e2e/.auth/admin.json`, gitignored — it is a live 7-day session cookie). Never inline a
 *     credential of any kind, and never add one to this file. That rule is stated in exactly these
 *     words on purpose: the plan's acceptance criterion greps this file for the eight-letter noun for
 *     a login secret and requires ZERO occurrences, so writing the rule out with that noun in it
 *     would have failed the very check the rule exists to satisfy. Deleting the sentence would pass
 *     too, and would be the wrong fix.
 *   - Imports use relative paths, not `@/…`: Playwright does not read vitest's alias table and
 *     playwright.config.ts declares none.
 *   - The anchor strings are READ FROM THE MESSAGE CATALOG rather than hardcoded, so a copy change
 *     in `src/messages` cannot silently turn the anti-vacuity gate off (39-VALIDATION V-3).
 *
 * THE FIXTURE RULE (39-VALIDATION V-4, the posture `e2e/deals-drag.spec.ts` established in 45-08).
 * This spec runs against the live development database, which holds 46,054 real organizations. It
 * therefore CREATES the pair it measures, hard-deletes both records and the pair row afterwards, and
 * asserts that nothing carrying its prefix is left behind. No real user record is read, mutated or
 * deleted, and the two fixture organizations are named so that a fixture stranded by a crashed run is
 * recognisable and reclaimable — `beforeAll` purges before it inserts, for exactly that case.
 *
 * TEARDOWN IS NOT THE MERGE. Pressing Merge would be a shorter way to end up with one record instead
 * of two, and it is forbidden here: a spec must not depend on the feature it is measuring, and the
 * merge is not reversible — `dedup.merge.confirmBody` says so in the product's own words ("You can
 * restore {loser} from Trash, but the merge itself isn't undone"). Teardown is two DELETEs.
 */

import { expect, test } from "@playwright/test"
import postgres from "postgres"

import en from "../src/messages/en-US.json"
import es from "../src/messages/es-ES.json"
import pt from "../src/messages/pt-BR.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"

/**
 * Only the keys this file reads, declared narrowly rather than as `typeof en` so the three catalogs
 * stay assignable without an `any` cast — `viewport-320.spec.ts`'s `AnchorCatalog` shape, scoped to
 * the one heading this screen renders.
 */
interface AnchorCatalog {
  dedup: { merge: { title: string } }
}

/** The locale values `src/i18n/request.ts` compares against; anything else falls back to en-US. */
const CATALOG: Record<string, AnchorCatalog> = {
  "en-US": en,
  "pt-BR": pt,
  "es-ES": es,
}

/**
 * One prefix, on both fixture organizations, and the teardown assertion is written against it. It is
 * deliberately unmistakable: a human who finds one of these in `/organizations` knows immediately
 * that it is machinery and not data.
 */
const FIXTURE_PREFIX = "[e2e] Merge Screen"

/**
 * The fixture pair, shaped so the merge screen has something to render in ALL THREE of its field
 * groups (39-UI-SPEC M-3) — a screen with only conflicts would leave two thirds of the layout
 * unmeasured:
 *
 *   conflicts   `name` and `website`  — both sides populated and different
 *   filledOnly  `notes`               — the SURVIVOR is empty and the loser is not
 *   identical   `industry`, `defaultCurrency` — equal on both sides
 *
 * WHICH RECORD SURVIVES IS CONTROLLED THROUGH `created_at`, NOT ASSUMED. `page.tsx` pre-selects the
 * OLDER record (M-2), so ALPHA is inserted 400 days old and BETA 10 days old. That ordering is what
 * puts `notes` in the filled-only group rather than making it identical: the group a field lands in
 * depends on which side is the survivor, so a fixture that did not pin the survivor would measure a
 * different screen whenever the default changed.
 *
 * The long values are load-bearing too. A 100-character unbroken URL and an 85-character name are
 * what put the option cards under realistic pressure at 241px of content width; two short strings
 * would measure a layout no real duplicate pair produces, and `min-w-0` + `break-words` (R-4) is
 * precisely the wiring that fails without them.
 */
const ALPHA_NAME = `${FIXTURE_PREFIX} Alpha Comercial e Distribuidora de Materiais de Construcao Ltda`
const BETA_NAME = `${FIXTURE_PREFIX} Alpha Comercial & Distribuidora de Materiais de Construcao LTDA ME`
const ALPHA_WEBSITE =
  "https://alpha-e2e-fixture.example.com/institucional/quem-somos/unidade-central?utm_source=merge-screen-320"
const BETA_WEBSITE = "https://beta-e2e-fixture.example.com/sobre-a-empresa/contato"
const SHARED_INDUSTRY = "Construction materials wholesale"
const BETA_NOTES =
  "Importado da planilha antiga em 2019-03-11 pela equipe financeira; mantido apenas para referencia historica."

interface Fixture {
  pairId: string
  alphaId: string
  betaId: string
}

let fixture: Fixture

function openDb() {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "E2E_DATABASE_URL is not set. It must point at the HOST-mapped dev Postgres " +
        "(localhost:5433); the app-facing DATABASE_URL resolves postgres:5432 inside the " +
        "Docker network and is unreachable from here."
    )
  }

  // The same loopback allow-list `e2e/seed-admin.ts` and `e2e/deals-drag.spec.ts` apply, repeated
  // rather than imported because it is a GUARD: this file INSERTs and DELETEs rows, so it must be
  // impossible to aim at a shared or production database. A loopback host is the one place the
  // operator provably owns the target.
  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "The merge-screen fixture refuses to write anywhere but localhost / 127.0.0.1."
    )
  }

  return postgres(connectionString)
}

/**
 * Delete every trace of the fixture, pair row FIRST.
 *
 * `duplicate_pairs` carries NO foreign key on either record id (the schema records why: one column
 * would have to point at two tables), so the database cannot enforce this order — which is exactly
 * why the order is written down here. Deleting the organizations first would leave a pair row
 * pointing at two rows that no longer exist, and the next run's `count(*)` parity check would report
 * it as contamination.
 *
 * Scoped strictly to the two fixture names. It can touch nothing else, and in particular it never
 * deletes by `like '[e2e]%'`, which would reach `deals-drag.spec.ts`'s fixtures too.
 */
async function purgeFixture(sql: ReturnType<typeof openDb>) {
  const rows = await sql<{ id: string }[]>`
    select id from organizations where name in (${ALPHA_NAME}, ${BETA_NAME})
  `
  const ids = rows.map((row) => row.id)
  if (ids.length === 0) return

  await sql`
    delete from duplicate_pairs
    where record_a_id in ${sql(ids)} or record_b_id in ${sql(ids)}
  `
  // Nothing in this spec performs an audited action, so this is belt-and-braces against a run that
  // was interrupted after a human had clicked something — it is scoped to the fixture ids.
  await sql`delete from audit_log where entity_type = 'organization' and entity_id in ${sql(ids)}`
  await sql`delete from organizations where id in ${sql(ids)}`
}

test.beforeAll(async () => {
  const sql = openDb()
  try {
    await purgeFixture(sql)

    const [owner] = await sql<{ id: string }[]>`
      select id from users where email = ${E2E_ADMIN_EMAIL} limit 1
    `
    expect(
      owner,
      `the seeded e2e admin ${E2E_ADMIN_EMAIL} is missing — run the setup project first`
    ).toBeTruthy()

    // `owner_id` is NOT NULL with a foreign key to `users`, and `norm_name` is GENERATED ALWAYS —
    // the database maintains it from `name` and an INSERT that named it would be rejected.
    const [alpha] = await sql<{ id: string }[]>`
      insert into organizations (id, name, website, industry, notes, owner_id, default_currency, created_at)
      values (
        gen_random_uuid()::text, ${ALPHA_NAME}, ${ALPHA_WEBSITE}, ${SHARED_INDUSTRY},
        null, ${owner.id}, 'USD', now() - interval '400 days'
      )
      returning id
    `
    const [beta] = await sql<{ id: string }[]>`
      insert into organizations (id, name, website, industry, notes, owner_id, default_currency, created_at)
      values (
        gen_random_uuid()::text, ${BETA_NAME}, ${BETA_WEBSITE}, ${SHARED_INDUSTRY},
        ${BETA_NOTES}, ${owner.id}, 'USD', now() - interval '10 days'
      )
      returning id
    `

    /**
     * CANONICAL ORDERING, and it is RULE 1 of `src/db/schema/duplicate-pairs.ts` rather than a
     * detail: `record_a_id` is always the lexicographically smaller id. Nothing in the database
     * enforces it, and `duplicate_pairs_uniq` is only as good as the writers' obedience — a pair
     * inserted the other way round is a different key, which is how a dismissal gets bypassed. Two
     * `gen_random_uuid()` values arrive in no particular order, so they are sorted here rather than
     * hoped about.
     */
    const [low, high] = [alpha.id, beta.id].sort()

    const [pair] = await sql<{ id: string }[]>`
      insert into duplicate_pairs (id, entity_type, record_a_id, record_b_id, tier, reason, score, status)
      values (
        gen_random_uuid()::text, 'organization', ${low}, ${high}, 'likely', 'similarName', 0.91, 'open'
      )
      returning id
    `

    fixture = { pairId: pair.id, alphaId: alpha.id, betaId: beta.id }
  } finally {
    await sql.end()
  }
})

test.afterAll(async () => {
  const sql = openDb()
  try {
    await purgeFixture(sql)

    // TEARDOWN PROVEN, NOT PERFORMED-AND-TRUSTED. A `delete` that matched nothing and a `delete`
    // that matched everything both exit cleanly.
    const [orgs] = await sql<{ count: string }[]>`
      select count(*)::text as count from organizations where name like ${FIXTURE_PREFIX + "%"}
    `
    expect(Number(orgs.count), "fixture organizations were left behind").toBe(0)

    const [pairs] = await sql<{ count: string }[]>`
      select count(*)::text as count from duplicate_pairs
      where record_a_id = ${fixture.alphaId} or record_b_id = ${fixture.alphaId}
         or record_a_id = ${fixture.betaId} or record_b_id = ${fixture.betaId}
    `
    expect(Number(pairs.count), "the fixture pair row was left behind").toBe(0)
  } finally {
    await sql.end()
  }
})

for (const [locale, messages] of Object.entries(CATALOG)) {
  test(`/duplicates/[pairId] @ ${locale} has no horizontal overflow at the mobile viewport`, async ({
    page,
    context,
    baseURL,
  }) => {
    expect(baseURL, "playwright.config.ts must define use.baseURL").toBeTruthy()

    // Locale is a plain cookie read server-side by src/i18n/request.ts — no UI navigation and no
    // /[locale] route segment are involved. Setting it via `url` lets Playwright derive the domain
    // and path from the base URL the whole harness already agrees on.
    await context.addCookies([{ name: "locale", value: locale, url: String(baseURL) }])

    await page.goto(`/duplicates/${fixture.pairId}`)

    /**
     * ANCHOR 1 — THE REAL AUTHENTICATED MERGE SCREEN RENDERED, IN THIS LOCALE. DO NOT DELETE.
     *
     * A blank 200, an error page, and the `/login` and `/?error=unauthorized` redirects the
     * `/duplicates` layout gate issues ALL satisfy `scrollWidth <= clientWidth`, so the measurement
     * below closes none of those holes. A locale-DEPENDENT `h1`, located BY ROLE, closes all of
     * them at once: it can only be visible if the page rendered AND rendered in the expected locale.
     *
     * Role-based rather than a bare text matcher for the reason `viewport-320.spec.ts` records:
     * `CommandDialog`'s `DialogHeader` is a sibling of `DialogContent`, so its sr-only title renders
     * into the page whenever a CommandDialog is mounted and a loose text matcher can collide with it.
     */
    await expect(
      page.getByRole("heading", { level: 1, name: messages.dedup.merge.title })
    ).toBeVisible()

    /**
     * ANCHOR 2 — THE CONFLICTS GROUP RENDERED, WITH THIS FIXTURE'S VALUES IN IT.
     *
     * What this actually adds over anchor 1, stated honestly because the plan's premise for it is
     * wrong in one detail: the server's refusal state (`page.tsx`'s `goneState`, reached when
     * `getPairDetail` answers null) renders NO `h1` at all, so anchor 1 already distinguishes it.
     * What anchor 1 CANNOT distinguish is a merge screen whose field partition came back empty —
     * every heading and every wrapper would still render, the page would measure 305, and this file
     * would certify a layout with no option cards on it. That is the hole this closes, and it is the
     * one that matters, because the option cards are the only part of this screen whose width is
     * driven by stored data rather than by the shell.
     *
     * The locator proves TWO independent things about one element:
     *   - GROUP MEMBERSHIP, structurally. `FieldRow` derives each option's DOM id as
     *     `${baseId}-${group}-${index}-{survivor|loser}` and passes `group="conflict"` for the
     *     conflicts section only, so `[id*="-conflict-"][id$="-loser"]` cannot resolve to a card in
     *     the filled-only or survivor-selector groups. `baseId` is a React `useId` value and is
     *     deliberately not spelled here.
     *   - THAT THE CARD CARRIES A REAL FIXTURE VALUE, by filtering on the loser's website — a value
     *     that exists nowhere else on the page, and which is only in the CONFLICTS group because
     *     both sides populate `website` differently.
     *
     * The whole card is the label (M-5: the tap target is the card, not a 16px dot), which is why
     * the locator is the `label` and the radio is what it is matched by.
     */
    const conflictLoserCard = page
      .locator('label:has([role="radio"][id*="-conflict-"][id$="-loser"])')
      .filter({ hasText: BETA_WEBSITE })
    await expect(conflictLoserCard).toBeVisible()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    // The relation is the assertion; both numbers are REPORTED rather than hardcoded, so the failure
    // message carries the measurement and this file carries no magic width.
    expect(
      scrollWidth,
      `/duplicates/[pairId] @ ${locale}: horizontal overflow — scrollWidth ${scrollWidth} > clientWidth ${clientWidth} (overflow ${scrollWidth - clientWidth}px)`
    ).toBeLessThanOrEqual(clientWidth)
  })
}
