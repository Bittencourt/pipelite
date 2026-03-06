# Deploy on VPS/Bare Metal

## Overview

Deploying Pipelite directly on a VPS or bare metal server gives you full control over the environment. This approach requires Linux system administration knowledge but offers maximum flexibility.

### Why Bare Metal/VPS?

- **Full Control**: Complete access to the server environment
- **No Limits**: No serverless constraints on memory, CPU, or execution time
- **Customization**: Install any dependencies or tools you need
- **Cost**: Predictable pricing with VPS providers

## Prerequisites

- **VPS or Dedicated Server**: Ubuntu 20.04+ or similar Linux distribution
- **Domain Name**: Recommended for production (for SSL certificate)
- **Root or Sudo Access**: For installing dependencies
- **Linux Knowledge**: Comfortable with command line operations

## Quick Start (Summary)

For experienced administrators:

```bash
# 1. Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# 3. Clone and configure
git clone https://github.com/Bittencourt/pipelite.git
cd pipelite
cp .env.example .env
# Configure .env

# 4. Install dependencies and build
npm install
npm run build

# 5. Run migrations
npx drizzle-kit migrate

# 6. Start with PM2
npm install -g pm2
pm2 start npm --name "pipelite" -- start
pm2 startup
pm2 save
```

## Detailed Setup

### Step 1: Server Setup

#### Update System

```bash
# Update package index
sudo apt-get update

# Upgrade installed packages
sudo apt-get upgrade -y

# Install essential tools
sudo apt-get install -y curl wget git vim ufw
```

#### Create Non-Root User

```bash
# Create user
sudo adduser pipelite

# Add to sudo group
sudo usermod -aG sudo pipelite

# Switch to user
su - pipelite
```

#### Configure Firewall

```bash
# Allow SSH
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 2: Install Dependencies

#### Install Node.js via NVM

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell configuration
source ~/.bashrc

# Install Node.js 18
nvm install 18
nvm use 18
nvm alias default 18

# Verify installation
node --version
npm --version
```

#### Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Switch to postgres user and create database
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE pipelite;
CREATE USER pipelite WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE pipelite TO pipelite;
\q
```

#### Install PM2 for Process Management

```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version
```

### Step 3: Application Setup

#### Clone Repository

```bash
# Clone repository
git clone https://github.com/Bittencourt/pipelite.git

# Navigate to directory
cd pipelite
```

#### Install Dependencies

```bash
# Install Node.js dependencies
npm install
```

#### Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit configuration
vim .env
```

**Required variables:**

```bash
DATABASE_URL=postgresql://pipelite:your-secure-password@localhost:5432/pipelite
AUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=https://yourdomain.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM=noreply@example.com
```

> **Note**: See [Configuration Reference](../configuration.md) for complete documentation.

#### Run Migrations

```bash
# Run database migrations
npx drizzle-kit migrate
```

#### Build Application

```bash
# Build for production
npm run build
```

### Step 4: Process Management

#### Start with PM2

```bash
# Start application
pm2 start npm --name "pipelite" -- start

# View logs
pm2 logs pipelite

# Check status
pm2 status
```

#### Configure Auto-Restart

```bash
# Generate startup script
pm2 startup

# Save PM2 configuration
pm2 save
```

This ensures Pipelite restarts automatically on server reboot.

### Step 5: Reverse Proxy (Nginx)

#### Install Nginx

```bash
# Install Nginx
sudo apt-get install -y nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### Configure Virtual Host

Create `/etc/nginx/sites-available/pipelite`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/pipelite /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

#### SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

Certbot automatically modifies Nginx configuration for HTTPS.

### Step 6: Monitoring

#### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs pipelite

# Process info
pm2 show pipelite
```

#### Log Rotation

Install PM2 log rotation module:

```bash
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

#### Health Checks

Create a simple health check script:

```bash
# Create health check script
cat > /usr/local/bin/pipelite-health << 'EOF'
#!/bin/bash
if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "Pipelite is healthy"
    exit 0
else
    echo "Pipelite is down, restarting..."
    pm2 restart pipelite
    exit 1
fi
EOF

chmod +x /usr/local/bin/pipelite-health

# Add to crontab (check every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/pipelite-health") | crontab -
```

## Production Checklist

Before going live, verify:

- [ ] **HTTPS enabled**: SSL certificate installed and working
- [ ] **Firewall configured**: Only ports 22, 80, 443 open
- [ ] **Backups scheduled**: Database and file backups automated
- [ ] **Monitoring enabled**: PM2 monitoring and health checks active
- [ ] **Log rotation**: Logs rotating to prevent disk filling
- [ ] **Security updates**: Automatic security updates enabled
- [ ] **Environment variables**: All required variables configured
- [ ] **First user created**: Admin account set up
- [ ] **Email working**: Test email delivery

## Updating

### Update Process

```bash
# 1. Navigate to application directory
cd pipelite

# 2. Pull latest changes
git pull origin master

# 3. Install updated dependencies
npm install

# 4. Build application
npm run build

# 5. Run migrations (if needed)
npx drizzle-kit migrate

# 6. Restart PM2
pm2 restart pipelite

# 7. Check logs
pm2 logs pipelite
```

### Rollback

```bash
# 1. Stop application
pm2 stop pipelite

# 2. Checkout previous version
git checkout <previous-commit-hash>

# 3. Reinstall and rebuild
npm install
npm run build

# 4. Restart
pm2 restart pipelite
```

## Common Commands

```bash
# Application management
pm2 start pipelite
pm2 stop pipelite
pm2 restart pipelite
pm2 logs pipelite
pm2 monit

# Nginx management
sudo systemctl status nginx
sudo systemctl reload nginx
sudo nginx -t

# PostgreSQL management
sudo systemctl status postgresql
sudo -u postgres psql

# Firewall management
sudo ufw status
sudo ufw allow <port>
sudo ufw deny <port>
```

---

*Next: [Configuration Reference](../configuration.md)*
