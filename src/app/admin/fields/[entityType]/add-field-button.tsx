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
import type { CustomFieldDefinition, EntityType } from '@/db/schema'

interface AddFieldButtonProps {
  entityType: EntityType
  /**
   * The full definition list. `FieldDialog` reads only `id`, `name` and `type` from it,
   * but the projection is deliberately NOT applied here: measured, a slim projection
   * still defers at n=155, so it is a payload optimisation (plan 44-08) and not the
   * CFUI-01 repair. See D-44-01.
   */
  availableFields: CustomFieldDefinition[]
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
  field: CustomFieldDefinition
  label: string
}

/**
 * The archived-field restore trigger. Same defect, same repair: `serializedSize`
 * accumulates across the whole Flight row, so on a 155-definition entity the budget is
 * long gone before the serializer reaches the archived section. It is unobservable today
 * only because `deal` currently has no archived definitions.
 */
export function RestoreFieldButton({ entityType, field, label }: RestoreFieldButtonProps) {
  return (
    <FieldDialog field={field} entityType={entityType}>
      <Button variant="ghost" size="sm">
        {label}
      </Button>
    </FieldDialog>
  )
}
