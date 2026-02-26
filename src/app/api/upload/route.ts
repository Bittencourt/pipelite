import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type { S3Client } from '@aws-sdk/client-s3'

// Storage configuration from environment
const STORAGE_TYPE = process.env.FILE_STORAGE || 'local' // 'local' | 's3'
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB default

// S3 client (lazy init for when S3 is configured)
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

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const entityId = formData.get('entityId') as string
    const fieldName = formData.get('fieldName') as string
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    if (!entityId || !fieldName) {
      return NextResponse.json({ error: 'Missing entityId or fieldName' }, { status: 400 })
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      }, { status: 400 })
    }
    
    // Generate unique filename
    const fileId = crypto.randomUUID()
    const ext = path.extname(file.name)
    const storedName = `${fileId}${ext}`
    
    // Read file content
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    let filePath: string
    let publicUrl: string
    
    if (STORAGE_TYPE === 's3') {
      // S3 upload
      const client = await getS3Client()
      if (!client) {
        return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
      }
      
      const { PutObjectCommand } = await import('@aws-sdk/client-s3')
      const key = `${entityId}/${fieldName}/${storedName}`
      
      await client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }))
      
      filePath = key
      publicUrl = `${process.env.S3_PUBLIC_URL}/${key}`
    } else {
      // Local filesystem upload
      const uploadDir = path.join(process.cwd(), UPLOAD_DIR, entityId, fieldName)
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true })
      }
      
      filePath = path.join(uploadDir, storedName)
      await writeFile(filePath, buffer)
      
      // URL for download endpoint
      publicUrl = `/api/files/${entityId}/${fieldName}/${storedName}`
    }
    
    return NextResponse.json({
      success: true,
      file: {
        id: fileId,
        filename: file.name,
        storedName,
        path: filePath,
        publicUrl,
        size: file.size,
        mimeType: file.type,
      }
    })
  } catch (error) {
    console.error('Upload error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 })
  }
}
