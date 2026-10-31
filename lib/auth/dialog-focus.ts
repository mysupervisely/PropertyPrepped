/** Keep keyboard focus in an open auth dialog and return it when dismissed. */
export function bindDialogFocus(dialog: HTMLElement, title: HTMLElement): () => void {
  const document = dialog.ownerDocument
  const previous = document.activeElement as HTMLElement | null
  const focusTitle = () => title.focus({ preventScroll: true })
  const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
    && !element.closest('[inert], [hidden]') && element.getClientRects().length > 0)

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const items = controls()
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (!first) {
      event.preventDefault()
      focusTitle()
    } else if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
      event.preventDefault()
      last.focus({ preventScroll: true })
    } else if (!event.shiftKey && (active === last || !items.includes(active as HTMLElement))) {
      event.preventDefault()
      first.focus({ preventScroll: true })
    }
  }
  function onFocusIn(event: FocusEvent) {
    if (!dialog.contains(event.target as Node | null)) focusTitle()
  }

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('focusin', onFocusIn)
  // Focusing the title announces context without opening the phone keyboard.
  focusTitle()
  return () => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('focusin', onFocusIn)
    if (previous?.isConnected && typeof previous.focus === 'function') {
      previous.focus({ preventScroll: true })
    }
  }
}
