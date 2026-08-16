import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { saveFieldValues } from '@/lib/custom-fields'
import { runWithActor } from '@/lib/audit/actor-context'
import type { EntityType } from '@/db/schema'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { entityType, entityId, values } = body as {
      entityType: EntityType
      entityId: string
      values: Record<string, unknown>
    }

    if (!entityType || !entityId || !values) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // This route lives under /api/custom-fields, NOT /api/v1, so it never passes through
    // `withApiAuth` and inherits no actor from it. That asymmetry is why it establishes its own
    // scope here — do not assume the API boundary already covers this path.
    //
    // The scope opens after the session and required-field checks above, so an unauthenticated
    // or malformed request establishes no actor at all. `userId` is `session.user.id` and never
    // a value taken from the request body.
    const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
      saveFieldValues(entityType, entityId, values, session.user.id)
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to save custom fields:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
