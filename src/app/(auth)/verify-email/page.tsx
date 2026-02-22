"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const email = searchParams.get("email")

  const [status, setStatus] = useState<"loading" | "success" | "error" | "waiting">("waiting")
  const [message, setMessage] = useState<string>("")

  useEffect(() => {
    if (token) {
      verifyEmail(token)
    }
  }, [token])

  const verifyEmail = async (token: string) => {
    setStatus("loading")

    try {
      const response = await fetch(`/api/verify-email?token=${token}`)
      const result = await response.json()

      if (response.ok) {
        setStatus("success")
        setMessage(result.message)
      } else {
        setStatus("error")
        setMessage(result.error || "Verification failed")
      }
    } catch (error) {
      setStatus("error")
      setMessage("An unexpected error occurred")
    }
  }

  // Initial state: waiting for user to click email link
  if (!token && status === "waiting") {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <Mail className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">
            Check your email
          </CardTitle>
          <CardDescription className="text-center">
            {email ? (
              <>
                We sent a verification link to{" "}
                <span className="font-medium">{email}</span>
              </>
            ) : (
              "We sent a verification link to your email address"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Click the link in the email to verify your account.
            After verification, an administrator will review your signup.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            Didn&apos;t receive the email? Check your spam folder or{" "}
            <a href="/signup" className="text-primary hover:underline">
              try again
            </a>
          </p>
        </CardContent>
      </Card>
    )
  }

  // Loading state: verifying token
  if (status === "loading") {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Verifying your email...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Success state: email verified
  if (status === "success") {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-center">
            Email verified!
          </CardTitle>
          <CardDescription className="text-center">
            {message || "Your email has been verified successfully."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            An administrator will review your signup and notify you when your account is approved.
          </p>
          <Button
            className="w-full"
            onClick={() => router.push("/login")}
          >
            Continue to Login
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Error state
  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex justify-center mb-4">
          <XCircle className="h-12 w-12 text-red-500" />
        </div>
        <CardTitle className="text-2xl font-bold text-center">
          Verification failed
        </CardTitle>
        <CardDescription className="text-center">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          className="w-full"
          onClick={() => router.push("/signup")}
        >
          Try Again
        </Button>
      </CardContent>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </CardContent>
      </Card>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
