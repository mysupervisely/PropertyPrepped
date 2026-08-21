// PropRoster Milestone 21: Realtor Connect V1.
//
// Shared types for the lead-capture workflow. One normalized shape used
// by both calculator CTAs, the submission API route, and the admin Lead
// Center — the same "one normalized shape, provider/consumer agnostic"
// pattern lib/address/types.ts already established for addresses.

export type LeadSource = 'rental_analyzer' | 'home_purchase'

export type PreferredContactMethod = 'Call' | 'Text' | 'Email'

export type GeographyBucket = 'Tampa Bay Area' | 'Outside Tampa Bay Area' | 'Unknown'

export type LeadStatus = 'New' | 'Contacted' | 'Referred' | 'Closed' | 'Archived'

export const LEAD_STATUSES: readonly LeadStatus[] = ['New', 'Contacted', 'Referred', 'Closed', 'Archived']

export const PREFERRED_CONTACT_METHODS: readonly PreferredContactMethod[] = ['Call', 'Text', 'Email']

/**
 * The calculator-context snapshot attached to a lead. Every field is
 * optional — only what the calculator actually had a real value for is
 * ever included (Section 6: "Do not fabricate missing values. Store/send
 * only fields that are actually available."). `source` and
 * `propertyAddress` are the only fields both calculators always share;
 * everything else is calculator-specific.
 */
export type LeadAnalysisSnapshot = {
  source: LeadSource
  propertyAddress?: string
  purchasePrice?: number
  downPaymentAmount?: number
  downPaymentPercent?: number
  loanAmount?: number
  interestRatePercent?: number
  // Rental Property Analyzer only
  estimatedRentMonthly?: number
  operatingExpensesMonthly?: number
  noiAnnual?: number
  monthlyCashFlow?: number
  capRatePercent?: number
  cashOnCashReturnPercent?: number
  dscr?: number
  // Home Purchase Calculator only
  estimatedMonthlyPayment?: number
  propertyTaxMonthly?: number
  insuranceMonthly?: number
  hoaMonthly?: number
  closingCostsAmount?: number
  cashNeededToClose?: number
}

/** What the client submits to POST /api/realtor-leads. */
export type RealtorLeadSubmission = {
  name: string
  email: string
  phone: string
  preferredContactMethod: PreferredContactMethod
  message: string
  consent: boolean
  propertyAddress: string
  analysisSnapshot: LeadAnalysisSnapshot
  // Honeypot — a real visitor never fills this in; see lib/realtor-leads/rate-limit.ts.
  website: string
}

/** The persisted row shape (mirrors supabase/milestone-21-realtor-connect.sql). */
export type RealtorLeadRow = {
  id: string
  created_at: string
  updated_at: string
  owner_user_id: string | null
  source: LeadSource
  property_address: string | null
  city: string | null
  state: string | null
  zip: string | null
  geography_bucket: GeographyBucket
  name: string
  email: string | null
  phone: string | null
  preferred_contact_method: PreferredContactMethod
  message: string | null
  consent_at: string
  analysis_snapshot: LeadAnalysisSnapshot | null
  status: LeadStatus
  referred_to_name: string | null
  referred_to_email: string | null
  referred_to_state: string | null
  notes: string | null
}
