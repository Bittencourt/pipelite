/**
 * The last open UAT residual of milestone v1.3, closed by measurement rather than by association:
 *
 *   36-VERIFICATION: "Workflow run 'Records changed' list: dark mode, 320px viewport, es-ES and
 *   pt-BR" — STILL OPEN, because the 2026-08-18 re-run could not locate the surface in the
 *   workflow UI and carried it forward alone.
 *
 * The surface is `/workflows/[id]/runs/[runId]`, and the section is the one
 * `run-changed-records.tsx` renders. It is hard to reach by hand for a mundane reason: it only
 * renders inside a run that EXISTS, and a manual tester has to provoke a workflow run to get one.
 * That is exactly what a fixture is for, so this spec creates the run it measures.
 *
 * THE RULES BELOW ARE RESTATED FROM `e2e/viewport-320.spec.ts` AND `e2e/merge-screen-320.spec.ts`
 * rather than referenced, because each one is a trap a future edit can walk into:
 *
 *   - The 305 rather than 320 comes from `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }`
 *     in playwright.config.ts. Without it headless Chromium reports clientWidth 320 and this whole
 *     file green-lights a layout that still scrolls sideways on a real phone. Nothing here hardcodes
 *     a width: the RELATION is asserted and BOTH numbers are reported in the failure message.
 *   - The viewport is neither declared nor changed here — the chromium project already supplies
 *     320x640. Resizing mid-run is deliberately absent as well: `@dnd-kit/core` wires the window
 *     resize event to its drag-cancel handler, so a programmatic resize is a hazard that must not
 *     become a habit anywhere under e2e/.
 *   - No login happens here. The session arrives from the setup project's storageState. Never inline
 *     a login secret of any kind, and never add one to this file.
 *   - Imports use relative paths, not `@/…`: Playwright does not read vitest's alias table and
 *     playwright.config.ts declares none.
 *   - Anchor strings are READ FROM THE MESSAGE CATALOG rather than hardcoded, so a copy change in
 *     `src/messages` cannot silently turn the anti-vacuity gate off.
 *
 * THE `<h1>` ON THIS PAGE IS USELESS AS A LOCALE ANCHOR AND MUST NOT BE USED AS ONE. It is
 * `Run #{run.id.slice(0, 8)}` — a hardcoded English literal, by the declared i18n seam in
 * `page.tsx` (only the strings phase 36/41 authored go through a translator). The `<h2>` from
 * `audit.run.heading` is the anchor, and it is translated in all three catalogs: "Records changed"
 * / "Registros modificados" / "Registros alterados".
 *
 * WHY THE FIXTURE IS A *FAILED*, *DRY* RUN WITH A LINEAGE LINK. Those three flags are what make the
 * header row its widest: `status === "failed"` renders `ReplayRunButton` beside the title cluster,
 * `dry_run` adds `DryRunBadge`, and `replayed_from_run_id` adds a third item to the metadata row.
 * Measuring the easy header would certify a layout no failed run produces, and a failed run is
 * precisely the run an operator opens on a phone.
 *
 * AND WHY IT HAS TWO AUDIT ROWS RATHER THAN NONE. The heading renders in all three of the section's
 * states — loaded, empty, and failed-to-load — so an anchor on the heading alone would be satisfied
 * by an EMPTY box, which is a centred sentence that cannot overflow anything. The residual names the
 * LIST. So the fixture writes one audit row against a real organization with a long name (the
 * linkable row, whose title is the only part of this section whose width comes from stored data) and
 * one against a record id that does not exist (the unlinkable "Untitled record" row — `deleted`
 * precedence, no field count, and a second locale-dependent string).
 *
 * THE FIXTURE RULE (the posture `e2e/deals-drag.spec.ts` established in 45-08). This spec runs
 * against the live development database. It therefore CREATES everything it measures, deletes it
 * afterwards, and ASSERTS that nothing carrying its own identifiers is left behind. `beforeAll`
 * purges BEFORE it inserts, so a fixture stranded by a crashed run is reclaimable. Teardown is
 * scoped to this file's prefix and this file's row ids — never to `like '[e2e]%'`, which would reach
 * `merge-screen-320.spec.ts`, `org-duplicate-warning.spec.ts` and `views-fixtures.ts` as well.
 */

