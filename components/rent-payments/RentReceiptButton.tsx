'use client'
import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { receiptText, type RentReceipt } from '../../lib/rent-payments/workflow'
export function RentReceiptButton({ client, paymentId, owner = false }: { client: SupabaseClient; paymentId: string; owner?: boolean }) {
 const [receipt,setReceipt]=useState<RentReceipt|null>(null), [busy,setBusy]=useState(false), [notice,setNotice]=useState('')
 async function open() {
  setBusy(true);setNotice('')
  try {
   const result=owner ? await client.rpc('prepare_rent_payment_receipt',{p_payment_id:paymentId}) : await client.from('rent_payment_receipts').select('*').eq('payment_id',paymentId).maybeSingle()
   if(result.error) throw result.error
   if(!result.data) {setNotice('A receipt has not been issued yet.');return}
   setReceipt(result.data as RentReceipt)
  } catch {setNotice('Unable to load this receipt. Please try again.')} finally {setBusy(false)}
 }
 async function send() {
  setBusy(true);setNotice('')
  try {
   const {data}=await client.auth.getSession()
   const response=await fetch('/api/rent-payments/receipt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token || ''}`},body:JSON.stringify({paymentId})})
   const result=await response.json()
   setNotice(result.sent ? 'Receipt emailed to the tenant.' : result.alreadySent ? 'This receipt has already been emailed.' : result.message || 'Receipt is available in the portal. Email was not sent.')
  } catch {setNotice('Email delivery could not be confirmed. The receipt remains available here.')} finally {setBusy(false)}
 }
 return <><button type="button" className="textAction" disabled={busy} onClick={()=>void open()}>{busy?'Loading…':'Receipt'}</button>{notice&&!receipt&&<small role="status">{notice}</small>}{receipt&&<div className="overlay rentReceiptOverlay" onMouseDown={e=>e.target===e.currentTarget&&setReceipt(null)}><section className="modal rentReceiptModal" role="dialog" aria-modal="true" aria-labelledby={`receipt-${paymentId}`}><div className="modalTop"><h2 id={`receipt-${paymentId}`}>Rent receipt</h2><button type="button" className="iconButton" aria-label="Close receipt" onClick={()=>setReceipt(null)}>×</button></div><pre>{receiptText(receipt)}</pre><div className="rentWorkflowActions"><button type="button" className="secondary" onClick={async()=>{try {if(navigator.share) await navigator.share({title:'Rent receipt',text:receiptText(receipt)});else {await navigator.clipboard.writeText(receiptText(receipt));setNotice('Receipt copied.')}}catch {setNotice('Choose and copy the receipt text if sharing is unavailable.')}}}>Share / copy</button>{owner&&<button type="button" className="primary" disabled={busy} onClick={()=>void send()}>Email tenant</button>}</div>{notice&&<p role="status">{notice}</p>}</section></div>}</>
}
