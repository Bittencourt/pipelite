"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Plus, RefreshCw, Copy, Check, Key } from "lucide-react"
import { toast } from "sonner"
import { ApiKeyDialog } from "@/components/api-key-dialog"

interface ApiKey {
  id: string
  name: string
  maskedKey: string
  createdAt: string
  lastUsedAt: string | null
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [regenerateDialog, setRegenerateDialog] = useState<{
    open: boolean
    keyId: string | null
    keyName: string
    newKey: string | null
  }>({ open: false, keyId: null, keyName: "", newKey: null })
  const [copied, setCopied] = useState(false)

  const fetchKeys = async () => {
    try {
      const response = await fetch("/api/api-keys")
      const data = await response.json()
      setKeys(data.keys || [])
    } catch {
      toast.error("Failed to load API keys")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchKeys()
  }, [])

  const handleRegenerate = async (keyId: string, keyName: string) => {
    setRegenerateDialog({ open: true, keyId, keyName, newKey: null })
  }

  const confirmRegenerate = async () => {
    if (!regenerateDialog.keyId) return

    try {
      const response = await fetch(`/api/api-keys/${regenerateDialog.keyId}`, {
        method: "POST",
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Failed to regenerate key")
        return
      }

      setRegenerateDialog({
        ...regenerateDialog,
        newKey: result.fullKey,
      })
      fetchKeys()
    } catch {
      toast.error("Failed to regenerate key")
    }
  }

  const handleCopy = async () => {
    if (regenerateDialog.newKey) {
      await navigator.clipboard.writeText(regenerateDialog.newKey)
      setCopied(true)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const closeRegenerateDialog = () => {
    setRegenerateDialog({ open: false, keyId: null, keyName: "", newKey: null })
    setCopied(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            Manage API keys for external tool access
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Key
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Your API Keys
          </CardTitle>
          <CardDescription>
            API keys allow external tools to access your account.
            Keys are shown in full only once when created or regenerated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No API keys yet.</p>
              <p className="text-sm">Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {key.maskedKey}
                      </code>
                    </TableCell>
                    <TableCell>
                      {new Date(key.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegenerate(key.id, key.name)}
                      >
                        <RefreshCw className="mr-2 h-3 w-3" />
                        Regenerate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ApiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchKeys}
      />

      {/* Regenerate Dialog */}
      <Dialog open={regenerateDialog.open} onOpenChange={closeRegenerateDialog}>
        <DialogContent className="sm:max-w-md">
          {regenerateDialog.newKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Key Regenerated!</DialogTitle>
                <DialogDescription>
                  Copy this new key now. The old key is no longer valid.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-md text-sm break-all font-mono">
                    {regenerateDialog.newKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button onClick={closeRegenerateDialog} className="w-full">
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Regenerate API Key</DialogTitle>
                <DialogDescription>
                  Are you sure you want to regenerate &quot;{regenerateDialog.keyName}&quot;?
                  The current key will stop working immediately.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={closeRegenerateDialog}>
                  Cancel
                </Button>
                <Button onClick={confirmRegenerate}>
                  Regenerate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
