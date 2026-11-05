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
      <svg className="wordmarkIcon" viewBox="180 220 660 530" fill="none" aria-hidden="true">
        <path d="M230 493L512 272L794 493M756 334V455" stroke="#075640" strokeWidth="49" strokeLinecap="round" strokeLinejoin="round" />
        <g fill="#075640"><circle cx="364" cy="526" r="26"/><circle cx="364" cy="610" r="26"/><circle cx="364" cy="694" r="26"/><rect x="422" y="503" width="250" height="46" rx="23"/><rect x="422" y="587" width="250" height="46" rx="23"/><rect x="422" y="671" width="250" height="46" rx="23"/></g>
      </svg><span className="wordmarkProp">Prop</span>
      <span className="wordmarkRoster">Roster</span>
    </>
  )
}
