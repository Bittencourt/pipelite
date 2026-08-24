# Deploy with Docker

## Overview

Docker provides a consistent, isolated environment for Pipelite. It's the recommended deployment method for most administrators because it works the same way on any operating system.

### Why Docker?

- **Isolation**: Pipelite runs in its own container, avoiding dependency conflicts
- **Portability**: Same container runs on any Docker host
- **Simplicity**: Single command deployment and updates
- **Scalability**: Easy to scale horizontally with Docker Compose or Kubernetes

### Architecture

```
┌─────────────────────────────────────────┐
│         Docker Host                      │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │  Pipelite    │  │  PostgreSQL     │  │
│  │  Container   │──│  Container      │  │
│  │  (Port 3000) │  │  (Port 5432)    │  │
│  └──────────────┘  └─────────────────┘  │
│         │                                │
│         └─────► .env (configuration)     │
└─────────────────────────────────────────┘
```

## Prerequisites

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **PostgreSQL**: Either Docker container or external database
- **SMTP Server**: For sending emails (transactional email service recommended)
- **Domain Name**: Optional but recommended for production

## Quick Start (For Experts)

```bash
# 1. Clone the repository
git clone https://github.com/Bittencourt/pipelite.git
cd pipelite

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings (see Configuration Reference)

# 3. Start services
docker compose up -d

# 4. Access Pipelite
# Open http://localhost:3000 in your browser
```

## Detailed Setup (For Beginners)

### Step 1: Install Docker

#### Ubuntu/Debian

```bash
# Update package index
sudo apt-get update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
```

#### macOS

1. Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. Install and launch the application
3. Docker is ready when the whale icon in the menu bar is steady

#### Windows

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
2. Install and launch the application
3. Docker is ready when the whale icon in the system tray is steady

**Verify installation:**

```bash
docker --version
docker compose version
```

### Step 2: Clone Repository

```bash
# Clone the repository
git clone https://github.com/Bittencourt/pipelite.git

# Navigate to directory
cd pipelite

# View directory structure
ls -la
```

### Step 3: Configure Environment

```bash
# Create .env file from example
cp .env.example .env
```

**Edit `.env` with your settings:**

```bash
# Required variables (see Configuration Reference for details)

# The host part MUST be the compose service name. docker-compose.yml defines
# `app`, `postgres` and `mailhog`, so inside the compose network PostgreSQL is
# reachable as `postgres` — not as `localhost`, and not as any other name.
DATABASE_URL=postgresql://pipelite:yourpassword@postgres:5432/pipelite

# These three configure the postgres container itself, and docker-compose.yml
# passes all three through. Without them the database container starts with no
# user, no password and no database, and the app cannot connect.
# DATABASE_URL above must AGREE with them: its user, password and database name
# are these same three values.
POSTGRES_USER=pipelite
POSTGRES_PASSWORD=yourpassword
POSTGRES_DB=pipelite

AUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM=noreply@example.com
```

> **Note**: See [Configuration Reference](../configuration.md) for complete variable documentation.

### Step 4: Database Setup

#### Option A: Use Docker PostgreSQL (Recommended for testing)

The `docker-compose.yml` includes a PostgreSQL container. No additional setup needed.

#### Option B: External PostgreSQL

1. **Create database and user:**

```sql
CREATE DATABASE pipelite;
CREATE USER pipelite WITH ENCRYPTED PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE pipelite TO pipelite;
```

2. **Update DATABASE_URL in .env:**

```bash
DATABASE_URL=postgresql://pipelite:yourpassword@your-db-host:5432/pipelite
```

3. **Run migrations:**

```bash
# Start only the app container (not db)
docker compose up -d app

# Run migrations inside container
docker compose exec app npx drizzle-kit migrate
```

### Step 5: Start Services

```bash
# Start all services in background
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps
```

### Step 6: First User

1. **Access Pipelite**: Open `http://localhost:3000` in your browser
2. **Sign up**: Create your first account
3. **Auto-admin**: The first user is automatically promoted to admin role
4. **Access admin panel**: Navigate to `/admin` to manage users and settings

## Production Considerations

### HTTPS with Reverse Proxy

**Using Nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Volume Mounts for Persistence

Two things have to survive a rebuild: the database, and the uploaded files. The shipped
`docker-compose.yml` already configures both — this is what it contains, and why each line is there.

```yaml
# docker-compose.yml
services:
  app:
    environment:
      # MANDATORY alongside the mount below, and not merely tidiness. UPLOAD_DIR
      # defaults to /tmp/uploads in the application code, and this compose file has
      # no `env_file:` — so a variable absent from this list never reaches the
      # container. Without this line the app writes to /tmp inside the container and
      # the volume below stays empty forever: nothing errors, and every upload is
      # still destroyed on the next rebuild.
      # Hardcoded rather than ${UPLOAD_DIR} so it can never disagree with the mount
      # target on the next line.
      - UPLOAD_DIR=/app/uploads
    volumes:
      - uploads_data:/app/uploads

  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
  uploads_data:
```

The `UPLOAD_DIR` value and the mount target must stay equal. If they diverge, the volume is mounted
somewhere the application never writes, and uploads silently stop persisting again.

