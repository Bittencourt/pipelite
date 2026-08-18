/**
 * SC-1 — no horizontal overflow at a 320px viewport, on six routes, in all three locales.
 *
 * This is the phase's headline claim and the whole reason the Playwright harness exists. The
 * recorded UAT baseline it is written against (do not re-derive it, and do not relax it):
 *
 *   /organizations, /people, /deals, /activities, /trash   scrollWidth 416 vs clientWidth 305
 *   /admin/audit                                           508 (pt-BR), 526 (es-ES) vs 305
 *
 * es-ES measures WORSE than pt-BR because the admin rail is width-based and Spanish runs longer.
 * That asymmetry is the exact failure mode the original Phase 36 UAT item was written to catch, so
 * es-ES is not optional and neither is measuring more than one locale.
 *
 * The 305 rather than 320 comes from `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }`
 * in playwright.config.ts. Without it headless Chromium reports clientWidth 320 and this whole file
 * green-lights layouts that still scroll sideways on a real phone.
 *
 * The viewport is neither declared nor changed anywhere in this file — the chromium project already
 * supplies 320x640. Resizing mid-run is deliberately absent as well: `@dnd-kit/core` wires the
 * window `Resize` event to its drag-cancel handler, so a programmatic resize is a hazard that must
 * not become a habit anywhere under e2e/.
 *
 * No login happens here either — the session arrives from the setup project's storageState.
 */

import { expect, test } from "@playwright/test"

// Relative paths, not "@/…": Playwright does not read vitest's alias table and
// playwright.config.ts declares none. `resolveJsonModule: true` is already set in tsconfig.json.
import en from "../src/messages/en-US.json"
import es from "../src/messages/es-ES.json"
import pt from "../src/messages/pt-BR.json"

/**
 * Only the keys this file reads. Declaring the shape narrowly rather than as `typeof en` keeps the
 * three catalogs assignable without an `any` cast and without coupling this spec to every other key
 * in the message files.
 */
interface AnchorCatalog {
  organizations: { title: string }
  people: { title: string }
  deals: { title: string }
  activities: { title: string }
  trash: { title: string }
  audit: { retention: { title: string } }
}

/**
 * The locale values are exactly what `src/i18n/request.ts` compares against; it reads
 * `cookies().get("locale")` and falls back to `defaultLocale` ("en-US") for anything else.
 */
const CATALOG: Record<string, AnchorCatalog> = {
  "en-US": en,
  "pt-BR": pt,
  "es-ES": es,
}

/**
 * Every one of these six pages renders its heading as
 * `<h1 className="text-3xl font-bold">{t("…")}</h1>`, so one role locator reaches all six.
 *
 * The anchor is READ FROM THE CATALOG rather than hardcoded, so a copy change in `src/messages`
 * cannot leave a stale expectation behind here.
 *
 * `/admin/audit` is the RETENTION SETTINGS page, not an audit-entry list — its heading comes from
 * `audit.retention.title`. Anchoring on `audit.filter.label` or on an entry row would be wrong.
 */
const ROUTES: { path: string; anchor: (m: AnchorCatalog) => string }[] = [
  { path: "/organizations", anchor: (m) => m.organizations.title },
  { path: "/people", anchor: (m) => m.people.title },
  { path: "/deals", anchor: (m) => m.deals.title },
  { path: "/activities", anchor: (m) => m.activities.title },
  { path: "/trash", anchor: (m) => m.trash.title },
  { path: "/admin/audit", anchor: (m) => m.audit.retention.title },
]

for (const [locale, messages] of Object.entries(CATALOG)) {
  for (const route of ROUTES) {
    test(`${route.path} @ ${locale} has no horizontal overflow at the mobile viewport`, async ({
      page,
      context,
      baseURL,
    }) => {
      expect(baseURL, "playwright.config.ts must define use.baseURL").toBeTruthy()

      // Locale is a plain cookie read server-side by src/i18n/request.ts. No UI navigation and no
      // /[locale] route segment are involved. Setting it via `url` rather than `domain`/`path`
      // lets Playwright derive both from the base URL the whole harness already agrees on.
      await context.addCookies([{ name: "locale", value: locale, url: String(baseURL) }])

      await page.goto(route.path)

      /**
       * ANTI-VACUITY, AND IT IS NOT A REDUNDANT SMOKE CHECK — DO NOT DELETE IT.
       *
       * It closes TWO independent holes at once, and the measurement below closes neither:
       *
       *   1. The page never loaded. A blank 200, an error page and a redirect to /login all
       *      satisfy `scrollWidth <= clientWidth`, so all of them would pass silently and this
       *      file would certify a layout nobody rendered.
       *   2. The locale cookie did not apply. If it lands on the wrong domain or path, or the app
       *      falls back to defaultLocale, then all three "locale" runs measure en-US and the
       *      es-ES-worse-than-pt-BR asymmetry this spec exists to catch is never exercised.
       *
       * A locale-DEPENDENT heading is the one assertion that proves both: it can only be visible
       * if the real authenticated page rendered AND rendered in the expected locale.
       *
       * Role-based rather than a bare text matcher on purpose: `CommandDialog`'s `DialogHeader` is
       * a SIBLING of `DialogContent`, so its sr-only title and description render into the page
       * whenever a CommandDialog is mounted, and a loose text matcher could collide with them.
       */
      await expect(
        page.getByRole("heading", { level: 1, name: route.anchor(messages) })
      ).toBeVisible()

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      // The relation is the assertion; both numbers are REPORTED rather than hardcoded, so the
      // failure message carries the measurement and the spec carries no magic width.
      expect(
        scrollWidth,
        `${route.path} @ ${locale}: horizontal overflow — scrollWidth ${scrollWidth} > clientWidth ${clientWidth} (overflow ${scrollWidth - clientWidth}px)`
      ).toBeLessThanOrEqual(clientWidth)
    })
  }
}
