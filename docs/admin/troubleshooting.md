# Troubleshooting Guide

## Overview

This guide covers common issues in Pipelite, their causes, and step-by-step solutions. Each issue follows the pattern: **Symptoms** → **Causes** → **Solutions**.

### When to use this guide
- **First**: Check the symptoms section for your issue
- **Then**: Review possible causes
- **Finally**: Try the solutions in order
- **If issue persists**: Contact support with gathered diagnostic information

## Database Connection Issues

### Symptoms
- **Error**: "Connection refused"
- **Error**: "Connection timeout"
- **Error**: "Unable to connect to database"
- **Slow performance**: Page loads taking too long
- **Intermittent errors**: Sometimes works, sometimes fails

### Causes
1. **Wrong credentials**: DATABASE_URL contains incorrect username or password
2. **PostgreSQL not running**: Database server is down or not started
3. **Firewall blocking**: Network firewall prevents connection
4. **Wrong host/port**: DATABASE_URL points to wrong server or port
5. **SSL issues**: Certificate problems with secure connection

### Solutions
1. **Verify DATABASE_URL format**:
   ```bash
   # Check format
   echo $DATABASE_URL
   # Should be: postgresql://user:pass@host:5432/db
   ```

2. **Check PostgreSQL status**:
   ```bash
   # Local/Docker
   sudo systemctl status postgresql
   # Or check process
   ps aux | grep postgres
   ```

3. **Test connection manually**:
   ```bash
   # Install psql client
   sudo apt-get install postgresql-client
   
   # Test connection
   psql "postgresql://user:pass@host:5432/db" -c "SELECT 1"
   ```

4. **Check firewall rules**:
   ```bash
   # List firewall rules
   sudo ufw status
   # Allow PostgreSQL port if blocked
   sudo ufw allow 5432/tcp
   ```

5. **Verify SSL mode**:
   ```bash
   # For production databases, ensure sslmode=require
   # Check DATABASE_URL includes: ?sslmode=require
   ```

6. **Check database exists**:
   ```bash
   # Connect as postgres user
   sudo -u postgres psql
   # List databases
   \l
   # Create database if missing
   CREATE DATABASE pipelite;
   ```

## Email Delivery Problems

### Symptoms
- **Emails not sending**: Users not receiving emails
- **Error**: "SMTP authentication failed"
- **Error**: "Connection refused" (to SMTP server)
- **Delayed delivery**: Emails taking too long to arrive
- **Emails in spam**: Emails marked as spam by recipients

### Causes
1. **Wrong SMTP credentials**: Incorrect host, port, username, or password
2. **SMTP server down**: Email service provider experiencing issues
3. **Blocked ports**: Firewall or ISP blocking SMTP ports (587, 465, 25)
4. **Authentication failure**: SMTP credentials expired or changed
5. **Spam filtering**: Emails blocked by spam filters

### Solutions
1. **Verify SMTP credentials**:
   ```bash
   # Check environment variables
   echo $SMTP_HOST $SMTP_PORT $SMTP_USER
   
   # Verify format
   # SMTP_HOST: smtp.example.com
   # SMTP_PORT: 587 (or 465 for SSL)
   # SMTP_USER: your-email@example.com
   ```

2. **Test SMTP manually**:
   ```bash
   # Using telnet
   telnet smtp.example.com 587
   # Should connect (220 response)
   
   # Using openssl
   openssl s_client -connect smtp.example.com:587 -starttls smtp
   ```

3. **Try different port**:
   - **587**: Standard SMTP with STARTTLS
   - **465**: SMTP over SSL (recommended)
   - **25**: SMTP without encryption (not recommended)

4. **Use transactional email service**:
   - **SendGrid**: Reliable, good free tier
   - **Mailgun**: Easy setup, good documentation
   - **Amazon SES**: Cost-effective for high volume
   - **Postmark**: Developer-friendly

5. **Check spam filters**:
   - Ask user to check spam/junk folder
   - Add sender email to whitelist
   - Check email service logs for delivery status
   - Verify SPF/DKIM records if deliverability issues

6. **Enable debug logging**:
   ```bash
   # Add to .env
   DEBUG_EMAIL=true
   
   # Check application logs for SMTP errors
   docker compose logs app | grep -i smtp
   ```

