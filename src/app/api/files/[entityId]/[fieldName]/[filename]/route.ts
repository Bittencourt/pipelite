import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import type { S3Client } from '@aws-sdk/client-s3'
import { log } from '@/lib/log'
import {
  findOwnedRecordById,
  recordReferencesStoredName,
  resolveContainedPath,
} from '@/lib/api/file-access'

const STORAGE_TYPE = process.env.FILE_STORAGE || 'local'
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'

/**
 * SEC-04 — the single refusal this route gives for every reason a file is not servable.
 *
 * A foreign record, a missing record, a trashed record, a filename this record does not reference
 * and a path that escapes the field directory all answer with THIS, byte-identical to the answer a
 * genuinely absent file already got. 403-for-real beside 404-for-unknown is an existence oracle: the
 * caller would learn which ids exist by reading the status code. Phase 48's SEC-48-A settled on a
 * uniform 404 for exactly that reason. There is no `Problems` helper in scope here — this route is
 * not under `/api/v1` — and none is introduced: one error shape per handler, and this handler's
 * shape was already chosen.
 */
function notFound() {
  return NextResponse.json({ error: 'File not found' }, { status: 404 })
}

/**
 * Everything both verbs must establish before they are allowed to touch storage at all.
 *
 * Returns `null` when access is authorized, or the refusal to return as-is.
 *
 * The order matters and is not interchangeable: the record is resolved FIRST, so ownership is
 * settled before anything else is considered, and only then is the JSONB reference match applied.
 * The reference match is the LOAD-BEARING check — the filename must already be a value the server
 * wrote into this record's own field — which is why a traversal `filename` is refused here, upstream
 * of any path arithmetic. Path containment is a third check, in the local arm below, as defence in
 * depth against a poisoned JSONB value; it is measured as such rather than presented as the check
 * carrying the criterion.
 *
 * ONE FUNCTION FOR BOTH VERBS, deliberately. The two preambles were byte-identical before this
 * change and the defect was identical in both; sharing the guard is what makes it impossible to fix
 * the read and forget the destructive verb, which was the worse half of this defect.
 *
 * Called ABOVE each handler's `try` on purpose. A collapsed predicate makes `requireScopedPredicate`
 * throw, and that throw must NOT be swallowed into this route's generic 500-with-a-log: a scope that
 * silently stopped applying is the one failure here worth being loud about.
 */
async function refuseUnlessOwnedAndReferenced(
  userId: string,
  entityId: string,
  fieldName: string,
  filename: string
): Promise<NextResponse | null> {
  const record = await findOwnedRecordById(entityId, userId)
  if (record === null) {
    return notFound()
  }

  if (!recordReferencesStoredName(record.customFields, fieldName, filename)) {
    return notFound()
  }

  return null
}

// S3 client (lazy init)
let s3Client: S3Client | null = null

async function getS3Client() {
  if (!s3Client && process.env.S3_ENDPOINT) {
    const { S3Client: S3ClientClass } = await import('@aws-sdk/client-s3')
    s3Client = new S3ClientClass({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
    })
  }
  return s3Client
}

interface RouteParams {
  params: Promise<{
    entityId: string
    fieldName: string
    filename: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  // TIGHTENED from `!session?.user`. A session carrying a user with no id cannot own anything, and
  // proceeding with `undefined` as the owner would either throw inside drizzle or — worse — build a
  // predicate that matches rows whose `owner_id` is null. The old condition accepted `{ user: {} }`.
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entityId, fieldName, filename } = await params

  const refusal = await refuseUnlessOwnedAndReferenced(
    session.user.id,
    entityId,
    fieldName,
    filename
  )
  if (refusal !== null) {
    return refusal
  }

  try {
    // SEC-49-A. The guard above runs before this branch and so applies to both arms, but under
    // `FILE_STORAGE=s3` the stored `publicUrl` is `${S3_PUBLIC_URL}/${key}`
    // (`src/app/api/upload/route.ts:89`), so no read ever traverses this route and the guard has no
    // traffic to protect there. Closing the S3 exposure means deciding the URL contract and
    // migrating every stored `publicUrl`; it is tracked separately and is not claimed here.
    if (STORAGE_TYPE === 's3') {
      const client = await getS3Client()
      if (!client) {
        return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
      }

      const { GetObjectCommand } = await import('@aws-sdk/client-s3')
      const key = `${entityId}/${fieldName}/${filename}`

      const response = await client.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
      }))

      const body = await response.Body?.transformToByteArray()
      if (!body) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }

      return new NextResponse(Buffer.from(body), {
        headers: {
          'Content-Type': response.ContentType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } else {
      // Local filesystem. `path.resolve` over three URL segments is NOT containment — it was the
      // escape vector, measured — so the resolution goes through `resolveContainedPath`, which
      // refuses anything that is not a direct child of this record's own field directory.
      const filePath = resolveContainedPath(UPLOAD_DIR, entityId, fieldName, filename)
      if (filePath === null) {
        return notFound()
      }

      if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }

      const fileBuffer = await readFile(filePath)

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }
  } catch (error) {
    log.error(
      'api/files/[entityId]/[fieldName]/[filename]',
      'Download error',
      { err: error }
    )
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  // Identical tightening to GET's, for the identical reason.
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entityId, fieldName, filename } = await params

  // THE SAME GUARD AS `GET`, and that is the point. Closing the read while leaving the DESTRUCTIVE
  // verb open would have been the worse half of the defect: any signed-in caller holding a URL could
  // still have destroyed any file in the product.
  const refusal = await refuseUnlessOwnedAndReferenced(
    session.user.id,
    entityId,
    fieldName,
    filename
  )
  if (refusal !== null) {
    return refusal
  }

  try {
    // SEC-49-A applies here exactly as it does to GET. See the comment in that handler.
    if (STORAGE_TYPE === 's3') {
      const client = await getS3Client()
      if (!client) {
        return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
      }

      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const key = `${entityId}/${fieldName}/${filename}`

      await client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
      }))
    } else {
      // Same containment resolution as GET's, and it matters more here: this is the arm that calls
      // `unlink`.
      const filePath = resolveContainedPath(UPLOAD_DIR, entityId, fieldName, filename)
      if (filePath === null) {
        return notFound()
      }

      if (existsSync(filePath)) {
        await unlink(filePath)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error(
      'api/files/[entityId]/[fieldName]/[filename]',
      'Delete error',
      { err: error }
    )
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
