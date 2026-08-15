'use client'

/**
 * CFUI-01 — client-side trigger wrappers for `FieldDialog`.
 *
 * These exist so that NO React element is ever passed across the RSC boundary into
 * `FieldDialog`'s `<DialogTrigger asChild>{children}</DialogTrigger>` slot.
 *
 * The bug they repair: `page.tsx` is a server component. Rendering
 * `<FieldDialog availableFields={activeFields}><Button/></FieldDialog>` there puts 155
 * definition rows and an element in the same props object. React Flight's per-row budget
 * is 3200 bytes; once the data prop blows past it the serializer defers the next value
 * into its own row and substitutes `"$L19"`. Radix's `SlotClone` then sees something that
 * is not a valid element, returns `null` with no throw and no warning, and the "Add Field"
 * button simply does not exist on /admin/fields/deal.
 *
 * Building the trigger HERE makes the composition client-to-client, so the element is
 * never serialized at all. Only strings and data cross the boundary, and deferring a data
 * prop is harmless — the client reassembles it. This is the same shape as
 * `src/app/workflows/new-workflow-button.tsx`, and the same reason `fields-list.tsx`
 * renders all 155 rows correctly today.
 *
 * The label strings arrive as props because `getTranslations` is server-only and keeping
 * the i18n call in `page.tsx` keeps it in one place (and ships fewer bytes than a
 * `useTranslations` namespace would).
 *
 * NOTE: no authorization logic belongs in this file. The admin gate lives in `page.tsx`
 * (T-44-19) and is asserted in both directions by
 * `__tests__/rsc-boundary.test.tsx`.
 */

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldDialog } from './field-dialog'
import type { AdminFieldRow, AvailableField } from './field-dialog'
import type { EntityType } from '@/db/schema'

interface AddFieldButtonProps {
  entityType: EntityType
  /**
   * Narrowed to the three keys `FieldDialog` actually reads (D-44-02, plan 44-08).
   *
   * This is a payload optimisation and NOT the CFUI-01 repair - a slim projection still
   * defers at n=155 (44-01 assertion 3), so the repair is the structural one above and
   * stays valid whether or not this narrowing exists. See D-44-01.
   *
   * `page.tsx` passes its shared `AdminFieldRow[]` here directly; the wider row is
   * structurally assignable, so no second array is built and Flight back-references the
   * one it already wrote.
   */
  availableFields: AvailableField[]
  label: string
}

export function AddFieldButton({ entityType, availableFields, label }: AddFieldButtonProps) {
  return (
    <FieldDialog entityType={entityType} availableFields={availableFields}>
      <Button>
        <Plus className="h-4 w-4 mr-2" />
        {label}
      </Button>
    </FieldDialog>
  )
}

interface RestoreFieldButtonProps {
  entityType: EntityType
  field: AdminFieldRow
  label: string
}

/**
 * The archived-field restore trigger. Same defect, same repair: `serializedSize`
 * accumulates across the whole Flight row, so on a 155-definition entity the budget is
 * long gone before the serializer reaches the archived section. It is unobservable today
 * only because `deal` currently has no archived definitions.
 *
 * `archived` is passed explicitly because `AdminFieldRow` drops `deletedAt` (D-44-02) and
 * the dialog used to infer restore-vs-edit mode from it. This component is only ever
 * rendered for an archived field, so the answer is known here without shipping a timestamp.
 */
export function RestoreFieldButton({ entityType, field, label }: RestoreFieldButtonProps) {
  return (
    <FieldDialog field={field} entityType={entityType} archived>
      <Button variant="ghost" size="sm">
        {label}
      </Button>
    </FieldDialog>
  )
}
