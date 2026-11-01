/** Keep a fixed form overlay inside the visible viewport when a keyboard opens. */
export function bindAuthViewport(
  viewport: Pick<VisualViewport, 'height' | 'offsetTop' | 'addEventListener' | 'removeEventListener'> | null,
  style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'>,
): () => void {
  if (!viewport) return () => {}
  const update = () => {
    if (Number.isFinite(viewport.height) && viewport.height > 0) {
      style.setProperty('--auth-viewport-height', `${viewport.height}px`)
      style.setProperty('--auth-viewport-top', `${Math.max(0, viewport.offsetTop)}px`)
    }
  }
  update()
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  return () => {
    viewport.removeEventListener('resize', update)
    viewport.removeEventListener('scroll', update)
    style.removeProperty('--auth-viewport-height')
    style.removeProperty('--auth-viewport-top')
  }
}
