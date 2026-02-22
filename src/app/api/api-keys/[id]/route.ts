import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/db"
import { apiKeys } from "@/db/schema/api-keys"
import { eq, and, isNull } from "drizzle-orm"
import { regenerateApiKey, maskFromPrefix } from "@/lib/api-keys"

// POST /api/api-keys/[id] - Regenerate API key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params

    // Verify the key belongs to this user
    const existingKey = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, session.user.id),
        isNull(apiKeys.deletedAt)
      ),
    })

    if (!existingKey) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      )
    }

    // Regenerate the key (soft-deletes old, creates new)
    const result = await regenerateApiKey(id, session.user.id)

    if (!result) {
      return NextResponse.json(
        { error: "Failed to regenerate API key" },
        { status: 500 }
      )
    }

    // Return full key ONCE
    return NextResponse.json({
      id: result.id,
      name: existingKey.name,
      fullKey: result.fullKey, // Only shown once!
      keyPrefix: result.keyPrefix,
      maskedKey: maskFromPrefix(result.keyPrefix),
      createdAt: new Date(),
    })
  } catch (error) {
    console.error("Regenerate API key error:", error)
    return NextResponse.json(
      { error: "Failed to regenerate API key" },
      { status: 500 }
    )
  }
}
