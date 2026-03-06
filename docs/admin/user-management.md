# User Management

## Overview

User management in Pipelite follows a simple approval workflow. Administrators review signups, approve or reject requests, and manage user roles.

### Who This Guide is for

- **Administrators** reviewing new user signups
- **Admin users** managing approved/rejection
- **First user** becomes admin automatically

### Prerequisites

- **Admin access** to admin panel
- **Understanding of approval workflow**
- **Familiarity with user roles**

## User Approval Workflow

### How It Works

1. **User signs up** with email address
2. **User appears in admin panel** (`/admin/users`) with status "pending"
3. **Admin reviews application**:
   - Check email domain (if domain whitelist configured)
   - Verify user identity
   - Approve or reject request
4. **User receives email**:
   - Approved: Welcome email with login instructions
   - Rejected: Notification with reason (optional)
5. **Approved users can log in** immediately

### Approval Process

1. **Navigate to** `/admin/users`
2. **Review pending users** (filtered by default)
3. **Click "Approve"** for valid requests
4. **Click "Reject"** for invalid requests
5. **User receives notification** via email

6. **Approved users** can now log in and access the application

## Managing Users

### Access Admin Panel
- **URL**: `/admin`
- **Navigation**: Users section in admin panel
- **Features**:
  - View all users in table
  - Filter by status (pending, active, rejected)
  - Search by name or email
  - View user details

  - Manage roles

### User Table Columns
- **Name** and **email**
- **role** (admin, member)
- **status** (pending, active, rejected)
- **created** date
- **last login** date

- **actions** (approve, reject, change role)

## User Roles

### Role Permissions

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, manage users, configure pipelines, access admin panel, view all data, manage custom fields, import/export data, access API (if admin) |
| **Member** | Create and edit entities (organizations, people, deals, activities), view all data, access API, use import/export, standard features, cannot manage users, configure system settings, access admin panel |

### Role Assignment

- **Only admins** can assign roles to users
- **First user automatically** becomes admin
- **Admin can promote** members to admin role
- **Admin can demote** admins to member role
- **Warning**: Be careful when removing your own admin role

- **At least one admin must always exist**

## API Keys

### Overview

API keys allow users to authenticate API requests programmatically.

- **Users generate** their own API keys from Settings
- **Admins cannot view user API keys** (security feature)
- **API keys are hashed** and cannot be retrieved

### Using API keys
- **Include in request header**: `Authorization: Bearer <your-api-key>`
- **Full permissions** based on user role
- **Can be regenerated** (invalidates old key)
- **Never share** API keys with others

### Managing API Keys
As a user:
1. **Navigate to** Settings → API Keys
2. **Click "Generate new key"**
3. **Copy key immediately** (shown only once)
4. **Store securely** (password manager recommended)
5. **Use in requests**: Include in Authorization header

As an admin:
- Cannot view user API keys
- **View list** of API keys (masked)
- **Regenerate** key if needed (disables access during rotation)
- **Delete** keys for users leaving organization

## Best Practices

### Regular user reviews
- **Check pending users daily** or weekly
- **Process approvals promptly** for better user experience
- **Communicate with rejected users** if appropriate

### Security considerations
- **Use domain whitelist** to reduce spam signups
- **Keep admin count minimal** (principle of least privilege)
- **Monitor user activity** for suspicious patterns
- **Regularly audit user list** and remove inactive accounts
- **Remove access for departed employees**
- **Enforce strong password policies** (if applicable)

### First user setup
- **First user automatically promoted to admin role**
- **No approval needed** for the first user
- **Admin can manage** all subsequent users
- **Change admin credentials** immediately after first setup

### Handling rejected users
- **Rejected users receive notification email**
- **User record is soft-deleted** (marked as rejected)
- **Records retained** for audit purposes
- **Can be reactivated** if needed (admin discretion)
- **Permanent deletion** available for GDPR compliance

## Troubleshooting

### Common issues

**User not receiving approval email**
- Check SMTP configuration
- Check spam/junk folder
- Verify email address is correct
- Try resending from admin panel
**Cannot approve own user**
- Admin approving their own account is prevented (security feature)
- **Need another admin** to approve the user
- **Promote another user to admin role**
- **Approve yourself** using different browser or session

**User stuck in pending after approval**
- Refresh page
- Try logging out and back in
- Check for "active" status
- Contact admin if persists

---

*Next: [Pipeline Configuration](./pipeline-setup.md)*
