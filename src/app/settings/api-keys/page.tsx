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
import { useFormatter, useTranslations } from 'next-intl'

interface ApiKey {
  id: string
  name: string
  maskedKey: string
  createdAt: string
  lastUsedAt: string | null
}

export default function ApiKeysPage() {
  const format = useFormatter()
  const t = useTranslations('settings.apiKeys')
  const tCommon = useTranslations('common')
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
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('createKey')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('yourApiKeys')}
          </CardTitle>
          <CardDescription>
            {t('apiKeysDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('noKeys')}</p>
              <p className="text-sm">{t('createToStart')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('key')}</TableHead>
                  <TableHead>{t('created')}</TableHead>
                  <TableHead>{t('lastUsed')}</TableHead>
                  <TableHead className="text-right">{tCommon('actions')}</TableHead>
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
                       {format.dateTime(new Date(key.createdAt), {
                         year: 'numeric',
                         month: 'short',
                         day: 'numeric'
                       })}
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt
                        ? format.dateTime(new Date(key.lastUsedAt), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : t('never')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegenerate(key.id, key.name)}
                      >
                        <RefreshCw className="mr-2 h-3 w-3" />
                        {t('regenerate')}
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
                <DialogTitle>{t('keyRegenerated')}</DialogTitle>
                <DialogDescription>
                  {t('copyNewKey')}
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
                  {t('done')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('regenerateApiKey')}</DialogTitle>
                <DialogDescription>
                  {t('regenerateConfirm', { name: regenerateDialog.keyName })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={closeRegenerateDialog}>
                  {tCommon('cancel')}
                </Button>
                <Button onClick={confirmRegenerate}>
                  {t('regenerate')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
