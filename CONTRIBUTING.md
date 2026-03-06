# Contributing to Pipelite

Thank you for your interest in contributing to Pipelite! This guide will help you understand our contribution process and make it easy for you to participate in the development of the project.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/). By participating in this project, you agree to abide by its terms.

## Getting Started

### Prerequisites

- **Node.js 18+** (LTS version recommended)
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
- **ESLint**: Follow configuration in `.eslintrc.json`
- **Prettier**: Code formatting
- **Testing**: Write tests for new features
- **Documentation**: Update docs for feature changes

### Testing Requirements

- **Run existing tests** before submitting PR: `npm test`
- **Add tests for new features** to maintain coverage
- **Integration tests** for critical user paths
- **All tests must pass** before merge

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

*Last updated: 2026-03-04*
