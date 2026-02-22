# Phase 1: Foundation & Authentication - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

User accounts with admin approval workflow, role-based permissions, and API key management. Users sign up, verify email, await admin approval, then can log in and manage API keys for external access.

</domain>

<decisions>
## Implementation Decisions

### Signup Flow
- Collect email and password only (no name or other fields)
- Email verification required BEFORE admin sees the signup
- Password minimum: 8 characters
- After signup, show verification page with "check your email" message
- Optional domain whitelist: admin can configure allowed email domains
  - If whitelist is empty, all domains allowed
  - If whitelist populated, signup shows error before verification if domain not allowed

### Admin Approval Workflow
- Dedicated admin panel shows list of pending users
- Only verified users appear in pending list (unverified users invisible to admin)
- Admin sees email address for each pending user
- Admin can approve or reject each signup
- Approved users receive email notification they can now log in
- Rejected signups are logged (not deleted) for record-keeping

### Login/Session Behavior
- Dedicated login page (not modal or sidebar)
- "Remember me" checkbox on login form
  - Without "remember me": session lasts 7 days
  - With "remember me": session lasts 30 days
- Password reset via email link (not temporary password)
- Logout action in user menu dropdown

### API Key Management
- Users can have multiple named API keys (e.g., "Zapier", "Scripts")
- API keys managed in user settings section
- Full key shown once on creation, then masked (e.g., ****abcd)
- Regenerate action available (creates new key value, keeps name)
- Delete action not available (only regenerate)

### OpenCode's Discretion
- Exact email templates wording
- Session token implementation details
- API key format/length
- Masking display format
- Error message wording for domain whitelist rejection

</decisions>

<specifics>
## Specific Ideas

- Domain whitelist is a key feature for self-hosted deployments where teams want to restrict signups to company domains

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-authentication*
*Context gathered: 2026-02-22*
