# Localization Reference

Complete reference for the Localization features in Pipelite. Configure language, timezone, and formatting preferences.

## Overview

Pipelite supports multiple languages, timezones, and locale-specific formatting. Each user can configure their preferences independently.

### Key Concepts

- Language selection changes interface text
- Timezone affects date/time display
- Locale affects number and currency formatting
- Settings are per-user (not global)
- Changes apply immediately

---

## Supported Languages

### Available Locales

| Locale | Language | Region |
|--------|----------|--------|
| `en-US` | English | United States |
| `pt-BR` | Português | Brasil |
| `es-ES` | Español | España |

### Language Coverage

Interface elements are translated:
- Navigation labels
- Button text
- Form labels
- Error messages
- Status text
- Help text

### Partial Translations

Some content may not be translated:
- User-entered data (notes, titles)
- Organization/person names
- Email notifications (if configured)
- API error messages

---

## Configuring Language

### Accessing Settings

1. Click your user avatar in the navigation header
2. Select **Settings** from the dropdown
3. Navigate to **Profile Settings**

### Changing Language

1. Find the **Language** dropdown
2. Select your preferred language
3. Changes save immediately
4. Interface updates without page refresh

### Language Persistence

Language preference is stored:
- In your user profile (database)
- In a browser cookie (for immediate effect)
- Persists across sessions and devices

---

## Timezone Settings

### Available Timezones

All standard IANA timezones are supported:
- Americas: `America/New_York`, `America/Los_Angeles`, `America/Sao_Paulo`
- Europe: `Europe/London`, `Europe/Paris`, `Europe/Madrid`
- Asia: `Asia/Tokyo`, `Asia/Shanghai`, `Asia/Dubai`
- And many more...

### Setting Timezone

1. Navigate to Profile Settings
2. Find the **Timezone** dropdown
3. Search or scroll to find your timezone
4. Select your timezone
5. Changes save immediately

### Auto-Detect Timezone

Click **Auto-Detect** button to:
- Detect your browser's timezone
- Automatically select it
- Save the preference

### Timezone Effects

Timezone affects display of:
- Activity due dates and times
- Deal expected close dates
- Calendar view in activities
- Timestamps throughout the interface

---

## Date and Time Formatting

### Format Behavior

Date and time formats follow your locale setting:

| Locale | Date Format | Time Format | Example |
|--------|-------------|-------------|---------|
| en-US | MM/DD/YYYY | h:mm A | 03/15/2024, 2:30 PM |
| pt-BR | DD/MM/YYYY | HH:mm | 15/03/2024, 14:30 |
| es-ES | DD/MM/YYYY | HH:mm | 15/03/2024, 14:30 |

### Relative Time

For recent timestamps, Pipelite shows relative time:
- "5 minutes ago"
- "2 hours ago"
- "Yesterday"
- "3 days ago"

After 24 hours, absolute dates are shown instead.

### Timezone Abbreviations

When displaying times with timezone context:
- Shows timezone abbreviation (EST, PST, BRT, etc.)
- Helps avoid confusion about time reference
- Based on your selected timezone

---

## Currency Formatting

### Number Formatting

Numbers and currency follow locale conventions:

| Locale | Number Format | Currency Example |
|--------|---------------|------------------|
| en-US | 1,234.56 | $1,234.56 |
| pt-BR | 1.234,56 | R$ 1.234,56 |
| es-ES | 1.234,56 | €1.234,56 |

### Decimal Separators

| Locale | Decimal | Thousands |
|--------|---------|-----------|
| en-US | `.` (period) | `,` (comma) |
| pt-BR | `,` (comma) | `.` (period) |
| es-ES | `,` (comma) | `.` (period) |

### Currency Symbol Position

| Locale | Position |
|--------|----------|
| en-US | Prefix ($100) |
| pt-BR | Prefix (R$ 100) |
| es-ES | Prefix (€100) |

---

## Calendar Localization

### Calendar View

The activities calendar adapts to your locale:
- First day of week (Sunday vs Monday)
- Month and day names in selected language
- Date formatting in events

### Week Start

| Locale | Week Starts |
|--------|-------------|
| en-US | Sunday |
| pt-BR | Sunday |
| es-ES | Monday |

---

## User Settings Page

### Location

Settings are found at: Settings → Profile Settings

Or navigate directly to: `/settings/profile`

### Available Settings

| Setting | Description | Options |
|---------|-------------|---------|
| Language | Interface language | en-US, pt-BR, es-ES |
| Timezone | Display timezone | All IANA timezones |

### Save Behavior

- Settings save immediately on change
- No "Save" button needed
- Toast notification confirms save
- Page refreshes to apply translations

---

## Implementation Details

### Cookie Storage

Locale and timezone are stored in cookies:
- `locale`: Selected language code
- `timezone`: Selected IANA timezone

### Cookie Properties

- Max age: 1 year
- Path: `/`
- SameSite: `Lax`
- Secure in production

### Server vs Client

- Server components: Read from cookies/database
- Client components: Read from cookies, update via server actions

---

## Related Features

### Activities

Activity due dates respect timezone. See [Activities Reference](./activities.md).

### Deals

Deal values formatted per locale. See [Deals Reference](./deals.md).

### Calendar

Calendar view adapts to locale. See [Activities Reference](./activities.md) for calendar details.

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Language not changing | Refresh page; clear browser cache |
| Times showing wrong | Check timezone setting |
| Currency format wrong | Verify locale setting |
| Missing translation | Report as issue; English fallback shown |
| Auto-detect wrong | Manually select correct timezone |

---

## Tips

1. **Set timezone accurately** — Ensures correct due date display
2. **Auto-detect on first login** — Quick setup
3. **Check settings after browser change** — Cookies may differ
4. **Report missing translations** — Helps improve coverage

---

## Future Enhancements

Potential future localization features:
- Additional languages
- Custom date/time formats
- Currency selection (independent of locale)
- Right-to-left (RTL) support

---

*Last updated: 2026-03-04*