import { expect, test, type Page } from "@playwright/test"
import postgres from "postgres"

import en from "../src/messages/en-US.json"
import es from "../src/messages/es-ES.json"
import pt from "../src/messages/pt-BR.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"

/**
 * Only the two keys this file reads, declared narrowly rather than as `typeof en` so the three
 * catalogs stay assignable without an `any` cast — `viewport-320.spec.ts`'s `AnchorCatalog` shape.
 */
interface AnchorCatalog {
  audit: { run: { heading: string; untitledRecord: string } }
}

/** The locale values `src/i18n/request.ts` compares against; anything else falls back to en-US. */
const CATALOG: Record<string, AnchorCatalog> = {
  "en-US": en,
  "pt-BR": pt,
  "es-ES": es,
}

/**
 * This file's own prefix, distinct from every other e2e fixture prefix in the tree ("[e2e] Merge
 * Screen", "[e2e] Dup Warning", "[e2e] View"). Deliberately unmistakable: a human who finds one of
 * these in `/workflows` or `/organizations` knows immediately that it is machinery, not data.
 */
const FIXTURE_PREFIX = "[e2e] Run320"

const WORKFLOW_NAME = `${FIXTURE_PREFIX} Enriquecimento de organizacoes e aviso aos responsaveis`

/**
 * Long on purpose, and this is the one string in the fixture whose length is load-bearing: it is the
 * record title in the changed-records row, rendered with `min-w-0` + `break-words` inside a
 * `flex-wrap` row that also carries a badge, a field count and a timestamp. UI-SPEC's budget is
 * 241px of content on a `container` page (305px client width less 64px of `padding-inline`), and a
 * two-word fixture name would measure a row no real CRM record produces.
 */
const ORG_NAME = `${FIXTURE_PREFIX} Distribuidora Central de Equipamentos Industriais do Nordeste Ltda`

const ORG_INDUSTRY = "Industrial equipment distribution"

/**
 * Spaced prose, not an unbroken token. A 200-character string with no break opportunity would
 * overflow the failure banner for a reason that has nothing to do with the section under test, and
 * this spec must fail for the residual's reasons rather than its own fixture's.
 */
const RUN_ERROR =
  "HTTP 502 from the enrichment provider after 3 retries; the run stopped before the notification step."

/**
 * Three nodes, only two of which get step rows — so `page.tsx`'s skipped-node synthesis renders a
 * third row too. Long Portuguese labels for the same width reason as `ORG_NAME`.
 */
const NODES = [
  {
    id: "node-a",
    type: "update_record",
    label: "Atualizar organizacao com os dados do provedor",
  },
  { id: "node-b", type: "send_email", label: "Notificar o responsavel pela conta" },
  { id: "node-c", type: "create_activity", label: "Registrar atividade de acompanhamento" },
]

/** Three distinct keys → the linkable row reports "3 fields" / "3 campos". */
const AUDIT_CHANGES = {
  industry: { from: null, to: ORG_INDUSTRY },
  website: { from: null, to: "https://run320-fixture.example.com" },
  defaultCurrency: { from: "USD", to: "BRL" },
}

/** `attribute="class"` in `src/app/layout.tsx` means the resolved theme lands as a class on <html>. */
const DARK_CLASS = /(^|\s)dark(\s|$)/

/** next-themes' default storage key. Not configured anywhere in this app, so this is the default. */
const THEME_STORAGE_KEY = "theme"

interface Fixture {
  workflowId: string
  runId: string
  orgId: string
  /** An audit row's `entity_id` with no organization behind it — the "Untitled record" row. */
  ghostRecordId: string
}

let fixture: Fixture | undefined

