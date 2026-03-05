"use client"

import { useFormatter, useNow } from 'next-intl'
import { useEffect, useState } from 'react'

interface RelativeTimeProps {
  date: Date | string
  className?: string
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const format = useFormatter()
  const now = useNow()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const dateObj = typeof date === 'string' ? new Date(date) : date
  const hoursDiff = (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60)

  // During SSR, just show absolute date to avoid hydration mismatch
  if (!mounted) {
    return (
      <span className={className} suppressHydrationWarning>
        {format.dateTime(dateObj, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })}
      </span>
    )
  }

  // Show relative time for recent items (< 24 hours)
  if (hoursDiff < 24 && hoursDiff >= 0) {
    return (
      <span className={className}>
        {format.relativeTime(dateObj, now)}
      </span>
    )
  }

  // Show absolute date for older items
  return (
    <span className={className}>
      {format.dateTime(dateObj, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })}
    </span>
  )
}
