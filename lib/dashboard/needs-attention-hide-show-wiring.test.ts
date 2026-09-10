import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Simplification + Maintenance Workspace V2, Phase E1.2: Needs Your
// Attention's three presentation states (preview / expanded / hidden).
// Source-read regression guards, matching this repo's established
// no-jsdom convention (see lib/uploads/upload-reliability-wiring.
// test.ts for the direct precedent). No React Testing Library in this
// repo, so state transitions are verified at the source level: the
// conditional branches and handler logic that WOULD produce each
// transition when clicked, not a simulated click itself.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const globalsCss = readFile('app/globals.css')

// Isolate the Needs Your Attention section's own JSX for scoped
// assertions, so matches here can't accidentally hit an unrelated part
// of this large file.
const sectionStart = pageSource.indexOf('<section className="commandCenterSection needsAttentionSection">')
const sectionEnd = pageSource.indexOf('<section><div className="sectionHead"><div><h2>My Properties</h2>')
const sectionSource = pageSource.slice(sectionStart, sectionEnd)

describe('Three presentation states exist, driven by two independent booleans', () => {
  it('attentionVisible (hidden vs. visible) and showAllAttention (preview vs. expanded) are separate state, not one combined enum', () => {
    expect(pageSource).toContain('const [attentionVisible, setAttentionVisible] = useState(true)')
    expect(pageSource).toContain('const [showAllAttention, setShowAllAttention] = useState(false)')
  })

  it('the section renders three distinct branches: empty, hidden, visible (preview/expanded)', () => {
    expect(sectionSource).toContain('attentionRows.length === 0 ? (')
    expect(sectionSource).toContain(') : !attentionVisible ? (')
    expect(sectionSource).toContain(') : (')
  })
})

describe('preview -> View all -> expanded', () => {
  it('in the visible branch, "View all" is a toggle on showAllAttention that flips to expanded (all rows)', () => {
    expect(sectionSource).toContain("<button className=\"needsAttentionViewAll\" onClick={() => setShowAllAttention((v) => !v)}>{showAllAttention ? 'Show less' : 'View all'}</button>")
    expect(pageSource).toContain('const visibleAttentionRows = showAllAttention ? attentionRows : attentionRows.slice(0, NEEDS_ATTENTION_PREVIEW_LIMIT)')
  })

  it('"View all" only appears when there is genuinely more than the preview limit to reveal', () => {
    expect(sectionSource).toContain('{attentionRows.length > NEEDS_ATTENTION_PREVIEW_LIMIT && (')
  })
})

describe('expanded -> Show less -> preview', () => {
  it('the SAME toggle button flips showAllAttention back to false — "Show less" and "View all" are one control, not two', () => {
    // Already asserted above (one button, one onClick, label driven by
    // showAllAttention) — this test exists to make the specific
    // transition explicit and separately traceable in test output.
    const btnStart = sectionSource.indexOf('needsAttentionViewAll" onClick=')
    expect(btnStart).toBeGreaterThan(-1)
    const btn = sectionSource.slice(btnStart, sectionSource.indexOf('</button>', btnStart))
    expect(btn).toContain("setShowAllAttention((v) => !v)")
    expect(btn).toContain("showAllAttention ? 'Show less' : 'View all'")
  })
})

describe('preview -> Hide -> hidden, and expanded -> Hide -> hidden', () => {
  it('"Hide" (visible branch) calls the same toggleAttentionVisible handler regardless of preview/expanded', () => {
    expect(sectionSource).toContain('<button className="needsAttentionHideToggle" onClick={toggleAttentionVisible}>Hide</button>')
  })

  it('toggleAttentionVisible resets showAllAttention to false — hiding from EXPANDED never leaves it expanded once shown again', () => {
    const fnStart = pageSource.indexOf('function toggleAttentionVisible() {')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = pageSource.slice(fnStart, pageSource.indexOf('\n  }', fnStart))
    expect(fnBody).toContain('setShowAllAttention(false)')
    expect(fnBody).toContain('setAttentionVisible((prev) => {')
  })
})

describe('hidden -> Show -> preview', () => {
  it('the HIDDEN branch\'s "Show" button calls the exact same toggleAttentionVisible handler (one toggle, two labels, not two handlers)', () => {
    expect(sectionSource).toContain('<button className="needsAttentionHideToggle" onClick={toggleAttentionVisible}>Show</button>')
  })

  it('landing state after Show is always preview, never expanded — showAllAttention is forced false inside the same toggle (see the test above), and the visible branch always starts from visibleAttentionRows, not attentionRows, when showAllAttention is false', () => {
    expect(pageSource).toContain('const visibleAttentionRows = showAllAttention ? attentionRows : attentionRows.slice(0, NEEDS_ATTENTION_PREVIEW_LIMIT)')
  })
})