function openDb() {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "E2E_DATABASE_URL is not set. It must point at the HOST-mapped dev Postgres " +
        "(localhost:5433); the app-facing DATABASE_URL resolves postgres:5432 inside the " +
        "Docker network and is unreachable from here."
    )
  }

  // The same loopback allow-list `e2e/seed-admin.ts` and `e2e/merge-screen-320.spec.ts` apply,
  // repeated rather than imported because it is a GUARD: this file INSERTs and DELETEs rows, so it
  // must be impossible to aim at a shared or production database. A loopback host is the one place
  // the operator provably owns the target.
  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "The workflow-run fixture refuses to write anywhere but localhost / 127.0.0.1."
    )
  }

  return postgres(connectionString)
}

/**
 * Delete every trace of the fixture, CHILDREN FIRST, and scoped strictly to this file's two names.
 *
 * The order is dictated by real foreign keys and is not negotiable: `audit_log.workflow_run_id` and
 * `workflow_run_steps.run_id` both reference `workflow_runs.id`, which references `workflows.id`.
 * Deleting the workflow first is refused by the database rather than being silently wrong — which is
 * a mercy, but it would still abort teardown halfway and strand the rest.
 *
 * The second half exists because the ghost audit row is reached only through the run id, while an
 * audit row written against the fixture ORGANIZATION by anything else (a human clicking during a
 * halted run) is reached only through the organization id. Both paths are swept.
 */
async function purgeFixture(sql: ReturnType<typeof openDb>) {
  const workflowRows = await sql<{ id: string }[]>`
    select id from workflows where name = ${WORKFLOW_NAME}
  `
  const workflowIds = workflowRows.map((row) => row.id)

  if (workflowIds.length > 0) {
    const runRows = await sql<{ id: string }[]>`
      select id from workflow_runs where workflow_id in ${sql(workflowIds)}
    `
    const runIds = runRows.map((row) => row.id)

    if (runIds.length > 0) {
      await sql`delete from audit_log where workflow_run_id in ${sql(runIds)}`
      await sql`delete from workflow_run_steps where run_id in ${sql(runIds)}`
      await sql`delete from workflow_runs where id in ${sql(runIds)}`
    }

    await sql`delete from workflows where id in ${sql(workflowIds)}`
  }

  const orgRows = await sql<{ id: string }[]>`
    select id from organizations where name = ${ORG_NAME}
  `
  const orgIds = orgRows.map((row) => row.id)

  if (orgIds.length > 0) {
    await sql`delete from audit_log where entity_type = 'organization' and entity_id in ${sql(orgIds)}`
    await sql`delete from organizations where id in ${sql(orgIds)}`
  }
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
    const [org] = await sql<{ id: string }[]>`
      insert into organizations (id, name, industry, owner_id, created_at)
      values (
        gen_random_uuid()::text, ${ORG_NAME}, ${ORG_INDUSTRY}, ${owner.id},
        now() - interval '30 days'
      )
      returning id
    `

    // `created_by` is NOT NULL with a foreign key to `users`; `triggers` and `nodes` are NOT NULL
    // jsonb. Bound as parameters with an explicit `::jsonb` cast rather than interpolated.
    const [workflow] = await sql<{ id: string }[]>`
      insert into workflows (id, name, created_by, triggers, nodes, active)
      values (
        gen_random_uuid()::text, ${WORKFLOW_NAME}, ${owner.id},
        ${JSON.stringify([{ type: "manual" }])}::jsonb, ${JSON.stringify(NODES)}::jsonb, false
      )
      returning id
    `

    /**
     * The lineage link's target is DELIBERATELY never inserted. `replayed_from_run_id` carries no
     * foreign key on purpose (runs are prunable), and the run page scopes its lookup by BOTH ids,
     * so a stale origin id 404s rather than leaking (T-41-77). Nothing here follows the link — it
     * exists to put a third item in the metadata row, which is the width this spec is measuring.
     */
    const originRunId = crypto.randomUUID()

    const [run] = await sql<{ id: string }[]>`
      insert into workflow_runs (
        id, workflow_id, status, dry_run, current_node_id, error, replayed_from_run_id,
        started_at, completed_at, created_at
      )
      values (
        gen_random_uuid()::text, ${workflow.id}, 'failed', true, 'node-b', ${RUN_ERROR},
        ${originRunId}, now() - interval '9 minutes', now() - interval '8 minutes',
        now() - interval '9 minutes'
      )
      returning id
    `

    // Two steps for three nodes: node-c has no row, so the page synthesises a `skipped` row for it.
    // The payloads are kept SMALL on purpose — `JsonViewer`'s `<pre>` is `overflow-x-auto` and
    // collapsed by default, so a large payload would measure that scroller rather than the page.
    await sql`
      insert into workflow_run_steps (id, run_id, node_id, status, input, output, started_at, completed_at, created_at)
      values (
        gen_random_uuid()::text, ${run.id}, 'node-a', 'completed',
        ${JSON.stringify({ organizationId: org.id })}::jsonb,
        ${JSON.stringify({ updated: 3 })}::jsonb,
        now() - interval '9 minutes', now() - interval '9 minutes', now() - interval '9 minutes'
      )
    `
    await sql`
      insert into workflow_run_steps (id, run_id, node_id, status, input, output, error, started_at, completed_at, created_at)
      values (
        gen_random_uuid()::text, ${run.id}, 'node-b', 'failed',
        ${JSON.stringify({ template: "account-owner-alert" })}::jsonb, null, ${RUN_ERROR},
        now() - interval '8 minutes', now() - interval '8 minutes', now() - interval '8 minutes'
      )
    `

    /**
     * The two changed-records rows. `actor_kind = 'workflow_run'` with `workflow_run_id` set is the
     * shape `readRunChangedRecords` reads, and `audit_log_workflow_run_idx` is the partial index
     * declared for it.
     *
     * NEVER USE `'merged'` HERE. `AuditAction` has four literals but `audit.run.action` has only
     * three keys in every catalog — a `merged` row would make the component call a missing message
     * key, and this spec would be reporting an i18n gap as a layout result.
     */
    await sql`
      insert into audit_log (id, entity_type, entity_id, action, changes, actor_kind, workflow_run_id, created_at)
      values (
        gen_random_uuid()::text, 'organization', ${org.id}, 'updated',
        ${JSON.stringify(AUDIT_CHANGES)}::jsonb, 'workflow_run', ${run.id},
        now() - interval '8 minutes'
      )
    `

    const ghostRecordId = crypto.randomUUID()
    await sql`
      insert into audit_log (id, entity_type, entity_id, action, changes, actor_kind, workflow_run_id, created_at)
      values (
        gen_random_uuid()::text, 'organization', ${ghostRecordId}, 'deleted',
        '{}'::jsonb, 'workflow_run', ${run.id}, now() - interval '7 minutes'
      )
    `

    fixture = {
      workflowId: workflow.id,
      runId: run.id,
      orgId: org.id,
      ghostRecordId,
    }
  } finally {
    await sql.end()
  }
})

