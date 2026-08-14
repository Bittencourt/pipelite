# Contributing to Pipelite

Thank you for your interest in contributing to Pipelite! This guide will help you understand our contribution process and make it easy for you to participate in the development of the project.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/). By participating in this project, you agree to abide by its terms.

## Getting Started

### Prerequisites

- **Node.js 20.19+ or 22.12+** — the binding floor comes from `vite@7` (pulled in transitively by
  vitest), which declares `engines: ^20.19.0 || >=22.12.0`. **Node 24 LTS is recommended** and is
  the version CI runs.
- **PostgreSQL 15+**
- **Git**
- **Text editor** (VS Code recommended with official extensions)

### Initial Setup

1. **Fork the repository** on GitHub

2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/pipelite.git
   cd pipelite
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Copy environment file**:
   ```bash
   cp .env.example .env
   ```

5. **Configure environment variables** (see [Configuration Reference](./docs/admin/configuration.md) for details):
   ```bash
   # Edit .env with your settings
   DATABASE_URL=postgresql://user:password@localhost:5432/pipelite
   AUTH_SECRET=your-secret-here-min-32
   SMTP_HOST=smtp.example.com
   SMTP_USER=your-smtp-user
   SMTP_PASSWORD=your-smtp-password
   ```

6. **Run database migrations**:
   ```bash
   npx drizzle-kit migrate
   ```

7. **Start the development server**:
   ```bash
   npm run dev
   ```

   The application should now be running at `http://localhost:3000`.

### Development Workflow

1. **Create a feature branch** from `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes** with clear, descriptive commit messages:
   ```bash
   git add .
   git commit -m "feat: add new feature X"
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Run linting**:
   ```bash
   npm run lint
   ```

5. **Push branch and create PR**:
   ```bash
   git push -u origin feature/your-feature-name
   gh pr create --title "Your PR title"
   ```

6. **Address review feedback** and update your PR as needed

7. **Squash and merge** when approved

### Pull Request Guidelines

- **Title**: Clear, descriptive title
- **Description**: What changes you made and why
- **Testing**: How you tested the changes and steps to reproduce
- **Screenshots**: For UI changes, include before/after screenshots
- **Related Issues**: Link any related issues

### Coding Standards

- **TypeScript strict mode**: Enabled
- **ESLint**: Follow configuration in `eslint.config.mjs` (ESLint 9 flat config)
- **Prettier**: Code formatting
- **Testing**: Write tests for new features
- **Documentation**: Update docs for feature changes

### Testing Requirements

- **Run existing tests** before submitting PR: `npm test`
- **Add tests for new features** to maintain coverage
- **Integration tests** for critical user paths
- **All tests must pass** before merge

### Continuous Integration

`.github/workflows/ci.yml` runs on **every push to `master`** and **every pull request targeting
`master`**. It is a single job named **`ci`**, so there is exactly one check to look at, and it runs
three gates in this order:

| Step | Command | Fails the build when |
|------|---------|----------------------|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | any type error |
| Lint | `npm run lint` (`eslint`) | any lint **error** |
| Test | `npm test` (`vitest run`) | any failing test |

Two things worth knowing:

- **All three run even when an earlier one fails.** The lint and test steps carry
  `if: ${{ !cancelled() }}`, so a pull request with both a type error and a failing test reports
  both in one run instead of making you push three times to discover them one at a time.
- **Lint warnings do not fail the build; lint errors do.** The repo currently carries ~130
  `no-unused-vars` warnings, which are non-gating and tracked separately. There is no
  `--max-warnings` flag on the lint step.

The job needs no secrets, no database, and no `next build` — the whole suite mocks `@/db`, so a
Postgres service container would add time and no signal. It requests read-only access to the
repository contents and nothing more. A full run takes roughly 95 seconds including the install.

To reproduce CI exactly before pushing:

```bash
npm ci                 # lockfile-exact, same as CI
npm run typecheck
npm run lint
npm test
```

### Enabling the merge gate (maintainers)

**Branch protection is a GitHub repository setting with no in-repo representation.** The workflow
file only *produces* a check; only a repository ruleset can *require* it. That means this control
does not travel with a clone, a fork, or a repo transfer — if the repository is ever restored or
moved, the ruleset must be recreated from these instructions.

**Ordering constraint:** create the ruleset **only after `ci.yml` has run at least once**. GitHub's
required-check picker only offers checks it has recently observed, so `ci` will not appear in the
search box until a run exists.

Path: **Settings → Rules → Rulesets → New branch ruleset**

| Setting | Value |
|---------|-------|
| Ruleset name | `master protection` |
| Enforcement status | **Active** |
| Target branches | **Include default branch** |
| Rule | ✅ **Require status checks to pass** → add check **`ci`** (source: GitHub Actions) |
| Rule | ✅ **Require a pull request before merging** — required approvals: **0** |
| Bypass list | one actor: **Repository admin**, bypass mode *always* |

Both rules are needed. Without "Require status checks to pass" a red `ci` does not block anything;
without **Require a pull request before merging** a direct `git push` to `master` skips the check
entirely.

*Optional:* "Require branches to be up to date before merging" is safer but forces a rebase and a
re-run for every merge.

> **This gate is not absolute, by design.** The bypass list above grants repository admins
> permission to push directly to `master` and to merge with a red or missing `ci` check. That is a
> deliberate trade-off so day-to-day maintenance work is not blocked, and it means **an admin can
> land untested code on `master`**. The gate is real for every contributor and every fork; it is
> advisory for admins. If you want it to be absolute, remove the bypass actor from the ruleset.

Audit the live configuration at any time:

```bash
gh api repos/Bittencourt/pipelite/rulesets                    # the ruleset(s) in force
gh api repos/Bittencourt/pipelite/branches/master/protection  # classic protection, if any
```

### Documentation

- **Update docs** when changing features
- **Keep code comments minimal** but helpful
- **Update README** if needed
- **Keep user docs in sync** with code

### Questions?

- **Check existing issues** first to avoid duplicates
- **Open an issue** for bugs, feature requests, or questions
- **Join discussions** in existing issues

## More Information

- **[Contributing Guide](./docs/development/contributing.md)** - Detailed contributing instructions
- **[Code Style Guide](./docs/development/code-style.md)** - Coding conventions
- **[Testing Guide](./docs/development/testing.md)** - Testing procedures
- **[Architecture Overview](./docs/development/architecture.md)** - System architecture

---

*Last updated: 2026-08-14*
