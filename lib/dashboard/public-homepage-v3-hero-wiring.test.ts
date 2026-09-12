import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Public Homepage V3 (Marketing-First Hero) — real-iPhone follow-up.
//
// The first pass (real Netlify preview, reviewed on a real iPhone) put
// public/hero-property.jpg in a separate, full-strength photo card: a
// two-column grid on desktop, a giant standalone image block below the
// copy on mobile. Real-device feedback: that read as a property listing
// photo, not an atmosphere, and made the hero scroll-heavy on phones.
// This pass keeps the exact same image and exact same hero copy but
// turns the photo into a single soft BACKGROUND LAYER behind the text
// (.landingHeroBg, absolutely positioned, aria-hidden, faded) — there is
// no separate content block for it anymore, on any viewport.
//
// This pass also restructures the "why PropRoster" section from three
// elaborate pillars into four short, calm entries (Organize / Coordinate
// / Automate / Understand) that now carry the hero promise forward,
// since the standalone photo block that used to sit between them and the
// hero is gone. Copy is verbatim, as specified.
//
// Workflow, secondary features, pricing, privacy note, and final CTA are
// untouched (out of scope for this pass) and are not re-asserted here —
// see homepage-pricing-free-property.test.ts and
// tenant-facing-experience-v1-wiring.test.ts for those.
//
// Same no-jsdom, source-read wiring-test convention as every other test
// in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')

const heroStart = landingSource.indexOf('<section className="landingHero">')
const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
const heroSlice = landingSource.slice(heroStart, heroEnd)

describe('5. Public Homepage V3: hero copy is byte-for-byte unchanged', () => {
  it('H1, supporting headline, supporting paragraph, primary CTA, and free-property note all match exactly', () => {
    expect(heroSlice).toContain('<h1>Your properties. Organized.</h1>')
    expect(heroSlice).toContain('<p className="landingHeroTagline">Keep control of your properties without managing every little detail.</p>')
    expect(heroSlice).toContain('<p className="landingHeroSub">PropRoster helps organize the information and numbers behind your properties, simplify communication with tenants and your trusted PropCrew, and automate routine coordination.</p>')
    expect(heroSlice).toContain('>Start Free</button>')
    expect(heroSlice).toContain('<p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>')
  })
})

describe('6-7. Public Homepage V3: Start Free remains the only hero CTA', () => {
  it('exactly one primary CTA in the hero — no second competing CTA, no "View Demo"', () => {
    expect((heroSlice.match(/>Start Free<\/button>/g) || []).length).toBe(1)
    expect(heroSlice).not.toMatch(/view demo/i)
    expect(heroSlice).not.toMatch(/watch demo/i)
    expect(heroSlice).not.toMatch(/see it in action/i)
  })
})

describe('Public Homepage V3: brand/positioning guardrails hold across the whole file', () => {
  it('never claims to be a property-management company or "AI property management," and never overstates automation', () => {
    expect(landingSource).not.toMatch(/property management made simple/i)
    expect(landingSource).not.toMatch(/ai property management/i)
    expect(landingSource).not.toMatch(/fully automat/i)
  })
})

describe('1. Public Homepage V3: hero-property.jpg is still used', () => {
  it('the hero renders public/hero-property.jpg — the same reserved asset, not a new/different image, not altered', () => {
    expect(heroSlice).toContain('src="/hero-property.jpg"')
  })

  it('no new image asset was added — still exactly one <img> in the whole landing page', () => {
    expect((landingSource.match(/<img\b/g) || []).length).toBe(1)
  })

  it('decorative-only: empty alt text plus aria-hidden on its wrapper, so it is never required to understand the page and is never announced to a screen reader', () => {
    const imgMatch = heroSlice.match(/<img\b[^>]*\/>/)
    expect(imgMatch).not.toBeNull()
    expect(imgMatch![0]).toMatch(/alt=""/)
    expect(heroSlice).toContain('className="landingHeroBg" aria-hidden="true"')
  })

  it('the image has explicit width/height (matching the real 1536x1024 file) so it never causes layout shift', () => {
    expect(heroSlice).toMatch(/width=\{1536\}/)
    expect(heroSlice).toMatch(/height=\{1024\}/)
  })

  it('loads eagerly at high priority — it is above the fold, not a lazy-loaded background image', () => {
    expect(heroSlice).toContain('loading="eager"')
    expect(heroSlice).toContain('fetchPriority="high"')
  })
})