test.afterAll(async () => {
  const sql = openDb()
  try {
    await purgeFixture(sql)

    // TEARDOWN PROVEN, NOT PERFORMED-AND-TRUSTED. A `delete` that matched nothing and a `delete`
    // that matched everything both exit cleanly. Every count below is scoped to THIS file's prefix
    // or THIS file's row ids.
    const runId = fixture?.runId ?? "__no-fixture-was-created__"
    const orgId = fixture?.orgId ?? "__no-fixture-was-created__"
    const ghostId = fixture?.ghostRecordId ?? "__no-fixture-was-created__"

    const [workflowCount] = await sql<{ count: string }[]>`
      select count(*)::text as count from workflows where name like ${FIXTURE_PREFIX + "%"}
    `
    expect(Number(workflowCount.count), "fixture workflows were left behind").toBe(0)

    const [orgCount] = await sql<{ count: string }[]>`
      select count(*)::text as count from organizations where name like ${FIXTURE_PREFIX + "%"}
    `
    expect(Number(orgCount.count), "fixture organizations were left behind").toBe(0)

    const [runCount] = await sql<{ count: string }[]>`
      select count(*)::text as count from workflow_runs where id = ${runId}
    `
    expect(Number(runCount.count), "the fixture workflow run was left behind").toBe(0)

    const [stepCount] = await sql<{ count: string }[]>`
      select count(*)::text as count from workflow_run_steps where run_id = ${runId}
    `
    expect(Number(stepCount.count), "fixture run steps were left behind").toBe(0)

    const [auditCount] = await sql<{ count: string }[]>`
      select count(*)::text as count from audit_log
      where workflow_run_id = ${runId} or entity_id in (${orgId}, ${ghostId})
    `
    expect(Number(auditCount.count), "fixture audit rows were left behind").toBe(0)
  } finally {
    await sql.end()
  }
})

