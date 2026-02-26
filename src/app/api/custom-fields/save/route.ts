import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { saveFieldValues } from '@/lib/custom-fields'
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

    const result = await saveFieldValues(entityType, entityId, values)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to save custom fields:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
