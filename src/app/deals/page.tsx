import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, pipelines, users, dealAssignees } from "@/db/schema"
import { eq, and, isNull, gte, lte, asc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { KanbanBoard } from "./kanban-board"
import { readTrashRetentionDays } from "@/lib/trash/settings"
import { getTranslations } from 'next-intl/server'
import {
  resolveDefaultViewRedirect,
  resolveSavedViewsBarProps,
} from "@/lib/views/resolve"
import type { SavedViewsBarProps } from "@/lib/views/types"


interface DealWithRelations {
  id: string
  title: string
  value: string | null
  stageId: string
  position: string
  ownerId: string
  organizationId: string | null
  personId: string | null
  expectedCloseDate?: Date | null
  notes?: string | null
  organization: { id: string; name: string } | null
  person: { id: string; firstName: string; lastName: string } | null
  assignees: { userId: string; user: { id: string; name: string | null; email: string } }[]
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    pipeline?: string
    stage?: string
    owner?: string
    assignee?: string
    dateFrom?: string
    dateTo?: string
    /**
     * WHICH SAVED VIEW THE URL NAMES, or `none` for "I deliberately have none" (plan 40-18).
     *
     * Declared here even though this page never reads it directly: it is passed through to
     * `resolveSavedViewsBarProps`, which owns the one grammar for it, and it is what makes the
     * no-params redirect guard below un-loopable — `view=none` IS a param.
     */
    view?: string
  }>
}) {
  const session = await auth()
  const params = await searchParams
  const t = await getTranslations('deals')

  if (!session?.user?.id) {
    redirect("/login")
  }

  /**
   * A BARE `/deals` GOES TO THIS USER'S DEFAULT VIEW, IF THEY HAVE ONE (U-2).
   *
   * THE GUARD IS "NO PARAMS AT ALL", and that is what makes it un-loopable. `withViewEscape` sends a
   * user who cleared their last filter to `?view=none`, which IS a param — so the escape URL never
   * re-enters this branch and there is no second code path meaning "arrived by default". A guard
   * written as "no FILTER params" would bounce that user straight back into the view they just left.
   *
   * The resolver returns `null` for every failure that could otherwise loop — no default, a default
   * that was unshared, a deleted view, and in particular a default whose stored keys have ALL been
   * dropped by the validator (T-40-20). So the redirect target always carries at least one filter.
   *
   * PLACED BEFORE THE PIPELINE READ, deliberately: a redirect makes every query below it wasted work,
   * and `allPipelines` is the first of five reads on this page.
   *
   * NO try/catch, ever. `redirect()` signals by THROWING; a catch here would swallow the navigation
   * and render the unfiltered board instead — a silent failure that looks exactly like success.
   */
  if (Object.keys(params).length === 0) {
    const target = await resolveDefaultViewRedirect("deal", session.user)
    if (target) redirect(`/deals${target}`)
  }

  // Fetch all pipelines (not deleted, ordered by isDefault then name)
  const allPipelines = await db.query.pipelines.findMany({
    where: isNull(pipelines.deletedAt),
    orderBy: [
      sql`${pipelines.isDefault} DESC`,
      pipelines.name,
    ],
    columns: {
      id: true,
      name: true,
      isDefault: true,
    },
  })

  // If no pipelines exist, show empty state
  if (allPipelines.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
        </div>
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          {t('noPipelines')}
        </div>
      </div>
    )
  }

  /**
   * PIPELINE RESOLUTION IN THREE STEPS, AND THE THIRD ONE IS DECISION 4.
   *
   * `pipeline` is not a filter, it is a BOARD SELECTOR: it decides which stage set exists and which
   * slice of the 25,195 live deals is queried. That is why a deals view has to carry it — a deals view
   * without a pipeline is not reproducible (Decision 4). And it is why the consequence had to be
   * handled here: a view saved months ago against a pipeline that has since been deleted must land the
   * user on the DEFAULT BOARD, not on a dead end.
   *
   * WHAT THIS REPLACED, because the shape is the entire fix. The previous expression was
   * `params.pipeline ? allPipelines.find(byId) : allPipelines.find(isDefault) || allPipelines[0]`.
   * The default branch existed but was unreachable for the one input that needed it: a requested id
   * that no longer resolves fell to `undefined` and rendered `t('pipelineNotFound')`. MEASURED against
   * the running container before this change: `GET /deals?pipeline=00000000-0000-4000-8000-000000000000`
   * returned 200 with `Pipeline not found.` and nothing else — there is no `error.tsx` above this route
   * (M-14), so a dead end here is the whole page. With 11 live pipelines that is a reachable state, and
   * to a user it reads as a crash.
   *
   * So the default lookup now sits OUTSIDE any test on `params.pipeline`, chained with `??` rather
   * than nested in a ternary. `find()` returns `undefined` when it misses, which is precisely what
   * `??` continues on.
   *
   * MEASURED, and it is why the last link matters: all 11 live pipelines have `is_default = 0`, so the
   * `isDefault` lookup returns `undefined` in production TODAY and `allPipelines[0]` — "BDR - Base
   * Fria", first by the `isDefault DESC, name` ordering above — is what actually renders.
   *
   * `pipelineWasDropped` is recorded rather than inferred later: the DEGRADED NOTICE needs to know
   * that a pipeline was ASKED FOR and lost, and by the time `selectedPipeline` exists that is
   * indistinguishable from a plain default landing.
   */
  const requestedPipeline = params.pipeline
    ? allPipelines.find((p) => p.id === params.pipeline)
    : undefined
  const pipelineWasDropped = Boolean(params.pipeline) && requestedPipeline === undefined
  const selectedPipeline =
    requestedPipeline ?? allPipelines.find((p) => p.isDefault) ?? allPipelines[0]

  /*
   * RETAINED ON PURPOSE, AND NOW UNREACHABLE — say so rather than delete it.
   *
   * `allPipelines.length === 0` is guarded above and returns, so `allPipelines[0]` above cannot be
   * `undefined` and this branch cannot fire. It stays for two reasons: it is what narrows
   * `selectedPipeline` to non-`undefined` for everything below, and it is the landing for the day the
   * guard above changes shape. Deleting a branch to make a diff look tidier is how the next reader
   * loses the narrowing and reaches for a cast instead.
   */
  if (!selectedPipeline) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">{t('title')}</h1>
        </div>
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          {t('pipelineNotFound')}
        </div>
      </div>
    )
  }
  
  const selectedPipelineId = selectedPipeline.id

  // Fetch stages for the selected pipeline
  const pipelineStages = await db.query.stages.findMany({
    where: eq(stages.pipelineId, selectedPipelineId),
    orderBy: [stages.position],
  })

  // Fetch all deals with relations (for the selected pipeline's stages, with optional filters)
  const stageIds = pipelineStages.map(s => s.id)
  
  // Build filter conditions
  const filterConditions = [
    sql`${deals.stageId} IN ${stageIds}`,
    isNull(deals.deletedAt),
    // Stage filter - only apply if filtering by a specific stage
    params.stage ? eq(deals.stageId, params.stage) : undefined,
    // Owner filter
    params.owner ? eq(deals.ownerId, params.owner) : undefined,
    // Assignee filter
    params.assignee
      ? sql`${deals.id} IN (SELECT deal_id FROM deal_assignees WHERE user_id = ${params.assignee})`
      : undefined,
    // Date range filters
    params.dateFrom ? gte(deals.expectedCloseDate, new Date(params.dateFrom)) : undefined,
    params.dateTo ? lte(deals.expectedCloseDate, new Date(params.dateTo)) : undefined,
  ].filter(Boolean)
  
  const allDeals = stageIds.length > 0
    ? await db.query.deals.findMany({
        where: and(...filterConditions),
        orderBy: [sql`${deals.position} ASC`],
        with: {
          organization: {
            columns: {
              id: true,
              name: true,
            },
          },
          person: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignees: {
            with: {
              user: { columns: { id: true, name: true, email: true } },
            },
          },
        },
      })
    : []

  // Group deals by stage
  const dealsByStage: Record<string, DealWithRelations[]> = {}
  for (const stage of pipelineStages) {
    dealsByStage[stage.id] = []
  }
  for (const deal of allDeals) {
    if (deal.stageId in dealsByStage) {
      dealsByStage[deal.stageId].push(deal as DealWithRelations)
    }
  }

  // Fetch all users (for owner filter dropdown)
  const allUsers = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    columns: { id: true, email: true, name: true },
    orderBy: [users.email],
  })

  /**
   * A SECOND, SEPARATE users query for the bulk reassign picker, and the separation is deliberate.
   *
   * The `allUsers` query above filters on `deletedAt` ALONE and feeds BOTH `DealFilters` and
   * `DealDialog`. Tightening it with a `status` predicate would silently remove options from two
   * existing dropdowns — a user who owns deals but has not been approved would vanish from the owner
   * FILTER, making their deals unfindable. That missing predicate is recorded as pre-existing and
   * out of scope, so it is left exactly as it was.
   *
   * A reassign TARGET is a different question from a filter VALUE: handing ownership to a deleted or
   * unapproved account transfers records to a principal who cannot act on them (T-38-06). This query
   * therefore carries BOTH predicates, matching what `bulkReassignDealOwner` independently enforces
   * server-side — the picker never offers a target the action would refuse with `invalid_owner`.
   *
   * `retentionDays` comes straight from `readTrashRetentionDays()` with NO numeric fallback. `null`
   * means nothing is purged automatically, and a `?? 30` here would make the bulk delete dialog
   * promise a restore window the pruner is not enforcing (T-38-10).
   */
  const [bulkOwners, retentionDays] = await Promise.all([
    db.query.users.findMany({
      where: and(isNull(users.deletedAt), eq(users.status, "approved")),
      columns: { id: true, name: true, email: true },
      orderBy: [users.name],
    }),
    readTrashRetentionDays(),
  ])

  // Get first open stage for default create dialog
  const firstOpenStage = pipelineStages.find(s => s.type === 'open')

  /**
   * ALL EIGHT BAR PROPS FROM ONE RESOLVER (Rule B-2), then ONE local amendment.
   *
   * The resolver validates the SELECTED VIEW'S stored filters against the live catalog, so it already
   * reports a dead owner or a dead stage in `droppedFilterKeys`. It cannot report a dead pipeline in
   * the URL: it never queries pipelines for the URL's own params, because that is this page's job and
   * this page has just done it. V-11 covers a deleted owner, a deleted stage and a deleted pipeline in
   * ONE sentence, deliberately — so both sources have to reach the same prop, or the third case
   * renders a silently different board with no notice at all.
   *
   * The `includes` check is not defensive padding: when the selected view's OWN stored pipeline is the
   * one that died, the resolver has already listed the key, and appending it again would print it
   * twice in the notice.
   *
   * `rawSearchParams: params` hands over the untouched param object rather than a pre-picked map. The
   * resolver owns the whitelist and the `view` grammar; giving it a filtered map would give this page
   * a second, divergent copy of both.
   */
  const resolvedViewsBar = await resolveSavedViewsBarProps({
    entityType: "deal",
    viewer: session.user,
    rawSearchParams: params,
  })
  const viewsBar: SavedViewsBarProps =
    pipelineWasDropped && !resolvedViewsBar.droppedFilterKeys.includes("pipeline")
      ? {
          ...resolvedViewsBar,
          droppedFilterKeys: [...resolvedViewsBar.droppedFilterKeys, "pipeline"],
        }
      : resolvedViewsBar

  /*
    `py-4 sm:py-8` AND `mb-4 sm:mb-6` — RECLAIMING THE VERTICAL SPACE THE VIEWS BAR COST (D-40-4).

    Mounting `SavedViewsBar` on its own row pushed the kanban columns down 60px, measured at the
    320x640 minimum viewport: the first column's top went from y=265 to y=325. That broke the
    cross-stage drag outright — `e2e/deals-drag.spec.ts` passed at c59575c and failed at e5b1a62
    with the spec file byte-identical, and raising ONLY the viewport to 320x900 made it pass again.

    The 60px is arithmetic, not mystery: the bar adds a fourth block to a `space-y-6` stack, so it
    costs its own height plus one more 24px gap.

    Reclaimed at the SMALL breakpoint ONLY. `sm:` restores the original rhythm, so nothing above
    640px changes — this is not a redesign, it is giving the board back the room the bar took on the
    one viewport where there was none to spare.
  */
  return (
    <div className="container mx-auto py-4 sm:py-8">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>

      <KanbanBoard
        viewsBar={viewsBar}
        selectedPipelineId={selectedPipelineId}
        pipelines={allPipelines.map(p => ({ id: p.id, name: p.name }))}
        stages={pipelineStages.map(s => ({
          id: s.id,
          name: s.name,
          pipelineId: s.pipelineId,
          color: s.color as 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'orange',
          type: s.type,
        }))}
        dealsByStage={dealsByStage}
        defaultStageId={firstOpenStage?.id}
        owners={allUsers.map(u => ({ id: u.id, name: u.name || u.email }))}
        users={allUsers.map(u => ({ id: u.id, name: u.name, email: u.email }))}
        bulkOwners={bulkOwners.map(u => ({ id: u.id, name: u.name || "Unknown" }))}
        retentionDays={retentionDays}
        activeFilters={{
          stage: params.stage,
          owner: params.owner,
          assignee: params.assignee,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo
        }}
      />
    </div>
  )
}
