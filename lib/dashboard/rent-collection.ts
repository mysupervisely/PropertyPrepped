type CollectionRow = { propertyId: string; expectedAmount: number; totalPaid: number }
export type CollectionTotals = { expectedAmount: number; totalPaid: number }

export function aggregateRentCollection(rows: CollectionRow[]): Map<string, CollectionTotals> {
  const totals = new Map<string, CollectionTotals>()
  for (const row of rows) {
    const previous = totals.get(row.propertyId) || { expectedAmount: 0, totalPaid: 0 }
    totals.set(row.propertyId, { expectedAmount: previous.expectedAmount + row.expectedAmount, totalPaid: previous.totalPaid + row.totalPaid })
  }
  return totals
}

export function rentCollectionPercent(totals?: CollectionTotals): number | null {
  if (!totals || !Number.isFinite(totals.expectedAmount) || !Number.isFinite(totals.totalPaid) || totals.expectedAmount <= 0 || totals.totalPaid < 0) return null
  if (totals.totalPaid >= totals.expectedAmount) return 100
  return Math.min(99, Math.round(totals.totalPaid / totals.expectedAmount * 100))
}
