import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type { S3Client } from '@aws-sdk/client-s3'

const STORAGE_TYPE = process.env.FILE_STORAGE || 'local'
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'

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
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { entityId, fieldName, filename } = await params
  
  try {
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
      // Local filesystem
      const filePath = path.join(process.cwd(), UPLOAD_DIR, entityId, fieldName, filename)
      
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
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const { entityId, fieldName, filename } = await params
  
  try {
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
      // Local filesystem
      const filePath = path.join(process.cwd(), UPLOAD_DIR, entityId, fieldName, filename)
      
      if (existsSync(filePath)) {
        await unlink(filePath)
      }
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
