"use client"

import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import { formatCurrency, sumDealValues } from "@/lib/currency"
import { STAGE_COLORS, type StageColor } from "@/lib/stage-colors"
import type { Deal } from "./deal-card"

interface KanbanColumnProps {
  stage: {
    id: string
    name: string
    color: StageColor
    type: 'open' | 'won' | 'lost'
  }
  deals: Deal[]
  children: React.ReactNode
}

export function KanbanColumn({ stage, deals, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: 'column', stage },
  })

  const colorStyle = STAGE_COLORS[stage.color] || STAGE_COLORS.blue
  const totalValue = sumDealValues(deals)

  return (
    <div className="w-[280px] min-w-[280px] flex flex-col">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
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
