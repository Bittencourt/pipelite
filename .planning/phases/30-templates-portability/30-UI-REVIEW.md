---
phase: 30-templates-portability
type: ui-review
overall_score: 19/24
---

# UI Review: Phase 30 — Templates & Portability

## Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Copywriting | 3/4 | Labels match spec; "Manage custom templates" toggle is weak UX copy; delete confirmation title diverges from spec |
| Visuals | 3/4 | Component choices match spec; duplicate import statement; "Manage custom templates" uses raw `<button>` not shadcn Button |
| Color | 4/4 | Semantic color use is correct throughout; destructive reserved for delete; muted-foreground used correctly for labels |
| Typography | 4/4 | text-xs / text-sm hierarchy applied consistently and matches spec; font-semibold on card titles as specced |
| Spacing | 3/4 | Form uses space-y-4 correctly; template card heights spec-compliant at 80px; gap-3 in grid is slightly off spec (should be gap-4 / 16px) |
| Experience Design | 2/4 | Missing: spinner on Export button; close-prevention during creation; no-JS delete permission gate; import `setImporting` not reset on early return |

## Findings

### Copywriting

**[note] `http-config.tsx:239` — Delete confirmation title diverges from spec**
The spec calls for the `AlertDialogTitle` to read `"Delete template"` and the body to contain the full sentence `Delete template "{name}"? This cannot be undone.` The implementation splits this correctly across title + description, but the title is `"Delete template"` (no name) while the spec copywriting contract shows the full string as a single message. Functionally acceptable but slightly inconsistent with the contract copy `Delete template "{name}"? This cannot be undone.` which implies the name belongs in the title or body where scannable.

**[fix] `http-config.tsx:210-216` — "Manage custom templates" / "Hide custom templates" toggle copy is not in spec**
Spec defines no toggle-label copy for this collapsible section — it is an implementation deviation. The label is functional but generic. If this section is kept, more precise copy would be `"Manage templates"` / `"Hide templates"` (shorter, less redundant since context is clear).