describe('Hide/Show is presentation only — never mutates or re-derives the underlying attention data', () => {
  it('toggleAttentionVisible touches only attentionVisible/showAllAttention state and localStorage — no Supabase call, no mutation of attentionItems/vacancyItems/openMaintenanceItems/attentionRows', () => {
    const fnStart = pageSource.indexOf('function toggleAttentionVisible() {')
    const fnBody = pageSource.slice(fnStart, pageSource.indexOf('\n  }', fnStart))
    expect(fnBody).not.toMatch(/supabase|attentionItems|vacancyItems|openMaintenanceItems|attentionRows\.splice|attentionRows\.filter/)
  })

  it('attentionRows is still built from the exact same three source arrays regardless of visibility state — hiding never changes what is computed, only what renders', () => {
    expect(pageSource).toContain('const attentionRows = [')
    expect(pageSource).toContain('...attentionItems.map(')
    expect(pageSource).toContain('...vacancyItems.map(')
    expect(pageSource).toContain('...openMaintenanceItems.map(')
  })

  it('persists as a lightweight localStorage preference, reusing the exact same established pattern as Portfolio Snapshot (no new persistence architecture, no database)', () => {
    expect(pageSource).toContain("const NEEDS_ATTENTION_VISIBLE_STORAGE_KEY = 'proproster:needsAttentionVisible'")
    expect(pageSource).toContain('window.localStorage.getItem(NEEDS_ATTENTION_VISIBLE_STORAGE_KEY)')
    expect(pageSource).toContain('window.localStorage.setItem(NEEDS_ATTENTION_VISIBLE_STORAGE_KEY, String(next))')
    // Defensive, matching the Snapshot toggle's own try/catch — storage
    // being unavailable (private browsing, etc.) must never throw.
    const fnStart = pageSource.indexOf('function toggleAttentionVisible() {')
    const fnBody = pageSource.slice(fnStart, pageSource.indexOf('\n  }', fnStart))
    expect(fnBody).toContain('try {')
    expect(fnBody).toContain('catch {')
  })
})

describe('Empty-state behavior is unchanged — no Hide/Show/View all controls when there is nothing to act on', () => {
  it('the empty branch renders only the calm "You\'re all caught up" text, with no controls in that branch', () => {
    const emptyStart = sectionSource.indexOf('attentionRows.length === 0 ? (')
    const emptyBranch = sectionSource.slice(emptyStart, sectionSource.indexOf(') : !attentionVisible'))
    expect(emptyBranch).toContain('You&apos;re all caught up.')
    expect(emptyBranch).not.toContain('needsAttentionHideToggle')
    expect(emptyBranch).not.toContain('needsAttentionViewAll')
  })

  it('the HIDDEN state\'s own "Show" button in the heading row is also gated on there being real items — never shown for an empty list', () => {
    expect(sectionSource).toContain('{!attentionVisible && attentionRows.length > 0 && (')
  })
})

describe('Mobile layout does not overflow (390-393px)', () => {
  it('the count + actions row wraps rather than overflowing on very narrow widths', () => {
    const rule = globalsCss.match(/\.needsAttentionMetaRow \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('flex-wrap: wrap')
  })

  it('Hide/Show and View all share the same quiet, unboxed treatment (no oversized bordered buttons that could crowd a narrow row)', () => {
    const viewAllRule = globalsCss.match(/\.needsAttentionViewAll \{[^}]*\}/)?.[0] || ''
    const hideRule = globalsCss.match(/\.needsAttentionHideToggle \{[^}]*\}/)?.[0] || ''
    for (const rule of [viewAllRule, hideRule]) {
      expect(rule).toContain('border: 0')
      expect(rule).toContain('background: transparent')
    }
  })
})

describe('No em dash in this phase\'s new/modified copy', () => {
  // Scoped to the actual rendered text nodes, not the whole section
  // source — JSX comments in this section legitimately use em dashes
  // (comments are not user-facing and are exempt from this policy).
  it('View all / Show less / Hide / Show / the item count text contain no em dash', () => {
    for (const literal of ["'Show less' : 'View all'", '>Hide</button>', '>Show</button>', "{attentionRows.length} item{attentionRows.length === 1 ? '' : 's'}"]) {
      expect(sectionSource).toContain(literal)
    }
    expect(sectionSource).not.toMatch(/>Hide—|>Show—|View all—|Show less—/)
  })
})
