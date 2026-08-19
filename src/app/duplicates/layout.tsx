/**
 * THE FIRST OF THE TWO CONTROLS THAT MAKE `/duplicates` ADMIN-ONLY, AND THE AUTHORITY FOR THE
 * WHOLE SUBTREE.
 *
 * THERE IS NO GATE ABOVE THIS FILE. `src/middleware.ts` is five lines — a
 * `NextAuth(authConfig).auth` export with a catch-all matcher — and it performs NO role check at
 * all: it establishes a session for every non-API route and nothing more. `/duplicates` also sits
 * outside `/admin`, so it inherits none of `src/app/admin/layout.tsx`'s enforcement either. The two
 * redirects below are copied from that file precisely because they are the only page-render control
 * this route will ever have.
 *
 * A layout renders for EVERY nested route, so this covers `/duplicates` and
 * `/duplicates/[pairId]` (plan 39-15) alike, and covers a direct URL navigation exactly as it
 * covers a click. Adding a route segment under `/duplicates` inherits the gate automatically.
 *
 * IT IS NOT THE ONLY CONTROL, AND `actions.ts` IS NOT REDUNDANT WITH IT. A layout redirect protects
 * page RENDERS. It does not — and cannot — protect a server action, which is a POST endpoint the
 * browser can invoke with no page involved (`src/app/admin/audit/actions.ts:6-10` records the same
 * fact for `/admin/*`). Every exported action in `actions.ts` therefore re-checks the role itself.
 * `src/app/duplicates/__tests__/duplicates-actions-wiring.test.ts` gates both halves.
 *
 * AND THE HIDDEN LINK IS NOT A CONTROL EITHER. Plan 39-16 shipped an admin-only `Find duplicates`
 * button on the `/organizations` and `/people` toolbars. Hiding a link is presentation; until this
 * file existed the route 404'd, and from the moment it exists this is what refuses a non-admin who
 * types the URL.
 *
 * NO SHELL OF ITS OWN. `/duplicates` is a sibling of the user-facing list pages and uses their
 * `container py-8` shell, which `page.tsx` owns — not the `/admin` rail. This layout adds the gate
 * and nothing else.
 */

import { redirect } from "next/navigation"

import { auth } from "@/auth"

export default async function DuplicatesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/login?callbackUrl=/duplicates")
  }

  if (session.user.role !== "admin") {
    redirect("/?error=unauthorized")
  }

  return <>{children}</>
}