describe('2-3. Public Homepage V3: the photo is an integrated background layer, not a standalone card', () => {
  it('no dedicated image-card/frame classes survive anywhere in the file — the old .landingHeroVisual/.landingHeroImageFrame/.landingHeroGrid two-column wrapper are gone', () => {
    expect(landingSource).not.toMatch(/landingHeroVisual|landingHeroImageFrame|landingHeroGrid|landingHeroContent\b/)
    expect(cssSource).not.toMatch(/landingHeroVisual|landingHeroImageFrame|landingHeroGrid/)
  })

  it('the image sits inside one absolutely positioned background layer behind the copy, not beside or below it in a second content block', () => {
    expect(heroSlice).toContain('className="landingHeroBg" aria-hidden="true"')
    expect(heroSlice).toContain('className="landingHeroBgImage"')
    expect(heroSlice).toContain('className="landingHeroBgFade"')
    expect(heroSlice).toContain('className="landingHeroInner"')
    const bgRule = cssSource.match(/\.landingHeroBg \{[^}]*\}/)?.[0] || ''
    expect(bgRule).toContain('position: absolute')
    expect(bgRule).toContain('inset: 0')
    const innerRule = cssSource.match(/\.landingHeroInner \{[^}]*\}/)?.[0] || ''
    expect(innerRule).toContain('position: relative')
  })

  it('the image itself carries no frame/border/shadow/rounded-corner treatment — nothing left to read as a "photo card"', () => {
    const imageRule = cssSource.match(/\.landingHeroBgImage \{[^}]*\}/)?.[0] || ''
    expect(imageRule).not.toMatch(/border-radius|box-shadow|border:/)
  })

  it('a fade overlay sits on top of the photo, softening it into the page rather than a hard-edged rectangle', () => {
    const fadeRule = cssSource.slice(cssSource.indexOf('.landingHeroBgFade {'), cssSource.indexOf('.landingHeroInner {'))
    expect(fadeRule).toContain('linear-gradient')
    // At least two stacked gradients (horizontal fade + vertical feather) —
    // a single flat overlay would still leave a hard top/bottom edge.
    expect((fadeRule.match(/linear-gradient\(/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('the photo is visually softened (reduced opacity, blurred) — "atmosphere," not a crisp, full-strength photograph', () => {
    const imageRule = cssSource.match(/\.landingHeroBgImage \{[^}]*\}/)?.[0] || ''
    const opacityMatch = imageRule.match(/opacity:\s*([\d.]+)/)
    expect(opacityMatch).not.toBeNull()
    expect(Number(opacityMatch![1])).toBeLessThan(0.5)
    expect(imageRule).toMatch(/filter:\s*blur\(/)
  })

  it('the fade is anchored to the actual text column width (absolute px stops), not a viewport percentage that could let a narrower screen reveal photo detail under the paragraph text', () => {
    const fadeRule = cssSource.slice(cssSource.indexOf('.landingHeroBgFade {'), cssSource.indexOf('.landingHeroInner {'))
    expect(fadeRule).toMatch(/linear-gradient\(100deg,\s*rgba\(245, 247, 249, 1\) 0px/)
    expect(fadeRule).toMatch(/px\)/)
  })
})

describe('4. Public Homepage V3: mobile does not stack a standalone house image below the CTA', () => {
  it('no separate mobile image block exists — the ≤980px breakpoint only re-tunes the SAME background layer\'s opacity/position/fade, it never reintroduces a stacked <img> or a second content section', () => {
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    expect(bp980).toContain('.landingHeroBgImage')
    expect(bp980).toContain('.landingHeroBgFade')
    expect(bp980).not.toMatch(/<img/)
  })

  it('the free-property note is the last thing in .landingHeroInner — nothing (image or otherwise) is appended after it inside the hero\'s content column', () => {
    const innerStart = heroSlice.indexOf('className="landingHeroInner"')
    const innerSlice = heroSlice.slice(innerStart)
    const freeNoteIdx = innerSlice.indexOf('landingHeroFreeNote')
    const afterFreeNote = innerSlice.slice(freeNoteIdx, innerSlice.indexOf('</div>', freeNoteIdx))
    expect(afterFreeNote).not.toMatch(/<img|landingHeroBg/)
  })

  it('the mobile-tuned background layer is faded more heavily than desktop, not less — the whole point is to recede further at narrow widths, never to intensify into a dominant image', () => {
    const desktopOpacity = Number((cssSource.match(/\.landingHeroBgImage \{[^}]*opacity:\s*([\d.]+)/) || [])[1])
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    const mobileOpacity = Number((bp980.match(/\.landingHeroBgImage \{[^}]*opacity:\s*([\d.]+)/) || [])[1])
    expect(mobileOpacity).toBeLessThan(desktopOpacity)
  })
})

describe('Public Homepage V3: hero fills the full viewport width — no leftover two-column grid, no horizontal-scroll risk', () => {
  it('the hero section still clips its own background layer at the section edges', () => {
    const heroRule = cssSource.match(/\.landingHero \{[^}]*\}/)?.[0] || ''
    expect(heroRule).toContain('position: relative')
    expect(heroRule).toContain('overflow: hidden')
  })

  it('no new colors were introduced — the fade reuses the exact --bg token value as an rgba ramp, never a new hex literal', () => {
    const bgFadeBlock = cssSource.slice(cssSource.indexOf('.landingHeroBgFade {'), cssSource.indexOf('.landingHeroInner {'))
    expect(bgFadeBlock).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(bgFadeBlock).toContain('rgba(245, 247, 249')
  })
})

// Dynamic Homepage V1 superseded the four-icon .landingPillars grid this
// describe block used to protect — the same four concepts (Organize/
// Coordinate/Automate/Understand) and their exact approved one-line
// descriptions are still on the page, verbatim, now as the body copy of
// four cinematic "scenes" (see lib/dashboard/dynamic-homepage-v1-wiring.test.ts
// for the full scene-structure coverage) rather than a four-icon grid.
// This block is rescoped in place to the same underlying invariant —
// "the exact approved copy still exists, calm/lightweight, no giant
// bordered cards" — against the new structure.
describe('8. Public Homepage V3: four pillars remain (Organize / Coordinate / Automate / Understand)', () => {
  it('all four headings and their exact approved one-line copy are present as scene body copy', () => {
    expect(landingSource).toContain('Property information, documents, leases and numbers — all in one place.')
    expect(landingSource).toContain('Connect tenants with your trusted PropCrew — without all the back-and-forth.')
    expect(landingSource).toContain('See the financial picture of each property — and your whole portfolio — more clearly.')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Organize.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Coordinate.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Automate.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Understand.</h2>')
  })

  it('exactly four scenes render, one per concept, each its own real-UI-concept stage — no giant bordered feature cards, no icon grid reintroduced', () => {
    expect((landingSource.match(/className="landingScene(?:"| landingSceneTall")/g) || []).length).toBe(4)
    expect(landingSource).not.toMatch(/landingPillarsGrid|landingPillarCard/)
    expect(cssSource).not.toMatch(/\.landingPillarsGrid|\.landingPillarCard/)
  })

  it('the shared stage card carries a light, restrained treatment (surface fill, one hairline border, soft shadow) — not a heavy bordered box', () => {
    const stageRule = cssSource.match(/\.sceneStage \{[^}]*\}/)?.[0] || ''
    expect(stageRule).toContain('background: var(--surface)')
    expect(stageRule).toContain('border: 1px solid var(--line)')
  })
})

describe('9. Public Homepage V3: mobile scene copy remains readable without hover', () => {
  it('at tablet/mobile widths every scene stacks to a single column — never a cramped multi-column layout, never a hover-dependent reveal', () => {
    const bp900Start = cssSource.indexOf('@media (max-width: 900px)')
    const bp900 = cssSource.slice(bp900Start, cssSource.indexOf('@media (max-width: 980px)', bp900Start))
    expect(bp900).toMatch(/\.landingSceneInner, \.landingSceneInner--reverse \{ grid-template-columns: 1fr/)
  })

  it('no :hover-only rule reveals scene body text — it is always in the DOM; useScrollReveal only ever adds a visible class, it never keeps content in the DOM but hidden behind a hover requirement', () => {
    expect(cssSource).not.toMatch(/\.landingScene[A-Za-z]*[^{]*:hover[^{]*\{[^}]*display:\s*none/)
    expect(cssSource).not.toMatch(/\.landingSceneBody \{[^}]*opacity:\s*0/)
  })
})

describe('10. Public Homepage V3: no horizontal overflow risk introduced', () => {
  it('the fade/background layer is fully contained (overflow: hidden on the hero, inset:0 on the layers) — it cannot push the document wider than the viewport', () => {
    const heroRule = cssSource.match(/\.landingHero \{[^}]*\}/)?.[0] || ''
    expect(heroRule).toContain('overflow: hidden')
    const bgRule = cssSource.match(/\.landingHeroBg \{[^}]*\}/)?.[0] || ''
    expect(bgRule).toContain('inset: 0')
  })
})

describe('Public Homepage V3: everything else on the page is untouched (out of scope)', () => {
  it('pricing is still read from the same canonical lib/billing/plans.ts source, never re-typed', () => {
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
  })

  it('auth (sign-in/sign-up) is completely untouched — same on-demand overlay, same submitAuth/openAuth functions', () => {
    expect(landingSource).toContain('async function submitAuth()')
    expect(landingSource).toContain("function openAuth(mode: 'signin' | 'signup')")
  })

  // Dynamic Homepage V1 removed the separate "How it works" three-step
  // section — its content is now absorbed into the Organize/Coordinate/
  // Automate scenes above (Scene 2's "Coordinate" narrative covers the
  // same "connect your tenant" ground; Scene 3's "Automate" body copy is
  // the exact same sentence WORKFLOW_STEPS' third step used to carry).
  // This is a deliberate consolidation ("fewer boxes," one continuous
  // story), not an accidental content loss — the still-true underlying
  // claim (PropRoster moves coordination forward, the landlord stays in
  // control) is verified below instead of gating on the removed section.
  it('the "How it works" section is gone (consolidated into the scene sequence); its key claim survives verbatim in the Automate scene', () => {
    expect(landingSource).not.toContain('const WORKFLOW_STEPS')
    expect(landingSource).not.toContain('landingWorkflow')
    expect(landingSource).toContain('PropRoster helps move requests, availability and provider communication forward. You stay in control of every decision.')
  })
})

// Public Homepage V3, real-iPhone follow-up (2nd round): two small
// refinements after a real-device review of the previous round's deploy
// preview approved the overall direction (subtle house background,
// compact hero, 2x2 pillars, current copy/layout) but flagged (a) "Start
// Free" appearing twice in the same initial mobile viewport (header +
// hero) and (b) the background photo reading slightly too faint on a
// real screen. Both fixes are presentation-only tweaks to the SAME
// architecture already in place — no JS viewport detection, no new
// breakpoint, no copy/layout change.
describe('1-6. Public Homepage V3: mobile header no longer duplicates "Start Free" — presentation only', () => {
  it('the header still renders Pricing/Log In/Start Free unconditionally in JSX — nothing was removed from the markup, only hidden by CSS at the narrow breakpoint', () => {
    const headerStart = landingSource.indexOf('<header className="landingHeader">')
    const headerEnd = landingSource.indexOf('</header>')
    const headerSlice = landingSource.slice(headerStart, headerEnd)
    expect(headerSlice).toContain('<Link href="/pricing" className="landingNavLink">Pricing</Link>')
    expect(headerSlice).toContain('className="landingNavLogin"')
    expect(headerSlice).toContain('className="primary landingNavStartFree"')
    // Same onClick/route as before — functionality is completely
    // unchanged, this is a display-only fix.
    expect(headerSlice).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
  })

  it('3-4. at the existing narrow-mobile breakpoint (the same one that already hides the Pricing link), only the header\'s Start Free is hidden — Log In stays visible', () => {
    const bp560Start = cssSource.indexOf('@media (max-width: 560px)', cssSource.indexOf('.landingHero {'))
    const bp560 = cssSource.slice(bp560Start, cssSource.indexOf('\n}', cssSource.indexOf('.landingSignInCard { padding: 24px 18px', bp560Start)) + 2)
    expect(bp560).toContain('.landingNavLink { display: none; }')
    expect(bp560).toContain('.landingNavStartFree { display: none; }')
    expect(bp560).not.toMatch(/\.landingNavLogin\s*\{[^}]*display:\s*none/)
  })

  it('5. Pricing is not reintroduced as a mobile-header replacement for the hidden Start Free — it stays hidden too, exactly as before this round', () => {
    const bp560Start = cssSource.indexOf('@media (max-width: 560px)', cssSource.indexOf('.landingHero {'))
    const bp560 = cssSource.slice(bp560Start, cssSource.indexOf('\n}', cssSource.indexOf('.landingSignInCard { padding: 24px 18px', bp560Start)) + 2)
    expect(bp560).toContain('.landingNavLink { display: none; }')
  })

  it('desktop keeps all four header items — the hide rule only exists inside the ≤560px media query, never at the base/desktop rule level', () => {
    const beforeMediaQueries = cssSource.slice(0, cssSource.indexOf('@media (max-width: 980px)'))
    expect(beforeMediaQueries).not.toMatch(/\.landingNavStartFree\s*\{[^}]*display:\s*none/)
  })

  it('2. the hero\'s own Start Free CTA is completely unaffected by this change — untouched copy, untouched onClick, still the single conversion point on mobile', () => {
    const heroStart = landingSource.indexOf('<section className="landingHero">')
    const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
    const heroSlice = landingSource.slice(heroStart, heroEnd)
    expect(heroSlice).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
  })
})

describe('7. Public Homepage V3: the background-photo architecture from the previous round is preserved, only re-tuned', () => {
  it('still the same background-layer classes — no standalone image/card returns', () => {
    expect(landingSource).toContain('className="landingHeroBg" aria-hidden="true"')
    expect(landingSource).toContain('className="landingHeroBgImage"')
    expect(landingSource).toContain('className="landingHeroBgFade"')
    expect(landingSource).not.toMatch(/landingHeroVisual|landingHeroImageFrame|landingHeroGrid/)
  })

  it('8. still exactly one <img> in the whole page, still decorative (empty alt, aria-hidden wrapper) — no image card was reintroduced', () => {
    expect((landingSource.match(/<img\b/g) || []).length).toBe(1)
    const imgMatch = landingSource.match(/<img\b[^>]*\/>/)
    expect(imgMatch![0]).toMatch(/alt=""/)
  })

  it('the mobile-tuned opacity moved only slightly (a restrained bump, not a return to a strong photograph) and is still well below 50%', () => {
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    const mobileOpacity = Number((bp980.match(/\.landingHeroBgImage \{[^}]*opacity:\s*([\d.]+)/) || [])[1])
    expect(mobileOpacity).toBeGreaterThan(0.1) // more perceptible than before this round
    expect(mobileOpacity).toBeLessThan(0.3) // still restrained, nowhere near a full photograph
    const desktopOpacity = Number((cssSource.match(/\.landingHeroBgImage \{[^}]*opacity:\s*([\d.]+)/) || [])[1])
    expect(mobileOpacity).toBeLessThan(desktopOpacity) // mobile still recedes further than desktop
  })

  it('the blur/desaturation "soft atmosphere" treatment is unchanged — a more visible opacity was not paired with removing the softening', () => {
    const imageRule = cssSource.match(/\.landingHeroBgImage \{[^}]*\}/)?.[0] || ''
    expect(imageRule).toMatch(/filter:\s*blur\(/)
  })

  it('the fade still fully covers the text zone (the left portion stays at full opaque coverage) — the adjustment only moved the reveal point, it never reduced the left/text-side coverage', () => {
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    expect(bp980).toMatch(/rgba\(245, 247, 249, 1\) 0%, rgba\(245, 247, 249, 1\) \d+%/)
  })
})

// Rescoped for Dynamic Homepage V1 — see the "8./9. Public Homepage V3"
// describe blocks above for the current, authoritative assertions on
// the four Organize/Coordinate/Automate/Understand concepts and their
// mobile layout; this block's own literal checks were superseded by
// those (duplicating them here would just be the same two checks
// twice).

describe('10. Public Homepage V3: hero copy, height, and CTA note are unaffected by this round\'s two small tweaks', () => {
  it('H1/tagline/sub/free-note text is still byte-for-byte the same', () => {
    const heroStart = landingSource.indexOf('<section className="landingHero">')
    const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
    const heroSlice = landingSource.slice(heroStart, heroEnd)
    expect(heroSlice).toContain('<h1>Your properties. Organized.</h1>')
    expect(heroSlice).toContain('<p className="landingHeroTagline">Keep control of your properties without managing every little detail.</p>')
    expect(heroSlice).toContain('<p className="landingHeroSub">PropRoster helps organize the information and numbers behind your properties, simplify communication with tenants and your trusted PropCrew, and automate routine coordination.</p>')
    expect(heroSlice).toContain('<p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>')
  })
})

// Public Homepage V3, real-iPhone follow-up (3rd round): a real iPhone
// review liked the overall direction but found the hero CTA button
// visually offset/floating to the left on mobile, even though the
// h1/tagline/paragraph above it are correctly left-aligned. This centers
// just the CTA group (button + free-property note) at the existing
// mobile breakpoint — not the whole hero column, not desktop.
describe('1-6. Public Homepage V3: mobile hero CTA group is centered (3rd round)', () => {
  const bp560Start = cssSource.indexOf('@media (max-width: 560px)', cssSource.indexOf('.landingHero {'))
  const bp560End = cssSource.indexOf('\n}', cssSource.indexOf('.landingSignInCard { padding: 24px 18px', bp560Start)) + 2
  const bp560 = cssSource.slice(bp560Start, bp560End)

  it('1. the hero Start Free button still exists, unchanged copy/onClick', () => {
    const heroStart = landingSource.indexOf('<section className="landingHero">')
    const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
    const heroSlice = landingSource.slice(heroStart, heroEnd)
    expect(heroSlice).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
  })

  it('2. at the mobile breakpoint, the CTA group is centered — .landingHeroCtas switches from flex-start to center', () => {
    expect(bp560).toContain('.landingHeroCtas { justify-content: center; }')
    // The base/desktop rule stays flex-start — this is an override, not a
    // replacement of the shared rule.
    const baseCtasRule = cssSource.match(/\.landingHeroCtas \{[^}]*\}/)?.[0] || ''
    expect(baseCtasRule).toContain('justify-content: flex-start')
  })

  it('3. the free-property note centers along with the button at the same breakpoint', () => {
    expect(bp560).toContain('.landingHeroFreeNote { text-align: center; }')
  })

  it('4. desktop CTA alignment is untouched — the centering override lives only inside the ≤560px block, never at the base rule or the ≤980px block', () => {
    const beforeMediaQueries = cssSource.slice(0, cssSource.indexOf('@media (max-width: 980px)'))
    expect(beforeMediaQueries).not.toMatch(/\.landingHeroCtas\s*\{[^}]*justify-content:\s*center/)
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    expect(bp980).not.toMatch(/\.landingHeroCtas/)
  })

  it('the button keeps its own intrinsic size — no width:100%/flex-grow was added, so it does not become full-width as a side effect of centering', () => {
    expect(bp560).not.toMatch(/\.landingHeroCtas[^}]*width:\s*100%/)
    expect(bp560).not.toMatch(/\.landingCtaPrimary\s*\{[^}]*width:\s*100%/)
  })

  it('5. the mobile header still has no Start Free button — unaffected by this round', () => {
    expect(bp560).toContain('.landingNavStartFree { display: none; }')
  })

  it("h1/tagline/paragraph above the CTA stay left-aligned — only the CTA group centers, not the whole hero column", () => {
    expect(bp560).not.toMatch(/\.landingHeroInner\s*\{[^}]*text-align:\s*center/)
    const innerRule = cssSource.match(/\.landingHeroInner \{[^}]*\}/)?.[0] || ''
    expect(innerRule).toContain('text-align: left')
  })
})