## Authentication Errors

### Symptoms
- **Error**: "Invalid credentials"
- **Error**: "Session not found"
- **Error**: "Unauthorized"
- **Login fails**: Users cannot log in despite correct credentials
- **Session not persisting**: Users logged out after refresh

### Causes
1. **Wrong AUTH_SECRET**: Secret key changed or not matching
2. **NEXTAUTH_URL mismatch**: URL doesn't match deployment URL
3. **Cookie issues**: Browser blocking cookies or cookie misconfiguration
4. **Database session errors**: Session table corrupted or missing
5. **Clock drift**: Server time significantly different from actual time

### Solutions
1. **Regenerate AUTH_SECRET**:
   ```bash
   # Generate new secret
   openssl rand -base64 32
   
   # Update .env
   AUTH_SECRET=<new-secret>
   
   # Restart application
   docker compose restart  # or pm2 restart pipelite
   ```
   **Warning**: Changing secret invalidates all existing sessions. All users will need to log in again.

2. **Verify NEXTAUTH_URL**:
   ```bash
   # Check current setting
   echo $NEXTAUTH_URL
   
   # Must match actual URL where users access Pipelite
   # Development: http://localhost:3000
   # Production: https://yourdomain.com
   
   # Update if wrong
   NEXTAUTH_URL=https://yourdomain.com
   ```

3. **Check browser cookies**:
   - Open browser developer tools (F12)
   - Go to Application/Storage → Cookies
   - Look for `next-auth` cookies
   - Clear session cookies if corrupted
   - Try logging in again

4. **Clear session data**:
   ```bash
   # For development/testing
   # Connect to database
   psql $DATABASE_URL
   
   # Clear all sessions (forces re-login)
   TRUNCATE TABLE sessions;
   ```

5. **Check server time**:
   ```bash
   # Verify server time is correct
   date
   timedatectl
   
   # If wrong, sync with NTP
   sudo timedatectl set-ntp true
   sudo timedatectl set-ntp pool.ntp.org
   ```

## API 401 Unauthorized

### Symptoms
- **Error**: "401 Unauthorized"
- **Error**: "Invalid API key"
- **Error**: "Authentication failed"
- **API requests rejected**: Valid API calls returning 401

### Causes
1. **Missing API key**: No Authorization header in request
2. **Invalid API key**: Key doesn't exist or was regenerated
3. **Wrong header format**: Missing "Bearer " prefix
4. **Expired key**: Key was deleted or regenerated
5. **Insufficient permissions**: User role lacks required permissions

### Solutions
1. **Verify Authorization header format**:
   ```bash
   # Correct format
   Authorization: Bearer pk_live_abc123...
   
   # Common mistakes
   Authorization: pk_live_abc123...  # Missing "Bearer "
   bearer pk_live_abc123...  # Wrong case
   ```

2. **Check API key exists**:
   - Log in as the user who owns the key
   - Go to Settings → API Keys
   - Verify key exists and is active
   - If missing, generate new key

3. **Regenerate key**:
   - If key might be compromised, regenerate it
   - Go to Settings → API Keys
   - Click "Regenerate" next to key
   - Copy new key immediately (shown only once)
   - Update your application with new key

4. **Verify user permissions**:
   - Admin users have full access
   - Member users have limited access
   - Check user role in admin panel
   - Promote user if needed

5. **Test with curl**:
   ```bash
   # Test API key
   curl -H "Authorization: Bearer YOUR_API_KEY" \
        https://yourdomain.com/api/organizations
   
   # Should return 200 with data
   # 401 means auth issue
   # 500 means server error
   ```

## File Upload Failures

### Symptoms
- **Error**: "File too large"
- **Error**: "Upload failed"
- **Error**: "Access denied" (S3)
- **Files not saving**: Upload appears to succeed but file not accessible
- **Timeout errors**: Upload times out

### Causes
1. **Size limit exceeded**: File larger than MAX_FILE_SIZE
2. **Wrong storage backend**: FILE_STORAGE not configured correctly
3. **S3 permissions**: Insufficient permissions for S3 bucket
4. **Disk full**: Local storage out of space
5. **Network issues**: Connection interrupted during upload

