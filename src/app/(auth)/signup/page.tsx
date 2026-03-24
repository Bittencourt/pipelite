"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, AlertTriangle } from "lucide-react"

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type SignupFormData = z.infer<typeof signupSchema>

interface InviteInfo {
  email: string
  valid: boolean
  message?: string
}

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get("invite")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inviteChecked, setInviteChecked] = useState(!inviteToken)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  })

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return

    async function validateInvite() {
      try {
        const response = await fetch(`/api/invite/validate?token=${encodeURIComponent(inviteToken!)}`)
        const data = await response.json()
        if (response.ok && data.valid) {
          setInviteInfo({ email: data.email, valid: true })
          setValue("email", data.email)
        } else {
          setInviteInfo({ email: "", valid: false, message: data.error || "Invalid or expired invite" })
        }
      } catch {
        setInviteInfo({ email: "", valid: false, message: "Failed to validate invite" })
      } finally {
        setInviteChecked(true)
      }
    }
    validateInvite()
  }, [inviteToken, setValue])

  const onSubmit = async (data: SignupFormData) => {
    setError(null)
    setIsLoading(true)

    try {
      const body: Record<string, string> = { ...data }
      if (inviteToken && inviteInfo?.valid) {
        body.inviteToken = inviteToken
      }

      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || "Signup failed")
        return
      }

      // Redirect to verification page with email
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`)
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!inviteChecked) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          Create an account
        </CardTitle>
        <CardDescription className="text-center">
          Enter your email and password to get started
        </CardDescription>
      </CardHeader>
      <CardContent>
        {inviteToken && inviteInfo && !inviteInfo.valid && (
          <div className="mb-4 p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{inviteInfo.message || "Invalid or expired invite link. You can still register normally."}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              {...register("email")}
              disabled={isLoading || (inviteInfo?.valid ?? false)}
              readOnly={inviteInfo?.valid ?? false}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimum 8 characters"
              {...register("password")}
              disabled={isLoading}
            />
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Account
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
