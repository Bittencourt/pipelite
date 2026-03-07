"use client"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { PieChart, Pie, Cell } from "recharts"

interface ActivityCompletionChartProps {
  completed: number
  total: number
  rate: number | null
}

const chartConfig = {
  completed: { label: "Completed", color: "hsl(var(--chart-2))" },
  pending: { label: "Pending", color: "hsl(var(--muted))" },
} satisfies ChartConfig

export function ActivityCompletionChart({ completed, total, rate }: ActivityCompletionChartProps) {
  if (total === 0 || rate === null) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-md border border-dashed">
        <p className="text-sm text-muted-foreground">No activities this period</p>
      </div>
    )
  }

  const pending = total - completed
  const chartData = [
    { name: "completed", value: completed, fill: "hsl(var(--chart-2))" },
    { name: "pending", value: pending, fill: "hsl(var(--muted))" },
  ]

  return (
    <div className="relative">
      <ChartContainer config={chartConfig} className="min-h-[180px] w-full">
        <PieChart>
          <Pie data={chartData} dataKey="value" innerRadius={50} outerRadius={80} strokeWidth={2}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        </PieChart>
      </ChartContainer>
      {rate !== null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold">{rate}%</span>
        </div>
      )}
    </div>
  )
}
