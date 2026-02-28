"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle } from "lucide-react"
import type { ImportWarning } from "@/lib/import/types"

interface WarningDialogProps {
  warnings: ImportWarning[]
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function WarningDialog({
  warnings,
  open,
  onConfirm,
  onCancel,
}: WarningDialogProps) {
  // Group warnings by type
  const autoCreateOrg = warnings.filter((w) => w.type === "auto_create_org")
  const autoCreatePerson = warnings.filter(
    (w) => w.type === "auto_create_person"
  )
  const stageFallback = warnings.filter((w) => w.type === "stage_fallback")
  const typeFallback = warnings.filter((w) => w.type === "type_fallback")
  const dealNotFound = warnings.filter((w) => w.type === "deal_not_found")

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Warnings Found
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>The following will occur during import:</p>

              {autoCreateOrg.length > 0 && (
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    Organizations to auto-create ({autoCreateOrg.length}):
                  </p>
                  <ul className="mt-1 max-h-32 list-inside list-disc overflow-auto text-muted-foreground">
                    {autoCreateOrg.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {autoCreatePerson.length > 0 && (
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    People to auto-create ({autoCreatePerson.length}):
                  </p>
                  <ul className="mt-1 max-h-32 list-inside list-disc overflow-auto text-muted-foreground">
                    {autoCreatePerson.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {stageFallback.length > 0 && (
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    Stage fallbacks ({stageFallback.length}):
                  </p>
                  <ul className="mt-1 max-h-32 list-inside list-disc overflow-auto text-muted-foreground">
                    {stageFallback.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {typeFallback.length > 0 && (
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    Type fallbacks ({typeFallback.length}):
                  </p>
                  <ul className="mt-1 max-h-32 list-inside list-disc overflow-auto text-muted-foreground">
                    {typeFallback.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {dealNotFound.length > 0 && (
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    Deals not found ({dealNotFound.length}):
                  </p>
                  <ul className="mt-1 max-h-32 list-inside list-disc overflow-auto text-muted-foreground">
                    {dealNotFound.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continue Import</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
