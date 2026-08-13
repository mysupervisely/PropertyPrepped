// PropRoster brand wordmark — "Prop" in the standard dark text color,
// "Roster" in the same brand green already used for primary buttons and
// accent elements (var(--brand) — no new green introduced). A single
// shared component so this two-tone treatment can't drift between the
// handful of places the wordmark appears (signed-out landing page, every
// authenticated header, /pricing, billing, Investment Tools pages) —
// each caller already wraps this in its own `className="brand"` span;
// this only supplies the two-tone text run inside it.
//
// This is for the BRAND WORDMARK only — never import this for a mention
// of "PropRoster" inside body copy (those stay a single plain-text color).
export function Wordmark() {
  return (
    <>
      <span className="wordmarkProp">Prop</span>
      <span className="wordmarkRoster">Roster</span>
    </>
  )
}
