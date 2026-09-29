// Mobile Preview harness — Part 2 fixture data.
//
// Entirely fictional. No real property, tenant, financial, or contact
// information appears anywhere in this file — every name/address/email
// below is invented specifically for this preview and does not
// correspond to any real PropRoster account, property, or person.
//
// This module is only ever imported from files under app/preview/,
// which the layout in app/preview/layout.tsx makes unreachable in a
// production build (see that file's own comment). It is never imported
// by any real, production-serving route.

export const FIXTURE_LANDLORD = {
  name: 'Alex Morgan',
  email: 'alex.morgan@example.test',
}

export type FixtureProperty = {
  id: string
  address: string
  city: string
  state: string
  zip: string
  type: 'Single Family' | 'Condo'
  monthlyRent: number
  value: number
  occupancy: 'occupied' | 'vacant'
  rentStatus: 'On time' | 'Late' | 'Unpaid'
  tenant: { name: string; email: string; phone: string } | null
  leaseEnd: string
}

export const FIXTURE_PROPERTIES: FixtureProperty[] = [
  {
    id: 'prop-harbor-lane',
    address: '123 Harbor Lane',
    city: 'Tampa',
    state: 'FL',
    zip: '33602',
    type: 'Single Family',
    monthlyRent: 2450,
    value: 412000,
    occupancy: 'occupied',
    rentStatus: 'On time',
    tenant: { name: 'Jordan Reyes', email: 'jordan.reyes@example.test', phone: '(813) 555-0142' },
    leaseEnd: '2027-03-31',
  },
  {
    id: 'prop-palm-avenue',
    address: '842 Palm Avenue',
    city: 'St. Petersburg',
    state: 'FL',
    zip: '33701',
    type: 'Condo',
    monthlyRent: 1890,
    value: 289000,
    occupancy: 'occupied',
    rentStatus: 'Late',
    tenant: { name: 'Sam Whitfield', email: 'sam.whitfield@example.test', phone: '(727) 555-0198' },
    leaseEnd: '2026-11-30',
  },
  {
    id: 'prop-cedar-court',
    address: '57 Cedar Court',
    city: 'Clearwater',
    state: 'FL',
    zip: '33755',
    type: 'Single Family',
    monthlyRent: 0,
    value: 356000,
    occupancy: 'vacant',
    rentStatus: 'Unpaid',
    tenant: null,
    leaseEnd: '',
  },
]

export const FIXTURE_STATS = {
  portfolioValue: FIXTURE_PROPERTIES.reduce((sum, p) => sum + p.value, 0),
  monthlyRent: FIXTURE_PROPERTIES.reduce((sum, p) => sum + p.monthlyRent, 0),
  properties: FIXTURE_PROPERTIES.length,
  occupied: FIXTURE_PROPERTIES.filter((p) => p.occupancy === 'occupied').length,
}

export type FixtureMaintenanceRequest = {
  id: string
  propertyId: string
  title: string
  category: string
  status: 'New' | 'In Progress' | 'Scheduled' | 'Resolved'
  reportedBy: string
  reportedAt: string
  description: string
  provider: string | null
}

export const FIXTURE_MAINTENANCE: FixtureMaintenanceRequest[] = [
  {
    id: 'maint-1',
    propertyId: 'prop-harbor-lane',
    title: 'Kitchen faucet leaking',
    category: 'Plumbing',
    status: 'In Progress',
    reportedBy: 'Jordan Reyes',
    reportedAt: '2026-09-20',
    description: 'Steady drip under the kitchen sink, worsening over the past week. Tenant placed a bucket underneath in the meantime.',
    provider: 'Bayside Plumbing Co.',
  },
  {
    id: 'maint-2',
    propertyId: 'prop-palm-avenue',
    title: 'AC not cooling',
    category: 'HVAC',
    status: 'New',
    reportedBy: 'Sam Whitfield',
    reportedAt: '2026-09-25',
    description: 'Unit runs but only blows room-temperature air. Filter was changed last month.',
    provider: null,
  },
  {
    id: 'maint-3',
    propertyId: 'prop-harbor-lane',
    title: 'Gutter cleaning (seasonal)',
    category: 'Landscaping',
    status: 'Scheduled',
    reportedBy: 'Alex Morgan',
    reportedAt: '2026-09-10',
    description: 'Routine fall gutter clearing ahead of storm season.',
    provider: 'GreenEdge Lawn & Property',
  },
]

