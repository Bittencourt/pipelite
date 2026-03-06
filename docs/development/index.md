# Developer Documentation

Welcome to the Pipelite developer documentation. This guide is for contributors, integrators, and curious users who want to understand how Pipelite works under the hood.

## What You'll Learn

- **System Architecture**: How the application is structured and how components interact
- **Contributing Guide**: How to set up a development environment and submit changes
- **Database Schema**: Entity relationships and table structures
- **Code Style Guide**: Conventions and patterns used throughout the codebase
- **Testing Guide**: How to write and run tests

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture.md) | System architecture, core systems, and key patterns |
| [Contributing Guide](./contributing.md) | Development workflow and PR submission process |
| [Database Schema](./database.md) | Entity relationships and table documentation |
| [Code Style Guide](./code-style.md) | Naming conventions, patterns, and linting rules |
| [Testing Guide](./testing.md) | Writing and running tests with Vitest |

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | Next.js | 16.x |
| **UI Framework** | React | 19.x |
| **Styling** | Tailwind CSS | 3.x |
| **Component Library** | shadcn/ui | Latest |
| **Backend** | Next.js API Routes & Server Actions | - |
| **Database** | PostgreSQL | 15+ |
| **ORM** | Drizzle ORM | Latest |
| **Authentication** | Auth.js (NextAuth.js v5) | beta |
| **Localization** | next-intl | 3.x |
| **Testing** | Vitest | Latest |
| **Cache/Rate Limiting** | Redis | 7+ (optional) |

## Project Structure Overview

```
pipelite/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/            # Authentication pages (login, signup)
│   │   ├── (dashboard)/       # Main application pages
│   │   └── api/               # API routes (REST API at /api/v1)
│   ├── components/            # React components
│   │   └── ui/                # shadcn/ui components
│   ├── db/                    # Database layer
│   │   └── schema/            # Drizzle schema definitions
│   ├── lib/                   # Core utilities and business logic
│   ├── hooks/                 # Custom React hooks
│   └── actions/               # Server actions
├── drizzle/                   # Database migrations
├── public/                    # Static assets
└── docs/                      # Documentation
```

See the [Architecture Overview](./architecture.md) for system architecture, core systems, patterns, and data flows. See the [Database Schema](./database.md) for entity relationships and table documentation.

## Getting Help

- **GitHub Issues**: Report bugs or request features at [github.com/Bittencourt/pipelite/issues](https://github.com/Bittencourt/pipelite/issues)

## Getting Started

Ready to contribute? Start with the [Contributing Guide](./contributing.md) to set up your development environment.
