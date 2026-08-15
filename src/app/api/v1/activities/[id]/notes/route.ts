import { activities } from "@/db/schema/activities"
import { noteCollectionHandlers } from "@/lib/api/notes-collection"

/**
 * GET / POST /api/v1/activities/{id}/notes
 *
 * The whole body lives in `noteCollectionHandlers` — see that module for why. This file
 * owns exactly one security-relevant value: the `entityType` literal. It is the polymorphic
 * discriminator for the notes table and it reaches a query predicate, so it is a
 * compile-time constant here and is NEVER taken from the request (T-35-01 / T-35-04).
 */
export const { GET, POST } = noteCollectionHandlers({
  entityType: "activity",
  entityLabel: "Activity",
  parentTable: activities,
  routeLabel: "/api/v1/activities/[id]/notes",
})
