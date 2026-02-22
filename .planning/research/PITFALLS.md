# Pitfalls Research

**Domain:** CRM / Self-Hostable Business Application
**Researched:** 2026-02-22
**Confidence:** HIGH

## Critical Pitfalls

Mistakes that cause rewrites, major delays, or production failures.

---

### Pitfall 1: JSON Column Abuse for Custom Fields

**What goes wrong:**
Storing all custom field data in a single JSONB column seems flexible, but leads to:
- Impossible to query efficiently ("find all deals where custom_field_X > 100")
- No referential integrity (can't link custom fields to other entities)
- Indexing nightmare (GIN indexes help but can't match column indexes)
- Type validation must be done entirely in application code
- Formula evaluation requires parsing JSON on every access

**Why it happens:**
"EAV pattern is too complex" + "JSONB is flexible" = shortcut that feels smart

**How to avoid:**
Use **Entity-Attribute-Value (EAV) pattern with proper foreign keys**:
```sql
-- Custom field definitions (schema)
custom_fields: id, entity_type, name, field_type, config

-- Custom field values (data)  
custom_field_values: id, entity_id, custom_field_id, value_text, value_number, value_date

-- This allows:
-- 1. Typed storage (numbers in number column, dates in date column)
-- 2. Indexes per type
-- 3. Foreign keys for relational custom fields
-- 4. Efficient queries with proper indexes
```

**Warning signs:**
- You're writing `data->>'field_name'` in WHERE clauses
- GIN index on JSONB column is getting large
- Query performance degrades as custom fields grow
- Formula evaluation requires full JSON parsing

**Phase to address:**
Phase 2 (Custom Fields) — Get the data model right from the start

---

### Pitfall 2: Formula Engine Security Vulnerabilities

**What goes wrong:**
Naive formula evaluation with `eval()`, `new Function()`, or string interpolation leads to:
- Arbitrary code execution: `{deal.value} * Math.process.exit(1)`
- Access to Node.js APIs: `require('fs').readFileSync('/etc/passwd')`
- Infinite loops: `while(true) {}`
- Memory exhaustion attacks

**Why it happens:**
"Just need simple math" → "I'll use eval, it's fast" → security disaster

**How to avoid:**
1. **Use a proper expression parser** (not `eval`):
   - Build AST-based evaluator
   - Implement whitelist of allowed functions
   - Enforce execution timeout
   - Limit recursion depth

2. **Expression language examples**:
   ```typescript
   // SAFE: AST-based evaluation
   function evaluateFormula(ast: FormulaAST, context: Record<string, unknown>): number {
     switch (ast.type) {
       case 'number': return ast.value;
       case 'field': return context[ast.name] ?? 0;
       case 'binary': {
         const left = evaluateFormula(ast.left, context);
         const right = evaluateFormula(ast.right, context);
         return ast.operator === '+' ? left + right 
              : ast.operator === '*' ? left * right
              : /* ... */;
       }
     }
   }
   ```

3. **Consider existing libraries**:
   - `expr-eval` (JavaScript expression parser)
   - `jsep` (JavaScript expression parser)
   - Build custom if requirements are simple

**Warning signs:**
- Formula evaluation uses `eval` or `Function`
- No timeout on formula execution
- Users can reference any JavaScript global
- Formula errors crash the entire request

**Phase to address:**
Phase 2 (Custom Fields + Formulas) — Security must be designed in

---

### Pitfall 3: Kanban N+1 Query Pattern

**What goes wrong:**
Loading a kanban board with 500+ deals across 10 stages triggers:
- Query 1: Get all stages
- Query 2: For each stage, get deals → 10 more queries
- Query 3: For each deal, get activities → 500 more queries
- Total: 511 queries for one page load

**Why it happens:**
ORM lazy loading + "it works with 10 test records" = production disaster

**How to avoid:**
1. **Single query with joins/aggregation**:
   ```sql
   SELECT 
     s.id as stage_id,
     s.name as stage_name,
     COUNT(d.id) as deal_count,
     SUM(d.value) as total_value,
     json_agg(
       json_build_object('id', d.id, 'title', d.title, 'value', d.value)
       ORDER BY d.updated_at DESC
       LIMIT 20
     ) as deals
   FROM stages s
   LEFT JOIN deals d ON d.stage_id = s.id
   WHERE d.pipeline_id = $1
   GROUP BY s.id
   ORDER BY s.position;
   ```

2. **For deal details, batch-load**:
   ```typescript
   // BAD: N+1
   for (const deal of deals) {
     deal.activities = await getActivities(deal.id);
   }
   
   // GOOD: Batch load
   const dealIds = deals.map(d => d.id);
   const allActivities = await getActivitiesForDeals(dealIds);
   const activitiesByDealId = groupBy(allActivities, a => a.deal_id);
   ```

3. **Implement cursor-based pagination** for large pipelines:
   - Don't load all deals at once
   - Load visible + buffer (e.g., 50 deals per stage)
   - Infinite scroll within stages

**Warning signs:**
- Page load > 2 seconds with 100+ deals
- Database query count spikes on kanban load
- ORM `include`/`with` chains getting deep
- Loading spinner on every stage expansion

**Phase to address:**
Phase 1 (Pipeline/Kanban) — Must be designed for scale from day one

---

### Pitfall 4: API-First But Frontend-Coupled

**What goes wrong:**
Building "API-first" but actually:
- API endpoints return UI-specific data shapes
- Frontend state management drives API design
- API changes require frontend coordination
- Third-party integrations are impossible

**Why it happens:**
"I'll clean up the API later" → later never comes → technical debt compounds

**How to avoid:**
1. **Design API from data model, not UI**:
   ```typescript
   // BAD: UI-coupled
   GET /api/kanban/deals
   Response: { stages: [{ id, name, deals: [{ id, title, color }] }] }
   
   // GOOD: Resource-oriented
   GET /api/pipelines/:id/stages
   Response: [{ id, name, position }]
   
   GET /api/stages/:id/deals?include=organization,primary_contact
   Response: { data: [{ id, title, value, ... }], included: {...} }
   ```

2. **API contract tests** that don't import frontend code:
   ```typescript
   // tests/api/deals.test.ts
   describe('Deals API', () => {
     it('returns deal with organization', async () => {
       const response = await fetch('/api/deals/123?include=organization');
       // Test without any React components
     });
   });
   ```

3. **Use JSON:API or similar spec** for consistency:
   - Predictable URL patterns
   - Standard include/sparse fieldsets
   - Standard error format
   - Standard pagination

**Warning signs:**
- API tests import React components
- Endpoint names match page routes
- Response shape changes when UI changes
- No API documentation because "it's obvious from frontend code"

**Phase to address:**
Phase 1 (Core Entities) — Establish API patterns early

---

### Pitfall 5: Missing Soft Delete Strategy

**What goes wrong:**
Deals get deleted, then:
- Historical reports show wrong totals ("pipeline was $500k last month" → now shows $200k)
- Activity history references deleted deals
- Users accidentally delete important records
- No audit trail for compliance

**Why it happens:**
"Delete means delete, right?" → no, in business apps it usually means "archive"

**How to avoid:**
1. **Add `deleted_at` timestamp to all entities**:
   ```sql
   ALTER TABLE deals ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
   CREATE INDEX idx_deals_not_deleted ON deals(id) WHERE deleted_at IS NULL;
   ```

2. **Default scope excludes deleted** (Drizzle example):
   ```typescript
   export const deals = pgTable('deals', {
     // ... other fields
     deletedAt: timestamp('deleted_at'),
   });
   
   // In queries
   const activeDeals = await db.select()
     .from(deals)
     .where(isNull(deals.deletedAt));
   ```

3. **Hard delete only for specific compliance reasons**:
   - GDPR "right to be forgotten"
   - Data retention policies
   - Admin action with audit log

4. **Consider cascade soft delete** for related entities:
   - When organization is soft-deleted, cascade to deals
   - Or prevent deletion if related records exist

**Warning signs:**
- DELETE endpoint does actual DELETE
- Historical reports show fluctuating numbers
- "I deleted that deal by mistake, can you restore it?"
- No way to see deleted records

**Phase to address:**
Phase 1 (Core Entities) — Add from the start, painful to add later

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| JSONB for all custom fields | Fast initial implementation | Query performance, no indexing, formula complexity | Never for queryable fields |
| `eval()` for formulas | Working formulas in 1 hour | Security vulnerability, code execution risk | Never |
| No pagination on lists | Simpler API | OOM errors with large datasets, slow page loads | MVP only with <100 records guaranteed |
| Skip soft delete | Faster initial CRUD | Lost data, broken reports, no audit trail | Never in business apps |
| Store files in database | Simple deployment | Database bloat, no CDN, backup issues | Only for tiny files (<100KB) |
| Skip API versioning | Faster iteration | Breaking changes for API consumers | Single-tenant with no external API users |
| Auth in Next.js API routes only | Simpler setup | Can't have background jobs access auth context | Never if background jobs planned |
| No database migrations | Faster development | Can't reproduce production schema, deployment issues | Never |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Redis | Storing full objects | Store IDs + lightweight data, use JSON serialization sparingly |
| Redis | No TTL on cache keys | Always set TTL, even if long (24h+), prevents memory bloat |
| Email (SMTP) | Synchronous sending | Queue with BullMQ, retry logic, track delivery status |
| File Storage | Local filesystem in Docker | Use volume mounts or S3-compatible (MinIO for self-hosted) |
| Webhooks | No retry on failure | Queue webhooks, exponential backoff, dead letter queue |
| Background Jobs | In-process execution | Use separate worker process (BullMQ) to not block API |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Kanban full load** | Page load > 2s | Cursor pagination, lazy load deal details | 100+ deals visible |
| **Custom field N+1** | Slow entity detail pages | Batch load custom field values, cache field definitions | 10+ custom fields per entity |
| **Activity timeline** | Slow deal detail load | Limit activities, pagination, aggregate counts | 50+ activities per deal |
| **Search without index** | Search takes > 500ms | PostgreSQL full-text search, trigram indexes | 1000+ records |
| **No query result limit** | Large responses, timeouts | Default limit (50), max limit (500), pagination | Any list endpoint |
| **Session in memory** | Lost sessions on restart, can't scale | Redis session storage | Multi-instance deploy or restart |
| **Formula recalc on read** | Slow list views | Calculate on write, store result, recalc on field change | 10+ formula fields |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Formula eval()** | Remote code execution | AST-based evaluator, function whitelist, timeout |
| **API auth bypass** | Data exposure | Auth middleware on every route, test every endpoint |
| **ID enumeration** | Unauthorized data access | Use UUIDs or check ownership on every query |
| **CSV import injection** | Formula injection in Excel | Sanitize CSV output, escape `= + - @` |
| **Search injection** | SQL injection via search params | Parameterized queries, never string interpolation |
| **Mass assignment** | Users modify protected fields | Explicit field allowlists in update endpoints |

## UX Pitfalls

Common user experience mistakes in CRM applications.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **Required fields everywhere** | Users enter fake data to proceed | Minimal required fields, progressive disclosure |
| **No inline edit** | Too many clicks, context loss | Edit in place on kanban cards, list views |
| **Auto-save without indication** | Users don't trust "is this saved?" | Visual save indicator, explicit save for destructive actions |
| **Stage change requires detail page** | Disrupts workflow | Drag-drop on kanban, quick action menu |
| **No activity defaults** | Repetitive data entry | Default activity type by context, templates |
| **Search only one entity type** | "Where was that contact?" | Global search across all entities |
| **No keyboard navigation** | Slow for power users | Keyboard shortcuts for common actions |
| **Dates without timezone** | Meeting at wrong time | Store UTC, display in user timezone |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Kanban Board:** Often missing pagination — verify it handles 500+ deals
- [ ] **Custom Fields:** Often missing validation — verify type checking, required enforcement
- [ ] **Formulas:** Often missing error handling — verify graceful failure on invalid data
- [ ] **Search:** Often missing relevance ranking — verify results are useful, not just present
- [ ] **Import:** Often missing rollback — verify partial failure doesn't leave inconsistent state
- [ ] **Export:** Often missing streaming — verify large exports don't timeout
- [ ] **Permissions:** Often missing edge cases — verify cross-entity access (deal → org you can't see)
- [ ] **Soft Delete:** Often missing cascade — verify related records are handled
- [ ] **API:** Often missing pagination — verify all list endpoints have limits
- [ ] **Background Jobs:** Often missing observability — verify you can see job status, failures

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| JSONB custom fields | HIGH | Create EAV tables, migrate data, update all queries — weeks of work |
| Formula eval() | HIGH | Rewrite entire formula engine, re-validate all stored formulas |
| N+1 queries | MEDIUM | Identify slow queries, add indexes, refactor to batch loads |
| No soft delete | MEDIUM | Add deleted_at, create indexes, update all queries |
| API coupling | MEDIUM | Create new versioned endpoints, deprecate old ones |
| No pagination | LOW | Add limit/offset to queries, update clients |
| Missing indexes | LOW | Analyze slow queries, add indexes (can do live on PostgreSQL) |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| JSONB abuse | Phase 2 (Custom Fields) | Load test with 1000 entities, 20 custom fields each |
| Formula security | Phase 2 (Formulas) | Security review, penetration testing |
| Kanban N+1 | Phase 1 (Pipeline) | Query count logging, verify single query per stage |
| API coupling | Phase 1 (Core Entities) | API tests that don't import frontend, document endpoints |
| Soft delete | Phase 1 (Core Entities) | Delete and restore flow, verify reports unchanged |
| Missing indexes | Phase 1 (All Lists) | Explain analyze on all list queries |
| Search performance | Phase 1 (Search) | Search response time < 200ms with 10k records |
| Permission edge cases | Phase 1 (Permissions) | Cross-entity access tests, ID enumeration tests |

## CRM-Specific Pitfalls

Pitfalls unique to CRM domain based on competitor analysis.

### The "Spreadsheet Import" Trap

**What:** Users expect to paste Excel data and have it "just work"

**Why it's hard:**
- Field detection (is this column "email" or "contact_email"?)
- Relationship resolution (organization name → organization_id)
- Duplicate detection (is "Acme Corp" the same as "Acme Corporation"?)
- Validation errors on row 947 of 1000

**Prevention:**
- Preview step with field mapping UI
- Show first 10 rows for validation
- Dry-run mode that reports errors without committing
- Transaction rollback on any failure
- "Continue on error" option for non-critical rows

### The "Pipedrive Did It" Trap

**What:** Every feature request starts with "Pipedrive has..."

**Why it's dangerous:**
- Pipedrive has 10+ years of development
- Features interact in complex ways
- Some features exist for enterprise customers you don't have
- You lose your differentiation ("lightweight")

**Prevention:**
- Document your "won't do" list explicitly
- Evaluate each feature against target user (50 users, not 5000)
- Build opinionated workflows, not configurability
- Say no to features that add maintenance burden

### The "Multi-Entity Form" Trap

**What:** Creating a deal should also create organization + person in one form

**Why it's complex:**
- Nested form validation (deal valid but person email invalid?)
- Partial save (organization created, person failed)
- Duplicate detection mid-form (organization already exists)
- Required field timing (organization required, but creating inline)

**Prevention:**
- Start with separate forms, add inline creation later
- Use autocomplete for existing entities, modal for new
- Consider "draft" state for partial data
- Test the unhappy paths extensively

## Sources

- **React Performance** - Kent C. Dodds "When to useMemo and useCallback", Josh Comeau "Understanding useMemo and useCallback"
- **PostgreSQL JSON** - Official PostgreSQL 18 Documentation on JSON Types
- **Prisma Migrate** - Prisma Documentation on patching/hotfixing migrations
- **Next.js + Postgres** - Vercel Knowledge Base guide
- **Open Source CRM Issues** - Twenty CRM, NocoDB, Baserow GitHub issues
- **Formula Engine Security** - Common vulnerability patterns in expression evaluation
- **EAV Pattern** - Standard database design pattern for flexible schemas
- **Personal Experience** - CRM development patterns from Pipedrive-inspired projects

---
*Pitfalls research for: CRM / Self-Hostable Business Application*
*Researched: 2026-02-22*
