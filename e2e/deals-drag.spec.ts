/**
 * SC-5 — the deals-kanban drag with an unrelated card selected, plus the G1 Escape regression.
 *
 * This is the one Phase 36-38 UAT item no human session could drive, and it is the reason this
 * harness exists at all. Two rules govern everything below.
 *
 * ONLY TRUSTED INPUT COUNTS (V-6). Every gesture here goes through `page.mouse.*` /
 * `page.keyboard.press`, which drive the CDP input pipeline and produce `isTrusted: true`
 * pointer/key events — the same pipeline a real mouse and a real keyboard use. That is NOT the
 * synthetic dispatch 38-UAT refused as evidence: that rule was about an event object constructed in
 * page script and fired straight at the element, which arrives `isTrusted: false` and bypasses the
 * browser's input pipeline entirely. The distinction is load-bearing rather than pedantic —
 * regression G1 reproduced three times out of three under real key input and NEVER reproduced under
 * a synthetic `KeyboardEvent`, because synthetic dispatch does not interleave with React's flush the
 * way a real dispatch does. Script-constructed event dispatch is therefore a defect in this file,
 * not a shortcut, and the plan's verification greps for its absence.
 *
 * Playwright's own high-level drag helpers are barred as well, for a second mechanical reason: they
 * run actionability checks on the drop target, and `kanban-board.tsx` renders a `<DragOverlay>`
 * covering the page for the duration of a drag, which fails "receives pointer events" and hangs.
 * Raw `page.mouse.*` performs no actionability checks at all.
 *
 * NO REAL RECORD IS EVER MOVED. This spec runs against the live dev database, so instead of
 * borrowing one of the ~25,000 existing deals and putting it back afterwards, it creates two deals
 * of its own in the emptiest adjacent pair of open stages it can find, drags one of those, resets
 * them to their recorded starting stage and position before every test, and hard-deletes them
 * afterwards. Nothing a user created is read, moved, or deleted.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"
import postgres from "postgres"

import en from "../src/messages/en-US.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"

/** Unmistakable titles, so a fixture left behind by a crashed run is recognisable and reclaimable. */
const ANCHOR_TITLE = "[e2e] Drag Anchor"
const SUBJECT_TITLE = "[e2e] Drag Subject"

/** The recorded starting state. `beforeEach` restores exactly this, so tests cannot leak into each other. */
const ANCHOR_POSITION = "10000"
const SUBJECT_POSITION = "20000"

interface Fixture {
  pipelineId: string
  sourceStageId: string
  sourceStageName: string
  targetStageId: string
  targetStageName: string
  /** Index of each stage among the pipeline's OPEN stages — what `data-kanban-col` carries. */
  sourceColumnIndex: number
  targetColumnIndex: number
  anchorId: string
  subjectId: string
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

  // The same loopback allow-list `e2e/seed-admin.ts` uses, repeated rather than imported because it
  // is a guard: this file INSERTS and DELETES rows, so it must be impossible to aim at a shared or
  // production database. A loopback host is the one place the operator provably owns the target.
  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "The deals-drag fixture refuses to write anywhere but localhost / 127.0.0.1."
    )
  }

  return postgres(connectionString)
}

/**
 * Delete every trace of the two fixture deals, children first — `deal_stage_history`,
 * `deal_assignees` and `activities` all reference `deals.id` with NO ACTION, and a stage change
 * writes a history row, so a bare DELETE on `deals` would fail on the second run.
 *
 * Scoped strictly to the two fixture titles. It can touch nothing else.
 */
async function purgeFixtureDeals(sql: ReturnType<typeof openDb>) {
  const rows = await sql<{ id: string }[]>`
    select id from deals where title in (${ANCHOR_TITLE}, ${SUBJECT_TITLE})
  `
  const ids = rows.map((row) => row.id)
  if (ids.length === 0) return

  await sql`delete from deal_stage_history where deal_id in ${sql(ids)}`
  await sql`delete from deal_assignees where deal_id in ${sql(ids)}`
  await sql`delete from activities where deal_id in ${sql(ids)}`
  await sql`delete from audit_log where entity_type = 'deal' and entity_id in ${sql(ids)}`
  await sql`delete from deals where id in ${sql(ids)}`
}