/** One measured colour, as sRGB bytes, plus the CSS string it came from for the failure message. */
interface Rgba {
  css: string
  r: number
  g: number
  b: number
  a: number
}

interface SurfaceColors {
  /** `body` carries `bg-background` from globals.css's base layer. */
  body: Rgba
  /** The changed-records `<ul>`'s border — the `--border` token on THIS section. */
  listBorder: Rgba
  /** The linkable record title — `text-primary`, which inverts between the two themes. */
  recordLink: Rgba
}

/**
 * Resolve the three colours that make the dark-mode claim falsifiable.
 *
 * WHY A CANVAS AND NOT A STRING COMPARISON. Chromium serialises these computed values in a space
 * that depends on how the token was authored — measured here as `lab(2.75381 0 0)` for a
 * `--background` written as `oklch(0.145 0 0)` — so a spec that compared strings would be asserting
 * Chromium's serialiser. A 1x1 canvas fill is the browser's own colour parser, and it yields sRGB
 * bytes that can be reasoned about numerically.
 *
 * The parser's one sharp edge is stated where it matters: an UNPARSEABLE string leaves `fillStyle`
 * at its `#000000` default instead of throwing. That failure mode reports pure black, which is why
 * the caller asserts that the LIGHT body background is near-WHITE — a silent parse failure fails
 * that assertion rather than passing quietly.
 */
async function readSurfaceColors(page: Page, headingText: string): Promise<SurfaceColors> {
  return page.evaluate((needle) => {
    const toRgba = (css: string): Rgba => {
      const canvas = document.createElement("canvas")
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext("2d")
      if (ctx === null) throw new Error("no 2d canvas context is available")
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { css, r, g, b, a }
    }

    // Re-found here rather than passed in as a handle: every one of these nodes has already been
    // asserted visible by a Playwright locator before this runs, so a throw below means the page
    // changed under the test rather than that it was never there.
    const heading = [...document.querySelectorAll("h2")].find((node) =>
      (node.textContent ?? "").includes(needle)
    )
    if (heading === undefined) throw new Error(`no <h2> containing ${JSON.stringify(needle)}`)

    const section = heading.closest("section")
    if (section === null) throw new Error("the changed-records heading is not inside a <section>")

    const list = section.querySelector('ul[role="list"]')
    if (list === null) throw new Error("the changed-records list did not render")

    const link = list.querySelector("a")
    if (link === null) throw new Error("the changed-records list has no linkable record row")

    return {
      body: toRgba(getComputedStyle(document.body).backgroundColor),
      listBorder: toRgba(getComputedStyle(list).borderTopColor),
      recordLink: toRgba(getComputedStyle(link).color),
    }
  }, headingText)
}

/** Rec. 709 relative luminance over sRGB bytes. Only ever compared against a midpoint. */
const luminance = (colour: Rgba) => 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))

  // The relation is the assertion; both numbers are REPORTED rather than hardcoded, so the failure
  // message carries the measurement and this file carries no magic width.
  expect(
    scrollWidth,
    `${label}: horizontal overflow — scrollWidth ${scrollWidth} > clientWidth ${clientWidth} (overflow ${scrollWidth - clientWidth}px)`
  ).toBeLessThanOrEqual(clientWidth)
}

