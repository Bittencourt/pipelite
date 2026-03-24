import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users, verificationTokens, userInvites } from "@/db/schema"
import { hashPassword } from "@/lib/password"
import { sendVerificationEmail } from "@/lib/email/send"
import { isDomainAllowed } from "@/lib/domain-whitelist"
import { eq, and, isNull, gt } from "drizzle-orm"
import { z } from "zod"
import { createHash } from "crypto"

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  inviteToken: z.string().optional(),
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

    const { email, password, inviteToken } = result.data
    const normalizedEmail = email.toLowerCase().trim()

    // Validate invite token if provided
    let validInvite: typeof userInvites.$inferSelect | null = null
    if (inviteToken) {
      const invite = await db.query.userInvites.findFirst({
        where: and(
          eq(userInvites.token, inviteToken),
          isNull(userInvites.acceptedAt),
          gt(userInvites.expiresAt, new Date())
        ),
      })
      if (invite && invite.email === normalizedEmail) {
        validInvite = invite
      }
      // If invite is invalid, continue with normal signup flow
    }

    // Check domain whitelist BEFORE checking if user exists
    // Skip domain check for valid invited users
    if (!validInvite) {
      const domainAllowed = await isDomainAllowed(normalizedEmail)
      if (!domainAllowed) {
        return NextResponse.json(
          { error: "Signups from this email domain are not allowed" },
          { status: 400 }
        )
      }
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
    // Invited users are set to approved status (skip pending_approval after email verification)
    const [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        status: validInvite ? "approved" : "pending_verification",
        role: isFirstUser ? "admin" : "member",
      })
      .returning()

    // If this was a valid invite, mark it as accepted
    if (validInvite) {
      await db
        .update(userInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(userInvites.id, validInvite.id))
    }

    // Generate verification token
    const rawToken = crypto.randomUUID()
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")

    // Store token hash (expires in 24 hours)
    await db.insert(verificationTokens).values({
      identifier: normalizedEmail,
      token: tokenHash,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    // Send verification email (still required even for invited users)
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
