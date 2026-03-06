# Contributing to Pipelite

Thank you for your interest in contributing to Pipelite! This guide will help you set up your development environment, understand our coding standards, and submit changes effectively.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/). By participating in this project, you agree to abide by its terms.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** (LTS version recommended)
- **PostgreSQL 15+**
- **Git**
- **Text editor** (VS Code recommended with official extensions)

### Initial Setup

1. **Fork the repository** on GitHub

2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/your-username/pipelite.git
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

5. **Configure environment variables** (see [Configuration Reference](../admin/configuration.md) for details):
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

### Environment Variables

Key environment variables (see [Configuration Reference](../admin/configuration.md) for complete list):

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AUTH_SECRET` | Secret for JWT signing | Yes |
| `SMTP_HOST` | SMTP server for emails | No* |
| `SMTP_USER` | SMTP username | No* |
| `SMTP_PASSWORD` | SMTP password | No* |

*Required for email verification. Optional if email features not needed.

## Development Workflow

1. **Create a feature branch** from `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** with clear, atomic commits

3. **Run tests** to ensure nothing breaks:
   ```bash
   npm test
   ```

4. **Run linting** to catch code quality issues:
   ```bash
   npm run lint
   ```

5. **Push your branch and create a pull request** on GitHub

6. **Wait for review** from maintainers

7. **Address feedback** and make necessary changes

8. **Squash and merge** when approved

## Pull Request Process

When submitting a pull request:

1. **Fill out the PR template** completely
2. **Include**:
   - Clear description of changes
   - Testing steps reviewers should follow
   - Screenshots for UI changes
3. **Link related issues** (e.g., "Fixes #123")
4. **Ensure all tests pass** (`npm test`)
5. **Ensure linting passes** (`npm run lint`)
6. **Wait for review** - a maintainer will review your code
7. **Address feedback** - make requested changes

PRs are reviewed as quickly as possible, typically within 2-3 business days.

## Coding Standards

Pipelite follows strict TypeScript conventions to ensure code quality and maintainability:

- **TypeScript strict mode** enabled
- **Explicit return types** for functions
- **ESLint configuration** enforced (see [Code Style Guide](./code-style.md))
- **Prettier formatting** for consistent code style
- **Component patterns**:
  - Server components by default
  - Client components only when needed (`'use client'` directive)

See the [Code Style Guide](./code-style.md) for detailed conventions and patterns.

## Testing Requirements

All contributions should include appropriate tests:

- **Unit tests** for utilities and business logic
- **Integration tests** for critical paths
- **Run existing tests** before submitting PR (`npm test`)
- **Add tests** for new features

See the [Testing Guide](./testing.md) for detailed testing instructions.

## Documentation

Help us keep documentation up to date:

- **Update docs** when changing features
- **Keep code comments minimal** but helpful (comment *why*, not *what*)
- **Update README.md** if user-facing changes occur
- **Update API docs** if changing REST API

Documentation lives in the `docs/` directory organized by audience (user, API, admin, development).

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear commit messages:

```
<type>(<scope>): <description>

[optional body]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependencies

**Examples:**

```
feat(deals): add bulk delete action
fix(auth): correct email validation regex
docs(readme): update installation instructions
```

## Questions?

- **Open an issue** for bug reports or feature requests
- **Check existing issues** first to avoid duplicates
- **Use discussions** for questions before opening issues

We appreciate your contributions and look forward to your pull requests!

---

*Last updated: 2026-03-04*

See also:
- [Architecture Overview](./architecture.md) - System architecture
- [Code Style Guide](./code-style.md) - Coding conventions
- [Testing Guide](./testing.md) - Testing procedures
