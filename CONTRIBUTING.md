# Contributing to Pipelite

  2
  3 Thank you for your interest in contributing to Pipelite! This guide will help you understand our contribution process and make it easy for you to participate in the development of the project.
  4
  5
  6
  7 ## Code of Conduct
  8
  9 This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/). By participating in this project, the agree to abide by its terms.
   10
  11 ## Getting Started
   12
   13 ### Prerequisites
   14
   15 - **Node.js 18+** (LTS version recommended)
   16 - **PostgreSQL 15+**
   17 - **Git**
   18 - **Text editor** (VS Code recommended with official extensions)
   19
   20 ### Initial Setup
   21
   22 1. **Fork the repository** on GitHub
   23
   24 2. **Clone your fork locally**:
   25    ```bash
   26    git clone https://github.com/YOUR-USERNAME/pipelite.git
   27    cd pipelite
   28    ```
   29
   30    3. **Install dependencies**:
   31    ```bash
   32    npm install
   33    ```
   34
   35    4. **Copy environment file**:
   36    ```bash
   37    cp .env.example .env
   38    ```
   39
   40    5. **Configure environment variables** (see [Configuration Reference](./docs/admin/configuration.md) for details):
   41    ```bash
   42    # Edit .env with your settings
   43    DATABASE_URL=postgresql://user:password@localhost:5432/pipelite
   44    NEXTAUTH_SECRET=your-secret-here-min-32
   45    SMTP_HOST=smtp.example.com
   46    SMTP_USER=your-smtp-user
   47    SMTP_PASS=your-smtp-password
   48    ```
   49
   50        6. **Run database migrations**:
   51        ```bash
   52        npx drizzle-kit migrate
   53        ```
   54
   55        7. **Start the development server**:
   56        ```bash
   57        npm run dev
   58    ```
   59
   60        The application should now be running at `http://localhost:3000`.
   61
   62 ### Development Workflow
   63
   64    1. **Create a feature branch** from `main`
   65        ```bash
   66        git checkout -b feature/your-feature-name
   67        ```
   68
   69    2. **Make changes** with clear, descriptive commit messages
   70        ```bash
   71        git add .
   72        git commit -m "feat: add new feature X"
   73        ```
   74
   75    3. **Run tests**:
   76        ```bash
   77        npm test
   78        ```
   79
   80    4. **Run linting**:
   81        ```bash
   82        npm run lint
   83        ```
   84
   85    5. **Push branch and create PR**:
   86        ```bash
   87        git push -u origin feature/your-feature-name
   88        gh pr create --title "Your PR title"
   89        ```
   90
   91    6. **Address review feedback** and update your PR as needed
   92
   93    7. **Squash and merge** when approved
   94
   95
   96
   97
   98 ### Pull Request Guidelines
   99
  100  - **Title**: Clear, descriptive title
  101    - **Description**: What changes you made and why
  102    - **Testing**: How you tested the steps to reproduce
  103    - **Screenshots**: For UI changes, include before/after screenshots
  104    - **Related Issues**: Link any related issues
  105
  106
  107 ### Coding Standards
  108
  109    - **TypeScript strict mode**: Enabled
  110    - **ESLint**: Follow configuration in `.eslintrc.json`
  111    - **Prettier**: Code formatting
  112    - **Testing**: Write tests for new features
  113    - **Documentation**: Update docs for feature changes
  114
  115
  116 ### Testing Requirements
  117
  118    - **Run existing tests** before submitting PR: `npm test`
  119    - **Add tests for new features** to maintain coverage
  120    - **Integration tests** for critical user paths
  121    - **All tests must pass** before merge
  122
  123
  124 ### Documentation
  125
  126    - **Update docs** when changing features
  127    - **Keep code comments minimal** but helpful
  128    - **Update README** if needed
  129    - **Keep user docs in sync** with code
  130
  131
  132 ### Questions?
  133
  134    - **Check existing issues** first to avoid duplicates
  135    - **Open an issue** for bugs, feature requests, or questions
  136    - **Join discussions** in existing issues
  137
  138
  139
  140
  141 ## More Information
  142
  143    - **[Contributing Guide](./docs/development/contributing.md)** - Detailed contributing instructions
  144    - **[Code Style Guide](./docs/development/code-style.md)** - Coding conventions
  145    - **[Testing Guide](./docs/development/testing.md)** - Testing procedures
  146    - **[Architecture Overview](./docs/development/architecture.md)** - System architecture
  147    - **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community guidelines
  148
  149
  150
  151
  152 ---
  153
  154 *Last updated: 2026-03-04*