### Solutions
1. **Check file size limit**:
   ```bash
   # Check current setting
   echo $MAX_FILE_SIZE
   # Default: 10485760 (10MB)
   
   # Increase if needed
   MAX_FILE_SIZE=52428800  # 50MB
   ```

2. **Verify storage configuration**:
   ```bash
   # For local storage
   echo $FILE_STORAGE  # Should be "local" or empty
   
   # For S3 storage
   echo $FILE_STORAGE  # Should be "s3"
   echo $S3_BUCKET
   echo $S3_REGION
   ```

3. **Test S3 permissions**:
   ```bash
   # Using AWS CLI
   aws s3 ls s3://your-bucket
   
   # Try uploading test file
   aws s3 cp test.txt s3://your-bucket/test.txt
   ```

4. **Check disk space (local storage)**:
   ```bash
   # Check available space
   df -h
   
   # Check uploads directory
   du -sh uploads/
   
   # Clear old files if needed
   rm uploads/old_files/*
   ```

5. **Check S3 credentials**:
   ```bash
   # Verify environment variables
   echo $S3_ACCESS_KEY
   echo $S3_SECRET_KEY
   echo $S3_BUCKET
   echo $S3_REGION
   
   # Test with AWS CLI
   aws configure set aws_access_key_id $S3_ACCESS_KEY
   aws configure set aws_secret_access_key $S3_SECRET_KEY
   aws configure set region $S3_REGION
   aws s3 ls
   ```

## Rate Limiting Issues

### Symptoms
- **Error**: "429 Too Many Requests"
- **Error**: "Rate limit exceeded"
- **API throttling**: Requests delayed or blocked
- **Inconsistent behavior**: Sometimes works, sometimes fails

### Causes
1. **Redis unavailable**: REDIS_URL not set or Redis server down
2. **Too many requests**: Excessive API usage
3. **No rate limiting**: System failing open (allowing all requests)
4. **Redis connection issues**: Network problems with Redis server
5. **Misconfigured limits**: Rate limit values too restrictive

### Solutions
1. **Check Redis configuration**:
   ```bash
   # Check if REDIS_URL is set
   echo $REDIS_URL
   
   # If not set, rate limiting fails open (allows requests)
   # Recommended: Set up Redis for production
   ```

2. **Verify Redis is running**:
   ```bash
   # Test connection
   redis-cli -u $REDIS_URL ping
   
   # Should return PONG
   # If fails, Redis is down or unreachable
   ```

3. **Implement request throttling**:
   ```javascript
   // In your API client
   const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
   
   async function makeRequest() {
     try {
       return await api.call();
     } catch (error) {
       if (error.status === 429) {
         // Wait and retry
         await delay(1000);
         return await makeRequest();
       }
       throw error;
     }
   }
   ```

4. **Check rate limit settings**:
   - Rate limits are configured in the application
   - Default: 100 requests per minute per API key
   - Adjust if needed for your use case
   - Contact admin if limits too restrictive

5. **Monitor rate limit usage**:
   ```bash
   # Check application logs
   docker compose logs app | grep -i "rate limit"
   
   # Monitor Redis for rate limit keys
   redis-cli -u $REDIS_URL keys "ratelimit:*"
   ```

## Migration Failures

### Symptoms
- **Error**: "column does not exist"
- **Error**: "relation does not exist"
- **Error**: "Migration failed"
- **Schema errors**: Application fails with database errors
- **Data inconsistency**: Unexpected behavior or missing data

### Causes
1. **Pending migrations**: New migrations not run
2. **Failed migration**: Migration partially applied
3. **Database drift**: Manual changes to database schema
4. **Version mismatch**: Migration files out of sync with database
5. **Permission issues**: Insufficient database permissions

### Solutions
1. **Run migrations**:
   ```bash
   # Check migration status
   npx drizzle-kit migrate
   
   # If migrations pending, run them
   npx drizzle-kit migrate
   ```

2. **Check migration files**:
   ```bash
   # List migration files
   ls -la drizzle/migrations/
   
   # Check migration content
   cat drizzle/migrations/0001_initial.sql
   ```

3. **Verify database state**:
   ```bash
   # Connect to database
   psql $DATABASE_URL
   
   # Check migrations table
   SELECT * FROM __drizzle_migrations ORDER BY created_at DESC;
   
   # Check table structure
   \d+ organizations
   ```