test.beforeAll(async () => {
  const sql = openDb()
  try {
    await purgeFixtureDeals(sql)

    /**
     * Source = the FIRST open stage of a live pipeline, target = its LAST open stage. Both are
     * measured facts about how this board behaves at 320px, not arbitrary choices — see the long
     * note on `dndDrag` about dnd-kit's auto-scroll. In one sentence: a 264px-wide dragged card
     * inside a ~241px-wide scroll container is permanently inside the container's right-hand
     * auto-scroll threshold, so a rightward drag pins the board to its scroll extreme and the LAST
     * open column is the only stage a right-going gesture can actually reach at this width.
     *
     * The pipeline is chosen for emptiness, which is a runtime-cost requirement rather than
     * tidiness: `/deals` fetches every non-deleted deal in the selected pipeline with no
     * pagination, and the busiest stage in this database holds over ten thousand.
     */
    const [pair] = await sql<
      {
        pipeline_id: string
        stage_count: string
        stage_a: string
        name_a: string
        stage_z: string
        name_z: string
      }[]
    >`
      with open_stages as (
        select s.id, s.pipeline_id, s.name, s.position,
               row_number() over (partition by s.pipeline_id order by s.position, s.id) as rn,
               (select count(*) from deals d where d.stage_id = s.id and d.deleted_at is null) as deal_count
        from stages s
        join pipelines p on p.id = s.pipeline_id and p.deleted_at is null
        where s.type = 'open'
      ),
      totals as (
        select pipeline_id, sum(deal_count) as total_deals, count(*) as stage_count
        from open_stages
        group by pipeline_id
        having count(*) >= 2
      )
      select t.pipeline_id, t.stage_count,
             a.id as stage_a, a.name as name_a,
             z.id as stage_z, z.name as name_z
      from totals t
      join open_stages a on a.pipeline_id = t.pipeline_id and a.rn = 1
      join open_stages z on z.pipeline_id = t.pipeline_id and z.rn = t.stage_count
      order by t.total_deals asc, t.stage_count asc
      limit 1
    `

    expect(
      pair,
      "no live pipeline has two or more open stages — the drag spec has nothing to drag between"
    ).toBeTruthy()

    const [owner] = await sql<{ id: string }[]>`
      select id from users where email = ${E2E_ADMIN_EMAIL} limit 1
    `
    expect(
      owner,
      `the seeded e2e admin ${E2E_ADMIN_EMAIL} is missing — run the setup project first`
    ).toBeTruthy()

    const [anchor] = await sql<{ id: string }[]>`
      insert into deals (id, title, stage_id, owner_id, position)
      values (gen_random_uuid()::text, ${ANCHOR_TITLE}, ${pair.stage_a}, ${owner.id}, ${ANCHOR_POSITION})
      returning id
    `
    const [subject] = await sql<{ id: string }[]>`
      insert into deals (id, title, stage_id, owner_id, position)
      values (gen_random_uuid()::text, ${SUBJECT_TITLE}, ${pair.stage_a}, ${owner.id}, ${SUBJECT_POSITION})
      returning id
    `

    fixture = {
      pipelineId: pair.pipeline_id,
      sourceStageId: pair.stage_a,
      sourceStageName: pair.name_a,
      targetStageId: pair.stage_z,
      targetStageName: pair.name_z,
      // `data-kanban-col` is a zero-based index over the pipeline's open stages, in position order.
      sourceColumnIndex: 0,
      targetColumnIndex: Number(pair.stage_count) - 1,
      anchorId: anchor.id,
      subjectId: subject.id,
    }
  } finally {
    await sql.end()
  }
})

