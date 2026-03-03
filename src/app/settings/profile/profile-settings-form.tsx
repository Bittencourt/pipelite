"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, Locate } from "lucide-react"
import { toast } from "sonner"
import { updateUserLocale, updateUserTimezone } from "@/actions/user-settings"
import { type Locale } from "@/i18n/request"
import { getTimezoneOptions, detectBrowserTimezone } from "@/lib/timezone"

interface ProfileSettingsFormProps {
  initialSettings: { locale: string; timezone: string } | null
}

const languageOptions: Array<{ value: Locale; label: string }> = [
  { value: "en-US", label: "English (US)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "es-ES", label: "Español (España)" },
]

export function ProfileSettingsForm({ initialSettings }: ProfileSettingsFormProps) {
  const [locale, setLocale] = useState<string>(initialSettings?.locale || "en-US")
  const [timezone, setTimezone] = useState<string>(initialSettings?.timezone || "America/New_York")
  const [isLocaleLoading, setIsLocaleLoading] = useState(false)
  const [isTimezoneLoading, setIsTimezoneLoading] = useState(false)

  // Sync with initial settings when they load
  useEffect(() => {
    if (initialSettings) {
      setLocale(initialSettings.locale)
      setTimezone(initialSettings.timezone)
    }
  }, [initialSettings])

  const handleLocaleChange = async (value: string) => {
    setLocale(value)
    setIsLocaleLoading(true)
    
    const result = await updateUserLocale(value as Locale)
    
    if (result.success) {
      toast.success("Language updated", {
        description: "Your language preference has been saved."
      })
    } else {
      toast.error("Failed to update language", {
        description: result.error || "Please try again."
      })
    }
    
    setIsLocaleLoading(false)
  }

  const handleTimezoneChange = async (value: string) => {
    setTimezone(value)
    setIsTimezoneLoading(true)
    
    const result = await updateUserTimezone(value)
    
    if (result.success) {
      toast.success("Timezone updated", {
        description: "Your timezone preference has been saved."
      })
    } else {
      toast.error("Failed to update timezone", {
        description: result.error || "Please try again."
      })
    }
    
    setIsTimezoneLoading(false)
  }

  const handleAutoDetectTimezone = async () => {
    const detected = detectBrowserTimezone()
    if (detected && detected !== timezone) {
      await handleTimezoneChange(detected)
    } else {
      toast.info("Timezone unchanged", {
        description: `Your browser timezone (${detected}) is already selected.`
      })
    }
  }

  const timezoneOptions = getTimezoneOptions()

  return (
    <div className="space-y-8">
      {/* Language Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="language" className="text-base">Language</Label>
          {isLocaleLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground">
          Choose your preferred language for the interface
        </p>
        <Select value={locale} onValueChange={handleLocaleChange} disabled={isLocaleLoading}>
          <SelectTrigger id="language" className="w-full max-w-xs">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timezone Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="timezone" className="text-base">Timezone</Label>
          <div className="flex items-center gap-2">
            {isTimezoneLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoDetectTimezone}
              disabled={isTimezoneLoading}
            >
              <Locate className="mr-2 h-3 w-3" />
              Auto-detect
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Dates and times will be displayed in this timezone
        </p>
        <Select value={timezone} onValueChange={handleTimezoneChange} disabled={isTimezoneLoading}>
          <SelectTrigger id="timezone" className="w-full max-w-sm">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
