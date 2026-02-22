import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users, verificationTokens } from "@/db/schema"
import { eq } from "drizzle-orm"
import { sendPasswordResetEmail } from "@/lib/email/send"
import { createHash } from "crypto"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Find user (but don't reveal if they exist or not)
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    })

    // Only send email if user exists and is approved
    if (user && user.status === "approved" && !user.deletedAt) {
      // Generate reset token
      const rawToken = crypto.randomUUID()
      const tokenHash = createHash("sha256").update(rawToken).digest("hex")

      // Store token (expires in 1 hour)
      await db.insert(verificationTokens).values({
        identifier: `reset:${normalizedEmail}`,
        token: tokenHash,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      })

      // Send reset email
      await sendPasswordResetEmail(normalizedEmail, rawToken)
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({
      message: "If an account exists, a reset link has been sent",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    // Still return success to prevent enumeration
    return NextResponse.json({
      message: "If an account exists, a reset link has been sent",
    })
  }
}