**[note] `http-config.tsx:129` — Toast copy "Template loaded" not in spec**
The spec copywriting contract does not define a toast for template selection (it's a silent overwrite, D-02). The "Template loaded" toast is a reasonable addition, but it's an unspecced copy string. No spec violation; just an addition.

**[note] `toolbar.tsx:149,159` — Inline loading labels "Exporting..." / "Importing..." not in spec**
Spec defines button text as "Export JSON" / "Import JSON" at idle; loading state is described visually as spinner. The implementation uses text substitution instead of a spinner for the Export button. Acceptable for import since it takes time, but the text-swap pattern is inconsistent with the spinner used for Save.

---

### Visuals

**[fix] `http-config.tsx:4` — Duplicate import of `Trash2`**
`Trash2` is imported twice: once as `Trash2` and once aliased as `Trash2Icon`. Both resolve to the same icon. The `Trash2Icon` alias is used at line 229; the plain `Trash2` is used at line 323. This is a dead-code smell and signals a hasty merge. Should import once as `Trash2` and use consistently.

**[fix] `http-config.tsx:210` — Raw `<button>` for "Manage custom templates" toggle instead of shadcn Button**
The spec establishes shadcn/radix components throughout. Using a bare `<button>` styled with Tailwind classes inline breaks the pattern. The `className="text-xs text-muted-foreground underline hover:text-foreground"` is an ad-hoc style that doesn't match any established component variant. Should use a shadcn `Button` with `variant="link"` and `size="sm"` or a `variant="ghost"` to stay consistent.

**[note] `create-workflow-dialog.tsx:71` — Blank workflow card uses `<button>` not shadcn Card**
The spec says "full-width 'Blank Workflow' card at top: border style, hover highlight" — the implementation uses a `<button>` with matching border/hover Tailwind classes. Visually this achieves the intent, but it's a raw button rather than shadcn Card or Button. Given the template card grid also uses raw `<button>` elements consistently, this is an acceptable implementation pattern for interactive cards — mark as note not fix.

**[note] `toolbar.tsx:149` — Export button shows text "Exporting..." but no spinner**
The spec calls for a spinner on the export button during export. The implementation uses text substitution. Since export is near-instant (client-side Blob), the state is barely visible in practice, but the spec specifies a spinner. Import does the same but takes longer and has more impact.

---

### Color

**[pass] Semantic colors used correctly throughout**
- `text-muted-foreground` for group labels, descriptions, toggle link — correct
- `text-destructive` on the delete trash icon — correct
- `--ring` hover border on interactive cards — correct
- `--background` used on the separator label overlay in `create-workflow-dialog.tsx:94` — correct

No color deviations found. Score: 4/4.

---

### Typography

**[pass] Size and weight hierarchy matches spec**
- `text-xs` (12px) for all Labels and group headings — matches spec label role
- `text-sm font-semibold` (14px, 600) for card titles — matches spec
- `text-xs text-muted-foreground` for card descriptions — matches spec label role
- `text-sm` for Active label in toolbar — matches body role

No typography deviations found. Score: 4/4.

---

### Spacing

**[improve] `create-workflow-dialog.tsx:100` — Template grid uses `gap-3` (12px) instead of `gap-4` (16px)**
The spec spacing scale defines `md = 16px` as default element spacing. The 2-column card grid uses `gap-3` (12px), which sits between sm (8px) and md (16px) and is not a declared scale value. Should be `gap-4` to align with the spacing contract.

**[note] `http-config.tsx:172` — Outer container `space-y-4 p-4` is consistent with existing form patterns**
The p-4 (16px) padding and space-y-4 (16px) vertical rhythm match the md token throughout. This is correct.

**[note] `http-config.tsx:370` — Save as Template section uses `border-t pt-4` separator**
This creates a visual break between the form fields and the save action. Consistent with the spec's intent of placing the button below Retry Count (D-05). No issue.

**[note] `toolbar.tsx:123` — Toolbar gap-4 between name input and active toggle is correct**
`gap-4` (16px) between sections, `gap-2` (8px) between tightly coupled button pairs in the right cluster. This is a sensible two-tier gap hierarchy consistent with the spacing scale.

---

### Experience Design

**[fix] `toolbar.tsx:30-52` — Export button spinner not implemented; text-swap only**
The spec interaction states table requires "Export button shows spinner for download duration." The implementation calls `setExporting(true)` but only renders `"Exporting..."` text instead of replacing the icon with a `<Loader2 className="animate-spin" />`. This is a spec gap. For a near-instant client-side export the visual regression is minor, but it's a broken state machine promise.

**[fix] `toolbar.tsx:55-94` — `setImporting(false)` not called on early return paths**
At `toolbar.tsx:65-68`, when the file is not valid JSON, the function hits `return` inside the inner try-catch without executing the `finally` block at line 91. The outer `finally` WILL catch this (since `return` inside the inner `try` propagates to the outer `finally`). On review: the outer `finally` at line 91 runs regardless. This is actually correct — the `finally` is on the outer try. No bug here; mark as note only.

**[fix] `create-workflow-dialog.tsx:63-65` — Dialog can be closed during creation**
The spec states "Full dialog has no close interaction until creation completes or fails." The implementation passes `onOpenChange={setOpen}` without guarding against close during `creatingId !== null`. A user can click the X button or press Escape to close the dialog while a workflow is being created, leaving the app in an inconsistent state (creation may succeed, navigation never fires). Should be: `onOpenChange={(v) => { if (creatingId !== null) return; setOpen(v) }}`.

**[fix] `http-config.tsx:226-233` — Delete button visible to all users; no permission gate in UI**
Spec D-08 states delete is restricted to creator + admin. The implementation renders the delete icon for all custom templates for all users with no client-side visibility check. The server action (`removeHttpTemplate`) enforces permissions on the backend, so there's no security hole, but non-authorized users will see a delete button that silently fails or shows an error toast — a confusing experience. A `canDelete` boolean (based on session user vs. template creator) should gate the trash icon's render.

**[note] `http-config.tsx:73-83` — Template refresh on mount is a waterfall**
`getHttpTemplates()` is called on every mount of the HTTP config form. If the user opens multiple HTTP nodes in a session, this fires each time. No debounce or cache. Acceptable for v1 given workspace-scope templates change infrequently, but worth noting for future optimization.

**[note] `create-workflow-dialog.tsx:110-118` — Spinner replaces card content during creation**
When a template card is clicked, the spinner replaces the card's name + description text. This is the correct spec behavior: "Clicked card shows spinner centered." The centering is achieved via `flex flex-col justify-center` on the 80px fixed-height button — the spinner renders at top-left, not centered. A `flex items-center justify-center` wrapper around the spinner would properly center it. Minor polish item.

---

## Top 3 Fixes

1. **`create-workflow-dialog.tsx:63` — Guard dialog close during creation** (Experience Design / critical UX correctness)
   Change `onOpenChange={setOpen}` to `onOpenChange={(v) => { if (creatingId !== null) return; setOpen(v) }}` to prevent the dialog from being dismissed while a workflow is being created, which would orphan the in-flight server action and skip navigation.

2. **`http-config.tsx:4` — Remove duplicate `Trash2` import + normalize to single usage** (Visuals / code quality)
   Remove `Trash2 as Trash2Icon` alias; use `Trash2` consistently at both lines 229 and 323. Minor but signals careless merging and will cause lint warnings.

3. **`http-config.tsx:210` — Replace raw `<button>` for "Manage custom templates" with shadcn Button variant="link"** (Visuals / design system consistency)
   Replace the ad-hoc styled bare `<button>` with `<Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground">` to stay within the component system and ensure correct focus ring / keyboard behavior.

## UI REVIEW COMPLETE
