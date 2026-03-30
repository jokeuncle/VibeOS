import type { MouseEvent as ReactMouseEvent } from 'react'

/**
 * Call on `onMouseDown` for toolbar / icon toggles: cancels the UA’s default
 * focus move on pointer down, so clicks don’t leave a blue focus ring. Focus
 * from Tab/Shift+Tab is unaffected.
 */
export function preventMouseDownFocus<E extends HTMLElement>(e: ReactMouseEvent<E>) {
  e.preventDefault()
}
