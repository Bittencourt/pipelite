# Configuration Reference

## Overview

Pipelite uses environment variables for configuration. This approach provides flexibility across different deployment methods while keeping sensitive information secure.

### Where to Set Variables

| Deployment Method | Configuration Location |
|-------------------|------------------------|
| Docker | `.env` file in repository root |
| VPS/Bare Metal | `.env` file, restart service after changes |
| Vercel | Environment variables in Vercel dashboard |

### Configuration Changes

- **Docker**: Edit `.env` file, restart with `docker-compose restart`
- **VPS**: Edit `.env` file, restart with `pm2 restart pipelite`
- **Vercel**: Update in dashboard, redeploy automatically

## Required Variables

These variables must be configured for Pipelite to function.

### DATABASE_URL

PostgreSQL connection string.

**Format:**
```
postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=require
```

**Examples:**
```bash
# Local PostgreSQL
DATABASE_URL=postgresql://pipelite:password@localhost:5432/pipelite

# Neon (serverless)
DATABASE_URL=postgresql://pipelite:password@ep-xxx.us-east-2.aws.neon.tech/pipelite?sslmode=require

# Supabase
DATABASE_URL=postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres

# External server
DATABASE_URL=postgresql://pipelite:password@db.example.com:5432/pipelite
```

**Notes:**
- Ensure database exists before starting Pipelite
- Run migrations: `npx drizzle-kit migrate`
- Use SSL mode for production databases

### NEXTAUTH_SECRET

Secret key used to encrypt session tokens and cookies.

**How to generate:**
```bash
# Generate a secure random secret
openssl rand -base64 32
```

**Example:**
```bash
NEXTAUTH_SECRET=your-generated-secret-key-here-keep-this-secret
```

**Security:**
- **Never share this value**
- **Never commit to version control**
- **Different for each environment** (development, staging, production)
- **Minimum 32 characters**

### NEXTAUTH_URL

Public URL where Pipelite is accessible.

**Format:**
```
https://yourdomain.com
```

**Examples:**
```bash
# Development
NEXTAUTH_URL=http://localhost:3000

# Production with custom domain
NEXTAUTH_URL=https://pipelite.example.com

# Vercel deployment
NEXTAUTH_URL=https://your-project.vercel.app
```

