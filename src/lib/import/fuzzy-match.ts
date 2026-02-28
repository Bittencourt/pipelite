/**
 * Fuzzy matching for organization names.
 * Uses Levenshtein distance normalized by string length for scoring.
 * Handles variations like "Acme" vs "Acme Corp" vs "Acme Corporation".
 */

interface OrgEntry {
  id: string
  name: string
}

interface MatchResult {
  match: OrgEntry | null
  suggestions: Array<OrgEntry & { score: number }>
}

// Minimum score (0-1) to consider an automatic match
const AUTO_MATCH_THRESHOLD = 0.85
// Minimum score to include in suggestions
const SUGGESTION_THRESHOLD = 0.4

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Create matrix
  const d: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  )

  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return d[m][n]
}

/**
 * Normalize organization name for comparison.
 * Strips common suffixes and normalizes whitespace/case.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(inc|corp|corporation|ltd|llc|co|company|group|gmbh|sa|ag)\b\.?/gi, "")
    .replace(/[.,\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Calculate similarity score between two strings (0-1).
 * Uses normalized Levenshtein distance combined with prefix matching.
 */
function similarityScore(input: string, candidate: string): number {
  const a = normalize(input)
  const b = normalize(candidate)

  // Exact match after normalization
  if (a === b) return 1.0

  // One contains the other (e.g., "Acme" vs "Acme Corp")
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length)
    const longer = Math.max(a.length, b.length)
    return 0.8 + (shorter / longer) * 0.2
  }

  // Levenshtein-based similarity
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1.0

  const distance = levenshteinDistance(a, b)
  return 1 - distance / maxLen
}

/**
 * Find the best fuzzy match for an organization name.
 *
 * Returns:
 * - match: best match if score > threshold, null otherwise
 * - suggestions: all matches above suggestion threshold, sorted by score
 */
export function fuzzyMatchOrganization(
  name: string,
  existingOrgs: OrgEntry[]
): MatchResult {
  if (!name || !name.trim()) {
    return { match: null, suggestions: [] }
  }

  // First check for exact case-insensitive match
  const exactMatch = existingOrgs.find(
    (org) => org.name.toLowerCase().trim() === name.toLowerCase().trim()
  )
  if (exactMatch) {
    return {
      match: exactMatch,
      suggestions: [{ ...exactMatch, score: 1.0 }],
    }
  }

  // Score all organizations
  const scored = existingOrgs
    .map((org) => ({
      ...org,
      score: similarityScore(name, org.name),
    }))
    .filter((org) => org.score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.score - a.score)

  const bestMatch = scored[0]
  const match =
    bestMatch && bestMatch.score >= AUTO_MATCH_THRESHOLD ? bestMatch : null

  return {
    match: match ? { id: match.id, name: match.name } : null,
    suggestions: scored.map(({ id, name, score }) => ({ id, name, score })),
  }
}

/**
 * Get matching suggestions for an organization name.
 * Returns top N matches sorted by score.
 */
export function getMatchingSuggestions(
  name: string,
  existingOrgs: OrgEntry[],
  limit: number = 5
): Array<OrgEntry & { score: number }> {
  const { suggestions } = fuzzyMatchOrganization(name, existingOrgs)
  return suggestions.slice(0, limit)
}
