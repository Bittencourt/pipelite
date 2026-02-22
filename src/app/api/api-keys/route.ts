import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/db"
import { apiKeys } from "@/db/schema/api-keys"
import { eq, and, isNull, desc } from "drizzle-orm"
import { generateApiKey, maskFromPrefix } from "@/lib/api-keys"
import { z } from "zod"

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
})

// GET /api/api-keys - List user's API keys
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, session.user.id),
        isNull(apiKeys.deletedAt)
      )
    )
    .orderBy(desc(apiKeys.createdAt))

  // Mask the key prefix for display
  const maskedKeys = keys.map((key) => ({
    ...key,
    maskedKey: maskFromPrefix(key.keyPrefix),
  }))

  return NextResponse.json({ keys: maskedKeys })
}

// POST /api/api-keys - Create new API key
export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const result = createKeySchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      )
    }

    const { name } = result.data

    // Check for duplicate name
    const existing = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.userId, session.user.id),
        eq(apiKeys.name, name),
        isNull(apiKeys.deletedAt)
      ),
    })

    if (existing) {
      return NextResponse.json(
        { error: "An API key with this name already exists" },
        { status: 400 }
      )
    }

    // Generate the key
    const { fullKey, keyPrefix, id } = await generateApiKey(
      session.user.id,
      name
    )

    // Return full key ONCE - this is the only time it will be visible
    return NextResponse.json({
      id,
      name,
      fullKey, // Only shown once!
      keyPrefix,
      maskedKey: maskFromPrefix(keyPrefix),
      createdAt: new Date(),
    })
  } catch (error) {
    console.error("Create API key error:", error)
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    )
  }
}