for (const [locale, messages] of Object.entries(CATALOG)) {
  test(`/workflows/[id]/runs/[runId] @ ${locale}: the Records changed list fits the mobile viewport, light and dark`, async ({
    page,
    context,
    baseURL,
  }) => {
    expect(baseURL, "playwright.config.ts must define use.baseURL").toBeTruthy()

    // Read once into a local, so the route below cannot be built from `undefined` — a `beforeAll`
    // that failed must surface as this sentence rather than as a request for `/workflows/undefined`.
    const created = fixture
    if (created === undefined) {
      throw new Error("the fixture workflow run was not created — see the beforeAll failure above")
    }
    const { workflowId, runId } = created

    // Locale is a plain cookie read server-side by src/i18n/request.ts — no UI navigation and no
    // /[locale] route segment are involved. Setting it via `url` lets Playwright derive the domain
    // and path from the base URL the whole harness already agrees on.
    await context.addCookies([{ name: "locale", value: locale, url: String(baseURL) }])

    /**
     * The emulated OS is pinned to LIGHT for the WHOLE test and never flipped. `theme.spec.ts`'s
     * reasoning, applied here: with the OS pinned light, "the page is dark" below can only be the
     * stored choice, and never the machine running the suite.
     *
     * It also removes a race rather than papering over one. The alternative — flipping
     * `emulateMedia` to dark mid-test — depends on next-themes' matchMedia listener already being
     * attached, and Playwright's actionability checks cannot see hydration, so a flip that lands
     * first is simply missed. The stored choice is re-applied by next-themes' PRE-HYDRATION inline
     * script instead, which is the same mechanism `theme.spec.ts` proves survives a reload.
     */
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto(`/workflows/${workflowId}/runs/${runId}`)

    /**
     * ANCHOR 1 — THE REAL AUTHENTICATED RUN PAGE RENDERED, IN THIS LOCALE. DO NOT DELETE.
     *
     * A blank 200, the `notFound()` 404 this route serves when the run id and workflow id do not
     * match, and the `redirect("/login")` an expired session produces ALL satisfy
     * `scrollWidth <= clientWidth`, so the measurement below closes none of those holes. A
     * locale-DEPENDENT heading closes all of them at once: it can only be visible if the page
     * rendered AND rendered in the expected locale.
     *
     * It must be the `<h2>` and NOT the `<h1>`: the `<h1>` is `Run #{id}`, a hardcoded English
     * literal, and anchoring there would let all three locale runs pass while measuring en-US.
     *
     * Located BY ROLE rather than by bare text for the reason `viewport-320.spec.ts` records:
     * `CommandDialog`'s `DialogHeader` is a sibling of `DialogContent`, so its sr-only title renders
     * into the page whenever a CommandDialog is mounted and a loose text matcher can collide with it.
     */
    const heading = page.getByRole("heading", { level: 2, name: messages.audit.run.heading })
    await expect(heading).toBeVisible()

    /**
     * ANCHOR 2 — THE LIST RENDERED, WITH BOTH KINDS OF ROW IN IT.
     *
     * This is the anchor the residual actually needs, and anchor 1 cannot stand in for it: the
     * heading is rendered IDENTICALLY by the loaded, empty and failed-to-load branches of
     * `run-changed-records.tsx`. So a run whose audit rows went missing, or whose read threw and
     * degraded to the "unavailable" panel, would render a centred one-line box, measure 305, and let
     * this file certify a LIST it never saw. The `<ul>` exists only on the loaded path.
     *
     *   - the LINKABLE row, matched on the fixture organization's own long name — the only element
     *     on this section whose width comes from stored data rather than from the shell;
     *   - the UNLINKABLE row, matched on `audit.run.untitledRecord`, a SECOND locale-dependent
     *     string, which also proves the `deleted` precedence branch renders.
     */
    const recordsSection = page.locator("section").filter({ has: heading })
    const recordsList = recordsSection.locator('ul[role="list"]')
    await expect(recordsList).toBeVisible()
    await expect(recordsSection.getByRole("link", { name: ORG_NAME, exact: true })).toBeVisible()
    await expect(
      recordsSection.getByText(messages.audit.run.untitledRecord, { exact: true })
    ).toBeVisible()

    await expectNoHorizontalOverflow(page, `/workflows/[id]/runs/[runId] @ ${locale} light`)

    const light = await readSurfaceColors(page, messages.audit.run.heading)

    /**
     * The light-mode baseline, and it doubles as the canvas parser's own sanity check: a colour
     * string this browser could not parse reports #000000, which fails the near-white assertion
     * below instead of passing quietly.
     */
    expect(
      Math.min(light.body.r, light.body.g, light.body.b),
      `light: body should paint the near-white --background token, got ${light.body.css}`
    ).toBeGreaterThanOrEqual(250)
    expect(
      light.listBorder.a,
      `light: --border is an OPAQUE grey in :root, got ${light.listBorder.css}`
    ).toBe(255)
    expect(
      luminance(light.recordLink),
      `light: the record title should be dark-on-light, got ${light.recordLink.css}`
    ).toBeLessThan(128)

    /**
     * DARK MODE, by next-themes' documented storage key — the mechanism `theme.spec.ts` establishes
     * as the persistence mechanism rather than a second one invented here. The reload is what makes
     * it deterministic: the class is re-applied by the pre-hydration inline script, before paint.
     */
    await page.evaluate((key) => window.localStorage.setItem(key, "dark"), THEME_STORAGE_KEY)
    await page.reload()

    await expect(heading).toBeVisible()
    await expect(recordsList).toBeVisible()
    await expect(page.locator("html")).toHaveClass(DARK_CLASS)

    // The layout claim, again, in dark. Not redundant: `.dark` re-tokenises `--border` to a
    // TRANSLUCENT white, and a translucent border still occupies its 1px — a theme that changed a
    // width rather than a colour would show up here and nowhere else.
    await expectNoHorizontalOverflow(page, `/workflows/[id]/runs/[runId] @ ${locale} dark`)

    const dark = await readSurfaceColors(page, messages.audit.run.heading)

    /**
     * THE DARK-MODE ASSERTIONS, AND WHAT EACH ONE CAN ACTUALLY CATCH — stated, because asserting
     * `documentElement.className === "dark"` proves only that a class landed and would pass over a
     * section that stayed stubbornly white.
     *
     *   1. body background near-BLACK. Catches the `.dark` block failing to apply to this route at
     *      all — e.g. a page that opts out of the token layer.
     *   2. the LIST's border TRANSLUCENT. This is the surface-specific one. `:root` sets `--border`
     *      to an opaque grey and `.dark` sets it to `oklch(1 0 0 / 10%)`, so a hardcoded
     *      `border-gray-200` on this section — the classic unstyled island — reports alpha 255 in
     *      dark mode and fails here. Nothing else in this spec would notice.
     *   3. the record title INVERTS. `text-primary` is near-black in `:root` and near-white in
     *      `.dark`. This is the assertion that would catch the island that hurts a real operator:
     *      a title that kept its light-mode colour is dark-on-dark, i.e. invisible, while still
     *      laying out perfectly and satisfying every width check in this file.
     *
     * Its honest LIMIT: these are three computed colours, not a rendered screenshot. An island whose
     * colours happen to be tokenised while its BACKGROUND is hardcoded elsewhere in the subtree
     * would still pass. Catching that needs pixel comparison, which needs a PNG decoder this repo
     * deliberately does not depend on.
     */
    expect(
      Math.max(dark.body.r, dark.body.g, dark.body.b),
      `dark: body should paint the near-black --background token, got ${dark.body.css}`
    ).toBeLessThanOrEqual(40)
    expect(
      dark.listBorder.a,
      `dark: the changed-records list border must come from the TRANSLUCENT .dark --border token ` +
        `(oklch(1 0 0 / 10%) ≈ alpha 26); an opaque value means it is hardcoded, not tokenised. ` +
        `got ${dark.listBorder.css}`
    ).toBeLessThan(60)
    expect(
      luminance(dark.recordLink),
      `dark: the record title must invert to light-on-dark or it is invisible on this surface, ` +
        `got ${dark.recordLink.css} (light mode measured ${light.recordLink.css})`
    ).toBeGreaterThan(128)
  })
}
