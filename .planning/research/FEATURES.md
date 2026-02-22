# Feature Research

**Domain:** Lightweight / Self-hostable CRM
**Researched:** 2026-02-22
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Contact Management** | Core CRM function - users need to track people | LOW | People with names, emails, phones, organization links |
| **Organization Management** | B2B sales requires company tracking | LOW | Companies with name, domain, address, industry |
| **Deal/Opportunity Tracking** | Sales pipeline is why people buy CRMs | MEDIUM | Deals linked to org + person, with value, stage, probability |
| **Pipeline with Kanban View** | Visual deal management is standard (Pipedrive's signature) | MEDIUM | Drag-drop stages, deal counts per stage, value totals |
| **Activities/Tasks** | Follow-ups are the lifeblood of sales | MEDIUM | Calls, meetings, emails, deadlines linked to deals/contacts |
| **Basic Search** | Users need to find records quickly | LOW | Search across names, emails, deal titles |
| **Basic Filtering** | Users need to narrow lists | LOW | Filter by stage, owner, date range |
| **User Management** | Multi-user teams expect login/accounts | MEDIUM | Users with roles, email/password auth |
| **Basic Permissions** | Not everyone should see everything | MEDIUM | Owner-based visibility, admin vs user roles |
| **Import (CSV)** | Data migration is required for adoption | MEDIUM | Import contacts, organizations, deals from spreadsheets |
| **Export** | Users need to get data out | LOW | CSV export of records |
| **REST API** | Integration expectations | MEDIUM | CRUD endpoints for all entities |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Custom Fields with Formulas** | Adapt CRM to unique business needs without code | HIGH | Number, text, date, select fields + formula expressions |
| **Multiple Pipelines** | Different sales processes need different funnels | MEDIUM | E.g., "Sales" vs "Partnerships" pipelines with unique stages |
| **Advanced Views (Filters, Sort, Group By)** | Power users work faster with customized views | MEDIUM | Save views, share views, default views per pipeline |
| **Activity Reminders & Notifications** | Never miss a follow-up | MEDIUM | Email/web push reminders for due activities |
| **Deal Value Forecasts** | Sales leaders need pipeline analytics | MEDIUM | Weighted pipeline value by stage, by owner, by period |
| **Email Integration** | Capture communication automatically | HIGH | Send/receive emails linked to deals, templates, tracking |
| **Activity Timeline** | See full history of interactions | LOW | Chronological feed of activities on deal/contact/org |
| **Bulk Actions** | Efficiency for common operations | MEDIUM | Bulk edit, bulk delete, bulk reassign, bulk email |
| **Webhook/API Events** | Automation and integration triggers | LOW | Fire webhooks on deal stage change, activity creation |
| **Mobile-Friendly UI** | Sales happens on the go | MEDIUM | Responsive design, not native app |
| **Audit Log** | Compliance and debugging | MEDIUM | Track who changed what and when |
| **Single-Tenant Self-Hosting** | Full data control, no vendor lock-in | LOW | Docker deployment, simple config, one DB per instance |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Multi-tenancy** | "Let multiple companies use it" | Significant complexity for auth, data isolation, billing; contradicts "single-tenant" goal | Deploy multiple instances |
| **AI Features** | "Everyone has AI now" | Adds complexity, may need external APIs, privacy concerns for self-hosted | Keep simple, formula fields can calculate |
| **Marketing Automation** | "Email campaigns like Mailchimp" | Massive scope creep, different domain expertise | Integrate with dedicated tools via API |
| **Full ERP (Invoicing, Inventory)** | "All-in-one solution" | CRM becomes bloated, loses focus, maintenance burden | Integrate with Odoo/ERPNext via API |
| **Social Media Integration** | "Track LinkedIn/Twitter" | APIs change frequently, OAuth complexity, adds maintenance | Manual entry + link fields |
| **Real-time Collaboration** | "See when others are editing" | WebSockets complexity, operational transforms, conflict resolution | Refresh-based, activity log shows changes |
| **Complex Workflow Engine** | "Visual workflow builder like n8n" | Massive scope, better handled by external automation | Simple triggers + webhooks to external tools |
| **Customer Portal** | "Let customers log in" | Security surface, different UX needs, authentication complexity | Use API + separate front-end if needed |
| **Native Mobile Apps** | "iOS/Android apps" | Double maintenance, app store requirements, push notification infra | Mobile-responsive web app |
| **Built-in Telephony** | "Click to call, call recording" | VoIP integration complexity, legal requirements, regional differences | Link to external phone system via API |

## Feature Dependencies

```
Custom Fields
    └──requires──> Entity System (People, Organizations, Deals)
                       
Formulas
    └──requires──> Custom Fields
    └──requires──> Expression Parser/Engine
    
Pipeline Views
    └──requires──> Deals
    └──requires──> Stages
    └──requires──> Kanban UI Component

Activities
    └──requires──> Users (for assignment)
    └──requires──> Entities (for linking)
    
Reminders
    └──requires──> Activities
    └──requires──> Email/Notification System
    
Email Integration
    └──requires──> Activities (for linking)
    └──requires──> Users (for IMAP/SMTP credentials)
    └──requires──> Background Jobs (for sync)

Multiple Pipelines
    └──requires──> Deals (with pipeline_id)
    └──requires──> Stages (scoped to pipeline)

Bulk Actions
    └──requires──> Entity System
    └──requires──> Permissions System

API
    └──requires──> Entity System
    └──requires──> Authentication
    └──requires──> Authorization/Permissions

Export
    └──requires──> Entity System
    └──requires──> Permissions (respect visibility)

Import
    └──requires──> Entity System
    └──requires──> Field Mapping UI
    └──requires──> Validation Logic
```

### Dependency Notes

- **Formulas require Custom Fields + Expression Parser:** Formulas reference other fields and calculate values dynamically; need a safe expression language
- **Reminders require Activities + Email System:** Must have activities to remind about, and a way to deliver reminders
- **Email Integration requires Background Jobs:** Syncing email is async work; can't block requests
- **Multiple Pipelines enhances Deal Management:** Core deals work without it, but multiple sales processes benefit greatly

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [x] **Organizations** — Core entity for B2B sales
- [x] **People** — Contacts linked to organizations
- [x] **Deals** — Opportunities linked to org + person
- [x] **Pipelines (Single)** — Kanban stages for deal flow
- [x] **Activities (Basic)** — Tasks, calls, meetings linked to deals
- [x] **Users & Auth** — Login, logout, basic roles (admin/user)
- [x] **Basic Permissions** — Owner-based visibility
- [x] **Search** — Find records by name/title
- [x] **REST API** — CRUD for all entities
- [x] **Import/Export** — CSV for contacts, organizations, deals

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Custom Fields** — Allow adding custom data to entities
- [ ] **Formulas** — Calculate values from other fields
- [ ] **Activity Reminders** — Email notifications for due tasks
- [ ] **Advanced Filters** — Multi-field filters, saved views
- [ ] **Multiple Pipelines** — Support different sales processes
- [ ] **Bulk Actions** — Edit/delete multiple records
- [ ] **Activity Timeline** — Chronological history view
- [ ] **Audit Log** — Track changes for compliance

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Email Integration** — Sync, send, track emails
- [ ] **Webhooks** — External automation triggers
- [ ] **Forecasting/Reports** — Pipeline analytics dashboards
- [ ] **Mobile App (PWA)** — Progressive web app with offline
- [ ] **Advanced Permissions** — Fine-grained ACLs
- [ ] **Templates** — Email templates, activity templates

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Organizations | HIGH | LOW | P1 |
| People | HIGH | LOW | P1 |
| Deals | HIGH | MEDIUM | P1 |
| Pipeline (Kanban) | HIGH | MEDIUM | P1 |
| Activities | HIGH | MEDIUM | P1 |
| Users & Auth | HIGH | MEDIUM | P1 |
| Basic Permissions | HIGH | MEDIUM | P1 |
| Search | HIGH | LOW | P1 |
| REST API | HIGH | MEDIUM | P1 |
| Import/Export | MEDIUM | MEDIUM | P1 |
| Custom Fields | HIGH | HIGH | P2 |
| Formulas | MEDIUM | HIGH | P2 |
| Activity Reminders | MEDIUM | MEDIUM | P2 |
| Advanced Filters | MEDIUM | MEDIUM | P2 |
| Multiple Pipelines | MEDIUM | MEDIUM | P2 |
| Bulk Actions | MEDIUM | MEDIUM | P2 |
| Activity Timeline | MEDIUM | LOW | P2 |
| Email Integration | HIGH | HIGH | P3 |
| Webhooks | MEDIUM | LOW | P3 |
| Forecasting | MEDIUM | MEDIUM | P3 |
| Audit Log | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Pipedrive | Twenty | EspoCRM | Monica | SuiteCRM | Our Approach |
|---------|-----------|--------|---------|--------|----------|--------------|
| **Pipeline (Kanban)** | Excellent | Yes | Yes | No | No | Core focus, Pipedrive-inspired |
| **Contact Management** | Yes | Yes | Yes | Yes | Yes | Org → People model |
| **Deal Tracking** | Yes | Yes | Yes | No | Yes | Core entity, linked to org + person |
| **Activities** | Yes | Yes | Yes | Yes | Yes | Tasks, calls, meetings |
| **Custom Fields** | Paid tier | Yes | Yes | Yes | Yes | Core differentiator, include formulas |
| **Email Integration** | Yes | Yes | Yes | Limited | Yes | Defer to v2+ |
| **Multiple Pipelines** | Paid tier | Yes | Yes | No | Yes | P2 feature |
| **API** | Yes | GraphQL | REST | API | REST | REST-first design |
| **Self-Hostable** | No | Yes | Yes | Yes | Yes | Yes, single-tenant Docker |
| **Mobile** | Native app | Responsive | Responsive | Responsive | Responsive | Responsive web |
| **Complexity** | Medium | Medium | Medium-High | Low | High | Low-Medium, focused |
| **Learning Curve** | Low | Low-Medium | Medium | Low | High | Low, opinionated |

## Key Insights

### Why These Table Stakes

1. **Entity relationships (Org → People → Deals → Activities)** are the universal CRM pattern. Every CRM has some version of this.
2. **Kanban pipeline** is what made Pipedrive famous - it's the visual metaphor for sales.
3. **API-first** is expected by modern users and enables the "build your own integrations" self-hosted advantage.

### Where to Differentiate

1. **Custom fields with formulas** - Most CRMs have custom fields, fewer have formula capabilities (Airtable-style). This is specified in PROJECT.md as a focus area.
2. **Self-hosting simplicity** - Competitors like SuiteCRM are complex to deploy. A clean Docker deploy is a competitive advantage.
3. **Opinionated simplicity** - SuiteCRM has 100+ modules. Being "lightweight" means saying no to most features.

### What to Avoid

1. **Don't try to be an ERP** - Odoo and SuiteCRM cover that market.
2. **Don't build marketing automation** - That's Mailchimp/Hubspot territory.
3. **Don't chase AI features** - Adds complexity without core value for the target user.

## Sources

- **Twenty CRM** - https://github.com/twentyhq/twenty (40k stars, modern open-source CRM)
- **Monica** - https://github.com/monicahq/monica (Personal CRM, 24k stars)
- **SuiteCRM** - https://github.com/SuiteCRM/SuiteCRM (Enterprise CRM, 5k stars)
- **EspoCRM** - https://github.com/espocrm/espocrm (2.8k stars)
- **Odoo** - https://github.com/odoo/odoo (Full ERP, 49k stars)
- **Pipedrive** - https://www.pipedrive.com/en/features (Commercial SaaS, inspiration source)
- **Reddit r/selfhosted** - CRM discussions and recommendations

---
*Feature research for: Lightweight Self-Hostable CRM*
*Researched: 2026-02-22*
