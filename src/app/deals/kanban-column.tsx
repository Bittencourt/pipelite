"use client"

import { useDroppable } from "@dnd-kit/core"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { formatCurrency, sumDealValues } from "@/lib/currency"
import { STAGE_COLORS, type StageColor } from "@/lib/stage-colors"
import { Checkbox } from "@/components/ui/checkbox"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { Deal } from "./deal-card"

interface KanbanColumnProps {
  stage: {
    id: string
    name: string
    color: StageColor
    type: 'open' | 'won' | 'lost'
  }
  deals: Deal[]
  allInStageSelected?: boolean
  someInStageSelected?: boolean
  onSelectAllInStage?: (stageId: string, next: boolean) => void
  children: React.ReactNode
}

export function KanbanColumn({
  stage,
  deals,
  allInStageSelected,
  someInStageSelected,
  onSelectAllInStage,
  children,
}: KanbanColumnProps) {
  const t = useTranslations('bulk')
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: 'column', stage },
  })

  const colorStyle = STAGE_COLORS[stage.color] || STAGE_COLORS.blue
  const totalValue = sumDealValues(deals)

  /**
   * THE ACCESSIBLE NAME IS WHERE THE 100-DEAL CAP BECOMES HONEST (D-07).
   *
   * `/deals` has NO pagination — the page fetches every non-deleted deal in the selected pipeline
   * with no limit — the live database holds 25,195 live deals, the largest single stage holds 10,495,
   * and nine stages hold more than 300. A per-stage select-all is therefore over the cap in the
   * NORMAL case, not in an edge case, so the capped branch is the one most users will actually hear.
   *
   * Disabling the control above the cap instead would make it useless on nine live stages without
   * explaining why. Capping and then STATING BOTH REAL NUMBERS keeps it usable, and the action bar's
   * count then reads exactly "100 selected", which is precise rather than misleading (T-38-03).
   */
  const selectAllLabel =
    deals.length > BULK_MAX_IDS
      ? t("selectAllInStageCapped", { max: BULK_MAX_IDS, total: deals.length, stage: stage.name })
      : t("selectAllInStage", { count: deals.length, stage: stage.name })

  return (
    <div className="w-[280px] min-w-[280px] flex flex-col">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          {/*
            THE PER-STAGE SELECT-ALL. Its scope is the deals currently RENDERED in this column — the
            same page-scoped rule the tables use, and the same tri-state treatment, which is why the
            shared checkbox primitive's minus-icon branch is shared rather than duplicated here.

            ALWAYS VISIBLE, NEVER HOVER-REVEALED. The cost is one 16px square per column on the
            product's busiest daily surface, and a hover-only checkbox on a card that is ALSO a drag
            handle is the worst possible affordance: hover-then-press is exactly the gesture that
            starts a drag.

            DISABLED RATHER THAN HIDDEN on an empty stage. A header element that appears and
            disappears makes the column header jump as deals move between stages, and the primitive's
            `disabled:opacity-50` already communicates the state.
          */}
          <div className="flex items-center justify-center p-2 -m-2 mr-1">
            <Checkbox
              checked={allInStageSelected || (someInStageSelected && "indeterminate") || false}
              onCheckedChange={(v) => onSelectAllInStage?.(stage.id, !!v)}
              disabled={deals.length === 0}
              aria-label={selectAllLabel}
            />
          </div>
          <div className={cn("w-3 h-3 rounded-full", colorStyle.bg)} />
          <span className="font-medium text-sm">{stage.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {deals.length} deals
        </span>
      </div>

      {/* Column Value */}
      <div className="text-xs text-muted-foreground mb-2 px-1">
        {formatCurrency(totalValue)}
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[200px] p-2 rounded-lg bg-muted/50 transition-all",
          isOver && "ring-2 ring-primary bg-muted"
        )}
      >
        <div className="space-y-2">
          {children}
        </div>
      </div>
    </div>
  )
}
