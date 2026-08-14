// PropRoster — Property Value & Comps UI Redesign, Part 4 ("Property
// photo area"). A single component so every comparable-card photo area
// goes through one place: today `imageUrl` is always null (RentCast's
// AVM/comps response does not supply a real photo URL — see
// lib/valuation/providers/rentcast.ts's header comment for the full
// finding), so this always renders the PropRoster placeholder. If a
// future provider (or a richer RentCast endpoint) starts returning a real
// photo, passing a non-null imageUrl here is the ONLY change needed —
// nothing else in the comp card has to change.
//
// Deliberately NOT a scraped or stock "house that looks like a house"
// photo: a placeholder that looks like a placeholder is honest about what
// PropRoster actually knows about this property.

export function PropertyPhoto({ imageUrl, alt }: { imageUrl: string | null; alt: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- comparable photos are provider-hosted URLs, not local assets.
    return <img src={imageUrl} alt={alt} className="compPhoto" />
  }
  return (
    <div className="compPhoto compPhotoPlaceholder" role="img" aria-label="No photo available for this property">
      <span aria-hidden="true">⌂</span>
      <small>No photo available</small>
    </div>
  )
}
