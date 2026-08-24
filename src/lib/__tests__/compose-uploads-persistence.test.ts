/**
 * THE UPLOADS-PERSISTENCE THREE-FILE CROSS-CHECK.
 *
 * This gate exists because making uploads survive a rebuild is an agreement between THREE files
 * — `docker-compose.yml`, `Dockerfile` and `.env.example` — and each one's diff looks complete on
 * its own. Two of the three partial states do not error, which is why neither code review nor a
 * smoke test reliably catches the wrong subset, and why all three changes belong in one commit.
 * Measured outcomes of each partial application:
 *
 *   - VOLUME ONLY: the app keeps writing to `/tmp/uploads`. `UPLOAD_DIR` defaults to
 *     `/tmp/uploads` (`src/app/api/upload/route.ts:12`) and `docker-compose.yml` has NO
 *     `env_file:`, so a variable absent from the `environment:` list never reaches the container.
 *     The named volume stays empty FOREVER and nothing errors — a persistence fix that ships,
 *     reviews clean, and does nothing.
 *   - VOLUME + `UPLOAD_DIR`, NO IMAGE CHOWN: a fresh named volume mounted at a path absent from
 *     the image is created `root:root 0755`, and this container runs as uid 1001. Measured:
 *     `touch: Permission denied`. EVERY UPLOAD RETURNS 500 — strictly worse than the defect.
 *   - `UPLOAD_DIR` + CHOWN, NO VOLUME: writes succeed to a container path and vanish on rebuild.
 *     Exactly today's defect with more moving parts.
 *
 * So the assertions below are deliberately RELATIONAL rather than per-file. The mount target is
 * asserted to STRING-EQUAL the `UPLOAD_DIR` value rather than merely to exist, and the image's
 * chown is asserted to name that same path AND to precede `USER nextjs` by line index. No
 * single-file change can satisfy this gate.
 *
 * `docker-compose.yml` is PARSED with `yaml` (already a direct dependency), never regexed. A
 * regex over YAML passes on a malformed file, and indentation is precisely what decides whether
 * `volumes:` belongs to the `app` service or to the document. The two raw-text scans that remain
 * (the Dockerfile, and the `${VAR}` inventory) each carry an anti-vacuity floor, because a matcher
 * that matches nothing and therefore "passes" is the failure mode this project spent a whole phase
 * on.
 *
 * Two assertions here are GREEN on the defective tree by design — the A8 no-`app`-healthcheck
 * guard and the two `process.env.UPLOAD_DIR` cross-tier reads. They are the proof that the gate
 * found its inputs: a gate that is red on every single line is indistinguishable from a gate whose
 * file paths are wrong.
 *
 * If you are editing one of these three files and this went red, the fix is to bring the other two
 * back into agreement — not to relax the assertion.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { parse } from "yaml"

const REPO_ROOT = process.cwd()

const COMPOSE_PATH = "docker-compose.yml"
const DOCKERFILE_PATH = "Dockerfile"
const ENV_EXAMPLE_PATH = ".env.example"
const UPLOAD_ROUTE_PATH = "src/app/api/upload/route.ts"
const FILE_DOWNLOAD_ROUTE_PATH =
  "src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts"

/** The path the postgres volume is mounted at — asserted undisturbed, as an anti-vacuity anchor. */
const POSTGRES_MOUNT = "postgres_data:/var/lib/postgresql/data"

/**
 * The compose file interpolates at least this many `${VAR}` references today. The floor exists so
 * a broken `${VAR}` regex cannot produce an empty set and make the `.env.example` subset check
 * trivially true.
 */
const MIN_COMPOSE_VARS = 12

interface ComposeService {
  environment?: unknown
  volumes?: unknown
  healthcheck?: unknown
}