/** Put both fixture deals back exactly where `beforeAll` recorded them. */
test.beforeEach(async () => {
  const sql = openDb()
  try {
    await sql`
      update deals set stage_id = ${fixture.sourceStageId}, position = ${ANCHOR_POSITION}
      where id = ${fixture.anchorId}
    `
    await sql`
      update deals set stage_id = ${fixture.sourceStageId}, position = ${SUBJECT_POSITION}
      where id = ${fixture.subjectId}
    `
  } finally {
    await sql.end()
  }
})

test.afterAll(async () => {
  const sql = openDb()
  try {
    await purgeFixtureDeals(sql)
  } finally {
    await sql.end()
  }
})

/**
 * The kanban column that owns a stage.
 *
 * SELECTOR CHOICE, RECORDED DELIBERATELY: the durable handle a column exposes is its per-stage
 * select-all checkbox, whose `aria-label` names the stage — a role+name locator, which survives
 * Tailwind edits in a way a class chain does not. The column ROOT still has to be reached by class,
 * because it carries no id, no role and no data attribute; the `min-w-[280px]` track width is the
 * least volatile thing on it (it is the kanban's fixed column pitch, not decoration). The width
 * assertion at the call site is what turns a future rename into a loud failure instead of a silent
 * mismatch.
 */
function stageColumn(page: Page, stageName: string): Locator {
  return page
    .getByRole("checkbox", { name: new RegExp(escapeForRegExp(stageName)) })
    .locator('xpath=ancestor::div[contains(@class,"min-w-[280px]")][1]')
}

/** A deal card root, reached from its bulk-selection checkbox — the one element on the card that
 *  carries a stable, title-keyed accessible name (`bulk.selectRow`). The root itself is found by
 *  `data-kanban-item`, a real data attribute rather than a class. */
function dealCard(page: Page, title: string): Locator {
  return page
    .getByRole("checkbox", { name: en.bulk.selectRow.replace("{name}", title) })
    .locator("xpath=ancestor::div[@data-kanban-item][1]")
}

