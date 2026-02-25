# Pipelite

A lightweight, self-hostable CRM with kanban-style pipeline management.

## Features

- **Authentication** - Email/password signup with admin approval workflow
- **Organizations** - Company management for B2B sales tracking
- **People** - Contact management linked to organizations
- **Pipelines & Stages** - Configurable sales pipelines with drag-and-drop stages
- **Deals & Kanban** - Visual deal management with drag-and-drop board
- **Activities** - Follow-up tracking with calendar view (week/month)
- **Custom Fields** - Extensible entities with calculated fields (coming soon)

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: NextAuth.js with JWT strategy
- **UI**: shadcn/ui + Tailwind CSS
- **Deployment**: Docker Compose

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/Bittencourt/pipelite.git
cd pipelite

# Start all services
docker compose up -d

# Seed activity types (first time only)
docker exec pipelite-postgres-1 psql -U pipelite -d pipelite -c "
INSERT INTO activity_types (id, name, icon, color, is_default, created_at) VALUES
('call', 'Call', 'Phone', '#3B82F6', true, NOW()),
('meeting', 'Meeting', 'Users', '#10B981', true, NOW()),
('task', 'Task', 'CheckSquare', '#F59E0B', true, NOW()),
('email', 'Email', 'Mail', '#8B5CF6', true, NOW())
ON CONFLICT (id) DO NOTHING;"

# Access the app
open http://localhost:3001
```

Services:
- **App**: http://localhost:3001
- **Mailhog** (email testing): http://localhost:8025
- **PostgreSQL**: localhost:5433

### Manual Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your database URL and auth secret

# Run migrations
npm run db:migrate

# Seed activity types
npm run db:seed-activities

# Start dev server
npm run dev
```

## Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/pipelite"
AUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Email (optional for dev - use Mailhog)
SMTP_HOST="localhost"
SMTP_PORT="1025"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASSWORD=""
EMAIL_FROM="noreply@example.com"
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── activities/         # Activity management
│   ├── admin/              # Admin panel
│   ├── deals/              # Deals & kanban board
│   ├── organizations/      # Company management
│   └── people/             # Contact management
├── components/             # Reusable UI components
│   └── ui/                 # shadcn/ui components
├── db/                     # Database layer
│   └── schema/             # Drizzle schema definitions
└── lib/                    # Utilities
```

## Roadmap

- [x] Foundation & Authentication
- [x] Organizations
- [x] People
- [x] Pipelines & Stages
- [x] Deals & Kanban
- [x] Activities
- [ ] Custom Fields & Formulas
- [ ] Search & Filtering
- [ ] Import/Export
- [ ] REST API

## License

MIT
