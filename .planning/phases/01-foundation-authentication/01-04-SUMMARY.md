---
phase: 01-foundation-authentication
plan: 04
subsystem: auth
tags: [login, logout, password-reset, remember-me, user-menu, nav-header, shadcn-ui, next-auth]

requires:
  - phase: 01-02
    provides: "Auth.js v5 config with Credentials provider, signIn/signOut, sendPasswordResetEmail, hashPassword"
  - phase: 01-03
    provides: "Auth layout for centered card pages, signup/verify-email pages"
provides:
  - "Login page at /login with email, password, remember me checkbox"
  - "Forgot password page at /forgot-password with anti-enumeration response"
  - "Reset password page at /reset-password?token= with new password form"
  - "POST /api/forgot-password creates SHA-256 hashed reset token (1 hour expiry)"
  - "POST /api/reset-password validates token hash, updates password"
  - "UserMenu dropdown with email, role, API keys link, admin link, logout"
  - "NavHeader server component with session-aware rendering"
  - "Home page with auth-aware content (landing vs dashboard)"
  - "Remember me wired to JWT with 30-day token expiry"
affects: [01-05, 01-06, all-future-phases]

tech-stack:
  added: [sonner]
  patterns: [remember-me-jwt-expiry, anti-enumeration-password-reset, server-component-nav]

key-files:
  created:
    - src/app/(auth)/login/page.tsx
    - src/app/(auth)/forgot-password/page.tsx
    - src/app/(auth)/reset-password/page.tsx
    - src/app/api/forgot-password/route.ts
    - src/app/api/reset-password/route.ts
    - src/components/user-menu.tsx
    - src/components/nav-header.tsx
    - src/components/ui/checkbox.tsx
    - src/components/ui/sonner.tsx
  modified:
    - src/auth.ts
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/(auth)/layout.tsx

key-decisions:
  - "Remember me implemented via custom JWT expiry (30 days) set in jwt callback when rememberMe flag passed from authorize"
  - "Kept Geist fonts from project scaffold instead of switching to Inter as plan suggested"
  - "Auth layout min-height adjusted for NavHeader (calc(100vh-3.5rem) instead of 100vh)"

patterns-established:
  - "Password reset uses same token-hash pattern as email verification (store SHA-256 hash, send raw token)"
  - "NavHeader is a server component using auth() for session checking"
  - "UserMenu is a client component receiving user props from server parent"
  - "Home page renders different content based on auth state"

duration: 5min
completed: 2026-02-22
---

# Phase 1 Plan 4: Login, Password Reset & Logout Summary

**Login with remember-me JWT extension (7/30 day), password reset flow with SHA-256 hashed tokens and anti-enumeration, and session-aware NavHeader with UserMenu dropdown**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T17:17:31Z
- **Completed:** 2026-02-22T17:22:25Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments
- Login page at /login with email, password, remember me checkbox, error handling for invalid credentials/not approved/not verified, and redirect to callbackUrl
- Password reset flow: forgot-password page sends reset email (1 hour expiry), reset-password page validates token and updates password, both with anti-enumeration responses
- UserMenu dropdown with email, role display, API keys link, admin-only user management link, and logout
- NavHeader server component renders sign-in/sign-up buttons for anonymous users, UserMenu for authenticated users
- Root layout updated with NavHeader, Toaster, and Pipelite branding
- Home page shows landing content for anonymous users, dashboard placeholder for authenticated users
- Remember me wired to JWT: custom token.exp set to 30 days when checked, 7-day default otherwise

## Task Commits

Each task was committed atomically:

1. **Task 1: Create login page with remember me** - `9e29b0a` (feat)
2. **Task 2: Create password reset flow** - `e48b70d` (feat)
3. **Task 3: Create logout functionality and user menu** - `be19516` (feat)

## Files Created/Modified
- `src/app/(auth)/login/page.tsx` - Login form with email, password, remember me checkbox, Auth.js signIn integration
- `src/app/(auth)/forgot-password/page.tsx` - Forgot password form with success state showing "check your email"
- `src/app/(auth)/reset-password/page.tsx` - Reset password form with token validation, success/error states
- `src/app/api/forgot-password/route.ts` - Creates SHA-256 hashed reset token, sends email, anti-enumeration response
- `src/app/api/reset-password/route.ts` - Validates token hash, updates password, deletes used token
- `src/components/user-menu.tsx` - Client component: dropdown with email, role, API keys, admin link, logout
- `src/components/nav-header.tsx` - Server component: session-aware header with Pipelite branding
- `src/components/ui/checkbox.tsx` - shadcn checkbox component
- `src/components/ui/sonner.tsx` - shadcn sonner (toast) component
- `src/auth.ts` - Added rememberMe flag propagation from authorize to JWT callback with custom expiry
- `src/app/layout.tsx` - Updated with NavHeader, Toaster, Pipelite metadata
- `src/app/page.tsx` - Auth-aware home page (landing vs dashboard)
- `src/app/(auth)/layout.tsx` - Adjusted min-height for NavHeader

## Decisions Made
- **Remember me via JWT expiry:** Instead of using database-backed session duration or cookies.sessionToken.options.maxAge, implemented remember me by setting `token.exp` directly in the JWT callback when the `rememberMe` flag is present. This is the simplest approach that works with Auth.js v5 JWT strategy -- 30 days when checked, 7 days (default session.maxAge) otherwise.
- **Kept Geist fonts:** The plan suggested switching to Inter, but the project was scaffolded with Geist/Geist_Mono in 01-01. Kept the existing fonts to avoid unnecessary churn.
- **Auth layout height fix:** Adjusted auth layout from `min-h-screen` to `min-h-[calc(100vh-3.5rem)]` to account for the NavHeader added to root layout, preventing auth pages from overflowing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed auth layout min-height for NavHeader**
- **Found during:** Task 3 (Create logout functionality and user menu)
- **Issue:** Auth layout used `min-h-screen` but NavHeader (3.5rem) is now in root layout, causing auth pages to extend 3.5rem beyond viewport
- **Fix:** Changed to `min-h-[calc(100vh-3.5rem)]`
- **Files modified:** src/app/(auth)/layout.tsx
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** be19516 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial CSS fix for correct layout composition. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - all configuration was handled in Plan 01-01 (.env.example with SMTP_*, AUTH_SECRET, DATABASE_URL).

## Next Phase Readiness
- Login, password reset, and logout flows complete
- Ready for admin user management (Plan 01-05): users can log in, admin sees "User Management" link in dropdown
- Ready for API key management (Plan 01-06): users see "API Keys" link in dropdown
- NavHeader and UserMenu established for all future pages
- Home page provides dashboard shell for future phase content
- No blockers identified

## Self-Check: PASSED

All 9 created files verified present. All 3 task commits verified in git history.

---
*Phase: 01-foundation-authentication*
*Completed: 2026-02-22*
