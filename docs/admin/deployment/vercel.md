# Deploy on Vercel

## Overview

Vercel provides the easiest deployment experience for Pipelite. It's a managed platform that handles infrastructure, SSL, and scaling automatically.

### Why Vercel?

- **Simplest deployment**: Connect repository and deploy in minutes
- **Managed infrastructure**: No server management required
- **Automatic HTTPS**: SSL certificates provisioned automatically
- **Global CDN**: Fast delivery worldwide
- **Preview deployments**: Test changes before merging

### Limitations

- **Serverless constraints**: Functions have execution time limits
- **No local file storage**: Must use S3 or similar for file uploads
- **Less control**: Cannot customize server environment
- **Cold starts**: Initial requests may be slower
- **Webhook Response nodes**: Workflows that reply to a webhook synchronously need a single instance — see [Horizontal Scaling and the Webhook-Response Constraint](#horizontal-scaling-and-the-webhook-response-constraint)

## Prerequisites

- **Vercel Account**: Free tier works for getting started
- **GitHub/GitLab Repository**: Pipelite code in a git repository
- **External PostgreSQL**: Neon, Supabase, or similar (not local database)
- **SMTP Service**: SendGrid, Mailgun, or similar for emails

## Quick Start

1. **Connect repository** to Vercel
2. **Configure environment variables** in Vercel dashboard
3. **Deploy** with one click

## Detailed Setup

### Step 1: Database Setup

#### Option A: Neon (Recommended)

Neon provides serverless PostgreSQL perfect for Vercel:

1. **Create Neon account**: Visit [neon.tech](https://neon.tech)
2. **Create project**:
   - Click "Create a project"
   - Name it "pipelite"
   - Select region closest to your users
3. **Get connection string**:
   - Copy the connection string from dashboard
   - Format: `postgresql://username:password@ep-xxx.region.aws.neon.tech/pipelite?sslmode=require`

#### Option B: Supabase

1. **Create Supabase account**: Visit [supabase.com](https://supabase.com)
2. **Create project**:
   - Click "New Project"
   - Name it "pipelite"
   - Set secure database password
3. **Get connection string**:
   - Go to Settings → Database
   - Copy connection string (URI format)
   - Replace `[YOUR-PASSWORD]` with your database password

#### Option C: Railway

1. **Create Railway account**: Visit [railway.app](https://railway.app)
2. **Add PostgreSQL**:
   - Click "+ New"
   - Select "Database" → "Add PostgreSQL"
3. **Get connection string**:
   - Click on PostgreSQL service
   - Go to "Variables" tab
   - Copy `DATABASE_URL` value

### Step 2: Connect to Vercel

#### Import Repository

1. **Log in to Vercel**: Visit [vercel.com](https://vercel.com)
2. **Import project**:
   - Click "Add New..." → "Project"
   - Select your Git provider (GitHub, GitLab, or Bitbucket)
   - Find and select your Pipelite repository
   - Click "Import"

#### Configure Project Settings

1. **Framework Preset**: Next.js (auto-detected)
2. **Root Directory**: `./` (default)
3. **Build Command**: `npm run build` (default)
4. **Output Directory**: `.next` (default)
5. **Install Command**: `npm install` (default)

### Step 3: Environment Variables

Click "Environment Variables" and add all required variables:

**Required Variables:**

```bash
# Database
DATABASE_URL=postgresql://username:password@host:5432/pipelite

# Authentication
AUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=https://your-app.vercel.app

# Email (SMTP)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
EMAIL_FROM=noreply@yourdomain.com

# File Storage (for Vercel)
FILE_STORAGE=s3
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

> **Important**: See [Configuration Reference](../configuration.md) for complete variable documentation.

**Generate AUTH_SECRET:**

```bash
# Run locally to generate secret
openssl rand -base64 32
```

**Set NEXTAUTH_URL:**

Use your Vercel deployment URL:
- Initial: `https://your-project.vercel.app`
- Custom domain: `https://yourdomain.com`

### Step 4: Deploy

1. **Click "Deploy"**: Vercel will build and deploy your application
2. **Wait for build**: Takes 2-5 minutes typically
3. **Check build logs**: If deployment fails, check the logs for errors

### Step 5: Run Migrations

After first deployment, run database migrations:

#### Option A: Local Migration with Production DB

```bash
# Set production database URL temporarily
export DATABASE_URL="your-production-database-url"

# Run migrations
npx drizzle-kit migrate

# Unset when done
unset DATABASE_URL
```

#### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Run migration command (if you added script to package.json)
vercel env pull .env.production.local
npx drizzle-kit migrate
```

### Step 6: Custom Domain (Optional)

#### Add Domain

1. **Go to project settings**: Select your project → Settings
2. **Add domain**:
   - Click "Domains"
   - Enter your domain name
   - Click "Add"

#### Configure DNS

Vercel provides DNS instructions. Typically:

**For apex domain (example.com):**
- Type: A
- Name: @
- Value: 76.76.21.21

**For subdomain (app.example.com):**
- Type: CNAME
- Name: app
- Value: cname.vercel-dns.com

#### Update Environment Variable

After custom domain is configured:

1. Go to Settings → Environment Variables
2. Update `NEXTAUTH_URL` to your custom domain
3. Redeploy for changes to take effect

## Production Checklist

- [ ] **Database configured**: External PostgreSQL connected
- [ ] **Environment variables**: All required variables set
- [ ] **Migrations run**: Database schema created
- [ ] **File storage**: S3 or similar configured for uploads
- [ ] **Email working**: SMTP service tested
- [ ] **First user created**: Admin account set up
- [ ] **Custom domain**: Optional but recommended for production

## Limitations and Workarounds

### File Uploads

**Problem**: Vercel serverless functions can't write to local filesystem.

**Solution**: Configure S3 file storage:

```bash
FILE_STORAGE=s3
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

### Execution Time Limits

**Problem**: Vercel functions have execution time limits (10s-900s depending on plan).

**Solution**:
- Optimize long-running operations
- Use background jobs for heavy processing
- Upgrade to Pro plan for longer timeouts

### Cold Starts

**Problem**: Initial requests may be slower due to serverless cold starts.

**Solution**:
- Use Vercel's Edge Functions for faster cold starts
- Implement client-side caching
- Accept slight delay on first request

### Horizontal Scaling and the Webhook-Response Constraint

This section is about the **workflow engine's background processors** and nothing else. Both of them — the schedule processor and the execution processor — are registered in `instrumentation.ts` (lines 27-31) and therefore start in *every* instance, so a second instance runs a second copy of each. On Vercel that matters without you opting in: the platform adds instances on its own. Nothing here is a statement about the rest of the application.

**Problem**: A workflow containing a **Webhook Response** node coordinates through an in-memory map keyed by run id (`pendingResponses`, `src/lib/execution/actions/webhook-response.ts:15`). The instance that received the inbound HTTP request holds the pending promise; the instance that executes the node is the one that wins the run's claim. On a single instance those are the same process and the response is delivered. On two or more they may not be: if another instance's execution processor claims the run first, the lookup in `sendWebhookResponse` misses, the node records `sent: false`, and the original caller gets the generic `{ "ok": true, "run_id": "…" }` acknowledgement with HTTP 200 instead of the status code and body the workflow configured. The handler's pending promise carries a 30-second cap, which is the longest that request will ever wait.

This is **not detectable from the response**: a 200 with a plausible JSON body comes back either way. That is why the constraint is documented here instead of being reported at runtime.

**Solution**: There is no fix for this in the current release. Choose one of:

- Keep the deployment to a single instance. On Vercel this is not something you configure directly, so in practice it means the option below.
- Do not use **Webhook Response** nodes on a multi-instance deployment. Let the workflow acknowledge the webhook immediately and respond asynchronously instead — an outbound HTTP node calling the sender back, for example.

Every other trigger type is unaffected: schedule triggers, CRM event triggers, inbound webhooks *without* a response node, and manual runs all behave identically on one instance or ten.

| Component | Multi-instance | Why |
|---|---|---|
| Schedule processor claim (`src/lib/triggers/schedule-processor.ts:65-74`) | **Safe** | One statement: `UPDATE workflows SET next_run_at = NULL WHERE active AND next_run_at <= now RETURNING *`. Under `READ COMMITTED` the losing instance re-evaluates the predicate after the row lock is released, matches nothing, and creates no runs. |
| Execution processor **pending** claim (`src/lib/execution/execution-processor.ts` → `processPendingRuns`) | **Safe** | `UPDATE workflow_runs SET status='running' WHERE id = (SELECT … WHERE status='pending' … FOR UPDATE SKIP LOCKED) RETURNING *`. The subselect's lock is held for the duration of the enclosing statement and the predicate is re-checked, so exactly one instance claims each run. |
| Stale-run reclaim (`src/lib/execution/execution-processor.ts` → `reclaimStaleRuns`) | **Safe** | A single idempotent `UPDATE … WHERE status='running' AND started_at < NOW() - interval`. Two instances applying it produces the same result as one; the second is a no-op. |
| Execution processor **waiting** resume (`src/lib/execution/execution-processor.ts` → `processWaitingRuns`) | **Safe — repaired in this release** | It was not. The `SELECT … FOR UPDATE SKIP LOCKED` that picks up elapsed delays ran through `db.execute` on a transaction-free client, so the row locks were released at the end of that statement, and the follow-up step `UPDATE` carried no `WHERE status='waiting'` guard. Two instances could resume the same delayed run, duplicating every side effect after the delay. See the note below. |
| **Webhook Response** node (`src/lib/execution/actions/webhook-response.ts:15`, `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts:98-144`) | **Unsafe — no fix this release** | `pendingResponses` is a module-level `Map`, so it is private to one process. `waitForWebhookResponse` registers in the instance that received the request; `sendWebhookResponse` resolves in the instance that runs the node. Across instances the map misses and the caller receives the fallback acknowledgement. |

**Note on the waiting-resume row.** That defect was found while writing this section and fixed in the same release: the resume loop now runs inside a transaction, so the `SKIP LOCKED` row locks are held while the run is transitioned, and the step transition carries an explicit `WHERE status = 'waiting'` guard. The row is kept in the table as history — if you are reading a build from before this release, treat delay resume as unsafe under multiple instances.

**What this means in practice**: scale freely unless your workflows use **Webhook Response** nodes. There is exactly one operational rule, and that is it. The engine's claim paths are database-atomic; the response path is not, because it coordinates in process memory.

**Known alerting gaps**: workflow failure alerts are raised from the execution processor's failure path, so two categories of failure never produce an alert. Both are known and neither is closed:

- **Recursion-limit failures.** A run rejected by the recursion guard is inserted already `failed` (`src/lib/triggers/create-run.ts:22-36`). It is never `pending`, so the processor never claims it and never re-reads it. Check the run list for these.
- **Synchronous webhook-response runs.** The inbound webhook route claims and executes these runs inline (`route.ts:98-144`); the processor never sees them, and a failure returns `{ "ok": true }` to the caller. This is the same in-memory-coordination limitation as above, seen from the alerting side.

One related consequence, same mechanism: replaying a failed run of a webhook-response workflow records `sent: false` for that node, because the original HTTP caller is long gone — so such a workflow's replay is not equivalent to its original run.

## Updating

Vercel automatically deploys when you push to your connected branch:

1. **Push changes** to GitHub/GitLab
2. **Vercel detects** the push
3. **Automatic build** and deployment
4. **Preview URL** for testing (for non-main branches)

### Manual Redeploy

If you need to redeploy without code changes:

1. Go to your project on Vercel
2. Click "Deployments"
3. Click "..." on the latest deployment
4. Select "Redeploy"

### Environment Variable Changes

After updating environment variables:

1. Changes are saved immediately
2. **Redeploy** required for changes to take effect
3. Go to Deployments → Redeploy latest

## Monitoring

### Vercel Dashboard

- **Analytics**: View traffic and performance metrics
- **Logs**: Real-time function logs
- **Deployments**: History of all deployments

### External Monitoring

Consider adding:
- **Sentry**: Error tracking
- **LogRocket**: Session replay
- **Datadog**: Comprehensive monitoring

## Troubleshooting

### Build Failures

1. **Check build logs** in Vercel dashboard
2. **Common issues**:
   - Missing environment variables
   - TypeScript errors
   - Missing dependencies

### Runtime Errors

1. **Check function logs** in Vercel dashboard
2. **Common issues**:
   - Database connection errors
   - Missing environment variables
   - S3 permission errors

### Database Connection Issues

1. **Verify DATABASE_URL** is correct
2. **Check database allows connections** from Vercel's IP range
3. **Ensure SSL mode** is configured (most providers require it)

---

*Next: [Configuration Reference](../configuration.md)*