function dealCheckbox(page: Page, title: string): Locator {
  return page.getByRole("checkbox", { name: en.bulk.selectRow.replace("{name}", title) })
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** The floating bulk action bar, identified by the one control only it renders. */
function bulkBar(page: Page): Locator {
  return page
    .getByRole("region")
    .filter({ has: page.getByRole("button", { name: en.bulk.clearSelection }) })
}

/**
 * Drag `source` onto `target` with trusted pointer input, satisfying `@dnd-kit/core`'s
 * `PointerSensor` as configured at `kanban-board.tsx` (`activationConstraint: { distance: 5 }`).
 *
 * The sequence is not decorative:
 *   - `mouse.move` then `mouse.down()` — the activator runs on React `onPointerDown` and requires
 *     `event.isPrimary && event.button === 0`, which Playwright's default left button satisfies.
 *   - a first move MORE THAN 5px away, with `{ steps }` so real interpolated `pointermove`s are
 *     emitted. The drag does not start until `hasExceededDistance(delta, 5)` fires on a move, which
 *     is exactly why a single move-and-release times out and why the earlier browser-driver attempt
 *     never activated.
 *   - an aim-and-settle loop rather than one long move, because at a 320px viewport the drop column
 *     starts off-screen and the board scrolls underneath the drag, so the target's box has to be
 *     re-read as it comes into view.
 *
 * WHY THE TARGET IS THE LAST OPEN STAGE AND NOT THE NEXT ONE — measured, not assumed.
 * `@dnd-kit/core`'s auto-scroller compares the DRAGGED RECT (not the pointer) against a threshold
 * of 20% of the scroll container's width. Here the dragged card is 264px wide and the board's
 * scroll container is about 241px wide at a 320px viewport, so the dragged rect straddles both
 * thresholds for every reachable pointer position, and the `if (right…) else if (left…)` ordering
 * in `getScrollDirectionAndSpeed` makes RIGHT win. Scroll intent does not rescue it either: intent
 * accumulates with `||` and is never cleared, so once the drag has gone right at all, rightward
 * auto-scroll stays permitted for the rest of the gesture. The board therefore runs to its scroll
 * extreme within about 150ms and stays pinned there, which is where the LAST open column sits.
 * Measured three times: aiming at the adjacent column oscillates between the two scroll extremes
 * and drops into the last column anyway. So the spec drags where a 320px gesture can actually
 * land. That is a real mobile-UX finding about this board, not a workaround for the harness.
 *
 * NEVER RESIZE THE VIEWPORT DURING A DRAG — or anywhere in this file. `@dnd-kit/core` wires the
 * window `Resize` event straight to `handleCancel`, so a resize silently cancels the drag and the
 * test then fails for a reason that has nothing to do with the code under test. Same for
 * `VisibilityChange`, and `Escape` is wired to `handleCancel` on the document too.
 */
async function dndDrag(
  page: Page,
  source: Locator,
  target: Locator,
  settled: () => Promise<boolean>
): Promise<void> {
  const start = await source.boundingBox()
  expect(start, "the drag source has no layout box — it is not rendered").toBeTruthy()
  if (!start) return

  const startX = start.x + start.width / 2
  const startY = start.y + start.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 })

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const box = await target.boundingBox()
    if (!box) break

    // Clamp into the part of the window that actually receives pointer events. `clientWidth` is the
    // scrollbar-corrected width (305 at this viewport, not 320) — the same measurement SC-1 asserts
    // on, and reading it is the reason no width is hardcoded here.
    const { usableWidth, usableHeight } = await page.evaluate(() => ({
      usableWidth: document.documentElement.clientWidth,
      usableHeight: document.documentElement.clientHeight,
    }))

    const aimX = Math.min(Math.max(box.x + box.width / 2, 4), usableWidth - 4)
    const aimY = Math.min(Math.max(box.y + Math.min(box.height / 2, 120), 4), usableHeight - 4)

    await page.mouse.move(aimX, aimY, { steps: 10 })
    await page.waitForTimeout(120)

    if (await settled()) break
  }

  // Let collision detection settle on the last position before the drop commits.
  await page.waitForTimeout(200)
  await page.mouse.up()
}

async function openBoard(page: Page) {
  await page.goto(`/deals?pipeline=${fixture.pipelineId}`)

  // ANTI-VACUITY. A blank 200, an error page or a /login redirect would let every "the card is not
  // in the source column any more" style assertion pass by finding nothing at all. The board has to
  // be proven present, and both fixture cards proven visible, BEFORE anything is dragged.
  await expect(page.getByRole("heading", { level: 1, name: en.deals.title })).toBeVisible()
  await expect(dealCard(page, ANCHOR_TITLE)).toBeVisible()
  await expect(dealCard(page, SUBJECT_TITLE)).toBeVisible()

  // The column selector is the one class-derived locator in this file, so it gets a width check:
  // if a Tailwind edit ever renames the track, this fails loudly instead of silently resolving to
  // some other div. Polled rather than read once — the board re-renders as the client component
  // hydrates, and a single `boundingBox()` can land on a node React has just replaced.
  const column = stageColumn(page, fixture.sourceStageName)
  await expect(column).toBeVisible()
  await expect
    .poll(async () => (await column.boundingBox())?.width, {
      message: "the resolved kanban column is not a 280px track — the column selector has drifted",
    })
    .toBe(280)
}

