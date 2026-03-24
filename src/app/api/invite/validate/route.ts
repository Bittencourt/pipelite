import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { userInvites } from "@/db/schema"
import { eq, and, isNull, gt } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.json({ valid: false, error: "Token is required" }, { status: 400 })
  }

  const invite = await db.query.userInvites.findFirst({
    where: and(
      eq(userInvites.token, token),
      isNull(userInvites.acceptedAt),
      gt(userInvites.expiresAt, new Date())
    ),
  })

  if (!invite) {
    return NextResponse.json({ valid: false, error: "Invalid or expired invite" })
  }

  return NextResponse.json({ valid: true, email: invite.email })
}
