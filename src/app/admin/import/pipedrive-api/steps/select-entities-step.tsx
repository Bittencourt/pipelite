"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import type { PipedriveImportConfig } from "@/lib/import/pipedrive-api-types"

interface SelectEntitiesStepProps {
  selectedEntities: PipedriveImportConfig["entities"]
  onToggle: (entity: keyof PipedriveImportConfig["entities"]) => void
  onBack: () => void
  onContinue: () => void
  isLoading?: boolean
}

const ENTITY_OPTIONS: Array<{
  key: keyof PipedriveImportConfig["entities"]
  label: string
  description: string
  required?: boolean
}> = [
  { key: "pipelines", label: "Pipelines & Stages", description: "Sales pipeline structure", required: true },
  { key: "customFields", label: "Custom Fields", description: "Field definitions and values" },
  { key: "organizations", label: "Organizations", description: "Companies and accounts" },
  { key: "people", label: "People", description: "Contacts and leads" },
  { key: "deals", label: "Deals", description: "Opportunities and sales" },
  { key: "activities", label: "Activities", description: "Tasks, calls, meetings" },
]

export function SelectEntitiesStep({
  selectedEntities,
  onToggle,
  onBack,
  onContinue,
  isLoading,
}: SelectEntitiesStepProps) {
  const hasSelection = Object.entries(selectedEntities).some(([key, value]) => 
    key !== "pipelines" && value
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Select Data to Import</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Choose which types of data to import from your Pipedrive account.
        </p>
      </div>

      <div className="space-y-3">
        {ENTITY_OPTIONS.map((option) => (
          <div key={option.key} className="flex items-start space-x-3 p-3 rounded-lg border">
            <Checkbox
              id={option.key}
              checked={selectedEntities[option.key]}
              disabled={option.required || isLoading}
              onCheckedChange={() => onToggle(option.key)}
            />
            <div className="flex-1">
              <Label htmlFor={option.key} className="font-medium cursor-pointer">
                {option.label}
                {option.required && (
                  <span className="ml-2 text-xs text-muted-foreground">(required)</span>
                )}
              </Label>
              <p className="text-sm text-muted-foreground">{option.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <Button onClick={onContinue} disabled={!hasSelection || isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </div>
  )
}
