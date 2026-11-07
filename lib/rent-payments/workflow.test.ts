import { describe,it,expect } from 'vitest'
import { paymentAmount,evidenceType,receiptText,localDate,type RentReceipt } from './workflow'
describe('bank-free rent workflow',()=>{
 it('accepts cents and rejects ambiguous or invalid amounts',()=>{
  expect(paymentAmount('2350.50')).toBe(2350.5)
  for(const input of ['0','-1','NaN','Infinity','1.234','2,350','1e3','10000001'])expect(()=>paymentAmount(input)).toThrow()
 })
 it('allows bounded receipt evidence and handles blank iPhone MIME types',()=>{
  expect(evidenceType({name:'receipt.HEIC',type:'',size:50})).toBe('image/heic')
  expect(evidenceType({name:'receipt.pdf',type:'application/pdf',size:8388608})).toBe('application/pdf')
  for(const f of [{name:'large.jpg',type:'image/jpeg',size:8388609},{name:'script.html',type:'text/html',size:50},{name:'empty.pdf',type:'application/pdf',size:0}])expect(()=>evidenceType(f)).toThrow()
 })
 it('uses local calendar dates rather than UTC conversion',()=>{
  const date=new Date(2026,10,7,23,59)
  expect(localDate(date)).toBe('2026-11-07')
 })
 it('receipt describes only the amount actually confirmed, not a paid-off balance',()=>{
  const text=receiptText({payment_id:'receipt-1',tenant_name:'Test Tenant',property_address:'Test House',amount:500,rent_period:'2026-11-01',date_received:'2026-11-07',payment_method:'Zelle'} as RentReceipt)
  expect(text).toContain('$500.00')
  expect(text).toContain('not any remaining balance')
  expect(text).not.toContain('Paid in full')
 })
})
