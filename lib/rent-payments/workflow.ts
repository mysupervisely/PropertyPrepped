export const evidenceBucket = 'rent-payment-evidence'
export function localDate(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` }
export function paymentAmount(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()) || !(Number(value)>0) || Number(value)>10000000) throw new Error('Enter a positive amount with up to two decimal places.')
  return Number(value)
}
export function evidenceType(file: { name: string; type: string; size: number }) {
  const inferred: Record<string,string> = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',pdf:'application/pdf' }
  const type = file.type || inferred[file.name.split('.').pop()?.toLowerCase() || '']
  if (!Object.values(inferred).includes(type) || file.size<=0 || file.size>8388608) throw new Error('Choose a photo or PDF up to 8 MB.')
  return type
}
export type RentReceipt = { payment_id: string; owner_id: string; lease_id: string; tenant_name: string; property_address: string; amount: number; rent_period: string; date_received: string; payment_method: string; created_at: string; emailed_at: string | null }
export const money = (n: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n))
export function receiptText(r: RentReceipt) {
  return `PropRoster rent receipt\n\nTenant: ${r.tenant_name}\nProperty: ${r.property_address}\nRent month: ${r.rent_period.slice(0,7)}\nAmount received: ${money(r.amount)}\nDate received: ${r.date_received}\nPayment method: ${r.payment_method}\nReceipt: ${r.payment_id}\n\nConfirmed by the landlord. PropRoster records payments; it does not collect or verify transfers. This receipt covers the amount shown, not any remaining balance.`
}
