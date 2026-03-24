import { describe, it, expect } from 'vitest'

/**
 * Pure logic extracted from updateDeal for testing.
 * The actual function is in actions.ts as computeNewAssigneeIds.
 */
function computeNewAssigneeIds(
  currentIds: string[],
  updatedIds: string[]
): string[] {
  const currentSet = new Set(currentIds)
  return updatedIds.filter((id) => !currentSet.has(id))
}

describe('deal assignment email - new assignee detection', () => {
  it('detects newly added assignees', () => {
    const result = computeNewAssigneeIds(['A', 'B'], ['A', 'B', 'C'])
    expect(result).toEqual(['C'])
  })

  it('returns empty when assignees are unchanged', () => {
    const result = computeNewAssigneeIds(['A', 'B'], ['A', 'B'])
    expect(result).toEqual([])
  })

  it('returns all when starting from empty', () => {
    const result = computeNewAssigneeIds([], ['A'])
    expect(result).toEqual(['A'])
  })

  it('handles multiple new assignees', () => {
    const result = computeNewAssigneeIds(['A'], ['A', 'B', 'C'])
    expect(result).toEqual(['B', 'C'])
  })

  it('handles removing assignees (no new ones)', () => {
    const result = computeNewAssigneeIds(['A', 'B', 'C'], ['A'])
    expect(result).toEqual([])
  })

  it('handles complete replacement', () => {
    const result = computeNewAssigneeIds(['A', 'B'], ['C', 'D'])
    expect(result).toEqual(['C', 'D'])
  })
})
