"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { customFieldDefinitions, type EntityType, type FieldType, type FieldConfig } from "@/db/schema"
import { eq, and, isNull, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

// Validation schemas
const fieldTypeSchema = z.enum(['text', 'number', 'date', 'boolean', 'single_select', 'multi_select', 'file', 'url', 'lookup', 'formula'])
const entityTypeSchema = z.enum(['organization', 'person', 'deal', 'activity'])

const fieldDefinitionSchema = z.object({
  entityType: entityTypeSchema,
  name: z.string().min(1).max(100),
  type: fieldTypeSchema,
  config: z.any().nullable(),
  required: z.boolean().default(false),
  showInList: z.boolean().default(false),
})

// Get all field definitions for an entity type (excluding deleted)
export async function getFieldDefinitions(entityType: EntityType) {
  const session = await auth()
  if (!session?.user) return []
  
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, entityType),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}

// Get all field definitions including deleted (for admin)
export async function getAllFieldDefinitions(entityType: EntityType) {
  const session = await auth()
  if (!session?.user) return []
  
  return db.select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.entityType, entityType))
    .orderBy(customFieldDefinitions.position)
}

// Create a new field definition
export async function createFieldDefinition(data: z.infer<typeof fieldDefinitionSchema>) {
  const session = await auth()
  if (!session?.user) {
    return { success: false, error: "Not authenticated" }
  }
  
  // Only admins can create field definitions
  if (session.user.role !== 'admin') {
    return { success: false, error: "Only admins can create field definitions" }
  }
  
  const validated = fieldDefinitionSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: "Invalid field data" }
  }
  
  // Check for duplicate name within entity type
  const existing = await db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, data.entityType),
      eq(customFieldDefinitions.name, data.name),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .limit(1)
  
  if (existing.length > 0) {
    return { success: false, error: "Field name already exists for this entity" }
  }
  
  // Get max position for ordering
  const maxPos = await db.select({ max: sql<string>`COALESCE(MAX(position), '0')` })
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.entityType, data.entityType))
  
  const nextPosition = (parseFloat(maxPos[0]?.max || '0') + 10000).toString()
  
  const [created] = await db.insert(customFieldDefinitions)
    .values({
      ...validated.data,
      position: nextPosition,
    })
    .returning({ id: customFieldDefinitions.id })
  
  revalidatePath(`/admin/fields/${data.entityType}`)
  return { success: true, id: created.id }
}

// Update a field definition
export async function updateFieldDefinition(id: string, data: Partial<z.infer<typeof fieldDefinitionSchema>>) {
  const session = await auth()
  if (!session?.user) {
    return { success: false, error: "Not authenticated" }
  }
  
  if (session.user.role !== 'admin') {
    return { success: false, error: "Only admins can update field definitions" }
  }
  
  // If name changed, check for duplicate
  if (data.name) {
    const field = await db.select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.id, id))
      .limit(1)
    
    if (field[0] && data.name !== field[0].name) {
      const existing = await db.select()
        .from(customFieldDefinitions)
        .where(and(
          eq(customFieldDefinitions.entityType, field[0].entityType),
          eq(customFieldDefinitions.name, data.name),
          isNull(customFieldDefinitions.deletedAt)
        ))
        .limit(1)
      
      if (existing.length > 0) {
        return { success: false, error: "Field name already exists for this entity" }
      }
    }
  }
  
  await db.update(customFieldDefinitions)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(customFieldDefinitions.id, id))
  
  revalidatePath("/admin/fields")
  return { success: true }
}

// Soft delete a field definition (archive)
export async function deleteFieldDefinition(id: string) {
  const session = await auth()
  if (!session?.user) {
    return { success: false, error: "Not authenticated" }
  }
  
  if (session.user.role !== 'admin') {
    return { success: false, error: "Only admins can delete field definitions" }
  }
  
  await db.update(customFieldDefinitions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(customFieldDefinitions.id, id))
  
  revalidatePath("/admin/fields")
  return { success: true }
}

// Restore a soft-deleted field definition
export async function restoreFieldDefinition(id: string) {
  const session = await auth()
  if (!session?.user) {
    return { success: false, error: "Not authenticated" }
  }
  
  if (session.user.role !== 'admin') {
    return { success: false, error: "Only admins can restore field definitions" }
  }
  
  await db.update(customFieldDefinitions)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(customFieldDefinitions.id, id))
  
  revalidatePath("/admin/fields")
  return { success: true }
}

// Reorder field definitions (drag-drop)
export async function reorderFieldDefinitions(entityType: EntityType, fieldIds: string[]) {
  const session = await auth()
  if (!session?.user) {
    return { success: false, error: "Not authenticated" }
  }
  
  if (session.user.role !== 'admin') {
    return { success: false, error: "Only admins can reorder field definitions" }
  }
  
  // Update positions using gap-based positioning
  for (let i = 0; i < fieldIds.length; i++) {
    const position = ((i + 1) * 10000).toString()
    await db.update(customFieldDefinitions)
      .set({ position, updatedAt: new Date() })
      .where(eq(customFieldDefinitions.id, fieldIds[i]))
  }
  
  revalidatePath(`/admin/fields/${entityType}`)
  return { success: true }
}
