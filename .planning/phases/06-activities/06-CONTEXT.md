# Phase 6: Activities - Context

**(Gathered:** 2026-02-24**
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create and track, and complete activities (calls, meetings, tasks, emails) with due dates. Activities can be linked to deals for and user can view them in a list with filtering by type, date, and deal. Users can view activities in a calendar view organized by due date. Activity views show context of their linked deals.

</domain>

<decisions>
## Implementation Decisions

### Activity Types & Fields
- **Types:** Fixed set (Call, Meeting, Task, Email) + custom activity types created by admin
- **Different types share same fields:** All activity types use the same base fields ( title, due date/time, type, deal link, completion status, notes ( 
- **Type selection:** Simple dropdown with type name and icon
- **Deal link:** Searchable dropdown with recent deals
- **Completion status:** Done/Not Done toggle ( simple)
- **Notes:** Optional text field for additional details
- **Success metrics:** No completion rate or percentage needed
- **Custom types:** Admin can create new activity types with name and icon ( optional color

### Calendar View Layout
- **View type:** Week view (7-day grid) - more detailed than month view
- **Multiple activities:** List within day cell, scrollable if many
- **Navigation:** Month/week navigation with arrows or tabs
- **Closed deals filter:** Toggle filter to settings to include/exclude won/lost deals

### Activity List & Filtering
- **Layout:** Data table with columns ( Type, Title, Due Date, Deal, Status )
- **Filters:** Type, Status, Deal, Owner (all available)
- **Sorting:** Due date ascending (earliest first)
- **Overdue handling:** Visual highlighting (red/amber) + separate "Overdue" section at top of list
- **Notifications:** Yes, send email/in-app notifications for overdue activities (Phase 8+ feature)

### Deal Linking UX
- **Selection:** Searchable dropdown to filter deals
- **Linked info display:** Inline badge showing deal title, pipeline name, stage
- **Navigation:** Click to open deal detail from activity card

### OpenCode's Discretion
- **Loading states:** Skeleton loaders, empty state placeholders
- **Calendar styling:** Color scheme for patterns
- **Notification implementation:** Email/in-app system architecture

</decisions>

<specifics>
## Specific Ideas

- "I want the calendar to be quick and intuitive - similar to Google Calendar's week view"
- "Activities should feel actionable - clear what needs to happen and by when"

</specifics>

<deferred>
## Deferred Ideas

- **Reminders/snoozing** — Could be separate notification system (deferred for simplicity)
- **Recurring activities** — future phase
- **Activity templates per user** — future phase (admin can configure)

</deferred>

---

*Phase: 06-activities*
*Context gathered: 2026-02-24*
