import { db } from "@/db"
import { customFieldDefinitions, organizations, people, deals, activities, type EntityType, type FieldConfig } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import type { SelectConfig, LookupConfig } from "@/db/schema"

// Entity table mapping
const entityTables = {
  organization: organizations,
  person: people,
  deal: deals,
  activity: activities,
} as const

// Get active field definitions for an entity type
export async function getActiveFieldDefinitions(entityType: EntityType) {
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, entityType),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}

// Validate field values against definitions
export async function validateFieldValues(
  entityType: EntityType,
  values: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const definitions = await getActiveFieldDefinitions(entityType)
  const errors: string[] = []
  
  for (const def of definitions) {
    const value = values[def.name]
    
    // Check required fields
    if (def.required && (value === undefined || value === null || value === '')) {
      errors.push(`${def.name} is required`)
      continue
    }
    
    // Skip validation for empty optional fields
    if (value === undefined || value === null || value === '') continue
    
    // Type-specific validation
    switch (def.type) {
      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push(`${def.name} must be a number`)
        }
        break
      
      case 'url':
        if (typeof value === 'string' && value) {
          try {
            new URL(value)
          } catch {
            errors.push(`${def.name} must be a valid URL`)
          }
        }
        break
      
      case 'single_select':
      case 'multi_select': {
        const config = def.config as SelectConfig | null
        if (config?.options) {
          const validOptions = config.options
          if (def.type === 'single_select') {
            if (!validOptions.includes(value as string)) {
              errors.push(`${def.name} must be one of: ${validOptions.join(', ')}`)
            }
          } else {
            const values = Array.isArray(value) ? value : [value]
            for (const v of values) {
              if (!validOptions.includes(v as string)) {
                errors.push(`${def.name} contains invalid option: ${v}`)
              }
            }
          }
        }
        break
      }
      
      case 'lookup': {
        const config = def.config as LookupConfig | null
        if (config?.targetEntity && value) {
          const targetTable = entityTables[config.targetEntity]
          const existing = await db.select({ id: targetTable.id })
            .from(targetTable)
            .where(eq(targetTable.id, value as string))
            .limit(1)
          
          if (existing.length === 0) {
            errors.push(`${def.name} references a non-existent ${config.targetEntity}`)
          }
        }
        break
      }
    }
  }
  
  return { valid: errors.length === 0, errors }
}

// Get custom field values for an entity
export async function getFieldValues(
  entityType: EntityType,
  entityId: string
): Promise<Record<string, unknown>> {
  const table = entityTables[entityType]
  const result = await db.select({ customFields: table.customFields })
    .from(table)
    .where(eq(table.id, entityId))
    .limit(1)
  
  return (result[0]?.customFields as Record<string, unknown>) || {}
}

// Save custom field values for an entity
export async function saveFieldValues(
  entityType: EntityType,
  entityId: string,
  values: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  // Validate first
  const validation = await validateFieldValues(entityType, values)
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') }
  }
  
  const table = entityTables[entityType]
  await db.update(table)
    .set({
      customFields: values,
      updatedAt: new Date(),
    })
    .where(eq(table.id, entityId))
  
  return { success: true }
}

// Get field definitions with values for rendering
export async function getFieldsWithValues(
  entityType: EntityType,
  entityId: string
) {
  const [definitions, values] = await Promise.all([
    getActiveFieldDefinitions(entityType),
    getFieldValues(entityType, entityId),
  ])
  
  return definitions.map(def => ({
    ...def,
    value: values[def.name] ?? null,
  }))
}
