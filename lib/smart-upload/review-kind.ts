// PropRoster — Smart Upload Foundation: which review experience a
// classified document type gets.
//
// 'Receipt' — Part 10's polished V1 flow: vendor/date/amount/description
// /category, save creates a financial_transaction (and, for a clearly
// maintenance/service-type invoice, offers the maintenance record +
// PropCrew + Property System associations from Parts 13-15).
//
// 'PrepareOnly' — Parts 16/17: classify, assign a property, show the
// extracted facts, let the user confirm the document type. Never
// auto-creates or silently changes a lease/insurance/mortgage/tax
// record — those still only ever happen through the existing,
// already-shipped Apply-to-form flow (components/DocumentIntelligencePanel
// .tsx's onApply), which still ends in the user's own explicit Save.

import type { DocumentType } from '../document-intelligence/types'

export function reviewKindFor(documentType: DocumentType): 'Receipt' | 'PrepareOnly' {
  return documentType === 'Contractor Invoice / Receipt' ? 'Receipt' : 'PrepareOnly'
}
