import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users, verificationTokens } from "@/db/schema"
import { eq, and, gt } from "drizzle-orm"
import { createHash } from "crypto"

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")

    if (!token) {
      return NextResponse.json(
        { error: "Missing verification token" },
        { status: 400 }
      )
    }

    // Hash the token to compare with stored hash
    const tokenHash = createHash("sha256").update(token).digest("hex")

    // Find valid token (not expired)
    const verificationToken = await db.query.verificationTokens.findFirst({
      where: and(
        eq(verificationTokens.token, tokenHash),
        gt(verificationTokens.expires, new Date())
      ),
    })

    if (!verificationToken) {
      return NextResponse.json(
        { error: "Invalid or expired verification token" },
        { status: 400 }
      )
    }

    // Find the user
    const user = await db.query.users.findFirst({
      where: eq(users.email, verificationToken.identifier),
    })

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 400 }
      )
    }

    // Update user status to pending_approval
    await db
      .update(users)
      .set({
        emailVerified: new Date(),
        status: "pending_approval",
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))

    // Delete the verification token (one-time use)
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash))

    return NextResponse.json({
      message: "Your email has been verified. An administrator will review your signup.",
    })
  } catch (error) {
    console.error("Email verification error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
