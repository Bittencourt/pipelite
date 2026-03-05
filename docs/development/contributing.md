# Contributing to Pipelite
 2
  3 Thank you for your interest in contributing to Pipelite! This guide will help you set up your development environment, understand our coding standards, and submit changes effectively.
  4
  5 ## Code of Conduct
  6
  7 We project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/). By participating in this project, you agree to abide by its terms.
  8
  9 ## Getting Started
  10
  11 ### Prerequisites
  12
  13 Before you begin, ensure you have the following installed:
  14
  15 - **Node.js 18+** (LTS version recommended)
  16 - **PostgreSQL 15+**
    17 - **Git**
    18 - **Text editor** (VS Code recommended with official extensions)
    19
    20 ### Initial Setup
 21
    22 23  1. **Fork the repository** on GitHub
    24    2. **Clone your fork locally**:
    25    ```bash
    26    git clone https://github.com/your-username/pipelite.git
    27    cd pipelite
    28    ```
    29    3. **Install dependencies**:
    30    ```bash
    31    npm install
    32    ```
    33    4. **Copy environment file**:
    34    ```bash
    35    cp .env.example .env
    36    ```
    37    5. **Configure environment variables** (see [Configuration Reference](./configuration.md) for details):
    38    ```bash
    39    # Edit .env with your settings
    40    DATABASE_URL=postgresql://user:password@localhost:5432/pipelite
   41    NEXTAUTH_SECRET=your-secret-here-min-32
    42    SMTP_HOST=smtp.example.com
    43    SMTP_USER=your-smtp-user
    44    SMTP_PASS=your-smtp-password
    45    ```
    46    6. **Run database migrations**:
    47    ```bash
    48    npx drizzle-kit migrate
    49    ```
    50    7. **Start the development server**:
    51    ```bash
    52    npm run dev
    53    ```
    54    55    56    The application should now be running at `http://localhost:3000`.
    57
    58 ### Environment Variables
    59
    60    Key environment variables (see [Configuration Reference](./configuration.md) for complete list):
    61
    62    | Variable | Description | Required |
    63    |----------|-------------|----------|
    64    | `DATABASE_URL` | PostgreSQL connection string | Yes |
    65    | `NEXTAUTH_SECRET` | Secret for JWT signing | Yes |
    66    | `SMTP_HOST` | SMTP server for emails | No* |
    67    | `SMTP_USER` | SMTP username | No* |
    68    | `SMTP_PASS` | SMTP password | No* |
    69
    70    *Required for email verification. Optional if email features not needed.
    71
    72    ## Development Workflow
    73
    74    75    1. **Create a feature branch** from `main`:
    76    ```bash
    77    git checkout -b feature/your-feature-name
    78    ```
    79    80    2. **Make your changes** with clear, atomic commits
  81    82    3. **Run tests** to ensure nothing breaks:
    83    ```bash
    84    npm test
    85    ```
    86    87    4. **Run linting** to catch code quality issues:
    88    ```bash
    89    npm run lint
    90    ```
    91
    92    5. **Push your branch and create a pull request** on GitHub
    93
    94    6. **Wait for review** from maintainers
    95
  96    7. **Address feedback** and make necessary changes
  97
  98    8. **Squash and merge** when approved
    99
   100    101        102        ## Pull Request Process
   103        104        When submitting a pull request:
   105        106        1. **Fill out the PR template** completely
   107        108        2. **Include**:
   109           - Clear description of changes
   110           - Testing steps you reviewers should follow
   111           - Screenshots for UI changes
   112        3. **Link related issues** (e.g., "Fixes #123")
   113        4. **Ensure all tests pass** (`npm test`)
   114        5. **Ensure linting passes** (`npm run lint`)
   115        116        6. **Wait for review** - a maintainer will review your code
   117        118        7. **Address feedback** - make requested changes
   119        120        8. **Squash commits** when ready for merge (maintainer will handle this)
   121
   122        PRs are reviewed as quickly as possible, typically within 2-3 business days.
   123
   124        ## Coding Standards
   125        126        127        Pipelite follows strict TypeScript conventions to ensure code quality and maintainability:
   128        129        - **TypeScript strict mode** enabled
   130        - **Explicit return types** for functions
   131        - **ESLint configuration** enforced (see [Code Style Guide](./code-style.md))
   132        - **Prettier formatting** for consistent code style
   133        - **Component patterns**:
   134            - Server components by default
   135            - Client components only when needed (`'use client'` directive)
   136        - **Server/client component guidelines**:
   137            - Server components: Data fetching, SEO, initial render
   138            - Client components: Interactivity, hooks, browser APIs
   139
   140        See the [Code Style Guide](./code-style.md) for detailed conventions and patterns.
   141
   142        ## Testing Requirements
   143        144        145        All contributions should include appropriate tests:
   146
   147        - **Unit tests** for utilities and business logic
   148        - **Integration tests** for critical paths
   149        - **Run existing tests** before submitting PR (`npm test`)
   150        - **Add tests** for new features
   151
   152        See the [Testing Guide](./testing.md) for detailed testing instructions.
   153
   154        ## Documentation
   155        156        157        Help us keep documentation up to date:
   158
   159        - **Update docs** when changing features
   160        - **Keep code comments minimal** but helpful (comment *why*, not *what*)
   161        - **Update README.md** if user-facing changes occur
   162        - **Update API docs** if changing REST API
   163
   164        Documentation lives in the `docs/` directory organized by audience (user, API, admin, development).
   165
   166        ## Commit Message Format
   167        168        169        We use [Conventional Commits](https://www.conventionalcommits.org/) for clear commit messages:
   170
   171        ```
        172        <type>(<scope>): <description>
   173
   174        [optional body]
   175        ```
   176
   177        **Types:**
   178
   179        - `feat`: New feature
   180        - `fix`: Bug fix
   161, - `fix`: Bug fix
   162        - `docs`: Documentation changes
   163        - `style`: Code style changes (formatting, semicolons)
   164        - `refactor`: Code refactoring
   165        - `test`: Adding or updating tests
   166        - `chore`: Maintenance tasks, dependencies
   167
   168        **Examples:**
   169        170        ```
        171        feat(deals): add bulk delete action
   172        fix(auth): correct email validation regex
   173        docs(readme): update installation instructions
   174        ```
   175
   176        ## Questions?
   177        178        179        - **Open an issue** for bug reports or feature requests
   180        - **Check existing issues** first to avoid duplicates
   181        - **Use discussions** for questions before opening issues
   182
   183        We appreciate your contributions and look forward to your pull requests!
   184
   185        ---
   186        *Part of the [Developer Documentation](../index.md)*
   187: </content>
   188: 
   189        ## Need Help?
   190        191        - **GitHub Issues**: https://github.com/pipelite/pipelite/issues
   192        - **Code of Conduct**: https://www.contributor-covenant.org/version/2/1/
   193
   194        ## Getting Started
   195        196        Ready to start coding? Follow these steps to get your development environment set up:
   194
   195        ### Quick Start
   196
   197        ```bash
   198        # 1. Fork and clone
   199        git clone https://github.com/YOUR_USERNAME/pipelite.git
   200        cd pipelite
   201
   202        # 2. Install dependencies
   203        npm install
   204
   205        # 3. Set up environment
   206        cp .env.example .env
   207        # Edit .env with your database credentials
   208
   209        # 4. Run migrations
   210        npx drizzle-kit migrate
   211
   212        # 5. Start dev server
   213        npm run dev
   214        ```
   215
   216        Visit `http://localhost:3000` to see the application running.
   217
   218        ## Detailed Guides
   219        220        For comprehensive documentation on contributing:
   221        222        - **Full Contributing Guide**: [docs/development/contributing.md](./contributing.md) - Complete workflow, PR process, coding standards
   223        - **Code Style Guide**: [docs/development/code-style.md](./code-style.md) - Naming conventions, patterns, linting
 224        - **Testing Guide**: [docs/development/testing.md](./testing.md) - Writing and running tests with Vitest
   225        - **Architecture Overview**: [docs/development/architecture.md](./architecture.md) - System design and patterns
   226
   227        ## PR Checklist
   228
   229        Before submitting a PR, ensure:
   230        231
   232        - [ ] Tests pass (`npm test`)
   233        - [ ] Linting passes (`npm run lint`)
   234        - [ ] PR template filled out
   235        - [ ] Screenshots included (if UI changes)
   236        - [ ] Documentation updated (if needed)
   237
   238        ---
   239        *Last updated: 2026-03-04*
   240: </content>
   241: 
   242        **Repository**: https://github.com/pipelite/pipelite
   243: </content>
   244:
   245:
