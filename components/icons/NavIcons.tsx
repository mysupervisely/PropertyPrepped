// PropRoster — Simplification + Maintenance Workspace V2, Phase D.1.
//
// A small, hand-authored set of inline SVG line icons — no icon
// library dependency (none is installed, and this is deliberately too
// small a need to justify adding one). Every icon is stroke-based,
// uses currentColor (so active/inactive/muted states come free from
// whatever color the caller's CSS already applies), and is
// aria-hidden — every place these are used pairs the icon with a real
// visible text label, per the site's own accessibility direction
// ("do not rely on icon alone"). Never emoji.
//
// Two families:
//   - Bottom navigation (Dashboard/Properties/Maintenance/Documents/
//     More): GridIcon, HomeIcon, WrenchIcon, DocumentIcon, DotsIcon.
//   - Maintenance category (lib/maintenance/category-icon.ts's own
//     small, deterministic kind mapping): DropletIcon (plumbing),
//     BoltIcon (electrical), BoxIcon (appliance) — hvac/general reuse
//     WrenchIcon, so there are 3 new shapes here, not 5.

type IconProps = { className?: string }

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function GridIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  )
}

export function WrenchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2-2Z" />
    </svg>
  )
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4" />
      <path d="M8.5 13h7M8.5 16.5h7" />
    </svg>
  )
}

export function DotsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function DropletIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5s6 6.7 6 11a6 6 0 1 1-12 0c0-4.3 6-11 6-11Z" />
    </svg>
  )
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M13 3 5 13.5h5.5L11 21l8-11h-5.5L13 3Z" />
    </svg>
  )
}

export function BoxIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z" />
      <path d="M3.5 8v9L12 21.5 20.5 17V8" />
      <path d="M12 12.5V21.5" />
    </svg>
  )
}

// Simplification + Maintenance Workspace V2, Phase D.2: the profile
// entry point's own safe fallback when the landlord has no saved photo
// (components/ProfileEntryButton.tsx) — a plain, neutral silhouette,
// never a broken image.
export function PersonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-4 4.2-6 7.5-6s6.1 2 7.5 6" />
    </svg>
  )
}

// Simplification + Maintenance Workspace V2, Phase E1: the bottom nav's
// PropCrew destination — two overlapping silhouettes (a small crew/
// team), distinct from PersonIcon's single figure (the profile entry
// point's own icon, a different concept: "me" vs. "my contacts").
export function PeopleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M14.7 13.3c2 .4 3.5 1.8 4.2 4.3" />
    </svg>
  )
}

// Simplification + Maintenance Workspace V2, Phase E1: the bottom nav's
// Tax Center destination — a plain receipt silhouette (zigzag bottom
// edge, a few line items), distinct from DocumentIcon's plain folded-
// corner page.
export function ReceiptIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3v-17Z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
    </svg>
  )
}