The image pre-creates and `chown`s `/app/uploads` to the container's user (uid 1001) in a build layer
that still runs as root. That is what makes a fresh named volume writable: Docker copies the image
directory's ownership onto a new volume, and a volume mounted at a path *absent* from the image is
created `root:root`, which the app cannot write to — every upload would return 500.

**Bind-mount alternative**, if you want uploads inside an existing host backup sweep: replace the
mount with `- ./uploads:/app/uploads`, and `chown 1001:1001` that host directory yourself. The named
volume avoids that step, and is the recommendation.

To back either one up, see **[Backup and Restore](../backup-restore.md)**. Docker names the volume
`pipelite_uploads_data` — the compose project name prefixes the declaration above.

### Resource Limits

Prevent resource exhaustion:

```yaml
# docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### Horizontal Scaling

Running more than one app container is one flag away:

```bash
# Two app replicas behind your reverse proxy
docker compose up -d --scale app=2
```

Before you do, read this. It is about the **workflow engine's background processors** only — the schedule processor and the execution processor, both registered in `instrumentation.ts` (lines 27-31), so each replica runs its own copy of each. It is not a claim about the rest of the application. Scaling `postgres` is a different question entirely and out of scope here; this section assumes one database.

**One workflow feature does not survive a second replica: the Webhook Response node.** It coordinates through an in-memory map keyed by run id (`pendingResponses`, `src/lib/execution/actions/webhook-response.ts:15`), so the replica holding the caller's HTTP connection and the replica that executes the node can be different processes. When they are, the lookup misses, the node records `sent: false`, and the caller receives the generic `{ "ok": true, "run_id": "…" }` acknowledgement with HTTP 200 instead of the configured status and body. Nothing in the response reveals this.

| Component | Multi-instance | Why |
|---|---|---|
| Schedule processor claim (`src/lib/triggers/schedule-processor.ts:65-74`) | **Safe** | One statement: `UPDATE workflows SET next_run_at = NULL WHERE active AND next_run_at <= now RETURNING *`. The losing replica re-evaluates the predicate after the row lock and matches nothing. |
| Execution processor **pending** claim (`src/lib/execution/execution-processor.ts` → `processPendingRuns`) | **Safe** | `UPDATE workflow_runs SET status='running' WHERE id = (SELECT … WHERE status='pending' … FOR UPDATE SKIP LOCKED) RETURNING *`. The lock is held for the enclosing statement and the predicate re-checked, so exactly one replica claims each run. |
| Stale-run reclaim (`src/lib/execution/execution-processor.ts` → `reclaimStaleRuns`) | **Safe** | A single idempotent `UPDATE … WHERE status='running' AND started_at < NOW() - interval`; a double-apply is a no-op. |
| Execution processor **waiting** resume (`src/lib/execution/execution-processor.ts` → `processWaitingRuns`) | **Safe — repaired in this release** | It was not. The `SELECT … FOR UPDATE SKIP LOCKED` for elapsed delays ran through `db.execute` on a transaction-free client, so the row locks dropped at statement end, and the follow-up step `UPDATE` had no `WHERE status='waiting'` guard — two replicas could resume the same delayed run. Now wrapped in a transaction with that guard added. On a build from before this release, treat delay resume as unsafe under `--scale`. |
| **Webhook Response** node (`src/lib/execution/actions/webhook-response.ts:15`) | **Unsafe — no fix this release** | `pendingResponses` is a module-level `Map`, private to one process. The registering replica and the executing replica must be the same for the response to be delivered. |

**What this means in practice**: scale freely unless your workflows use **Webhook Response** nodes. If they do, either stay at `app=1` or restructure those workflows to acknowledge immediately and respond asynchronously.

Two categories of workflow failure also never raise a failure alert — recursion-limit failures and synchronous webhook-response runs. Both are known limitations of where the alert hook lives, not scaling issues; see the [Vercel deployment guide](vercel.md#horizontal-scaling-and-the-webhook-response-constraint) for the full description, which is the canonical copy of this section.

### Backup Strategy

See **[Backup and Restore](../backup-restore.md)**. It is the single authoritative procedure and
covers both halves of a backup — the PostgreSQL database and the uploaded files — for Docker and for
bare metal, with verified commands, the flags a restore needs to be trustworthy, and a scheduling
example.

The commands are deliberately not duplicated here. Two copies drift, and the copy that used to live
in this section had drifted: it named a service this compose file does not define, so both of its
commands failed as written.

## Updating

### Update Process

```bash
# 1. Pull latest changes
git pull origin master

# 2. Rebuild containers
docker compose build

# 3. Restart services
docker compose up -d

# 4. Run migrations (if needed)
docker compose exec app npx drizzle-kit migrate

# 5. Check logs
docker compose logs -f app
```

### Rollback

If an update causes issues:

```bash
# 1. Stop containers
docker compose down

# 2. Checkout previous version
git checkout <previous-commit-hash>

# 3. Rebuild and restart
docker compose up -d --build
```

## Common Commands

```bash
# View logs
docker compose logs -f app

# Restart services
docker compose restart

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v

# Execute command in container
docker compose exec app <command>

# Check container status
docker compose ps
```

---

*Next: [Configuration Reference](../configuration.md)*