**Important:**
- **Required for production deployments**
- Must include protocol (http:// or https://)
- Must match the actual URL where users access Pipelite
- Mismatches cause authentication failures

### SMTP Configuration

Email sending configuration. Required for user registration, password reset, and notifications.

#### Basic SMTP

```bash
# SMTP server settings
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-smtp-password
```

#### Transaction Email Services

**SendGrid:**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

**Mailgun:**
```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
```

**Amazon SES:**
```bash
SMTP_HOST=email-smtp.[region].amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-access-key-id
SMTP_PASS=your-ses-secret-access-key
```

**Testing SMTP:**
```bash
# Test connection
telnet smtp.example.com 587

# Test sending email
# Use tools like swaks or send test email through application
```

### EMAIL_FROM

Email address shown as sender in outgoing emails.

**Examples:**
```bash
EMAIL_FROM=noreply@example.com
EMAIL_FROM=Pipelite <noreply@example.com>
```

**Best Practices:**
- Use noreply address for system emails
- Match domain to your organization
- Ensure domain has proper SPF/DKIM records

## Authentication Variables

### DOMAIN_WHITELIST (Optional)

Restrict user signups to specific email domains.

**Format:**
```bash
DOMAIN_WHITELIST=company.com,example.org
```

**Examples:**
```bash
# Single domain
DOMAIN_WHITELIST=company.com

# Multiple domains
DOMAIN_WHITELIST=company.com,subsidiary.com,partner.org

# Allow all domains (omit variable or leave empty)
# DOMAIN_WHITELIST=
```

**Behavior:**
- **If set**: Only emails from listed domains can sign up
- **If not set**: All email domains allowed
- **Case-insensitive**: Company.com and COMPANY.COM treated the same
- **Reduces spam signups** when public instance

## Optional Variables

### NODE_ENV

Application environment mode.

**Values:**
- `development`: Development mode (default)
- `production`: Production mode

**Example:**
```bash
NODE_ENV=production
```

**Effects:**
- **development**: Detailed error messages, no caching
- **production**: Optimized performance, error messages sanitized

### PORT

Server port for HTTP server.

**Default:** `3000`

**Example:**
```bash
PORT=3000
```

**Notes:**
- Usually not needed to change
- For Docker/VPS, ensure port is open in firewall
- For Vercel, this is ignored (uses platform default)

### MAX_FILE_SIZE

Maximum file upload size in bytes.

**Default:** `10485760` (10MB)

**Examples:**
```bash
# 5MB limit
MAX_FILE_SIZE=5242880

# 20MB limit
MAX_FILE_SIZE=20971520

# 50MB limit
MAX_FILE_SIZE=52428800
```

**Notes:**
- Consider server memory constraints
- Larger files require more upload time
- Affects all file uploads (custom fields, attachments)

### FILE_STORAGE

File storage backend.

**Values:**
- `local`: Store files on local filesystem (default)
- `s3`: Store files in Amazon S3 or compatible storage

**Example:**
```bash
FILE_STORAGE=local
```

**For Vercel deployments, you use `s3`** (no persistent local storage)

## S3 File Storage Variables

Required when `FILE_STORAGE=s3`:

### S3_BUCKET

S3 bucket name for file storage.

**Example:**
```bash
S3_BUCKET=pipelite-uploads
```

### S3_REGION

AWS region for S3 bucket.

**Example:**
```bash
S3_REGION=us-east-1
```

### S3_ACCESS_KEY

AWS access key ID with S3 permissions.

**Example:**
```bash
S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
```

### S3_SECRET_KEY

AWS secret access key.

**Example:**
```bash
S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRiCYzKEY
```

### S3_ENDPOINT (Optional)

Custom S3 endpoint for S3-compatible services.

**Examples:**
```bash
# AWS S3 (omit variable or leave empty)
# S3_ENDPOINT=

# DigitalOcean Spaces
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com

# MinIO
S3_ENDPOINT=http://localhost:9000

# Cloudflare R2
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

**S3-Compatible Services:**
- **AWS S3**: Standard S3
- **DigitalOcean Spaces**: Object storage
- **MinIO**: Self-hosted S3
- **Cloudflare R2**: S3-compatible storage
- **Wasabi**: Hot cloud storage

## Rate Limiting Variables

### REDIS_URL (Optional)

Redis connection for rate limiting.

**Format:**
```
redis://[host]:[port]
rediss://[host]:[port]  # For TLS connection
```

**Examples:**
```bash
# Local Redis
REDIS_URL=redis://localhost:6379

# Redis with password
REDIS_URL=redis://:password@localhost:6379

# Upstash (serverless Redis)
REDIS_URL=rediss://default:password@global-redis.upstash.io:6379
```

**Behavior:**
- **If set**: Rate limiting enabled with Redis backend
- **If not set**: Rate limiting fails open (allows requests, logs warning)

**Rate Limits:**
- API endpoints: 100 requests per 15 minutes per IP
- Authentication: 5 login attempts per 15 minutes per IP

## Security Variables

### Secrets to Keep Secure

**Never commit or share:**
- `DATABASE_URL` (contains database credentials)
- `NEXTAUTH_SECRET` (encryption key)
- `SMTP_PASS` (email credentials)
- `S3_SECRET_KEY` (storage credentials)
- `REDIS_URL` (if contains password)

### Rotation Recommendations

**Rotate periodically:**
- `NEXTAUTH_SECRET`: Every 6-12 months
- `SMTP_PASS`: When changing email service
- `S3_SECRET_KEY`: According to security policy
- `DATABASE_URL`: When database credentials change

**Rotation process:**
1. Generate new secret value
2. Update environment variable(s)
3. Restart application
4. Verify functionality
5. Invalidate old credentials (if applicable)

## Deployment-Specific Notes

### Docker

```bash
# .env file location
/pipelite/.env

# After changes
docker-compose restart
```

**Docker Compose:**
- `.env` file in same directory as `docker-compose.yml`
- Automatically loaded by Docker Compose
- Changes require container restart

### VPS/Bare Metal

```bash
# .env file location
/home/pipelite/.env

# After changes
pm2 restart pipelite
```

**Process:**
- Edit `.env` file
- Restart PM2 process
- Changes take effect immediately

### Vercel

```bash
# Settings location
Vercel Dashboard → Project → Settings → Environment Variables
```

**Process:**
- Add/Edit variables in dashboard
- Click "Save"
- Automatic redeploy triggered
- Changes take effect after deployment completes

**CLI Method:**
```bash
# Set variable
vercel env add DATABASE_URL production

# Pull to local .env (optional)
vercel env pull .env.production.local

# Redeploy
vercel --prod
```

## Configuration Checklist

Before going to production, ensure all required variables are set:

- [ ] **DATABASE_URL** - PostgreSQL connection string
- [ ] **NEXTAUTH_SECRET** - Generated secure secret
- [ ] **NEXTAUTH_URL** - Public URL of deployment
- [ ] **SMTP_HOST** - SMTP server hostname
- [ ] **SMTP_PORT** - SMTP server port
- [ ] **SMTP_USER** - SMTP authentication username
- [ ] **SMTP_PASS** - SMTP authentication password
- [ ] **EMAIL_FROM** - Sender email address
- [ ] **NODE_ENV** - Set to "production"
- [ ] **FILE_STORAGE** - "local" or "s3"
- [ ] **S3_*** variables - If using S3 storage
- [ ] **REDIS_URL** - Optional, for rate limiting

**Optional but recommended:**
- [ ] **DOMAIN_WHITELIST** - Restrict signups to your domain
- [ ] **MAX_FILE_SIZE** - Adjust upload limit

---

*Next: [User Management](./user-management.md)*
