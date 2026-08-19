/**
 * RED-phase stubs. Implemented in the GREEN commit of plan 39-01 task 2.
 */
import type { DedupReason, DedupTier } from "./types"

export interface DedupClassification {
  tier: DedupTier
  reason: DedupReason
}

export interface PersonMatchSide {
  email: string | null | undefined
  normName: string
  normPhone: string
}

export interface OrganizationMatchSide {
  normName: string
  customFields: Record<string, unknown> | null | undefined
}

export function isValidMatchEmail(_email: string | null | undefined): boolean {
  throw new Error("not implemented")
}

export function classifyPersonMatch(
  _a: PersonMatchSide,
  _b: PersonMatchSide
): DedupClassification | null {
  throw new Error("not implemented")
}

export function classifyOrganizationMatch(
  _a: OrganizationMatchSide,
  _b: OrganizationMatchSide,
  _identityFields: readonly string[]
): DedupClassification | null {
  throw new Error("not implemented")
}
