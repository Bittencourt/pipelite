"use client"

import { useFormatter } from "next-intl"

/**
 * The app's ONE determinate progress bar (39-UI-SPEC P-1, P-2).
 *
 * WHY THIS FILE EXISTS. `/duplicates` needs a determinate bar over a scan of 46,054 records, and the
 * importer already shipped one. Two visually different progress bars in one app diverge — one gains a
 * rounded cap, the other a different track colour, and a year later nobody can say which is the real
 * one. The importer's bar is this codebase's only visual precedent for the shape, so the presentational
 * half was LIFTED here rather than reimplemented, and `src/components/import/progress-bar.tsx` became a
 * thin wrapper over it. Its public API, its two call sites and its hardcoded English phase-label map
 * are all unchanged; that map deliberately did NOT travel here, because a shared presentational
 * component must not carry one caller's copy.
 *
 * THE CALLER SUPPLIES AN ALREADY-TRANSLATED LABEL. This component calls no `useTranslations`: the
 * importer's label comes from its own map and the scan's comes from `dedup.scan.running`, and a
 * component that picked between them would have to know about both callers.
 *
 * `current` / `total` ARE FORMATTED HERE, not by the caller, because that line is this component's own
 * markup rather than an interpolation into a caller's sentence. `dedup.scan.progress` is the opposite
 * case — a sentence whose word order differs across three locales — and its caller pre-formats.
 *
 * THE 10px TRACK HEIGHT IS INHERITED, NOT INTRODUCED. It is the single dimension in this phase that is
 * not a multiple of 4, and it arrived with the markup this file lifted. The utility class is spelled
 * exactly ONCE below, in the element itself: the plan's acceptance criteria count occurrences of it in
 * this file and in the file it moved out of, and a grep cannot tell code from prose, so this paragraph
 * names the value and not the token.
 */
export interface ProgressBarProps {
  /** Already translated by the caller. */
  label: string
  /** 0-100. */
  percentage: number
  current: number
  total: number
}

export function ProgressBar({ label, percentage, current, total }: ProgressBarProps) {
  const format = useFormatter()

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {total > 0 && (
        <p className="text-muted-foreground text-xs">
          {format.number(current)} / {format.number(total)}
        </p>
      )}
    </div>
  )
}