// Needs Attention V2 (preview): aggregates existing fixture items the
// same way the real app's Needs Attention modal aggregates real
// attentionItems/vacancyItems/openMaintenanceItems — never invented
// data of its own. Each item's `nav` mirrors the real NavTarget
// mechanism (lib/dashboard/attention.ts): enough to route the preview
// to the exact existing screen/record it concerns.
export type FixtureAttentionNav =
  | { screen: 'maintenance'; maintenanceId: string }
  | { screen: 'taxcenter' }
  | { screen: 'property'; propertyId: string; tab: 'overview' | 'documents' | 'tenant' }

export type FixtureAttentionItem = {
  id: string
  category: 'Maintenance' | 'Missing Receipt' | 'Tenant Connect'
  title: string
  propertyLabel: string
  nav: FixtureAttentionNav
}

export const FIXTURE_ATTENTION_ITEMS: FixtureAttentionItem[] = [
  {
    id: 'attn-1',
    category: 'Maintenance',
    title: 'Kitchen sink leak',
    propertyLabel: '123 Harbor Lane',
    nav: { screen: 'maintenance', maintenanceId: 'maint-1' },
  },
  {
    id: 'attn-2',
    category: 'Missing Receipt',
    title: '$286 repair expense',
    propertyLabel: '842 Palm Avenue',
    nav: { screen: 'taxcenter' },
  },
  {
    id: 'attn-3',
    category: 'Tenant Connect',
    title: 'New message from Sam Whitfield',
    propertyLabel: '842 Palm Avenue',
    nav: { screen: 'property', propertyId: 'prop-palm-avenue', tab: 'tenant' },
  },
]

export type FixtureProCrewContact = {
  id: string
  name: string
  businessName: string
  role: string
  phone: string
  email: string
  properties: string[]
}

export const FIXTURE_PROPCREW: FixtureProCrewContact[] = [
  { id: 'crew-1', name: 'Marcus Bell', businessName: 'Bayside Plumbing Co.', role: 'Plumbing', phone: '(813) 555-0110', email: 'marcus@baysideplumbing.example.test', properties: ['123 Harbor Lane'] },
  { id: 'crew-2', name: 'Priya Anand', businessName: 'GreenEdge Lawn & Property', role: 'Landscaping', phone: '(813) 555-0166', email: 'priya@greenedge.example.test', properties: ['123 Harbor Lane', '842 Palm Avenue'] },
  { id: 'crew-3', name: 'Dana Fitch', businessName: 'Fitch HVAC Services', role: 'HVAC', phone: '(727) 555-0121', email: 'dana@fitchhvac.example.test', properties: ['842 Palm Avenue'] },
]

export const FIXTURE_TAX_SUMMARY = {
  year: 2026,
  totalIncome: 52080,
  totalExpenses: 18420,
  netIncome: 33660,
  categories: [
    { label: 'Mortgage Interest', amount: 9800 },
    { label: 'Repairs & Maintenance', amount: 4120 },
    { label: 'Insurance', amount: 2600 },
    { label: 'Property Management', amount: 1900 },
  ],
}

export const FIXTURE_BILLING = {
  plan: 'Organize',
  price: 19,
  propertyLimit: 5,
  propertiesUsed: FIXTURE_PROPERTIES.length,
  renewsOn: '2026-10-18',
  paymentMethod: 'Visa •••• 4242',
}

export const FIXTURE_DOCUMENTS = [
  { id: 'doc-1', propertyId: 'prop-harbor-lane', name: 'Lease Agreement 2025-2027.pdf', category: 'Lease', uploadedAt: '2025-04-02' },
  { id: 'doc-2', propertyId: 'prop-harbor-lane', name: 'Homeowners Insurance Policy.pdf', category: 'Insurance', uploadedAt: '2025-05-14' },
  { id: 'doc-3', propertyId: 'prop-palm-avenue', name: 'Lease Agreement 2025-2026.pdf', category: 'Lease', uploadedAt: '2025-11-01' },
]