4. **Reset migrations (development only)**:
   ```bash
   # WARNING: This destroys all data
   # Drop all tables
   psql $DATABASE_URL -c "DROP SCHEMA public CASCADE"
   
   # Re-run migrations
   npx drizzle-kit migrate
   ```

5. **Fix permission issues**:
   ```sql
   -- Grant necessary permissions
   GRANT ALL PRIVILEGES ON DATABASE pipelite TO pipelite;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pipelite;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pipelite;
   ```

## Performance Issues

### Symptoms
- **Slow page loads**: Pages taking too long to load
- **Timeouts**: Requests timing out
- **High resource usage**: CPU or memory spikes
- **Slow queries**: Database queries taking too long
- **Unresponsive application**: Interface freezing or lagging

### Causes
1. **Missing indexes**: Database queries scanning entire tables
2. **Large datasets**: Too many records without pagination
3. **Insufficient resources**: Server underpowered for workload
4. **N+1 queries**: Loading related data inefficiently
5. **Memory leaks**: Application not releasing memory

### Solutions
1. **Check database indexes**:
   ```sql
   -- Check existing indexes
   \di organizations
   \di people
   \di deals
   
   -- Add missing indexes for common queries
   CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);
   CREATE INDEX IF NOT EXISTS idx_people_email ON people(email);
   CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON deals(stage_id);
   ```

2. **Implement pagination**:
   ```javascript
   // Ensure API calls include pagination
   fetch('/api/organizations?limit=50&offset=0')
   
   // Don't try to load all records at once
   ```

3. **Increase server resources**:
   - **Docker**: Increase memory/CPU limits in docker-compose.yml
   - **VPS**: Upgrade server plan or add resources
   - **Vercel**: Consider Pro plan for more resources

4. **Review query patterns**:
   - Use database query logging
   - Identify slow queries
   - Optimize with indexes
   - Consider query caching

5. **Monitor resource usage**:
   ```bash
   # Docker
   docker stats
   
   # VPS
   top
   htop  # If installed
   
   # Check logs for performance issues
   docker compose logs app | grep -i "slow\|timeout\|performance"
   ```

## General Diagnostic Steps

When facing any issue, follow these steps:

### 1. Check Application Logs
```bash
# Docker
docker compose logs app

# VPS with PM2
pm2 logs pipelite

# Vercel
# Check deployment logs in Vercel dashboard
```

### 2. Check Database Logs
```bash
# PostgreSQL logs location varies by installation
# Common locations:
tail -f /var/log/postgresql/postgresql-*.log

# Docker
docker compose logs db
```

### 3. Review Recent Changes
- Check recent git commits: `git log --oneline -10`
- Review environment variable changes
- Check recent deployments or updates
- Identify any configuration changes

### 4. Test with Minimal Configuration
- Disable optional features
- Use default settings
- Check if issue persists
- Re-enable features one by one

### 5. Search for Known Issues
- Check GitHub issues for similar problems
- Search error messages in documentation
- Check community discussions

## Getting Help

### Before Contacting Support
Gather this information:

1. **Error messages**: Copy exact error text
2. **Steps to reproduce**: List exact steps that cause the issue
3. **Environment**: Deployment method, Node.js version, PostgreSQL version
4. **Configuration**: Relevant environment variables (remove secrets!)
5. **Recent changes**: Any recent updates or configuration changes
6. **Logs**: Relevant log snippets showing the issue

### Contact Methods
- **GitHub Issues**: Best for bug reports
- **Email Support**: For sensitive issues
- **Community Chat**: For general questions

### What to Include
```markdown
**Issue**: [Brief description of the problem]

**Deployment**: Docker / VPS / Vercel

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Issue occurs]

**Expected Behavior**: [What should happen]
**Actual Behavior**: [What actually happens]

**Error Messages**:
```
[Paste error logs]
```

**Environment Variables**:
- DEPLOYMENT_METHOD: docker
- NODE_VERSION: 18.x
- DATABASE_URL: [redacted]
- [Other relevant variables]

**Additional Context**:
[Any other relevant information]
```

---

*Next: [Administrator Guide Index](./index.md)*
