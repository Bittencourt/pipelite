"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ExternalLink, AlertCircle, Loader2 } from "lucide-react"
import { validatePipedriveApiKey } from "@/lib/import/pipedrive-api-import-actions"

interface ApiKeyStepProps {
  onConfirm: (apiKey: string) => void
}

export function ApiKeyStep({ onConfirm }: ApiKeyStepProps) {
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const handleContinue = async () => {
    if (!apiKey.trim()) {
      setError("Please enter your Pipedrive API key")
      return
    }

    setIsValidating(true)
    setError(null)

    // Validate by making a single lightweight API call to verify the key
    const result = await validatePipedriveApiKey(apiKey.trim())

    setIsValidating(false)

    if (result.success) {
      onConfirm(apiKey.trim())
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Enter your Pipedrive API Key</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Your API key is used only for this import session and is not stored.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-key">API Token</Label>
        <Input
          id="api-key"
          type="password"
          placeholder="Enter your Pipedrive API token"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={isValidating}
        />
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Find your API token in{" "}
          <a
            href="https://app.pipedrive.com/settings/personal preferences/api"
            target="_blank"
            rel="noopener noreferrer"
            className="underline inline-flex items-center gap-1"
          >
            Pipedrive Settings
            <ExternalLink className="h-3 w-3" />
          </a>
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button onClick={handleContinue} disabled={isValidating}>
          {isValidating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </div>
  )
}
