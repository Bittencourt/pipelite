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
DATABASE_URL=postgresql://pipelite:yourpassword@db:5432/pipelite
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

Ensure data persists across container restarts:

```yaml
# docker-compose.yml
services:
  db:
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    volumes:
      - uploads:/app/uploads

volumes:
  postgres_data:
  uploads:
```

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

### Backup Strategy

1. **Database backups:**

```bash
# Backup database
docker compose exec db pg_dump -U pipelite pipelite > backup_$(date +%Y%m%d).sql

# Restore database
cat backup_20260304.sql | docker compose exec -T db psql -U pipelite pipelite
```

2. **Upload backups:** Sync uploads directory to S3 or backup server

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