test("dragging an unselected card to another stage moves it and leaves the other card's selection intact", async ({
  page,
}) => {
  await openBoard(page)

  // PRECONDITION, ASSERTED RATHER THAN ASSUMED: the anchor is checked and the bar has appeared with
  // exactly one record in it. Without this a later "still 1 selected" assertion could pass against a
  // selection that was never made.
  await dealCheckbox(page, ANCHOR_TITLE).click()
  await expect(dealCheckbox(page, ANCHOR_TITLE)).toBeChecked()
  await expect(dealCheckbox(page, SUBJECT_TITLE)).not.toBeChecked()
  await expect(bulkBar(page)).toBeVisible()
  await expect(bulkBar(page)).toContainText(/\b1\b/)

  // The subject starts in the source column, and that is asserted so "it ended up in the target"
  // means something.
  await expect(dealCard(page, SUBJECT_TITLE)).toHaveAttribute(
    "data-kanban-col",
    String(fixture.sourceColumnIndex)
  )

  const targetColumn = stageColumn(page, fixture.targetStageName)

  // Grabbing the card ROOT, not the checkbox: the checkbox wrapper stops `pointerdown` precisely so
  // a 6px wobble on the box cannot start a drag.
  await dndDrag(page, dealCard(page, SUBJECT_TITLE), targetColumn, async () => {
    // `handleDragOver` optimistically reparents the card the moment the pointer is over another
    // column, so this is the drag's own signal that the drop will land where it is aimed.
    return (await targetColumn.getByRole("checkbox", { name: en.bulk.selectRow.replace("{name}", SUBJECT_TITLE) }).count()) > 0
  })

  // POSITIVE POST-STATE: the card is a DESCENDANT of the target stage's column, and its column
  // index says the same thing a second way, so "somewhere on the page" cannot satisfy this.
  await expect(
    targetColumn.getByRole("checkbox", {
      name: en.bulk.selectRow.replace("{name}", SUBJECT_TITLE),
    })
  ).toBeVisible()
  await expect(dealCard(page, SUBJECT_TITLE)).toHaveAttribute(
    "data-kanban-col",
    String(fixture.targetColumnIndex)
  )

  // SC-5 ITSELF: the unrelated selection survived the drag, in the bar and on the card.
  await expect(dealCheckbox(page, ANCHOR_TITLE)).toBeChecked()
  await expect(bulkBar(page)).toBeVisible()
  await expect(bulkBar(page)).toContainText(/\b1\b/)
})

test("G1: one Escape closes the bulk delete dialog and leaves the selection untouched", async ({
  page,
}) => {
  await openBoard(page)

  await dealCheckbox(page, ANCHOR_TITLE).click()
  await dealCheckbox(page, SUBJECT_TITLE).click()

  // PRECONDITION: two records really are selected before the dialog is opened.
  await expect(dealCheckbox(page, ANCHOR_TITLE)).toBeChecked()
  await expect(dealCheckbox(page, SUBJECT_TITLE)).toBeChecked()
  await expect(bulkBar(page)).toContainText(/\b2\b/)

  await bulkBar(page).getByRole("button", { name: en.bulk.delete }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()

  /**
   * ONE Escape, through the real key pipeline.
   *
   * This is the whole regression. The bar registers a document-level `keydown` listener that clears
   * the selection, gated on whether a dialog owns the Escape. Because that listener runs inside the
   * same dispatch in which Radix's dismissable layer handles Escape and calls `onOpenChange(false)`,
   * React could flush that state update — and re-register the listener with a fresh closure —
   * BETWEEN two listeners of a single dispatch, so the handler that actually ran saw the dialog as
   * already closed and emptied the bar.
   *
   * It never reproduced under a synthetic `KeyboardEvent`, which is exactly why the unit test
   * asserting the gate passed throughout. `page.keyboard.press` is the discriminator: it is trusted
   * input and interleaves the same way a real keypress does.
   */
  await page.keyboard.press("Escape")

  await expect(dialog).toBeHidden()
  await expect(bulkBar(page)).toBeVisible()
  await expect(bulkBar(page)).toContainText(/\b2\b/)
  await expect(dealCheckbox(page, ANCHOR_TITLE)).toBeChecked()
  await expect(dealCheckbox(page, SUBJECT_TITLE)).toBeChecked()
})
