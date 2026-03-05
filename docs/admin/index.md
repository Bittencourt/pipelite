# Administrator Guide

## Overview

This guide is for administrators deploying, configuring, and operating Pipelite. Whether you're a seasoned DevOps engineer or setting up your first CRM, you'll find the information you need here.

### What You'll Learn

- **Deploy** Pipelite using your preferred method (Docker, VPS, or Vercel)
- **Configure** environment variables and system settings
- **Manage** user approval, roles, and permissions
- **Operate** pipelines, custom fields, and data import/export
- **Troubleshoot** common issues independently

### Prerequisites

Before you begin, ensure you have:

- **Server access** (for Docker/VPS deployments) or cloud account (for Vercel)
- **Domain name** (optional but recommended for production)
- **PostgreSQL database** (managed service or self-hosted)
- **SMTP server** or transactional email service (SendGrid, Mailgun, etc.)

---

## Quick Links

### Deployment Options

Choose your deployment method based on your infrastructure preferences:

| Method | Best For | Complexity | Cost |
|--------|----------|------------|------|
| **[Docker](./deployment/docker.md)** | Self-hosted, isolated, any OS | Medium | Server cost |
| **[Bare Metal/VPS](./deployment/bare-metal.md)** | Full control, Linux knowledge | High | VPS cost |
| **[Vercel](./deployment/vercel.md)** | Easiest, managed, less control | Low | Vercel plan |

### Configuration

- **[Configuration Reference](./configuration.md)** - Complete environment variable documentation

### User Management

- **[User Management](./user-management.md)** - Approval workflow, roles, and permissions

### Operations

- **[Pipeline Setup](./pipeline-setup.md)** - Configure deal pipelines and stages
- **[Custom Fields](./custom-fields.md)** - Extend entities with custom data
- **[Import/Export](./import-export.md)** - Migrate data in and out

### Troubleshooting

- **[Troubleshooting Guide](./troubleshooting.md)** - Common issues and solutions

---

## Deployment Decision Guide

### Docker (Recommended for Most)

**Choose Docker if:**
- You want a self-hosted solution with isolation
- You're deploying on any OS (Linux, macOS, Windows)
- You want easy updates and rollbacks
- You prefer containerized deployments

**Get started:** [Deploy with Docker](./deployment/docker.md)

### Bare Metal / VPS

**Choose VPS if:**
- You need full control over the environment
- You have Linux system administration experience
- You want maximum performance and customization
- You're deploying on a VPS (DigitalOcean, Linode, etc.)

**Get started:** [Deploy on VPS/Bare Metal](./deployment/bare-metal.md)

### Vercel (Easiest)

**Choose Vercel if:**
- You want the simplest deployment experience
- You prefer managed infrastructure
- You don't need extensive customization
- You're okay with serverless constraints

**Get started:** [Deploy on Vercel](./deployment/vercel.md)

---

## Getting Help

- **Troubleshooting**: Check the [Troubleshooting Guide](./troubleshooting.md) first
- **GitHub Issues**: Report bugs or request features on GitHub
- **Community**: Join discussions in the repository

---

*Next: [Deploy with Docker](./deployment/docker.md)*
