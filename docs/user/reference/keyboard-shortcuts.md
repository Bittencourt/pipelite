# Keyboard Shortcuts Reference

Complete reference for all keyboard shortcuts in Pipelite. Navigate faster and work more efficiently.

## Overview

Pipelite is fully keyboard-accessible. Power users can complete most tasks without touching the mouse.

### Key Concepts

- Navigation shortcuts work globally
- Action shortcuts are context-aware
- Shortcuts can be viewed anytime by pressing `?`
- Form elements prevent global shortcuts (except navigation)

---

## Viewing All Shortcuts

Press `?` from anywhere to see the shortcuts overlay:

- Displays all available shortcuts
- Organized by category
- Press `Escape` or `?` to close

### First-Time Hint

New users see a hint about the `?` shortcut on first login. This reminder appears until dismissed.

---

## Global Navigation

These shortcuts work from anywhere in the application:

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Alt + 1` | Go to Home | Dashboard view |
| `Alt + 2` | Go to Organizations | Organizations list |
| `Alt + 3` | Go to People | People list |
| `Alt + 4` | Go to Deals | Kanban board |
| `/` | Focus search | Opens global search |

### Navigation Behavior

- Works even when form fields are focused
- Immediately switches to target page
- Preserves any active filters/state

---

## Global Search

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Escape` | Close search dropdown |
| `↓` / `↑` | Navigate search results |
| `Enter` | Select search result |

---

## List Navigation

When viewing list pages (Organizations, People, Activities):

| Shortcut | Action |
|----------|--------|
| `j` | Move to next item |
| `k` | Move to previous item |
| `Enter` | Open selected item |
| `n` | Create new item |
| `e` | Edit selected item |
| `d` | Delete selected item |

### Selection Indicator

Selected item shows a visual highlight (ring or background change).

### Context Awareness

Actions (`n`, `e`, `d`) apply to the current entity type:
- On Organizations: Creates/edits/deletes organizations
- On People: Creates/edits/deletes people
- On Activities: Creates/edits/deletes activities

---

## Kanban Navigation

When viewing the Deals kanban board:

| Shortcut | Action |
|----------|--------|
| `h` | Move left (previous stage) |
| `l` | Move right (next stage) |
| `j` | Move down (next deal in stage) |
| `k` | Move up (previous deal in stage) |
| `Enter` | Open selected deal |
| `n` | Create new deal |
| `e` | Edit selected deal |
| `d` | Delete selected deal |

### Kanban Movement

The `h` and `l` keys move the selected deal between stages:
1. Select a deal with `j`/`k`
2. Press `h` to move left or `l` to move right
3. Deal moves to adjacent stage
4. Selection follows the deal

### Stage Wrapping

Navigation wraps at boundaries:
- Moving left from first stage wraps to last stage
- Moving right from last stage wraps to first stage
- Skips empty columns automatically

### Selection Ring

Selected deal card shows a ring indicator for clear visibility.

---

## Dialog Shortcuts

When a dialog/modal is open:

| Shortcut | Action |
|----------|--------|
| `Escape` | Close dialog (cancel) |
| `Enter` | Submit form (in text inputs) |
| `Tab` | Move between form fields |

### Dialog Behavior

- Dialogs trap focus inside
- `Escape` always closes
- `Enter` submits from any text field
- `Tab` cycles through form elements

---

## Help Overlay

| Shortcut | Action |
|----------|--------|
| `?` | Show shortcuts overlay |
| `Escape` | Close overlay |
| `?` | Close overlay (toggle) |

---

## Form Element Behavior

When typing in form elements (inputs, textareas):

- Global action shortcuts are **blocked** (n, e, d)
- Navigation shortcuts still work (Alt+1/2/3/4, /)
- This prevents accidental actions while typing

### Exception: Search

The search shortcut (`/`) can be configured to work in forms, allowing quick search access without leaving the keyboard.

---

## Shortcuts Summary Table

### Global (Works Everywhere)

| Shortcut | Action |
|----------|--------|
| `Alt + 1` | Home |
| `Alt + 2` | Organizations |
| `Alt + 3` | People |
| `Alt + 4` | Deals |
| `/` | Search |
| `?` | Show shortcuts |

### List Pages

| Shortcut | Action |
|----------|--------|
| `j` | Next item |
| `k` | Previous item |
| `Enter` | Open item |
| `n` | New item |
| `e` | Edit item |
| `d` | Delete item |

### Kanban Board

| Shortcut | Action |
|----------|--------|
| `h` | Left (previous stage) |
| `l` | Right (next stage) |
| `j` | Down (next deal) |
| `k` | Up (previous deal) |
| `Enter` | Open deal |
| `n` | New deal |
| `e` | Edit deal |
| `d` | Delete deal |

### Dialogs

| Shortcut | Action |
|----------|--------|
| `Escape` | Close dialog |
| `Enter` | Submit |
| `Tab` | Next field |

---

## Accessibility Notes

### Screen Readers

Shortcuts are designed to be accessible:
- Clear visual indicators for selection
- Logical tab order in forms
- Announcements for selection changes

### Keyboard-Only Navigation

All functionality is accessible via keyboard:
- No actions require mouse
- All buttons are focusable
- Focus indicators are visible

### Focus Management

- Focus moves logically between elements
- Modals trap focus appropriately
- Focus returns after modal closes

---

## Customization

Currently, keyboard shortcuts are not customizable. All users use the same shortcut scheme for consistency and easier onboarding.

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Shortcuts not working | Check if form field has focus |
| `n` creates wrong item | Navigate to correct page first |
| Can't close dialog | Press `Escape` |
| Search won't open | Press `/` directly (not Shift+/) |

---

## Tips

1. **Learn navigation first** — `Alt + 1/2/3/4` for quick switching
2. **Use `?` often** — Reference until shortcuts are memorized
3. **Practice kanban nav** — `h/j/k/l` for 2D navigation
4. **Escape is universal** — Closes dialogs, search, overlays
5. **Navigate then act** — Go to page first, then use n/e/d

---

*Last updated: 2026-03-04*
