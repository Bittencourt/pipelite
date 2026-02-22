import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users, verificationTokens } from "@/db/schema"
import { hashPassword } from "@/lib/password"
import { sendVerificationEmail } from "@/lib/email/send"
import { isDomainAllowed } from "@/lib/domain-whitelist"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { createHash } from "crypto"

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = signupSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      )
    }

    const { email, password } = result.data
    const normalizedEmail = email.toLowerCase().trim()

    // Check domain whitelist BEFORE checking if user exists
    // This prevents leaking whether an email is registered
    const domainAllowed = await isDomainAllowed(normalizedEmail)
    if (!domainAllowed) {
      return NextResponse.json(
        { error: "Signups from this email domain are not allowed" },
        { status: 400 }
      )
    }

    // Check for existing user
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    })

    if (existingUser && !existingUser.deletedAt) {
      // Don't reveal if email exists - return success but don't send email
      // This prevents email enumeration
      return NextResponse.json({
        message: "If this email is available, check your inbox for verification",
      })
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Check if this is the first user (becomes admin automatically)
    const existingUsersCount = await db.select({ id: users.id }).from(users)
    const isFirstUser = existingUsersCount.length === 0

    // Create user with pending_verification status
    // First user becomes admin automatically (self-hosted bootstrapping pattern)
    const [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        status: "pending_verification",
        role: isFirstUser ? "admin" : "member",
      })
      .returning()

    // Generate verification token
    const rawToken = crypto.randomUUID()
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")

    // Store token hash (expires in 24 hours)
    await db.insert(verificationTokens).values({
      identifier: normalizedEmail,
      token: tokenHash,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    // Send verification email
    await sendVerificationEmail(normalizedEmail, rawToken)

    return NextResponse.json({
      message: "If this email is available, check your inbox for verification",
    })
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