interface ComposeDocument {
  services?: Record<string, ComposeService | undefined>
  volumes?: Record<string, unknown>
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

const composeRaw = readRepoFile(COMPOSE_PATH)
const compose = parse(composeRaw) as ComposeDocument
const dockerfileRaw = readRepoFile(DOCKERFILE_PATH)
const envExampleRaw = readRepoFile(ENV_EXAMPLE_PATH)

function service(name: string): ComposeService {
  const found = compose.services?.[name]
  if (!found || typeof found !== "object") {
    throw new Error(
      `${COMPOSE_PATH}: services.${name} is missing or is not a mapping. ` +
        `Parsed service names: ${Object.keys(compose.services ?? {}).join(", ") || "(none)"}`
    )
  }
  return found
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

function appEnvironment(): string[] {
  return stringList(service("app").environment)
}

/** Every `KEY=VALUE` entry on `app` whose key is exactly `UPLOAD_DIR`. */
function uploadDirEntries(): string[] {
  return appEnvironment().filter((entry) => entry.startsWith("UPLOAD_DIR="))
}

/** The single `UPLOAD_DIR` value, or `null` if it is absent or duplicated. */
function uploadDirValue(): string | null {
  const entries = uploadDirEntries()
  if (entries.length !== 1) return null
  return entries[0].slice("UPLOAD_DIR=".length)
}

/**
 * `UPLOAD_DIR`'s value, or a hard failure. Every relational assertion below is anchored on this
 * value rather than on a hardcoded `/app/uploads`, so an operator who moves the path keeps the
 * gate meaningful instead of merely keeping it green.
 */
function requireUploadDir(): string {
  const value = uploadDirValue()
  if (value === null) {
    throw new Error(
      `${COMPOSE_PATH}: expected exactly one \`UPLOAD_DIR=\` entry in services.app.environment, ` +
        `found ${uploadDirEntries().length}. Without it the app falls back to /tmp/uploads ` +
        `(${UPLOAD_ROUTE_PATH}:12) and any uploads volume stays empty forever.`
    )
  }
  return value
}

/** The `app` service's volume entries, split into `{ source, target }` on the LAST colon. */
function appVolumeEntries(): { raw: string; source: string; target: string }[] {
  return stringList(service("app").volumes).map((raw) => {
    const idx = raw.lastIndexOf(":")
    return {
      raw,
      source: idx === -1 ? "" : raw.slice(0, idx),
      target: idx === -1 ? raw : raw.slice(idx + 1),
    }
  })
}

/**
 * The runner stage: everything from the LAST `FROM ... AS runner` line to the end of the file.
 * Slicing at the runner stage is what stops a builder-stage chown from satisfying the ordering
 * assertions — the builder image is discarded and its ownership never reaches the volume.
 */
function runnerStage(): { offset: number; lines: string[] } {
  const lines = dockerfileRaw.split("\n")
  let start = -1
  lines.forEach((line, index) => {
    if (/^\s*FROM\s/.test(line) && /\bAS\s+runner\b/i.test(line)) start = index
  })
  if (start === -1) {
    throw new Error(`${DOCKERFILE_PATH}: no \`FROM ... AS runner\` line found`)
  }
  return { offset: start, lines: lines.slice(start) }
}

/**
 * The index (within the runner stage) of the line that creates/chowns the upload directory.
 * Requiring `uploadDir` on the SAME line is what stops the four existing
 * `COPY --chown=nextjs:nodejs …` lines from satisfying this.
 */
function chownLineIndex(uploadDir: string): number {
  return runnerStage().lines.findIndex(
    (line) => line.includes("chown") && line.includes("nextjs:") && line.includes(uploadDir)
  )
}

function userNextjsLineIndex(): number {
  return runnerStage().lines.findIndex((line) => /^\s*USER\s+nextjs\s*$/.test(line))
}

/** Every `${VAR}` docker-compose.yml interpolates, deduplicated. */
function composeRequiredVars(): Set<string> {
  const found = new Set<string>()
  for (const match of composeRaw.matchAll(/\$\{([A-Z0-9_]+)/g)) {
    found.add(match[1])
  }
  return found
}

/** Every `KEY=` declared in .env.example, deduplicated. */
function envExampleKeys(): Set<string> {
  const found = new Set<string>()
  for (const line of envExampleRaw.split("\n")) {
    const match = /^([A-Z0-9_]+)=/.exec(line)
    if (match) found.add(match[1])
  }
  return found
}

describe("uploads persistence: docker-compose.yml is a real compose file (anti-vacuity)", () => {
  it("parsed into a mapping with all three services", () => {
    expect(typeof compose).toBe("object")
    expect(Object.keys(compose.services ?? {}).sort()).toEqual(["app", "mailhog", "postgres"])
  })

  it("left the postgres volume untouched", () => {
    expect(stringList(service("postgres").volumes)).toContain(POSTGRES_MOUNT)
  })

  it("read the app service, not an empty list", () => {
    // If the UPLOAD_DIR assertions below were being made against the wrong service or against a
    // list the parser returned empty, these two known-present entries would be missing too.
    expect(appEnvironment()).toContain("DATABASE_URL=${DATABASE_URL}")
    expect(appEnvironment()).toContain("SENTRY_DSN=${SENTRY_DSN}")
  })
})

describe("uploads persistence: the app service points writes at a persisted path", () => {
  it("sets UPLOAD_DIR exactly once", () => {
    // Red when the volume ships without the env var: the app keeps writing to /tmp/uploads and
    // the volume stays empty forever, with nothing erroring anywhere.
    expect(uploadDirEntries()).toHaveLength(1)
  })

  it("hardcodes an absolute path outside /tmp rather than interpolating it", () => {
    const uploadDir = requireUploadDir()
    // `${UPLOAD_DIR:-/app/uploads}` would let a .env entry move the write path out from under the
    // mount and silently re-break persistence — the same bug class, one layer up.
    expect(uploadDir).not.toContain("${")
    expect(uploadDir.startsWith("/")).toBe(true)
    expect(uploadDir.startsWith("/tmp")).toBe(false)
  })

  it("mounts a volume whose target STRING-EQUALS the UPLOAD_DIR value", () => {
    // THIS IS THE ASSERTION THE WHOLE GATE EXISTS FOR. It is what makes both "volume without
    // UPLOAD_DIR" and "UPLOAD_DIR pointing somewhere the volume is not" red.
    const uploadDir = requireUploadDir()
    const matching = appVolumeEntries().filter((entry) => entry.target === uploadDir)
    expect(
      matching.map((entry) => entry.raw),
      `expected exactly one services.app volume mounted at ${uploadDir}; ` +
        `saw: ${appVolumeEntries().map((entry) => entry.raw).join(", ") || "(no volumes block)"}`
    ).toHaveLength(1)
  })

  it("mounts a NAMED volume that is declared at the top level", () => {
    const uploadDir = requireUploadDir()
    const matching = appVolumeEntries().filter((entry) => entry.target === uploadDir)
    expect(matching).toHaveLength(1)
    const volumeName = matching[0].source
    // A bind mount would start with `.` or `/` and would carry a host-uid problem instead.
    expect(volumeName.startsWith(".")).toBe(false)
    expect(volumeName.startsWith("/")).toBe(false)
    // Forgetting the top-level declaration makes `docker compose up` error out.
    expect(Object.keys(compose.volumes ?? {})).toContain(volumeName)
  })

  it("still has NO healthcheck on the app service (42-CONTEXT.md A8)", () => {
    // GREEN before the fix and it must stay green. /api/health legitimately returns 503 when a
    // worker reads stale, and with `restart: unless-stopped` a probe on it could restart-loop the
    // container — turning an observability feature into the outage it exists to reveal.
    expect(Object.keys(service("app"))).not.toContain("healthcheck")
    expect(service("app").healthcheck).toBeUndefined()
    // The postgres healthcheck is the only one in the file.
    expect(Object.keys(service("postgres"))).toContain("healthcheck")
  })
})

describe("uploads persistence: the image makes that path writable before dropping privileges", () => {
  it("creates the upload directory in the runner stage", () => {
    const uploadDir = requireUploadDir()
    // A chown of a nonexistent directory fails the build, but assert mkdir anyway so the
    // postcondition set is complete and readable.
    expect(runnerStage().lines.join("\n")).toContain(`mkdir -p ${uploadDir}`)
  })

  it("chowns it, and does so BEFORE `USER nextjs`", () => {
    const uploadDir = requireUploadDir()
    const chownIndex = chownLineIndex(uploadDir)
    const userIndex = userNextjsLineIndex()
    expect(chownIndex, `no runner-stage line chowns ${uploadDir} to nextjs`).toBeGreaterThan(-1)
    expect(userIndex, `no \`USER nextjs\` line in the runner stage`).toBeGreaterThan(-1)
    // Docker copies the image directory's ownership onto a fresh named volume, so the chown must
    // exist in a layer built while still root. After `USER nextjs` it cannot run.
    expect(chownIndex).toBeLessThan(userIndex)
  })

  it("chowns to the nextjs USER, not to root, and does not reach for chmod 777", () => {
    const uploadDir = requireUploadDir()
    const stage = runnerStage()
    const chownIndex = chownLineIndex(uploadDir)
    expect(chownIndex).toBeGreaterThan(-1)
    const chownLine = stage.lines[chownIndex]
    // Measured: `adduser --system --uid 1001 nextjs` has no `-G nodejs`, so nextjs's primary group
    // is nogroup (gid=65533) and it is NOT a member of nodejs. The write succeeds through the
    // OWNER bit, so a `chown root:nodejs` + `chmod g+w` fix does not work.
    expect(chownLine).toContain("chown nextjs:")
    expect(chownLine).not.toContain("chown root:")
    // World-writable upload storage in a CRM is a tampering and disclosure surface, not a
    // permissions convenience. It is the wrong fix an executor reaches for on EACCES.
    //
    // This scan is RAW TEXT over the runner stage, comments INCLUDED, and deliberately so:
    // there is no Dockerfile comment-stripper in this repo, and for a four-character mode
    // string the conservative posture is right — a commented-out world-writable chmod is a
    // patch away from being live. It collided once, with this plan's own Dockerfile prose,
    // which is why that comment spells the mode "0777" instead. Per the standing house rule
    // (src/components/bulk/__tests__/select-wiring.test.ts, note (a)): on a collision REWORD
    // THE PROSE, never weaken the gate.
    expect(stage.lines.join("\n")).not.toContain("chmod 777")
  })
})

describe("uploads persistence: the env var name matches the one the code reads", () => {
  it("both file routes read process.env.UPLOAD_DIR", () => {
    // GREEN before the fix and it must stay green. This is the cross-tier link: renaming the
    // variable on either side turns the gate red.
    expect(readRepoFile(UPLOAD_ROUTE_PATH)).toContain("process.env.UPLOAD_DIR")
    expect(readRepoFile(FILE_DOWNLOAD_ROUTE_PATH)).toContain("process.env.UPLOAD_DIR")
  })
})

describe("uploads persistence: .env.example is level with what compose requires", () => {
  it("references enough ${VAR}s for the subset check below to mean something (anti-vacuity)", () => {
    // Without this floor, a broken regex yields an empty set and the subset assertion passes
    // vacuously — the exact shape of the phase-42 gate that could not fail.
    expect(composeRequiredVars().size).toBeGreaterThanOrEqual(MIN_COMPOSE_VARS)
  })

  it("declares every ${VAR} docker-compose.yml interpolates", () => {
    const required = composeRequiredVars()
    const documented = envExampleKeys()
    const missing = [...required].filter((name) => !documented.has(name)).sort()
    expect(
      missing,
      `docker-compose.yml requires variables absent from .env.example: ${missing.join(", ")}. ` +
        `An operator who copies .env.example cannot bring the stack up at all, which makes ` +
        `step 1 of the restore runbook impossible on a clean host.`
    ).toEqual([])
  })

  it("documents UPLOAD_DIR", () => {
    // Deliberately NOT part of the subset check above: compose hardcodes the value rather than
    // interpolating it, so UPLOAD_DIR never appears as a ${VAR}. It still has to be documented,
    // because a bare-metal install must set it — the code's fallback is /tmp/uploads and most
    // distros clean /tmp on a schedule.
    expect(envExampleKeys()).toContain("UPLOAD_DIR")
  })
})
