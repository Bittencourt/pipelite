import { isValidElement } from 'react'

/**
 * Development-time alarm for Radix `asChild` slots (D-44-03).
 *
 * When `DialogTrigger asChild` receives something that is not a valid React
 * element, Radix `SlotClone` returns `null`: no throw, no warning, no trace.
 * The trigger simply never renders. That silence is why CFUI-01 survived until
 * a full browser end-to-end pass found it.
 *
 * This guard is deliberately NOT a production throw — degrading a page must not
 * become a hard crash for end users. In production it is a pure predicate.
 *
 * It also never logs the child itself: the message names the component and the
 * boundary only, so no prop value or record data can reach the console (T-44-18).
 *
 * @returns whether `children` is a valid React element — the same predicate Radix uses.
 */
export function warnIfInvalidTriggerChild(children: unknown, componentName: string): boolean {
  const valid = isValidElement(children)

  if (!valid && process.env.NODE_ENV !== 'production') {
    console.error(
      `[${componentName}] received a child that is not a valid React element. ` +
        'Radix `asChild` will silently render nothing, so the trigger disappears with no error. ' +
        'The usual cause is a server component passing JSX children across the RSC boundary ' +
        'alongside a large data prop, which makes React Flight defer the element. ' +
        'Render the trigger inside a client component instead of passing it through the boundary.'
    )
  }

  return valid
}
