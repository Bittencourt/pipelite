/**
 * Seed script for default activity types
 * Run with: npm run db:seed-activities
 */

import { db } from "@/db"
import { activityTypes } from "@/db/schema"
import { eq } from "drizzle-orm"

const defaultTypes = [
  {
    id: "call",
    name: "Call",
    icon: "Phone",
    color: "#3B82F6", // blue
    isDefault: true,
  },
  {
    id: "meeting",
    name: "Meeting",
    icon: "Users",
    color: "#10B981", // green
    isDefault: true,
  },
  {
    id: "task",
    name: "Task",
    icon: "CheckSquare",
    color: "#F59E0B", // amber
    isDefault: true,
  },
  {
    id: "email",
    name: "Email",
    icon: "Mail",
    color: "#8B5CF6", // purple
    isDefault: true,
  },
]

async function seed() {
  console.log("Seeding default activity types...")

  for (const type of defaultTypes) {
    try {
      // Check if type already exists
      const existing = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, type.id),
      })

      if (!existing) {
        await db.insert(activityTypes).values(type)
        console.log(`✓ Created activity type: ${type.name}`)
      } else {
        console.log(`→ Activity type already exists: ${type.name}`)
      }
    } catch (error) {
      console.error(`✗ Failed to create activity type ${type.name}:`, error)
    }
  }

  console.log("Done!")
}

seed().catch(console.error)
